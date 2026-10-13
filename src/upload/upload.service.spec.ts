// Mock uuid before imports to avoid ESM parse error (uuid@13 is pure ESM)
jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid-1234') }));

// Mock multer with virtual:true since it's not directly resolvable (pnpm hoist=false)
jest.mock('multer', () => {
  const memoryStorage = jest.fn(() => ({}));
  const multer = jest.fn(() => ({}));
  (multer as any).memoryStorage = memoryStorage;
  return { __esModule: false, default: multer, memoryStorage };
}, { virtual: true });

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UploadService } from './upload.service';
import { S3Service } from './s3.service';
import { WorkspaceService } from 'src/workspace/workspace.service';
import { UploadRepository } from './upload.repository';

const mockS3Service = {
  uploadFile: jest.fn(),
  deleteFile: jest.fn()
};

const mockWorkspaceService = {
  checkExist: jest.fn()
};

const mockUploadRepository = {
  uploadFile: jest.fn()
};

function makeFile(
  originalname = 'test.png',
  mimetype = 'image/png',
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

const ownerMembership = {
  user_id: 'user-1',
  workspace_id: 'ws-1',
  deleted_at: null,
  role: 'OWNER'
};

const viewerMembership = { ...ownerMembership, role: 'VIEWER' };

const s3Result = {
  key: 'uploads/mock-uuid-1234.png',
  url: 'https://bucket.s3.region.amazonaws.com/uploads/mock-uuid-1234.png',
  originalName: 'test.png',
  mimeType: 'image/png',
  size: 1024
};

const dbRecord = {
  file_id: 'file-uuid-1',
  file_url: s3Result.url,
  mime_type: 'image/png',
  size: 1024,
  owner_user_id: 'user-1',
  workspace_id: 'ws-1',
  created_at: new Date()
};

describe('UploadService', () => {
  let service: UploadService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        { provide: S3Service, useValue: mockS3Service },
        { provide: WorkspaceService, useValue: mockWorkspaceService },
        { provide: UploadRepository, useValue: mockUploadRepository }
      ]
    }).compile();

    service = module.get<UploadService>(UploadService);
  });

  // TC1: 멤버십 없음 → checkExist 의 404 를 그대로 전파하고 S3 는 건드리지 않는다
  it('uploadOne: 멤버십 없음 → NotFoundException 전파, S3 업로드 안 함', async () => {
    mockWorkspaceService.checkExist.mockRejectedValue(
      new NotFoundException('해당 유저의 워크스페이스가 존재하지 않습니다.')
    );

    await expect(
      service.uploadOne(makeFile(), 'ws-1', 'user-1')
    ).rejects.toThrow(NotFoundException);

    expect(mockS3Service.uploadFile).not.toHaveBeenCalled();
  });

  // TC2: VIEWER → 403 (400 이 아니다), 업로드 자체가 일어나지 않는다
  it('uploadOne: VIEWER → ForbiddenException, S3·DB 모두 호출 안 함', async () => {
    mockWorkspaceService.checkExist.mockResolvedValue(viewerMembership);

    await expect(
      service.uploadOne(makeFile(), 'ws-1', 'user-1')
    ).rejects.toThrow(ForbiddenException);

    expect(mockS3Service.uploadFile).not.toHaveBeenCalled();
    expect(mockUploadRepository.uploadFile).not.toHaveBeenCalled();
  });

  // TC3: 정상 업로드
  it('uploadOne: 정상 → S3 업로드 + DB 저장, UploadResponseDto 반환', async () => {
    mockWorkspaceService.checkExist.mockResolvedValue(ownerMembership);
    mockS3Service.uploadFile.mockResolvedValue(s3Result);
    mockUploadRepository.uploadFile.mockResolvedValue(dbRecord);

    const file = makeFile();
    const result = await service.uploadOne(file, 'ws-1', 'user-1');

    expect(mockS3Service.uploadFile).toHaveBeenCalledWith(file);
    expect(mockUploadRepository.uploadFile).toHaveBeenCalledWith(
      s3Result,
      'user-1',
      'ws-1'
    );
    expect(result).toMatchObject({
      fileId: dbRecord.file_id,
      fileUrl: dbRecord.file_url,
      mimeType: dbRecord.mime_type,
      size: dbRecord.size,
      originalName: s3Result.originalName,
      createdAt: dbRecord.created_at
    });
  });

  // TC4: DB 저장 실패 → 보상 삭제 후 원 에러를 그대로 전파
  it('uploadOne: DB 저장 실패 → s3.deleteFile 보상 호출 후 원 에러 전파', async () => {
    mockWorkspaceService.checkExist.mockResolvedValue(ownerMembership);
    mockS3Service.uploadFile.mockResolvedValue(s3Result);
    const dbError = new Error('DB error');
    mockUploadRepository.uploadFile.mockRejectedValue(dbError);
    mockS3Service.deleteFile.mockResolvedValue(undefined);

    await expect(
      service.uploadOne(makeFile(), 'ws-1', 'user-1')
    ).rejects.toThrow(dbError);

    expect(mockS3Service.deleteFile).toHaveBeenCalledWith(s3Result.key);
  });

  // TC5: 보상 삭제까지 실패해도 원 에러가 전파된다 (보상 실패는 로그만)
  it('uploadOne: 보상 삭제 실패는 삼키고 원 에러를 전파한다', async () => {
    mockWorkspaceService.checkExist.mockResolvedValue(ownerMembership);
    mockS3Service.uploadFile.mockResolvedValue(s3Result);
    const dbError = new Error('DB error');
    mockUploadRepository.uploadFile.mockRejectedValue(dbError);
    mockS3Service.deleteFile.mockRejectedValue(new Error('S3 delete failed'));

    await expect(
      service.uploadOne(makeFile(), 'ws-1', 'user-1')
    ).rejects.toThrow(dbError);
  });
});
