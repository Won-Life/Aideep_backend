import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { WsEvent } from './ws.event';
import { YjsDocManager } from '../yjs/yjs-doc-manager';
import { WorkspaceRepository } from '../workspace/workspace.repository';
import { YJS_EVENT, yjsRoom } from '../yjs/yjs.constants';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/workspace'
})
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(WsGateway.name);

  @WebSocketServer()
  server: Server;

  /** socketId → 참여 중인 yjs nodeId 집합 */
  private readonly yjsRooms = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly yjsDocManager: YjsDocManager,
    private readonly workspaceRepository: WorkspaceRepository
  ) {}

  // ── 연결 / 해제 ───────────────────────────────────────────────

  async handleConnection(client: Socket) {
    const token =
      client.handshake.auth?.token ??
      (client.handshake.query?.token as string) ??
      null;

    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token);
      client.data.userId = payload.user_id;
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const workspaceId = client.data?.workspaceId;
    if (workspaceId) {
      client.to(workspaceId).emit('cursor_leave', {
        userId: client.data.userId
      });
    }

    // Yjs cleanup: 모든 참여 중인 doc에서 제거
    const nodeIds = this.yjsRooms.get(client.id);
    if (nodeIds) {
      for (const nodeId of nodeIds) {
        this.yjsDocManager.removeClient(nodeId, client.id);
      }
      this.yjsRooms.delete(client.id);
    }
  }

  // ── 기존 이벤트 (변경 없음) ───────────────────────────────────

  @SubscribeMessage('join_workspace')
  handleJoin(
    @MessageBody() payload: { workspaceId: string },
    @ConnectedSocket() client: Socket
  ) {
    client.join(payload.workspaceId);
    client.data.workspaceId = payload.workspaceId;
  }

  @SubscribeMessage('node_position_live')
  handleLivePosition(
    @MessageBody()
    payload: { workspaceId: string; nodeId: string; x: number; y: number },
    @ConnectedSocket() client: Socket
  ) {
    client.to(payload.workspaceId).emit('node_position_live', payload);
  }

  @SubscribeMessage('cursor_move')
  handleCursorMove(
    @MessageBody()
    payload: {
      workspaceId: string;
      x: number;
      y: number;
      userName: string;
      color: string;
    },
    @ConnectedSocket() client: Socket
  ) {
    client.to(payload.workspaceId).emit('cursor_move', {
      userId: client.data.userId,
      ...payload
    });
  }

  // ── Yjs CRDT 이벤트 ──────────────────────────────────────────

  @SubscribeMessage(YJS_EVENT.JOIN)
  async handleYjsJoin(
    @MessageBody() payload: { nodeId: string },
    @ConnectedSocket() client: Socket
  ) {
    const userId = client.data.userId;
    const workspaceId = client.data.workspaceId;

    if (!userId || !workspaceId) {
      return { ok: false, error: 'join_workspace 먼저 호출하세요' };
    }

    // 권한 확인
    const membership = await this.workspaceRepository.checkWorkspace(
      userId,
      workspaceId
    );
    if (!membership) {
      return { ok: false, error: '워크스페이스 멤버가 아닙니다' };
    }

    const readOnly = membership.role === 'VIEWER';
    const { nodeId } = payload;

    // Doc 로드/생성
    const doc = await this.yjsDocManager.getOrCreateDoc(nodeId, workspaceId);

    // Room join + 클라이언트 등록
    client.join(yjsRoom(nodeId));
    this.yjsDocManager.addClient(nodeId, client.id);

    // 소켓별 yjs room 추적
    if (!this.yjsRooms.has(client.id)) {
      this.yjsRooms.set(client.id, new Set());
    }
    this.yjsRooms.get(client.id)!.add(nodeId);

    // SyncStep1 전송: 서버의 state vector를 클라이언트에 전달
    const encoder = encoding.createEncoder();
    syncProtocol.writeSyncStep1(encoder, doc);
    client.emit(YJS_EVENT.SYNC, {
      nodeId,
      data: Buffer.from(encoding.toUint8Array(encoder))
    });

    return { ok: true, readOnly };
  }

  @SubscribeMessage(YJS_EVENT.SYNC)
  handleYjsSync(
    @MessageBody() payload: { nodeId: string; data: Buffer },
    @ConnectedSocket() client: Socket
  ) {
    const { nodeId, data } = payload;
    const managed = this.yjsDocManager['docs']?.get(nodeId);
    if (!managed) return;

    const update = new Uint8Array(
      Buffer.isBuffer(data)
        ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        : data
    );

    const decoder = decoding.createDecoder(update);
    const encoder = encoding.createEncoder();
    const messageType = syncProtocol.readSyncMessage(
      decoder,
      encoder,
      managed.doc,
      null
    );

    // 응답이 있으면 (SyncStep2) 요청자에게 전송
    if (encoding.length(encoder) > 0) {
      client.emit(YJS_EVENT.SYNC, {
        nodeId,
        data: Buffer.from(encoding.toUint8Array(encoder))
      });
    }

    // Update 메시지(messageType === 2)면 다른 클라이언트에 브로드캐스트 + 서버 doc에 적용
    if (messageType === 2) {
      // VIEWER면 update 차단
      const membership = client.data.yjsReadOnly;
      if (membership) return;

      client.to(yjsRoom(nodeId)).emit(YJS_EVENT.SYNC, { nodeId, data });
      this.yjsDocManager.applyUpdate(nodeId, update);
    }
  }

  @SubscribeMessage(YJS_EVENT.AWARENESS)
  handleYjsAwareness(
    @MessageBody() payload: { nodeId: string; data: Buffer },
    @ConnectedSocket() client: Socket
  ) {
    client.to(yjsRoom(payload.nodeId)).emit(YJS_EVENT.AWARENESS, payload);
  }

  @SubscribeMessage(YJS_EVENT.LEAVE)
  handleYjsLeave(
    @MessageBody() payload: { nodeId: string },
    @ConnectedSocket() client: Socket
  ) {
    const { nodeId } = payload;
    client.leave(yjsRoom(nodeId));
    this.yjsDocManager.removeClient(nodeId, client.id);

    const rooms = this.yjsRooms.get(client.id);
    if (rooms) {
      rooms.delete(nodeId);
      if (rooms.size === 0) this.yjsRooms.delete(client.id);
    }
  }

  // ── Broadcast (REST → WS) ────────────────────────────────────

  broadcast(event: WsEvent): void {
    this.server.to(event.workspaceId).emit('workspace_event', event);

    // 노드 삭제 시 Yjs doc 정리
    if (event.type === 'NODE_DELETE') {
      this.yjsDocManager.cleanupNode(event.nodeId).catch((err) => {
        this.logger.error(`Yjs cleanup failed for ${event.nodeId}`, err);
      });
    }
  }
}
