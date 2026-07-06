import { Module } from '@nestjs/common';
import { S3Service } from 'src/upload/s3.service';
import { FileAttachmentRepository } from './file-attachment.repository';
import { FileAttachmentService } from './file-attachment.service';
import { FileGcService } from './file-gc.service';

@Module({
  providers: [
    FileAttachmentService,
    FileAttachmentRepository,
    FileGcService,
    S3Service
  ],
  exports: [FileAttachmentService]
})
export class FileAttachmentModule {}
