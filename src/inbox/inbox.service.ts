import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnApplicationBootstrap,
  Optional,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { DISPATCH_HANDLER } from '../dispatch/constants/dispatch-tokens.constants';
import type { IDispatchHandler } from '../dispatch/interfaces/dispatch-handler.interface';
import { LoggerService } from '../logger/logger.service';
import { DEFAULT_DLQ_ARGS } from '../rabbitmq/constants/rabbitmq-queue.constants';
import { RABBITMQ_SERVICE } from '../rabbitmq/constants/rabbitmq-tokens.constants';
import type {
  IRabbitMQService,
  MessageHandler,
} from '../rabbitmq/interfaces/rabbitmq-service.interface';
import { QueueNameFactory } from '../rabbitmq/queue-name.factory';
import { INBOX_REPOSITORY } from './constants/inbox-tokens.constants';
import { CreateInboxDto } from './dto/create-inbox.dto';
import { InboxResponseDto } from './dto/inbox-response.dto';
import { UpdateInboxDto } from './dto/update-inbox.dto';
import type { IInboxRepository } from './interfaces/inbox-repository.interface';

@Injectable()
export class InboxService implements OnApplicationBootstrap {
  constructor(
    @Inject(INBOX_REPOSITORY) private readonly repo: IInboxRepository,
    @Inject(RABBITMQ_SERVICE) private readonly rabbitMQ: IRabbitMQService,
    private readonly logger: LoggerService,
    @Optional()
    @Inject(DISPATCH_HANDLER)
    private readonly dispatchHandler: IDispatchHandler | null = null,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const inboxes = await this.repo.findAll();
    for (const inbox of inboxes) {
      await this.rabbitMQ.assertQueue(
        QueueNameFactory.inbox(inbox.id),
        DEFAULT_DLQ_ARGS,
      );
      await this.rabbitMQ.startConsuming(
        QueueNameFactory.inbox(inbox.id),
        this.getMessageHandler(inbox.id),
      );
    }
  }

  async findAll(): Promise<InboxResponseDto[]> {
    const results = await this.repo.findAll();
    return results.map((r) =>
      plainToInstance(InboxResponseDto, r, { excludeExtraneousValues: true }),
    );
  }

  async findById(id: string): Promise<InboxResponseDto> {
    const result = await this.repo.findById(id);
    if (!result) {
      throw new NotFoundException(`Inbox com id ${id} não encontrada.`);
    }
    return plainToInstance(InboxResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  async create(dto: CreateInboxDto): Promise<InboxResponseDto> {
    const existing = await this.repo.findByPid(dto.pid);
    if (existing) {
      throw new ConflictException(`Inbox com pid '${dto.pid}' já existe.`);
    }
    const inbox = await this.repo.create(dto);
    await this.rabbitMQ.assertQueue(
      QueueNameFactory.inbox(inbox.id),
      DEFAULT_DLQ_ARGS,
    );
    await this.rabbitMQ.startConsuming(
      QueueNameFactory.inbox(inbox.id),
      this.getMessageHandler(inbox.id),
    );
    return plainToInstance(InboxResponseDto, inbox, {
      excludeExtraneousValues: true,
    });
  }

  async update(id: string, dto: UpdateInboxDto): Promise<InboxResponseDto> {
    await this.findById(id);
    const result = await this.repo.update(id, dto);
    return plainToInstance(InboxResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  async softDelete(id: string): Promise<InboxResponseDto> {
    await this.findById(id);
    const result = await this.repo.softDelete(id);
    await this.rabbitMQ.stopConsuming(QueueNameFactory.inbox(id));
    await this.rabbitMQ.deleteQueue(QueueNameFactory.inbox(id));
    return plainToInstance(InboxResponseDto, result, {
      excludeExtraneousValues: true,
    });
  }

  private getMessageHandler(inboxId: string): MessageHandler {
    const logger = this.logger;
    const dispatchHandler = this.dispatchHandler;
    return async function handler(buf: Buffer): Promise<void> {
      if (!dispatchHandler) {
        logger.log('Message received — dispatch handler not available');
        return;
      }
      let payload: unknown;
      try {
        payload = JSON.parse(buf.toString('utf8')) as unknown;
      } catch {
        payload = buf.toString('utf8');
      }
      await dispatchHandler.handle(inboxId, payload);
    };
  }
}
