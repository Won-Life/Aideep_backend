import { Test, TestingModule } from '@nestjs/testing';
import { NodeService } from './node.service';
import { NodeRepository } from './node.repository';
import { WorkspaceRepository } from '../workspace/workspace.repository';
import { WsGateway } from '../ws/ws.gateway';
import { RedisService } from '../redis/redis.service';

describe('NodeService', () => {
  let service: NodeService;

  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NodeService,
        {
          provide: NodeRepository,
          useValue: {
            insertNode: jest.fn(),
            selectNodeById: jest.fn(),
            selectAllNode: jest.fn(),
            selectAllEdge: jest.fn(),
            selectAllDescendantIds: jest.fn(),
            updateNode: jest.fn(),
            updateNodePositionDelta: jest.fn(),
          },
        },
        {
          provide: WorkspaceRepository,
          useValue: {
            checkWorkspace: jest.fn(),
            selectUserWorkspace: jest.fn(),
          },
        },
        {
          provide: WsGateway,
          useValue: {
            broadcast: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: { getClient: jest.fn().mockReturnValue(mockRedisClient) },
        },
      ],
    }).compile();

    service = module.get<NodeService>(NodeService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
