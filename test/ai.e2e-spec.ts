import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { AiModule } from '../src/ai/ai.module';
import { WorkspaceRepository } from '../src/workspace/workspace.repository';
import { JwtAuthGuard } from '../src/auth/guards/jwt.guard';
import { AllExceptionsFilter } from '../src/common/error';
import { ResponseInterceptor } from '../src/common/response/response.interceptor';

/**
 * AiController -> AiService -> AiBeClient 전체 체인을 실제로 연결해두고
 * WorkspaceRepository(DB)와 AI-BE로의 outbound fetch만 이중화(mock)한다.
 * 실제 Postgres/Redis/AI-BE 컨테이너는 건드리지 않는다.
 */
describe('Ai (e2e)', () => {
  let app: INestApplication;
  const mockUserId = 'user-uuid-1234';
  const mockWorkspaceId = 'ws-uuid-5678';

  const mockWorkspaceRepository = { checkWorkspace: jest.fn() };
  const stubLogger = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn()
  };
  let fetchSpy: jest.SpyInstance;

  beforeAll(async () => {
    process.env.AI_BE_URL = 'http://ai-be-test.internal';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), AiModule]
    })
      .overrideProvider(WorkspaceRepository)
      .useValue(mockWorkspaceRepository)
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().user = { user_id: mockUserId };
          return true;
        }
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalFilters(new AllExceptionsFilter(stubLogger as any));
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });

  beforeEach(() => {
    mockWorkspaceRepository.checkWorkspace.mockReset();
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  afterAll(() => app.close());

  const mockFetchOnce = (init: { ok: boolean; status: number; json?: unknown; text?: string }) => {
    fetchSpy.mockResolvedValueOnce({
      ok: init.ok,
      status: init.status,
      json: async () => init.json,
      text: async () => init.text ?? ''
    } as Response);
  };

  it('멤버십이 있으면 AI-BE로 프록시하고 SUCCESS 엔벨로프로 응답한다 (workspaceId는 AI-BE에 전달하지 않음)', async () => {
    mockWorkspaceRepository.checkWorkspace.mockResolvedValue({ role: 'VIEWER' });
    mockFetchOnce({ ok: true, status: 200, json: { answer: '요약 결과', sources: [] } });

    const res = await request(app.getHttpServer())
      .post(`/workspace/${mockWorkspaceId}/chat`)
      .send({ query: '요약해줘' })
      .expect(201);

    expect(res.body).toEqual({
      resultType: 'SUCCESS',
      error: null,
      success: { answer: '요약 결과', sources: [] }
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://ai-be-test.internal/chat');
    const sentBody = JSON.parse((opts as RequestInit).body as string);
    expect(sentBody).toEqual({ query: '요약해줘', user_id: mockUserId, search_type: 'mmr' });
    expect(sentBody).not.toHaveProperty('workspace_id');
    expect(sentBody).not.toHaveProperty('workspaceId');
  });

  it('워크스페이스 멤버가 아니면 AI-BE를 호출하지 않고 404 FAIL 엔벨로프를 반환한다', async () => {
    mockWorkspaceRepository.checkWorkspace.mockResolvedValue(null);

    const res = await request(app.getHttpServer())
      .post(`/workspace/${mockWorkspaceId}/retrieve`)
      .send({ query: '문서 검색' })
      .expect(404);

    expect(res.body.resultType).toBe('FAIL');
    expect(res.body.error.errorCode).toBe('HTTP-404');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('AI-BE가 5xx를 반환하면 502 AiBeUnavailableError 엔벨로프로 매핑한다', async () => {
    mockWorkspaceRepository.checkWorkspace.mockResolvedValue({ role: 'EDITOR' });
    mockFetchOnce({ ok: false, status: 503, text: 'agent timeout' });

    const res = await request(app.getHttpServer())
      .post(`/workspace/${mockWorkspaceId}/chat`)
      .send({ query: '요약해줘' })
      .expect(502);

    expect(res.body).toMatchObject({
      resultType: 'FAIL',
      error: { errorCode: 'AI-BE-502', reason: 'AI 서비스를 사용할 수 없습니다.' }
    });
  });

  it('AI-BE로의 네트워크 오류(타임아웃 등)도 502로 매핑한다', async () => {
    mockWorkspaceRepository.checkWorkspace.mockResolvedValue({ role: 'OWNER' });
    fetchSpy.mockRejectedValueOnce(new Error('fetch failed'));

    const res = await request(app.getHttpServer())
      .post(`/workspace/${mockWorkspaceId}/retrieve`)
      .send({ query: '검색어' })
      .expect(502);

    expect(res.body.error.errorCode).toBe('AI-BE-502');
  });

  it('AI-BE가 4xx를 반환하면 원래 status를 그대로 전달한다', async () => {
    mockWorkspaceRepository.checkWorkspace.mockResolvedValue({ role: 'EDITOR' });
    mockFetchOnce({ ok: false, status: 422, text: 'invalid search_type' });

    const res = await request(app.getHttpServer())
      .post(`/workspace/${mockWorkspaceId}/chat`)
      .send({ query: '요약해줘' })
      .expect(422);

    expect(res.body.error.errorCode).toBe('AI-BE-422');
  });

  it('query가 없으면 AiService/AI-BE를 호출하지 않고 400을 반환한다', async () => {
    mockWorkspaceRepository.checkWorkspace.mockResolvedValue({ role: 'OWNER' });

    await request(app.getHttpServer())
      .post(`/workspace/${mockWorkspaceId}/chat`)
      .send({})
      .expect(400);

    expect(mockWorkspaceRepository.checkWorkspace).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
