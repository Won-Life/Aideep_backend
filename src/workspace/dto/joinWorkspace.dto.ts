import { ApiProperty } from '@nestjs/swagger';
import { workspace_role_enum } from '@prisma/client';
import { IsEnum, IsString, IsUrl } from 'class-validator';

export class JoinWorkspaceBody {
  @IsString()
  workspaceId: string;

  @IsEnum(workspace_role_enum)
  @ApiProperty({
    example: 'OWNER'
  })
  role: workspace_role_enum;
}

export class InviteWOrkspaceResponseDto {
  @IsUrl()
  @ApiProperty({
    example: 'http://test'
  })
  url: string;

  @IsString()
  @ApiProperty({ example: '123123' })
  code: string;
}
