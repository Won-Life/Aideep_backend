import { Module } from '@nestjs/common';
import { WorkspaceModule } from 'src/workspace/workspace.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [WorkspaceModule],
  controllers: [ChatController],
  providers: [ChatService]
})
export class ChatModule {}
