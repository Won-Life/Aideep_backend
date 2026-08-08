import { Injectable, NotFoundException } from '@nestjs/common';
import { WorkspaceRepository } from 'src/workspace/workspace.repository';
import { AiBeClient } from 'src/ai/ai-be.client';
import { TranscriptChunkBody, TranscriptChunkResponseDto } from './dto/transcriptChunk.dto';

@Injectable()
export class MeetingService {
  constructor(
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly aiBeClient: AiBeClient
  ) {}

  async forwardTranscriptChunk(
    userId: string,
    authorization: string,
    body: TranscriptChunkBody
  ): Promise<TranscriptChunkResponseDto> {
    const membership = await this.workspaceRepository.checkWorkspace(
      userId,
      body.workspaceId
    );
    if (!membership) {
      throw new NotFoundException('해당 유저의 워크스페이스가 존재하지 않습니다.');
    }

    return this.aiBeClient.post<TranscriptChunkResponseDto>(
      '/meeting/transcript',
      {
        workspaceId: body.workspaceId,
        meetingId: body.meetingId,
        transcriptChunk: body.transcriptChunk,
        timestamp: body.timestamp
      },
      { Authorization: authorization }
    );
  }
}
