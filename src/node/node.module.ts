import { Module } from '@nestjs/common';
import { NodeService } from './node.service';
import { NodeController } from './node.controller';
import { NodeRepository } from './node.repository';
import { WorkspaceRepository } from 'src/workspace/workspace.repository';
import { EdgeRepository } from 'src/edge/edge.repository';
import { EventBusModule } from 'src/event-bus/event-bus.module';
import { FileAttachmentModule } from 'src/file-attachment/file-attachment.module';

@Module({
  imports: [EventBusModule, FileAttachmentModule],
  controllers: [NodeController],
  providers: [NodeService, NodeRepository, WorkspaceRepository, EdgeRepository],
  exports: [NodeRepository, NodeService]
})
export class NodeModule {}
