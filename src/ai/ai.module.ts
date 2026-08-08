import { Module } from '@nestjs/common';
import { WorkspaceRepository } from 'src/workspace/workspace.repository';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiBeClient } from './ai-be.client';

@Module({
  controllers: [AiController],
  providers: [AiService, AiBeClient, WorkspaceRepository]
})
export class AiModule {}
