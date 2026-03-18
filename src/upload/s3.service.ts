import {
  Injectable,
  InternalServerErrorException,
  Logger
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand
} from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

export interface UploadedFile {
  key: string;
  url: string;
  originalName: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);

  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor(private readonly config: ConfigService) {
    this.region = this.config.getOrThrow<string>('AWS_REGION');
    this.bucket = this.config.getOrThrow<string>('AWS_S3_BUCKET');

    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: this.config.getOrThrow<string>('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.config.getOrThrow<string>('AWS_SECRET_ACCESS_KEY')
      }
    });
  }

  /**
   * 파일 버퍼를 S3에 직접 업로드합니다.
   */
  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'uploads'
  ): Promise<UploadedFile> {
    const ext = path.extname(file.originalname);
    const key = `${folder}/${uuidv4()}${ext}`;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          ContentLength: file.size
        })
      );

      const url = this.getPublicUrl(key);
      this.logger.log(`File uploaded: ${key}`);

      return {
        key,
        url,
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size
      };
    } catch (error) {
      this.logger.error(`Failed to upload file: ${error.message}`, error.stack);
      throw new InternalServerErrorException('파일 업로드에 실패했습니다.');
    }
  }

  /**
   * 여러 파일을 병렬로 S3에 업로드합니다.
   */
  async uploadFiles(
    files: Express.Multer.File[],
    folder: string = 'uploads'
  ): Promise<UploadedFile[]> {
    return Promise.all(files.map((file) => this.uploadFile(file, folder)));
  }

  /**
   * S3 오브젝트를 삭제합니다.
   */
  async deleteFile(key: string): Promise<void> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key })
      );
      this.logger.log(`File deleted: ${key}`);
    } catch (error) {
      this.logger.error(`Failed to delete file: ${error.message}`, error.stack);
      throw new InternalServerErrorException('파일 삭제에 실패했습니다.');
    }
  }

  /**
   * URL에서 S3 key를 추출합니다.
   */
  extractKeyFromUrl(url: string): string {
    const bucketUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/`;
    if (!url.startsWith(bucketUrl)) {
      throw new Error(`Invalid S3 URL format: ${url}`);
    }
    return url.slice(bucketUrl.length);
  }

  private getPublicUrl(key: string): string {
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
}
