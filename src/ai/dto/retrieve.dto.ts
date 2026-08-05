import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { AiSearchType } from './chat.dto';

export class RetrieveRequestBody {
  @ApiProperty({ example: '노드 임베딩 관련 문서' })
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

export class RetrieveResponseDto {
  @ApiProperty({ type: [Object] })
  context: Record<string, unknown>[];

  @ApiProperty({ type: [Object] })
  sources: Record<string, unknown>[];
}
