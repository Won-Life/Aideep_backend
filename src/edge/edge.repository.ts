import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Edge } from './edge.model';

@Injectable()
export class EdgeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findEdge(sourceId: string, targetId: string) {
    return await this.prisma.client.edges.findFirst({
      where: { source_id: sourceId, target_id: targetId }
    });
  }

  async findEdgeById(edgeId: string) {
    return await this.prisma.client.edges.findFirst({
      where: { edge_id: edgeId }
    });
  }

  async findEdgesBySource(sourceId: string) {
    return await this.prisma.client.edges.findMany({
      where: { source_id: sourceId }
    });
  }

  async findAllEdgesInWorkspace(workspaceId: string) {
    return await this.prisma.client.edges.findMany({
      where: { workspace_id: workspaceId },
      select: { source_id: true, target_id: true }
    });
  }

  async deleteEdgesByNodeId(nodeId: string): Promise<void> {
    await this.prisma.client.edges.deleteMany({
      where: {
        OR: [{ source_id: nodeId }, { target_id: nodeId }]
      }
    });
  }

  async deleteEdge(edgeId: string) {
    await this.prisma.client.edges.delete({
      where: { edge_id: edgeId }
    });
  }

  async updateEdge(
    edgeId: string,
    updates: { sourceHandle?: string; targetHandle?: string }
  ) {
    return await this.prisma.client.edges.update({
      where: { edge_id: edgeId },
      data: {
        ...(updates.sourceHandle !== undefined && {
          source_handle: updates.sourceHandle
        }),
        ...(updates.targetHandle !== undefined && {
          target_handle: updates.targetHandle
        }),
        version: { increment: 1 }
      }
    });
  }

  async createEdge(dto: Edge) {
    return await this.prisma.client.edges.create({
      data: {
        source_id: dto.sourceId,
        target_id: dto.targetId,
        workspace_id: dto.workspaceId,
        source_handle: dto.sourceHandle,
        target_handle: dto.targetHandle
      }
    });
  }
}
