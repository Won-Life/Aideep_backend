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
import { WsEvent } from './ws.event';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/workspace'
})
export class WsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

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

  handleDisconnect(client: Socket) {
    const workspaceId = client.data?.workspaceId;
    if (!workspaceId) return;

    client.to(workspaceId).emit('cursor_leave', {
      userId: client.data.userId
    });
  }

  broadcast(event: WsEvent): void {
    this.server.to(event.workspaceId).emit('workspace_event', event);
  }
}
