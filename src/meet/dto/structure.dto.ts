import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator';

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

  // 증분 구조화용: 이전 구간에서 이미 만들어진 주제 이름 목록.
  // LLM이 이어지는 논의를 새 주제로 중복 생성하지 않고 같은 제목을 재사용하게 한다.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @ApiPropertyOptional({
    example: ['배포 일정', '온보딩 개선'],
    description: '이전 구조화에서 이미 생성된 주제 제목 목록 (증분 요청 시)'
  })
  knownTopics?: string[];
}

export class SubtopicDto {
  @ApiProperty({ example: '롤백 전략' })
  title: string;

  @ApiProperty({ example: ['배포 실패 시 이전 버전으로 즉시 롤백'], type: [String] })
  items: string[];
}

export class TopicDto {
  @ApiProperty({
    example: '배포 일정',
    description: '회의 내용에서 발견된 주제 — 미리 정해진 이름 없음'
  })
  title: string;

  @ApiProperty({ example: ['금요일 오후 배포로 합의'], type: [String] })
  items: string[];

  @ApiPropertyOptional({ type: [SubtopicDto] })
  subtopics?: SubtopicDto[];
}

export class StructuredNoteDto {
  @ApiProperty({ example: '회의 제목' })
  title: string;

  @ApiProperty({ type: [TopicDto] })
  topics: TopicDto[];

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
    example: '# 배포 일정\n- 금요일 오후 배포로 합의\n\n# 결정사항\n- 금요일 배포 확정'
  })
  text: string;
}
