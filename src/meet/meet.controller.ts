import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { ApiErrorResponse } from 'src/common/response/api-error-response.decorator';
import { ApiSuccessResponse } from 'src/common/response/api-success-response.decorator';
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
}
