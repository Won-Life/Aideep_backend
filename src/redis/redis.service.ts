import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

export const redisOptions = {
  socket: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT)
  },
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASSWORD
};

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;

  async onModuleInit() {
    this.client = createClient(redisOptions) as RedisClientType;

    this.client.on('error', (err) =>
      console.error('[Infrastructure] Redis Connection Error:', err)
    );
    this.client.on('connect', () =>
      console.log('[Infrastructure] Redis Connection Success')
    );

    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  getClient(): RedisClientType {
    return this.client;
  }
}
