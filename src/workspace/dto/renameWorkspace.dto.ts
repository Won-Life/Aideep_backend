import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RenameWorkspaceBody {
  @ApiProperty({
    example: '새로운 이름',
    description: '새로운 워크스페이스 이름'
  })
  @IsString()
  @IsNotEmpty()
  title: string;
}
