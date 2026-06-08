/**
 * Unit tests for DispatchHandlerService — despacho-mensagens (Feature 6).
 */

import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { StatusFalhaMensagem } from '@prisma/client';
import { AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { AmbienteResponseDto } from '../ambiente/dto/ambiente-response.dto';
import { InboxResponseDto } from '../inbox/dto/inbox-response.dto';
import type { IRabbitMQService } from '../rabbitmq/interfaces/rabbitmq-service.interface';
import { DLQ_NAME } from '../rabbitmq/constants/rabbitmq-queue.constants';
import { RedisService } from '../redis/redis.service';
import { DispatchHandlerService } from './dispatch-handler.service';
import type { IDispatchHandler } from './interfaces/dispatch-handler.interface';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInbox(
  overrides: Partial<InboxResponseDto> = {},
): InboxResponseDto {
  const dto = new InboxResponseDto();
  dto.id = 'inbox-uuid-1';
  dto.id_ambiente = 1;
  dto.pid = 'whatsapp-123';
  dto.nome = 'Test Inbox';
  dto.del = false;
  dto.data = '2026-06-01T00:00:00.000Z';
  return Object.assign(dto, overrides);
}

function makeAmbiente(
  overrides: Partial<AmbienteResponseDto> = {},
): AmbienteResponseDto {
  const dto = new AmbienteResponseDto();
  dto.id = 1;
  dto.nome = 'Test Env';
  dto.url = 'https://env.example.com';
  dto.del = false;
  return Object.assign(dto, overrides);
}

function makeAxiosResponse(status: number): AxiosResponse {
  return {
    status,
    statusText: String(status),
    data: {},
    headers: {},
    config: { headers: {} } as AxiosResponse['config'],
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let inboxRepo: {
  findById: jest.Mock;
  findAll: jest.Mock;
  findByPid: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  softDelete: jest.Mock;
};

let ambienteRepo: {
  findById: jest.Mock;
  findAll: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  softDelete: jest.Mock;
};

let httpService: jest.Mocked<Pick<HttpService, 'post'>>;
let mq: jest.Mocked<IRabbitMQService>;
let configService: jest.Mocked<Pick<ConfigService, 'get'>>;
let redis: jest.Mocked<Pick<RedisService, 'get' | 'set'>>;

let service: DispatchHandlerService;

beforeEach(() => {
  inboxRepo = {
    findById: jest.fn(),
    findAll: jest.fn(),
    findByPid: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };

  ambienteRepo = {
    findById: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };

  httpService = {
    post: jest.fn(),
  };

  mq = {
    assertQueue: jest.fn().mockResolvedValue(undefined),
    deleteQueue: jest.fn().mockResolvedValue(undefined),
    startConsuming: jest.fn().mockResolvedValue(undefined),
    stopConsuming: jest.fn().mockResolvedValue(undefined),
    sendToQueue: jest.fn().mockResolvedValue(undefined),
  };

  configService = {
    get: jest.fn((key: string) => {
      if (key === 'DISPATCH_MAX_RETRIES') return '3';
      if (key === 'DISPATCH_BACKOFF_BASE_MS') return '100';
      return undefined;
    }),
  };

  redis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  };

  service = new DispatchHandlerService(
    inboxRepo as any,
    ambienteRepo as any,
    httpService as any,
    mq as any,
    configService as any,
    redis as unknown as RedisService,
  );
});

afterEach(() => {
  jest.resetAllMocks();
});

// ---------------------------------------------------------------------------
// AC-1: 2xx → POST to ambiente.url, no dead-letter
// ---------------------------------------------------------------------------

it('AC-1: Given a message and environment responding 2xx, when handler processes, then POSTs to ambiente.url and does not call mq.sendToQueue', async () => {
  // Arrange
  const inbox = makeInbox();
  const ambiente = makeAmbiente();
  const payload = { data: 'test-payload' };

  inboxRepo.findById.mockResolvedValue(inbox);
  ambienteRepo.findById.mockResolvedValue(ambiente);
  httpService.post.mockReturnValue(of(makeAxiosResponse(200)));

  // Act
  await service.handle(inbox.id, payload);

  // Assert
  expect(httpService.post).toHaveBeenCalledWith(
    ambiente.url,
    payload,
    expect.anything(),
  );
  expect(mq.sendToQueue).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// AC-2: non-2xx → retries up to DISPATCH_MAX_RETRIES
// ---------------------------------------------------------------------------

it('AC-2: Given environment responds non-2xx, when handler processes, then retries up to DISPATCH_MAX_RETRIES times', async () => {
  // Arrange
  jest.useFakeTimers();

  const inbox = makeInbox();
  const ambiente = makeAmbiente();
  const payload = { data: 'retry-payload' };
  const maxRetries = 3;

  inboxRepo.findById.mockResolvedValue(inbox);
  ambienteRepo.findById.mockResolvedValue(ambiente);
  httpService.post.mockReturnValue(
    throwError(() =>
      Object.assign(new Error('HTTP 500'), { response: { status: 500 } }),
    ),
  );

  configService.get.mockImplementation((key: string) => {
    if (key === 'DISPATCH_MAX_RETRIES') return String(maxRetries);
    if (key === 'DISPATCH_BACKOFF_BASE_MS') return '10';
    return undefined;
  });

  // Act
  const handlePromise = service.handle(inbox.id, payload);
  await jest.runAllTimersAsync();
  await handlePromise;

  // Assert
  expect(httpService.post).toHaveBeenCalledTimes(maxRetries);

  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// AC-3: exponential backoff
// ---------------------------------------------------------------------------

it('AC-3: Given exponential backoff with base B, when retrying, then wait for attempt n is B * 2^(n-1)', async () => {
  // Arrange
  jest.useFakeTimers();

  const inbox = makeInbox();
  const ambiente = makeAmbiente();
  const base = 100;
  const maxRetries = 3;
  const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

  inboxRepo.findById.mockResolvedValue(inbox);
  ambienteRepo.findById.mockResolvedValue(ambiente);
  httpService.post.mockReturnValue(
    throwError(() =>
      Object.assign(new Error('HTTP 500'), { response: { status: 500 } }),
    ),
  );

  configService.get.mockImplementation((key: string) => {
    if (key === 'DISPATCH_MAX_RETRIES') return String(maxRetries);
    if (key === 'DISPATCH_BACKOFF_BASE_MS') return String(base);
    return undefined;
  });

  // Act
  const handlePromise = service.handle(inbox.id, {});
  await jest.runAllTimersAsync();
  await handlePromise;

  // Assert
  const delays = setTimeoutSpy.mock.calls
    .map((args) => args[1] as number)
    .filter((d) => d !== undefined);

  expect(delays[0]).toBe(base * Math.pow(2, 0));
  expect(delays[1]).toBe(base * Math.pow(2, 1));

  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// AC-4: all attempts non-2xx → mq.sendToQueue with FALHA_ENVIO
// ---------------------------------------------------------------------------

it('AC-4: Given all attempts respond non-2xx, when exhausted, then mq.sendToQueue called with DLQ_NAME and FALHA_ENVIO', async () => {
  // Arrange
  jest.useFakeTimers();

  const inbox = makeInbox();
  const ambiente = makeAmbiente();
  const payload = { data: 'dead-payload' };

  inboxRepo.findById.mockResolvedValue(inbox);
  ambienteRepo.findById.mockResolvedValue(ambiente);
  httpService.post.mockReturnValue(
    throwError(() =>
      Object.assign(new Error('HTTP 422'), { response: { status: 422 } }),
    ),
  );

  configService.get.mockImplementation((key: string) => {
    if (key === 'DISPATCH_MAX_RETRIES') return '2';
    if (key === 'DISPATCH_BACKOFF_BASE_MS') return '10';
    return undefined;
  });

  // Act
  const handlePromise = service.handle(inbox.id, payload);
  await jest.runAllTimersAsync();
  await handlePromise;

  // Assert
  expect(mq.sendToQueue).toHaveBeenCalledTimes(1);
  expect(mq.sendToQueue).toHaveBeenCalledWith(
    DLQ_NAME,
    expect.objectContaining({
      status: StatusFalhaMensagem.FALHA_ENVIO,
      id_inbox: inbox.id,
      message: payload,
    }),
  );

  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// AC-5: backend unreachable → dead-letter AMBIENTE_INDISPONIVEL
// ---------------------------------------------------------------------------

it('AC-5: Given backend unreachable on all attempts, when exhausted, then mq.sendToQueue with AMBIENTE_INDISPONIVEL', async () => {
  // Arrange
  jest.useFakeTimers();

  const inbox = makeInbox();
  const ambiente = makeAmbiente();
  const payload = { data: 'unreachable' };

  inboxRepo.findById.mockResolvedValue(inbox);
  ambienteRepo.findById.mockResolvedValue(ambiente);
  httpService.post.mockReturnValue(throwError(() => new Error('ECONNREFUSED')));

  configService.get.mockImplementation((key: string) => {
    if (key === 'DISPATCH_MAX_RETRIES') return '2';
    if (key === 'DISPATCH_BACKOFF_BASE_MS') return '10';
    return undefined;
  });

  // Act
  const handlePromise = service.handle(inbox.id, payload);
  await jest.runAllTimersAsync();
  await handlePromise;

  // Assert
  expect(mq.sendToQueue).toHaveBeenCalledWith(
    DLQ_NAME,
    expect.objectContaining({
      status: StatusFalhaMensagem.AMBIENTE_INDISPONIVEL,
      id_inbox: inbox.id,
    }),
  );

  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// AC-6a: inbox del=true → mq.sendToQueue NACK_RECEBIDO
// ---------------------------------------------------------------------------

it('AC-6: Given inbox resolved with del=true, when processing, then mq.sendToQueue with NACK_RECEBIDO without HTTP call', async () => {
  // Arrange
  const inbox = makeInbox({ del: true });
  const payload = { data: 'deleted-inbox' };

  inboxRepo.findById.mockResolvedValue(inbox);

  // Act
  await service.handle(inbox.id, payload);

  // Assert
  expect(httpService.post).not.toHaveBeenCalled();
  expect(mq.sendToQueue).toHaveBeenCalledWith(
    DLQ_NAME,
    expect.objectContaining({
      status: StatusFalhaMensagem.NACK_RECEBIDO,
      id_inbox: inbox.id,
    }),
  );
});

// ---------------------------------------------------------------------------
// AC-6b: inbox not found → mq.sendToQueue NACK_RECEBIDO
// ---------------------------------------------------------------------------

it('AC-6: Given inbox not found (null), when processing, then mq.sendToQueue with NACK_RECEBIDO without HTTP call', async () => {
  // Arrange
  inboxRepo.findById.mockResolvedValue(null);

  // Act
  await service.handle('nonexistent-id', { data: 'orphan' });

  // Assert
  expect(httpService.post).not.toHaveBeenCalled();
  expect(mq.sendToQueue).toHaveBeenCalledWith(
    DLQ_NAME,
    expect.objectContaining({
      status: StatusFalhaMensagem.NACK_RECEBIDO,
    }),
  );
});

// ---------------------------------------------------------------------------
// AC-6c: ambiente del=true → mq.sendToQueue AMBIENTE_INDISPONIVEL
// ---------------------------------------------------------------------------

it('AC-6: Given ambiente resolved with del=true, when processing, then mq.sendToQueue with AMBIENTE_INDISPONIVEL without HTTP call', async () => {
  // Arrange
  const inbox = makeInbox();
  const ambiente = makeAmbiente({ del: true });

  inboxRepo.findById.mockResolvedValue(inbox);
  ambienteRepo.findById.mockResolvedValue(ambiente);

  // Act
  await service.handle(inbox.id, { data: 'deleted-env' });

  // Assert
  expect(httpService.post).not.toHaveBeenCalled();
  expect(mq.sendToQueue).toHaveBeenCalledWith(
    DLQ_NAME,
    expect.objectContaining({
      status: StatusFalhaMensagem.AMBIENTE_INDISPONIVEL,
      id_inbox: inbox.id,
    }),
  );
});

// ---------------------------------------------------------------------------
// AC-6d: ambiente not found → mq.sendToQueue AMBIENTE_INDISPONIVEL
// ---------------------------------------------------------------------------

it('AC-6: Given ambiente not found (null), when processing, then mq.sendToQueue with AMBIENTE_INDISPONIVEL without HTTP call', async () => {
  // Arrange
  const inbox = makeInbox();

  inboxRepo.findById.mockResolvedValue(inbox);
  ambienteRepo.findById.mockResolvedValue(null);

  // Act
  await service.handle(inbox.id, { data: 'no-env' });

  // Assert
  expect(httpService.post).not.toHaveBeenCalled();
  expect(mq.sendToQueue).toHaveBeenCalledWith(
    DLQ_NAME,
    expect.objectContaining({
      status: StatusFalhaMensagem.AMBIENTE_INDISPONIVEL,
      id_inbox: inbox.id,
    }),
  );
});

// ---------------------------------------------------------------------------
// AC-7: HTTP 2xx → does NOT call mq.sendToQueue
// ---------------------------------------------------------------------------

it('AC-7: Given HTTP 2xx, when processing, then does NOT call mq.sendToQueue', async () => {
  // Arrange
  const inbox = makeInbox();
  const ambiente = makeAmbiente();

  inboxRepo.findById.mockResolvedValue(inbox);
  ambienteRepo.findById.mockResolvedValue(ambiente);
  httpService.post.mockReturnValue(of(makeAxiosResponse(201)));

  // Act
  await service.handle(inbox.id, { data: 'ok' });

  // Assert
  expect(mq.sendToQueue).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// AC-8: config values from ConfigService
// ---------------------------------------------------------------------------

it('AC-8: Given handler runs, when reading retries and backoff config, then values come from ConfigService', async () => {
  // Arrange
  jest.useFakeTimers();

  const inbox = makeInbox();
  const ambiente = makeAmbiente();

  inboxRepo.findById.mockResolvedValue(inbox);
  ambienteRepo.findById.mockResolvedValue(ambiente);
  httpService.post.mockReturnValue(
    throwError(() =>
      Object.assign(new Error('fail'), { response: { status: 503 } }),
    ),
  );

  const customMaxRetries = '2';
  const customBase = '50';

  configService.get.mockImplementation((key: string) => {
    if (key === 'DISPATCH_MAX_RETRIES') return customMaxRetries;
    if (key === 'DISPATCH_BACKOFF_BASE_MS') return customBase;
    return undefined;
  });

  // Act
  const handlePromise = service.handle(inbox.id, {});
  await jest.runAllTimersAsync();
  await handlePromise;

  // Assert
  expect(configService.get).toHaveBeenCalledWith('DISPATCH_MAX_RETRIES');
  expect(configService.get).toHaveBeenCalledWith('DISPATCH_BACKOFF_BASE_MS');
  expect(httpService.post).toHaveBeenCalledTimes(Number(customMaxRetries));

  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// AC-9: IDispatchHandler contract
// ---------------------------------------------------------------------------

it('AC-9: Given IDispatchHandler interface, when service is instantiated, then it satisfies the interface (has handle method)', () => {
  const handler: IDispatchHandler = service;
  expect(typeof handler.handle).toBe('function');
});

// ---------------------------------------------------------------------------
// AC-5 (cache): cache hit → ambienteRepo.findById NOT called
// ---------------------------------------------------------------------------

it('AC-5: dado redis.get retorna JSON válido de ambiente, quando handle é chamado com inbox válido, então ambienteRepo.findById NÃO é chamado', async () => {
  // Arrange
  const inbox = makeInbox();
  const ambiente = makeAmbiente();

  inboxRepo.findById.mockResolvedValue(inbox);
  redis.get.mockResolvedValue(JSON.stringify(ambiente));
  httpService.post.mockReturnValue(of(makeAxiosResponse(200)));

  // Act
  await service.handle(inbox.id, { data: 'cache-hit-payload' });

  // Assert
  expect(ambienteRepo.findById).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// AC-6 (cache): cache miss → ambienteRepo.findById IS called + redis.set
// ---------------------------------------------------------------------------

it('AC-6: dado redis.get retorna null, quando handle é chamado, então ambienteRepo.findById é chamado e redis.set é chamado com chave ambiente:<id> e TTL 3600', async () => {
  // Arrange
  const inbox = makeInbox();
  const ambiente = makeAmbiente();

  inboxRepo.findById.mockResolvedValue(inbox);
  redis.get.mockResolvedValue(null);
  ambienteRepo.findById.mockResolvedValue(ambiente);
  httpService.post.mockReturnValue(of(makeAxiosResponse(200)));

  // Act
  await service.handle(inbox.id, { data: 'cache-miss-payload' });

  // Assert
  expect(ambienteRepo.findById).toHaveBeenCalledWith(inbox.id_ambiente);
  expect(redis.set).toHaveBeenCalledTimes(1);
  expect(redis.set).toHaveBeenCalledWith(
    `ambiente:${ambiente.id}`,
    expect.any(String),
    3600,
  );
});

// ---------------------------------------------------------------------------
// AC-7 (cache): successful dispatch → logger emits INFO with inboxId, url, status
// ---------------------------------------------------------------------------

it('AC-7: dado despacho HTTP bem-sucedido, quando handle completa, então logger emite INFO contendo inboxId, url e status code', async () => {
  // Arrange
  const inbox = makeInbox();
  const ambiente = makeAmbiente();

  inboxRepo.findById.mockResolvedValue(inbox);
  ambienteRepo.findById.mockResolvedValue(ambiente);
  httpService.post.mockReturnValue(of(makeAxiosResponse(200)));

  const logSpy = jest.spyOn(service['logger'], 'log');

  // Act
  await service.handle(inbox.id, { data: 'success-payload' });

  // Assert
  expect(logSpy).toHaveBeenCalledTimes(1);
  const logMessage: string = logSpy.mock.calls[0][0] as string;
  expect(logMessage).toContain('Dispatched inbox');
  expect(logMessage).toContain(inbox.id);
  expect(logMessage).toContain(ambiente.url);
  expect(logMessage).toContain('200');
});
