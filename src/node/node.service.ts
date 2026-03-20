import {
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { NodeRepository } from './node.repository';
import { WorkspaceRepository } from 'src/workspace/workspace.repository';
import { Node } from './node.model';
import { SseService } from 'src/sse/sse.service';
import { NodeCreateEvent, NodeMoveEvent } from 'src/sse/sse.event';
import { RedisService } from 'src/redis/redis.service';
import { REDIS_KEYS } from 'src/redis/redis.keys';
import { NodeMoveBody, UpdateMarkdownNodeBody } from './dto/updateNode.dto';

@Injectable()
export class NodeService {
  constructor(
    private readonly nodeRespository: NodeRepository,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly sseService: SseService,
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

  async createProjectNode(node: Node) {
    await this.checkEditPermission(node.userId, node.workspaceId);
    const ans = await this.nodeRespository.insertNode(node);

    await this.redisService
      .getClient()
      .del(REDIS_KEYS.WORKSPACE_SYNC(node.workspaceId));

    return this.sseService.emit({
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
  }

  async createMarkdownNode(node: Node) {
    await this.checkEditPermission(node.userId, node.workspaceId);
    const ans = await this.nodeRespository.insertNode(node);

    await this.redisService
      .getClient()
      .del(REDIS_KEYS.WORKSPACE_SYNC(node.workspaceId));

    return this.sseService.emit({
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

  //   return this.sseService.emit({
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
    await this.nodeRespository.updateNode(workspaceId, nodeId, {
      positionX: x,
      positionY: y
    });

    this.sseService.emit({
      userId: userId,
      nodeId: nodeId,
      x: x,
      y: y
    } as NodeMoveEvent);
  }

  async updateNodeBody(
    userId: string,
    nodeId: string,
    workspaceId: string,
    body: UpdateMarkdownNodeBody
  ) {
    const { title, body: dto } = body;
    await this.checkEditPermission(userId, workspaceId);

    const existing = await this.nodeRespository.selectNodeById(
      workspaceId,
      nodeId
    );
    if (!existing) throw new NotFoundException('노드를 찾을 수 없습니다.');

    // 2. 기존 content에 변경값만 머지
    const currentContent = existing.content as Record<string, any>;
    const updatedContent = {
      ...currentContent,
      ...(dto?.markdownBody !== undefined && {
        markdownBody: dto.markdownBody
      }),
      ...(dto?.jsonBody !== undefined && { jsonBody: dto.jsonBody })
    };

    await this.nodeRespository.updateNode(workspaceId, nodeId, {
      ...(title !== undefined && { title }),
      content: updatedContent
    });

    const patch: Record<string, any> = {};
    if (title !== undefined) patch.title = title;
    if (dto?.markdownBody !== undefined) patch.markdownBody = dto.markdownBody;
    if (dto?.jsonBody !== undefined) patch.jsonBody = dto.jsonBody;

    this.sseService.emit({
      type: 'NODE_UPDATE',
      workspaceId: workspaceId,
      nodeId: existing.node_id,
      userId: userId,
      patch
    });
  }
}
