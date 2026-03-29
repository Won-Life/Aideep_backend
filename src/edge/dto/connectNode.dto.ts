import { ApiProperty } from '@nestjs/swagger';
import { IsISBN, IsString, IsUUID } from 'class-validator';

export class ConnectNodeDto {
  @IsString()
  @ApiProperty({ example: 'c8c9ea51-6ef6-46aa-849d-9b086855a39e' })
  sourceId: string;

  @IsString()
  @ApiProperty({ example: '9e7363f3-5570-42b2-9b07-22fa32a5adec' })
  targetId: string;

  @IsString()
  @ApiProperty({ example: 'test' })
  targetHandle: string;

  @ApiProperty({ example: 'test' })
  @IsString()
  sourceHandle: string;
}
