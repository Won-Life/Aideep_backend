import { Injectable, Logger } from '@nestjs/common';
import { BasicError } from 'src/common/error';
import { StructuredNoteDto, StructureResponseDto } from './dto/structure.dto';

const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
// 모델 교체는 이 상수만 수정 — build.nvidia.com 모델 카드의 ID 그대로 사용
const MODEL = 'z-ai/glm-5.2';

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
  private readonly logger = new Logger(MeetService.name);
  // 프로세스 내 키 부하 분산용 라운드로빈 시작 인덱스 (멀티 인스턴스 간 분산은 범위 밖)
  private nextKeyIndex = 0;

  async structure(transcript: string): Promise<StructureResponseDto> {
    const keys = (process.env.NVIDIA_API_KEYS ?? '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    if (keys.length === 0) {
      this.logger.error('NVIDIA_API_KEYS 환경변수가 설정되지 않았습니다.');
      throw new BasicError(
        500,
        'MEET-500',
        '서버 설정 오류가 발생했습니다.',
        'NVIDIA_API_KEYS 미설정'
      );
    }

    const start = this.nextKeyIndex;
    this.nextKeyIndex = (this.nextKeyIndex + 1) % keys.length;

    for (let i = 0; i < keys.length; i++) {
      const keyIndex = (start + i) % keys.length;
      try {
        const res = await fetch(NVIDIA_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${keys[keyIndex]}`
          },
          body: JSON.stringify({
            model: MODEL,
            max_tokens: 2048,
            temperature: 0.1,
            messages: [
              { role: 'system', content: SYSTEM },
              { role: 'user', content: transcript }
            ]
          })
        });
        if (!res.ok) {
          // 429/5xx뿐 아니라 401 등 키별 상태인 4xx도 다음 키로 회전
          this.logger.warn(`NVIDIA API HTTP ${res.status} (key #${keyIndex})`);
          continue;
        }
        const data = await res.json();
        const structured = this.parseContent(
          data?.choices?.[0]?.message?.content
        );
        return { structured, text: this.toMarkdown(structured) };
      } catch (err) {
        this.logger.warn(`NVIDIA 호출 실패 (key #${keyIndex}): ${err}`);
      }
    }

    throw new BasicError(
      502,
      'MEET-502',
      '회의록 구조화 요청이 실패했습니다.',
      '모든 NVIDIA API 키로 시도했으나 실패했습니다.'
    );
  }

  private parseContent(raw: unknown): StructuredNoteDto {
    if (typeof raw !== 'string') {
      throw new Error('LLM 응답에 content가 없습니다.');
    }
    const cleaned = raw
      .replace(/<think>[\s\S]*?<\/think>/g, '') // reasoning 태그 제거
      .replace(/^```(?:json)?\s*|\s*```$/g, '') // 코드펜스 제거
      .trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed?.title !== 'string' || !Array.isArray(parsed?.sections)) {
      throw new Error('LLM 응답이 회의록 스키마와 일치하지 않습니다.');
    }
    return parsed;
  }

  private toMarkdown(structured: StructuredNoteDto): string {
    return (
      `# ${structured.title}\n\n` +
      (structured.sections ?? [])
        .map(
          (s) =>
            `## ${s.title}\n` + (s.items ?? []).map((i) => `- ${i}`).join('\n')
        )
        .join('\n\n')
    );
  }
}
