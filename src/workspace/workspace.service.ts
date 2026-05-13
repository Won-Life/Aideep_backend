import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  LoggerService,
  NotFoundException
} from '@nestjs/common';
import { WorkspaceRepository } from './workspace.repository';
import {
  CreateWorkspaceBody,
  CreateWorkspaceResponseDto
} from './dto/createWorkspace.dto';
import { Transactional } from 'src/prisma/transactional.decorator';
import { NodeRepository } from 'src/node/node.repository';
import { UserWokrpaceInfoDto, WorkspaceInfoDto } from './dto/workspaceInfo.dto';
import { RedisService } from 'src/redis/redis.service';
import { REDIS_KEYS } from 'src/redis/redis.keys';
import {
  JoinWorkspaceBody as InviteWorkspaceBody,
  InviteWOrkspaceResponseDto
} from './dto/joinWorkspace.dto';
import { LeaveWorkspaceBody } from './dto/leaveWorkspace';
import { workspace_role_enum } from '../generated/prisma/client';

const WORKSPACE_SYNC_TTL = 60 * 10;

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly nodeRepository: NodeRepository,
    private readonly redisService: RedisService
  ) {}

  @Transactional()
  async createWorkspace(
    userId: string,
    body: CreateWorkspaceBody
  ): Promise<CreateWorkspaceResponseDto> {
    const workspace = await this.workspaceRepository.insertWorkspace(body);
    await this.workspaceRepository.insertWorkspaceUser(
      userId,
      workspace.workspace_id,
      body.role
    );
    return { workspaceId: workspace.workspace_id };
  }

  async userWorkspaceInfo(userId: string): Promise<UserWokrpaceInfoDto[]> {
    const workspaceList =
      await this.workspaceRepository.selectUserWorkspace(userId);

    const ans = workspaceList.map((props) => {
      return {
        workspaceId: props.workspace_id,
        title: props.workspaces.title,
        role: props.role,
        joined: props.joined_at
      } as UserWokrpaceInfoDto;
    });
    return ans;
  }

  @Transactional()
  async leaveWorkspace(body: LeaveWorkspaceBody, userId: string) {
    const { workspaceId } = body;

    const membership = await this.workspaceRepository.checkWorkspace(
      userId,
      workspaceId
    );
    if (!membership || membership.deleted_at) {
      throw new NotFoundException(
        '해당 유저의 워크스페이스가 존재하지 않습니다.'
      );
    }

    if (membership.role === 'OWNER') {
      const activeMembers =
        await this.workspaceRepository.countActiveMembers(workspaceId);
      if (activeMembers > 1) {
        throw new BadRequestException(
          '다른 멤버가 남아 있어 OWNER는 떠날 수 없습니다. 소유권을 이전한 후 다시 시도해주세요.'
        );
      }
      await this.workspaceRepository.softDeleteWorkspace(workspaceId);
    }

    await this.workspaceRepository.leaveWorkspace(userId, workspaceId);
    return { workspaceId };
  }

  async getWorkspaceInfo(
    userId: string,
    workspaceId: string
  ): Promise<WorkspaceInfoDto> {
    await this.checkExist(userId, workspaceId);

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

  private async checkExist(
    userId: string,
    workspaceId: string,
    role?: workspace_role_enum
  ) {
    const check = await this.workspaceRepository.checkWorkspace(
      userId,
      workspaceId
    );
    if (check === null)
      throw new NotFoundException(
        '해당 유저의 워크스페이스가 존재하지 않습니다.'
      );
    if (check.role !== role)
      throw new BadRequestException('워크스페이스 권한이 일치하지 않습니다.');
  }

  async inviteWorkspace(
    body: InviteWorkspaceBody,
    userId: string
  ): Promise<InviteWOrkspaceResponseDto> {
    const { workspaceId, role } = body;
    const checkHasPerimission = await this.workspaceRepository.checkWorkspace(
      userId,
      workspaceId
    );

    if (!checkHasPerimission || checkHasPerimission.role === 'VIEWER')
      throw new ForbiddenException(
        '해당 워크스페이스 맴버가 아니거나 워크스페이스에 대한 권한이 존재하지 않습니다'
      );

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
      //TOOD: baseURL 형식으로 변경
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

    const existingMember = await this.workspaceRepository.checkWorkspace(
      userId,
      workspaceId
    );
    if (existingMember)
      throw new ForbiddenException('이미 워크스페이스 맴버입니다.');

    await this.workspaceRepository.insertWorkspaceUser(
      userId,
      workspaceId,
      stored.role
    );
  }
}
