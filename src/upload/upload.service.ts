import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { S3Service } from './s3.service';
import { UploadResponseDto } from './dto/upload-response.dto';
import {
  UploadManyResponseDto,
  UploadFailureDto
} from './dto/upload-many-response.dto';
import { WorkspaceService } from 'src/workspace/workspace.service';
import { UploadRepository } from './upload.repository';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly s3Service: S3Service,
    private readonly workspaceService: WorkspaceService,
    private readonly uploadRepository: UploadRepository
  ) {}

  async uploadOne(
    file: Express.Multer.File,
    workspaceId: string,
    userId: string
  ): Promise<UploadResponseDto> {
    // A-001: 워크스페이스 멤버십 검증
    await this.workspaceService.checkExist(userId, workspaceId);

    // A-003: S3 업로드 후 DB 실패 시 보상 삭제
    const uploaded = await this.s3Service.uploadFile(file);

    const upload = await this.uploadRepository.uploadFile(
      uploaded,
      userId,
      workspaceId
    );

    if (!upload) {
      await this.s3Service.deleteFile(uploaded.key);
      throw new InternalServerErrorException('파일 업로드에 실패했습니다.');
    }

    return {
      fileId: upload.file_id,
      fileUrl: upload.file_url,
      mimeType: upload.mime_type,
      size: upload.size,
      originalName: uploaded.originalName,
      createdAt: upload.created_at
    };
  }

  // async uploadMany(
  //   files: Express.Multer.File[],
  //   workspaceId: string,
  //   ownerUserId: string
  // ): Promise<UploadManyResponseDto> {
  //   // A-001: 워크스페이스 멤버십 검증 (한 번만 호출)
  //   const membership = await this.prisma.client.users_workspaces.findUnique({
  //     where: {
  //       user_id_workspace_id: {
  //         user_id: ownerUserId,
  //         workspace_id: workspaceId
  //       }
  //     }
  //   });

  //   if (!membership || membership.deleted_at !== null) {
  //     throw new ForbiddenException('해당 워크스페이스에 접근 권한이 없습니다.');
  //   }

  //   // A-002: partial failure 응답
  //   const results = await Promise.allSettled(
  //     files.map((file) => this.uploadOne(file, workspaceId, ownerUserId))
  //   );

  //   const succeeded: UploadResponseDto[] = [];
  //   const failed: UploadFailureDto[] = [];

  //   results.forEach((result, index) => {
  //     if (result.status === 'fulfilled') {
  //       succeeded.push(result.value);
  //     } else {
  //       failed.push({
  //         index,
  //         originalName: files[index].originalname,
  //         reason: result.reason?.message ?? 'unknown'
  //       });
  //     }
  //   });

  //   return { succeeded, failed };
  // }
}
