import { Test, TestingModule } from '@nestjs/testing';
import { EdgeController } from './edge.controller';
import { EdgeService } from './edge.service';
import { EdgeRepository } from './edge.repository';
import { WorkspaceRepository } from '../workspace/workspace.repository';
import { NodeRepository } from '../node/node.repository';

describe('EdgeController', () => {
  let controller: EdgeController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EdgeController],
      providers: [
        EdgeService,
        {
          provide: EdgeRepository,
          useValue: {
            findEdge: jest.fn(),
            findEdgesBySource: jest.fn(),
            findAllEdgesInWorkspace: jest.fn(),
            createEdge: jest.fn(),
          },
        },
        {
          provide: WorkspaceRepository,
          useValue: { checkWorkspace: jest.fn() },
        },
        {
          provide: NodeRepository,
          useValue: { selectNodeById: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<EdgeController>(EdgeController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
