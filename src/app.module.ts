import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { RedisModule } from './common/redis/redis.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { NodeModule } from './node/node.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UserModule,
    AuthModule,
    RedisModule,
    WorkspaceModule,
    NodeModule
  ],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
