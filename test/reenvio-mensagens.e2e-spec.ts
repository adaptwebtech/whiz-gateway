/**
 * E2E tests — reenvio-mensagens
 *
 * AC-1: No criteria in body → POST /messages/resend → 400
 * AC-2: pid with reenviado=false dead messages → re-dispatches each, responds ResendResultDto with reenviadas > 0
 * AC-5: Date range filter → only messages with data in range re-dispatched
 * AC-6: dataInicio > dataFim → 400
 * AC-10: Empty selection → 200 with total=0, reenviadas=0, falhas=0
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../src/logger/logger.service';
import { RABBITMQ_SERVICE } from '../src/rabbitmq/constants/rabbitmq-tokens.constants';
import { DEAD_LETTER_REPOSITORY } from '../src/dead-letter/constants/dead-letter-tokens.constants';
import { DISPATCH_HANDLER } from '../src/dispatch/constants/dispatch-tokens.constants';
import { INBOX_REPOSITORY } from '../src/inbox/constants/inbox-tokens.constants';
import type { IDeadLetterRepository } from '../src/dead-letter/interfaces/dead-letter-repository.interface';
import type { IDispatchHandler } from '../src/dispatch/interfaces/dispatch-handler.interface';
import type { IInboxRepository } from '../src/inbox/interfaces/inbox-repository.interface';
import { DeadLetterResponseDto } from '../src/dead-letter/dto/dead-letter-response.dto';
import { InboxResponseDto } from '../src/inbox/dto/inbox-response.dto';
import { StatusFalhaMensagem } from '@prisma/client';

// ─── Mock RabbitMQ ────────────────────────────────────────────────────────────

const MOCK_RABBITMQ = {
  assertQueue: jest.fn().mockResolvedValue(undefined),
  deleteQueue: jest.fn().mockResolvedValue(undefined),
  startConsuming: jest.fn().mockResolvedValue(undefined),
  stopConsuming: jest.fn().mockResolvedValue(undefined),
  sendToQueue: jest.fn().mockResolvedValue(undefined),
  isConnected: jest.fn().mockReturnValue(true),
  defaultDlqArgs: {},
};

// ─── Mock repositories/handlers ───────────────────────────────────────────────

const mockDeadLetterRepo: jest.Mocked<IDeadLetterRepository> = {
  create: jest.fn(),
  findMany: jest.fn(),
  findById: jest.fn(),
  softDelete: jest.fn(),
  markReenviado: jest.fn(),
  hardDeleteOlderThan: jest.fn(),
};

const mockDispatchHandler: jest.Mocked<IDispatchHandler> = {
  handle: jest.fn(),
};

const mockInboxRepo: jest.Mocked<IInboxRepository> = {
  findAll: jest.fn(),
  findById: jest.fn(),
  findByPid: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
};

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const INBOX_ID = 'e2e-inbox-uuid-0001';
const PID = 'e2e-whatsapp-pid-001';

const INBOX_FIXTURE: InboxResponseDto = {
  id: INBOX_ID,
  id_ambiente: 1,
  pid: PID,
  nome: 'WhatsApp E2E',
  del: false,
  data: new Date('2026-05-01T00:00:00.000Z').toISOString(),
};

function makeDlRecord(
  id: string,
  reenviado: boolean,
  data: string = '2026-06-01T12:00:00.000Z',
  id_inbox: string | null = INBOX_ID,
): DeadLetterResponseDto {
  return {
    id,
    message: { body: `payload-${id}` },
    id_inbox,
    status: StatusFalhaMensagem.FALHA_ENVIO,
    reenviado,
    del: false,
    data,
  };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Reenvio Mensagens (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RABBITMQ_SERVICE)
      .useValue(MOCK_RABBITMQ)
      .overrideProvider(DEAD_LETTER_REPOSITORY)
      .useValue(mockDeadLetterRepo)
      .overrideProvider(DISPATCH_HANDLER)
      .useValue(mockDispatchHandler)
      .overrideProvider(INBOX_REPOSITORY)
      .useValue(mockInboxRepo)
      .compile();

    app = moduleRef.createNestApplication<App>();

    const configService = app.get(ConfigService);
    const loggerService = app.get(LoggerService);

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(
      new GlobalExceptionFilter(configService, loggerService),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: markReenviado resolves ok
    mockDeadLetterRepo.markReenviado.mockResolvedValue(undefined);
  });

  // ─── AC-1 ──────────────────────────────────────────────────────────────────

  it('AC-1: POST /messages/resend com body vazio retorna 400', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .post('/messages/resend')
      .send({})
      .expect(400);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 400);
  });

  it('AC-1: POST /messages/resend sem critério (apenas forcarReenviadas) retorna 400', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .post('/messages/resend')
      .send({ forcarReenviadas: false })
      .expect(400);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 400);
  });

  // ─── AC-2 ──────────────────────────────────────────────────────────────────

  it('AC-2: pid com mensagens reenviado=false → redespacha e retorna ResendResultDto com reenviadas > 0', async () => {
    // Arrange
    const msg1 = makeDlRecord('dl-e2e-001', false);
    const msg2 = makeDlRecord('dl-e2e-002', false);
    mockInboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);
    mockDeadLetterRepo.findMany.mockResolvedValueOnce([msg1, msg2]);
    mockDispatchHandler.handle.mockResolvedValue(undefined);

    // Act
    const res = await request(app.getHttpServer())
      .post('/messages/resend')
      .send({ pid: PID })
      .expect(200);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('total', 2);
    expect(body).toHaveProperty('reenviadas', 2);
    expect(body).toHaveProperty('falhas', 0);
    expect(typeof body['reenviadas']).toBe('number');
    expect((body['reenviadas'] as number)).toBeGreaterThan(0);
  });

  it('AC-2: ResendResultDto contém exatamente os campos total, reenviadas, falhas', async () => {
    // Arrange
    const msg = makeDlRecord('dl-e2e-003', false);
    mockInboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);
    mockDeadLetterRepo.findMany.mockResolvedValueOnce([msg]);
    mockDispatchHandler.handle.mockResolvedValueOnce(undefined);

    // Act
    const res = await request(app.getHttpServer())
      .post('/messages/resend')
      .send({ pid: PID })
      .expect(200);

    // Assert — shape exato
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ['falhas', 'reenviadas', 'total'].sort(),
    );
  });

  it('AC-2: dispatch chamado com inboxId correto para cada mensagem morta', async () => {
    // Arrange
    const msg = makeDlRecord('dl-e2e-004', false);
    mockInboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);
    mockDeadLetterRepo.findMany.mockResolvedValueOnce([msg]);
    mockDispatchHandler.handle.mockResolvedValueOnce(undefined);

    // Act
    await request(app.getHttpServer())
      .post('/messages/resend')
      .send({ pid: PID })
      .expect(200);

    // Assert
    expect(mockDispatchHandler.handle).toHaveBeenCalledWith(
      INBOX_ID,
      msg.message,
    );
  });

  // ─── AC-5 ──────────────────────────────────────────────────────────────────

  it('AC-5: filtro por data → apenas mensagens dentro do range são redespachadas', async () => {
    // Arrange — apenas mensagens dentro do range devem ser retornadas pelo repo
    const msgInRange = makeDlRecord(
      'dl-in-range-001',
      false,
      '2026-06-15T12:00:00.000Z',
    );
    // A query ao repo deve retornar apenas o que está no range (mockado corretamente)
    mockDeadLetterRepo.findMany.mockResolvedValueOnce([msgInRange]);
    mockDispatchHandler.handle.mockResolvedValueOnce(undefined);

    // Act
    const res = await request(app.getHttpServer())
      .post('/messages/resend')
      .send({
        dataInicio: '2026-06-01T00:00:00.000Z',
        dataFim: '2026-06-30T23:59:59.999Z',
      })
      .expect(200);

    // Assert — findMany chamado com os filtros de data
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('reenviadas', 1);
    expect(mockDeadLetterRepo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        dataInicio: '2026-06-01T00:00:00.000Z',
        dataFim: '2026-06-30T23:59:59.999Z',
      }),
    );
  });

  it('AC-5: mensagens fora do range NÃO são redespachadas', async () => {
    // Arrange — repo retorna lista vazia (simulando nenhuma no range)
    mockDeadLetterRepo.findMany.mockResolvedValueOnce([]);

    // Act
    const res = await request(app.getHttpServer())
      .post('/messages/resend')
      .send({
        dataInicio: '2026-01-01T00:00:00.000Z',
        dataFim: '2026-01-31T23:59:59.999Z',
      })
      .expect(200);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('total', 0);
    expect(mockDispatchHandler.handle).not.toHaveBeenCalled();
  });

  // ─── AC-6 ──────────────────────────────────────────────────────────────────

  it('AC-6: dataInicio > dataFim retorna 400', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .post('/messages/resend')
      .send({
        dataInicio: '2026-06-30T00:00:00.000Z',
        dataFim: '2026-06-01T00:00:00.000Z',
      })
      .expect(400);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 400);
    expect(mockDispatchHandler.handle).not.toHaveBeenCalled();
  });

  it('AC-6: dataInicio com formato inválido retorna 400', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .post('/messages/resend')
      .send({
        dataInicio: 'not-a-date',
        dataFim: '2026-06-30T00:00:00.000Z',
      })
      .expect(400);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 400);
  });

  // ─── AC-10 ─────────────────────────────────────────────────────────────────

  it('AC-10: seleção vazia → 200 com total=0, reenviadas=0, falhas=0', async () => {
    // Arrange — inbox existe mas não há mensagens mortas
    mockInboxRepo.findByPid.mockResolvedValueOnce(INBOX_FIXTURE);
    mockDeadLetterRepo.findMany.mockResolvedValueOnce([]);

    // Act
    const res = await request(app.getHttpServer())
      .post('/messages/resend')
      .send({ pid: PID })
      .expect(200);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('total', 0);
    expect(body).toHaveProperty('reenviadas', 0);
    expect(body).toHaveProperty('falhas', 0);
  });

  it('AC-10: pid sem inbox encontrada → 200 com total=0 (não 404)', async () => {
    // Arrange — pid não associado a nenhuma inbox
    mockInboxRepo.findByPid.mockResolvedValueOnce(null);

    // Act
    const res = await request(app.getHttpServer())
      .post('/messages/resend')
      .send({ pid: 'pid-inexistente-999' })
      .expect(200);

    // Assert — retorna zeros, não 404
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('total', 0);
    expect(body).toHaveProperty('reenviadas', 0);
    expect(body).toHaveProperty('falhas', 0);
    expect(mockDispatchHandler.handle).not.toHaveBeenCalled();
  });

  it('AC-10: seleção vazia com filtro de data → 200 com zeros', async () => {
    // Arrange
    mockDeadLetterRepo.findMany.mockResolvedValueOnce([]);

    // Act
    const res = await request(app.getHttpServer())
      .post('/messages/resend')
      .send({
        dataInicio: '2026-01-01T00:00:00.000Z',
        dataFim: '2026-01-31T23:59:59.999Z',
      })
      .expect(200);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('total', 0);
    expect(body).toHaveProperty('reenviadas', 0);
    expect(body).toHaveProperty('falhas', 0);
  });
});
