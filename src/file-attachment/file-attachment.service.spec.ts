import { Test, TestingModule } from '@nestjs/testing';
import { FileAttachmentService } from './file-attachment.service';
import { FileAttachmentRepository } from './file-attachment.repository';
import { S3Service } from 'src/upload/s3.service';

const BUCKET_URL = 'https://test-bucket.s3.ap-northeast-2.amazonaws.com/';
const NODE_ID = 'node-uuid-1';
const WORKSPACE_ID = 'ws-uuid-1';
const FILE_A = 'file-uuid-a';
const FILE_B = 'file-uuid-b';

describe('FileAttachmentService', () => {
  let service: FileAttachmentService;
  let repository: { [K: string]: jest.Mock };

  beforeEach(async () => {
    repository = {
      findFileIdsByS3Keys: jest.fn(),
      findAttachedFileIdsByNodeId: jest.fn(),
      createAttachments: jest.fn(),
      deleteAttachments: jest.fn(),
      countAttachmentsByFileIds: jest.fn(),
      markFilesActive: jest.fn(),
      markFilesOrphan: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileAttachmentService,
        { provide: FileAttachmentRepository, useValue: repository },
        {
          provide: S3Service,
          useValue: {
            getPublicUrl: (key: string) => `${BUCKET_URL}${key}`,
            extractKeyFromUrl: (url: string) => url.slice(BUCKET_URL.length)
          }
        }
      ]
    }).compile();

    service = module.get<FileAttachmentService>(FileAttachmentService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('extractReferencedFileIds', () => {
    it('extracts s3 keys from content and resolves file ids within the workspace', async () => {
      const content = {
        markdownBody: `![img](${BUCKET_URL}uploads/abc.png) and ![img2](${BUCKET_URL}uploads/def.jpg)`
      };
      repository.findFileIdsByS3Keys.mockResolvedValue([FILE_A, FILE_B]);

      const result = await service.extractReferencedFileIds(
        content,
        WORKSPACE_ID
      );

      expect(repository.findFileIdsByS3Keys).toHaveBeenCalledWith(
        ['uploads/abc.png', 'uploads/def.jpg'],
        WORKSPACE_ID
      );
      expect(result).toEqual([FILE_A, FILE_B]);
    });

    it('returns empty array without querying when content has no bucket URL', async () => {
      const result = await service.extractReferencedFileIds(
        { markdownBody: 'no images here' },
        WORKSPACE_ID
      );

      expect(result).toEqual([]);
      expect(repository.findFileIdsByS3Keys).not.toHaveBeenCalled();
    });

    it('returns empty array for null content', async () => {
      const result = await service.extractReferencedFileIds(null, WORKSPACE_ID);
      expect(result).toEqual([]);
    });

    it('deduplicates repeated URLs', async () => {
      const url = `${BUCKET_URL}uploads/abc.png`;
      repository.findFileIdsByS3Keys.mockResolvedValue([FILE_A]);

      await service.extractReferencedFileIds(
        { markdownBody: `![a](${url}) ![b](${url})` },
        WORKSPACE_ID
      );

      expect(repository.findFileIdsByS3Keys).toHaveBeenCalledWith(
        ['uploads/abc.png'],
        WORKSPACE_ID
      );
    });
  });

  describe('syncNodeAttachments', () => {
    it('attaches newly referenced files and marks them ACTIVE', async () => {
      repository.findFileIdsByS3Keys.mockResolvedValue([FILE_A]);
      repository.findAttachedFileIdsByNodeId.mockResolvedValue([]);

      await service.syncNodeAttachments(NODE_ID, WORKSPACE_ID, {
        markdownBody: `![img](${BUCKET_URL}uploads/abc.png)`
      });

      expect(repository.createAttachments).toHaveBeenCalledWith(NODE_ID, [
        FILE_A
      ]);
      expect(repository.markFilesActive).toHaveBeenCalledWith([FILE_A]);
      expect(repository.deleteAttachments).not.toHaveBeenCalled();
    });

    it('detaches removed files and marks unreferenced ones ORPHAN', async () => {
      repository.findAttachedFileIdsByNodeId.mockResolvedValue([FILE_A]);
      repository.countAttachmentsByFileIds.mockResolvedValue(new Map());

      await service.syncNodeAttachments(NODE_ID, WORKSPACE_ID, {
        markdownBody: 'image removed'
      });

      expect(repository.deleteAttachments).toHaveBeenCalledWith(NODE_ID, [
        FILE_A
      ]);
      expect(repository.markFilesOrphan).toHaveBeenCalledWith([FILE_A]);
      expect(repository.createAttachments).not.toHaveBeenCalled();
    });

    it('does not orphan a file still referenced by another node', async () => {
      repository.findAttachedFileIdsByNodeId.mockResolvedValue([FILE_A]);
      repository.countAttachmentsByFileIds.mockResolvedValue(
        new Map([[FILE_A, 1]])
      );

      await service.syncNodeAttachments(NODE_ID, WORKSPACE_ID, {
        markdownBody: 'image removed'
      });

      expect(repository.deleteAttachments).toHaveBeenCalledWith(NODE_ID, [
        FILE_A
      ]);
      expect(repository.markFilesOrphan).not.toHaveBeenCalled();
    });

    it('does nothing when references are unchanged', async () => {
      repository.findFileIdsByS3Keys.mockResolvedValue([FILE_A]);
      repository.findAttachedFileIdsByNodeId.mockResolvedValue([FILE_A]);

      await service.syncNodeAttachments(NODE_ID, WORKSPACE_ID, {
        markdownBody: `![img](${BUCKET_URL}uploads/abc.png)`
      });

      expect(repository.createAttachments).not.toHaveBeenCalled();
      expect(repository.deleteAttachments).not.toHaveBeenCalled();
      expect(repository.markFilesActive).not.toHaveBeenCalled();
      expect(repository.markFilesOrphan).not.toHaveBeenCalled();
    });
  });

  describe('releaseNodeAttachments', () => {
    it('does nothing when the node has no attachments', async () => {
      repository.findAttachedFileIdsByNodeId.mockResolvedValue([]);

      await service.releaseNodeAttachments(NODE_ID);

      expect(repository.deleteAttachments).not.toHaveBeenCalled();
      expect(repository.markFilesOrphan).not.toHaveBeenCalled();
    });

    it('deletes attachments and orphans files with no remaining references', async () => {
      repository.findAttachedFileIdsByNodeId.mockResolvedValue([
        FILE_A,
        FILE_B
      ]);
      repository.countAttachmentsByFileIds.mockResolvedValue(
        new Map([[FILE_B, 1]])
      );

      await service.releaseNodeAttachments(NODE_ID);

      expect(repository.deleteAttachments).toHaveBeenCalledWith(NODE_ID, [
        FILE_A,
        FILE_B
      ]);
      expect(repository.markFilesOrphan).toHaveBeenCalledWith([FILE_A]);
    });
  });
});
