/**
 * E2E tests — cadastro-inboxes
 *
 * AC-1: POST /inboxes com CreateInboxDto válido retorna 201 InboxResponseDto com id (uuid) e del=false.
 * AC-5: DELETE /inboxes/:id realiza soft-delete (del=true), stopConsuming e deleteQueue chamados.
 * AC-6: Inbox deletada não aparece em GET /inboxes.
 * AC-8: PATCH /inboxes/:id atualiza nome (200), pid permanece inalterado.
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

const MOCK_RABBITMQ = {
  assertQueue: jest.fn().mockResolvedValue(undefined),
  deleteQueue: jest.fn().mockResolvedValue(undefined),
  startConsuming: jest.fn().mockResolvedValue(undefined),
  stopConsuming: jest.fn().mockResolvedValue(undefined),
  sendToQueue: jest.fn().mockResolvedValue(undefined),
  isConnected: jest.fn().mockReturnValue(true),
  defaultDlqArgs: {},
};

const AMBIENTE_SEED = [
  { id: 1, nome: 'development', url: 'https://dev.2.whiz.net.br', del: false },
  { id: 2, nome: 'staging', url: 'https://staging.2.whiz.net.br', del: false },
  { id: 3, nome: 'production', url: 'https://server.whiz.net.br', del: false },
];

// UUID v4 regex
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('Inboxes (e2e)', () => {
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

    // Limpar em ordem FK
    await prisma.fila_mensagens_mortas.deleteMany();
    await prisma.inboxes.deleteMany();
    await prisma.ambiente.deleteMany();

    // Re-seed ambientes
    await prisma.ambiente.createMany({ data: AMBIENTE_SEED });
  });

  // ─── AC-1 ──────────────────────────────────────────────────────────────────

  it('AC-1: POST /inboxes com DTO válido retorna 201 com id (uuid) e del=false', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .post('/inboxes')
      .send({ id_ambiente: 1, pid: 'whatsapp-dev-001', nome: 'WhatsApp Dev' })
      .expect(201);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('id');
    expect(typeof body['id']).toBe('string');
    expect(String(body['id'])).toMatch(UUID_REGEX);
    expect(body).toHaveProperty('del', false);
    expect(body).toHaveProperty('id_ambiente', 1);
    expect(body).toHaveProperty('pid', 'whatsapp-dev-001');
    expect(body).toHaveProperty('nome', 'WhatsApp Dev');
    expect(body).toHaveProperty('data');
  });

  it('AC-1: POST /inboxes retorna InboxResponseDto com os 6 campos exatos', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .post('/inboxes')
      .send({
        id_ambiente: 2,
        pid: 'wpp-staging-001',
        nome: 'WhatsApp Staging',
      })
      .expect(201);

    // Assert — apenas campos do InboxResponseDto
    const body = res.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ['data', 'del', 'id', 'id_ambiente', 'nome', 'pid'].sort(),
    );
  });

  it('AC-1: POST /inboxes sem campo obrigatório retorna 400', async () => {
    // Act — sem pid
    const res = await request(app.getHttpServer())
      .post('/inboxes')
      .send({ id_ambiente: 1, nome: 'Sem PID' })
      .expect(400);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 400);
  });

  it('AC-1: POST /inboxes com campo extra é rejeitado (forbidNonWhitelisted)', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .post('/inboxes')
      .send({ id_ambiente: 1, pid: 'test', nome: 'Test', extra_field: true })
      .expect(400);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 400);
  });

  // ─── AC-5 ──────────────────────────────────────────────────────────────────

  it('AC-5: DELETE /inboxes/:id realiza soft-delete (del=true)', async () => {
    // Arrange — criar inbox
    const createRes = await request(app.getHttpServer())
      .post('/inboxes')
      .send({ id_ambiente: 1, pid: 'wpp-to-delete', nome: 'Para Deletar' })
      .expect(201);
    const created = createRes.body as Record<string, unknown>;
    const inboxId = String(created['id']);

    jest.clearAllMocks();

    // Act
    const deleteRes = await request(app.getHttpServer())
      .delete(`/inboxes/${inboxId}`)
      .expect(200);

    // Assert — del=true na resposta
    const body = deleteRes.body as Record<string, unknown>;
    expect(body).toHaveProperty('del', true);

    // Assert — del=true no banco
    const record = await prisma.inboxes.findUnique({ where: { id: inboxId } });
    expect(record?.del).toBe(true);
  });

  it('AC-5: DELETE /inboxes/:id chama stopConsuming e deleteQueue', async () => {
    // Arrange — criar inbox
    const createRes = await request(app.getHttpServer())
      .post('/inboxes')
      .send({ id_ambiente: 1, pid: 'wpp-stop-delete', nome: 'Stop & Delete' })
      .expect(201);
    const created = createRes.body as Record<string, unknown>;
    const inboxId = String(created['id']);

    jest.clearAllMocks();

    // Act
    await request(app.getHttpServer())
      .delete(`/inboxes/${inboxId}`)
      .expect(200);

    // Assert — stopConsuming e deleteQueue chamados com o nome correto
    expect(MOCK_RABBITMQ.stopConsuming).toHaveBeenCalledWith(
      `inbox.${inboxId}`,
    );
    expect(MOCK_RABBITMQ.deleteQueue).toHaveBeenCalledWith(`inbox.${inboxId}`);
  });

  it('AC-5: DELETE /inboxes/:id com id inexistente retorna 404', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .delete('/inboxes/non-existent-id')
      .expect(404);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 404);
  });

  // ─── AC-6 ──────────────────────────────────────────────────────────────────

  it('AC-6: inbox deletada não aparece em GET /inboxes', async () => {
    // Arrange — criar duas inboxes
    const create1 = await request(app.getHttpServer())
      .post('/inboxes')
      .send({ id_ambiente: 1, pid: 'pid-keep', nome: 'Manter' })
      .expect(201);
    const create2 = await request(app.getHttpServer())
      .post('/inboxes')
      .send({ id_ambiente: 2, pid: 'pid-remove', nome: 'Remover' })
      .expect(201);

    const keepId = String((create1.body as Record<string, unknown>)['id']);
    const removeId = String((create2.body as Record<string, unknown>)['id']);

    // Act — deletar segunda inbox
    await request(app.getHttpServer())
      .delete(`/inboxes/${removeId}`)
      .expect(200);

    // Act — listar
    const listRes = await request(app.getHttpServer())
      .get('/inboxes')
      .expect(200);

    // Assert — apenas a inbox não deletada aparece
    const items = listRes.body as unknown as Array<Record<string, unknown>>;
    const ids = items.map((i) => i['id']);
    expect(ids).toContain(keepId);
    expect(ids).not.toContain(removeId);
    items.forEach((item) => {
      expect(item).toHaveProperty('del', false);
    });
  });

  it('AC-6: GET /inboxes retorna apenas inboxes com del=false', async () => {
    // Arrange — criar inbox e deletar via banco direto
    await prisma.inboxes.create({
      data: {
        id_ambiente: 1,
        pid: 'pid-direct-del',
        nome: 'Deletada Direto',
        del: true,
      },
    });
    await prisma.inboxes.create({
      data: {
        id_ambiente: 1,
        pid: 'pid-active',
        nome: 'Ativa',
        del: false,
      },
    });

    // Act
    const res = await request(app.getHttpServer()).get('/inboxes').expect(200);

    // Assert — apenas ativas
    const items = res.body as unknown as Array<Record<string, unknown>>;
    items.forEach((item) => {
      expect(item).toHaveProperty('del', false);
    });
    const pids = items.map((i) => i['pid']);
    expect(pids).toContain('pid-active');
    expect(pids).not.toContain('pid-direct-del');
  });

  // ─── AC-8 ──────────────────────────────────────────────────────────────────

  it('AC-8: PATCH /inboxes/:id atualiza nome e retorna 200 com nome atualizado', async () => {
    // Arrange — criar inbox
    const createRes = await request(app.getHttpServer())
      .post('/inboxes')
      .send({ id_ambiente: 1, pid: 'wpp-patch-test', nome: 'Nome Original' })
      .expect(201);
    const created = createRes.body as Record<string, unknown>;
    const inboxId = String(created['id']);

    // Act
    const patchRes = await request(app.getHttpServer())
      .patch(`/inboxes/${inboxId}`)
      .send({ nome: 'Nome Atualizado' })
      .expect(200);

    // Assert
    const body = patchRes.body as Record<string, unknown>;
    expect(body).toHaveProperty('id', inboxId);
    expect(body).toHaveProperty('nome', 'Nome Atualizado');
    expect(body).toHaveProperty('del', false);
  });

  it('AC-8: PATCH /inboxes/:id não permite alterar pid', async () => {
    // Arrange — criar inbox
    const createRes = await request(app.getHttpServer())
      .post('/inboxes')
      .send({ id_ambiente: 1, pid: 'pid-original', nome: 'Test Patch PID' })
      .expect(201);
    const created = createRes.body as Record<string, unknown>;
    const inboxId = String(created['id']);
    const originalPid = String(created['pid']);

    // Act — tentar patch com pid (deve ser ignorado ou rejeitado via ValidationPipe)
    // forbidNonWhitelisted: se pid não está em UpdateInboxDto, retorna 400
    const patchRes = await request(app.getHttpServer())
      .patch(`/inboxes/${inboxId}`)
      .send({ nome: 'Novo Nome', pid: 'pid-alterado' });

    // Se pid não está em UpdateInboxDto → 400 (forbidNonWhitelisted)
    // Se está mas service ignora → 200 com pid original
    if (patchRes.status === 200) {
      const body = patchRes.body as Record<string, unknown>;
      expect(body).toHaveProperty('pid', originalPid);
    } else {
      expect(patchRes.status).toBe(400);
    }
  });

  it('AC-8: PATCH /inboxes/:id com id inexistente retorna 404', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .patch('/inboxes/non-existent-id')
      .send({ nome: 'Ghost' })
      .expect(404);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 404);
  });
});
