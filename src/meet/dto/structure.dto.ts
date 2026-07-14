import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// 자막 텍스트 상한 — 대략 한 시간 회의 분량. LLM max_tokens와 무관하게 입력 폭주 방지.
const TRANSCRIPT_MAX = 50000;

export class StructureMeetBody {
  @IsString()
  @IsNotEmpty()
  @MaxLength(TRANSCRIPT_MAX)
  @ApiProperty({
    example: '오늘 회의에서는 다음 분기 로드맵을 논의했습니다...',
    description: '회의 자막 전체 텍스트'
  })
  transcript: string;
}

class MeetSection {
  @ApiProperty({ example: '결정사항' })
  title: string;

  @ApiProperty({ example: ['MVP는 익스텐션으로 배포', '키는 서버 env로 이전'] })
  items: string[];
}

class MeetStructured {
  @ApiProperty({ example: '다음 분기 로드맵 논의' })
  title: string;

  @ApiProperty({ type: [MeetSection] })
  sections: MeetSection[];
}

export class StructureMeetResponseDto {
  @ApiProperty({ type: MeetStructured })
  structured: MeetStructured;

  @ApiProperty({
    example: '# 다음 분기 로드맵 논의\n\n## 결정사항\n- MVP는 익스텐션으로 배포'
  })
  text: string;
}
