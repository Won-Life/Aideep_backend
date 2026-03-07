import {
  Inject,
  Injectable,
  LoggerService,
  NotFoundException
} from '@nestjs/common';
import { WorkspaceRepository } from './workspace.repository';
import { createWorkspaceBody } from './dto/createWorkspace.dto';
import { Transactional } from 'src/prisma/transactional.decorator';
import { NodeRespository } from 'src/node/node.repository';
import { WorkspaceInfoDto } from './dto/workspaceInfo.dto';

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly nodeRepository: NodeRespository
  ) {}

  @Transactional()
  async creteWorkspace(userId: string, body: createWorkspaceBody) {
    try {
      const workspace = await this.workspaceRepository.insertWorkspace(body);
      await this.workspaceRepository.insertWorkspaceUser(
        userId,
        workspace.workspace_id,
        body.role
      );
      return { workspaceId: workspace.workspace_id };
    } catch (err) {
      console.error(err);
    }
  }

  @Transactional()
  async getWorkspaceInfo(
    userId: string,
    workspaceId: string
  ): Promise<WorkspaceInfoDto> {
    const check = await this.workspaceRepository.checkWorkspace(
      userId,
      workspaceId
    );
    if (check === null)
      throw new NotFoundException(
        '해당 유저의 워크스페이스가 존재하지 않습니다.'
      );

    const nodes = await this.nodeRepository.selectAllNode(workspaceId, userId);
    const edges = await this.nodeRepository.selectAllEdge(workspaceId, userId);

    return {
      nodes: nodes,
      edges: edges
    };
  }

  @Transactional()
  async joinWorkspace(userId: string) {}
}
