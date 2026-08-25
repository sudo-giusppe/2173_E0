import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { DemandEntry } from './entities/demand-entry.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DemandEntry])],
  controllers: [EventsController],
  providers: [EventsService],
})
export class EventsModule {}
