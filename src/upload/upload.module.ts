import { Module } from '@nestjs/common';
import { S3Service } from './s3.service';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { UploadRepository } from './upload.repository';
import { WorkspaceModule } from 'src/workspace/workspace.module';

// multer 옵션(메모리 스토리지 + 크기 제한)은 컨트롤러의 FileInterceptor 에
// MULTER_OPTIONS 로 직접 넘긴다. MulterModule.register 를 중복으로 두면
// 실제로는 적용되지 않는 설정이 하나 더 보여 혼선만 생긴다.
@Module({
  imports: [WorkspaceModule],
  controllers: [UploadController],
  providers: [S3Service, UploadService, UploadRepository]
})
export class UploadModule {}
