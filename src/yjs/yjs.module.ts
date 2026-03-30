import { Module } from '@nestjs/common';
import { YjsCrdtService } from './yjs-crdt.service';
import { YjsDocManager } from './yjs-doc-manager';

@Module({
  providers: [YjsCrdtService, YjsDocManager],
  exports: [YjsDocManager]
})
export class YjsModule {}
