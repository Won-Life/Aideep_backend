import { ApiProperty } from '@nestjs/swagger';
import { UploadResponseDto } from './upload-response.dto';

export class UploadFailureDto {
  @ApiProperty({ description: '실패한 파일의 입력 인덱스' })
  index: number;
  @ApiProperty({ description: '원본 파일명' })
  originalName: string;
  @ApiProperty({ description: '실패 사유' })
  reason: string;
}

export class UploadManyResponseDto {
  @ApiProperty({ type: [UploadResponseDto] })
  succeeded: UploadResponseDto[];
  @ApiProperty({ type: [UploadFailureDto] })
  failed: UploadFailureDto[];
}
