import { Module } from '@nestjs/common';
import { NodeService } from './node.service';
import { NodeController } from './node.controller';
import { NodeRespository } from './node.repository';

@Module({
  controllers: [NodeController],
  providers: [NodeService, NodeRespository],
  exports: [NodeRespository]
})
export class NodeModule {}
