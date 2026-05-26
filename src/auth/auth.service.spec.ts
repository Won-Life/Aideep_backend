import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UserRepository } from '../user/user.repository';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../redis/redis.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston/dist/winston.constants';
import { OAuthAccountRepository } from './oauth/oauth-account.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConflictException,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: jest.Mocked<UserRepository>;

  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    getDel: jest.fn(),
  };

  const mockPrismaClient = {
    users: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    oauth_accounts: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  const mockOAuthAccountRepository = {
    findByProviderSubject: jest.fn(),
    findByUserAndProvider: jest.fn(),
    listActiveByUser: jest.fn(),
    countActiveByUser: jest.fn(),
    createForUser: jest.fn(),
    softDeleteByUserAndProvider: jest.fn(),
  };

  const mockPrismaService = {
    client: mockPrismaClient,
    runInTransaction: jest.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UserRepository,
          useValue: {
            findByEmail: jest.fn(),
            findByUserId: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: OAuthAccountRepository,
          useValue: mockOAuthAccountRepository,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
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

    service = module.get<AuthService>(AuthService);
    userRepo = module.get(UserRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── handleGoogleLogin: state 필수 검증 (D-009 보완) ─────────────────────

  describe('handleGoogleLogin — state 검증', () => {
    it('state 누락 시 UnauthorizedException', async () => {
      const profile = { id: 'gid', email: 'a@b.com', displayName: 'A', state: undefined as any };
      await expect(service.handleGoogleLogin(profile)).rejects.toThrow(UnauthorizedException);
    });

    it('state 가 Redis 에 없으면 UnauthorizedException (invalid state)', async () => {
      mockRedisClient.getDel.mockResolvedValue(null);
      const profile = { id: 'gid', email: 'a@b.com', displayName: 'A', state: 'bad-nonce' };
      await expect(service.handleGoogleLogin(profile)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── handleGoogleLogin: login mode 분기 ──────────────────────────────────

  describe('handleGoogleLogin — login mode', () => {
    const profileLogin = { id: 'google-123', email: 'test@example.com', displayName: 'Test', state: 'valid-nonce' };

    beforeEach(() => {
      mockRedisClient.getDel.mockResolvedValue(JSON.stringify({ mode: 'login' }));
    });

    it('oauth_account 존재 시 kind:login + 토큰 반환', async () => {
      mockOAuthAccountRepository.findByProviderSubject.mockResolvedValue({
        oauth_account_id: 'acc-1',
        user_id: 'user-1',
        provider: 'google',
        provider_user_id: 'google-123',
        deleted_at: null,
      });
      (userRepo.findByUserId as jest.Mock).mockResolvedValue({
        user_id: 'user-1', username: 'testuser', email: 'test@example.com',
      });
      mockRedisClient.set.mockResolvedValue('OK');

      const result = await service.handleGoogleLogin(profileLogin);

      expect(result).toMatchObject({ kind: 'login', accessToken: 'mock-token', refreshToken: 'mock-token' });
    });

    it('신규 사용자, 이메일 미충돌 → kind:signup_required + ticket', async () => {
      mockOAuthAccountRepository.findByProviderSubject.mockResolvedValue(null);
      (userRepo.findByEmail as jest.Mock).mockResolvedValue(null);
      mockRedisClient.set.mockResolvedValue('OK');

      const result = await service.handleGoogleLogin(profileLogin);

      expect(result).toMatchObject({ kind: 'signup_required' });
      expect((result as any).ticket).toBeDefined();
    });

    it('이메일 충돌 → ConflictException (409)', async () => {
      mockOAuthAccountRepository.findByProviderSubject.mockResolvedValue(null);
      (userRepo.findByEmail as jest.Mock).mockResolvedValue({ user_id: 'existing' });

      await expect(service.handleGoogleLogin(profileLogin)).rejects.toThrow(ConflictException);
    });
  });

  // ─── handleGoogleLogin: link mode 분기 ───────────────────────────────────

  describe('handleGoogleLogin — link mode', () => {
    const profileLink = { id: 'google-123', email: 'test@example.com', displayName: 'Test', state: 'link-nonce' };

    it('link 성공 → kind:linked', async () => {
      mockRedisClient.getDel.mockResolvedValue(JSON.stringify({ mode: 'link', user_id: 'user-1' }));
      mockOAuthAccountRepository.findByProviderSubject.mockResolvedValue(null);
      mockOAuthAccountRepository.findByUserAndProvider.mockResolvedValue(null);
      mockOAuthAccountRepository.createForUser.mockResolvedValue({});

      const result = await service.handleGoogleLogin(profileLink);

      expect(result).toMatchObject({ kind: 'linked' });
    });

    it('이미 연동된 provider → ConflictException', async () => {
      mockRedisClient.getDel.mockResolvedValue(JSON.stringify({ mode: 'link', user_id: 'user-1' }));
      mockOAuthAccountRepository.findByProviderSubject.mockResolvedValue(null);
      mockOAuthAccountRepository.findByUserAndProvider.mockResolvedValue({
        oauth_account_id: 'acc-1', user_id: 'user-1', provider: 'google',
      });

      await expect(service.handleGoogleLogin(profileLink)).rejects.toThrow(ConflictException);
    });

    it('AC-LK-4: 다른 사용자가 동일 provider_user_id 사용 중 → ConflictException(이미 다른 계정에 연동된...)', async () => {
      mockRedisClient.getDel.mockResolvedValue(JSON.stringify({ mode: 'link', user_id: 'user-1' }));
      // findByProviderSubject 가 다른 user_id 를 가진 계정 반환
      mockOAuthAccountRepository.findByProviderSubject.mockResolvedValue({
        oauth_account_id: 'acc-x',
        user_id: 'other-user',   // user-1 과 다름
        provider: 'google',
        provider_user_id: 'google-123',
        deleted_at: null,
      });

      await expect(service.handleGoogleLogin(profileLink)).rejects.toThrow(ConflictException);
    });
  });

  // ─── initiateOAuthLogin — login nonce Redis 저장 ─────────────────────────

  describe('initiateOAuthLogin', () => {
    it('Redis 에 mode:login nonce 저장 후 Google URL 반환', async () => {
      mockRedisClient.set.mockResolvedValue('OK');

      const url = await service.initiateOAuthLogin();

      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.stringContaining('oauth:link_state:'),
        expect.stringContaining('"mode":"login"'),
        expect.objectContaining({ EX: 300, NX: true })
      );
      expect(url).toContain('accounts.google.com');
      expect(url).toContain('state=');
    });
  });

  // ─── sendMail: authCode 응답 제거 (D-011) ───────────────────────────────

  describe('sendMail', () => {
    it('{ok: true} 만 반환, code 필드 없음', async () => {
      mockRedisClient.set.mockResolvedValue('OK');
      const result = await service.sendMail({ email: 'test@example.com' });
      if (result) {
        expect(result).toHaveProperty('ok', true);
        expect(result).not.toHaveProperty('code');
      }
    });
  });

  // ─── unlinkOAuth: LAST_AUTH_METHOD 잠금 ─────────────────────────────────

  describe('unlinkOAuth', () => {
    it('비밀번호 없고 oauth_account 1개면 ConflictException(LAST_AUTH_METHOD)', async () => {
      mockPrismaService.runInTransaction.mockImplementation(async (fn: () => Promise<unknown>) => {
        mockPrismaClient.users.findUnique.mockResolvedValue({ password: null });
        mockPrismaClient.$queryRaw.mockResolvedValue([{ count: BigInt(1) }]);
        return fn();
      });

      await expect(service.unlinkOAuth('user-1', 'google')).rejects.toThrow(ConflictException);
    });

    it('AC-UL-3: 연동되지 않은 provider → NotFoundException(NOT_LINKED)', async () => {
      mockPrismaService.runInTransaction.mockImplementation(async (fn: () => Promise<unknown>) => {
        mockPrismaClient.users.findUnique.mockResolvedValue({ password: 'hashed' });
        mockPrismaClient.$queryRaw.mockResolvedValue([{ count: BigInt(2) }]);
        mockPrismaClient.oauth_accounts.updateMany.mockResolvedValue({ count: 0 });
        return fn();
      });

      await expect(service.unlinkOAuth('user-1', 'twitter')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── changePassword ──────────────────────────────────────────────────────

  describe('changePassword', () => {
    it('비밀번호 없는 사용자 — currentPassword 없이 신규 설정 성공', async () => {
      mockPrismaClient.users.findUnique.mockResolvedValue({ password: null });
      mockPrismaClient.users.update.mockResolvedValue({});

      const result = await service.changePassword('user-1', { newPassword: 'newpass123' });
      expect(result).toBe('비밀번호가 설정되었습니다.');
    });

    it('비밀번호 있는 사용자 — currentPassword 없으면 UnauthorizedException', async () => {
      mockPrismaClient.users.findUnique.mockResolvedValue({ password: '$2b$...' });

      await expect(
        service.changePassword('user-1', { newPassword: 'newpass123' })
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── completeOAuthSignup ─────────────────────────────────────────────────

  describe('completeOAuthSignup', () => {
    const ticketPayload = JSON.stringify({
      provider: 'google',
      providerUserId: 'gid',
      email: 'new@example.com',
      displayName: 'New User',
    });

    it('유효하지 않은 ticket → UnauthorizedException', async () => {
      mockRedisClient.getDel.mockResolvedValue(null);

      await expect(
        service.completeOAuthSignup({ ticket: 'invalid', username: 'newuser', agreedToTerms: true })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('AC-SC-5: ticket 1회 소진 — 두 번째 호출 시 UnauthorizedException', async () => {
      mockRedisClient.getDel
        .mockResolvedValueOnce(ticketPayload)  // 첫 번째: 성공
        .mockResolvedValueOnce(null);          // 두 번째: 이미 소진

      mockPrismaService.runInTransaction.mockImplementation(async (fn: () => Promise<unknown>) => {
        mockPrismaClient.users.create.mockResolvedValue({
          user_id: 'new-user', username: 'newuser', email: 'new@example.com',
        });
        mockPrismaClient.oauth_accounts.create.mockResolvedValue({});
        return fn();
      });
      mockRedisClient.set.mockResolvedValue('OK');

      // 첫 번째 호출 성공
      const first = await service.completeOAuthSignup({ ticket: 't1', username: 'newuser', agreedToTerms: true });
      expect(first).toHaveProperty('accessToken');

      // 두 번째 호출 → 401
      await expect(
        service.completeOAuthSignup({ ticket: 't1', username: 'newuser', agreedToTerms: true })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('AC-SC-6: P2002 에러 → ConflictException(이미 가입된...)', async () => {
      mockRedisClient.getDel.mockResolvedValue(ticketPayload);

      const p2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.0.0',
      });
      mockPrismaService.runInTransaction.mockRejectedValue(p2002);

      await expect(
        service.completeOAuthSignup({ ticket: 't2', username: 'newuser', agreedToTerms: true })
      ).rejects.toThrow(ConflictException);
    });
  });
});
