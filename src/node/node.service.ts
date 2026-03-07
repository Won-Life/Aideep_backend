import {
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { NodeRespository } from './node.repository';
// import { Transactional } from 'src/prisma/transactional.decorator';
import { WorkspaceRepository } from 'src/workspace/workspace.repository';
import { Node } from './node.model';
import { SseService } from 'src/sse/sse.service';
import { NodeCreateEvent } from 'src/sse/sse.event';
import { RedisService } from 'src/redis/redis.service';
import { REDIS_KEYS } from 'src/redis/redis.keys';
import { Transactional } from 'src/prisma/transactional.decorator';

@Injectable()
export class NodeService {
  constructor(
    private readonly nodeRespository: NodeRespository,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly sseService: SseService,
    private readonly redisService: RedisService
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

    await this.redisService
      .getClient()
      .del(REDIS_KEYS.WORKSPACE_SYNC(node.workspaceId));

    return this.sseService.emit({
      type: 'NODE_CREATE',
      nodeId: ans.node_id,
      workspaceId: ans.workspace_id,
      userId: node.userId
    } as NodeCreateEvent);
  }

  async createMarkdownNode(node: Node) {
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

    await this.redisService
      .getClient()
      .del(REDIS_KEYS.WORKSPACE_SYNC(node.workspaceId));

    return this.sseService.emit({
      type: 'NODE_CREATE',
      nodeId: ans.node_id,
      workspaceId: ans.workspace_id,
      userId: node.userId
    } as NodeCreateEvent);
  }

  async createPdfNode(node: Node) {
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

    await this.redisService
      .getClient()
      .del(REDIS_KEYS.WORKSPACE_SYNC(node.workspaceId));

    return this.sseService.emit({
      type: 'NODE_CREATE',
      nodeId: ans.node_id,
      workspaceId: ans.workspace_id,
      userId: node.userId
    } as NodeCreateEvent);
  }

  async queryDetailNode(workspaceId: string, nodeId: string, userId: string) {
    const checkWorkspace = await this.workspaceRepository.checkWorkspace(
      userId,
      workspaceId
    );

    if (!checkWorkspace) {
      throw new NotFoundException(
        '해당 유저의 워크스페이스가 존재하지 않습니다.'
      );
    }

    const node = await this.nodeRespository.selectNodeById(workspaceId, nodeId);
    if (!node) throw new NotFoundException('노드를 찾을 수 없습니다.');

    return node;
  }

  // @Transactional()
  // async archiveNode(workspaceId: string, nodeId: string, userId: string) {
  //   const checkWorkspace = await this.workspaceRepository.checkWorkspace(
  //     userId,
  //     workspaceId
  //   );

  //   if (checkWorkspace?.role !== 'OWNER') {
  //     throw new UnauthorizedException(
  //       '워크스페이스의 유저/편집자만 생성 할 수 있습니다.'
  //     );
  //   }
  // }
}
