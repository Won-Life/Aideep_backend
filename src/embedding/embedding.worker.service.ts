import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from 'src/redis/redis.service';
import { REDIS_KEYS } from 'src/redis/redis.keys';
import { EmbeddingMeta } from './embedding.types';

const POLL_INTERVAL_MS = 5000;
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 30000;

/**
 * 임베딩 Consumer.
 *
 * onModuleInit에서 폴링 루프를 시작한다. 매 주기마다 만기된(dueAt <= now) 노드들을
 * ZSET에서 조회하여 AI 서버로 nodeId만 전달한다. 블로킹 명령(BLPOP 등)을 쓰지 않으므로
 * 공유 RedisService 클라이언트를 그대로 사용해도 다른 작업을 막지 않는다.
 */
@Injectable()
export class EmbeddingWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmbeddingWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;
  private readonly aiServerUrl?: string;
  private readonly aiApiKey?: string;

  constructor(
    private readonly redisService: RedisService,
    private readonly config: ConfigService
  ) {
    this.aiServerUrl = this.config.get<string>('AI_SERVER_URL');
    this.aiApiKey = this.config.get<string>('AI_SERVER_API_KEY');
  }

  onModuleInit() {
    if (!this.aiServerUrl) {
      this.logger.warn(
        'AI_SERVER_URL 미설정 → 임베딩 워커를 시작하지 않습니다.'
      );
      return;
    }
    this.scheduleNextTick();
    this.logger.log('임베딩 워커 폴링 루프 시작');
  }

  onModuleDestroy() {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNextTick() {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      void this.tick().finally(() => this.scheduleNextTick());
    }, POLL_INTERVAL_MS);
  }

  /** 만기된 노드들을 처리한다. 중첩 실행을 가드한다. */
  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const client = this.redisService.getClient();
      const now = Date.now();
      const dueNodeIds = await client.zRangeByScore(
        REDIS_KEYS.EMBED_SCHEDULE,
        0,
        now
      );

      for (const nodeId of dueNodeIds) {
        await this.processNode(nodeId, now);
      }
    } catch (e) {
      this.logger.error(`임베딩 폴링 오류: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async processNode(nodeId: string, now: number): Promise<void> {
    const client = this.redisService.getClient();
    const metaRaw = await client.hGet(REDIS_KEYS.EMBED_META, nodeId);
    if (!metaRaw) {
      // 메타가 없으면 스케줄만 정리
      await client.zRem(REDIS_KEYS.EMBED_SCHEDULE, nodeId);
      return;
    }

    const meta = JSON.parse(metaRaw) as EmbeddingMeta;

    try {
      await this.sendToAi(nodeId, meta);
      await client.zRem(REDIS_KEYS.EMBED_SCHEDULE, nodeId);
      await client.hDel(REDIS_KEYS.EMBED_META, nodeId);
    } catch (e) {
      const attempt = (meta.attempt ?? 0) + 1;
      if (attempt < MAX_ATTEMPTS) {
        const next: EmbeddingMeta = { ...meta, attempt };
        await client.zAdd(REDIS_KEYS.EMBED_SCHEDULE, {
          score: now + BACKOFF_MS,
          value: nodeId
        });
        await client.hSet(REDIS_KEYS.EMBED_META, nodeId, JSON.stringify(next));
        this.logger.warn(
          `임베딩 재시도 예약 (nodeId=${nodeId}, attempt=${attempt}): ${(e as Error).message}`
        );
      } else {
        await client.lPush(
          REDIS_KEYS.EMBED_DEAD,
          JSON.stringify({ nodeId, ...meta })
        );
        await client.zRem(REDIS_KEYS.EMBED_SCHEDULE, nodeId);
        await client.hDel(REDIS_KEYS.EMBED_META, nodeId);
        this.logger.error(
          `임베딩 최종 실패 → DLQ 이동 (nodeId=${nodeId}): ${(e as Error).message}`
        );
      }
    }
  }

  private async sendToAi(nodeId: string, meta: EmbeddingMeta): Promise<void> {
    const res = await fetch(`${this.aiServerUrl}/embed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.aiApiKey ? { Authorization: `Bearer ${this.aiApiKey}` } : {})
      },
      body: JSON.stringify({
        nodeId,
        op: meta.op,
        workspaceId: meta.workspaceId
      })
    });

    if (!res.ok) {
      throw new Error(`AI /embed 응답 오류: ${res.status}`);
    }
  }
}
