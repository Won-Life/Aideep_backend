import { ApiProperty } from '@nestjs/swagger';

export class NodeSearchResultDto {
  @ApiProperty({ description: '노드 ID', format: 'uuid' })
  nodeId!: string;

  @ApiProperty({ description: '워크스페이스 ID', format: 'uuid' })
  workspaceId!: string;

  @ApiProperty({ description: '노드 제목', nullable: true })
  title!: string | null;

  @ApiProperty({ description: '노드 타입' })
  nodeType!: string;

  @ApiProperty({ description: '노드 깊이', nullable: true })
  depth!: number | null;

  @ApiProperty({ description: 'X 좌표', nullable: true })
  positionX!: number | null;

  @ApiProperty({ description: 'Y 좌표', nullable: true })
  positionY!: number | null;

  @ApiProperty({ description: '버전' })
  version!: number;

  @ApiProperty({ description: '생성 시각', format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ description: '수정 시각', format: 'date-time' })
  updatedAt!: Date;

  @ApiProperty({
    description: '검색 점수 (0~1, 높을수록 query 와 유사). FTS 비활성 시 1.',
    example: 0.42
  })
  score!: number;

  @ApiProperty({
    description: '매칭 부위 snippet (최대 120자). FTS 비활성 시 빈 문자열.',
    example: '...키워드 주변 텍스트...'
  })
  snippet!: string;
}

export class NodeSearchResponseDto {
  @ApiProperty({ type: [NodeSearchResultDto] })
  items!: NodeSearchResultDto[];

  @ApiProperty({
    description: '다음 페이지 cursor. null 이면 더 이상 결과 없음.',
    nullable: true,
    example: '0.123|550e8400-e29b-41d4-a716-446655440000'
  })
  nextCursor!: string | null;
}
