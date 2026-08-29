import * as crypto from 'crypto';
import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  LoggerService,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { UserRepository } from 'src/user/user.repository';
import { SignUpBody } from './dtos/signUpBody.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload, MasterJwtPayload } from './strategy/jwt.strategy';
import { SendMailRequestBody } from './dtos/sendSMS.dto';
import { transporter } from './mailer.service';
import { RedisService } from 'src/redis/redis.service';
import { REDIS_KEYS } from 'src/redis/redis.keys';
import { VerifyEmailRequestBody } from './dtos/verifyEmail.dto';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston/dist/winston.constants';
import { GoogleProfile } from './strategy/google.strategy';
import { OAuthAccountRepository } from './oauth/oauth-account.repository';
import { WorkspaceRepository } from 'src/workspace/workspace.repository';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from 'src/generated/prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly oauthAccountRepository: OAuthAccountRepository,
    private readonly workspaceRepository: WorkspaceRepository,
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: LoggerService
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.userRepository.findByEmail(email);
    if (user === null)
      throw new UnauthorizedException('존재하지 않는 아이디 입니다');

    const hashed = await bcrypt.compare(password, user.password ?? '');
    if (!hashed)
      throw new UnauthorizedException('비밀번호가 일치하지 않습니다.');

    if (user && hashed)
      return {
        userName: user.username,
        email: user.email,
        user_id: user.user_id
      };
    return null;
  }

  async issueMasterToken(userId: string) {
    if (process.env.NODE_ENV === 'production')
      throw new ForbiddenException('배포환경에서 사용 할 수 없습니다');

    const user = await this.userRepository.findByUserId(userId);
    if (!user) {
      throw new ForbiddenException('허용되지 않은 접근입니다.');
    }

    const allowed = (process.env.MASTER_USER_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!allowed.includes(user.user_id)) {
      throw new ForbiddenException('허용되지 않은 접근입니다.');
    }

    const payload: MasterJwtPayload = {
      userName: user.username,
      email: user.email,
      user_id: user.user_id,
      isMaster: true
    };

    const masterToken = this.jwtService.sign(payload, { expiresIn: '30d' });
    await this.redisService
      .getClient()
      .set(REDIS_KEYS.MASTER_TOKEN(user.user_id), masterToken, {
        EX: 60 * 60 * 24 * 30
      });

    this.logger.warn(
      `[MASTER_TOKEN_ISSUED] user=${user.user_id} email=${user.email}`
    );

    return { masterToken };
  }

  async login(user: JwtPayload) {
    const payload = {
      userName: user.userName,
      email: user.email,
      user_id: user.user_id
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    await this.redisService
      .getClient()
      .set(REDIS_KEYS.REFRESH_TOKEN(user.user_id), refreshToken, {
        EX: 60 * 60 * 24 * 7
      });

    return { accessToken, refreshToken };
  }

  /**
   * 시연용 게스트 진입 — QR 1회 스캔마다 게스트 계정을 만들어 데모 워크스페이스에 참여시킨다.
   * 계정을 공유하면 refresh 토큰이 서로를 덮어써 먼저 접속한 사람이 튕기고, 커서·참여자가
   * 전부 같은 이름으로 보여 실시간 협업 시연이 성립하지 않는다.
   *
   * 게스트는 VIEWER로 참여시킨다 — QR은 불특정 다수에게 열려 있어 EDITOR로 두면 방문자
   * 누구나 시연용 그래프의 노드를 옮기거나 지울 수 있고, 공용 워크스페이스라 그 훼손이
   * 이후 모든 방문자에게 그대로 보인다. VIEWER는 노드·엣지 변경(checkEditPermission)과
   * Yjs 본문 저장(ws.gateway)이 서버에서 거부되며, 커서 공유는 그대로 동작한다.
   */
  async enterDemo() {
    const workspaceId = process.env.DEMO_WORKSPACE_ID;
    if (!workspaceId) {
      throw new NotFoundException('데모 워크스페이스가 설정되지 않았습니다.');
    }

    const suffix = crypto.randomUUID().slice(0, 8);
    const guest = await this.userRepository.create({
      email: `guest-${suffix}@demo.aideep.local`,
      password: await bcrypt.hash(crypto.randomUUID(), 10),
      name: `게스트-${suffix.slice(0, 4)}`,
      phone: ''
    });

    await this.workspaceRepository.insertWorkspaceUser(
      guest.user_id,
      workspaceId,
      'VIEWER'
    );

    this.logger.warn(
      `[DEMO_GUEST_CREATED] user=${guest.user_id} workspace=${workspaceId}`
    );

    return await this.login({
      userName: guest.username,
      email: guest.email,
      user_id: guest.user_id
    });
  }

  async refresh(refreshToken: string) {
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('유효하지 않은 refresh token입니다.');
    }

    const redis = this.redisService.getClient();

    const stored = await redis.get(REDIS_KEYS.REFRESH_TOKEN(payload.user_id));
    if (!stored || stored !== refreshToken) {
      throw new UnauthorizedException(
        '만료되거나 이미 사용된 refresh token입니다.'
      );
    }

    const newPayload = {
      userName: payload.userName,
      email: payload.email,
      user_id: payload.user_id
    };
    const newAccessToken = this.jwtService.sign(newPayload, {
      expiresIn: '15m'
    });
    const newRefreshToken = this.jwtService.sign(newPayload, {
      expiresIn: '7d'
    });

    await redis.set(
      REDIS_KEYS.REFRESH_TOKEN(payload.user_id),
      newRefreshToken,
      {
        EX: 60 * 60 * 24 * 7
      }
    );

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(userId: string, accessToken: string) {
    const redis = this.redisService.getClient();
    await redis.del(REDIS_KEYS.REFRESH_TOKEN(userId));
    await redis.set(REDIS_KEYS.BLACKLIST(accessToken), '1', { EX: 60 * 15 });
    return '로그아웃 성공';
  }

  async sendMail(dto: SendMailRequestBody) {
    const { email } = dto;
    try {
      const authCode = Math.floor(100000 + Math.random() * 900000).toString();
      const textMessage = `[AIdeep] 본인 확인 인증번호 [${authCode}]입니다.`;

      const authKey = REDIS_KEYS.AUTH_CODE(email);
      const authData = JSON.stringify({
        code: authCode,
        attempts: 0,
        generatedAt: Date.now()
      });

      const mailOptions = {
        from: process.env.MAIL_USER,
        to: email,
        subject: 'AIdeep 메일 인증 번호',
        text: textMessage
      };

      await this.redisService.getClient().set(authKey, authData, { EX: 180 });

      await transporter.sendMail(mailOptions, (err) => {
        if (err) {
          transporter.close();
          throw new NotFoundException(err);
        }
      });
      // D-011: authCode를 응답에서 제거
      return { ok: true };
    } catch (err) {
      console.log(err);
    }
  }

  async verify(dto: VerifyEmailRequestBody) {
    const { email, code } = dto;
    const authKey = REDIS_KEYS.AUTH_CODE(email);
    const redis = this.redisService.getClient();

    const raw = await redis.get(authKey);
    if (!raw) throw new UnauthorizedException('인증번호가 만료되었습니다.');

    const stored = JSON.parse(raw);

    if (stored.code !== code.toString()) {
      stored.attempts += 1;
      if (stored.attempts >= 5) {
        await redis.del(authKey);
        throw new UnauthorizedException(
          '인증 횟수를 초과했습니다. 다시 요청해주세요.'
        );
      }
      await redis.set(authKey, JSON.stringify(stored), { KEEPTTL: true });
      throw new UnauthorizedException('인증번호가 일치하지 않습니다.');
    }

    await redis.del(authKey);
    await redis.set(REDIS_KEYS.VERIFIED(email), '1', { EX: 600 });
    return '인증에 성공했습니다.';
  }

  async signUp(dto: SignUpBody) {
    const check = await this.userRepository.findByEmail(dto.email);
    const redis = this.redisService.getClient();

    if (check !== null) {
      throw new ForbiddenException('이미 존재하는 아이디 입니다.');
    }

    const verified = REDIS_KEYS.VERIFIED(dto.email);
    const isVerfied = await redis.get(verified);
    if (!isVerfied) {
      throw new ForbiddenException('인증되지 않은 메일입니다.');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    dto.password = hashedPassword;

    await redis.del(verified);
    await this.userRepository.create(dto);
  }

  // ─── Google OAuth 메인 흐름 (D-001, D-002, D-004, D-009 보완) ───────────────

  async handleGoogleLogin(profile: GoogleProfile) {
    const redis = this.redisService.getClient();

    // State 는 모든 흐름에서 필수 (login-CSRF 방지 — D-009 보완)
    if (!profile.state) {
      throw new UnauthorizedException('state 누락');
    }

    const raw = await redis.getDel(REDIS_KEYS.OAUTH_LINK_NONCE(profile.state));
    if (!raw) {
      throw new UnauthorizedException('유효하지 않은 state');
    }

    const data = JSON.parse(raw) as {
      mode: 'login' | 'link';
      user_id?: string;
    };

    // ── Link 흐름 ──────────────────────────────────────────────────────────
    if (data.mode === 'link') {
      const user_id = data.user_id!;

      // 다른 사용자가 동일 provider_user_id 를 이미 사용 중인지 확인
      const existingAccount =
        await this.oauthAccountRepository.findByProviderSubject(
          'google',
          profile.id
        );
      if (existingAccount && existingAccount.user_id !== user_id) {
        throw new ConflictException(
          '이미 다른 계정에 연동된 Google 계정입니다.'
        );
      }

      // 이미 연동된 경우
      const alreadyLinked =
        await this.oauthAccountRepository.findByUserAndProvider(
          user_id,
          'google'
        );
      if (alreadyLinked) {
        throw new ConflictException('이미 연동된 제공자입니다.');
      }

      await this.oauthAccountRepository.createForUser(
        user_id,
        'google',
        profile.id,
        profile.email
      );
      return { kind: 'linked' as const };
    }

    // ── Login / Signup 흐름 (mode === 'login') ────────────────────────────
    const oauthAccount =
      await this.oauthAccountRepository.findByProviderSubject(
        'google',
        profile.id
      );
    if (oauthAccount) {
      const user = await this.userRepository.findByUserId(
        oauthAccount.user_id
      );
      if (!user) throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
      const jwtPayload: JwtPayload = {
        userName: user.username,
        email: user.email,
        user_id: user.user_id
      };
      const tokens = await this.login(jwtPayload);
      return { kind: 'login' as const, ...tokens };
    }

    // 신규 사용자: 이메일 충돌 검사 (D-002, D-012)
    const existingByEmail = await this.userRepository.findByEmail(
      profile.email
    );
    if (existingByEmail) {
      // enumeration 완화: generic 메시지 + 200~300ms 인위 지연
      await new Promise((resolve) =>
        setTimeout(resolve, 200 + Math.random() * 100)
      );
      throw new ConflictException(
        '이미 가입된 이메일입니다. 이메일/비밀번호 로그인 후 계정을 연동하세요.'
      );
    }

    // Signup ticket 발급 (D-001, D-013)
    const ticket = crypto.randomBytes(32).toString('base64url');
    const ticketPayload = JSON.stringify({
      provider: 'google',
      providerUserId: profile.id,
      email: profile.email,
      displayName: profile.displayName
    });
    await redis.set(REDIS_KEYS.OAUTH_SIGNUP_TICKET(ticket), ticketPayload, {
      EX: 300,
      NX: true
    });

    return { kind: 'signup_required' as const, ticket };
  }

  // ─── OAuth 회원가입 complete (D-001, D-008) ────────────────────────────────

  async completeOAuthSignup(dto: {
    ticket: string;
    username: string;
    agreedToTerms: boolean;
  }) {
    const redis = this.redisService.getClient();
    const raw = await redis.getDel(REDIS_KEYS.OAUTH_SIGNUP_TICKET(dto.ticket));
    if (!raw)
      throw new UnauthorizedException(
        '유효하지 않거나 만료된 ticket 입니다.'
      );

    const ticketData = JSON.parse(raw) as {
      provider: string;
      providerUserId: string;
      email: string;
      displayName: string;
    };

    try {
      let createdUser: { user_id: string; username: string; email: string };

      await this.prisma.runInTransaction(async () => {
        createdUser = await this.prisma.client.users.create({
          data: {
            email: ticketData.email,
            username: dto.username,
            password: null
          }
        });
        await this.prisma.client.oauth_accounts.create({
          data: {
            user_id: createdUser!.user_id,
            provider: ticketData.provider,
            provider_user_id: ticketData.providerUserId,
            email: ticketData.email
          }
        });
      });

      const jwtPayload: JwtPayload = {
        userName: createdUser!.username,
        email: createdUser!.email,
        user_id: createdUser!.user_id
      };
      return this.login(jwtPayload);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          '이미 가입된 이메일 또는 OAuth 계정입니다.'
        );
      }
      throw err;
    }
  }

  // ─── 공용 Google authorize URL 생성 헬퍼 ─────────────────────────────────

  private buildGoogleAuthUrl(nonce: string): string {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID as string,
      redirect_uri: process.env.GOOGLE_CALLBACK_URL as string,
      response_type: 'code',
      scope: 'email profile',
      state: nonce,
      access_type: 'offline',
      prompt: 'consent'
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  // ─── OAuth Login 개시 — login mode nonce (D-009 보완) ──────────────────────

  async initiateOAuthLogin(): Promise<string> {
    const nonce = crypto.randomBytes(16).toString('base64url');
    await this.redisService.getClient().set(
      REDIS_KEYS.OAUTH_LINK_NONCE(nonce),
      JSON.stringify({ mode: 'login' }),
      { EX: 300, NX: true }
    );
    return this.buildGoogleAuthUrl(nonce);
  }

  // ─── OAuth Link 개시 — link mode nonce (D-004, D-014) ─────────────────────

  async initiateOAuthLink(userId: string): Promise<string> {
    const nonce = crypto.randomBytes(16).toString('base64url');
    await this.redisService.getClient().set(
      REDIS_KEYS.OAUTH_LINK_NONCE(nonce),
      JSON.stringify({ mode: 'link', user_id: userId }),
      { EX: 300, NX: true }
    );
    return this.buildGoogleAuthUrl(nonce);
  }

  // ─── OAuth 연동 목록 (D-016) ────────────────────────────────────────────────

  async listOAuthLinks(userId: string) {
    return this.oauthAccountRepository.listActiveByUser(userId);
  }

  // ─── Unlink (D-005) — $transaction + SELECT FOR UPDATE + LAST_AUTH_METHOD ──

  async unlinkOAuth(userId: string, provider: string) {
    await this.prisma.runInTransaction(async () => {
      const user = await this.prisma.client.users.findUnique({
        where: { user_id: userId },
        select: { password: true }
      });

      const rows = await (
        this.prisma.client as unknown as {
          $queryRaw: <T>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
        }
      ).$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count FROM oauth_accounts
        WHERE user_id = ${userId}::uuid AND deleted_at IS NULL
        FOR UPDATE
      `;
      const remaining = rows[0].count - BigInt(1);

      if (user?.password === null && remaining < BigInt(1)) {
        throw new ConflictException('LAST_AUTH_METHOD');
      }

      const r = await this.prisma.client.oauth_accounts.updateMany({
        where: { user_id: userId, provider, deleted_at: null },
        data: { deleted_at: new Date() }
      });

      if (r.count === 0) throw new NotFoundException('NOT_LINKED');
    });
  }

  // ─── 비밀번호 설정/변경 (D-007) ────────────────────────────────────────────

  async changePassword(
    userId: string,
    dto: { currentPassword?: string; newPassword: string }
  ) {
    const user = await this.prisma.client.users.findUnique({
      where: { user_id: userId },
      select: { password: true }
    });

    if (!user) throw new UnauthorizedException('사용자를 찾을 수 없습니다.');

    if (user.password !== null) {
      if (!dto.currentPassword) {
        throw new UnauthorizedException('현재 비밀번호를 입력해주세요.');
      }
      const valid = await bcrypt.compare(dto.currentPassword, user.password);
      if (!valid)
        throw new UnauthorizedException('현재 비밀번호가 일치하지 않습니다.');
    }

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.client.users.update({
      where: { user_id: userId },
      data: { password: hashed }
    });

    return '비밀번호가 설정되었습니다.';
  }
}
