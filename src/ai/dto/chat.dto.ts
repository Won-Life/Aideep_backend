import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export type AiSearchType = 'mmr' | 'hybrid' | 'semantic';

export class ChatRequestBody {
  @ApiProperty({ example: '이 워크스페이스에서 진행 중인 프로젝트를 요약해줘' })
  @IsString()
  query: string;

  @ApiProperty({
    example: 'mmr',
    enum: ['mmr', 'hybrid', 'semantic'],
    required: false
  })
  @IsOptional()
  @IsIn(['mmr', 'hybrid', 'semantic'])
  searchType?: AiSearchType;
}

export class ChatResponseDto {
  @ApiProperty({ example: '요약하면 다음과 같습니다...' })
  answer: string;

  @ApiProperty({ type: [Object] })
  sources: Record<string, unknown>[];
}
