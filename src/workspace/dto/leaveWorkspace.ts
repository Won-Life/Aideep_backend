import { IsString } from 'class-validator';

export class LeaveWorkspaceBody {
  @IsString()
  workspaceId: string;
}
