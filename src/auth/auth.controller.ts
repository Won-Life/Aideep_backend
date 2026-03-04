import {
  Body,
  Controller,
  Delete,
  Post,
  Request,
  UseGuards
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { IssueMasterBody, LoginBody } from './dtos/loginBody.dto';
import { LoginSuccessDataDto } from './dtos/loginResponse.dto';
import { SignUpBody } from './dtos/signUpBody.dto';
import { ApiBearerAuth, ApiBody, ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/common/response/api-success-response.decorator';
import { JwtAuthGuard } from './guards/jwt.guards';
import { SendMailRequestBody, SendSmsResponseDto } from './dtos/sendSMS.dto';
import { VerifyEmailRequestBody } from './dtos/verifyEmail.dto';
import { IsString } from 'class-validator';
import { LocalAuthGuard } from './guards/local.guards';

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
  @ApiBody({ type: LoginBody })
  @ApiSuccessResponse(LoginSuccessDataDto, 200, '로그인 성공')
  async login(@Request() req: Express.Request) {
    return this.authService.login(req.user);
  }

  @Post('/refresh')
  @ApiBody({ type: RefreshTokenBody })
  @ApiSuccessResponse(LoginSuccessDataDto, 200, '토큰 재발급 성공')
  async refresh(@Body() body: RefreshTokenBody) {
    return this.authService.refresh(body.refreshToken);
  }

  @Post('/signup')
  @ApiBody({ type: SignUpBody })
  @ApiSuccessResponse(
    { type: 'string', example: '회원가입 성공' },
    200,
    '회원가입 성공'
  )
  async signUp(@Body() body: SignUpBody) {
    await this.authService.signUp(body);
    return '회원가입 성공';
  }

  @Post('/issue/master')
  async issueMaster(@Body() body: IssueMasterBody) {
    return await this.authService.issueMasterToken(body.userId);
  }

  @Post('/email/send')
  @ApiBody({ type: SendMailRequestBody })
  @ApiSuccessResponse(SendSmsResponseDto, 200, '인증번호 전송 성공')
  async sendMessage(@Body() body: SendMailRequestBody) {
    return await this.authService.sendMail(body);
  }

  @Post('/email/verify')
  @ApiBody({ type: VerifyEmailRequestBody })
  @ApiSuccessResponse(
    { type: 'string', example: '인증 성공' },
    200,
    '인증 성공'
  )
  async verifyEmail(@Body() body: VerifyEmailRequestBody) {
    return await this.authService.verify(body);
  }

  @Delete('/logout')
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
    console.log(req.user);
    const authorization: string = req.headers['authorization'] ?? '';
    const accessToken = authorization.replace('Bearer ', '');

    return this.authService.logout(req.user.id, accessToken);
  }
}
