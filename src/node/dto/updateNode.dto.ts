import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested
} from 'class-validator';

class PositionDto {
  @ApiProperty({ example: 100 })
  @IsNumber()
  x: number;

  @ApiProperty({ example: 200 })
  @IsNumber()
  y: number;
}

export class UpdateNodeMetaBody {
  @ApiProperty({ example: '수정된 제목', required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ example: 'rgb(var(--ds-sub-white))', required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ example: 'rgb(var(--ds-sub-black))', required: false })
  @IsOptional()
  @IsString()
  textColor?: string;
}

export class NodeMoveBody {
  @IsDefined()
  @ValidateNested()
  @Type(() => PositionDto)
  position: PositionDto;
}
