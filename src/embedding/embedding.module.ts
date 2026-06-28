import { Module } from '@nestjs/common';
import { EmbeddingScheduleService } from './embedding.schedule.service';
import { EmbeddingWorkerService } from './embedding.worker.service';

@Module({
  providers: [EmbeddingScheduleService, EmbeddingWorkerService],
  exports: [EmbeddingScheduleService]
})
export class EmbeddingModule {}
