// ──────────────────────────────────────────
// 이벤트 타입 정의
// ──────────────────────────────────────────
interface WsEventBase {
  type: string;
  workspaceId: string;
}

export interface NodeMoveEvent extends WsEventBase {
  type: 'NODE_MOVE';
  userId: string;
  nodeId: string;
  x: number;
  y: number;
}

export interface NodeCreateEvent extends WsEventBase {
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

export interface NodeDeleteEvent extends WsEventBase {
  type: 'NODE_DELETE';
  nodeId: string;
  userId: string;
}

export interface NodeUpdateEvent extends WsEventBase {
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

export type WsEvent =
  | NodeMoveEvent
  | NodeCreateEvent
  | NodeDeleteEvent
  | NodeUpdateEvent;
