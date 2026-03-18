import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { NodeRepository } from './node.repository';
import { WorkspaceRepository } from 'src/workspace/workspace.repository';
import { Node } from './node.model';
import { SseService } from 'src/sse/sse.service';
import { NodeCreateEvent, NodeUpdateEvent } from 'src/sse/sse.event';
import { RedisService } from 'src/redis/redis.service';
import { REDIS_KEYS } from 'src/redis/redis.keys';
import { Transactional } from 'src/prisma/transactional.decorator';
import { UpdateNodeBody } from './dto/updateNode.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class NodeService {
  constructor(
    private readonly nodeRespository: NodeRepository,
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

  async updateNode(
    workspaceId: string,
    nodeId: string,
    userId: string,
    body: UpdateNodeBody
  ) {
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

    const existing = await this.nodeRespository.selectNodeById(
      workspaceId,
      nodeId
    );
    if (!existing) throw new NotFoundException('노드를 찾을 수 없습니다.');

    const existingContent = existing.content as Record<string, unknown>;

    let updatedContent: Prisma.InputJsonValue | undefined;
    if (body.data) {
      const dataType = existingContent.dataType as string;

      if (body.data.body !== undefined && dataType !== 'MARKDOWN') {
        throw new BadRequestException(
          'body는 MARKDOWN 노드에서만 수정할 수 있습니다.'
        );
      }

      if (body.data.body !== undefined) {
        const MAX_BODY_LENGTH = 100_000;
        if (body.data.body.length > MAX_BODY_LENGTH) {
          throw new BadRequestException(
            `body는 ${MAX_BODY_LENGTH.toLocaleString()}자를 초과할 수 없습니다.`
          );
        }
      }

      updatedContent = {
        ...existingContent,
        ...(body.data.body !== undefined && { body: body.data.body }),
        ...(body.data.color !== undefined && { color: body.data.color }),
        ...(body.data.textColor !== undefined && {
          textColor: body.data.textColor
        })
      } as Prisma.InputJsonValue;
    }

    if (body.title !== undefined && body.title.length > 500) {
      throw new BadRequestException('title은 500자를 초과할 수 없습니다.');
    }

    if (body.position !== undefined) {
      const { x, y } = body.position;
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new BadRequestException(
          'position 값이 유효하지 않습니다. (NaN, Infinity 불가)'
        );
      }
    }

    await this.nodeRespository.updateNode(workspaceId, nodeId, {
      ...(body.title !== undefined && { title: body.title.trim() }),
      ...(body.position !== undefined && {
        positionX: body.position.x,
        positionY: body.position.y
      }),
      ...(updatedContent !== undefined && { content: updatedContent })
    });

    await this.redisService
      .getClient()
      .del(REDIS_KEYS.WORKSPACE_SYNC(workspaceId));

    this.sseService.emit({
      type: 'NODE_UPDATE',
      nodeId,
      workspaceId,
      userId
    } as NodeUpdateEvent);
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
