import { Body, Controller, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { ApiSuccessResponse } from 'src/common/response/api-success-response.decorator';
import { AiService } from './ai.service';
import { ChatRequestBody, ChatResponseDto } from './dto/chat.dto';
import { RetrieveRequestBody, RetrieveResponseDto } from './dto/retrieve.dto';

@ApiTags('Ai')
@Controller('workspace/:workspaceId')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
@ApiParam({ name: 'workspaceId', description: '워크스페이스 ID' })
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @ApiOperation({
    summary: 'AI 챗봇 질의',
    description:
      '워크스페이스 멤버만 호출 가능합니다. 검색/응답 범위는 워크스페이스가 아닌 요청 유저 단위입니다.'
  })
  @ApiSuccessResponse(ChatResponseDto, 200)
  async chat(
    @Param('workspaceId') workspaceId: string,
    @Body() body: ChatRequestBody,
    @Request() req: any
  ): Promise<ChatResponseDto> {
    const userId = req.user?.user_id;
    return this.aiService.chat(userId, workspaceId, body);
  }

  @Post('retrieve')
  @ApiOperation({
    summary: 'AI 벡터 검색',
    description:
      'LLM 응답 없이 순수 벡터 검색 결과만 반환합니다. 검색 범위는 요청 유저 단위입니다.'
  })
  @ApiSuccessResponse(RetrieveResponseDto, 200)
  async retrieve(
    @Param('workspaceId') workspaceId: string,
    @Body() body: RetrieveRequestBody,
    @Request() req: any
  ): Promise<RetrieveResponseDto> {
    const userId = req.user?.user_id;
    return this.aiService.retrieve(userId, workspaceId, body);
  }
}
