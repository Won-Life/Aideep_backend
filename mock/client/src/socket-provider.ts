import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { Observable } from 'lib0/observable';
import { io, Socket } from 'socket.io-client';

const YJS_EVENT = {
  JOIN: 'yjs:join',
  LEAVE: 'yjs:leave',
  SYNC: 'yjs:sync',
  AWARENESS: 'yjs:awareness'
} as const;

export interface ProviderOptions {
  serverUrl: string;
  token: string;
  workspaceId: string;
  nodeId: string;
  userName: string;
  userColor: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

/**
 * Socket.io 기반 Yjs Provider
 * - lib0/observable.Observable을 상속하여 Lexical CollaborationPlugin의
 *   Provider 인터페이스(on/off/emit)를 직접 충족
 * - 이벤트: 'sync', 'status', 'update'
 */
export class SocketYjsProvider extends Observable<string> {
  readonly doc: Y.Doc;
  readonly awareness: awarenessProtocol.Awareness;

  private socket: Socket | null = null;
  private _synced = false;
  private _status: ConnectionStatus = 'disconnected';
  private logListeners = new Set<(msg: string) => void>();

  constructor(private readonly opts: ProviderOptions) {
    super();
    this.doc = new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);

    // awareness 변경 시 서버에 전송
    this.awareness.on('update', ({ added, updated, removed }: any) => {
      if (!this.socket?.connected) return;
      const changedClients = [...added, ...updated, ...removed];
      const enc = encoding.createEncoder();
      encoding.writeVarUint8Array(
        enc,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
      );
      this.socket.emit(YJS_EVENT.AWARENESS, {
        nodeId: this.opts.nodeId,
        data: Array.from(encoding.toUint8Array(enc))
      });
    });

    // doc 변경 시 서버에 sync 전송
    this.doc.on('update', (update: Uint8Array, origin: any) => {
      // 서버(remote)에서 온 업데이트는 재전송하지 않음
      if (origin === this) return;

      if (!this.socket?.connected) return;
      const encoder = encoding.createEncoder();
      syncProtocol.writeUpdate(encoder, update);
      this.socket.emit(YJS_EVENT.SYNC, {
        nodeId: this.opts.nodeId,
        data: Array.from(encoding.toUint8Array(encoder))
      });
    });
  }

  get synced(): boolean {
    return this._synced;
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  /**
   * 새 리스너 등록 시 현재 상태를 즉시 전달 (replay).
   * CollaborationPlugin이 sync 이벤트 이후에 마운트되어도 바인딩 초기화 가능.
   */
  on(name: string, fn: (...args: any[]) => void): void {
    super.on(name, fn);
    if (name === 'sync') {
      fn(this._synced);
    } else if (name === 'status') {
      fn({ status: this._status });
    }
  }

  /**
   * CollaborationPlugin이 호출하는 connect/disconnect는 무시.
   * 실제 소켓 생명주기는 manualConnect()/manualDisconnect()로 관리.
   */
  connect(): void {
    // CollaborationPlugin이 호출 → 무시 (이미 연결됨)
  }

  disconnect(): void {
    // CollaborationPlugin이 호출 → 무시 (App에서 destroy로 정리)
  }

  manualConnect(): void {
    if (this.socket) return;

    this._status = 'connecting';
    this.emit('status', [{ status: 'connecting' }]);
    this.log('Connecting...');

    this.socket = io(`${this.opts.serverUrl}/workspace`, {
      auth: { token: this.opts.token },
      transports: ['websocket'],
      reconnection: false,
    });

    this.socket.on('connect', () => {
      this.log('Socket connected, joining workspace...');

      // 1) join_workspace
      this.socket!.emit('join_workspace', {
        workspaceId: this.opts.workspaceId
      });

      // 2) yjs:join
      this.socket!.emit(
        YJS_EVENT.JOIN,
        { nodeId: this.opts.nodeId },
        (res: { ok: boolean; readOnly?: boolean; error?: string }) => {
          if (res.ok) {
            this._status = 'connected';
            this.emit('status', [{ status: 'connected' }]);
            this.log(
              `Joined node ${this.opts.nodeId} (readOnly: ${res.readOnly})`
            );

            // awareness에 자신의 정보 세팅
            this.awareness.setLocalStateField('user', {
              name: this.opts.userName,
              color: this.opts.userColor,
              colorLight: this.opts.userColor + '40'
            });
          } else {
            this.log(`Join failed: ${res.error}`);
            this._status = 'disconnected';
            this.emit('status', [{ status: 'disconnected' }]);
          }
        }
      );
    });

    // yjs:sync 메시지 처리
    this.socket.on(
      YJS_EVENT.SYNC,
      (payload: { nodeId: string; data: number[] }) => {
        if (payload.nodeId !== this.opts.nodeId) return;

        const buf = new Uint8Array(payload.data);
        const decoder = decoding.createDecoder(buf);
        const encoder = encoding.createEncoder();

        // origin을 this(provider)로 설정하여 doc.on('update')에서 재전송 방지
        const msgType = syncProtocol.readSyncMessage(
          decoder,
          encoder,
          this.doc,
          this
        );

        // 응답이 있으면(SyncStep2 응답) 서버에 전송
        if (encoding.length(encoder) > 0) {
          this.socket?.emit(YJS_EVENT.SYNC, {
            nodeId: this.opts.nodeId,
            data: Array.from(encoding.toUint8Array(encoder))
          });
        }

        if (msgType === 0) {
          this.log('Received SyncStep1 from server');
          // 양방향 sync: 클라이언트도 SyncStep1을 보내서
          // 서버가 SyncStep2(서버 상태)를 돌려주도록 함
          const step1Encoder = encoding.createEncoder();
          syncProtocol.writeSyncStep1(step1Encoder, this.doc);
          this.socket?.emit(YJS_EVENT.SYNC, {
            nodeId: this.opts.nodeId,
            data: Array.from(encoding.toUint8Array(step1Encoder)),
          });
          this.log('Sent client SyncStep1 to server');
        } else if (msgType === 1) {
          // SyncStep2 수신 = 초기 동기화 완료
          this.log('Received SyncStep2 from server → synced');
          if (!this._synced) {
            this._synced = true;
            this.emit('sync', [true]);
          }
        } else if (msgType === 2) {
          this.log('Received remote update');
        }
      }
    );

    // yjs:awareness 메시지 처리
    this.socket.on(
      YJS_EVENT.AWARENESS,
      (payload: { nodeId: string; data: number[] }) => {
        if (payload.nodeId !== this.opts.nodeId) return;

        const decoder = decoding.createDecoder(new Uint8Array(payload.data));
        awarenessProtocol.applyAwarenessUpdate(
          this.awareness,
          decoding.readVarUint8Array(decoder),
          'remote'
        );
      }
    );

    this.socket.on('disconnect', (reason: string) => {
      this.log(`Disconnected: ${reason}`);
      this._status = 'disconnected';
      this._synced = false;
      this.emit('status', [{ status: 'disconnected' }]);
      this.emit('sync', [false]);
    });

    this.socket.on('connect_error', (err: Error) => {
      this.log(`Connection error: ${err.message}`);
      this._status = 'disconnected';
      this.emit('status', [{ status: 'disconnected' }]);
    });
  }

  manualDisconnect(): void {
    if (!this.socket) return;

    this.socket.emit(YJS_EVENT.LEAVE, { nodeId: this.opts.nodeId });
    this.socket.disconnect();
    this.socket = null;
    this._status = 'disconnected';
    this._synced = false;
    this.emit('status', [{ status: 'disconnected' }]);
    this.emit('sync', [false]);
    this.log('Disconnected');
  }

  destroy(): void {
    this.manualDisconnect();
    this.awareness.destroy();
    this.doc.destroy();
    this.logListeners.clear();
    super.destroy();
  }

  // ── Log ──

  onLog(fn: (msg: string) => void): () => void {
    this.logListeners.add(fn);
    return () => this.logListeners.delete(fn);
  }

  private log(msg: string): void {
    this.logListeners.forEach((fn) => fn(msg));
  }
}
