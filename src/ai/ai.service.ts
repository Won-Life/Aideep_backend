import { Injectable, NotFoundException } from '@nestjs/common';
import { WorkspaceRepository } from 'src/workspace/workspace.repository';
import { AiBeClient } from './ai-be.client';
import { ChatRequestBody, ChatResponseDto } from './dto/chat.dto';
import { RetrieveRequestBody, RetrieveResponseDto } from './dto/retrieve.dto';

@Injectable()
export class AiService {
  constructor(
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly aiBeClient: AiBeClient
  ) {}

  private async checkMembership(userId: string, workspaceId: string) {
    const membership = await this.workspaceRepository.checkWorkspace(
      userId,
      workspaceId
    );
    if (!membership) {
      throw new NotFoundException(
        '해당 유저의 워크스페이스가 존재하지 않습니다.'
      );
    }
  }

  async chat(
    userId: string,
    workspaceId: string,
    body: ChatRequestBody
  ): Promise<ChatResponseDto> {
    await this.checkMembership(userId, workspaceId);
    return this.aiBeClient.post<ChatResponseDto>('/chat', {
      query: body.query,
      user_id: userId,
      search_type: body.searchType ?? 'mmr'
    });
  }

  async retrieve(
    userId: string,
    workspaceId: string,
    body: RetrieveRequestBody
  ): Promise<RetrieveResponseDto> {
    await this.checkMembership(userId, workspaceId);
    return this.aiBeClient.post<RetrieveResponseDto>('/retrieve', {
      query: body.query,
      user_id: userId,
      search_type: body.searchType ?? 'mmr'
    });
  }
}
