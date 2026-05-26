import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserModule } from 'src/user/user.module';
import { LocalStrategy } from './strategy/local.strategy';
import { JwtAuthGuard } from './guards/jwt.guard';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategy/jwt.strategy';
import { GoogleStrategy } from './strategy/google.strategy';
import { OAuthAccountRepository } from './oauth/oauth-account.repository';

@Module({
  imports: [
    UserModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' }
      })
    })
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, LocalStrategy, JwtStrategy, GoogleStrategy, OAuthAccountRepository],
  exports: [JwtAuthGuard, JwtModule]
})
export class AuthModule {}
