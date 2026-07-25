import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { ApiErrorResponse } from 'src/common/response/api-error-response.decorator';
import { ApiSuccessResponse } from 'src/common/response/api-success-response.decorator';
import { SkipTransform } from 'src/common/response/skip-transform.decorator';
import { MeetService } from './meet.service';
import { StructureBody, StructureResponseDto } from './dto/structure.dto';

@Controller('meet')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class MeetController {
  constructor(private readonly meetService: MeetService) {}

  @Post('structure')
  @ApiOperation({
    summary: '회의 자막 구조화',
    description:
      '회의 자막 전체 텍스트를 받아 LLM으로 회의록 JSON(structured)과 markdown(text)을 생성합니다.'
  })
  @ApiBody({ type: StructureBody })
  @ApiSuccessResponse(StructureResponseDto, 200)
  @ApiErrorResponse(500, '서버 설정 오류가 발생했습니다.')
  @ApiErrorResponse(502, '회의록 구조화 요청이 실패했습니다.')
  async structure(@Body() body: StructureBody): Promise<StructureResponseDto> {
    return await this.meetService.structure(body.transcript, body.knownSubtopics);
  }

  @Post('structure/stream')
  @SkipTransform()
  @ApiOperation({
    summary: '회의 자막 구조화 (SSE 스트리밍)',
    description:
      'text/event-stream으로 응답합니다. 이벤트 규격: ' +
      '`event: token` / `data: {"token": string}` — 토큰 조각, ' +
      '`event: result` / `data: {"structured": StructuredNote, "text": string}` — 최종 결과, ' +
      '`event: error` / `data: {"errorCode": string, "reason": string}` — 실패. ' +
      'EventSource는 POST 바디·커스텀 헤더를 못 보내므로 fetch + ReadableStream으로 소비하세요.'
  })
  @ApiBody({ type: StructureBody })
  async structureStream(
    @Body() body: StructureBody,
    @Res() res: Response
  ): Promise<void> {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.flushHeaders?.();

    const ac = new AbortController();
    res.on('close', () => ac.abort());

    const send = (event: string, data: unknown) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

    try {
      for await (const ev of this.meetService.structureStream(
        body.transcript,
        body.knownSubtopics,
        ac.signal
      )) {
        if (ev.type === 'token') send('token', { token: ev.token });
        else if (ev.type === 'result')
          send('result', { structured: ev.structured, text: ev.text });
        else send('error', { errorCode: ev.errorCode, reason: ev.reason });
      }
    } catch {
      if (!ac.signal.aborted)
        send('error', {
          errorCode: 'MEET-502',
          reason: '회의록 구조화 요청이 실패했습니다.'
        });
    } finally {
      res.end();
    }
  }
}
