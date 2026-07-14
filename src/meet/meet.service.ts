import {
  BadGatewayException,
  Inject,
  Injectable,
  InternalServerErrorException,
  LoggerService
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { StructureMeetResponseDto } from './dto/structure.dto';

const MODEL = 'z-ai/glm-5.2';
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

const SYSTEM = `당신은 회의록 구조화 도우미다. 온라인 회의의 실시간 자막 트랜스크립트를 받는다.
자막 특성상 오타·중복·문장 잘림이 있으니 감안해서 해석하라.
반드시 아래 스키마의 JSON만 출력하라. 코드펜스·설명·다른 텍스트 금지.

{
  "title": "회의 핵심 주제 한 줄 (30자 이내)",
  "sections": [
    { "title": "주제", "items": ["논의된 주제 요약 (각 80자 이내)"] },
    { "title": "결정사항", "items": ["합의/결정된 것"] },
    { "title": "액션 아이템", "items": ["담당자(추정 가능하면): 할 일"] },
    { "title": "미해결 질문", "items": ["결론 안 난 논점"] }
  ]
}

해당 내용이 없는 섹션은 sections 배열에서 통째로 생략한다.`;

@Injectable()
export class MeetService {
  // 키는 소스·이미지가 아닌 배포 env(NVIDIA_API_KEYS, 콤마 구분)로만 주입한다.
  private readonly apiKeys = (process.env.NVIDIA_API_KEYS ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  // 시작 키를 호출마다 회전시켜 부하 분산. 프로세스 수명 동안만 유지되면 충분.
  private cursor = 0;

  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService
  ) {}

  async structure(transcript: string): Promise<StructureMeetResponseDto> {
    if (this.apiKeys.length === 0) {
      this.logger.error('NVIDIA_API_KEYS 미설정 — 회의록 구조화 불가', 'MeetService');
      throw new InternalServerErrorException('LLM 키가 설정되지 않았습니다.');
    }

    const start = this.cursor;
    this.cursor = (this.cursor + 1) % this.apiKeys.length;

    let lastError = '';
    // 키 개수만큼 회전 재시도(429/5xx/네트워크/파싱 실패 시 다음 키로).
    for (let attempt = 0; attempt < this.apiKeys.length; attempt++) {
      const which = (start + attempt) % this.apiKeys.length;
      let res: Response;
      let data: any;
      try {
        res = await fetch(NVIDIA_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.apiKeys[which]}`
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 2048,
            temperature: 0.1, // 스키마 준수 안정성 우선
            messages: [
              { role: 'system', content: SYSTEM },
              { role: 'user', content: transcript }
            ]
          })
        });
        data = await res.json();
      } catch (e) {
        lastError = String(e);
        this.logger.warn(`NVIDIA 네트워크 오류 — 다음 키로 재시도: ${lastError}`, 'MeetService');
        continue;
      }

      if (!res.ok) {
        lastError = data?.detail || data?.error?.message || `HTTP ${res.status}`;
        this.logger.warn(`NVIDIA 응답 오류(${res.status}) — 다음 키로 재시도: ${lastError}`, 'MeetService');
        continue;
      }

      const raw = (data.choices?.[0]?.message?.content ?? '')
        .replace(/<think>[\s\S]*?<\/think>/g, '') // reasoning 태그 제거
        .replace(/^```(?:json)?\s*|\s*```$/g, '') // 코드펜스 제거
        .trim();

      try {
        const structured = JSON.parse(raw);
        const text =
          `# ${structured.title}\n\n` +
          (structured.sections ?? [])
            .map(
              (s: any) =>
                `## ${s.title}\n` +
                (s.items ?? []).map((i: string) => `- ${i}`).join('\n')
            )
            .join('\n\n');
        return { structured, text };
      } catch {
        // ponytail: 모델이 확률적으로 깨진 JSON을 뱉음 — 파싱 실패도 다음 키로 재시도
        lastError = '모델이 JSON을 반환하지 않았습니다: ' + raw.slice(0, 120);
        this.logger.warn(`JSON 파싱 실패 — 다음 키로 재시도: ${raw.slice(0, 200)}`, 'MeetService');
      }
    }

    throw new BadGatewayException(`회의록 구조화 실패: ${lastError}`);
  }
}
