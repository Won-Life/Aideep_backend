import { Prisma, workspace_role_enum } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class createWorkspaceBody {
  @IsString()
  title: string;

  @IsEnum(workspace_role_enum)
  role: workspace_role_enum;
}
