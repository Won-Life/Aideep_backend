import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { createWorkspaceBody } from './dto/createWorkspace.dto';

@Injectable()
export class WorkspaceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insertWorkspace(body: createWorkspaceBody) {
    return await this.prisma.workspaces.create({
      data: {
        title: body.title
      }
    });
  }

  async insertWorkspaceUser(
    userId: string,
    workspaceId: string,
    body: createWorkspaceBody
  ) {
    await this.prisma.users_workspaces.create({
      data: {
        user_id: userId,
        workspace_id: workspaceId,
        role: body.role
      }
    });
  }
}
