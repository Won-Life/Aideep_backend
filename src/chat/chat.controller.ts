import {
  Body,
  Controller,
  Post,
  Request,
  Res,
  UseGuards
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { SkipTransform } from 'src/common/response/skip-transform.decorator';
import { ChatService } from './chat.service';
import { ChatMessageBody } from './dto/chat.dto';

@ApiTags('Chat')
@Controller('chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @SkipTransform()
  @ApiOperation({
    summary: '채팅 스트리밍',
    description: 'AI 서버로 채팅을 라우팅하고 SSE로 응답을 스트리밍합니다.'
  })
  async chat(
    @Body() body: ChatMessageBody,
    @Request() req: any,
    @Res() res: Response
  ): Promise<void> {
    const userId = req.user?.user_id;
    await this.chatService.streamChat(userId, body, req, res);
  }
}
