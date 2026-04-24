import { ApiProperty } from '@nestjs/swagger';
import { workspace_role_enum } from '@prisma/client';
import { IsDate, IsDateString, IsEnum, IsUUID } from 'class-validator';
import { RawEdgeItem, RawNodeItem } from 'src/node/node.repository';

export class WorkspaceInfoDto {
  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    example: [
      {
        node_id: '550e8400-e29b-41d4-a716-446655440000',
        title: '프로젝트 노드',
        node_type: 'PROJECT',
        content: {
          dataType: 'PROJECT',
          color: '#ffffff',
          textColor: '#000000'
        },
        version: 1,
        position_x: 100,
        postion_y: 200,
        workspace_id: '550e8400-e29b-41d4-a716-446655440001',
        created_at: '2026-03-07T00:00:00.000Z',
        updated_at: '2026-03-07T00:00:00.000Z',
        deleted_at: null
      }
    ]
  })
  nodes: RawNodeItem[];

  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    example: [
      {
        edge_id: '550e8400-e29b-41d4-a716-446655440002',
        workspace_id: '550e8400-e29b-41d4-a716-446655440001',
        source_id: '550e8400-e29b-41d4-a716-446655440000',
        target_id: '550e8400-e29b-41d4-a716-446655440003',
        source_handle: 'right',
        target_handle: 'left',
        target_side: null,
        version: 1,
        created_at: '2026-03-07T00:00:00.000Z',
        updated_at: '2026-03-07T00:00:00.000Z',
        deleted_at: null
      }
    ]
  })
  edges: RawEdgeItem[];
}

export class UserWokrpaceInfoDto {
  @IsUUID()
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  workspaceId: string;

  @ApiProperty({ example: '내 워크스페이스' })
  title: string;

  @IsEnum(workspace_role_enum)
  @ApiProperty({ example: workspace_role_enum.OWNER })
  role: workspace_role_enum;

  @IsDate()
  @ApiProperty({ example: new Date() })
  joined: Date;
}
