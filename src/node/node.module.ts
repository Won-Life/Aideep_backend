import { Module } from '@nestjs/common';
import { NodeService } from './node.service';
import { NodeController } from './node.controller';
import { NodeRespository } from './node.repository';
import { WorkspaceRepository } from 'src/workspace/workspace.repository';

@Module({
  controllers: [NodeController],
  providers: [NodeService, NodeRespository, WorkspaceRepository],
  exports: [NodeRespository]
})
export class NodeModule {}
