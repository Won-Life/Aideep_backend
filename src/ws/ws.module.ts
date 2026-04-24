import { Module } from '@nestjs/common';
import { WsGateway } from './ws.gateway';
import { AuthModule } from '../auth/auth.module';
import { YjsModule } from '../yjs/yjs.module';
import { WorkspaceRepository } from '../workspace/workspace.repository';
import { MetricsModule } from '../common/metrics';

@Module({
  imports: [AuthModule, YjsModule, MetricsModule],
  providers: [WsGateway, WorkspaceRepository],
  exports: [WsGateway]
})
export class WsModule {}
