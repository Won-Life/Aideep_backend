import { Body, Controller, Headers, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { ApiSuccessResponse } from 'src/common/response/api-success-response.decorator';
import { MeetingService } from './meeting.service';
import { TranscriptChunkBody, TranscriptChunkResponseDto } from './dto/transcriptChunk.dto';

@ApiTags('Meeting')
@Controller('meeting')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class MeetingController {
  constructor(private readonly meetingService: MeetingService) {}

  @Post('transcript')
  @ApiOperation({
    summary: '회의록 청크 전달 (forward-proxy)',
    description:
      '실사용자 JWT를 Authorization 헤더 그대로 AiDeep-AI-BE로 릴레이합니다. ' +
      '워크스페이스 멤버만 호출 가능합니다.'
  })
  @ApiSuccessResponse(TranscriptChunkResponseDto, 200)
  async transcript(
    @Headers('authorization') authorization: string,
    @Body() body: TranscriptChunkBody,
    @Request() req: any
  ): Promise<TranscriptChunkResponseDto> {
    const userId = req.user?.user_id;
    return this.meetingService.forwardTranscriptChunk(userId, authorization, body);
  }
}
