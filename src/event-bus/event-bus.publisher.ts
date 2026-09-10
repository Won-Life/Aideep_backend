import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from 'src/redis/redis.service';
import {
  EVENT_BUS_CHANNEL,
  EVENT_BUS_CONTRACT_VERSION,
  EventBusEnvelope,
  EventBusKind,
  WsEvent
} from './event-bus.contract';

const ORIGIN = 'nest-api';

/**
 * 실시간 서버(websocket-server)로 이벤트를 발행합니다.
 * 시그니처는 기존 WsGateway의 공개 API와 동일하게 유지합니다 (sync void, fire-and-forget).
 */
@Injectable()
export class EventBusPublisher {
  private readonly logger = new Logger(EventBusPublisher.name);

  constructor(private readonly redisService: RedisService) {}

  broadcast(event: WsEvent): void {
    this.publish('WORKSPACE_EVENT', event);
  }

  broadcastYjsUpdate(nodeId: string, update: Uint8Array): void {
    this.publish('YJS_UPDATE', {
      nodeId,
      updateBase64: Buffer.from(update).toString('base64')
    });
  }

  private publish(kind: EventBusKind, payload: EventBusEnvelope['payload']) {
    const envelope: EventBusEnvelope = {
      v: EVENT_BUS_CONTRACT_VERSION,
      kind,
      messageId: randomUUID(),
      publishedAt: new Date().toISOString(),
      origin: ORIGIN,
      payload
    };

    void this.redisService
      .getClient()
      .publish(EVENT_BUS_CHANNEL, JSON.stringify(envelope))
      .catch((err) =>
        this.logger.error(`Failed to publish ${kind} to ${EVENT_BUS_CHANNEL}`, err)
      );
  }
}
