import {
  BadRequestException,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { NodeRespository } from './node.repository';
// import { Transactional } from 'src/prisma/transactional.decorator';
import { WorkspaceRepository } from 'src/workspace/workspace.repository';
import { Node } from './node.model';
import { SseService } from 'src/sse/sse.service';
import { NodeCreateEvent } from 'src/sse/sse.event';

@Injectable()
export class NodeService {
  constructor(
    private readonly nodeRespository: NodeRespository,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly sseService: SseService
  ) {}

  async createProjectNode(node: Node) {
    const checkWorkspace = await this.workspaceRepository.checkWorkspace(
      node.userId,
      node.workspaceId
    );

    if (checkWorkspace?.role !== 'OWNER') {
      throw new UnauthorizedException(
        '워크스페이스의 유저/편집자만 생성 할 수 있습니다.'
      );
    }
    const ans = await this.nodeRespository.insertNode(node);

    return this.sseService.emit({
      type: 'NODE_CREATE',
      nodeId: ans.node_id,
      workspaceId: ans.workspace_id,
      userId: node.userId
    } as NodeCreateEvent);
  }
}
