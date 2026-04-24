import {
  Controller,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MAX_FILE_SIZE, MAX_FILES } from './constant/upload.constant';
import { S3Service } from './s3.service';
import { ApiSuccessResponse } from 'src/common/response/api-success-response.decorator';

const uploadedFileSchema = {
  properties: {
    key: { type: 'string', example: 'uploads/uuid.png' },
    url: {
      type: 'string',
      example: 'https://bucket.s3.region.amazonaws.com/uploads/uuid.png'
    },
    originalName: { type: 'string', example: 'photo.png' },
    mimeType: { type: 'string', example: 'image/png' },
    size: { type: 'number', example: 204800 }
  }
};

@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly s3Service: S3Service) {}

  @Post('/')
  @ApiOperation({
    summary: '단일 파일 업로드',
    description: `파일 1개를 S3에 업로드합니다. 최대 파일 크기: 10MB`
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: '업로드할 파일 (최대 10MB)'
        }
      }
    }
  })
  @ApiSuccessResponse(uploadedFileSchema, 201, '파일 업로드 성공')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE }
    })
  )
  async uploadSingle(@UploadedFile() file: Express.Multer.File) {
    return this.s3Service.uploadFile(file);
  }

  @Post('/many')
  @ApiOperation({
    summary: '다중 파일 업로드',
    description: `파일 여러 개를 S3에 병렬로 업로드합니다. 최대 ${MAX_FILES}개, 파일당 최대 10MB`
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: `업로드할 파일 목록 (최대 ${MAX_FILES}개, 파일당 최대 10MB)`
        }
      }
    }
  })
  @ApiSuccessResponse(
    { type: 'array', items: uploadedFileSchema },
    201,
    '다중 파일 업로드 성공'
  )
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES, {
      limits: { fileSize: MAX_FILE_SIZE }
    })
  )
  async uploadFiles(@UploadedFiles() files: Express.Multer.File[]) {
    return this.s3Service.uploadFiles(files);
  }
}
