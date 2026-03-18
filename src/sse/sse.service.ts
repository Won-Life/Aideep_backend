import { Injectable } from '@nestjs/common';
import { Observable, Subject, filter, map } from 'rxjs';
import { SseEvent } from './sse.event';

// ──────────────────────────────────────────
// 서비스
// ──────────────────────────────────────────
@Injectable()
export class SseService {
  private readonly events$ = new Subject<SseEvent>();

  emit(event: SseEvent): void {
    console.log(event);
    this.events$.next(event);
  }

  getStream(workspaceId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      console.log(`[SSE] 구독 등록됨 - workspaceId: ${workspaceId}`);
      const subscription = this.events$
        .pipe(
          filter((event) => event.workspaceId === workspaceId),
          map((event) => ({ data: event }) as MessageEvent)
        )
        .subscribe(subscriber);

      return () => {
        console.log(`[SSE] 구독 해제됨 - workspaceId: ${workspaceId}`);
        subscription.unsubscribe();
      };
    });
  }
}
