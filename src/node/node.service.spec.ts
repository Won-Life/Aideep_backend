import { Test, TestingModule } from '@nestjs/testing';
import { NodeService } from './node.service';
import { NodeRepository } from './node.repository';
import { WorkspaceRepository } from '../workspace/workspace.repository';
import { EdgeRepository } from '../edge/edge.repository';
import { WsGateway } from '../ws/ws.gateway';
import { RedisService } from '../redis/redis.service';

const MOCK_NODE_ID = '550e8400-e29b-41d4-a716-446655440000';
const MOCK_WORKSPACE_ID = 'ws-uuid-5678';
const MOCK_USER_ID = 'user-uuid-1234';

const mockInsertResult = {
  node_id: MOCK_NODE_ID,
  workspace_id: MOCK_WORKSPACE_ID,
  title: 'Test Node',
  node_type: 'PROJECT',
  position_x: 100,
  position_y: 200,
  content: { dataType: 'PROJECT', color: '#ffffff', textColor: '#000000' },
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
  deleted_at: null,
  version: 1
};

describe('NodeService', () => {
  let service: NodeService;
  let nodeRepository: { [K: string]: jest.Mock };
  let workspaceRepository: { [K: string]: jest.Mock };
  let edgeRepository: { [K: string]: jest.Mock };
  let wsGateway: { broadcast: jest.Mock };

  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn()
  };

  beforeEach(async () => {
    nodeRepository = {
      insertNode: jest.fn(),
      selectNodeById: jest.fn(),
      selectNodesByIds: jest.fn(),
      selectAllNode: jest.fn(),
      selectAllEdge: jest.fn(),
      selectAllDescendantIds: jest.fn(),
      updateNode: jest.fn(),
      updateNodePositionDelta: jest.fn(),
      deleteNode: jest.fn()
    };
    workspaceRepository = {
      checkWorkspace: jest.fn(),
      selectUserWorkspace: jest.fn()
    };
    edgeRepository = {
      deleteEdgesByNodeId: jest.fn()
    };
    wsGateway = { broadcast: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NodeService,
        { provide: NodeRepository, useValue: nodeRepository },
        { provide: WorkspaceRepository, useValue: workspaceRepository },
        { provide: EdgeRepository, useValue: edgeRepository },
        { provide: WsGateway, useValue: wsGateway },
        {
          provide: RedisService,
          useValue: { getClient: jest.fn().mockReturnValue(mockRedisClient) }
        }
      ]
    }).compile();

    service = module.get<NodeService>(NodeService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createProjectNode', () => {
    const projectNode = {
      userId: MOCK_USER_ID,
      workspaceId: MOCK_WORKSPACE_ID,
      title: 'Test Node',
      nodeType: 'PROJECT' as const,
      position: { x: 100, y: 200 },
      data: {
        dataType: 'PROJECT' as const,
        color: '#ffffff',
        textColor: '#000000'
      }
    };

    beforeEach(() => {
      workspaceRepository.checkWorkspace.mockResolvedValue({ role: 'OWNER' });
      nodeRepository.insertNode.mockResolvedValue(mockInsertResult);
    });

    it('should return the created node payload', async () => {
      const result = await service.createProjectNode(projectNode as any);

      expect(result).toEqual(
        expect.objectContaining({
          nodeId: MOCK_NODE_ID,
          title: 'Test Node',
          nodeType: 'PROJECT',
          position: { x: 100, y: 200 }
        })
      );
    });

    it('should broadcast NODE_CREATE event via WsGateway', async () => {
      await service.createProjectNode(projectNode as any);

      expect(wsGateway.broadcast).toHaveBeenCalledTimes(1);
      expect(wsGateway.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'NODE_CREATE',
          workspaceId: MOCK_WORKSPACE_ID,
          userId: MOCK_USER_ID,
          node: expect.objectContaining({ nodeId: MOCK_NODE_ID })
        })
      );
    });

    it('should invalidate Redis workspace cache', async () => {
      await service.createProjectNode(projectNode as any);

      expect(mockRedisClient.del).toHaveBeenCalledTimes(1);
    });
  });

  describe('createMarkdownNode', () => {
    const mdInsertResult = {
      ...mockInsertResult,
      node_type: 'DATA',
      content: {
        dataType: 'MARKDOWN',
        markdownBody: '# Hello',
        jsonBody: '{}',
        color: '#ffffff',
        textColor: '#000000'
      }
    };

    const mdNode = {
      userId: MOCK_USER_ID,
      workspaceId: MOCK_WORKSPACE_ID,
      title: 'MD Node',
      nodeType: 'DATA' as const,
      position: { x: 50, y: 75 },
      data: {
        dataType: 'MARKDOWN' as const,
        markdownBody: '# Hello',
        jsonBody: '{}',
        color: '#ffffff',
        textColor: '#000000'
      }
    };

    beforeEach(() => {
      workspaceRepository.checkWorkspace.mockResolvedValue({ role: 'EDITOR' });
      nodeRepository.insertNode.mockResolvedValue(mdInsertResult);
    });

    it('should return the created node payload', async () => {
      const result = await service.createMarkdownNode(mdNode as any);

      expect(result).toEqual(
        expect.objectContaining({
          nodeId: MOCK_NODE_ID,
          nodeType: 'DATA'
        })
      );
    });

    it('should broadcast NODE_CREATE event via WsGateway', async () => {
      await service.createMarkdownNode(mdNode as any);

      expect(wsGateway.broadcast).toHaveBeenCalledTimes(1);
      expect(wsGateway.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'NODE_CREATE',
          workspaceId: MOCK_WORKSPACE_ID,
          userId: MOCK_USER_ID
        })
      );
    });
  });
});
