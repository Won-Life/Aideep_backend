import { Injectable } from '@nestjs/common';
import { Observable, Subject, filter, map } from 'rxjs';
import { NodeRespository } from 'src/node/node.repository';

export interface NodeMoveEvent {
  roomId: string;
  nodeId: string;
  x: number;
  y: number;
  userId: string;
}

@Injectable()
export class SseService {
  constructor(private readonly nodeRepository: NodeRespository) {}

  private readonly events$ = new Subject<NodeMoveEvent>();

  emit(event: NodeMoveEvent): void {
    console.log(`[SSE] emit - roomId: "${event.roomId}"`, event);
    this.events$.next(event);
  }

  getStream(roomId: string): Observable<MessageEvent> {
    return this.events$.pipe(
      filter((event) => {
        const pass = event.roomId === roomId;
        console.log(
          `[SSE] filter - event.roomId: "${event.roomId}" / 구독 roomId: "${roomId}" → ${pass ? '통과' : '차단'}`
        );
        return pass;
      }),
      map((event) => ({ data: event }) as MessageEvent)
    );
  }
}
