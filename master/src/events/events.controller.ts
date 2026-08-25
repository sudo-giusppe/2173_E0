import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';
import { HistoryQueryDto } from './dto/history-query.dto';
import { EventsService } from './events.service';

@Controller()
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post('events')
  create(@Body() dto: CreateEventDto) {
    return this.eventsService.create(dto);
  }

  @Get('history')
  findAll(@Query() query: HistoryQueryDto) {
    return this.eventsService.findAll(query);
  }

  @Get('history/:id')
  findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }
}
