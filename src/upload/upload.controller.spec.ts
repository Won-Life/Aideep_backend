// Mock uuid before any imports to avoid ESM parse error (uuid@13 is pure ESM)
jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid-ctrl') }));

// Mock multer with virtual:true since it's not directly resolvable (pnpm hoist=false)
jest.mock('multer', () => {
  const memoryStorage = jest.fn(() => ({}));
  const multer = jest.fn(() => ({ any: jest.fn() }));
  (multer as any).memoryStorage = memoryStorage;
  return { __esModule: false, default: multer, memoryStorage };
}, { virtual: true });

// Mock @aws-sdk/client-s3 to avoid transitive issues
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: jest.fn() })),
  PutObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn()
}));

// Mock @nestjs/platform-express to avoid pulling in real multer
jest.mock('@nestjs/platform-express', () => {
  const actual = jest.requireActual('@nestjs/platform-express');
  return {
    ...actual,
    FileInterceptor: () => {
      return class MockFileInterceptor {
        intercept(_ctx: any, next: any) {
          return next.handle();
        }
      };
    },
    FilesInterceptor: () => {
      return class MockFilesInterceptor {
        intercept(_ctx: any, next: any) {
          return next.handle();
        }
      };
    }
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt.guard';
import { ALLOWED_MIME_TYPES } from './constant/upload.constant';

const mockUploadService = {
  uploadOne: jest.fn(),
  uploadMany: jest.fn()
};

const mockUploadResponseDto = {
  fileId: 'file-uuid-1',
  fileUrl: 'https://bucket.s3.region.amazonaws.com/uploads/uuid.png',
  mimeType: 'image/png',
  size: 1024,
  originalName: 'test.png',
  createdAt: new Date()
};

function makeFile(
  mimetype = 'image/png',
  originalname = 'test.png',
  size = 1024
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname,
    encoding: '7bit',
    mimetype,
    buffer: Buffer.alloc(size),
    size,
    stream: null as any,
    destination: '',
    filename: '',
    path: ''
  };
}

describe('UploadController', () => {
  let controller: UploadController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadController],
      providers: [{ provide: UploadService, useValue: mockUploadService }]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UploadController>(UploadController);
  });

  const fakeReq = { user: { user_id: 'user-1' } };

  // TC1: 정상 단일 업로드
  it('uploadOne: 정상 파일 → service.uploadOne 호출 후 응답 반환', async () => {
    mockUploadService.uploadOne.mockResolvedValue(mockUploadResponseDto);
    const file = makeFile();
    const result = await controller.uploadOne(file, 'ws-uuid-1', fakeReq);
    expect(mockUploadService.uploadOne).toHaveBeenCalledWith(
      file,
      'ws-uuid-1',
      'user-1'
    );
    expect(result).toEqual(mockUploadResponseDto);
  });

  // TC2: 파일 없음
  it('uploadOne: 파일 없음 → BadRequestException("파일이 없습니다.")', async () => {
    await expect(
      controller.uploadOne(undefined as any, 'ws-uuid-1', fakeReq)
    ).rejects.toThrow(new BadRequestException('파일이 없습니다.'));
  });

  // TC3: 거부 MIME
  it('uploadOne: 거부 MIME(text/plain) → BadRequestException(허용 목록 포함)', async () => {
    const file = makeFile('text/plain', 'file.txt');
    let caughtError: any;
    try {
      await controller.uploadOne(file, 'ws-uuid-1', fakeReq);
    } catch (e) {
      caughtError = e;
    }
    expect(caughtError).toBeInstanceOf(BadRequestException);
    expect(caughtError.message).toContain(ALLOWED_MIME_TYPES[0]);
  });

  // TC4: workspaceId 누락
  it('uploadOne: workspaceId 누락 → BadRequestException("workspaceId가 필요합니다.")', async () => {
    const file = makeFile();
    await expect(
      controller.uploadOne(file, '' as any, fakeReq)
    ).rejects.toThrow(new BadRequestException('workspaceId가 필요합니다.'));
  });

  // TC5: 다중 업로드 정상
  it('uploadMany: 정상 파일 배열 → service.uploadMany 호출, 응답 반환', async () => {
    const mockManyResponse = {
      succeeded: [mockUploadResponseDto, mockUploadResponseDto],
      failed: []
    };
    mockUploadService.uploadMany.mockResolvedValue(mockManyResponse);
    const files = [makeFile(), makeFile('image/jpeg', 'photo.jpg')];
    const result = await controller.uploadMany(files, 'ws-uuid-1', fakeReq);
    expect(mockUploadService.uploadMany).toHaveBeenCalledWith(
      files,
      'ws-uuid-1',
      'user-1'
    );
    expect(result).toEqual(mockManyResponse);
  });

  // TC6: 다중 업로드 빈 배열
  it('uploadMany: 빈 파일 배열 → BadRequestException("파일이 없습니다.")', async () => {
    await expect(
      controller.uploadMany([], 'ws-uuid-1', fakeReq)
    ).rejects.toThrow(new BadRequestException('파일이 없습니다.'));
  });

  // TC7: 다중 업로드 중 거부 MIME
  it('uploadMany: 중 한 파일이 거부 MIME → BadRequestException', async () => {
    const files = [makeFile(), makeFile('text/plain', 'bad.txt')];
    await expect(
      controller.uploadMany(files, 'ws-uuid-1', fakeReq)
    ).rejects.toThrow(BadRequestException);
  });
});
