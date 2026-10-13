import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { file_status_enum } from 'src/generated/prisma/client';
import { UploadedFile } from './s3.service';

@Injectable()
export class UploadRepository {
  constructor(private readonly prisma: PrismaService) {}

  async uploadFile(
    uploaded: UploadedFile,
    userId: string,
    workspaceId: string
  ) {
    return await this.prisma.client.files.create({
      data: {
        file_url: uploaded.url,
        s3_key: uploaded.key,
        mime_type: uploaded.mimeType,
        size: uploaded.size,
        owner_user_id: userId,
        workspace_id: workspaceId,
        // 업로드 직후에는 어떤 노드에도 붙어 있지 않다.
        // 노드에 첨부되면 file-attachment 가 ACTIVE 로 올리고,
        // 24시간 넘게 PENDING 이면 file-gc 가 정리한다.
        status: file_status_enum.PENDING
      }
    });
  }
}
