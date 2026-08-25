import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventsService } from './events.service';
import { DemandEntry } from './entities/demand-entry.entity';

describe('EventsService', () => {
  let service: EventsService;

  const demandRepoMock = {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: getRepositoryToken(DemandEntry),
          useValue: demandRepoMock,
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create new entries and skip duplicates', async () => {
    demandRepoMock.findOne.mockResolvedValueOnce(null);
    demandRepoMock.findOne.mockResolvedValueOnce({ id: 'existing' });
    demandRepoMock.create.mockImplementation(
      (e: Partial<DemandEntry>) => e as DemandEntry,
    );
    demandRepoMock.save.mockResolvedValue({});

    const result = await service.create({
      idpk: '123e4567-e89b-42d3-a456-426614174000',
      type: 'demand-set',
      packageBody: {
        validUntil: '2026-12-12T00:00:00Z',
        demands: [
          { city: 'Los Santos', demand: 10223, unit: 'GW' },
          { city: 'Puerto', demand: 5000, unit: 'GW' },
        ],
      },
    });

    expect(demandRepoMock.save).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ created: 1, duplicates: 1 });
  });

  it('should find all with default pagination', async () => {
    demandRepoMock.findAndCount.mockResolvedValueOnce([[{ id: 'a' }], 1]);

    const result = await service.findAll({});

    expect(demandRepoMock.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 25 }),
    );
    expect(result).toEqual({
      data: [{ id: 'a' }],
      total: 1,
      page: 1,
      limit: 25,
    });
  });

  it('should return an entry by id', async () => {
    demandRepoMock.findOneBy.mockResolvedValueOnce({ id: 'a' });

    await expect(service.findOne('a')).resolves.toEqual({ id: 'a' });
  });

  it('should throw NotFoundException when entry does not exist', async () => {
    demandRepoMock.findOneBy.mockResolvedValueOnce(null);

    await expect(service.findOne('nope')).rejects.toThrow('not found');
  });
});
