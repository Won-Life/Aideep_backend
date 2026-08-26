import { forwardRef, Module } from '@nestjs/common';
import { NodeService } from './node.service';
import { NodeController } from './node.controller';
import { NodeRepository } from './node.repository';
import { WorkspaceRepository } from 'src/workspace/workspace.repository';
import { EdgeRepository } from 'src/edge/edge.repository';
import { WsModule } from 'src/ws/ws.module';
import { FileAttachmentModule } from 'src/file-attachment/file-attachment.module';
import { YjsModule } from 'src/yjs/yjs.module';

@Module({
  imports: [forwardRef(() => WsModule), FileAttachmentModule, YjsModule],
  controllers: [NodeController],
  providers: [NodeService, NodeRepository, WorkspaceRepository, EdgeRepository],
  exports: [NodeRepository, NodeService]
})
export class NodeModule {}
