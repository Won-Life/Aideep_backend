import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common';
import { EdgeService } from './edge.service';
import { EdgeRepository } from './edge.repository';
import { WorkspaceRepository } from 'src/workspace/workspace.repository';
import { NodeRepository } from 'src/node/node.repository';
import { Edge } from './edge.model';

// @Transactional() 데코레이터가 runInTransaction을 호출하므로 mock 처리
jest.mock('src/prisma/transaction.storage', () => ({
  runInTransaction: (fn: () => Promise<any>) => fn()
}));

describe('EdgeService', () => {
  let service: EdgeService;
  let edgeRepo: jest.Mocked<EdgeRepository>;
  let workspaceRepo: jest.Mocked<WorkspaceRepository>;
  let nodeRepo: jest.Mocked<NodeRepository>;

  const makeEdge = (overrides: Partial<Edge> = {}): Edge =>
    ({
      id: 'edge-1',
      workspaceId: 'ws-1',
      userId: 'user-1',
      sourceId: 'node-a',
      targetId: 'node-b',
      sourceHandle: 'bottom',
      targetHandle: 'top',
      ...overrides
    }) as Edge;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EdgeService,
        {
          provide: EdgeRepository,
          useValue: {
            findEdge: jest.fn(),
            findEdgesBySource: jest.fn(),
            findAllEdgesInWorkspace: jest.fn(),
            createEdge: jest.fn()
          }
        },
        {
          provide: WorkspaceRepository,
          useValue: {
            checkWorkspace: jest.fn()
          }
        },
        {
          provide: NodeRepository,
          useValue: {
            selectNodeById: jest.fn()
          }
        }
      ]
    }).compile();

    service = module.get<EdgeService>(EdgeService);
    edgeRepo = module.get(EdgeRepository);
    workspaceRepo = module.get(WorkspaceRepository);
    nodeRepo = module.get(NodeRepository);
  });

  // 정상 케이스 기본 세팅 헬퍼
  const setupHappyPath = () => {
    workspaceRepo.checkWorkspace.mockResolvedValue({ role: 'OWNER' } as any);
    nodeRepo.selectNodeById.mockResolvedValue({ id: 'node' } as any);
    edgeRepo.findEdge.mockResolvedValue(null);
    edgeRepo.findEdgesBySource.mockResolvedValue([]);
    edgeRepo.findAllEdgesInWorkspace.mockResolvedValue([]);
    edgeRepo.createEdge.mockResolvedValue(undefined);
  };

  describe('connectNodes', () => {
    it('sourceId와 targetId가 같으면 BadRequestException을 던진다', async () => {
      const dto = makeEdge({ sourceId: 'node-a', targetId: 'node-a' });
      workspaceRepo.checkWorkspace.mockResolvedValue({ role: 'OWNER' } as any);

      await expect(service.connectNodes(dto)).rejects.toThrow(
        new BadRequestException('자기 자신과 연결할 수 없습니다.')
      );
    });

    it('워크스페이스 멤버가 아니면 ForbiddenException을 던진다', async () => {
      const dto = makeEdge();
      workspaceRepo.checkWorkspace.mockResolvedValue(null);

      await expect(service.connectNodes(dto)).rejects.toThrow(
        ForbiddenException
      );
    });

    it('워크스페이스 role이 OWNER가 아니면 ForbiddenException을 던진다', async () => {
      const dto = makeEdge();
      workspaceRepo.checkWorkspace.mockResolvedValue({ role: 'VIEWER' } as any);

      await expect(service.connectNodes(dto)).rejects.toThrow(
        ForbiddenException
      );
    });

    it('source 노드가 존재하지 않으면 NotFoundException을 던진다', async () => {
      const dto = makeEdge();
      workspaceRepo.checkWorkspace.mockResolvedValue({ role: 'OWNER' } as any);
      nodeRepo.selectNodeById
        .mockResolvedValueOnce(null) // source
        .mockResolvedValueOnce({ id: 'node-b' } as any); // target

      await expect(service.connectNodes(dto)).rejects.toThrow(
        new NotFoundException('해당 노드가 존재하지 않습니다.')
      );
    });

    it('target 노드가 존재하지 않으면 NotFoundException을 던진다', async () => {
      const dto = makeEdge();
      workspaceRepo.checkWorkspace.mockResolvedValue({ role: 'OWNER' } as any);
      nodeRepo.selectNodeById
        .mockResolvedValueOnce({ id: 'node-a' } as any) // source
        .mockResolvedValueOnce(null); // target

      await expect(service.connectNodes(dto)).rejects.toThrow(
        new NotFoundException('해당 노드가 존재하지 않습니다.')
      );
    });

    it('동일한 방향 엣지가 이미 존재하면 BadRequestException을 던진다', async () => {
      const dto = makeEdge();
      workspaceRepo.checkWorkspace.mockResolvedValue({ role: 'OWNER' } as any);
      nodeRepo.selectNodeById.mockResolvedValue({ id: 'node' } as any);
      edgeRepo.findEdge.mockResolvedValueOnce({ id: 'existing' } as any); // 이미 존재

      await expect(service.connectNodes(dto)).rejects.toThrow(
        new BadRequestException('이미 존재하는 엣지입니다.')
      );
    });

    it('역방향 엣지가 존재하면 BadRequestException을 던진다', async () => {
      const dto = makeEdge();
      workspaceRepo.checkWorkspace.mockResolvedValue({ role: 'OWNER' } as any);
      nodeRepo.selectNodeById.mockResolvedValue({ id: 'node' } as any);
      edgeRepo.findEdge
        .mockResolvedValueOnce(null) // 정방향 없음
        .mockResolvedValueOnce({ id: 'reverse' } as any); // 역방향 있음

      await expect(service.connectNodes(dto)).rejects.toThrow(
        new BadRequestException('역방향 엣지가 이미 존재합니다.')
      );
    });

    it('source 노드에 이미 outgoing 엣지가 있으면 BadRequestException을 던진다', async () => {
      const dto = makeEdge();
      workspaceRepo.checkWorkspace.mockResolvedValue({ role: 'OWNER' } as any);
      nodeRepo.selectNodeById.mockResolvedValue({ id: 'node' } as any);
      edgeRepo.findEdge.mockResolvedValue(null);
      edgeRepo.findEdgesBySource.mockResolvedValue([
        { id: 'other-edge' } as any
      ]);

      await expect(service.connectNodes(dto)).rejects.toThrow(
        new BadRequestException(
          '해당 노드는 이미 다른 노드와 연결되어 있습니다.'
        )
      );
    });

    it('사이클이 생성되면 BadRequestException을 던진다', async () => {
      // A→B→C 상태에서 C→A 연결 시도 → 사이클
      const dto = makeEdge({ sourceId: 'node-c', targetId: 'node-a' });
      workspaceRepo.checkWorkspace.mockResolvedValue({ role: 'OWNER' } as any);
      nodeRepo.selectNodeById.mockResolvedValue({ id: 'node' } as any);
      edgeRepo.findEdge.mockResolvedValue(null);
      edgeRepo.findEdgesBySource.mockResolvedValue([]);
      edgeRepo.findAllEdgesInWorkspace.mockResolvedValue([
        { source_id: 'node-a', target_id: 'node-b' },
        { source_id: 'node-b', target_id: 'node-c' }
      ]);

      await expect(service.connectNodes(dto)).rejects.toThrow(
        new BadRequestException('순환 관계가 생성됩니다.')
      );
    });

    it('모든 조건을 통과하면 createEdge를 호출한다', async () => {
      const dto = makeEdge();
      setupHappyPath();

      await service.connectNodes(dto);

      expect(edgeRepo.createEdge).toHaveBeenCalledWith(dto);
    });

    it('정상 연결 시 checkWorkspace, selectNodeById, findEdge, findEdgesBySource, findAllEdgesInWorkspace를 올바른 인자로 호출한다', async () => {
      const dto = makeEdge();
      setupHappyPath();

      await service.connectNodes(dto);

      expect(workspaceRepo.checkWorkspace).toHaveBeenCalledWith(
        dto.userId,
        dto.workspaceId
      );
      expect(nodeRepo.selectNodeById).toHaveBeenCalledWith(
        dto.workspaceId,
        dto.sourceId
      );
      expect(nodeRepo.selectNodeById).toHaveBeenCalledWith(
        dto.workspaceId,
        dto.targetId
      );
      expect(edgeRepo.findEdge).toHaveBeenCalledWith(
        dto.sourceId,
        dto.targetId
      );
      expect(edgeRepo.findEdge).toHaveBeenCalledWith(
        dto.targetId,
        dto.sourceId
      );
      expect(edgeRepo.findEdgesBySource).toHaveBeenCalledWith(dto.sourceId);
      expect(edgeRepo.findAllEdgesInWorkspace).toHaveBeenCalledWith(
        dto.workspaceId
      );
    });
  });

  describe('hasCycle (connectNodes를 통한 간접 검증)', () => {
    const setupBase = () => {
      workspaceRepo.checkWorkspace.mockResolvedValue({ role: 'OWNER' } as any);
      nodeRepo.selectNodeById.mockResolvedValue({ id: 'node' } as any);
      edgeRepo.findEdge.mockResolvedValue(null);
      edgeRepo.findEdgesBySource.mockResolvedValue([]);
      edgeRepo.createEdge.mockResolvedValue(undefined);
    };

    it('사이클이 없으면 createEdge를 호출한다', async () => {
      const dto = makeEdge({ sourceId: 'node-b', targetId: 'node-c' });
      setupBase();
      // A→B 만 존재, B→C 추가는 사이클 없음
      edgeRepo.findAllEdgesInWorkspace.mockResolvedValue([
        { source_id: 'node-a', target_id: 'node-b' }
      ]);

      await service.connectNodes(dto);

      expect(edgeRepo.createEdge).toHaveBeenCalled();
    });

    it('직접 사이클 (A→B, B→A 시도)을 탐지한다', async () => {
      const dto = makeEdge({ sourceId: 'node-b', targetId: 'node-a' });
      setupBase();
      edgeRepo.findAllEdgesInWorkspace.mockResolvedValue([
        { source_id: 'node-a', target_id: 'node-b' }
      ]);

      await expect(service.connectNodes(dto)).rejects.toThrow(
        BadRequestException
      );
    });

    it('긴 체인의 사이클 (A→B→C→D, D→A 시도)을 탐지한다', async () => {
      const dto = makeEdge({ sourceId: 'node-d', targetId: 'node-a' });
      setupBase();
      edgeRepo.findAllEdgesInWorkspace.mockResolvedValue([
        { source_id: 'node-a', target_id: 'node-b' },
        { source_id: 'node-b', target_id: 'node-c' },
        { source_id: 'node-c', target_id: 'node-d' }
      ]);

      await expect(service.connectNodes(dto)).rejects.toThrow(
        BadRequestException
      );
    });

    it('사이클이 없는 복잡한 그래프에서는 엣지를 생성한다', async () => {
      // A→B, A→C, B→D 존재. C→D 추가는 사이클 없음
      const dto = makeEdge({ sourceId: 'node-c', targetId: 'node-d' });
      setupBase();
      edgeRepo.findAllEdgesInWorkspace.mockResolvedValue([
        { source_id: 'node-a', target_id: 'node-b' },
        { source_id: 'node-a', target_id: 'node-c' },
        { source_id: 'node-b', target_id: 'node-d' }
      ]);

      await service.connectNodes(dto);

      expect(edgeRepo.createEdge).toHaveBeenCalled();
    });
  });
});
