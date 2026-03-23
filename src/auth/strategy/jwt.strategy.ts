import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { RedisService } from 'src/redis/redis.service';
import { REDIS_KEYS } from 'src/redis/redis.keys';
import { Request } from 'express';

export type JwtPayload = {
  userName: string;
  email: string;
  user_id: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly redisService: RedisService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (req: Request) => {
          // SSE connections use EventSource which cannot set custom headers,
          // so the token is passed as a query parameter instead.
          return (req.query?.token as string) ?? null;
        }
      ]),
      secretOrKey: config.get<string>('JWT_SECRET'),
      passReqToCallback: true
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const token =
      ExtractJwt.fromAuthHeaderAsBearerToken()(req) ??
      (req.query?.token as string) ??
      null;

    const blacklisted = await this.redisService
      .getClient()
      .get(REDIS_KEYS.BLACKLIST(token));
    if (blacklisted) {
      throw new UnauthorizedException('만료된 토큰입니다.');
    }
    return payload;
  }
}
