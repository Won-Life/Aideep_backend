import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export const MAX_TRANSCRIPT_LENGTH = 100_000;

export class StructureBody {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TRANSCRIPT_LENGTH)
  @ApiProperty({
    example: '오늘 회의에서는 배포 일정을 논의했습니다...',
    description: '회의 자막 전체 텍스트'
  })
  transcript: string;
}

export class StructuredSectionDto {
  @ApiProperty({ example: '결정사항' })
  title: string;

  @ApiProperty({ example: ['항목1', '항목2'], type: [String] })
  items: string[];
}

export class StructuredNoteDto {
  @ApiProperty({ example: '회의 제목' })
  title: string;

  @ApiProperty({ type: [StructuredSectionDto] })
  sections: StructuredSectionDto[];
}

export class StructureResponseDto {
  @ApiProperty({ type: StructuredNoteDto })
  structured: StructuredNoteDto;

  @ApiProperty({ example: '# 회의 제목\n\n## 결정사항\n- 항목1\n- 항목2' })
  text: string;
}
