import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserRepository } from '../user/user.repository';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../redis/redis.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston/dist/winston.constants';
import { OAuthAccountRepository } from './oauth/oauth-account.repository';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from './guards/jwt.guard';
import { Reflector } from '@nestjs/core';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    getDel: jest.fn(),
  };

  const mockPrismaClient = {
    users: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    oauth_accounts: { create: jest.fn(), updateMany: jest.fn() },
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        Reflector,
        JwtAuthGuard,
        {
          provide: UserRepository,
          useValue: { findByEmail: jest.fn(), findByUserId: jest.fn(), create: jest.fn() },
        },
        {
          provide: OAuthAccountRepository,
          useValue: {
            findByProviderSubject: jest.fn(),
            findByUserAndProvider: jest.fn(),
            listActiveByUser: jest.fn(),
            countActiveByUser: jest.fn(),
            createForUser: jest.fn(),
            softDeleteByUserAndProvider: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            client: mockPrismaClient,
            runInTransaction: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
          },
        },
        {
          provide: WINSTON_MODULE_NEST_PROVIDER,
          useValue: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-token'),
            verify: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: { getClient: jest.fn().mockReturnValue(mockRedisClient) },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── GET /google — login nonce redirect (D-009 보완) ───────────────────

  describe('GET /google', () => {
    it('initiateOAuthLogin 호출 후 res.redirect 실행', async () => {
      const mockUrl = 'https://accounts.google.com/o/oauth2/v2/auth?state=nonce';
      jest.spyOn(authService, 'initiateOAuthLogin').mockResolvedValue(mockUrl);
      const mockRes = { redirect: jest.fn() } as any;

      await controller.googleLogin(mockRes);

      expect(authService.initiateOAuthLogin).toHaveBeenCalled();
      expect(mockRes.redirect).toHaveBeenCalledWith(mockUrl);
    });
  });

  // ─── GET /google/callback — 프론트엔드 리다이렉트 (#75) ─────────────────

  describe('GET /google/callback', () => {
    const FRONTEND_URL = 'http://localhost:3000';

    beforeEach(() => {
      process.env.FRONTEND_URL = FRONTEND_URL;
    });

    it('login: 토큰을 쿼리 파라미터에 실어 리다이렉트한다', async () => {
      jest.spyOn(authService, 'handleGoogleLogin').mockResolvedValue({
        kind: 'login',
        accessToken: 'access-1',
        refreshToken: 'refresh-1',
      });
      const mockRes = { redirect: jest.fn() } as any;

      await controller.googleCallback({ user: {} }, mockRes);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        `${FRONTEND_URL}/oauth/callback?kind=login&accessToken=access-1&refreshToken=refresh-1`
      );
    });

    it('signup_required: ticket 을 쿼리 파라미터에 실어 리다이렉트한다', async () => {
      jest.spyOn(authService, 'handleGoogleLogin').mockResolvedValue({
        kind: 'signup_required',
        ticket: 'ticket-1',
      });
      const mockRes = { redirect: jest.fn() } as any;

      await controller.googleCallback({ user: {} }, mockRes);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        `${FRONTEND_URL}/oauth/callback?kind=signup_required&ticket=ticket-1`
      );
    });

    it('linked: kind 만 실어 리다이렉트한다', async () => {
      jest.spyOn(authService, 'handleGoogleLogin').mockResolvedValue({
        kind: 'linked',
      });
      const mockRes = { redirect: jest.fn() } as any;

      await controller.googleCallback({ user: {} }, mockRes);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        `${FRONTEND_URL}/oauth/callback?kind=linked`
      );
    });

    it('알려진 예외는 reason 코드로 변환해 리다이렉트한다', async () => {
      jest.spyOn(authService, 'handleGoogleLogin').mockRejectedValue(
        new ConflictException(
          '이미 가입된 이메일입니다. 이메일/비밀번호 로그인 후 계정을 연동하세요.'
        )
      );
      const mockRes = { redirect: jest.fn() } as any;

      await controller.googleCallback({ user: {} }, mockRes);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        `${FRONTEND_URL}/oauth/callback?kind=error&reason=email_conflict`
      );
    });

    it('알 수 없는 예외는 oauth_failed 로 리다이렉트한다', async () => {
      jest.spyOn(authService, 'handleGoogleLogin').mockRejectedValue(
        new Error('unexpected')
      );
      const mockRes = { redirect: jest.fn() } as any;

      await controller.googleCallback({ user: {} }, mockRes);

      expect(mockRes.redirect).toHaveBeenCalledWith(
        `${FRONTEND_URL}/oauth/callback?kind=error&reason=oauth_failed`
      );
    });
  });

  // ─── completeOAuthSignup (public — ticket 검증) ─────────────────────────

  describe('POST /oauth/signup/complete', () => {
    it('authService.completeOAuthSignup 를 호출하고 결과를 반환한다', async () => {
      const tokens = { accessToken: 'at', refreshToken: 'rt' };
      jest.spyOn(authService, 'completeOAuthSignup').mockResolvedValue(tokens);

      const result = await controller.completeOAuthSignup({
        ticket: 'some-ticket',
        username: 'testuser',
        agreedToTerms: true,
      });

      expect(authService.completeOAuthSignup).toHaveBeenCalled();
      expect(result).toEqual(tokens);
    });
  });

  // ─── GET /oauth/links ───────────────────────────────────────────────────

  describe('GET /oauth/links', () => {
    it('authService.listOAuthLinks 를 호출하고 결과를 반환한다', async () => {
      const links = [{ provider: 'google', email: 'test@g.com', created_at: new Date() }];
      jest.spyOn(authService, 'listOAuthLinks').mockResolvedValue(links);

      const req = { user: { user_id: 'user-1' } };
      const result = await controller.listLinks(req);

      expect(authService.listOAuthLinks).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(links);
    });
  });

  // ─── DELETE /oauth/link/:provider ──────────────────────────────────────

  describe('DELETE /oauth/link/:provider', () => {
    it('authService.unlinkOAuth 를 호출하고 성공 메시지를 반환한다', async () => {
      jest.spyOn(authService, 'unlinkOAuth').mockResolvedValue(undefined);

      const req = { user: { user_id: 'user-1' } };
      const result = await controller.unlinkOAuth(req, 'google');

      expect(authService.unlinkOAuth).toHaveBeenCalledWith('user-1', 'google');
      expect(result).toBe('연동이 해제되었습니다.');
    });
  });

  // ─── PATCH /password ───────────────────────────────────────────────────

  describe('PATCH /password', () => {
    it('authService.changePassword 를 호출하고 결과를 반환한다', async () => {
      jest.spyOn(authService, 'changePassword').mockResolvedValue('비밀번호가 설정되었습니다.');

      const req = { user: { user_id: 'user-1' } };
      const result = await controller.changePassword(req, { newPassword: 'new123' });

      expect(authService.changePassword).toHaveBeenCalledWith('user-1', { newPassword: 'new123' });
      expect(result).toBe('비밀번호가 설정되었습니다.');
    });
  });

  // ─── JwtAuthGuard 가드 누락 회귀 ────────────────────────────────────────

  describe('JwtAuthGuard 가드 회귀 (D-016)', () => {
    it('listLinks 메타데이터에 JwtAuthGuard 존재', () => {
      const guards = Reflect.getMetadata('__guards__', controller.listLinks);
      // 가드가 등록되어 있는지 확인
      expect(guards).toBeDefined();
    });

    it('unlinkOAuth 메타데이터에 JwtAuthGuard 존재', () => {
      const guards = Reflect.getMetadata('__guards__', controller.unlinkOAuth);
      expect(guards).toBeDefined();
    });

    it('changePassword 메타데이터에 JwtAuthGuard 존재', () => {
      const guards = Reflect.getMetadata('__guards__', controller.changePassword);
      expect(guards).toBeDefined();
    });
  });

  // ─── sendMail 응답: code 필드 없음 (D-011) ──────────────────────────────

  describe('POST /email/send', () => {
    it('authService.sendMail 결과를 그대로 반환한다', async () => {
      jest.spyOn(authService, 'sendMail').mockResolvedValue({ ok: true });

      const result = await controller.sendMessage({ email: 'test@example.com' });

      expect(result).toEqual({ ok: true });
      expect(result).not.toHaveProperty('code');
    });
  });
});
