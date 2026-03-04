import { ApiProperty } from '@nestjs/swagger';
import { workspace_role_enum } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class JoinWorkspaceBody {
  @IsString()
  workspaceId: string;

  @IsEnum(workspace_role_enum)
  @ApiProperty({
    example: 'OWNER'
  })
  role: workspace_role_enum;
}
