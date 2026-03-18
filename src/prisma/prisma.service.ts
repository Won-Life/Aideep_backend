import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  transactionStorage,
  setTransactionRunner
} from './transaction.storage';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();
  }

  get client(): Prisma.TransactionClient | this {
    return transactionStorage.getStore() ?? this;
  }

  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (transactionStorage.getStore()) {
      return fn();
    }
    return this.$transaction((tx) => transactionStorage.run(tx, fn));
  }

  async onModuleInit() {
    setTransactionRunner(this.runInTransaction.bind(this));
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
