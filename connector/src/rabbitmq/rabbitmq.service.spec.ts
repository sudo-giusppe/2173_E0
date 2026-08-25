import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { RabbitmqService } from './rabbitmq.service';

jest.mock('amqplib', () => ({
  connect: jest.fn(),
}));

describe('RabbitmqService', () => {
  let service: RabbitmqService;

  const configMock = {
    get: jest.fn((key: string) => {
      const map: Record<string, string> = {
        AMQP_URL: 'amqps://user:pass@broker:5671',
        QUEUE_NAME: 'observer.X.q',
        MASTER_URL: 'http://127.0.0.1:3001',
      };
      return map[key];
    }),
  };

  const channelMock = {
    checkQueue: jest.fn().mockResolvedValue({
      queue: 'observer.5.q',
      messageCount: 0,
      consumerCount: 0,
    }),
    consume: jest.fn().mockResolvedValue({ consumerTag: 'tag' }),
    ack: jest.fn(),
    nack: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  };

  const connectionMock = {
    createChannel: jest.fn().mockResolvedValue(channelMock),
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    (amqp.connect as jest.Mock).mockResolvedValue(connectionMock);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RabbitmqService,
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<RabbitmqService>(RabbitmqService);
    jest.spyOn(global, 'setTimeout').mockImplementation(() => 0 as never);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should connect, check queue and consume on init', async () => {
    await service.onModuleInit();

    expect(amqp.connect).toHaveBeenCalledWith('amqps://user:pass@broker:5671');
    expect(channelMock.checkQueue).toHaveBeenCalledWith('observer.X.q');
    expect(channelMock.consume).toHaveBeenCalledWith(
      'observer.X.q',
      expect.any(Function),
      { noAck: false },
    );
  });

  it('should schedule reconnect on connect failure with backoff', async () => {
    (amqp.connect as jest.Mock).mockRejectedValueOnce(new Error('refused'));

    await service.onModuleInit();

    expect(setTimeout).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Number),
    );
  });
});
