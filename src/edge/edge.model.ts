import { ConnectNodeDto } from './dto/connectNode.dto';

export class Edge {
  id: string;
  workspaceId: string;
  userId: string;
  sourceId: string;
  targetId: string;

  sourceHandle: string;
  targetHandle: string;

  static create(
    dto: ConnectNodeDto,
    workspaceId: string,
    userId: string
  ): Edge {
    const edge = new Edge();
    edge.sourceId = dto.sourceId;
    edge.sourceHandle = dto.sourceHandle;
    edge.targetId = dto.targetId;
    edge.targetHandle = dto.targetHandle;
    edge.workspaceId = workspaceId;
    edge.userId = userId;
    return edge;
  }
}
