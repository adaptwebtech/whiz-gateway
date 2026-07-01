/**
 * Unit tests — InstagramWebhookForwarderService (instagram-webhook-redirect)
 *
 * AC-6: inbox válido cujo ambiente está del → DLQ AMBIENTE_INDISPONIVEL, sem HTTP
 * AC-7: forward faz POST {url}/webhooks/instagram com rawBody byte-idêntico
 *       (mesmo Buffer) e mesmo header x-hub-signature-256
 * AC-8: forward para instagram-login → POST {url}/webhooks/instagram-login
 * AC-9: servidor 5xx em todas as tentativas → após DISPATCH_MAX_RETRIES → DLQ FALHA_ENVIO
 */

import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { StatusFalhaMensagem } from '@prisma/client';
import { AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { AmbienteResponseDto } from '../ambiente/dto/ambiente-response.dto';
import { InboxResponseDto } from '../inbox/dto/inbox-response.dto';
import type { IRabbitMQService } from '../rabbitmq/interfaces/rabbitmq-service.interface';
import { DLQ_NAME } from '../rabbitmq/constants/rabbitmq-queue.constants';
import { RedisService } from '../redis/redis.service';
import { InstagramWebhookForwarderService } from './instagram-webhook-forwarder.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeInbox(
  overrides: Partial<InboxResponseDto> = {},
): InboxResponseDto {
  const dto = new InboxResponseDto();
  dto.id = 'inbox-uuid-1';
  dto.id_ambiente = 1;
  dto.pid = 'ig-business-account-123';
  dto.nome = 'Instagram Inbox';
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

// ─── Mocks ────────────────────────────────────────────────────────────────────

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
let service: InstagramWebhookForwarderService;

const RAW_BODY = Buffer.from(
  JSON.stringify({
    object: 'instagram',
    entry: [{ id: 'ig-business-account-123' }],
  }),
);
const SIGNATURE = 'sha256=deadbeefcafebabe';

beforeEach(() => {
  ambienteRepo = {
    findById: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    softDelete: jest.fn(),
  };
  httpService = { post: jest.fn() };
  mq = {
    assertQueue: jest.fn().mockResolvedValue(undefined),
    deleteQueue: jest.fn().mockResolvedValue(undefined),
    startConsuming: jest.fn().mockResolvedValue(undefined),
    stopConsuming: jest.fn().mockResolvedValue(undefined),
    sendToQueue: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue(undefined),
  };
  configService = {
    get: jest.fn((key: string) => {
      if (key === 'DISPATCH_MAX_RETRIES') return '3';
      if (key === 'DISPATCH_BACKOFF_BASE_MS') return '10';
      return undefined;
    }),
  };
  redis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  };

  service = new InstagramWebhookForwarderService(
    ambienteRepo as never,
    httpService as never,
    mq as never,
    configService as never,
    redis as unknown as RedisService,
  );
});

afterEach(() => {
  jest.resetAllMocks();
});

// ─── AC-6 ──────────────────────────────────────────────────────────────────────

it('AC-6: dado ambiente com del=true, então publica DLQ AMBIENTE_INDISPONIVEL sem chamar HTTP', async () => {
  // Arrange
  const inbox = makeInbox();
  ambienteRepo.findById.mockResolvedValue(makeAmbiente({ del: true }));

  // Act
  await service.forward('/webhooks/instagram', inbox, RAW_BODY, SIGNATURE);

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

it('AC-6: dado ambiente inexistente (null), então publica DLQ AMBIENTE_INDISPONIVEL sem chamar HTTP', async () => {
  // Arrange
  const inbox = makeInbox();
  ambienteRepo.findById.mockResolvedValue(null);

  // Act
  await service.forward('/webhooks/instagram', inbox, RAW_BODY, SIGNATURE);

  // Assert
  expect(httpService.post).not.toHaveBeenCalled();
  expect(mq.sendToQueue).toHaveBeenCalledWith(
    DLQ_NAME,
    expect.objectContaining({
      status: StatusFalhaMensagem.AMBIENTE_INDISPONIVEL,
    }),
  );
});

// ─── AC-7 ──────────────────────────────────────────────────────────────────────

it('AC-7: forward faz POST {url}/webhooks/instagram com o MESMO Buffer rawBody e mesmo header x-hub-signature-256', async () => {
  // Arrange
  const inbox = makeInbox();
  const ambiente = makeAmbiente();
  ambienteRepo.findById.mockResolvedValue(ambiente);
  httpService.post.mockReturnValue(of(makeAxiosResponse(200)));

  // Act
  await service.forward('/webhooks/instagram', inbox, RAW_BODY, SIGNATURE);

  // Assert — destino, corpo cru (mesma instância de Buffer) e header idênticos
  expect(httpService.post).toHaveBeenCalledTimes(1);
  const [url, sentBody, options] = httpService.post.mock.calls[0] as [
    string,
    Buffer,
    { headers: Record<string, string> },
  ];
  expect(url).toBe(`${ambiente.url}/webhooks/instagram`);
  expect(sentBody).toBe(RAW_BODY); // mesma instância — nunca reserializado
  expect(Buffer.isBuffer(sentBody)).toBe(true);
  expect(sentBody.equals(RAW_BODY)).toBe(true); // byte-idêntico
  expect(options.headers['x-hub-signature-256']).toBe(SIGNATURE);
  expect(options.headers['Content-Type']).toBe('application/json');
  expect(mq.sendToQueue).not.toHaveBeenCalled();
});

// ─── AC-8 ──────────────────────────────────────────────────────────────────────

it('AC-8: forward para instagram-login faz POST {url}/webhooks/instagram-login com rawBody e signature idênticos', async () => {
  // Arrange
  const inbox = makeInbox();
  const ambiente = makeAmbiente();
  ambienteRepo.findById.mockResolvedValue(ambiente);
  httpService.post.mockReturnValue(of(makeAxiosResponse(200)));

  // Act
  await service.forward(
    '/webhooks/instagram-login',
    inbox,
    RAW_BODY,
    SIGNATURE,
  );

  // Assert
  const [url, sentBody, options] = httpService.post.mock.calls[0] as [
    string,
    Buffer,
    { headers: Record<string, string> },
  ];
  expect(url).toBe(`${ambiente.url}/webhooks/instagram-login`);
  expect(sentBody).toBe(RAW_BODY);
  expect(options.headers['x-hub-signature-256']).toBe(SIGNATURE);
});

// ─── AC-9 ──────────────────────────────────────────────────────────────────────

it('AC-9: dado servidor 5xx em todas as tentativas, então após DISPATCH_MAX_RETRIES publica DLQ FALHA_ENVIO', async () => {
  // Arrange
  jest.useFakeTimers();
  const inbox = makeInbox();
  const ambiente = makeAmbiente();
  const maxRetries = 3;

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
  const p = service.forward('/webhooks/instagram', inbox, RAW_BODY, SIGNATURE);
  await jest.runAllTimersAsync();
  await p;

  // Assert
  expect(httpService.post).toHaveBeenCalledTimes(maxRetries);
  expect(mq.sendToQueue).toHaveBeenCalledWith(
    DLQ_NAME,
    expect.objectContaining({
      status: StatusFalhaMensagem.FALHA_ENVIO,
      id_inbox: inbox.id,
    }),
  );

  jest.useRealTimers();
});
