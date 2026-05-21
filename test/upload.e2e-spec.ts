jest.mock('uuid', () => ({ v4: jest.fn(() => 'e2e-mock-uuid') }));

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  PutObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn()
}));

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/guards/jwt.guard';
import { UploadService } from '../src/upload/upload.service';
import { AllExceptionsFilter } from '../src/common/error';
import { ResponseInterceptor } from '../src/common/response/response.interceptor';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

const mockUploadResponseDto = {
  fileId: 'e2e-file-uuid',
  fileUrl: 'https://bucket.s3.region.amazonaws.com/uploads/uuid.png',
  mimeType: 'image/png',
  size: 1024,
  originalName: 'test.png',
  createdAt: new Date().toISOString()
};

const mockUploadService = {
  uploadOne: jest.fn().mockResolvedValue(mockUploadResponseDto),
  uploadMany: jest.fn().mockResolvedValue({
    succeeded: [mockUploadResponseDto, mockUploadResponseDto],
    failed: []
  })
};

describe('Upload (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().user = { user_id: 'e2e-user' };
          return true;
        }
      })
      .overrideProvider(UploadService)
      .useValue(mockUploadService)
      .compile();

    app = moduleFixture.createNestApplication();

    const winstonLogger = app.get(WINSTON_MODULE_NEST_PROVIDER);
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    app.useGlobalFilters(new AllExceptionsFilter(winstonLogger));
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.setGlobalPrefix('aideep/api');

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUploadService.uploadOne.mockResolvedValue(mockUploadResponseDto);
    mockUploadService.uploadMany.mockResolvedValue({
      succeeded: [mockUploadResponseDto, mockUploadResponseDto],
      failed: []
    });
  });

  // TC1: POST /upload 정상 image/png 1KB → 201
  it('POST /upload: 정상 image/png → 201, 응답 필드 포함', async () => {
    const res = await request(app.getHttpServer())
      .post('/aideep/api/upload')
      .field('workspaceId', 'ws-uuid-1')
      .attach('file', Buffer.alloc(1024), {
        filename: 'test.png',
        contentType: 'image/png'
      })
      .expect(201);

    expect(res.body.resultType).toBe('SUCCESS');
    const data = res.body.success;
    expect(data).toHaveProperty('fileId');
    expect(data).toHaveProperty('fileUrl');
    expect(data).toHaveProperty('mimeType');
    expect(data).toHaveProperty('size');
    expect(data).toHaveProperty('originalName');
    expect(data).toHaveProperty('createdAt');
  });

  // TC2: POST /upload 파일 없음 → 400
  it('POST /upload: 파일 없음 → 400', async () => {
    await request(app.getHttpServer())
      .post('/aideep/api/upload')
      .field('workspaceId', 'ws-uuid-1')
      .expect(400);
  });

  // TC3: POST /upload workspaceId 누락 → 400
  it('POST /upload: workspaceId 누락 → 400', async () => {
    await request(app.getHttpServer())
      .post('/aideep/api/upload')
      .attach('file', Buffer.alloc(1024), {
        filename: 'test.png',
        contentType: 'image/png'
      })
      .expect(400);
  });

  // TC4: POST /upload MIME text/plain → 400
  it('POST /upload: MIME text/plain → 400', async () => {
    await request(app.getHttpServer())
      .post('/aideep/api/upload')
      .field('workspaceId', 'ws-uuid-1')
      .attach('file', Buffer.alloc(1024), {
        filename: 'file.txt',
        contentType: 'text/plain'
      })
      .expect(400);
  });

  // TC5: POST /upload 10MB+1 → multer limits reject (400 or 413)
  it('POST /upload: 10MB+1 초과 → 400 또는 413', async () => {
    const oversize = 10 * 1024 * 1024 + 1;
    const res = await request(app.getHttpServer())
      .post('/aideep/api/upload')
      .field('workspaceId', 'ws-uuid-1')
      .attach('file', Buffer.alloc(oversize), {
        filename: 'big.png',
        contentType: 'image/png'
      });

    expect([400, 413]).toContain(res.status);
  });

  // TC6: POST /upload/many 정상 2개 → 201, succeeded 배열
  it('POST /upload/many: 정상 2개 → 201, succeeded 배열', async () => {
    const res = await request(app.getHttpServer())
      .post('/aideep/api/upload/many')
      .field('workspaceId', 'ws-uuid-1')
      .attach('files', Buffer.alloc(1024), {
        filename: 'a.png',
        contentType: 'image/png'
      })
      .attach('files', Buffer.alloc(2048), {
        filename: 'b.png',
        contentType: 'image/png'
      })
      .expect(201);

    expect(res.body.resultType).toBe('SUCCESS');
    const data = res.body.success;
    expect(data).toHaveProperty('succeeded');
    expect(Array.isArray(data.succeeded)).toBe(true);
    expect(data).toHaveProperty('failed');
  });

  // TC7: POST /upload/many 11개 → multer 거부 (400 이상)
  it('POST /upload/many: 11개 → multer 거부 (400 이상)', async () => {
    const req = request(app.getHttpServer())
      .post('/aideep/api/upload/many')
      .field('workspaceId', 'ws-uuid-1');

    for (let i = 0; i < 11; i++) {
      req.attach('files', Buffer.alloc(512), {
        filename: `file${i}.png`,
        contentType: 'image/png'
      });
    }

    const res = await req;
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
