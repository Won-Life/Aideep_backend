import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';

const mockUserId = 'user-uuid-1234';
const mockWorkspaceId = 'ws-uuid-5678';

const mockAiService = {
  chat: jest.fn(),
  retrieve: jest.fn()
};

describe('AiController', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiController],
      providers: [{ provide: AiService, useValue: mockAiService }]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().user = { user_id: mockUserId };
          return true;
        }
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterEach(() => jest.clearAllMocks());
  afterAll(() => app.close());

  it('POST /workspace/:workspaceId/chat - 정상 요청 시 AiService.chat을 호출하고 200을 반환한다', async () => {
    mockAiService.chat.mockResolvedValue({ answer: 'ok', sources: [] });

    await request(app.getHttpServer())
      .post(`/workspace/${mockWorkspaceId}/chat`)
      .send({ query: '요약해줘' })
      .expect(201);

    expect(mockAiService.chat).toHaveBeenCalledWith(mockUserId, mockWorkspaceId, {
      query: '요약해줘'
    });
  });

  it('POST /workspace/:workspaceId/chat - query가 없으면 400을 반환한다', () => {
    return request(app.getHttpServer())
      .post(`/workspace/${mockWorkspaceId}/chat`)
      .send({})
      .expect(400);
  });

  it('POST /workspace/:workspaceId/chat - 워크스페이스 멤버가 아니면 404를 반환한다', async () => {
    mockAiService.chat.mockRejectedValue(new NotFoundException('not a member'));

    return request(app.getHttpServer())
      .post(`/workspace/${mockWorkspaceId}/chat`)
      .send({ query: '요약해줘' })
      .expect(404);
  });

  it('POST /workspace/:workspaceId/retrieve - 정상 요청 시 AiService.retrieve를 호출하고 200을 반환한다', async () => {
    mockAiService.retrieve.mockResolvedValue({ context: [], sources: [] });

    await request(app.getHttpServer())
      .post(`/workspace/${mockWorkspaceId}/retrieve`)
      .send({ query: '문서 검색', searchType: 'hybrid' })
      .expect(201);

    expect(mockAiService.retrieve).toHaveBeenCalledWith(mockUserId, mockWorkspaceId, {
      query: '문서 검색',
      searchType: 'hybrid'
    });
  });
});
