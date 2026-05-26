// Mock uuid before imports to avoid ESM parse error (uuid@13 is pure ESM)
jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid-5678') }));

// Shared mock send function - defined before jest.mock factory runs
const mockSend = jest.fn();

// Mock @aws-sdk/client-s3 entirely
jest.mock('@aws-sdk/client-s3', () => {
  const MockS3Client = jest.fn().mockImplementation(() => ({ send: mockSend }));
  const MockPutObjectCommand = jest.fn().mockImplementation((input) => ({
    _tag: 'PutObjectCommand',
    input
  }));
  const MockDeleteObjectCommand = jest.fn().mockImplementation((input) => ({
    _tag: 'DeleteObjectCommand',
    input
  }));
  return {
    S3Client: MockS3Client,
    PutObjectCommand: MockPutObjectCommand,
    DeleteObjectCommand: MockDeleteObjectCommand
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { S3Service } from './s3.service';

const ENV_MAP: Record<string, string> = {
  AWS_REGION: 'ap-northeast-2',
  AWS_S3_BUCKET: 'test-bucket',
  AWS_ACCESS_KEY_ID: 'test-access-key',
  AWS_SECRET_ACCESS_KEY: 'test-secret-key'
};

const mockConfigService = {
  getOrThrow: (key: string) => {
    if (ENV_MAP[key]) return ENV_MAP[key];
    throw new Error(`Missing env: ${key}`);
  }
};

function makeFile(
  originalname = 'photo.png',
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

describe('S3Service', () => {
  let service: S3Service;

  beforeEach(async () => {
    mockSend.mockReset();
    (S3Client as unknown as jest.Mock).mockClear();
    (PutObjectCommand as unknown as jest.Mock).mockClear();
    (DeleteObjectCommand as unknown as jest.Mock).mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3Service,
        { provide: ConfigService, useValue: mockConfigService }
      ]
    }).compile();

    service = module.get<S3Service>(S3Service);
  });

  // TC1: uploadFile 성공 → PutObjectCommand로 send 호출, key 포맷, 반환 필드 검증
  it('uploadFile: 성공 → PutObjectCommand send 호출, key 포맷 uploads/<uuid><ext>, 반환 필드 정상', async () => {
    mockSend.mockResolvedValue({});
    const file = makeFile('photo.jpg', 'image/jpeg', 2048);

    const result = await service.uploadFile(file);

    expect(PutObjectCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: 'test-bucket',
        Key: 'uploads/mock-uuid-5678.jpg',
        Body: file.buffer,
        ContentType: 'image/jpeg',
        ContentLength: 2048
      })
    );
    expect(mockSend).toHaveBeenCalledTimes(1);

    expect(result.key).toBe('uploads/mock-uuid-5678.jpg');
    expect(result.url).toBe(
      'https://test-bucket.s3.ap-northeast-2.amazonaws.com/uploads/mock-uuid-5678.jpg'
    );
    expect(result.originalName).toBe('photo.jpg');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.size).toBe(2048);
  });

  // TC2: uploadFile send reject → InternalServerErrorException
  it('uploadFile: send 실패 → InternalServerErrorException("파일 업로드에 실패했습니다.")', async () => {
    mockSend.mockRejectedValue(new Error('Network error'));
    const file = makeFile();

    await expect(service.uploadFile(file)).rejects.toThrow(
      new InternalServerErrorException('파일 업로드에 실패했습니다.')
    );
  });

  // TC3: deleteFile 성공 → DeleteObjectCommand로 send 호출
  it('deleteFile: 성공 → DeleteObjectCommand send 호출', async () => {
    mockSend.mockResolvedValue({});
    await service.deleteFile('uploads/some-key.png');

    expect(DeleteObjectCommand).toHaveBeenCalledWith({
      Bucket: 'test-bucket',
      Key: 'uploads/some-key.png'
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  // TC4: deleteFile send reject → InternalServerErrorException
  it('deleteFile: send 실패 → InternalServerErrorException("파일 삭제에 실패했습니다.")', async () => {
    mockSend.mockRejectedValue(new Error('S3 error'));

    await expect(service.deleteFile('uploads/some-key.png')).rejects.toThrow(
      new InternalServerErrorException('파일 삭제에 실패했습니다.')
    );
  });

  // TC5: getPublicUrl 포맷
  it('getPublicUrl: https://<bucket>.s3.<region>.amazonaws.com/<key> 형식 반환', () => {
    const url = service.getPublicUrl('uploads/test-key.png');
    expect(url).toBe(
      'https://test-bucket.s3.ap-northeast-2.amazonaws.com/uploads/test-key.png'
    );
  });
});
