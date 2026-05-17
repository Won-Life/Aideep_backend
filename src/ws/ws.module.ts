import { forwardRef, Module } from '@nestjs/common';
import { WsGateway } from './ws.gateway';
import { AuthModule } from '../auth/auth.module';
import { YjsModule } from '../yjs/yjs.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { WorkspaceRepository } from '../workspace/workspace.repository';
import { MetricsModule } from '../common/metrics';

@Module({
  imports: [
    AuthModule,
    YjsModule,
    MetricsModule,
    forwardRef(() => WorkspaceModule)
  ],
  providers: [WsGateway, WorkspaceRepository],
  exports: [WsGateway]
})
export class WsModule {}
