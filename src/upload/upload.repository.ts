import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
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
        workspace_id: workspaceId
      }
    });
  }
}
