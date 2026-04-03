import { Logger, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { RedisModule } from './redis/redis.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { WsModule } from './ws/ws.module';
import { NodeModule } from './node/node.module';
import * as winston from 'winston';
import { utilities, WinstonModule } from 'nest-winston';
import { EdgeModule } from './edge/edge.module';
import { UploadModule } from './upload/upload.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    WinstonModule.forRoot({
      transports: [
        new winston.transports.Console({
          level: process.env.NODE_ENV === 'production' ? 'info' : 'silly',
          format: winston.format.combine(
            winston.format.timestamp(),
            utilities.format.nestLike('AIdeep', { prettyPrint: true })
          )
        })
      ]
    }),
    PrismaModule,
    UserModule,
    AuthModule,
    RedisModule,
    WsModule,
    WorkspaceModule,
    NodeModule,
    EdgeModule,
    UploadModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
