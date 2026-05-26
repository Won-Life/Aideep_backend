import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';


export class UploadRequestDto {
  @IsUUID()
  @ApiProperty({ example: '422e16a9-fc48-4c0f-b2fc-1d8b94e2792a' })
  workspaceId: string;
}
