import {
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { NodeRepository } from './node.repository';
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
import { NodeMoveBody, UpdateNodeMetaBody } from './dto/updateNode.dto';
import { Transactional } from 'src/prisma/transactional.decorator';

@Injectable()
export class NodeService {
  constructor(
    private readonly nodeRespository: NodeRepository,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly edgeRepository: EdgeRepository,
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

  async createProjectNode(node: Node): Promise<string> {
    await this.checkEditPermission(node.userId, node.workspaceId);
    const ans = await this.nodeRespository.insertNode(node);

    await this.redisService
      .getClient()
      .del(REDIS_KEYS.WORKSPACE_SYNC(node.workspaceId));

    this.wsGateway.broadcast({
      type: 'NODE_CREATE',
      workspaceId: ans.workspace_id,
      userId: node.userId,
      node: {
        nodeId: ans.node_id,
        title: ans.title,
        nodeType: ans.node_type,
        position: { x: ans.position_x, y: ans.position_y },
        data: ans.content as Record<string, unknown>,
        createdAt: ans.created_at.toDateString()
      }
    } as NodeCreateEvent);

    return ans.node_id;
  }

  async createMarkdownNode(node: Node): Promise<string> {
    await this.checkEditPermission(node.userId, node.workspaceId);
    const ans = await this.nodeRespository.insertNode(node);

    await this.redisService
      .getClient()
      .del(REDIS_KEYS.WORKSPACE_SYNC(node.workspaceId));

    this.wsGateway.broadcast({
      type: 'NODE_CREATE',
      workspaceId: ans.workspace_id,
      userId: node.userId,
      node: {
        nodeId: ans.node_id,
        title: ans.title,
        nodeType: ans.node_type,
        position: { x: ans.position_x, y: ans.position_y },
        data: ans.content as Record<string, unknown>,
        createdAt: ans.created_at.toDateString()
      }
    } as NodeCreateEvent);

    return ans.node_id;
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
  ) {
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
  }

  //TODO: 로직 수정
  async updateNodeMeta(
    userId: string,
    nodeId: string,
    workspaceId: string,
    body: UpdateNodeMetaBody
  ) {
    const { title, color, textColor, propagateToChildren } = body;
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
      content: updatedContent
    });

    await this.redisService
      .getClient()
      .del(REDIS_KEYS.WORKSPACE_SYNC(workspaceId));

    const patch: Record<string, any> = {};
    if (title !== undefined) patch.title = title;
    if (color !== undefined || textColor !== undefined)
      patch.data = updatedContent;

    this.wsGateway.broadcast({
      type: 'NODE_UPDATE',
      workspaceId: workspaceId,
      nodeId: existing.node_id,
      userId: userId,
      patch
    });

    // 자식 노드 색상 전파
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
        }
      }
    }
  }

  async propagateDepthIncrease(
    workspaceId: string,
    targetId: string,
    sourceDepth: number
  ) {
    const depthIncrease = sourceDepth + 1;
    await this.nodeRespository.increasDepth(targetId, sourceDepth);

    const descendantIds = await this.nodeRespository.selectAllDescendantIds(
      workspaceId,
      targetId
    );

    if (descendantIds.length > 0) {
      await this.nodeRespository.increaseDepthMany(
        workspaceId,
        descendantIds,
        depthIncrease
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
      nodeId: nodeId
    } as NodeDeleteEvent);
    return '노드 삭제';
  }
}
