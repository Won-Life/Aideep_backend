import { Module } from '@nestjs/common';
import { WorkspaceController } from './workspace.controller';
import { CollaborationGateway } from './workspace.gateway';
import { SseService } from './sse.service';
import { NodeModule } from 'src/node/node.module';
import { WorkspaceService } from './workspace.service';
import { WorkspaceRepository } from './workspace.repository';

@Module({
  imports: [NodeModule],
  controllers: [WorkspaceController],
  providers: [SseService, WorkspaceService, WorkspaceRepository]
})
export class WorkspaceModule {}
