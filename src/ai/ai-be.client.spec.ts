import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiBeClient } from './ai-be.client';
import { AiBeBadRequestError, AiBeUnavailableError } from './ai-be.exception';

describe('AiBeClient', () => {
  let client: AiBeClient;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiBeClient,
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn().mockReturnValue('http://ai-be.test') }
        }
      ]
    }).compile();

    client = module.get<AiBeClient>(AiBeClient);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('POST 요청을 정확한 URL/payload로 보내고 JSON 응답을 반환한다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ answer: 'hi', sources: [] })
    }) as any;

    const result = await client.post('/chat', { query: 'hi', user_id: 'u1' });

    expect(global.fetch).toHaveBeenCalledWith(
      'http://ai-be.test/chat',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ query: 'hi', user_id: 'u1' })
      })
    );
    expect(result).toEqual({ answer: 'hi', sources: [] });
  });

  it('네트워크 오류 시 AiBeUnavailableError를 던진다', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;

    await expect(client.post('/chat', {})).rejects.toBeInstanceOf(AiBeUnavailableError);
  });

  it('5xx 응답 시 AiBeUnavailableError를 던진다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => 'bad gateway'
    }) as any;

    await expect(client.post('/chat', {})).rejects.toBeInstanceOf(AiBeUnavailableError);
  });

  it('4xx 응답 시 AiBeBadRequestError를 던진다', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => 'invalid query'
    }) as any;

    await expect(client.post('/chat', {})).rejects.toBeInstanceOf(AiBeBadRequestError);
  });
});
