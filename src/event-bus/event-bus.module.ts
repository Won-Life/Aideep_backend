import { Module } from '@nestjs/common';
import { EventBusPublisher } from './event-bus.publisher';

@Module({
  providers: [EventBusPublisher],
  exports: [EventBusPublisher]
})
export class EventBusModule {}
