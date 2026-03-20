import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsJSON,
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

class UpdateNodeStyleDto {
  @ApiProperty({ example: '#ffffff', required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ example: '#000000', required: false })
  @IsOptional()
  @IsString()
  textColor?: string;
}

class UpdateProjectNodeDataDto extends UpdateNodeStyleDto {}

export class UpdateProjectNodeBody {
  @ApiProperty({ example: '수정된 프로젝트 노드', required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ type: PositionDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => PositionDto)
  position?: PositionDto;

  @ApiProperty({ type: UpdateProjectNodeDataDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateProjectNodeDataDto)
  data?: UpdateProjectNodeDataDto;
}

class UpdateMarkdownNodeDataDto extends UpdateNodeStyleDto {
  @ApiProperty({ example: '## 수정된 내용', required: false })
  @IsOptional()
  @IsString()
  body?: string;
}

// export class UpdateMarkdownNodeBody {
//   @ApiProperty({ example: '수정된 마크다운 노드', required: false })
//   @IsOptional()
//   @IsString()
//   title?: string;

//   @ApiProperty({ type: PositionDto, required: false })
//   @IsOptional()
//   @ValidateNested()
//   @Type(() => PositionDto)
//   position?: PositionDto;

//   @ApiProperty({ type: UpdateMarkdownNodeDataDto, required: false })
//   @IsOptional()
//   @ValidateNested()
//   @Type(() => UpdateMarkdownNodeDataDto)
//   data?: UpdateMarkdownNodeDataDto;
// }

export class UpdateCommonNodeBody {
  @ApiProperty({ example: '수정된 노드 제목' })
  @IsString()
  title: string;
}

export class MarkdownBodyDto {
  @IsString()
  @ApiProperty({ example: '#마크다운 바디입니다.' })
  markdownBody: string;

  @IsString()
  @ApiProperty({ example: "{contenet : 'stringfy된 json 바디입니다'}" })
  jsonBody: string;
}

export class UpdateMarkdownNodeBody {
  @IsOptional()
  @IsString()
  @ApiProperty({
    example: '수정된 제목'
  })
  title?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MarkdownBodyDto)
  body?: MarkdownBodyDto;
}

export class NodeMoveBody {
  @IsJSON()
  postion: PositionDto;
}
