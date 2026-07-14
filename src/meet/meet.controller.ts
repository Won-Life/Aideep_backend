import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { ApiSuccessResponse } from 'src/common/response/api-success-response.decorator';
import { ApiErrorResponse } from 'src/common/response/api-error-response.decorator';
import {
  StructureMeetBody,
  StructureMeetResponseDto
} from './dto/structure.dto';
import { MeetService } from './meet.service';

@Controller('meet')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class MeetController {
  constructor(private readonly meetService: MeetService) {}

  @Post('/structure')
  @ApiOperation({
    summary: '회의 자막을 회의록 JSON으로 구조화',
    description:
      '익스텐션이 수집한 회의 자막을 받아 NVIDIA LLM으로 회의록(structured/text)을 생성해 반환합니다. 키는 서버 env로만 관리합니다.'
  })
  @ApiBody({ type: StructureMeetBody })
  @ApiSuccessResponse(StructureMeetResponseDto, 200)
  @ApiErrorResponse(502, '외부 LLM 호출 실패(키 소진 등)')
  async structure(@Body() body: StructureMeetBody) {
    return await this.meetService.structure(body.transcript);
  }
}
