// ──────────────────────────────────────────
// 이벤트 타입 정의
// ──────────────────────────────────────────
interface SseEventBase {
  type: string;
  workspaceId: string;
}

export interface NodeMoveEvent extends SseEventBase {
  type: 'NODE_MOVE';
  userId: string;
  nodeId: string;
  x: number;
  y: number;
}

export interface NodeCreateEvent extends SseEventBase {
  type: 'NODE_CREATE';
  userId: string;
  node: {
    nodeId: string;
    title: string;
    nodeType: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
    createdAt: string;
  };
}

export interface NodeDeleteEvent extends SseEventBase {
  type: 'NODE_DELETE';
  nodeId: string;
  userId: string;
}

export interface NodeUpdateEvent extends SseEventBase {
  type: 'NODE_UPDATE';
  nodeId: string;
  userId: string;
  patch: {
    title?: string;
    position?: { x: number; y: number };
    data?: Record<string, unknown>;
  };
}

// 이벤트 추가 시 여기에 union으로 추가

export type SseEvent =
  | NodeMoveEvent
  | NodeCreateEvent
  | NodeDeleteEvent
  | NodeUpdateEvent;
