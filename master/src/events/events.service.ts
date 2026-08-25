import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Between, FindOptionsWhere, Repository } from 'typeorm';
import { CreateEventDto } from './dto/create-event.dto';
import { HistoryQueryDto } from './dto/history-query.dto';
import { DemandEntry } from './entities/demand-entry.entity';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(DemandEntry)
    private readonly demandRepo: Repository<DemandEntry>,
  ) {}

  async create(dto: CreateEventDto): Promise<{
    created: number;
    duplicates: number;
  }> {
    let created = 0;
    let duplicates = 0;

    for (const demand of dto.packageBody.demands) {
      const validUntil = new Date(dto.packageBody.validUntil);

      const exists = await this.demandRepo.findOne({
        where: {
          idpk: dto.idpk,
          city: demand.city,
          validUntil,
        },
      });

      if (exists) {
        duplicates++;
        continue;
      }

      const entry = this.demandRepo.create({
        id: randomUUID(),
        idpk: dto.idpk,
        type: dto.type,
        city: demand.city,
        demand: demand.demand,
        unit: demand.unit,
        validUntil,
        metaContent: dto.packageBody.metaContent ?? null,
        constraints: dto.packageBody.constraints ?? null,
      });
      await this.demandRepo.save(entry);
      created++;
    }

    return { created, duplicates };
  }

  async findAll(query: HistoryQueryDto): Promise<{
    data: DemandEntry[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 25, 100);

    const where: FindOptionsWhere<DemandEntry> = {};
    if (query.city) where.city = query.city;
    if (query.idpk) where.idpk = query.idpk;
    if (query.type) where.type = query.type;
    if (query.from || query.to) {
      where.receivedAt = Between(
        query.from ? new Date(query.from) : new Date(0),
        query.to ? new Date(query.to) : new Date(),
      );
    }

    const [data, total] = await this.demandRepo.findAndCount({
      where,
      order: { receivedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, limit };
  }

  async findOne(id: string): Promise<DemandEntry> {
    const entry = await this.demandRepo.findOneBy({ id });
    if (!entry) {
      throw new NotFoundException(`Entry with id ${id} not found`);
    }
    return entry;
  }
}
