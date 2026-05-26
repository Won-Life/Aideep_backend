import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { Request } from 'express';

export interface GoogleProfile {
  id: string;
  email: string;
  displayName: string;
  /** state 파라미터 (link nonce 또는 undefined) */
  state?: string;
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      callbackURL: process.env.GOOGLE_CALLBACK_URL as string,
      scope: ['email', 'profile'],
      passReqToCallback: true
    });
  }

  async validate(
    req: Request,
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback
  ) {
    const emails: Array<{ value: string; verified?: boolean | string }> =
      profile.emails ?? [];
    const email = emails[0]?.value;
    const verified =
      emails[0]?.verified === true || emails[0]?.verified === 'true';

    if (!verified) {
      return done(
        new UnauthorizedException('Google 이메일 인증이 완료되지 않았습니다.'),
        false
      );
    }

    // state 파라미터 — link nonce 가 있으면 전달
    const state = (req.query?.state as string | undefined) ?? undefined;

    const googleProfile: GoogleProfile = {
      id: profile.id,
      email,
      displayName: profile.displayName,
      state
    };

    done(null, googleProfile);
  }
}
