import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { Node } from './node.model';

export type RawNodeItem = Prisma.nodesGetPayload<{
  select: {
    node_id: true;
    title: true;
    node_type: true;
    content: true;
    version: true;
    created_at: true;
    updated_at: true;
    deleted_at: true;
    position_x: true;
    postion_y: true;
    workspace_id: true;
  };
}>;

export type RawEdgeItem = Prisma.edgesGetPayload<{
  select: {
    edge_id: true;
    workspace_id: true;
    source_id: true;
    target_id: true;
    source_handle: true;
    target_handle: true;
    target_side: true;
    version: true;
    created_at: true;
    updated_at: true;
    deleted_at: true;
  };
}>;

@Injectable()
export class NodeRespository {
  constructor(private readonly prisma: PrismaService) {}

  async selectAllNode(
    workspaceId: string,
    userId: string
  ): Promise<RawNodeItem[]> {
    return await this.prisma.nodes.findMany({
      select: {
        node_id: true,
        title: true,
        node_type: true,
        content: true,
        version: true,
        created_at: true,
        updated_at: true,
        deleted_at: true,
        position_x: true,
        postion_y: true,
        workspace_id: true
      },
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

  async selectAllEdge(
    workspaceId: string,
    userId: string
  ): Promise<RawEdgeItem[]> {
    return await this.prisma.edges.findMany({
      select: {
        edge_id: true,
        workspace_id: true,
        source_id: true,
        target_id: true,
        source_handle: true,
        target_handle: true,
        target_side: true,
        version: true,
        created_at: true,
        updated_at: true,
        deleted_at: true
      },
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

  async selectNodeById(
    workspaceId: string,
    nodeId: string
  ): Promise<RawNodeItem | null> {
    return await this.prisma.nodes.findFirst({
      select: {
        node_id: true,
        title: true,
        node_type: true,
        content: true,
        version: true,
        created_at: true,
        updated_at: true,
        deleted_at: true,
        position_x: true,
        postion_y: true,
        workspace_id: true
      },
      where: { node_id: nodeId, workspace_id: workspaceId, deleted_at: null }
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
