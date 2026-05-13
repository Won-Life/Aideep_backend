import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  transactionStorage,
  setTransactionRunner
} from './transaction.storage';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly prisma = new PrismaClient();

  get client(): Prisma.TransactionClient {
    return transactionStorage.getStore() ?? this.prisma;
  }

  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (transactionStorage.getStore()) {
      return fn();
    }
    return this.prisma.$transaction((tx) => transactionStorage.run(tx, fn));
  }

  async onModuleInit() {
    setTransactionRunner(this.runInTransaction.bind(this));
    this.prisma.$extends({
      query: {
        async $allOperations({
          operation,
          model,
          args,
          query
        }: {
          model?: string;
          operation: string;
          args: unknown;
          query: (a: unknown) => Promise<unknown>;
        }) {
          const start = performance.now();
          const result = await query(args);
          const ms = performance.now() - start;
          const label = `${model ?? '?'}.${operation}`;
          console.log(`[${label}] ${ms.toFixed(2)}ms`);
          if (ms > 500) {
            console.warn(`Slow query: ${label} - ${ms.toFixed(2)}ms`);
          }
          return result;
        }
      }
    });
    await this.prisma.$connect();
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
