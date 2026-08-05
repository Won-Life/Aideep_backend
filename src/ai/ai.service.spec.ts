import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AiService } from './ai.service';
import { WorkspaceRepository } from 'src/workspace/workspace.repository';
import { AiBeClient } from './ai-be.client';

const MOCK_USER_ID = 'user-uuid-1234';
const MOCK_WORKSPACE_ID = 'ws-uuid-5678';

describe('AiService', () => {
  let service: AiService;
  let workspaceRepository: { checkWorkspace: jest.Mock };
  let aiBeClient: { post: jest.Mock };

  beforeEach(async () => {
    workspaceRepository = { checkWorkspace: jest.fn() };
    aiBeClient = { post: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: WorkspaceRepository, useValue: workspaceRepository },
        { provide: AiBeClient, useValue: aiBeClient }
      ]
    }).compile();

    service = module.get<AiService>(AiService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('chat', () => {
    it('워크스페이스 멤버가 아니면 NotFoundException을 던진다', async () => {
      workspaceRepository.checkWorkspace.mockResolvedValue(null);

      await expect(
        service.chat(MOCK_USER_ID, MOCK_WORKSPACE_ID, { query: 'hi' })
      ).rejects.toThrow(NotFoundException);
      expect(aiBeClient.post).not.toHaveBeenCalled();
    });

    it('멤버면 AI-BE에 query/user_id/search_type을 전달하고 응답을 반환한다 (workspaceId는 전달하지 않음)', async () => {
      workspaceRepository.checkWorkspace.mockResolvedValue({ role: 'VIEWER' });
      aiBeClient.post.mockResolvedValue({ answer: 'ok', sources: [] });

      const result = await service.chat(MOCK_USER_ID, MOCK_WORKSPACE_ID, {
        query: '요약해줘',
        searchType: 'hybrid'
      });

      expect(aiBeClient.post).toHaveBeenCalledWith('/chat', {
        query: '요약해줘',
        user_id: MOCK_USER_ID,
        search_type: 'hybrid'
      });
      expect(result).toEqual({ answer: 'ok', sources: [] });
    });

    it('searchType 미지정 시 mmr을 기본값으로 사용한다', async () => {
      workspaceRepository.checkWorkspace.mockResolvedValue({ role: 'OWNER' });
      aiBeClient.post.mockResolvedValue({ answer: 'ok', sources: [] });

      await service.chat(MOCK_USER_ID, MOCK_WORKSPACE_ID, { query: 'hi' });

      expect(aiBeClient.post).toHaveBeenCalledWith(
        '/chat',
        expect.objectContaining({ search_type: 'mmr' })
      );
    });
  });

  describe('retrieve', () => {
    it('워크스페이스 멤버가 아니면 NotFoundException을 던진다', async () => {
      workspaceRepository.checkWorkspace.mockResolvedValue(null);

      await expect(
        service.retrieve(MOCK_USER_ID, MOCK_WORKSPACE_ID, { query: 'hi' })
      ).rejects.toThrow(NotFoundException);
      expect(aiBeClient.post).not.toHaveBeenCalled();
    });

    it('멤버면 AI-BE에 query/user_id/search_type을 전달하고 응답을 반환한다', async () => {
      workspaceRepository.checkWorkspace.mockResolvedValue({ role: 'EDITOR' });
      aiBeClient.post.mockResolvedValue({ context: [], sources: [] });

      const result = await service.retrieve(MOCK_USER_ID, MOCK_WORKSPACE_ID, {
        query: '문서 검색'
      });

      expect(aiBeClient.post).toHaveBeenCalledWith('/retrieve', {
        query: '문서 검색',
        user_id: MOCK_USER_ID,
        search_type: 'mmr'
      });
      expect(result).toEqual({ context: [], sources: [] });
    });
  });
});
