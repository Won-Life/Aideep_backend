import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsString, IsUrl, ValidateNested } from 'class-validator';

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
