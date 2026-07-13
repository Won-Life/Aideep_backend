import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested
} from 'class-validator';
import { node_type_enum } from '../../generated/prisma/client';

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

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  propagateToChildren?: boolean;

  @ApiProperty({ enum: node_type_enum, required: false })
  @IsOptional()
  @IsEnum(node_type_enum)
  nodeType?: node_type_enum;
}

export class NodeMoveBody {
  @IsDefined()
  @ValidateNested()
  @Type(() => PositionDto)
  position: PositionDto;
}

export class NodeMoveResponse {
  @ApiProperty()
  nodeId: string;

  @ApiProperty({ example: 100 })
  x: number;

  @ApiProperty({ example: 200 })
  y: number;
}

export class NodeUpdatePatch {
  @ApiProperty({ required: false })
  title?: string;

  @ApiProperty({ required: false, type: Object })
  data?: Record<string, unknown>;

  @ApiProperty({ required: false, enum: node_type_enum })
  nodeType?: node_type_enum;
}

export class NodeDescendantUpdate {
  @ApiProperty()
  nodeId: string;

  @ApiProperty({ type: NodeUpdatePatch })
  patch: NodeUpdatePatch;
}

export class NodeUpdateResponse {
  @ApiProperty()
  nodeId: string;

  @ApiProperty({ type: NodeUpdatePatch })
  patch: NodeUpdatePatch;
}
