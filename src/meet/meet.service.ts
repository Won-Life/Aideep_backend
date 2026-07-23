import { Injectable, Logger } from '@nestjs/common';
import { jsonrepair } from 'jsonrepair';
import { BasicError } from 'src/common/error';
import {
  KnownSubtopicDto,
  StructuredNoteDto,
  StructureResponseDto
} from './dto/structure.dto';

const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
// 모델 교체는 이 상수만 수정 — build.nvidia.com 모델 카드의 ID 그대로 사용
const MODEL = 'z-ai/glm-5.2';

function buildSystemPrompt(knownSubtopics: KnownSubtopicDto[]): string {
  const knownList = knownSubtopics.length
    ? knownSubtopics.map((s) => `  - id="${s.id}" title="${s.title}"`).join('\n')
    : '  (없음 — 전부 새 subtopic)';
  return `당신은 회의록 구조화 도우미다. 온라인 회의의 실시간 자막 트랜스크립트를 받는다.
자막 특성상 오타·중복·문장 잘림이 있으니 감안해서 해석하라.
반드시 아래 스키마의 JSON만 출력하라. 코드펜스·설명·다른 텍스트 금지.

{
  "title": "회의 핵심 주제 한 줄 (30자 이내)",
  "points": [
    {
      "subtopicId": "기존 subtopic을 이어가면 그 id, 새 subtopic이면 null",
      "newSubtopicTitle": "subtopicId가 null일 때만: 새 subtopic 키워드 (10자 이내, 문장 금지)",
      "title": "이 문장의 키워드 (10자 이내)",
      "detail": "문장 요약 (80자 이내)"
    }
  ],
  "decisions": ["합의/결정된 것"],
  "actionItems": ["담당자(추정 가능하면): 할 일"],
  "openQuestions": ["결론 안 난 논점"]
}

규칙:
- points/decisions/actionItems/openQuestions는 항상 배열로 낸다 — 내용이 없으면 빈 배열.
- 새로 들어온 자막에서 논의된 문장 하나하나를 points 배열의 항목 하나로 만든다.
- 이미 논의된 적 있는 주제의 연장이면 subtopicId에 아래 "기존 subtopic 목록"의 id를
  정확히 그대로 넣고 newSubtopicTitle은 null로 둔다. id를 절대 지어내지 마라 — 목록에
  없는 id를 쓸 바엔 새 subtopic으로 취급하라.
- 목록에 없는 새로운 화제면 subtopicId를 null로 두고 newSubtopicTitle에 짧은 키워드를
  넣는다. 같은 응답 안에서 같은 화제를 여러 point가 이어가면 newSubtopicTitle 문자열을
  완전히 동일하게 유지해 하나의 subtopic으로 묶이게 하라.
- title/newSubtopicTitle은 키워드만 — 문장이나 설명을 넣지 마라.

기존 subtopic 목록 (이어지는 논의는 반드시 이 id를 재사용):
${knownList}`;
}

@Injectable()
export class MeetService {
  private readonly logger = new Logger(MeetService.name);
  // 프로세스 내 키 부하 분산용 라운드로빈 시작 인덱스 (멀티 인스턴스 간 분산은 범위 밖)
  private nextKeyIndex = 0;

  async structure(
    transcript: string,
    knownSubtopics: KnownSubtopicDto[] = []
  ): Promise<StructureResponseDto> {
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
      let content: unknown;
      try {
        let res = await this.callNvidia(keys[keyIndex], transcript, knownSubtopics, true);
        if (res.status === 400) {
          // 모델이 response_format 미지원일 수 있으니 같은 키로 미포함 재요청
          this.logger.warn(
            `NVIDIA API HTTP 400 (key #${keyIndex}) — response_format 없이 재시도`
          );
          res = await this.callNvidia(keys[keyIndex], transcript, knownSubtopics, false);
        }
        if (!res.ok) {
          // 429/5xx뿐 아니라 401 등 키별 상태인 4xx도 다음 키로 회전
          this.logger.warn(`NVIDIA API HTTP ${res.status} (key #${keyIndex})`);
          continue;
        }
        const data = await res.json();
        if (data?.choices?.[0]?.finish_reason === 'length') {
          this.logger.warn(
            'NVIDIA 응답이 max_tokens에 도달해 잘렸을 수 있습니다 (finish_reason=length)'
          );
        }
        content = data?.choices?.[0]?.message?.content;
      } catch (err) {
        this.logger.warn(`NVIDIA 호출 실패 (key #${keyIndex}): ${err}`);
        continue;
      }

      // 파싱 실패는 키 문제가 아니므로 회전하지 않고 즉시 502로 끊는다
      try {
        const structured = this.parseContent(content);
        return { structured, text: this.toMarkdown(structured, knownSubtopics) };
      } catch (err) {
        const preview =
          typeof content === 'string' ? content.slice(0, 200) : String(content);
        this.logger.warn(`LLM 응답 파싱 실패: ${err} — raw: ${preview}`);
        throw new BasicError(
          502,
          'MEET-502',
          '회의록 구조화 요청이 실패했습니다.',
          'LLM 응답 JSON 파싱에 실패했습니다.'
        );
      }
    }

    throw new BasicError(
      502,
      'MEET-502',
      '회의록 구조화 요청이 실패했습니다.',
      '모든 NVIDIA API 키로 시도했으나 실패했습니다.'
    );
  }

  private callNvidia(
    key: string,
    transcript: string,
    knownSubtopics: KnownSubtopicDto[],
    jsonMode: boolean
  ): Promise<Response> {
    return fetch(NVIDIA_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4096,
        temperature: 0.1,
        ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: buildSystemPrompt(knownSubtopics) },
          { role: 'user', content: transcript }
        ]
      })
    });
  }

  private parseContent(raw: unknown): StructuredNoteDto {
    if (typeof raw !== 'string') {
      throw new Error('LLM 응답에 content가 없습니다.');
    }
    const cleaned = raw
      .replace(/<think>[\s\S]*?<\/think>/g, '') // reasoning 태그 제거
      .replace(/^```(?:json)?\s*|\s*```$/g, '') // 코드펜스 제거
      .trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // 비표준 JSON(작은따옴표·trailing comma·truncation) 복구 재시도
      const braceIdx = cleaned.indexOf('{');
      const sliced = braceIdx >= 0 ? cleaned.slice(braceIdx) : cleaned;
      parsed = JSON.parse(jsonrepair(sliced));
    }
    if (typeof parsed?.title !== 'string' || !Array.isArray(parsed?.points)) {
      throw new Error('LLM 응답이 회의록 스키마와 일치하지 않습니다.');
    }
    return parsed;
  }

  private toMarkdown(
    structured: StructuredNoteDto,
    knownSubtopics: KnownSubtopicDto[]
  ): string {
    const titleById = new Map(knownSubtopics.map((s) => [s.id, s.title]));
    const bySubtopic = new Map<string, { title: string; lines: string[] }>();
    for (const p of structured.points ?? []) {
      const key = p.subtopicId ?? `new:${p.newSubtopicTitle}`;
      const title = p.subtopicId
        ? (titleById.get(p.subtopicId) ?? p.subtopicId)
        : (p.newSubtopicTitle ?? '기타');
      const entry = bySubtopic.get(key) ?? { title, lines: [] };
      entry.lines.push(
        p.title === p.detail ? `- ${p.detail}` : `- ${p.title}: ${p.detail}`
      );
      bySubtopic.set(key, entry);
    }
    const topicBlock = [...bySubtopic.values()]
      .map((e) => `## ${e.title}\n${e.lines.join('\n')}`)
      .join('\n\n');
    const listBlock = (items?: string[]) =>
      (items ?? []).map((i) => `- ${i}`).join('\n');
    const specials: [string, string[] | undefined][] = [
      ['결정사항', structured.decisions],
      ['액션 아이템', structured.actionItems],
      ['미해결 질문', structured.openQuestions]
    ];
    const specialBlocks = specials
      .filter(([, items]) => items?.length)
      .map(([title, items]) => `# ${title}\n${listBlock(items)}`);
    return [
      `# ${structured.title}`,
      topicBlock ? `# 주제\n\n${topicBlock}` : '',
      ...specialBlocks
    ]
      .filter(Boolean)
      .join('\n\n');
  }
}
