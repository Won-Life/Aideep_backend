import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ChatMessageBody {
  @ApiProperty({ example: '이 프로젝트 노드를 요약해줘' })
  @IsString()
  message: string;

  @ApiProperty({
    required: false,
    example: '550e8400-e29b-41d4-a716-446655440000'
  })
  @IsOptional()
  @IsString()
  workspaceId?: string;
}
