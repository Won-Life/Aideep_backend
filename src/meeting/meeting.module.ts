import { Module } from '@nestjs/common';
import { WorkspaceRepository } from 'src/workspace/workspace.repository';
import { AiBeClient } from 'src/ai/ai-be.client';
import { MeetingController } from './meeting.controller';
import { MeetingService } from './meeting.service';

@Module({
  controllers: [MeetingController],
  providers: [MeetingService, AiBeClient, WorkspaceRepository]
})
export class MeetingModule {}
