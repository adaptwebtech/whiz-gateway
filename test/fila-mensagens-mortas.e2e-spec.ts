/**
 * E2E tests — fila-mensagens-mortas
 *
 * AC-3: GET /dead-letter retorna 200 com array, todos del=false, default limit 50.
 * AC-4: GET /dead-letter?status=FALHA_ENVIO retorna apenas registros com status=FALHA_ENVIO.
 * AC-5: GET /dead-letter?dataInicio=X&dataFim=Y retorna apenas registros no intervalo.
 * AC-6: DELETE /dead-letter/:id → 200/204; GET /dead-letter não inclui mais o registro.
 *
 * Cobertura adicional:
 *   GET /dead-letter/:id existente → 200
 *   GET /dead-letter/:id inexistente → 404
 *   DELETE /dead-letter/:id inexistente → 404
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { execSync } from 'child_process';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../src/logger/logger.service';
import { RABBITMQ_SERVICE } from '../src/rabbitmq/constants/rabbitmq-tokens.constants';
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Seed helper: creates a fila_mensagens_mortas record directly in DB */
async function seedDeadLetter(
  prisma: PrismaService,
  overrides: Partial<{
    id_inbox: string | null;
    status: StatusFalhaMensagem;
    reenviado: boolean;
    del: boolean;
    data: Date;
    message: object;
  }> = {},
) {
  return prisma.fila_mensagens_mortas.create({
    data: {
      message: overrides.message ?? { body: 'test payload' },
      id_inbox: overrides.id_inbox !== undefined ? overrides.id_inbox : null,
      status: overrides.status ?? StatusFalhaMensagem.FALHA_ENVIO,
      reenviado: overrides.reenviado ?? false,
      del: overrides.del ?? false,
      ...(overrides.data ? { data: overrides.data } : {}),
    },
  });
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('Dead Letter (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RABBITMQ_SERVICE)
      .useValue(MOCK_RABBITMQ)
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
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // Clean FK-dependent tables first
    await prisma.fila_mensagens_mortas.deleteMany();
    await prisma.inboxes.deleteMany();
    await prisma.ambiente.deleteMany();
  });

  // ─── AC-3 ──────────────────────────────────────────────────────────────────

  it('AC-3: GET /dead-letter retorna 200 com array e todos os registros têm del=false', async () => {
    // Arrange — seed 3 records (del=false)
    await seedDeadLetter(prisma);
    await seedDeadLetter(prisma, {
      status: StatusFalhaMensagem.INBOX_NAO_REGISTRADA,
    });
    await seedDeadLetter(prisma, { status: StatusFalhaMensagem.NACK_RECEBIDO });

    // Act
    const res = await request(app.getHttpServer())
      .get('/dead-letter')
      .expect(200);

    // Assert
    const items = res.body as unknown as Array<Record<string, unknown>>;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeGreaterThanOrEqual(3);
    items.forEach((item) => {
      expect(item).toHaveProperty('del', false);
    });
  });

  it('AC-3: GET /dead-letter não retorna registros com del=true', async () => {
    // Arrange — seed one soft-deleted, one active
    await seedDeadLetter(prisma, { del: false });
    await seedDeadLetter(prisma, { del: true });

    // Act
    const res = await request(app.getHttpServer())
      .get('/dead-letter')
      .expect(200);

    // Assert — only active
    const items = res.body as unknown as Array<Record<string, unknown>>;
    items.forEach((item) => {
      expect(item).toHaveProperty('del', false);
    });
    expect(items).toHaveLength(1);
  });

  it('AC-3: GET /dead-letter respeita default limit de 50', async () => {
    // Arrange — seed 60 records
    const seeds = Array.from({ length: 60 }, () => seedDeadLetter(prisma));
    await Promise.all(seeds);

    // Act
    const res = await request(app.getHttpServer())
      .get('/dead-letter')
      .expect(200);

    // Assert — default limit is 50
    const items = res.body as unknown as Array<Record<string, unknown>>;
    expect(items.length).toBeLessThanOrEqual(50);
  });

  it('AC-3: DeadLetterResponseDto tem os 7 campos exatos', async () => {
    // Arrange
    await seedDeadLetter(prisma);

    // Act
    const res = await request(app.getHttpServer())
      .get('/dead-letter')
      .expect(200);

    // Assert
    const items = res.body as unknown as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThan(0);
    const item = items[0];
    expect(item).toHaveProperty('id');
    expect(typeof item['id']).toBe('string');
    expect(String(item['id'])).toMatch(UUID_REGEX);
    expect(item).toHaveProperty('message');
    expect(item).toHaveProperty('id_inbox');
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('reenviado');
    expect(item).toHaveProperty('del');
    expect(item).toHaveProperty('data');
  });

  // ─── AC-4 ──────────────────────────────────────────────────────────────────

  it('AC-4: GET /dead-letter?status=FALHA_ENVIO retorna apenas registros com status FALHA_ENVIO', async () => {
    // Arrange — seed mixed statuses
    await seedDeadLetter(prisma, { status: StatusFalhaMensagem.FALHA_ENVIO });
    await seedDeadLetter(prisma, { status: StatusFalhaMensagem.FALHA_ENVIO });
    await seedDeadLetter(prisma, {
      status: StatusFalhaMensagem.INBOX_NAO_REGISTRADA,
    });
    await seedDeadLetter(prisma, { status: StatusFalhaMensagem.NACK_RECEBIDO });

    // Act
    const res = await request(app.getHttpServer())
      .get('/dead-letter?status=FALHA_ENVIO')
      .expect(200);

    // Assert
    const items = res.body as unknown as Array<Record<string, unknown>>;
    expect(items.length).toBe(2);
    items.forEach((item) => {
      expect(item).toHaveProperty('status', 'FALHA_ENVIO');
    });
  });

  it('AC-4: GET /dead-letter?status=NACK_RECEBIDO retorna apenas status NACK_RECEBIDO', async () => {
    // Arrange
    await seedDeadLetter(prisma, { status: StatusFalhaMensagem.NACK_RECEBIDO });
    await seedDeadLetter(prisma, { status: StatusFalhaMensagem.FALHA_ENVIO });

    // Act
    const res = await request(app.getHttpServer())
      .get('/dead-letter?status=NACK_RECEBIDO')
      .expect(200);

    // Assert
    const items = res.body as unknown as Array<Record<string, unknown>>;
    items.forEach((item) => {
      expect(item).toHaveProperty('status', 'NACK_RECEBIDO');
    });
  });

  // ─── AC-5 ──────────────────────────────────────────────────────────────────

  it('AC-5: GET /dead-letter?dataInicio=X&dataFim=Y retorna apenas registros no intervalo de datas', async () => {
    // Arrange — seed records at various dates
    const now = new Date('2026-06-01T12:00:00.000Z');
    const old = new Date('2026-01-01T00:00:00.000Z');
    const recent = new Date('2026-05-30T00:00:00.000Z');
    const future = new Date('2026-12-01T00:00:00.000Z');

    await seedDeadLetter(prisma, { data: old });
    await seedDeadLetter(prisma, { data: recent });
    await seedDeadLetter(prisma, { data: now });
    await seedDeadLetter(prisma, { data: future });

    // Act — filter: May 2026 through June 2026
    const dataInicio = '2026-05-01T00:00:00.000Z';
    const dataFim = '2026-06-30T23:59:59.999Z';

    const res = await request(app.getHttpServer())
      .get(`/dead-letter?dataInicio=${dataInicio}&dataFim=${dataFim}`)
      .expect(200);

    // Assert — only recent + now within range
    const items = res.body as unknown as Array<Record<string, unknown>>;
    expect(items.length).toBe(2);
    items.forEach((item) => {
      const itemDate = new Date(item['data'] as string);
      expect(itemDate.getTime()).toBeGreaterThanOrEqual(
        new Date(dataInicio).getTime(),
      );
      expect(itemDate.getTime()).toBeLessThanOrEqual(
        new Date(dataFim).getTime(),
      );
    });
  });

  it('AC-5: GET /dead-letter?dataInicio=X sem dataFim retorna registros a partir de dataInicio', async () => {
    // Arrange
    const before = new Date('2026-01-01T00:00:00.000Z');
    const after = new Date('2026-06-01T00:00:00.000Z');

    await seedDeadLetter(prisma, { data: before });
    await seedDeadLetter(prisma, { data: after });

    // Act
    const dataInicio = '2026-03-01T00:00:00.000Z';
    const res = await request(app.getHttpServer())
      .get(`/dead-letter?dataInicio=${dataInicio}`)
      .expect(200);

    // Assert — only 'after' record
    const items = res.body as unknown as Array<Record<string, unknown>>;
    expect(items.length).toBe(1);
    const itemDate = new Date(items[0]['data'] as string);
    expect(itemDate.getTime()).toBeGreaterThanOrEqual(
      new Date(dataInicio).getTime(),
    );
  });

  // ─── AC-6 ──────────────────────────────────────────────────────────────────

  it('AC-6: DELETE /dead-letter/:id retorna 200 ou 204 e registro não aparece em GET /dead-letter', async () => {
    // Arrange — seed two records
    const keep = await seedDeadLetter(prisma, {
      status: StatusFalhaMensagem.FALHA_ENVIO,
    });
    const toDelete = await seedDeadLetter(prisma, {
      status: StatusFalhaMensagem.NACK_RECEBIDO,
    });

    // Act — delete
    const deleteRes = await request(app.getHttpServer()).delete(
      `/dead-letter/${toDelete.id}`,
    );
    expect([200, 204]).toContain(deleteRes.status);

    // Assert — GET /dead-letter does not include the deleted record
    const listRes = await request(app.getHttpServer())
      .get('/dead-letter')
      .expect(200);

    const items = listRes.body as unknown as Array<Record<string, unknown>>;
    const ids = items.map((i) => i['id']);
    expect(ids).toContain(keep.id);
    expect(ids).not.toContain(toDelete.id);
  });

  it('AC-6: DELETE /dead-letter/:id marca del=true no banco', async () => {
    // Arrange
    const record = await seedDeadLetter(prisma);

    // Act
    await request(app.getHttpServer())
      .delete(`/dead-letter/${record.id}`)
      .expect((res) => {
        expect([200, 204]).toContain(res.status);
      });

    // Assert — check DB directly
    const updated = await prisma.fila_mensagens_mortas.findUnique({
      where: { id: record.id },
    });
    expect(updated?.del).toBe(true);
  });

  it('AC-6: DELETE /dead-letter/:id inexistente retorna 404', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .delete('/dead-letter/non-existent-uuid')
      .expect(404);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 404);
  });

  // ─── GET /dead-letter/:id ───────────────────────────────────────────────────

  it('AC-3: GET /dead-letter/:id existente retorna 200 com DeadLetterResponseDto', async () => {
    // Arrange
    const record = await seedDeadLetter(prisma, {
      status: StatusFalhaMensagem.FALHA_ENVIO,
    });

    // Act
    const res = await request(app.getHttpServer())
      .get(`/dead-letter/${record.id}`)
      .expect(200);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('id', record.id);
    expect(body).toHaveProperty('status', 'FALHA_ENVIO');
    expect(body).toHaveProperty('del', false);
    expect(String(body['id'])).toMatch(UUID_REGEX);
  });

  it('AC-3: GET /dead-letter/:id inexistente retorna 404', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .get('/dead-letter/non-existent-uuid')
      .expect(404);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 404);
  });
});
