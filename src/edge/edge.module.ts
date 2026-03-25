import { Module } from '@nestjs/common';
import { EdgeService } from './edge.service';
import { EdgeController } from './edge.controller';
import { EdgeRepository } from './edge.repository';
import { WorkspaceRepository } from 'src/workspace/workspace.repository';
import { NodeRepository } from 'src/node/node.repository';
import { WsModule } from 'src/ws/ws.module';

@Module({
  imports: [WsModule],
  controllers: [EdgeController],
  providers: [EdgeService, EdgeRepository, WorkspaceRepository, NodeRepository]
})
export class EdgeModule {}
