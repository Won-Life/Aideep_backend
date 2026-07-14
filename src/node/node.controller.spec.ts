import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common';
import request from 'supertest';
import { NodeController } from './node.controller';
import { NodeService } from './node.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

const mockUserId = 'user-uuid-1234';
const mockWorkspaceId = 'ws-uuid-5678';
const mockNodeId = '550e8400-e29b-41d4-a716-446655440000';

const mockNodeService = {
  updateNodePosition: jest.fn(),
  createProjectNode: jest.fn()
};

const mockLogger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };

describe('NodeController - moveNode (PATCH /workspace/:workspaceId/node/:nodeId/move)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NodeController],
      providers: [
        { provide: NodeService, useValue: mockNodeService },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: mockLogger }
      ]
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

  it('정상 이동 → 200', () => {
    mockNodeService.updateNodePosition.mockResolvedValue(undefined);
    return request(app.getHttpServer())
      .patch(`/workspace/${mockWorkspaceId}/node/${mockNodeId}/move`)
      .send({ position: { x: 100, y: 200 } })
      .expect(200);
  });

  it('x가 문자열 → 400', () => {
    return request(app.getHttpServer())
      .patch(`/workspace/${mockWorkspaceId}/node/${mockNodeId}/move`)
      .send({ position: { x: 'abc', y: 200 } })
      .expect(400);
  });

  it('position 누락 → 400', () => {
    return request(app.getHttpServer())
      .patch(`/workspace/${mockWorkspaceId}/node/${mockNodeId}/move`)
      .send({})
      .expect(400);
  });

  it('권한 없음 (ForbiddenException) → 403', () => {
    mockNodeService.updateNodePosition.mockRejectedValue(
      new ForbiddenException('노드를 수정할 권한이 없습니다.')
    );
    return request(app.getHttpServer())
      .patch(`/workspace/${mockWorkspaceId}/node/${mockNodeId}/move`)
      .send({ position: { x: 100, y: 200 } })
      .expect(403);
  });

  it('노드 없음 (NotFoundException) → 404', () => {
    mockNodeService.updateNodePosition.mockRejectedValue(
      new NotFoundException('노드를 찾을 수 없습니다.')
    );
    return request(app.getHttpServer())
      .patch(`/workspace/${mockWorkspaceId}/node/${mockNodeId}/move`)
      .send({ position: { x: 100, y: 200 } })
      .expect(404);
  });
});

describe('NodeController - createProjectNode (POST /workspace/:workspaceId/node/project)', () => {
  let app: INestApplication;

  const validBody = {
    title: '프로젝트 노드',
    position: { x: 100, y: 200 },
    body: {
      color: 'rgb(var(--ds-sub-blue))',
      textColor: 'rgb(var(--ds-text-blue))'
    }
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NodeController],
      providers: [
        { provide: NodeService, useValue: mockNodeService },
        { provide: WINSTON_MODULE_NEST_PROVIDER, useValue: mockLogger }
      ]
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

  it('정상 생성 → 201, 서비스에 위임', async () => {
    mockNodeService.createProjectNode.mockResolvedValue({
      nodeId: mockNodeId,
      title: validBody.title,
      nodeType: 'PROJECT',
      position: validBody.position,
      data: { dataType: 'PROJECT', ...validBody.body },
      createdAt: 'Mon Jul 13 2026'
    });

    await request(app.getHttpServer())
      .post(`/workspace/${mockWorkspaceId}/node/project`)
      .send(validBody)
      .expect(201);

    expect(mockNodeService.createProjectNode).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: mockWorkspaceId,
        userId: mockUserId,
        data: expect.objectContaining({
          color: validBody.body.color,
          textColor: validBody.body.textColor
        })
      })
    );
  });

  it('body 누락 → 400 (색 없는 PROJECT 노드 생성 거부)', async () => {
    await request(app.getHttpServer())
      .post(`/workspace/${mockWorkspaceId}/node/project`)
      .send({ title: validBody.title, position: validBody.position })
      .expect(400);

    expect(mockNodeService.createProjectNode).not.toHaveBeenCalled();
  });

  it('body.color 누락 → 400', async () => {
    await request(app.getHttpServer())
      .post(`/workspace/${mockWorkspaceId}/node/project`)
      .send({
        title: validBody.title,
        position: validBody.position,
        body: { textColor: validBody.body.textColor }
      })
      .expect(400);

    expect(mockNodeService.createProjectNode).not.toHaveBeenCalled();
  });
});
