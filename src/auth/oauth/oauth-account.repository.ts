import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class OAuthAccountRepository {
  constructor(
    @Inject()
    private readonly prisma: PrismaService
  ) {}

  /** provider + provider_user_id 로 활성 oauth_account 조회 */
  async findByProviderSubject(provider: string, providerUserId: string) {
    return this.prisma.client.oauth_accounts.findFirst({
      where: { provider, provider_user_id: providerUserId, deleted_at: null }
    });
  }

  /** userId + provider 로 활성 oauth_account 조회 */
  async findByUserAndProvider(userId: string, provider: string) {
    return this.prisma.client.oauth_accounts.findFirst({
      where: { user_id: userId, provider, deleted_at: null }
    });
  }

  /** GET /links 응답용 — userId 의 활성 oauth_accounts 목록 */
  async listActiveByUser(userId: string) {
    return this.prisma.client.oauth_accounts.findMany({
      where: { user_id: userId, deleted_at: null },
      select: { provider: true, email: true, created_at: true }
    });
  }

  /** unlink 잠금 가드용 — userId 의 활성 oauth_accounts 수 */
  async countActiveByUser(userId: string): Promise<number> {
    return this.prisma.client.oauth_accounts.count({
      where: { user_id: userId, deleted_at: null }
    });
  }

  /**
   * userId 에 oauth_account 를 생성한다.
   * soft-deleted row 가 이미 존재하면 revive(update) 한다. (D-006 마이그레이션 전 보조)
   */
  async createForUser(
    userId: string,
    provider: string,
    providerUserId: string,
    email: string | null
  ) {
    const existing = await this.prisma.client.oauth_accounts.findFirst({
      where: { user_id: userId, provider, provider_user_id: providerUserId }
    });

    if (existing) {
      return this.prisma.client.oauth_accounts.update({
        where: { oauth_account_id: existing.oauth_account_id },
        data: { email, deleted_at: null, updated_at: new Date() }
      });
    }

    return this.prisma.client.oauth_accounts.create({
      data: { user_id: userId, provider, provider_user_id: providerUserId, email }
    });
  }

  /** soft delete — idempotent (이미 없는 경우도 정상) */
  async softDeleteByUserAndProvider(userId: string, provider: string) {
    return this.prisma.client.oauth_accounts.updateMany({
      where: { user_id: userId, provider, deleted_at: null },
      data: { deleted_at: new Date() }
    });
  }
}
