import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MeetingService } from './meeting.service';
import { WorkspaceRepository } from 'src/workspace/workspace.repository';
import { AiBeClient } from 'src/ai/ai-be.client';
import { AiBeBadRequestError, AiBeUnavailableError } from 'src/ai/ai-be.exception';

const mockUserId = 'user-uuid-1234';
const mockWorkspaceId = 'ws-uuid-5678';
const mockAuthorization = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test-token';

const mockBody = {
  workspaceId: mockWorkspaceId,
  meetingId: 'meeting-uuid-1',
  transcriptChunk: '오늘 회의에서는 프로젝트 일정을 논의했습니다.',
  timestamp: '2026-08-08T10:00:00Z'
};

describe('MeetingService', () => {
  let service: MeetingService;
  const mockWorkspaceRepository = { checkWorkspace: jest.fn() };
  const mockAiBeClient = { post: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeetingService,
        { provide: WorkspaceRepository, useValue: mockWorkspaceRepository },
        { provide: AiBeClient, useValue: mockAiBeClient }
      ]
    }).compile();

    service = module.get<MeetingService>(MeetingService);
  });

  afterEach(() => jest.clearAllMocks());

  it('워크스페이스 멤버가 아니면 NotFoundException을 던지고 AiBeClient.post는 호출되지 않는다', async () => {
    mockWorkspaceRepository.checkWorkspace.mockResolvedValue(null);

    await expect(
      service.forwardTranscriptChunk(mockUserId, mockAuthorization, mockBody)
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(mockWorkspaceRepository.checkWorkspace).toHaveBeenCalledWith(
      mockUserId,
      mockWorkspaceId
    );
    expect(mockAiBeClient.post).not.toHaveBeenCalled();
  });

  it('멤버십이 확인되면 인바운드 Authorization 헤더가 그대로 아웃바운드 AiBeClient.post 호출에 실린다', async () => {
    mockWorkspaceRepository.checkWorkspace.mockResolvedValue({ role: 'EDITOR' });
    mockAiBeClient.post.mockResolvedValue({
      relationType: 'CHILD',
      nodeId: 'node-1',
      parentNodeId: 'node-0'
    });

    await service.forwardTranscriptChunk(mockUserId, mockAuthorization, mockBody);

    expect(mockAiBeClient.post).toHaveBeenCalledWith(
      '/meeting/transcript',
      {
        workspaceId: mockBody.workspaceId,
        meetingId: mockBody.meetingId,
        transcriptChunk: mockBody.transcriptChunk,
        timestamp: mockBody.timestamp
      },
      { Authorization: mockAuthorization }
    );
  });

  it('AiDeep-AI-BE의 성공 응답을 TranscriptChunkResponse 형태로 그대로 반환한다', async () => {
    mockWorkspaceRepository.checkWorkspace.mockResolvedValue({ role: 'OWNER' });
    mockAiBeClient.post.mockResolvedValue({
      relationType: 'CHILD',
      nodeId: 'node-1',
      parentNodeId: 'node-0'
    });

    const result = await service.forwardTranscriptChunk(
      mockUserId,
      mockAuthorization,
      mockBody
    );

    expect(result).toEqual({
      relationType: 'CHILD',
      nodeId: 'node-1',
      parentNodeId: 'node-0'
    });
  });

  it('AiBeClient.post가 AiBeUnavailableError를 던지면 그대로 전파한다(502 매핑)', async () => {
    mockWorkspaceRepository.checkWorkspace.mockResolvedValue({ role: 'VIEWER' });
    mockAiBeClient.post.mockRejectedValue(new AiBeUnavailableError('agent timeout'));

    await expect(
      service.forwardTranscriptChunk(mockUserId, mockAuthorization, mockBody)
    ).rejects.toBeInstanceOf(AiBeUnavailableError);
  });

  it('AiBeClient.post가 AiBeBadRequestError를 던지면 그대로 전파한다(4xx 매핑)', async () => {
    mockWorkspaceRepository.checkWorkspace.mockResolvedValue({ role: 'EDITOR' });
    mockAiBeClient.post.mockRejectedValue(new AiBeBadRequestError(422, 'invalid body'));

    await expect(
      service.forwardTranscriptChunk(mockUserId, mockAuthorization, mockBody)
    ).rejects.toBeInstanceOf(AiBeBadRequestError);
  });
});
