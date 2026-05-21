import { ApiProperty } from '@nestjs/swagger';

export class UploadResponseDto {
  @ApiProperty({ description: '저장된 파일 ID' })
  fileId: string;

  @ApiProperty({ description: '파일 공개 URL' })
  fileUrl: string;

  @ApiProperty({ description: '파일 MIME 타입' })
  mimeType: string;

  @ApiProperty({ description: '파일 크기 (bytes)' })
  size: number;

  @ApiProperty({ description: '원본 파일명' })
  originalName: string;

  @ApiProperty({ description: '생성 시각' })
  createdAt: Date;
}
