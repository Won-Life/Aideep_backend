import { ApiProperty } from '@nestjs/swagger';

export class NodeDetailDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  node_id: string;

  @ApiProperty({ example: '프로젝트 노드' })
  title: string;

  @ApiProperty({ example: 'PROJECT' })
  node_type: string;

  @ApiProperty({ example: { markdownBody: '## 내용', jsonBody: '{}' } })
  content: Record<string, unknown>;

  @ApiProperty({ example: 1 })
  version: number;

  @ApiProperty({ example: 100 })
  position_x: number;

  @ApiProperty({ example: 200 })
  position_y: number;

  @ApiProperty({ example: 'ws-uuid-1234' })
  workspace_id: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  created_at: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  updated_at: Date;

  @ApiProperty({ example: null, nullable: true })
  deleted_at: Date | null;
}
