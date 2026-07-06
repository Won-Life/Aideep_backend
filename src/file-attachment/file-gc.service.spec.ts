import { Test, TestingModule } from '@nestjs/testing';
import { FileGcService } from './file-gc.service';
import { FileAttachmentRepository } from './file-attachment.repository';
import { S3Service } from 'src/upload/s3.service';

const ORPHAN_FILE = { file_id: 'file-orphan', s3_key: 'uploads/orphan.png' };
const PENDING_FILE = { file_id: 'file-pending', s3_key: 'uploads/pending.png' };

describe('FileGcService', () => {
  let service: FileGcService;
  let repository: { [K: string]: jest.Mock };
  let s3Service: { deleteFile: jest.Mock };

  beforeEach(async () => {
    repository = {
      findStaleFiles: jest.fn(),
      markFilesDeleted: jest.fn()
    };
    s3Service = { deleteFile: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileGcService,
        { provide: FileAttachmentRepository, useValue: repository },
        { provide: S3Service, useValue: s3Service }
      ]
    }).compile();

    service = module.get<FileGcService>(FileGcService);
  });

  afterEach(() => jest.clearAllMocks());

  it('deletes expired ORPHAN and stale PENDING files from S3 and marks them DELETED', async () => {
    repository.findStaleFiles.mockResolvedValue([ORPHAN_FILE, PENDING_FILE]);
    s3Service.deleteFile.mockResolvedValue(undefined);

    await service.cleanupStaleFiles();

    expect(repository.findStaleFiles).toHaveBeenCalledWith(expect.any(Date));
    expect(s3Service.deleteFile).toHaveBeenCalledWith(ORPHAN_FILE.s3_key);
    expect(s3Service.deleteFile).toHaveBeenCalledWith(PENDING_FILE.s3_key);
    expect(repository.markFilesDeleted).toHaveBeenCalledWith([
      ORPHAN_FILE.file_id,
      PENDING_FILE.file_id
    ]);
  });

  it('marks only successfully deleted files as DELETED when some S3 deletions fail', async () => {
    repository.findStaleFiles.mockResolvedValue([ORPHAN_FILE, PENDING_FILE]);
    s3Service.deleteFile
      .mockRejectedValueOnce(new Error('S3 error'))
      .mockResolvedValueOnce(undefined);

    await service.cleanupStaleFiles();

    expect(repository.markFilesDeleted).toHaveBeenCalledWith([
      PENDING_FILE.file_id
    ]);
  });

  it('does nothing when there are no stale files', async () => {
    repository.findStaleFiles.mockResolvedValue([]);

    await service.cleanupStaleFiles();

    expect(s3Service.deleteFile).not.toHaveBeenCalled();
    expect(repository.markFilesDeleted).not.toHaveBeenCalled();
  });
});
