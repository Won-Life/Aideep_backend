import { UnauthorizedException } from '@nestjs/common';
import { GoogleStrategy } from './google.strategy';

describe('GoogleStrategy', () => {
  let strategy: GoogleStrategy;

  beforeAll(() => {
    // passport-google-oauth20 이 env var 을 읽으므로 dummy 값 설정
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_CALLBACK_URL = 'http://localhost/auth/google/callback';
    strategy = new GoogleStrategy();
  });

  describe('validate — email_verified 검증 (AC-CB-2)', () => {
    const mockReq = { query: {} } as any;
    let doneMock: jest.Mock;

    beforeEach(() => {
      doneMock = jest.fn();
    });

    it('verified=true → GoogleProfile 반환 (성공)', async () => {
      const profile = {
        id: 'google-id',
        displayName: 'Test User',
        emails: [{ value: 'test@example.com', verified: true }]
      };

      await strategy.validate(mockReq, 'at', 'rt', profile, doneMock);

      expect(doneMock).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ id: 'google-id', email: 'test@example.com' })
      );
    });

    it('verified="true" (string) → 성공 (Google 이 string 으로 내려주는 케이스)', async () => {
      const profile = {
        id: 'google-id',
        displayName: 'Test User',
        emails: [{ value: 'test@example.com', verified: 'true' }]
      };

      await strategy.validate(mockReq, 'at', 'rt', profile, doneMock);

      expect(doneMock).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ id: 'google-id', email: 'test@example.com' })
      );
    });

    it('verified=false → done(UnauthorizedException, false) (AC-CB-2)', async () => {
      const profile = {
        id: 'google-id',
        displayName: 'Test User',
        emails: [{ value: 'test@example.com', verified: false }]
      };

      await strategy.validate(mockReq, 'at', 'rt', profile, doneMock);

      expect(doneMock).toHaveBeenCalledWith(
        expect.any(UnauthorizedException),
        false
      );
    });

    it('emails 빈 배열 → done(UnauthorizedException, false)', async () => {
      const profile = {
        id: 'google-id',
        displayName: 'Test User',
        emails: []
      };

      await strategy.validate(mockReq, 'at', 'rt', profile, doneMock);

      expect(doneMock).toHaveBeenCalledWith(
        expect.any(UnauthorizedException),
        false
      );
    });

    it('state 가 있으면 GoogleProfile.state 에 포함', async () => {
      const reqWithState = { query: { state: 'my-nonce' } } as any;
      const profile = {
        id: 'google-id',
        displayName: 'Test User',
        emails: [{ value: 'test@example.com', verified: true }]
      };

      await strategy.validate(reqWithState, 'at', 'rt', profile, doneMock);

      expect(doneMock).toHaveBeenCalledWith(
        null,
        expect.objectContaining({ state: 'my-nonce' })
      );
    });
  });
});
