import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, NotFoundException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';

const mockUserId = 'user-uuid-1234';
const mockWorkspaceId = 'ws-uuid-5678';
const mockAuthorization = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-token';

const validBody = {
  workspaceId: mockWorkspaceId,
  meetingId: 'meeting-uuid-1',
  transcriptChunk: '오늘 회의에서는 프로젝트 일정을 논의했습니다.',
  timestamp: '2026-08-08T10:00:00Z'
};

const mockMeetingService = {
  forwardTranscriptChunk: jest.fn()
};

describe('MeetingController — 인증 성공', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeetingController],
      providers: [{ provide: MeetingService, useValue: mockMeetingService }]
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

  afterEach(async () => {
    jest.clearAllMocks();
    await app.close();
  });

  it('POST /meeting/transcript - 유효한 요청이면 MeetingService.forwardTranscriptChunk를 호출하고 200을 반환한다', async () => {
    mockMeetingService.forwardTranscriptChunk.mockResolvedValue({
      relationType: 'CHILD',
      nodeId: 'node-1',
      parentNodeId: 'node-0'
    });

    const res = await request(app.getHttpServer())
      .post('/meeting/transcript')
      .set('Authorization', mockAuthorization)
      .send(validBody)
      .expect(201);

    expect(res.body).toEqual({
      relationType: 'CHILD',
      nodeId: 'node-1',
      parentNodeId: 'node-0'
    });
  });

  it('POST /meeting/transcript - 인바운드 Authorization 헤더 원본 값이 그대로 서비스 호출에 전달된다', async () => {
    mockMeetingService.forwardTranscriptChunk.mockResolvedValue({
      relationType: 'CHILD',
      nodeId: 'node-1',
      parentNodeId: 'node-0'
    });

    await request(app.getHttpServer())
      .post('/meeting/transcript')
      .set('Authorization', mockAuthorization)
      .send(validBody)
      .expect(201);

    expect(mockMeetingService.forwardTranscriptChunk).toHaveBeenCalledWith(
      mockUserId,
      mockAuthorization,
      expect.objectContaining(validBody)
    );
  });

  it('POST /meeting/transcript - workspaceId가 빈 문자열이면 400을 반환하고 서비스는 호출되지 않는다', async () => {
    await request(app.getHttpServer())
      .post('/meeting/transcript')
      .set('Authorization', mockAuthorization)
      .send({ ...validBody, workspaceId: '' })
      .expect(400);

    expect(mockMeetingService.forwardTranscriptChunk).not.toHaveBeenCalled();
  });

  it('POST /meeting/transcript - meetingId 필드가 누락되면 400을 반환하고 서비스는 호출되지 않는다', async () => {
    const { meetingId: _meetingId, ...bodyWithoutMeetingId } = validBody;

    await request(app.getHttpServer())
      .post('/meeting/transcript')
      .set('Authorization', mockAuthorization)
      .send(bodyWithoutMeetingId)
      .expect(400);

    expect(mockMeetingService.forwardTranscriptChunk).not.toHaveBeenCalled();
  });

  it('POST /meeting/transcript - transcriptChunk가 빈 문자열이면 400을 반환한다', async () => {
    await request(app.getHttpServer())
      .post('/meeting/transcript')
      .set('Authorization', mockAuthorization)
      .send({ ...validBody, transcriptChunk: '' })
      .expect(400);

    expect(mockMeetingService.forwardTranscriptChunk).not.toHaveBeenCalled();
  });

  it('POST /meeting/transcript - timestamp가 ISO-8601 형식이 아니면 400을 반환한다', async () => {
    await request(app.getHttpServer())
      .post('/meeting/transcript')
      .set('Authorization', mockAuthorization)
      .send({ ...validBody, timestamp: 'not-a-date' })
      .expect(400);

    expect(mockMeetingService.forwardTranscriptChunk).not.toHaveBeenCalled();
  });

  it('POST /meeting/transcript - 워크스페이스 비멤버(NotFoundException)면 404를 반환한다', async () => {
    mockMeetingService.forwardTranscriptChunk.mockRejectedValue(
      new NotFoundException('해당 유저의 워크스페이스가 존재하지 않습니다.')
    );

    await request(app.getHttpServer())
      .post('/meeting/transcript')
      .set('Authorization', mockAuthorization)
      .send(validBody)
      .expect(404);
  });
});

describe('MeetingController — 인증 실패(가드 위임)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeetingController],
      providers: [{ provide: MeetingService, useValue: mockMeetingService }]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: () => {
          throw new UnauthorizedException();
        }
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await app.close();
  });

  it('POST /meeting/transcript - Authorization 헤더가 없어 가드가 거부하면 401을 반환하고 서비스는 호출되지 않는다', async () => {
    await request(app.getHttpServer())
      .post('/meeting/transcript')
      .send(validBody)
      .expect(401);

    expect(mockMeetingService.forwardTranscriptChunk).not.toHaveBeenCalled();
  });
});
