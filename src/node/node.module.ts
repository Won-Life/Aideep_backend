import { Module } from '@nestjs/common';
import { NodeService } from './node.service';
import { NodeController } from './node.controller';
import { NodeRepository } from './node.repository';
import { WorkspaceRepository } from 'src/workspace/workspace.repository';
import { WsModule } from 'src/ws/ws.module';

@Module({
  imports: [WsModule],
  controllers: [NodeController],
  providers: [NodeService, NodeRepository, WorkspaceRepository],
  exports: [NodeRepository]
})
export class NodeModule {}
