import { Injectable } from '@nestjs/common';
import { Prisma, nodes, node_type_enum } from '../generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { Node } from './node.model';

export type FtsRow = {
  nodeId: string;
  workspaceId: string;
  title: string | null;
  nodeType: string;
  depth: number | null;
  positionX: number | null;
  positionY: number | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  score: number;
  snippet: string;
};

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
    depth: true;
  };
}>;

export type CreatNodeItem = Prisma.nodesGetPayload<{
  select: {
    node_id: true;
    workspace_id : true
    title: true;
    node_type: true;
    position_x: true;
    position_y: true;
    content: true;
    created_at: true;
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
    return await this.prisma.client.nodes.findMany({
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
        workspace_id: true,
        depth: true
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
    return await this.prisma.client.edges.findMany({
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
    return await this.prisma.client.nodes.findFirst({
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
        workspace_id: true,
        depth: true
      },
      where: { node_id: nodeId, workspace_id: workspaceId, deleted_at: null }
    });
  }

  async insertNode(node: Node): Promise<CreatNodeItem> {
    return await this.prisma.client.nodes.create({
      data: {
        title: node.title,
        node_type: node.nodeType,
        position_x: node.position.x,
        position_y: node.position.y,
        workspace_id: node.workspaceId,
        depth: node.depth,
        content: node.data as unknown as Prisma.InputJsonValue
      },
      select: {
        node_id: true,
        workspace_id : true,
        title: true,
        node_type: true,
        position_x: true,
        position_y: true,
        content: true,
        created_at: true
      }
    });
  }

  async selectAllDescendantIds(
    workspaceId: string,
    nodeId: string
  ): Promise<string[]> {
    const rows = await this.prisma.client.$queryRaw<{ node_id: string }[]>`
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

  async selectNodesByIds(workspaceId: string, nodeIds: string[]) {
    return this.prisma.client.nodes.findMany({
      where: {
        node_id: { in: nodeIds },
        workspace_id: workspaceId,
        deleted_at: null
      }
    });
  }

  async updateNodePositionDelta(
    workspaceId: string,
    nodeIds: string[],
    deltaX: number,
    deltaY: number
  ) {
    return await this.prisma.client.nodes.updateMany({
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
      nodeType?: node_type_enum;
    }
  ) {
    return await this.prisma.client.nodes.update({
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
        ...(updates.nodeType !== undefined && {
          node_type: updates.nodeType
        }),
        version: { increment: 1 }
      }
    });
  }

  async searchByQuery(
    workspaceId: string,
    query: string
  ): Promise<RawNodeItem[]> {
    return await this.prisma.client.nodes.findMany({
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
        workspace_id: true,
        depth: true
      },
      where: {
        workspace_id: workspaceId,
        deleted_at: null,
        OR: [
          { title: { contains: query } },
          {
            content: {
              string_contains: query
            }
          }
        ]
      }
    });
  }

  async searchByFts(
    workspaceId: string,
    query: string,
    limit: number,
    cursor: { score: number; nodeId: string } | null
  ): Promise<FtsRow[]> {
    const fetchSize = limit + 1;
    const rows = cursor
      ? await this.prisma.client.$queryRaw<FtsRow[]>`
          SELECT
            node_id      AS "nodeId",
            workspace_id AS "workspaceId",
            title,
            node_type    AS "nodeType",
            depth,
            position_x   AS "positionX",
            position_y   AS "positionY",
            version,
            created_at   AS "createdAt",
            updated_at   AS "updatedAt",
            similarity(search_text, ${query})::float AS score,
            CASE
              WHEN position(lower(${query}) in lower(search_text)) > 0
                THEN substring(
                  search_text
                  FROM greatest(1, position(lower(${query}) in lower(search_text)) - 40)
                  FOR 120
                )
              ELSE left(coalesce(search_text, ''), 120)
            END AS snippet
          FROM nodes
          WHERE workspace_id = ${workspaceId}::uuid
            AND deleted_at IS NULL
            AND search_text % ${query}
            AND (
              similarity(search_text, ${query}) < ${cursor.score}
              OR (
                similarity(search_text, ${query}) = ${cursor.score}
                AND node_id > ${cursor.nodeId}::uuid
              )
            )
          ORDER BY score DESC, "nodeId" ASC
          LIMIT ${fetchSize}
        `
      : await this.prisma.client.$queryRaw<FtsRow[]>`
          SELECT
            node_id      AS "nodeId",
            workspace_id AS "workspaceId",
            title,
            node_type    AS "nodeType",
            depth,
            position_x   AS "positionX",
            position_y   AS "positionY",
            version,
            created_at   AS "createdAt",
            updated_at   AS "updatedAt",
            similarity(search_text, ${query})::float AS score,
            CASE
              WHEN position(lower(${query}) in lower(search_text)) > 0
                THEN substring(
                  search_text
                  FROM greatest(1, position(lower(${query}) in lower(search_text)) - 40)
                  FOR 120
                )
              ELSE left(coalesce(search_text, ''), 120)
            END AS snippet
          FROM nodes
          WHERE workspace_id = ${workspaceId}::uuid
            AND deleted_at IS NULL
            AND search_text % ${query}
          ORDER BY score DESC, "nodeId" ASC
          LIMIT ${fetchSize}
        `;
    return rows;
  }

  async deleteNode(nodeId: string) {
    await this.prisma.client.nodes.update({
      where: { node_id: nodeId },
      data: { deleted_at: new Date(), updated_at: new Date() }
    });
  }

  async increasDepth(nodeId: string, increase: number) {
    await this.prisma.client.nodes.update({
      where: { node_id: nodeId },
      data: { depth: { increment: increase } }
    });
  }

  async increaseDepthMany(
    workspaceId: string,
    nodeIds: string[],
    amount: number
  ) {
    await this.prisma.client.nodes.updateMany({
      where: {
        node_id: { in: nodeIds },
        workspace_id: workspaceId,
        deleted_at: null
      },
      data: { depth: { increment: amount } }
    });
  }
}
