import { Test, TestingModule } from '@nestjs/testing';
import { EdgeController } from './edge.controller';
import { EdgeService } from './edge.service';
import { EdgeRepository } from './edge.repository';
import { WorkspaceRepository } from '../workspace/workspace.repository';
import { NodeRepository } from '../node/node.repository';
import { NodeService } from '../node/node.service';
import { WsGateway } from '../ws/ws.gateway';
import { RedisService } from '../redis/redis.service';

describe('EdgeController', () => {
  let controller: EdgeController;
  let edgeRepo: {
    findEdgeById: jest.Mock;
    updateEdge: jest.Mock;
  };
  let workspaceRepo: { checkWorkspace: jest.Mock };
  let wsGateway: { broadcast: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EdgeController],
      providers: [
        EdgeService,
        {
          provide: EdgeRepository,
          useValue: {
            findEdge: jest.fn(),
            findEdgeById: jest.fn(),
            findEdgesBySource: jest.fn(),
            findAllEdgesInWorkspace: jest.fn(),
            createEdge: jest.fn(),
            updateEdge: jest.fn()
          }
        },
        {
          provide: WorkspaceRepository,
          useValue: { checkWorkspace: jest.fn() }
        },
        {
          provide: NodeRepository,
          useValue: { selectNodeById: jest.fn() }
        },
        {
          provide: NodeService,
          useValue: { propagateDepth: jest.fn() }
        },
        {
          provide: WsGateway,
          useValue: { broadcast: jest.fn() }
        },
        {
          provide: RedisService,
          useValue: {
            getClient: jest.fn().mockReturnValue({ del: jest.fn() })
          }
        }
      ]
    }).compile();

    controller = module.get<EdgeController>(EdgeController);
    edgeRepo = module.get(EdgeRepository);
    workspaceRepo = module.get(WorkspaceRepository);
    wsGateway = module.get(WsGateway);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('updateEdge', () => {
    it('EdgeService.updateEdge에 위임하고 결과를 반환한다', async () => {
      workspaceRepo.checkWorkspace.mockResolvedValue({ role: 'OWNER' } as any);
      edgeRepo.findEdgeById.mockResolvedValue({
        edge_id: 'edge-1',
        workspace_id: 'ws-1'
      } as any);
      edgeRepo.updateEdge.mockResolvedValue({ edge_id: 'edge-1' } as any);

      const result = await controller.updateEdge(
        'ws-1',
        'edge-1',
        { sourceHandle: 'left' },
        { user: { user_id: 'user-1' } } as any
      );

      expect(edgeRepo.updateEdge).toHaveBeenCalledWith('edge-1', {
        sourceHandle: 'left',
        targetHandle: undefined
      });
      expect(wsGateway.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'EDGE_UPDATE',
          workspaceId: 'ws-1',
          userId: 'user-1',
          edgeId: 'edge-1',
          patch: { sourceHandle: 'left' }
        })
      );
      expect(result).toEqual({ edgeId: 'edge-1', sourceHandle: 'left' });
    });
  });
});
