import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

describe('EventsController', () => {
  let controller: EventsController;

  const eventsServiceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        {
          provide: EventsService,
          useValue: eventsServiceMock,
        },
      ],
    }).compile();

    controller = module.get<EventsController>(EventsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('POST /events should delegate to service.create', async () => {
    const dto = { idpk: 'x', type: 'y', packageBody: {} };
    eventsServiceMock.create.mockResolvedValueOnce({
      created: 1,
      duplicates: 0,
    });

    await expect(controller.create(dto as never)).resolves.toEqual({
      created: 1,
      duplicates: 0,
    });
    expect(eventsServiceMock.create).toHaveBeenCalledWith(dto);
  });

  it('GET /history should delegate to service.findAll', async () => {
    const query = { page: 2, limit: 10 };
    eventsServiceMock.findAll.mockResolvedValueOnce({ data: [], total: 0 });

    await expect(controller.findAll(query as never)).resolves.toEqual({
      data: [],
      total: 0,
    });
    expect(eventsServiceMock.findAll).toHaveBeenCalledWith(query);
  });

  it('GET /history/:id should delegate to service.findOne', async () => {
    eventsServiceMock.findOne.mockResolvedValueOnce({ id: 'a' });

    await expect(controller.findOne('a')).resolves.toEqual({ id: 'a' });
    expect(eventsServiceMock.findOne).toHaveBeenCalledWith('a');
  });
});
