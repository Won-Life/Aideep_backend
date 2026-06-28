import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from 'src/redis/redis.service';
import { REDIS_KEYS } from 'src/redis/redis.keys';
import { EmbeddingMeta, EmbeddingOp } from './embedding.types';

/**
 * 임베딩 Producer.
 *
 * 노드 생성/수정/삭제 시 즉시 AI 서버를 호출하지 않고, ZSET(스케줄)에 dueAt을 기록한다.
 * 같은 노드가 디바운스 시간 내에 여러 번 트리거되면 score만 미래로 갱신되어
 * 자연스럽게 1건으로 합쳐진다(coalesce). 실제 처리는 EmbeddingWorkerService가 수행한다.
 */
@Injectable()
export class EmbeddingScheduleService {
  private readonly logger = new Logger(EmbeddingScheduleService.name);
  private readonly debounceMs: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly config: ConfigService
  ) {
    this.debounceMs = Number(this.config.get('EMBED_DEBOUNCE_MS') ?? 60000);
  }

  /**
   * 노드 임베딩을 디바운스 큐에 예약한다.
   * 디커플링 보장을 위해 절대 예외를 던지지 않는다(실패해도 로깅만).
   */
  async schedule(
    nodeId: string,
    workspaceId: string,
    op: EmbeddingOp
  ): Promise<void> {
    try {
      const dueAt = Date.now() + this.debounceMs;
      const meta: EmbeddingMeta = { workspaceId, op };

      const client = this.redisService.getClient();
      await client.zAdd(REDIS_KEYS.EMBED_SCHEDULE, {
        score: dueAt,
        value: nodeId
      });
      await client.hSet(REDIS_KEYS.EMBED_META, nodeId, JSON.stringify(meta));
    } catch (e) {
      this.logger.error(
        `임베딩 예약 실패 (nodeId=${nodeId}, op=${op}): ${(e as Error).message}`
      );
    }
  }
}
