import {
  Controller,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { MAX_FILE_SIZE, MAX_FILES } from './constant/upload.constant';
import { S3Service } from './s3.service';

@Controller('upload')
export class UploadController {
  constructor(private readonly s3Service: S3Service) {}

  @Post('/')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_FILE_SIZE }
    })
  )
  async uploadSingle(@UploadedFile() file: Express.Multer.File) {
    return this.s3Service.uploadFile(file);
  }

  @Post('/many')
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES, {
      limits: { fileSize: MAX_FILE_SIZE }
    })
  )
  async uploadFiles(@UploadedFiles() files: Express.Multer.File[]) {
    return this.s3Service.uploadFiles(files);
  }
}
