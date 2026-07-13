import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateEdgeDto {
  @ApiProperty({ example: 'test', required: false })
  @IsOptional()
  @IsString()
  sourceHandle?: string;

  @ApiProperty({ example: 'test', required: false })
  @IsOptional()
  @IsString()
  targetHandle?: string;
}

export class UpdateEdgeResponse {
  @ApiProperty({ example: 'c8c9ea51-6ef6-46aa-849d-9b086855a39e' })
  edgeId: string;

  @ApiProperty({ example: 'test', required: false })
  sourceHandle?: string;

  @ApiProperty({ example: 'test', required: false })
  targetHandle?: string;
}
