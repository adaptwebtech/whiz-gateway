/**
 * Unit tests for DispatchHandlerService — despacho-mensagens (Feature 6).
 * Tests are RED: the implementation files do not exist yet.
 */

import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { StatusFalhaMensagem } from '@prisma/client';
import { AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { AmbienteResponseDto } from '../ambiente/dto/ambiente-response.dto';
import { DeadLetterService } from '../dead-letter/dead-letter.service';
import { InboxResponseDto } from '../inbox/dto/inbox-response.dto';
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
let deadLetterService: jest.Mocked<Pick<DeadLetterService, 'create'>>;
let configService: jest.Mocked<Pick<ConfigService, 'get'>>;

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

  deadLetterService = {
    create: jest.fn(),
  };

  configService = {
    get: jest.fn((key: string) => {
      if (key === 'DISPATCH_MAX_RETRIES') return '3';
      if (key === 'DISPATCH_BACKOFF_BASE_MS') return '100';
      return undefined;
    }),
  };

  service = new DispatchHandlerService(
    inboxRepo as any,
    ambienteRepo as any,
    httpService as any,
    deadLetterService as any,
    configService as any,
  );
});

afterEach(() => {
  jest.resetAllMocks();
});

// ---------------------------------------------------------------------------
// AC-1: 2xx → POST to ambiente.url + ACK (no dead-letter)
// ---------------------------------------------------------------------------

it('AC-1: Given a message in queue and environment responding 2xx, when handler processes it, then POSTs to ambiente.url with raw payload and does not call deadLetterService', async () => {
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
  expect(deadLetterService.create).not.toHaveBeenCalled();
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
  deadLetterService.create.mockResolvedValue({} as any);

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
// AC-3: exponential backoff — wait for attempt n is B * 2^(n-1)
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
  deadLetterService.create.mockResolvedValue({} as any);

  configService.get.mockImplementation((key: string) => {
    if (key === 'DISPATCH_MAX_RETRIES') return String(maxRetries);
    if (key === 'DISPATCH_BACKOFF_BASE_MS') return String(base);
    return undefined;
  });

  // Act
  const handlePromise = service.handle(inbox.id, {});
  await jest.runAllTimersAsync();
  await handlePromise;

  // Assert — backoff delays match B * 2^(n-1) for n = 1..maxRetries-1
  const delays = setTimeoutSpy.mock.calls
    .map((args) => args[1] as number)
    .filter((d) => d !== undefined);

  // At least (maxRetries - 1) sleeps: attempt 1→ base*1, attempt 2→ base*2, attempt 3→ base*4
  expect(delays[0]).toBe(base * Math.pow(2, 0)); // attempt 1: B * 2^0 = B
  expect(delays[1]).toBe(base * Math.pow(2, 1)); // attempt 2: B * 2^1 = 2B

  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// AC-4: all attempts non-2xx → DeadLetterService.create with FALHA_ENVIO
// ---------------------------------------------------------------------------

it('AC-4: Given all attempts respond non-2xx, when exhausted, then DeadLetterService.create called with status=FALHA_ENVIO and id_inbox', async () => {
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
  deadLetterService.create.mockResolvedValue({} as any);

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
  expect(deadLetterService.create).toHaveBeenCalledTimes(1);
  expect(deadLetterService.create).toHaveBeenCalledWith(
    expect.objectContaining({
      status: StatusFalhaMensagem.FALHA_ENVIO,
      id_inbox: inbox.id,
      message: payload,
    }),
  );

  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// AC-5: backend unreachable on all attempts → dead-letter AMBIENTE_INDISPONIVEL
// ---------------------------------------------------------------------------

it('AC-5: Given backend unreachable on all attempts, when exhausted, then dead-letter with status=AMBIENTE_INDISPONIVEL', async () => {
  // Arrange
  jest.useFakeTimers();

  const inbox = makeInbox();
  const ambiente = makeAmbiente();
  const payload = { data: 'unreachable' };

  inboxRepo.findById.mockResolvedValue(inbox);
  ambienteRepo.findById.mockResolvedValue(ambiente);
  // No response property → treated as connection refused / timeout
  httpService.post.mockReturnValue(throwError(() => new Error('ECONNREFUSED')));
  deadLetterService.create.mockResolvedValue({} as any);

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
  expect(deadLetterService.create).toHaveBeenCalledWith(
    expect.objectContaining({
      status: StatusFalhaMensagem.AMBIENTE_INDISPONIVEL,
      id_inbox: inbox.id,
    }),
  );

  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// AC-6a: inbox with del=true → dead-letter NACK_RECEBIDO without HTTP retry
// ---------------------------------------------------------------------------

it('AC-6: Given inbox resolved with del=true, when processing, then dead-letter with status=NACK_RECEBIDO without any HTTP call', async () => {
  // Arrange
  const inbox = makeInbox({ del: true });
  const payload = { data: 'deleted-inbox' };

  inboxRepo.findById.mockResolvedValue(inbox);

  deadLetterService.create.mockResolvedValue({} as any);

  // Act
  await service.handle(inbox.id, payload);

  // Assert
  expect(httpService.post).not.toHaveBeenCalled();
  expect(deadLetterService.create).toHaveBeenCalledWith(
    expect.objectContaining({
      status: StatusFalhaMensagem.NACK_RECEBIDO,
      id_inbox: inbox.id,
    }),
  );
});

// ---------------------------------------------------------------------------
// AC-6b: inbox not found → dead-letter NACK_RECEBIDO without HTTP retry
// ---------------------------------------------------------------------------

it('AC-6: Given inbox not found (null), when processing, then dead-letter with status=NACK_RECEBIDO without any HTTP call', async () => {
  // Arrange
  inboxRepo.findById.mockResolvedValue(null);
  deadLetterService.create.mockResolvedValue({} as any);

  // Act
  await service.handle('nonexistent-id', { data: 'orphan' });

  // Assert
  expect(httpService.post).not.toHaveBeenCalled();
  expect(deadLetterService.create).toHaveBeenCalledWith(
    expect.objectContaining({
      status: StatusFalhaMensagem.NACK_RECEBIDO,
    }),
  );
});

// ---------------------------------------------------------------------------
// AC-6c: ambiente with del=true → dead-letter AMBIENTE_INDISPONIVEL without HTTP retry
// ---------------------------------------------------------------------------

it('AC-6: Given ambiente resolved with del=true, when processing, then dead-letter with status=AMBIENTE_INDISPONIVEL without any HTTP call', async () => {
  // Arrange
  const inbox = makeInbox();
  const ambiente = makeAmbiente({ del: true });

  inboxRepo.findById.mockResolvedValue(inbox);
  ambienteRepo.findById.mockResolvedValue(ambiente);
  deadLetterService.create.mockResolvedValue({} as any);

  // Act
  await service.handle(inbox.id, { data: 'deleted-env' });

  // Assert
  expect(httpService.post).not.toHaveBeenCalled();
  expect(deadLetterService.create).toHaveBeenCalledWith(
    expect.objectContaining({
      status: StatusFalhaMensagem.AMBIENTE_INDISPONIVEL,
      id_inbox: inbox.id,
    }),
  );
});

// ---------------------------------------------------------------------------
// AC-6d: ambiente not found (null) → dead-letter AMBIENTE_INDISPONIVEL without HTTP retry
// ---------------------------------------------------------------------------

it('AC-6: Given ambiente not found (null), when processing, then dead-letter with status=AMBIENTE_INDISPONIVEL without any HTTP call', async () => {
  // Arrange
  const inbox = makeInbox();

  inboxRepo.findById.mockResolvedValue(inbox);
  ambienteRepo.findById.mockResolvedValue(null);
  deadLetterService.create.mockResolvedValue({} as any);

  // Act
  await service.handle(inbox.id, { data: 'no-env' });

  // Assert
  expect(httpService.post).not.toHaveBeenCalled();
  expect(deadLetterService.create).toHaveBeenCalledWith(
    expect.objectContaining({
      status: StatusFalhaMensagem.AMBIENTE_INDISPONIVEL,
      id_inbox: inbox.id,
    }),
  );
});

// ---------------------------------------------------------------------------
// AC-7: HTTP 2xx → does NOT insert into fila_mensagens_mortas
// ---------------------------------------------------------------------------

it('AC-7: Given HTTP 2xx, when processing, then does NOT call DeadLetterService.create', async () => {
  // Arrange
  const inbox = makeInbox();
  const ambiente = makeAmbiente();

  inboxRepo.findById.mockResolvedValue(inbox);
  ambienteRepo.findById.mockResolvedValue(ambiente);
  httpService.post.mockReturnValue(of(makeAxiosResponse(201)));

  // Act
  await service.handle(inbox.id, { data: 'ok' });

  // Assert
  expect(deadLetterService.create).not.toHaveBeenCalled();
});

// ---------------------------------------------------------------------------
// AC-8: DISPATCH_MAX_RETRIES and DISPATCH_BACKOFF_BASE_MS come from ConfigService
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
  deadLetterService.create.mockResolvedValue({} as any);

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
// AC-9: IDispatchHandler contract — service implements the interface
// ---------------------------------------------------------------------------

it('AC-9: Given IDispatchHandler interface, when service is instantiated, then it satisfies the interface duck-type (has handle method)', () => {
  // Arrange — compile-time assertion via assignability
  const handler: IDispatchHandler = service;

  // Assert
  expect(typeof handler.handle).toBe('function');
});
