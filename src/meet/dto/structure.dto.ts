import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested
} from 'class-validator';
import { Type } from 'class-transformer';

export const MAX_TRANSCRIPT_LENGTH = 100_000;

export class KnownSubtopicDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ example: 'st_1' })
  id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @ApiProperty({ example: '롤백 전략' })
  title: string;
}

export class StructureBody {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TRANSCRIPT_LENGTH)
  @ApiProperty({
    example: '오늘 회의에서는 배포 일정을 논의했습니다...',
    description: '회의 자막 전체 텍스트'
  })
  transcript: string;

  // 증분 구조화용: 지금까지 클라이언트가 누적한 subtopic 목록. LLM이 이어지는 논의를
  // 새 subtopic으로 중복 생성하지 않고 같은 id를 재사용하게 한다.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KnownSubtopicDto)
  @ApiPropertyOptional({
    type: [KnownSubtopicDto],
    description: '이전 구조화에서 이미 생성된 subtopic 목록 (증분 요청 시)'
  })
  knownSubtopics?: KnownSubtopicDto[];
}

export class PointDto {
  @ApiPropertyOptional({
    example: 'st_1',
    description: '기존 subtopic을 이어가면 그 id, 새 subtopic이면 null'
  })
  subtopicId: string | null;

  @ApiPropertyOptional({
    example: '온보딩 문서',
    description: 'subtopicId가 null일 때만: 새 subtopic 키워드'
  })
  newSubtopicTitle: string | null;

  @ApiProperty({ example: '즉시 롤백', description: '이 문장의 키워드 (짧게)' })
  title: string;

  @ApiProperty({ example: '배포 실패 시 이전 버전으로 즉시 롤백', description: '문장 요약' })
  detail: string;
}

export class StructuredNoteDto {
  @ApiProperty({ example: '회의 제목' })
  title: string;

  @ApiProperty({ type: [PointDto] })
  points: PointDto[];

  @ApiPropertyOptional({ example: ['금요일 배포 확정'], type: [String] })
  decisions?: string[];

  @ApiPropertyOptional({ example: ['지민: 롤백 스크립트 작성'], type: [String] })
  actionItems?: string[];

  @ApiPropertyOptional({ example: ['QA 일정은 미정'], type: [String] })
  openQuestions?: string[];
}

export class StructureResponseDto {
  @ApiProperty({ type: StructuredNoteDto })
  structured: StructuredNoteDto;

  @ApiProperty({
    example: '# 회의 제목\n\n# 주제\n\n## 롤백 전략\n- 즉시 롤백: ...'
  })
  text: string;
}
