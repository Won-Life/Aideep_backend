import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { S3Service } from 'src/upload/s3.service';
import { FileAttachmentRepository } from './file-attachment.repository';

export const STALE_FILE_TTL_MS = 24 * 60 * 60 * 1000; // 24시간

@Injectable()
export class FileGcService {
  private readonly logger = new Logger(FileGcService.name);

  constructor(
    private readonly fileAttachmentRepository: FileAttachmentRepository,
    private readonly s3Service: S3Service
  ) {}

  /**
   * 매일 자정에 다음 파일들을 S3에서 삭제하고 DELETED로 전이합니다.
   * 1) orphan 처리 후 24시간이 지난 ORPHAN 파일
   * 2) 업로드 후 24시간 내에 어떤 노드에도 첨부되지 않은 PENDING 파일
   * files 행은 감사 목적으로 유지합니다(hard delete 안 함).
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupStaleFiles(): Promise<void> {
    const threshold = new Date(Date.now() - STALE_FILE_TTL_MS);
    const staleFiles =
      await this.fileAttachmentRepository.findStaleFiles(threshold);
    if (staleFiles.length === 0) return;

    const results = await Promise.allSettled(
      staleFiles.map((file) => this.s3Service.deleteFile(file.s3_key))
    );

    const deletedIds = staleFiles
      .filter((_, i) => results[i].status === 'fulfilled')
      .map((file) => file.file_id);
    const failedCount = staleFiles.length - deletedIds.length;

    if (deletedIds.length > 0) {
      await this.fileAttachmentRepository.markFilesDeleted(deletedIds);
    }

    this.logger.log(
      `Stale file GC: deleted ${deletedIds.length}, failed ${failedCount}`
    );
  }
}
