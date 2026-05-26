import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { S3Service } from './s3.service';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { UploadRepository } from './upload.repository';
import { WorkspaceModule } from 'src/workspace/workspace.module';

@Module({
  imports: [
    MulterModule.register({ storage: memoryStorage() }),
    WorkspaceModule
  ],
  controllers: [UploadController],
  providers: [S3Service, UploadService, UploadRepository]
})
export class UploadModule {}
