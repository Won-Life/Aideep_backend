import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class NodeRespository {
  constructor(private readonly prisma: PrismaService) {}

  async selectAllNode(workspaceId: string, userId: string) {
    return await this.prisma.nodes.findMany({
      where: {
        workspace_id: workspaceId,
        deleted_at: null,
        workspaces: {
          users_workspaces: {
            some: { user_id: userId }
          }
        }
      }
    });
  }

  async selectAllEdge(workspaceId: string, userId: string) {
    return await this.prisma.edges.findMany({
      where: {
        workspace_id: workspaceId,
        deleted_at: null,
        workspaces: {
          users_workspaces: {
            some: { user_id: userId }
          }
        }
      }
    });
  }
}
