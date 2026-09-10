import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NodeService } from './node.service';
import { NodeRepository } from './node.repository';
import { WorkspaceRepository } from '../workspace/workspace.repository';
import { EdgeRepository } from '../edge/edge.repository';
import { EventBusPublisher } from '../event-bus/event-bus.publisher';
import { RedisService } from '../redis/redis.service';
import { FileAttachmentService } from '../file-attachment/file-attachment.service';
import { setTransactionRunner } from '../prisma/transaction.storage';
import { EmbedQueueService } from '../redis/embed-queue.service';

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
  let wsGateway: { broadcast: jest.Mock; broadcastYjsUpdate: jest.Mock };
  let fileAttachmentService: { [K: string]: jest.Mock };

  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn()
  };
  const embedQueueService = { enqueueEmbedJob: jest.fn() };

  beforeAll(() => {
    // @Transactional() 데코레이터가 사용하는 러너를 pass-through로 설정
    setTransactionRunner((fn) => fn());
  });

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
    wsGateway = { broadcast: jest.fn(), broadcastYjsUpdate: jest.fn() };
    fileAttachmentService = {
      syncNodeAttachments: jest.fn(),
      releaseNodeAttachments: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NodeService,
        { provide: NodeRepository, useValue: nodeRepository },
        { provide: WorkspaceRepository, useValue: workspaceRepository },
        { provide: EdgeRepository, useValue: edgeRepository },
        { provide: EventBusPublisher, useValue: wsGateway },
        { provide: FileAttachmentService, useValue: fileAttachmentService },
        {
          provide: RedisService,
          useValue: { getClient: jest.fn().mockReturnValue(mockRedisClient) }
        },
        { provide: EmbedQueueService, useValue: embedQueueService }
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

    it('should broadcast NODE_CREATE event via EventBusPublisher', async () => {
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

    it('should not enqueue an embed job (PROJECT nodes are not embedding targets)', async () => {
      await service.createProjectNode(projectNode as any);

      expect(embedQueueService.enqueueEmbedJob).not.toHaveBeenCalled();
    });
  });

  describe('updateNodeMeta', () => {
    const existingNode = {
      node_id: MOCK_NODE_ID,
      workspace_id: MOCK_WORKSPACE_ID,
      title: 'Old Title',
      node_type: 'DATA',
      content: { color: '#ffffff', textColor: '#000000' },
      version: 1,
      created_at: new Date('2026-01-01'),
      updated_at: new Date('2026-01-01'),
      deleted_at: null,
      position_x: 100,
      position_y: 200,
      depth: 0
    };

    beforeEach(() => {
      workspaceRepository.checkWorkspace.mockResolvedValue({ role: 'OWNER' });
      nodeRepository.selectNodeById.mockResolvedValue(existingNode);
      nodeRepository.updateNode.mockResolvedValue(existingNode);
    });

    it('should persist nodeType and include it in the patch/response', async () => {
      const result = await service.updateNodeMeta(
        MOCK_USER_ID,
        MOCK_NODE_ID,
        MOCK_WORKSPACE_ID,
        { nodeType: 'PROJECT' } as any
      );

      expect(nodeRepository.updateNode).toHaveBeenCalledWith(
        MOCK_WORKSPACE_ID,
        MOCK_NODE_ID,
        expect.objectContaining({ nodeType: 'PROJECT' })
      );
      expect(result.patch).toEqual(
        expect.objectContaining({ nodeType: 'PROJECT' })
      );
    });

    it('should broadcast NODE_UPDATE with nodeType in the patch', async () => {
      await service.updateNodeMeta(
        MOCK_USER_ID,
        MOCK_NODE_ID,
        MOCK_WORKSPACE_ID,
        { nodeType: 'PROJECT' } as any
      );

      expect(wsGateway.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'NODE_UPDATE',
          nodeId: MOCK_NODE_ID,
          patch: expect.objectContaining({ nodeType: 'PROJECT' })
        })
      );
    });

    it('should not include nodeType in the patch when it is not provided', async () => {
      const result = await service.updateNodeMeta(
        MOCK_USER_ID,
        MOCK_NODE_ID,
        MOCK_WORKSPACE_ID,
        { title: 'New Title' } as any
      );

      expect(result.patch.nodeType).toBeUndefined();
      expect(nodeRepository.updateNode).toHaveBeenCalledWith(
        MOCK_WORKSPACE_ID,
        MOCK_NODE_ID,
        expect.not.objectContaining({ nodeType: expect.anything() })
      );
    });

    it('should not propagate nodeType to descendant nodes', async () => {
      nodeRepository.selectAllDescendantIds.mockResolvedValue(['child-1']);
      nodeRepository.selectNodesByIds.mockResolvedValue([
        { ...existingNode, node_id: 'child-1' }
      ]);

      await service.updateNodeMeta(
        MOCK_USER_ID,
        MOCK_NODE_ID,
        MOCK_WORKSPACE_ID,
        {
          nodeType: 'PROJECT',
          color: '#111111',
          propagateToChildren: true
        } as any
      );

      const childBroadcastCall = wsGateway.broadcast.mock.calls.find(
        ([event]: any[]) => event.nodeId === 'child-1'
      );
      expect(childBroadcastCall[0].patch.nodeType).toBeUndefined();
      expect(nodeRepository.updateNode).not.toHaveBeenCalledWith(
        MOCK_WORKSPACE_ID,
        'child-1',
        expect.objectContaining({ nodeType: expect.anything() })
      );
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

      // AC-EMBED-QUEUE-COMMIT-ORDER-003a: return value shape preserved unchanged.
      expect(result).toEqual({
        nodeId: MOCK_NODE_ID,
        title: mdInsertResult.title,
        nodeType: 'DATA',
        position: { x: 100, y: 200 },
        data: mdInsertResult.content,
        createdAt: mdInsertResult.created_at.toDateString()
      });
    });

    it('should broadcast NODE_CREATE event via EventBusPublisher exactly once with the assembled node payload', async () => {
      const result = await service.createMarkdownNode(mdNode as any);

      // AC-EMBED-QUEUE-COMMIT-ORDER-003b: broadcast fires exactly once, NODE_CREATE,
      // with the same payload as before the transaction split.
      expect(wsGateway.broadcast).toHaveBeenCalledTimes(1);
      expect(wsGateway.broadcast).toHaveBeenCalledWith({
        type: 'NODE_CREATE',
        workspaceId: MOCK_WORKSPACE_ID,
        userId: MOCK_USER_ID,
        node: result
      });
    });

    it('should sync file attachments with inserted content exactly once', async () => {
      await service.createMarkdownNode(mdNode as any);

      // AC-EMBED-QUEUE-COMMIT-ORDER-003c
      expect(fileAttachmentService.syncNodeAttachments).toHaveBeenCalledTimes(
        1
      );
      expect(fileAttachmentService.syncNodeAttachments).toHaveBeenCalledWith(
        MOCK_NODE_ID,
        MOCK_WORKSPACE_ID,
        mdInsertResult.content
      );
    });

    it('should enqueue an embed job for the created node', async () => {
      await service.createMarkdownNode(mdNode as any);

      expect(embedQueueService.enqueueEmbedJob).toHaveBeenCalledWith({
        nodeId: MOCK_NODE_ID,
        userId: MOCK_USER_ID,
        workspaceId: MOCK_WORKSPACE_ID
      });
    });

    it('should not enqueue an embed job when the node insert fails (AC-EMBED-QUEUE-COMMIT-ORDER-002)', async () => {
      nodeRepository.insertNode.mockRejectedValue(new Error('insert failed'));

      await expect(service.createMarkdownNode(mdNode as any)).rejects.toThrow(
        'insert failed'
      );

      expect(embedQueueService.enqueueEmbedJob).not.toHaveBeenCalled();
      expect(wsGateway.broadcast).not.toHaveBeenCalled();
    });

    it('should not write to the DB or enqueue an embed job when the user lacks edit permission', async () => {
      workspaceRepository.checkWorkspace.mockResolvedValue({ role: 'VIEWER' });

      await expect(service.createMarkdownNode(mdNode as any)).rejects.toThrow(
        UnauthorizedException
      );

      expect(nodeRepository.insertNode).not.toHaveBeenCalled();
      expect(fileAttachmentService.syncNodeAttachments).not.toHaveBeenCalled();
      expect(embedQueueService.enqueueEmbedJob).not.toHaveBeenCalled();
    });

    describe('commit-order (AC-EMBED-QUEUE-COMMIT-ORDER-001a/001b)', () => {
      afterEach(() => {
        // Restore the pass-through runner shared by every other test in this file.
        setTransactionRunner((fn) => fn());
      });

      it('should enqueue the embed job only after the internal transaction has committed', async () => {
        const commitLog: string[] = [];

        // A test-local runner that stands in for PrismaService.runInTransaction.
        // It records when the wrapped transactional callback is invoked, and
        // — after that callback resolves — inserts an observable async gap
        // before recording the commit, standing in for the real Postgres
        // COMMIT flush that happens after the transactional callback resolves.
        setTransactionRunner(async (fn) => {
          commitLog.push('tx:start');
          const result = await fn();
          await new Promise((resolve) => setImmediate(resolve));
          commitLog.push('tx:commit');
          return result;
        });

        fileAttachmentService.syncNodeAttachments.mockImplementation(
          async () => {
            commitLog.push('syncNodeAttachments');
          }
        );
        mockRedisClient.del.mockImplementation(async () => {
          commitLog.push('redisDel');
        });
        embedQueueService.enqueueEmbedJob.mockImplementation(async () => {
          commitLog.push('enqueueEmbedJob');
        });

        await service.createMarkdownNode(mdNode as any);

        const commitIndex = commitLog.indexOf('tx:commit');
        const syncIndex = commitLog.indexOf('syncNodeAttachments');
        const redisDelIndex = commitLog.indexOf('redisDel');
        const enqueueIndex = commitLog.indexOf('enqueueEmbedJob');

        // The transaction must have actually run and committed.
        expect(commitIndex).toBeGreaterThanOrEqual(0);
        // The two transactional writes happen before commit.
        expect(syncIndex).toBeGreaterThanOrEqual(0);
        expect(syncIndex).toBeLessThan(commitIndex);
        expect(redisDelIndex).toBeGreaterThanOrEqual(0);
        expect(redisDelIndex).toBeLessThan(commitIndex);
        // AC-001a / AC-001b: enqueueEmbedJob happens strictly after commit.
        expect(enqueueIndex).toBeGreaterThan(commitIndex);
      });
    });
  });

  describe('deleteNode', () => {
    beforeEach(() => {
      workspaceRepository.checkWorkspace.mockResolvedValue({ role: 'OWNER' });
      nodeRepository.selectNodeById.mockResolvedValue(mockInsertResult);
      nodeRepository.deleteNode.mockResolvedValue(undefined);
      edgeRepository.deleteEdgesByNodeId.mockResolvedValue(undefined);
    });

    it('should release file attachments before deleting the node', async () => {
      await service.deleteNode(MOCK_WORKSPACE_ID, MOCK_USER_ID, MOCK_NODE_ID);

      expect(fileAttachmentService.releaseNodeAttachments).toHaveBeenCalledWith(
        MOCK_NODE_ID
      );
      expect(nodeRepository.deleteNode).toHaveBeenCalledWith(MOCK_NODE_ID);
    });

    it('should broadcast NODE_DELETE event via EventBusPublisher', async () => {
      await service.deleteNode(MOCK_WORKSPACE_ID, MOCK_USER_ID, MOCK_NODE_ID);

      expect(wsGateway.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'NODE_DELETE',
          workspaceId: MOCK_WORKSPACE_ID,
          nodeId: MOCK_NODE_ID
        })
      );
    });
  });
});
