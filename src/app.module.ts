import { Logger, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { RequestContextMiddleware } from './common/context/request-context.middleware';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { RedisModule } from './redis/redis.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { NodeModule } from './node/node.module';
import { WinstonModule } from 'nest-winston';
import { EdgeModule } from './edge/edge.module';
import { MeetModule } from './meet/meet.module';
import { UploadModule } from './upload/upload.module';
import { AiModule } from './ai/ai.module';
import { MeetingModule } from './meeting/meeting.module';
import { MetricsModule } from './common/metrics';
import { createWinstonConsoleTransport } from './common/logging/winston.console';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    WinstonModule.forRoot({
      transports: [createWinstonConsoleTransport()]
    }),
    PrismaModule,
    UserModule,
    AuthModule,
    RedisModule,
    WorkspaceModule,
    NodeModule,
    EdgeModule,
    MeetModule,
    UploadModule,
    AiModule,
    MeetingModule,
    MetricsModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
