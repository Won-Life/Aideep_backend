import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Request,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { ApiSuccessResponse } from 'src/common/response/api-success-response.decorator';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from './constant/upload.constant';
import { UploadManyResponseDto } from './dto/upload-many-response.dto';
import { UploadResponseDto } from './dto/upload-response.dto';
import { UploadService } from './upload.service';
import { UploadRequestDto } from './dto/uploade-request.dto';

const MULTER_OPTIONS = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE }
};

@ApiTags('Upload')
@Controller('upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('jwt')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @ApiOperation({
    summary: '파일 단일 업로드',
    description:
      '파일 한 개를 서버 경유로 S3에 업로드하고 DB에 메타데이터를 저장합니다.'
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'workspaceId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        workspaceId: { type: 'string', format: 'uuid' }
      }
    }
  })
  @ApiSuccessResponse(UploadResponseDto, 201, '파일 업로드 성공')
  @UseInterceptors(FileInterceptor('file', MULTER_OPTIONS))
  async uploadOne(
    @UploadedFile() file: Express.Multer.File,
    @Body() body : UploadRequestDto,
    @Request() req: any
  ) {
    if (!file) {
      throw new BadRequestException('파일이 없습니다.');
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype as any)) {
      throw new BadRequestException(
        `허용된 MIME 타입이 아닙니다. 허용: ${ALLOWED_MIME_TYPES.join(', ')}`
      );
    }
    const userId = req.user?.user_id;
    return this.uploadService.uploadOne(file, body.workspaceId, userId);
  }

  // @Post('many')
  // @ApiOperation({
  //   summary: '파일 다중 업로드',
  //   description:
  //     '파일 여러 개를 서버 경유로 S3에 업로드하고 DB에 메타데이터를 저장합니다. (최대 10개)'
  // })
  // @ApiConsumes('multipart/form-data')
  // @ApiBody({
  //   schema: {
  //     type: 'object',
  //     required: ['files', 'workspaceId'],
  //     properties: {
  //       files: { type: 'array', items: { type: 'string', format: 'binary' } },
  //       workspaceId: { type: 'string', format: 'uuid' }
  //     }
  //   }
  // })
  // @ApiSuccessResponse(UploadManyResponseDto, 201, '파일 다중 업로드 결과')
  // @UseInterceptors(FilesInterceptor('files', 10, MULTER_OPTIONS))
  // async uploadMany(
  //   @UploadedFiles() files: Express.Multer.File[],
  //   @Body('workspaceId') workspaceId: string,
  //   @Request() req: any
  // ): Promise<UploadManyResponseDto> {
  //   if (!files || files.length === 0) {
  //     throw new BadRequestException('파일이 없습니다.');
  //   }
  //   const invalid = files.find(
  //     (f) => !ALLOWED_MIME_TYPES.includes(f.mimetype as any)
  //   );
  //   if (invalid) {
  //     throw new BadRequestException(
  //       `허용된 MIME 타입이 아닙니다. 허용: ${ALLOWED_MIME_TYPES.join(', ')}`
  //     );
  //   }
  //   if (!workspaceId) {
  //     throw new BadRequestException('workspaceId가 필요합니다.');
  //   }
  //   const userId = req.user?.user_id;
  //   return this.uploadService.uploadMany(files, workspaceId, userId);
  // }
}
