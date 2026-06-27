import { Module }         from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SyncController } from './sync.controller';
import { SyncService }    from './sync.service';

@Module({
  imports:     [ScheduleModule.forRoot()],
  controllers: [SyncController],
  providers:   [SyncService],
  exports:     [SyncService],
})
export class SyncModule {}
