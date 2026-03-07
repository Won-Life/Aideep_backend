import { Module } from '@nestjs/common';
import { WorkspaceController } from './workspace.controller';
import { CollaborationGateway } from './workspace.gateway';
import { SseModule } from '../sse/sse.module';
import { NodeModule } from 'src/node/node.module';
import { WorkspaceService } from './workspace.service';
import { WorkspaceRepository } from './workspace.repository';

@Module({
  imports: [SseModule, NodeModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceService, WorkspaceRepository]
})
export class WorkspaceModule {}
