import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { Node } from './node.model';

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

  async insertNode(node: Node) {
    return await this.prisma.nodes.create({
      data: {
        title: node.title,
        node_type: node.nodeType,
        position_x: node.position.x,
        postion_y: node.position.y,
        workspace_id: node.workspaceId,
        content: node.data as unknown as Prisma.InputJsonValue
      }
    });
  }
}
