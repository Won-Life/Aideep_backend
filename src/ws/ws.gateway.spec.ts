import { Test, TestingModule } from '@nestjs/testing';
import { WsGateway } from './ws.gateway';
import { JwtService } from '@nestjs/jwt';
import { Socket, Server } from 'socket.io';

describe('WsGateway', () => {
  let gateway: WsGateway;
  let jwtService: JwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WsGateway,
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn(),
          },
        },
      ],
    }).compile();

    gateway = module.get<WsGateway>(WsGateway);
    jwtService = module.get<JwtService>(JwtService);

    // Inject a mock Server
    gateway.server = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    } as unknown as Server;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should disconnect client when no token is provided', async () => {
      const client = {
        handshake: { auth: {}, query: {} },
        disconnect: jest.fn(),
        data: {},
      } as unknown as Socket;

      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should set userId on client.data when token is valid', async () => {
      const mockPayload = { user_id: 'user-123' };
      (jwtService.verify as jest.Mock).mockReturnValue(mockPayload);

      const client = {
        handshake: { auth: { token: 'valid-token' }, query: {} },
        disconnect: jest.fn(),
        data: {},
      } as unknown as Socket;

      await gateway.handleConnection(client);
      expect(jwtService.verify).toHaveBeenCalledWith('valid-token');
      expect(client.data.userId).toBe('user-123');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('should disconnect client when token verification fails', async () => {
      (jwtService.verify as jest.Mock).mockImplementation(() => {
        throw new Error('invalid token');
      });

      const client = {
        handshake: { auth: { token: 'bad-token' }, query: {} },
        disconnect: jest.fn(),
        data: {},
      } as unknown as Socket;

      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('should accept token from query parameter', async () => {
      const mockPayload = { user_id: 'user-456' };
      (jwtService.verify as jest.Mock).mockReturnValue(mockPayload);

      const client = {
        handshake: { auth: {}, query: { token: 'query-token' } },
        disconnect: jest.fn(),
        data: {},
      } as unknown as Socket;

      await gateway.handleConnection(client);
      expect(jwtService.verify).toHaveBeenCalledWith('query-token');
      expect(client.data.userId).toBe('user-456');
    });
  });

  describe('handleJoin', () => {
    it('should join the client to the workspace room', () => {
      const client = {
        join: jest.fn(),
      } as unknown as Socket;

      gateway.handleJoin({ workspaceId: 'ws-abc' }, client);
      expect(client.join).toHaveBeenCalledWith('ws-abc');
    });
  });

  describe('broadcast', () => {
    it('should emit workspace_event to the correct room', () => {
      const event = {
        type: 'NODE_CREATE' as const,
        workspaceId: 'ws-abc',
        userId: 'user-1',
        node: {
          nodeId: 'n1',
          title: 'Test',
          nodeType: 'PROJECT',
          position: { x: 0, y: 0 },
          data: {},
          createdAt: '2026-01-01',
        },
      };

      gateway.broadcast(event);
      expect(gateway.server.to).toHaveBeenCalledWith('ws-abc');
      expect(
        (gateway.server.to('ws-abc') as unknown as { emit: jest.Mock }).emit,
      ).toHaveBeenCalledWith('workspace_event', event);
    });
  });
});
