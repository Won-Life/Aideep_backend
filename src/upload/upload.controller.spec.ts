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
  uploadOne: jest.fn()
};

// workspaceId 는 UploadRequestDto 의 @IsUUID 대상이므로 실제 UUID 를 쓴다
const WORKSPACE_ID = '422e16a9-fc48-4c0f-b2fc-1d8b94e2792a';

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

  // TC1: 정상 단일 업로드 — body DTO 의 workspaceId 를 서비스로 전달한다
  it('uploadOne: 정상 파일 → service.uploadOne 호출 후 응답 반환', async () => {
    mockUploadService.uploadOne.mockResolvedValue(mockUploadResponseDto);
    const file = makeFile();

    const result = await controller.uploadOne(
      file,
      { workspaceId: WORKSPACE_ID },
      fakeReq
    );

    expect(mockUploadService.uploadOne).toHaveBeenCalledWith(
      file,
      WORKSPACE_ID,
      'user-1'
    );
    expect(result).toEqual(mockUploadResponseDto);
  });

  // TC2: 파일 없음
  it('uploadOne: 파일 없음 → BadRequestException("파일이 없습니다.")', async () => {
    await expect(
      controller.uploadOne(
        undefined as any,
        { workspaceId: WORKSPACE_ID },
        fakeReq
      )
    ).rejects.toThrow(new BadRequestException('파일이 없습니다.'));
    expect(mockUploadService.uploadOne).not.toHaveBeenCalled();
  });

  // TC3: 거부 MIME
  it('uploadOne: 거부 MIME(text/plain) → BadRequestException(허용 목록 포함)', async () => {
    const file = makeFile('text/plain', 'file.txt');
    let caughtError: any;
    try {
      await controller.uploadOne(file, { workspaceId: WORKSPACE_ID }, fakeReq);
    } catch (e) {
      caughtError = e;
    }
    expect(caughtError).toBeInstanceOf(BadRequestException);
    expect(caughtError.message).toContain(ALLOWED_MIME_TYPES[0]);
    expect(mockUploadService.uploadOne).not.toHaveBeenCalled();
  });

  // TC4: workspaceId 검증은 ValidationPipe(@IsUUID) 담당이라 컨트롤러 유닛 테스트 범위가 아니다.
  //      여기서는 JWT 에 user_id 가 없을 때 컨트롤러가 임의로 막지 않고
  //      서비스(멤버십 검증)로 위임하는지만 고정한다.
  it('uploadOne: req.user 없음 → userId undefined 로 서비스에 위임', async () => {
    mockUploadService.uploadOne.mockResolvedValue(mockUploadResponseDto);
    const file = makeFile();

    await controller.uploadOne(file, { workspaceId: WORKSPACE_ID }, {} as any);

    expect(mockUploadService.uploadOne).toHaveBeenCalledWith(
      file,
      WORKSPACE_ID,
      undefined
    );
  });
});
