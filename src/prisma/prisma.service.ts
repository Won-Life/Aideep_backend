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
    await this.prisma.$connect();
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }
}
