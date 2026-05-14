import { ApiOperation, ApiProperty } from '@nestjs/swagger';
import { Prisma, workspace_role_enum } from '../../generated/prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class CreateWorkspaceBody {
  @IsString()
  @ApiProperty({ example: '새로운 화이트보드' })
  title: string;

  @IsEnum(workspace_role_enum)
  @ApiProperty({
    example: 'OWNER'
  })
  role: workspace_role_enum;
}

export class CreateWorkspaceResponseDto {
  @ApiProperty({ example: '08612bb4-2dd8-471b-9133-bbc213f97aee' })
  workspaceId: string;
}
