import { Module } from '@nestjs/common';
import { EdgeService } from './edge.service';
import { EdgeController } from './edge.controller';
import { EdgeRepository } from './edge.repository';
import { WorkspaceRepository } from 'src/workspace/workspace.repository';
import { NodeModule } from 'src/node/node.module';
import { EventBusModule } from 'src/event-bus/event-bus.module';

@Module({
  imports: [EventBusModule, NodeModule],
  controllers: [EdgeController],
  providers: [EdgeService, EdgeRepository, WorkspaceRepository]
})
export class EdgeModule {}
