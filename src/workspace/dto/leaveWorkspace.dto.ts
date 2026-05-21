import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class LeaveWorkspaceBody {
  @IsString()
  @ApiProperty({
    example: '422e16a9-fc48-4c0f-b2fc-1d8b94e2792a',
    description: '떠날 워크스페이스의 UUID'
  })
  workspaceId: string;
}

export class LeaveWorkspaceResponseDto {
  @ApiProperty({
    example: '422e16a9-fc48-4c0f-b2fc-1d8b94e2792a',
    description: '떠난 워크스페이스의 UUID'
  })
  workspaceId: string;
}
