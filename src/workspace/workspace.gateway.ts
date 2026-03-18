import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/collaboration'
})
export class CollaborationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  handleConnection(socket: Socket) {
    console.log(`[WS] connected: ${socket.id}`);
  }

  handleDisconnect(socket: Socket) {
    console.log(`[WS] disconnected: ${socket.id}`);
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() socket: Socket, @MessageBody() data: any) {
    socket.emit('pong', { message: 'pong', data });
    console.log(socket);
  }
}
