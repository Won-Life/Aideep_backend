import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { NodeRepository, FtsRow } from './node.repository';
import {
  NodeSearchResponseDto,
  NodeSearchResultDto
} from './dto/nodeSearch.dto';
import { WorkspaceRepository } from 'src/workspace/workspace.repository';
import { EdgeRepository } from 'src/edge/edge.repository';
import { Node } from './node.model';
import { WsGateway } from 'src/ws/ws.gateway';
import {
  NodeCreateEvent,
  NodeDeleteEvent,
  NodeMoveEvent
} from 'src/ws/ws.event';
import { RedisService } from 'src/redis/redis.service';
import { REDIS_KEYS } from 'src/redis/redis.keys';
import {
  NodeMoveBody,
  NodeMoveResponse,
  NodeUpdateResponse,
  NodeDescendantUpdate,
  UpdateNodeMetaBody
} from './dto/updateNode.dto';
import { Transactional } from 'src/prisma/transactional.decorator';
import { NodeCreateReponse } from './dto/createNode.dto';

@Injectable()
export class NodeService {
  constructor(
    private readonly nodeRespository: NodeRepository,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly edgeRepository: EdgeRepository,
    @Inject(forwardRef(() => WsGateway))
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
      throw new UnauthorizedException('노드를 수정할 권한이 없습니다.');
    }
  }

  async createProjectNode(node: Node): Promise<NodeCreateReponse> {
    await this.checkEditPermission(node.userId, node.workspaceId);
    const ans = await this.nodeRespository.insertNode(node);

    await this.redisService
      .getClient()
      .del(REDIS_KEYS.WORKSPACE_SYNC(node.workspaceId));

    const nodeAns = {
      nodeId: ans.node_id,
      title: ans.title,
      nodeType: ans.node_type,
      position: { x: ans.position_x ?? 0, y: ans.position_y ?? 0 },
      data: ans.content as Record<string, unknown>,
      createdAt: ans.created_at.toDateString()
    };

    this.wsGateway.broadcast({
      type: 'NODE_CREATE',
      workspaceId: ans.workspace_id,
      userId: node.userId,
      node: nodeAns
    } as NodeCreateEvent);

    return nodeAns;
  }

  async createMarkdownNode(node: Node): Promise<NodeCreateReponse> {
    await this.checkEditPermission(node.userId, node.workspaceId);
    const ans = await this.nodeRespository.insertNode(node);

    await this.redisService
      .getClient()
      .del(REDIS_KEYS.WORKSPACE_SYNC(node.workspaceId));

    const nodeAns = {
      nodeId: ans.node_id,
      title: ans.title,
      nodeType: ans.node_type,
      position: { x: ans.position_x ?? 0, y: ans.position_y ?? 0 },
      data: ans.content as Record<string, unknown>,
      createdAt: ans.created_at.toDateString()
    };

    this.wsGateway.broadcast({
      type: 'NODE_CREATE',
      workspaceId: ans.workspace_id,
      userId: node.userId,
      node: nodeAns
    } as NodeCreateEvent);

    return nodeAns;
  }

  // async createPdfNode(node: Node) {
  //   const checkWorkspace = await this.workspaceRepository.checkWorkspace(
  //     node.userId,
  //     node.workspaceId
  //   );

  //   if (checkWorkspace?.role !== 'OWNER') {
  //     throw new UnauthorizedException(
  //       '워크스페이스의 유저/편집자만 생성 할 수 있습니다.'
  //     );
  //   }

  //   const ans = await this.nodeRespository.insertNode(node);

  //   await this.redisService
  //     .getClient()
  //     .del(REDIS_KEYS.WORKSPACE_SYNC(node.workspaceId));

  //   return this.wsGateway.broadcast({
  //     type: 'NODE_CREATE',
  //     workspaceId: ans.workspace_id,
  //     userId: node.userId,
  //     node: {
  //       nodeId: ans.node_id,
  //       title: ans.title,
  //       nodeType: ans.node_type,
  //       position: { x: ans.position_x, y: ans.position_y },
  //       data: ans.content as Record<string, unknown>,
  //       createdAt: ans.created_at
  //     }
  //   } as NodeCreateEvent);
  // }

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

  async updateNodePosition(
    body: NodeMoveBody,
    userId: string,
    workspaceId: string,
    nodeId: string
  ): Promise<NodeMoveResponse> {
    const { x, y } = body.position;
    await this.checkEditPermission(userId, workspaceId);

    const currentNode = await this.nodeRespository.selectNodeById(
      workspaceId,
      nodeId
    );

    if (!currentNode) throw new NotFoundException('노드를 찾을 수 없습니다.');

    const deltaX = x - (currentNode.position_x ?? 0);
    const deltaY = y - (currentNode.position_y ?? 0);

    await this.nodeRespository.updateNode(workspaceId, nodeId, {
      positionX: x,
      positionY: y
    });

    await this.redisService
      .getClient()
      .del(REDIS_KEYS.WORKSPACE_SYNC(workspaceId));

    const descendantIds = await this.nodeRespository.selectAllDescendantIds(
      workspaceId,
      nodeId
    );
    if (descendantIds.length > 0) {
      await this.nodeRespository.updateNodePositionDelta(
        workspaceId,
        descendantIds,
        deltaX,
        deltaY
      );
    }

    this.wsGateway.broadcast({
      type: 'NODE_MOVE',
      workspaceId: workspaceId,
      userId: userId,
      nodeId: nodeId,
      x: x,
      y: y
    } as NodeMoveEvent);

    return { nodeId, x, y };
  }

  //TODO: 로직 수정
  async updateNodeMeta(
    userId: string,
    nodeId: string,
    workspaceId: string,
    body: UpdateNodeMetaBody
  ): Promise<NodeUpdateResponse> {
    const { title, color, textColor, propagateToChildren, nodeType } = body;
    await this.checkEditPermission(userId, workspaceId);

    const existing = await this.nodeRespository.selectNodeById(
      workspaceId,
      nodeId
    );
    if (!existing) throw new NotFoundException('노드를 찾을 수 없습니다.');

    const currentContent = existing.content as Record<string, any>;
    const updatedContent = {
      ...currentContent,
      ...(color !== undefined && { color }),
      ...(textColor !== undefined && { textColor })
    };

    await this.nodeRespository.updateNode(workspaceId, nodeId, {
      ...(title !== undefined && { title }),
      ...(nodeType !== undefined && { nodeType }),
      content: updatedContent
    });

    await this.redisService
      .getClient()
      .del(REDIS_KEYS.WORKSPACE_SYNC(workspaceId));

    const patch: Record<string, any> = {};
    if (title !== undefined) patch.title = title;
    if (color !== undefined || textColor !== undefined)
      patch.data = updatedContent;
    if (nodeType !== undefined) patch.nodeType = nodeType;

    this.wsGateway.broadcast({
      type: 'NODE_UPDATE',
      workspaceId: workspaceId,
      nodeId: existing.node_id,
      userId: userId,
      patch
    });

    // 자식 노드 색상 전파
    const descendantUpdates: NodeDescendantUpdate[] = [];
    if (
      propagateToChildren &&
      (color !== undefined || textColor !== undefined)
    ) {
      const descendantIds = await this.nodeRespository.selectAllDescendantIds(
        workspaceId,
        nodeId
      );

      if (descendantIds.length > 0) {
        const descendants = await this.nodeRespository.selectNodesByIds(
          workspaceId,
          descendantIds
        );

        for (const descendant of descendants) {
          const descContent = (descendant.content as Record<string, any>) ?? {};
          const descUpdatedContent = {
            ...descContent,
            ...(color !== undefined && { color }),
            ...(textColor !== undefined && { textColor })
          };

          await this.nodeRespository.updateNode(
            workspaceId,
            descendant.node_id,
            {
              content: descUpdatedContent
            }
          );

          this.wsGateway.broadcast({
            type: 'NODE_UPDATE',
            workspaceId,
            nodeId: descendant.node_id,
            userId,
            patch: { data: descUpdatedContent }
          });

          descendantUpdates.push({
            nodeId: descendant.node_id,
            patch: { data: descUpdatedContent }
          });
        }
      }
    }

    return {
      nodeId: existing.node_id,
      patch
    };
  }

  private async checkExist(userId: string, workspaceId: string) {
    const check = await this.workspaceRepository.checkWorkspace(
      userId,
      workspaceId
    );
    if (check === null)
      throw new NotFoundException(
        '해당 유저의 워크스페이스가 존재하지 않습니다.'
      );
    return check;
  }

  async searchByExactMatch(workspaceId: string, query: string, userId: string) {
    await this.checkExist(userId, workspaceId);

    return await this.nodeRespository.searchByQuery(workspaceId, query);
  }

  async searchNodes(
    workspaceId: string,
    rawQuery: string,
    userId: string,
    options: { limit?: number; cursor?: string } = {}
  ): Promise<NodeSearchResponseDto> {
    await this.checkExist(userId, workspaceId);

    const query = (rawQuery ?? '').trim();
    if (query.length < 1) {
      throw new BadRequestException('검색어는 1자 이상이어야 합니다.');
    }
    if (query.length > 200) {
      throw new BadRequestException('검색어는 200자 이하여야 합니다.');
    }

    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);

    if (process.env.FEATURE_FTS !== 'true') {
      const rows = await this.nodeRespository.searchByQuery(workspaceId, query);
      const items = rows.slice(0, limit).map<NodeSearchResultDto>((r) => ({
        nodeId: r.node_id,
        workspaceId: r.workspace_id,
        title: r.title,
        nodeType: r.node_type as string,
        depth: r.depth,
        positionX: r.position_x,
        positionY: r.position_y,
        version: r.version,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        score: 1,
        snippet: ''
      }));
      return { items, nextCursor: null };
    }

    const cursor = this.parseCursor(options.cursor);
    const rows = await this.nodeRespository.searchByFts(
      workspaceId,
      query,
      limit,
      cursor
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? `${last.score}|${last.nodeId}` : null;

    return {
      items: page.map<NodeSearchResultDto>((r) => this.toDto(r)),
      nextCursor
    };
  }

  private toDto(r: FtsRow): NodeSearchResultDto {
    return {
      nodeId: r.nodeId,
      workspaceId: r.workspaceId,
      title: r.title,
      nodeType: r.nodeType,
      depth: r.depth,
      positionX: r.positionX,
      positionY: r.positionY,
      version: r.version,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      score: r.score,
      snippet: r.snippet ?? ''
    };
  }

  private parseCursor(raw?: string): { score: number; nodeId: string } | null {
    if (!raw) return null;
    const [scoreStr, nodeId] = raw.split('|');
    const score = Number(scoreStr);
    if (!nodeId || Number.isNaN(score)) {
      throw new BadRequestException('잘못된 cursor 형식입니다.');
    }
    return { score, nodeId };
  }

  async propagateDepth(
    workspaceId: string,
    targetId: string,
    sourceDepth: number,
    increase: boolean
  ) {
    const depth = increase ? sourceDepth + 1 : -sourceDepth;
    await this.nodeRespository.increasDepth(targetId, depth);

    const descendantIds = await this.nodeRespository.selectAllDescendantIds(
      workspaceId,
      targetId
    );

    if (descendantIds.length > 0) {
      await this.nodeRespository.increaseDepthMany(
        workspaceId,
        descendantIds,
        depth
      );
    }
  }

  @Transactional()
  async deleteNode(workspaceId: string, userId: string, nodeId: string) {
    await this.checkEditPermission(userId, workspaceId);

    const existing = await this.nodeRespository.selectNodeById(
      workspaceId,
      nodeId
    );

    if (!existing) throw new NotFoundException('노드를 찾을 수 없습니다.');

    await this.edgeRepository.deleteEdgesByNodeId(nodeId);
    await this.nodeRespository.deleteNode(nodeId);
    await this.redisService
      .getClient()
      .del(REDIS_KEYS.WORKSPACE_SYNC(workspaceId));

    this.wsGateway.broadcast({
      type: 'NODE_DELETE',
      workspaceId: workspaceId,
      userId: userId,
      nodeId: nodeId
    } as NodeDeleteEvent);
    return '노드 삭제';
  }
}
