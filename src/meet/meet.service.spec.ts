import { Test, TestingModule } from '@nestjs/testing';
import { MeetService } from './meet.service';
import { BasicError } from '../common/error';

describe('MeetService', () => {
  let service: MeetService;
  let fetchMock: jest.SpyInstance;

  const VALID_JSON = JSON.stringify({
    title: '회의 제목',
    sections: [{ title: '결정사항', items: ['항목1', '항목2'] }]
  });

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
    expect(result.text).toBe('# 회의 제목\n\n## 결정사항\n- 항목1\n- 항목2');
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

  it('작은따옴표·trailing comma가 섞인 JSON도 복구해 파싱한다', async () => {
    fetchMock.mockResolvedValueOnce(
      ok(
        "{ title: '회의 제목', sections: [{ title: '결정사항', items: ['항목1', '항목2',], },], }"
      )
    );

    const result = await service.structure('자막');

    expect(result.structured).toEqual(JSON.parse(VALID_JSON));
  });

  it('중간에서 잘린(truncated) JSON도 복구해 파싱한다', async () => {
    fetchMock.mockResolvedValueOnce(
      ok('{"title": "회의 제목", "sections": [{"title": "결정사항", "items": ["항목1')
    );

    const result = await service.structure('자막');

    expect(result.structured.title).toBe('회의 제목');
    expect(result.structured.sections[0].items).toEqual(['항목1']);
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

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
