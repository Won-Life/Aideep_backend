import { Module } from '@nestjs/common';
import { YjsCrdtService } from './yjs-crdt.service';
import { YjsDocManager } from './yjs-doc-manager';
import { YjsWsAwarenessService } from './yjs-ws-awareness.service';

@Module({
  providers: [YjsCrdtService, YjsDocManager, YjsWsAwarenessService],
  exports: [YjsDocManager, YjsWsAwarenessService]
})
export class YjsModule {}
