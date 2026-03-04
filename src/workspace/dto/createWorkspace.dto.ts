import { ApiOperation, ApiProperty } from '@nestjs/swagger';
import { Prisma, workspace_role_enum } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class createWorkspaceBody {
  @IsString()
  title: string;

  @IsEnum(workspace_role_enum)
  @ApiProperty({
    example: 'OWNER'
  })
  role: workspace_role_enum;
}
