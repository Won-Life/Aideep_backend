import { Test, TestingModule } from '@nestjs/testing';
import { WorkspaceService } from './workspace.service';
import { WorkspaceRepository } from './workspace.repository';
import { NodeRepository } from '../node/node.repository';
import { RedisService } from '../redis/redis.service';

describe('WorkspaceService', () => {
  let service: WorkspaceService;

  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceService,
        {
          provide: WorkspaceRepository,
          useValue: {
            selectUserWorkspace: jest.fn(),
            insertWorkspace: jest.fn(),
            insertWorkspaceUser: jest.fn(),
            checkWorkspace: jest.fn(),
          },
        },
        {
          provide: NodeRepository,
          useValue: {
            selectAllNode: jest.fn(),
            selectAllEdge: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: { getClient: jest.fn().mockReturnValue(mockRedisClient) },
        },
      ],
    }).compile();

    service = module.get<WorkspaceService>(WorkspaceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
