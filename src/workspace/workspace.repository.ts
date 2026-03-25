import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateWorkspaceBody } from './dto/createWorkspace.dto';
import { workspace_role_enum } from '@prisma/client';

@Injectable()
export class WorkspaceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async selectUserWorkspace(userId: string) {
    return await this.prisma.users_workspaces.findMany({
      where: {
        user_id: userId
      },
      include: {
        workspaces: {
          select: { title: true }
        }
      }
    });
  }

  async insertWorkspace(body: CreateWorkspaceBody) {
    return await this.prisma.workspaces.create({
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
    await this.prisma.users_workspaces.create({
      data: {
        user_id: userId,
        workspace_id: workspaceId,
        role: role
      }
    });
  }

  async checkWorkspace(userId: string, workspaceId: string) {
    return await this.prisma.users_workspaces.findFirst({
      where: {
        user_id: userId,
        workspace_id: workspaceId
      }
    });
  }
}
