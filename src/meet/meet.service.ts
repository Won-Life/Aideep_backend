import { Injectable, Logger } from '@nestjs/common';
import { jsonrepair } from 'jsonrepair';
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
  "topics": [
    {
      "title": "논의된 주제 이름 (내용에서 발견하라 — 미리 정해진 이름 없음)",
      "items": ["이 주제의 요점 (각 80자 이내)"],
      "subtopics": [{ "title": "하위 논점", "items": ["세부 내용"] }]
    }
  ],
  "decisions": ["합의/결정된 것"],
  "actionItems": ["담당자(추정 가능하면): 할 일"],
  "openQuestions": ["결론 안 난 논점"]
}

- topics는 회의에서 실제로 다뤄진 화제 단위로 나눈다. 개수 제한 없음.
- 한 주제 안에서 논점이 갈라지면 subtopics로 계층화하고, 없으면 items만 채우고 subtopics는 생략한다.
- decisions/actionItems/openQuestions는 주제와 별개로 회의 전체에서 뽑는다. 해당 내용이 없으면 키를 생략한다.`;

// 증분 요청: 이전 구간의 주제 목록을 알려줘 같은 논의가 다른 이름의 새 주제로 갈라지지 않게 한다
const knownTopicsNote = (knownTopics: string[]) =>
  `\n\n이전 구간에서 이미 만들어진 주제 목록: ${JSON.stringify(knownTopics)}
이어지는 논의는 반드시 위 목록의 제목을 글자 그대로 재사용하고, 새로운 화제만 새 주제로 만든다.`;

@Injectable()
export class MeetService {
  private readonly logger = new Logger(MeetService.name);
  // 프로세스 내 키 부하 분산용 라운드로빈 시작 인덱스 (멀티 인스턴스 간 분산은 범위 밖)
  private nextKeyIndex = 0;

  async structure(
    transcript: string,
    knownTopics?: string[]
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
        let res = await this.callNvidia(keys[keyIndex], transcript, true, knownTopics);
        if (res.status === 400) {
          // 모델이 response_format 미지원일 수 있으니 같은 키로 미포함 재요청
          this.logger.warn(
            `NVIDIA API HTTP 400 (key #${keyIndex}) — response_format 없이 재시도`
          );
          res = await this.callNvidia(keys[keyIndex], transcript, false, knownTopics);
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
        return { structured, text: this.toMarkdown(structured) };
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
    jsonMode: boolean,
    knownTopics?: string[]
  ): Promise<Response> {
    const system = knownTopics?.length
      ? SYSTEM + knownTopicsNote(knownTopics)
      : SYSTEM;
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
          { role: 'system', content: system },
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
    if (typeof parsed?.title !== 'string' || !Array.isArray(parsed?.topics)) {
      throw new Error('LLM 응답이 회의록 스키마와 일치하지 않습니다.');
    }
    return parsed;
  }

  // 주제 = h1, 하위 논점 = h2, 특수 섹션(결정사항 등) = 맨 아래 h1
  private toMarkdown(structured: StructuredNoteDto): string {
    const list = (items?: string[]) =>
      (items ?? []).map((i) => `- ${i}`).join('\n');
    const blocks = (structured.topics ?? []).map((t) => {
      const subs = (t.subtopics ?? [])
        .map((s) => `## ${s.title}\n${list(s.items)}`)
        .join('\n\n');
      return [`# ${t.title}`, list(t.items), subs].filter(Boolean).join('\n');
    });
    const specials: [string, string[] | undefined][] = [
      ['결정사항', structured.decisions],
      ['액션 아이템', structured.actionItems],
      ['미해결 질문', structured.openQuestions]
    ];
    for (const [title, items] of specials) {
      if (items?.length) blocks.push(`# ${title}\n${list(items)}`);
    }
    return blocks.join('\n\n');
  }
}
