import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Request,
  Res,
  UseGuards
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { IssueMasterBody, LoginBody } from './dtos/loginBody.dto';
import { LoginSuccessDataDto } from './dtos/loginResponse.dto';
import { SignUpBody } from './dtos/signUpBody.dto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiProperty
} from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/common/response/api-success-response.decorator';
import { JwtAuthGuard } from './guards/jwt.guard';
import { SendMailRequestBody, SendSmsResponseDto } from './dtos/sendSMS.dto';
import { VerifyEmailRequestBody } from './dtos/verifyEmail.dto';
import { IsString } from 'class-validator';
import { LocalAuthGuard } from './guards/local.guard';
import { GoogleAuthGuard } from './guards/google.guard';
import { OAuthSignupCompleteBody } from './dtos/oauthSignupComplete.dto';
import { PatchPasswordBody } from './dtos/patchPassword.dto';

// handleGoogleLogin 예외 메시지 → 프론트엔드 리다이렉트 reason 코드 (#75)
const OAUTH_CALLBACK_ERROR_REASONS: Record<string, string> = {
  'state 누락': 'invalid_state',
  '유효하지 않은 state': 'invalid_state',
  '사용자를 찾을 수 없습니다.': 'user_not_found',
  '이미 다른 계정에 연동된 Google 계정입니다.': 'google_account_already_linked',
  '이미 연동된 제공자입니다.': 'provider_already_linked',
  '이미 가입된 이메일입니다. 이메일/비밀번호 로그인 후 계정을 연동하세요.':
    'email_conflict'
};

class RefreshTokenBody {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  @IsString()
  refreshToken: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/login')
  @UseGuards(LocalAuthGuard)
  @ApiOperation({
    summary: '로그인 합니다.'
  })
  @ApiBody({ type: LoginBody })
  @ApiSuccessResponse(LoginSuccessDataDto, 201, '로그인 성공')
  async login(@Request() req: any) {
    return this.authService.login(req.user);
  }

  @Post('/refresh')
  @ApiOperation({
    summary: 'accessToken을 재발급 합니다.'
  })
  @ApiBody({ type: RefreshTokenBody })
  @ApiSuccessResponse(LoginSuccessDataDto, 201, '토큰 재발급 성공')
  async refresh(@Body() body: RefreshTokenBody) {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('/signup')
  @ApiOperation({
    summary: '회원가입합니다.',
    description: '이메일 인증이 된 이메일로 회원가입을 해야합니다.'
  })
  @ApiBody({ type: SignUpBody })
  @ApiSuccessResponse(
    { type: 'string', example: '회원가입 성공' },
    201,
    '회원가입 성공'
  )
  async signUp(@Body() body: SignUpBody) {
    await this.authService.signUp(body);
    return '회원가입 성공';
  }

  @Post('/issue/master')
  @UseGuards(LocalAuthGuard)
  @ApiOperation({
    summary: '특정 유저에 대한 마스터 토큰을 발급합니다',
    description: '개발용'
  })
  async issueMaster(@Body() _body: LoginBody, @Request() req: any) {
    const userId = req?.user.user_id;
    return await this.authService.issueMasterToken(userId);
  }

  @Post('/email/send')
  @ApiOperation({
    summary: '이메일 인증',
    description: '이메일 인증을 위해 인증번호를 전송합니다.'
  })
  @ApiBody({ type: SendMailRequestBody })
  @ApiSuccessResponse(SendSmsResponseDto, 201, '인증번호 전송 성공')
  async sendMessage(@Body() body: SendMailRequestBody) {
    return await this.authService.sendMail(body);
  }

  @Post('/email/verify')
  @ApiOperation({
    summary: '인증번호 검증',
    description: '전송된 인증번호를 검증합니다.'
  })
  @ApiBody({ type: VerifyEmailRequestBody })
  @ApiSuccessResponse(
    { type: 'string', example: '인증 성공' },
    201,
    '인증 성공'
  )
  async verifyEmail(@Body() body: VerifyEmailRequestBody) {
    return await this.authService.verify(body);
  }

  @Delete('/logout')
  @ApiOperation({
    summary: '로그아웃',
    description: '특정 유저에 대한 refresh 토큰을 무효화 합니다'
  })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiSuccessResponse(
    {
      type: 'string',
      example: '로그아웃 성공'
    },
    200,
    '로그아웃 성공'
  )
  async logout(@Request() req: any) {
    // D-017: PII 로그 제거
    const authorization: string = req.headers['authorization'] ?? '';
    const accessToken = authorization.replace('Bearer ', '');

    return this.authService.logout(req.user.user_id, accessToken);
  }

  // ─── Google OAuth — 로그인/가입 개시 (login-CSRF 방지: 수동 redirect + state nonce) ──

  @Get('/google')
  @ApiOperation({
    summary: 'Google OAuth 로그인 개시',
    description:
      'login mode nonce 를 Redis 에 저장하고 Google 인증 페이지로 리다이렉트합니다.'
  })
  async googleLogin(@Res() res: Response) {
    const redirectUrl = await this.authService.initiateOAuthLogin();
    res.redirect(redirectUrl);
  }

  @Get('/google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiOperation({
    summary: 'Google OAuth 콜백 (로그인·가입·연동 통합)',
    description:
      'Google 인증 후 결과를 쿼리 파라미터에 실어 {FRONTEND_URL}/oauth/callback 으로 리다이렉트합니다. (#75)'
  })
  async googleCallback(@Request() req: any, @Res() res: Response) {
    const callbackUrl = `${process.env.FRONTEND_URL}/oauth/callback`;
    try {
      const result = await this.authService.handleGoogleLogin(req.user);
      const params = new URLSearchParams({ kind: result.kind });
      if (result.kind === 'login') {
        params.set('accessToken', result.accessToken);
        params.set('refreshToken', result.refreshToken);
      } else if (result.kind === 'signup_required') {
        params.set('ticket', result.ticket);
      }
      res.redirect(`${callbackUrl}?${params.toString()}`);
    } catch (err) {
      // 브라우저 풀페이지 이동이므로 전역 필터의 JSON 응답 대신 리다이렉트로 변환 (#75)
      const reason =
        (err instanceof Error && OAUTH_CALLBACK_ERROR_REASONS[err.message]) ||
        'oauth_failed';
      res.redirect(`${callbackUrl}?kind=error&reason=${reason}`);
    }
  }

  @Get('/demo/enter')
  @ApiOperation({
    summary: '시연용 게스트 진입 (QR)',
    description:
      'DEMO_SECRET 이 일치하면 게스트 계정을 생성해 데모 워크스페이스에 참여시키고, ' +
      'google 콜백과 동일한 규약으로 {FRONTEND_URL}/oauth/callback 에 토큰을 실어 리다이렉트합니다.'
  })
  async enterDemo(@Query('key') key: string, @Res() res: Response) {
    const secret = process.env.DEMO_SECRET;
    // 엔드포인트 존재 자체를 숨기기 위해 401 대신 404를 던진다.
    if (!secret || key !== secret) {
      throw new NotFoundException('Cannot GET /auth/demo/enter');
    }

    const { accessToken, refreshToken } = await this.authService.enterDemo();
    const params = new URLSearchParams({
      kind: 'login',
      accessToken,
      refreshToken
    });
    res.redirect(
      `${process.env.FRONTEND_URL}/oauth/callback?${params.toString()}`
    );
  }

  // ─── OAuth 회원가입 2-step complete (D-001, D-016: public) ────────────────

  @Post('/oauth/signup/complete')
  @ApiOperation({
    summary: 'OAuth 회원가입 완료',
    description:
      'handleGoogleLogin 에서 받은 ticket 으로 회원가입을 완료합니다. (public — ticket 검증으로 대체)'
  })
  @ApiBody({ type: OAuthSignupCompleteBody })
  @ApiSuccessResponse(LoginSuccessDataDto, 201, 'OAuth 회원가입 성공')
  async completeOAuthSignup(@Body() body: OAuthSignupCompleteBody) {
    return this.authService.completeOAuthSignup(body);
  }

  // ─── OAuth Link 개시 (D-016: JwtAuthGuard) ────────────────────────────────

  @Get('/oauth/link/google')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'Google OAuth 계정 연동 개시',
    description:
      'nonce 를 Redis 에 저장하고 Google 인증 페이지로 리다이렉트합니다.'
  })
  async linkGoogleInitiate(@Request() req: any, @Res() res: Response) {
    const redirectUrl = await this.authService.initiateOAuthLink(
      req.user.user_id
    );
    res.redirect(redirectUrl);
  }

  // ─── OAuth Link 목록 (D-016: JwtAuthGuard) ────────────────────────────────

  @Get('/oauth/links')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: '연동된 OAuth 계정 목록 조회',
    description: '현재 사용자의 활성 oauth_accounts 목록을 반환합니다.'
  })
  async listLinks(@Request() req: any) {
    return this.authService.listOAuthLinks(req.user.user_id);
  }

  // ─── OAuth Unlink (D-016: JwtAuthGuard) ───────────────────────────────────

  @Delete('/oauth/link/:provider')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: 'OAuth 계정 연동 해제',
    description:
      '마지막 인증 수단이 OAuth 이고 비밀번호가 없으면 해제를 거부합니다.'
  })
  async unlinkOAuth(
    @Request() req: any,
    @Param('provider') provider: string
  ) {
    await this.authService.unlinkOAuth(req.user.user_id, provider);
    return '연동이 해제되었습니다.';
  }

  // ─── 비밀번호 설정/변경 (D-007: JwtAuthGuard) ─────────────────────────────

  @Patch('/password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @ApiOperation({
    summary: '비밀번호 설정/변경',
    description:
      '비밀번호가 없는 경우 설정, 있는 경우 currentPassword 검증 후 변경합니다.'
  })
  @ApiBody({ type: PatchPasswordBody })
  async changePassword(@Request() req: any, @Body() body: PatchPasswordBody) {
    return this.authService.changePassword(req.user.user_id, body);
  }
}
