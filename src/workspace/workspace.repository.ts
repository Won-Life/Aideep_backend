import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateWorkspaceBody } from './dto/createWorkspace.dto';
import { workspace_role_enum } from '../generated/prisma/client';
import { WorkspaceMemberListDto } from './dto/workspaceInfo.dto';

@Injectable()
export class WorkspaceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async selectUserWorkspace(userId: string) {
    return await this.prisma.client.users_workspaces.findMany({
      where: {
        user_id: userId,
        deleted_at: null
      },
      include: {
        workspaces: {
          select: { title: true }
        }
      }
    });
  }

  async insertWorkspace(body: CreateWorkspaceBody) {
    return await this.prisma.client.workspaces.create({
      data: {
        title: body.title
      }
    });
  }

  async insertWorkspaceUser(
    userId: string,
    workspaceId: string,
    role: workspace_role_enum
  ) {
    await this.prisma.client.users_workspaces.create({
      data: {
        user_id: userId,
        workspace_id: workspaceId,
        role: role
      }
    });
  }

  async checkWorkspace(userId: string, workspaceId: string) {
    if (!userId || !workspaceId) return null;
    return await this.prisma.client.users_workspaces.findUnique({
      where: {
        user_id_workspace_id: {
          user_id: userId,
          workspace_id: workspaceId
        },
        deleted_at: null
      }
    });
  }
  async leaveWorkspace(userId: string, workspaceId: string) {
    return await this.prisma.client.users_workspaces.update({
      where: {
        user_id_workspace_id: {
          user_id: userId,
          workspace_id: workspaceId
        },
        deleted_at: null
      },
      data: { deleted_at: new Date() }
    });
  }

  async updateWorkspaceTitle(workspaceId: string, title: string) {
    return await this.prisma.client.workspaces.update({
      where: { workspace_id: workspaceId },
      data: { title: title }
    });
  }

  async softDeleteWorkspace(workspaceId: string) {
    return await this.prisma.client.workspaces.update({
      where: { workspace_id: workspaceId },
      data: { deleted_at: new Date() }
    });
  }

  async softDeleteAllMembers(workspaceId: string) {
    return await this.prisma.client.users_workspaces.updateMany({
      where: { workspace_id: workspaceId, deleted_at: null },
      data: { deleted_at: new Date() }
    });
  }

  async countActiveUserWorkspaces(userId: string): Promise<number> {
    return await this.prisma.client.users_workspaces.count({
      where: { user_id: userId, deleted_at: null }
    });
  }

  async selectMemberlist(workspaceId: string) {
    return await this.prisma.client.users_workspaces.findMany({
      where: { workspace_id: workspaceId, deleted_at: null },
      select: {
        role: true,
        users: {
          select: { username: true }
        }
      }
    });
  }
}
