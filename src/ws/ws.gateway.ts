import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { SseEvent } from '../sse/sse.event';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/workspace',
})
export class WsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    const token =
      client.handshake.auth?.token ??
      (client.handshake.query?.token as string) ?? null;

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
    @ConnectedSocket() client: Socket,
  ) {
    client.join(payload.workspaceId);
  }

  broadcast(event: SseEvent): void {
    this.server.to(event.workspaceId).emit('workspace_event', event);
  }
}
