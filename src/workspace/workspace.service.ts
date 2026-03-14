import {
  Inject,
  Injectable,
  LoggerService,
  NotFoundException
} from '@nestjs/common';
import { WorkspaceRepository } from './workspace.repository';
import { createWorkspaceBody } from './dto/createWorkspace.dto';
import { Transactional } from 'src/prisma/transactional.decorator';
import { NodeRepository } from 'src/node/node.repository';
import { WorkspaceInfoDto } from './dto/workspaceInfo.dto';
import { RedisService } from 'src/redis/redis.service';
import { REDIS_KEYS } from 'src/redis/redis.keys';

const WORKSPACE_SYNC_TTL = 60 * 10;

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly nodeRepository: NodeRepository,
    private readonly redisService: RedisService
  ) {}

  @Transactional()
  async createWorkspace(userId: string, body: createWorkspaceBody) {
    const workspace = await this.workspaceRepository.insertWorkspace(body);
    await this.workspaceRepository.insertWorkspaceUser(
      userId,
      workspace.workspace_id,
      body.role
    );
    return { workspaceId: workspace.workspace_id };
  }

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

    const cacheKey = REDIS_KEYS.WORKSPACE_SYNC(workspaceId);
    const cached = await this.redisService.getClient().get(cacheKey);
    if (cached) return JSON.parse(cached) as WorkspaceInfoDto;

    const nodes = await this.nodeRepository.selectAllNode(workspaceId, userId);
    const edges = await this.nodeRepository.selectAllEdge(workspaceId, userId);

    const result: WorkspaceInfoDto = { nodes, edges };
    await this.redisService
      .getClient()
      .set(cacheKey, JSON.stringify(result), { EX: WORKSPACE_SYNC_TTL });

    return result;
  }

  @Transactional()
  async joinWorkspace(userId: string) {}
}
