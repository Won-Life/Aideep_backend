import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsNumber,
  IsString,
  IsUrl,
  ValidateNested
} from 'class-validator';
import { node_type_enum } from '../../generated/prisma/client';

export class MarkDownBody {
  @IsString()
  jsonBody: string;

  @IsString()
  markdownBody: string;

  @IsString()
  color: string;

  @IsString()
  textColor: string;
}
export class ProjectBody {
  @IsString()
  color: string;

  @IsString()
  textColor: string;
}

export class PositionDto {
  @ApiProperty({ example: 100 })
  @IsNumber()
  x: number;

  @ApiProperty({ example: 200 })
  @IsNumber()
  y: number;
}

export class CreateProjectNodeBody {
  @ApiProperty({ example: '프로젝트 노드' })
  @IsString()
  title: string;

  @ApiProperty({ type: PositionDto })
  @ValidateNested()
  @Type(() => PositionDto)
  position: PositionDto;

  @ApiProperty({ type: ProjectBody })
  @IsDefined()
  @ValidateNested()
  @Type(() => ProjectBody)
  body: ProjectBody;
}

export class CreateMarkDownNodeBody {
  @ApiProperty({ example: '마크다운 노드' })
  @IsString()
  title: string;

  @ApiProperty({ type: PositionDto })
  @ValidateNested()
  @Type(() => PositionDto)
  position: PositionDto;

  @ApiProperty({ type: MarkDownBody })
  @ValidateNested()
  @Type(() => MarkDownBody)
  body: MarkDownBody;
}

class PdfDataDto {
  @ApiProperty({ example: 'https://example.com/file.pdf' })
  @IsUrl()
  fileUrl: string;

  @ApiProperty({ example: 'document.pdf' })
  @IsString()
  fileName: string;

  @ApiProperty({ example: 204800 })
  @IsNumber()
  fileSize: number;
}

export class CreatePdfNodeBody {
  @ApiProperty({ example: 'PDF 노드' })
  @IsString()
  title: string;

  @ApiProperty({ type: PositionDto })
  @ValidateNested()
  @Type(() => PositionDto)
  position: PositionDto;

  @ApiProperty({ type: PdfDataDto })
  @ValidateNested()
  @Type(() => PdfDataDto)
  data: PdfDataDto;
}

export class NodeCreateReponse {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  nodeId: string;

  @ApiProperty({ example: '프로젝트 노드', nullable: true })
  title: string | null;

  @ApiProperty({ enum: ['PROJECT', 'DATA', 'RESOURCE', 'ARCHIVE'] })
  nodeType: node_type_enum;

  @ApiProperty({ type: PositionDto })
  position: { x: number; y: number };

  @ApiProperty({ type: Object, example: { color: '#ffffff' } })
  data: Record<string, unknown>;

  @ApiProperty({ example: 'Mon May 29 2026' })
  createdAt: string;
}
