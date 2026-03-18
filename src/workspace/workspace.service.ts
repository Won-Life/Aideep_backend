import {
  ForbiddenException,
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
import { JoinWorkspaceBody as InviteWorkspaceBody } from './dto/joinWorkspace.dto';

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

  async inviteWorkspace(body: InviteWorkspaceBody) {
    const { workspaceId, role } = body;
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    const inviteKey = REDIS_KEYS.INVITE_WORKSPACE(workspaceId);
    const inviteData = JSON.stringify({
      code: code,
      role: role
    });
    await this.redisService
      .getClient()
      .set(inviteKey, inviteData, { EX: 18000 });

    return {
      code: code,
      url: `http://localhost:3000/workspace/join/${workspaceId}`
    };
  }

  async joinWorkspace(code: string, userId: string, workspaceId: string) {
    const authCode = REDIS_KEYS.INVITE_WORKSPACE(workspaceId);
    const check = await this.redisService.getClient().get(authCode);

    if (!check) throw new NotFoundException('존재하지 않는 초대 코드입니다.');

    const stored = JSON.parse(check);
    if (stored.code !== code)
      throw new ForbiddenException('코드가 일치하지 않습니다.');

    await this.workspaceRepository.insertWorkspaceUser(
      userId,
      workspaceId,
      stored.role
    );
  }
}
