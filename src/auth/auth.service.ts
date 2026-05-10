import {
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

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: LoggerService
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.userRepository.findByEmail(email);
    if (user === null)
      throw new UnauthorizedException('존재하지 않는 아이디 입니다');

    const hashed = await bcrypt.compare(password, user.password);
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

      await transporter.sendMail(mailOptions, (err, res) => {
        if (err) {
          transporter.close();
          throw new NotFoundException(err);
        }
      });
      return { code: authCode };
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
}
