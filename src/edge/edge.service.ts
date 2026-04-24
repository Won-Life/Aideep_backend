import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { Edge } from './edge.model';
import { EdgeRepository } from './edge.repository';
import { WorkspaceRepository } from 'src/workspace/workspace.repository';
import { Transactional } from 'src/prisma/transactional.decorator';
import { NodeRepository } from 'src/node/node.repository';
import { NodeService } from 'src/node/node.service';
import { WsGateway } from 'src/ws/ws.gateway';
import { EdgeCreateEvent } from 'src/ws/ws.event';
import { RedisService } from 'src/redis/redis.service';
import { REDIS_KEYS } from 'src/redis/redis.keys';
import { useContainer } from 'class-validator';

@Injectable()
export class EdgeService {
  constructor(
    private readonly edgeRepository: EdgeRepository,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly nodeRepository: NodeRepository,
    private readonly nodeService: NodeService,
    private readonly wsGateway: WsGateway,
    private readonly redisService: RedisService
  ) {}
  private async checkEditPermission(userId: string, workspaceId: string) {
    const checkWorkspace = await this.workspaceRepository.checkWorkspace(
      userId,
      workspaceId
    );
    if (!checkWorkspace) {
      throw new NotFoundException(
        '해당 유저의 워크스페이스가 존재하지 않습니다.'
      );
    }
    if (checkWorkspace.role !== 'OWNER' && checkWorkspace.role !== 'EDITOR') {
      throw new ForbiddenException('엣지를 수정할 권한이 없습니다.');
    }
  }

  private hasCycle(
    sourceId: string,
    targetId: string,
    edges: { source_id: string; target_id: string }[]
  ): boolean {
    const adj = new Map<string, string[]>();
    for (const e of edges) {
      if (!adj.has(e.source_id)) adj.set(e.source_id, []);
      adj.get(e.source_id)!.push(e.target_id);
    }

    // target에서 BFS로 source에 도달 가능하면 사이클
    const visited = new Set<string>();
    const queue = [targetId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === sourceId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const next of adj.get(current) ?? []) {
        queue.push(next);
      }
    }
    return false;
  }

  @Transactional()
  async connectNodes(dto: Edge) {
    await this.checkEditPermission(dto.userId, dto.workspaceId);

    if (dto.sourceId === dto.targetId)
      throw new BadRequestException('자기 자신과 연결할 수 없습니다.');

    const source = await this.nodeRepository.selectNodeById(
      dto.workspaceId,
      dto.sourceId
    );
    const target = await this.nodeRepository.selectNodeById(
      dto.workspaceId,
      dto.targetId
    );

    if (!source || !target)
      throw new NotFoundException('해당 노드가 존재하지 않습니다.');

    if (target.node_type === 'PROJECT')
      throw new BadRequestException('프로젝트 노드는 연결 할 수 없습니다');

    // 이미 동일한 방향 엣지 존재 여부
    const existingEdge = await this.edgeRepository.findEdge(
      dto.sourceId,
      dto.targetId
    );
    if (existingEdge)
      throw new BadRequestException('이미 존재하는 엣지입니다.');

    // 역방향 엣지 존재 여부 (B→A가 있으면 A→B 불가)
    const reverseEdge = await this.edgeRepository.findEdge(
      dto.targetId,
      dto.sourceId
    );
    if (reverseEdge)
      throw new BadRequestException('역방향 엣지가 이미 존재합니다.');

    //Target노드가 부모 노드임

    // source 노드의 outgoing 엣지 중복 여부 (source는 하나의 엣지만 허용)
    // const sourceOutgoing = await this.edgeRepository.findEdgesBySource(
    //   dto.sourceId
    // );
    // if (sourceOutgoing.length > 0)
    //   throw new BadRequestException(
    //     '해당 노드는 이미 다른 노드와 연결되어 있습니다.'
    //   );

    // 사이클 검출: target에서 BFS로 source 도달 가능 여부
    const allEdges = await this.edgeRepository.findAllEdgesInWorkspace(
      dto.workspaceId
    );
    if (this.hasCycle(dto.sourceId, dto.targetId, allEdges))
      throw new BadRequestException('순환 관계가 생성됩니다.');

    await this.nodeService.propagateDepth(
      dto.workspaceId,
      dto.targetId,
      source.depth!,
      true
    );
    const result = await this.edgeRepository.createEdge(dto);

    await this.redisService
      .getClient()
      .del(REDIS_KEYS.WORKSPACE_SYNC(dto.workspaceId));

    this.wsGateway.broadcast({
      type: 'EDGE_CREATE',
      workspaceId: dto.workspaceId,
      userId: dto.userId,
      edge: {
        edgeId: result.edge_id,
        sourceId: dto.sourceId,
        targetId: dto.targetId,
        sourceHandle: dto.sourceHandle,
        targetHandle: dto.targetHandle
      }
    } as EdgeCreateEvent);

    return { edgeId: result.edge_id };
  }

  async deleteEdge(workspaceId: string, userId: string, edgeId: string) {
    await this.checkEditPermission(userId, workspaceId);

    const isExist = await this.edgeRepository.findEdgeById(edgeId);
    if (!isExist) throw new NotFoundException('해당 엣지가 존재하지 않습니다.');

    const { source_id, target_id } = isExist;

    const source = await this.nodeRepository.selectNodeById(
      workspaceId,
      target_id
    );

    await this.nodeService.propagateDepth(
      workspaceId,
      target_id,
      source!.depth!,
      false
    );
    await this.edgeRepository.deleteEdge(edgeId);
    await this.redisService
      .getClient()
      .del(REDIS_KEYS.WORKSPACE_SYNC(workspaceId));

    this.wsGateway.broadcast({
      type: 'EDGE_DELETED',
      workspaceId: workspaceId,
      userId: userId,
      edgeId: edgeId
    });
    return '엣지 삭제';
  }
}
