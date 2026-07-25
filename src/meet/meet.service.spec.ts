import { Test, TestingModule } from '@nestjs/testing';
import { MeetService } from './meet.service';
import { BasicError } from '../common/error';

describe('MeetService', () => {
  let service: MeetService;
  let fetchMock: jest.SpyInstance;

  const VALID_JSON = JSON.stringify({
    title: '회의 제목',
    points: [
      { subtopicId: null, newSubtopicTitle: '롤백 전략', title: '즉시 롤백', detail: '실패 시 즉시 롤백' }
    ],
    decisions: ['항목1']
  });

  const VALID_TEXT =
    '# 회의 제목\n\n# 주제\n\n## 롤백 전략\n- 즉시 롤백: 실패 시 즉시 롤백\n\n# 결정사항\n- 항목1';

  const ok = (content: string) =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content } }] })
    }) as unknown as Response;

  const fail = (status: number) =>
    ({ ok: false, status, json: async () => ({}) }) as unknown as Response;

  const authHeaderOfCall = (callIndex: number) =>
    (fetchMock.mock.calls[callIndex][1].headers as Record<string, string>)
      .authorization;

  const systemPromptOfCall = (callIndex: number) =>
    JSON.parse(fetchMock.mock.calls[callIndex][1].body as string).messages[0]
      .content as string;

  beforeEach(async () => {
    process.env.NVIDIA_API_KEYS = 'k1,k2,k3';
    fetchMock = jest.spyOn(global, 'fetch');

    const module: TestingModule = await Test.createTestingModule({
      providers: [MeetService]
    }).compile();

    service = module.get<MeetService>(MeetService);
  });

  afterEach(() => {
    fetchMock.mockRestore();
    delete process.env.NVIDIA_API_KEYS;
  });

  it('정상 JSON 응답이면 structured와 markdown text를 반환한다', async () => {
    fetchMock.mockResolvedValueOnce(ok(VALID_JSON));

    const result = await service.structure('자막');

    expect(result.structured).toEqual(JSON.parse(VALID_JSON));
    expect(result.text).toBe(VALID_TEXT);
  });

  it('<think> 태그와 코드펜스가 감싼 응답도 파싱한다', async () => {
    fetchMock.mockResolvedValueOnce(
      ok('<think>생각 중...</think>```json\n' + VALID_JSON + '\n```')
    );

    const result = await service.structure('자막');

    expect(result.structured.title).toBe('회의 제목');
  });

  it('429 응답이면 다음 키로 회전해 성공한다', async () => {
    fetchMock
      .mockResolvedValueOnce(fail(429))
      .mockResolvedValueOnce(ok(VALID_JSON));

    const result = await service.structure('자막');

    expect(result.structured.title).toBe('회의 제목');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authHeaderOfCall(0)).toBe('Bearer k1');
    expect(authHeaderOfCall(1)).toBe('Bearer k2');
  });

  it('호출마다 시작 키를 라운드로빈으로 바꾼다', async () => {
    fetchMock.mockResolvedValue(ok(VALID_JSON));

    await service.structure('자막');
    await service.structure('자막');

    expect(authHeaderOfCall(0)).toBe('Bearer k1');
    expect(authHeaderOfCall(1)).toBe('Bearer k2');
  });

  it('모든 키가 실패하면 502 BasicError를 던진다', async () => {
    fetchMock.mockRejectedValue(new Error('network'));

    await expect(service.structure('자막')).rejects.toMatchObject({
      status: 502
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('복구 불가능한 응답이면 키 회전 없이 즉시 502를 던진다', async () => {
    fetchMock.mockResolvedValueOnce(ok('12345'));

    await expect(service.structure('자막')).rejects.toMatchObject({
      status: 502
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('points가 배열이 아니면(구 스키마 응답) 즉시 502를 던진다', async () => {
    fetchMock.mockResolvedValueOnce(
      ok(JSON.stringify({ title: '회의 제목', sections: [] }))
    );

    await expect(service.structure('자막')).rejects.toMatchObject({
      status: 502
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('작은따옴표·trailing comma가 섞인 JSON도 복구해 파싱한다', async () => {
    fetchMock.mockResolvedValueOnce(
      ok(
        "{ title: '회의 제목', points: [{ subtopicId: null, newSubtopicTitle: '롤백 전략', title: '즉시 롤백', detail: '실패 시 즉시 롤백', },], }"
      )
    );

    const result = await service.structure('자막');

    expect(result.structured.title).toBe('회의 제목');
    expect(result.structured.points).toEqual([
      { subtopicId: null, newSubtopicTitle: '롤백 전략', title: '즉시 롤백', detail: '실패 시 즉시 롤백' }
    ]);
  });

  it('중간에서 잘린(truncated) JSON도 복구해 파싱한다', async () => {
    fetchMock.mockResolvedValueOnce(
      ok(
        '{"title": "회의 제목", "points": [{"subtopicId": null, "newSubtopicTitle": "롤백 전략", "title": "즉시 롤백", "detail": "실패 시'
      )
    );

    const result = await service.structure('자막');

    expect(result.structured.title).toBe('회의 제목');
    expect(result.structured.points[0].detail).toBe('실패 시');
  });

  it('요청 body에 response_format과 max_tokens 4096을 포함한다', async () => {
    fetchMock.mockResolvedValueOnce(ok(VALID_JSON));

    await service.structure('자막');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.max_tokens).toBe(4096);
  });

  it('HTTP 400이면 같은 키로 response_format 없이 재요청한다', async () => {
    fetchMock
      .mockResolvedValueOnce(fail(400))
      .mockResolvedValueOnce(ok(VALID_JSON));

    const result = await service.structure('자막');

    expect(result.structured.title).toBe('회의 제목');
    expect(authHeaderOfCall(0)).toBe('Bearer k1');
    expect(authHeaderOfCall(1)).toBe('Bearer k1');
    const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(retryBody.response_format).toBeUndefined();
  });

  it('NVIDIA_API_KEYS가 없으면 fetch 없이 500 BasicError를 던진다', async () => {
    delete process.env.NVIDIA_API_KEYS;

    await expect(service.structure('자막')).rejects.toMatchObject({
      status: 500
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('knownSubtopics를 시스템 프롬프트에 id·title로 포함한다', async () => {
    fetchMock.mockResolvedValueOnce(ok(VALID_JSON));

    await service.structure('자막', [{ id: 'st_1', title: '롤백 전략' }]);

    expect(systemPromptOfCall(0)).toContain('id="st_1" title="롤백 전략"');
  });

  it('knownSubtopics가 없으면 프롬프트에 "없음"이라고 표시한다', async () => {
    fetchMock.mockResolvedValueOnce(ok(VALID_JSON));

    await service.structure('자막');

    expect(systemPromptOfCall(0)).toContain('없음 — 전부 새 subtopic');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('structureStream', () => {
    const enc = new TextEncoder();

    // NVIDIA SSE 응답 mock: chunks를 순서대로 Uint8Array로 흘리고, throwAtEnd면 마지막에 끊김 재현.
    const sseBody = (chunks: string[], throwAtEnd = false) =>
      ({
        ok: true,
        status: 200,
        body: (async function* () {
          for (const c of chunks) yield enc.encode(c);
          if (throwAtEnd) throw new Error('stream reset');
        })()
      }) as unknown as Response;

    const dataFrame = (content: string) =>
      `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

    const DONE = 'data: [DONE]\n\n';

    const collect = async (gen: AsyncGenerator<any>) => {
      const out: any[] = [];
      for await (const e of gen) out.push(e);
      return out;
    };

    it('스트림 조각을 누적해 파싱하고 token들과 result를 낸다', async () => {
      const mid = Math.floor(VALID_JSON.length / 2);
      fetchMock.mockResolvedValueOnce(
        sseBody([
          dataFrame(VALID_JSON.slice(0, mid)),
          dataFrame(VALID_JSON.slice(mid)),
          DONE
        ])
      );

      const events = await collect(service.structureStream('자막'));

      const tokens = events.filter((e) => e.type === 'token');
      expect(tokens).toHaveLength(2);
      expect(tokens.map((t) => t.token).join('')).toBe(VALID_JSON);
      const result = events.find((e) => e.type === 'result');
      expect(result.structured.title).toBe('회의 제목');
      expect(result.text).toBe(VALID_TEXT);
    });

    it('요청 body에 stream:true를 포함한다', async () => {
      fetchMock.mockResolvedValueOnce(sseBody([dataFrame(VALID_JSON), DONE]));

      await collect(service.structureStream('자막'));

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.stream).toBe(true);
    });

    it('첫 토큰 이후 스트림이 끊기면 token 뒤에 error를 내고 result는 없다', async () => {
      fetchMock.mockResolvedValueOnce(
        sseBody([dataFrame('{"title":')], true)
      );

      const events = await collect(service.structureStream('자막'));

      expect(events[0].type).toBe('token');
      expect(events[events.length - 1]).toMatchObject({
        type: 'error',
        errorCode: 'MEET-502'
      });
      expect(events.some((e) => e.type === 'result')).toBe(false);
    });

    it('첫 토큰 이전 실패면 다음 키로 회전해 성공한다', async () => {
      fetchMock
        .mockResolvedValueOnce(fail(429))
        .mockResolvedValueOnce(sseBody([dataFrame(VALID_JSON), DONE]));

      const events = await collect(service.structureStream('자막'));

      expect(events.find((e) => e.type === 'result').structured.title).toBe(
        '회의 제목'
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(authHeaderOfCall(0)).toBe('Bearer k1');
      expect(authHeaderOfCall(1)).toBe('Bearer k2');
    });

    it('모든 키가 실패하면 단일 error 이벤트를 낸다', async () => {
      fetchMock.mockResolvedValue(fail(500));

      const events = await collect(service.structureStream('자막'));

      expect(events).toEqual([
        {
          type: 'error',
          errorCode: 'MEET-502',
          reason: '회의록 구조화 요청이 실패했습니다.'
        }
      ]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('HTTP 400이면 같은 키로 response_format 없이(stream 유지) 재요청한다', async () => {
      fetchMock
        .mockResolvedValueOnce(fail(400))
        .mockResolvedValueOnce(sseBody([dataFrame(VALID_JSON), DONE]));

      const events = await collect(service.structureStream('자막'));

      expect(events.find((e) => e.type === 'result')).toBeDefined();
      expect(authHeaderOfCall(0)).toBe('Bearer k1');
      expect(authHeaderOfCall(1)).toBe('Bearer k1');
      const retryBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
      expect(retryBody.response_format).toBeUndefined();
      expect(retryBody.stream).toBe(true);
    });

    it('NVIDIA_API_KEYS가 없으면 fetch 없이 error 이벤트(MEET-500)를 낸다', async () => {
      delete process.env.NVIDIA_API_KEYS;

      const events = await collect(service.structureStream('자막'));

      expect(events).toEqual([
        {
          type: 'error',
          errorCode: 'MEET-500',
          reason: '서버 설정 오류가 발생했습니다.'
        }
      ]);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
