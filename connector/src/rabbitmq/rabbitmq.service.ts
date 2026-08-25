import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as amqp from 'amqplib';
import { EventPayloadDto } from './dto/event-payload.dto';

@Injectable()
export class RabbitmqService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitmqService.name);
  private connection: amqp.ChannelModel | null = null;
  private channel: amqp.Channel | null = null;
  private retries = 0;
  private readonly maxRetries = 10;
  private closing = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    this.closing = true;
    await this.close();
  }

  private backoffDelay(): number {
    const exp = Math.min(this.retries, this.maxRetries);
    return Math.min(1000 * 2 ** exp, 30000);
  }

  private async connect(): Promise<void> {
    try {
      const url = this.config.get<string>('AMQP_URL');
      const queue = this.config.get<string>('QUEUE_NAME');
      if (!url || !queue) {
        throw new Error('Faltan AMQP_URL o QUEUE_NAME en el entorno');
      }

      this.connection = await amqp.connect(url);
      this.channel = await this.connection.createChannel();
      await this.channel.checkQueue(queue); // solo verifica que exista
      this.retries = 0;

      this.connection.on('close', () => this.handleDisconnect());
      this.connection.on('error', (err) =>
        this.logger.error(`Conexión error: ${err.message}`),
      );
      this.channel.on('error', (err) =>
        this.logger.error(`Channel error: ${err.message}`),
      );

      await this.consume();
      this.logger.log(`Conectado al broker, consumiendo de ${queue}`);
    } catch (err) {
      this.handleDisconnect(err as Error);
    }
  }

  private handleDisconnect(err?: Error): void {
    if (this.closing) return;
    if (err) this.logger.error(`Conexión falló: ${err.message}`);
    this.retries++;
    const delay = this.backoffDelay();
    this.logger.warn(`Reconectando en ${delay}ms (intento ${this.retries})`);
    setTimeout(() => {
      void this.connect();
    }, delay);
  }

  private async consume(): Promise<void> {
    const queue = this.config.get<string>('QUEUE_NAME');
    await this.channel!.consume(
      queue!,
      (msg) => {
        void this.process(msg);
      },
      { noAck: false },
    );
  }

  private async process(msg: amqp.ConsumeMessage | null): Promise<void> {
    if (!msg || !this.channel) return;

    let payload: EventPayloadDto;
    try {
      const raw = msg.content.toString();
      const parsed = JSON.parse(raw) as unknown;
      payload = plainToInstance(EventPayloadDto, parsed);
      const errors = await validate(payload);
      if (errors.length > 0) {
        throw new Error(
          `Schema inválido: ${errors.map((e) => e.toString()).join('; ')}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Mensaje descartado (parse/validación): ${(err as Error).message}`,
      );
      this.channel.nack(msg, false, false);
      return;
    }

    try {
      const masterUrl = this.config.get<string>('MASTER_URL');
      const res = await fetch(`${masterUrl}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        this.logger.log(
          `Evento ${payload.idpk} enviado a master (${res.status})`,
        );
        this.channel.ack(msg);
      } else {
        throw new Error(`master respondió ${res.status}`);
      }
    } catch (err) {
      this.logger.error(
        `Error al enviar a master, re-queue: ${(err as Error).message}`,
      );
      this.channel.nack(msg, false, true);
    }
  }

  private async close(): Promise<void> {
    try {
      await this.channel?.close();
    } catch {
      /* noop */
    }
    try {
      await this.connection?.close();
    } catch {
      /* noop */
    }
    this.logger.log('Conexión cerrada');
  }
}
