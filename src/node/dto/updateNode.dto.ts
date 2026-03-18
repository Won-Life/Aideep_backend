import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

class PositionDto {
  @ApiProperty({ example: 100 })
  @IsNumber()
  x: number;

  @ApiProperty({ example: 200 })
  @IsNumber()
  y: number;
}

class UpdateNodeDataDto {
  @ApiProperty({ example: '## 수정된 내용', required: false })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiProperty({ example: '#ffffff', required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ example: '#000000', required: false })
  @IsOptional()
  @IsString()
  textColor?: string;
}

export class UpdateNodeBody {
  @ApiProperty({ example: '수정된 노드 제목', required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ type: PositionDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => PositionDto)
  position?: PositionDto;

  @ApiProperty({ type: UpdateNodeDataDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateNodeDataDto)
  data?: UpdateNodeDataDto;
}
