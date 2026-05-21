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
import {
  ForbiddenException,
  InternalServerErrorException
} from '@nestjs/common';
import { UploadService } from './upload.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { S3Service } from './s3.service';

const mockFindUnique = jest.fn();
const mockFilesCreate = jest.fn();

const mockPrismaService = {
  client: {
    users_workspaces: { findUnique: mockFindUnique },
    files: { create: mockFilesCreate }
  }
};

const mockS3Service = {
  uploadFile: jest.fn(),
  deleteFile: jest.fn()
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

const activeMembership = {
  user_id: 'user-1',
  workspace_id: 'ws-1',
  deleted_at: null,
  role: 'OWNER'
};

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
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: S3Service, useValue: mockS3Service }
      ]
    }).compile();

    service = module.get<UploadService>(UploadService);
  });

  // TC1: 멤버십 없음
  it('uploadOne: 멤버십 null → ForbiddenException', async () => {
    mockFindUnique.mockResolvedValue(null);
    await expect(
      service.uploadOne(makeFile(), 'ws-1', 'user-1')
    ).rejects.toThrow(ForbiddenException);
  });

  // TC2: 멤버십 soft-deleted
  it('uploadOne: 멤버십 deleted_at != null → ForbiddenException', async () => {
    mockFindUnique.mockResolvedValue({
      ...activeMembership,
      deleted_at: new Date()
    });
    await expect(
      service.uploadOne(makeFile(), 'ws-1', 'user-1')
    ).rejects.toThrow(ForbiddenException);
  });

  // TC3: 정상 업로드
  it('uploadOne: 정상 → S3 uploadFile + files.create 호출, UploadResponseDto 반환', async () => {
    mockFindUnique.mockResolvedValue(activeMembership);
    mockS3Service.uploadFile.mockResolvedValue(s3Result);
    mockFilesCreate.mockResolvedValue(dbRecord);

    const result = await service.uploadOne(makeFile(), 'ws-1', 'user-1');

    expect(mockS3Service.uploadFile).toHaveBeenCalledTimes(1);
    expect(mockFilesCreate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      fileId: dbRecord.file_id,
      fileUrl: dbRecord.file_url,
      mimeType: dbRecord.mime_type,
      size: dbRecord.size,
      originalName: s3Result.originalName,
      createdAt: dbRecord.created_at
    });
  });

  // TC4: DB create 실패 → 보상 deleteFile 호출 후 InternalServerErrorException
  it('uploadOne: DB create 실패 → s3.deleteFile 호출 후 InternalServerErrorException', async () => {
    mockFindUnique.mockResolvedValue(activeMembership);
    mockS3Service.uploadFile.mockResolvedValue(s3Result);
    mockFilesCreate.mockRejectedValue(new Error('DB error'));
    mockS3Service.deleteFile.mockResolvedValue(undefined);

    await expect(
      service.uploadOne(makeFile(), 'ws-1', 'user-1')
    ).rejects.toThrow(InternalServerErrorException);

    expect(mockS3Service.deleteFile).toHaveBeenCalledWith(s3Result.key);
  });

  // TC5: DB 실패 + S3 보상 삭제도 실패 → 그래도 InternalServerErrorException
  it('uploadOne: DB 실패 + 보상 S3 삭제 실패 → InternalServerErrorException (보상 실패 swallow)', async () => {
    mockFindUnique.mockResolvedValue(activeMembership);
    mockS3Service.uploadFile.mockResolvedValue(s3Result);
    mockFilesCreate.mockRejectedValue(new Error('DB error'));
    mockS3Service.deleteFile.mockRejectedValue(new Error('S3 delete failed'));

    await expect(
      service.uploadOne(makeFile(), 'ws-1', 'user-1')
    ).rejects.toThrow(InternalServerErrorException);
  });

  // TC6: uploadMany partial failure
  it('uploadMany: 3개 중 2번째 reject → succeeded.length===2, failed.length===1, failed[0].index===1', async () => {
    // uploadMany calls findUnique once, then uploadOne for each file (which also calls findUnique)
    mockFindUnique
      .mockResolvedValueOnce(activeMembership) // uploadMany's own membership check
      .mockResolvedValue(activeMembership);    // each uploadOne's membership check

    mockS3Service.uploadFile
      .mockResolvedValueOnce({ ...s3Result, originalName: 'a.png', key: 'uploads/a.png' })
      .mockRejectedValueOnce(new InternalServerErrorException('파일 업로드에 실패했습니다.'))
      .mockResolvedValueOnce({ ...s3Result, originalName: 'c.png', key: 'uploads/c.png' });

    mockFilesCreate
      .mockResolvedValueOnce({ ...dbRecord, file_id: 'fid-1' })
      .mockResolvedValueOnce({ ...dbRecord, file_id: 'fid-3' });

    mockS3Service.deleteFile.mockResolvedValue(undefined);

    const files = [
      makeFile('a.png'),
      makeFile('b.png'),
      makeFile('c.png')
    ];

    const result = await service.uploadMany(files, 'ws-1', 'user-1');

    expect(result.succeeded).toHaveLength(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].index).toBe(1);
  });

  // TC7: uploadMany 멤버십 없음 → ForbiddenException, uploadOne 내부 s3 호출 없음
  it('uploadMany: 멤버십 없음 → ForbiddenException, s3.uploadFile 호출 안 됨', async () => {
    mockFindUnique.mockResolvedValue(null);

    const files = [makeFile(), makeFile('b.png')];

    await expect(
      service.uploadMany(files, 'ws-1', 'user-1')
    ).rejects.toThrow(ForbiddenException);

    expect(mockS3Service.uploadFile).not.toHaveBeenCalled();
  });
});
