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
    position_y: true;
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
    version: true;
    created_at: true;
    updated_at: true;
    deleted_at: true;
  };
}>;

@Injectable()
export class NodeRepository {
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
        position_y: true,
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
        position_y: true,
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
        position_y: node.position.y,
        workspace_id: node.workspaceId,
        content: node.data as unknown as Prisma.InputJsonValue
      }
    });
  }

  async selectAllDescendantIds(
    workspaceId: string,
    nodeId: string
  ): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ node_id: string }[]>`
      WITH RECURSIVE descendants AS (
        SELECT target_id AS node_id
        FROM edges
        WHERE source_id = ${nodeId}::uuid
          AND workspace_id = ${workspaceId}::uuid
          AND deleted_at IS NULL
        UNION ALL
        SELECT e.target_id
        FROM edges e
        INNER JOIN descendants d ON e.source_id = d.node_id
        WHERE e.workspace_id = ${workspaceId}::uuid
          AND e.deleted_at IS NULL
      )
      SELECT DISTINCT node_id FROM descendants
    `;
    return rows.map((r) => r.node_id);
  }

  async updateNodePositionDelta(
    workspaceId: string,
    nodeIds: string[],
    deltaX: number,
    deltaY: number
  ) {
    return await this.prisma.nodes.updateMany({
      where: {
        node_id: { in: nodeIds },
        workspace_id: workspaceId,
        deleted_at: null
      },
      data: {
        position_x: { increment: deltaX },
        position_y: { increment: deltaY },
        version: { increment: 1 }
      }
    });
  }

  async updateNode(
    workspaceId: string,
    nodeId: string,
    updates: {
      title?: string;
      positionX?: number;
      positionY?: number;
      content?: Prisma.InputJsonValue;
    }
  ) {
    return await this.prisma.nodes.update({
      where: { node_id: nodeId, workspace_id: workspaceId, deleted_at: null },
      data: {
        ...(updates.title !== undefined && { title: updates.title }),
        ...(updates.positionX !== undefined && {
          position_x: updates.positionX
        }),
        ...(updates.positionY !== undefined && {
          position_y: updates.positionY
        }),
        ...(updates.content !== undefined && { content: updates.content }),
        version: { increment: 1 }
      }
    });
  }
}
