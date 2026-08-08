import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsString } from 'class-validator';

export class TranscriptChunkBody {
  @ApiProperty({ example: 'ws-uuid-5678' })
  @IsString()
  @IsNotEmpty()
  workspaceId: string;

  @ApiProperty({ example: 'meeting-uuid-1234' })
  @IsString()
  @IsNotEmpty()
  meetingId: string;

  @ApiProperty({ example: '오늘 회의에서는 프로젝트 일정을 논의했습니다.' })
  @IsString()
  @IsNotEmpty()
  transcriptChunk: string;

  @ApiProperty({ example: '2026-08-08T10:00:00Z' })
  @IsISO8601()
  timestamp: string;
}

export class TranscriptChunkResponseDto {
  @ApiProperty({ example: 'CHILD' })
  relationType: string;

  @ApiProperty({ example: 'node-1' })
  nodeId: string;

  @ApiProperty({ example: 'node-0', nullable: true })
  parentNodeId: string | null;
}
