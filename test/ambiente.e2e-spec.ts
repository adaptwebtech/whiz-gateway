/**
 * E2E tests — cadastro-ambientes
 *
 * AC-1: GET /ambientes retorna 200 com array de 3 ambientes (del=false).
 * AC-2: GET /ambientes/2 retorna 200 com nome=staging e url correta.
 * AC-3: GET /ambientes/99 retorna 404.
 * AC-4: POST /ambientes com DTO válido retorna 201 AmbienteResponseDto.
 * AC-6: POST /ambientes com url inválida retorna 400.
 * AC-7: PATCH /ambientes/:id com novo nome retorna 200 com nome atualizado.
 * AC-8: DELETE /ambientes/:id realiza soft-delete (del=true) e ausente de GET.
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { AmbienteModule } from '../src/ambiente/ambiente.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../src/logger/logger.service';
import { RABBITMQ_SERVICE } from '../src/rabbitmq/constants/rabbitmq-tokens.constants';
import { execSync } from 'child_process';

const MOCK_RABBITMQ = {
  assertQueue: jest.fn(),
  deleteQueue: jest.fn(),
  startConsuming: jest.fn(),
  stopConsuming: jest.fn(),
  sendToQueue: jest.fn(),
  isConnected: jest.fn().mockReturnValue(true),
  defaultDlqArgs: {},
};

const SEED = [
  { id: 1, nome: 'development', url: 'https://dev.2.whiz.net.br', del: false },
  {
    id: 2,
    nome: 'staging',
    url: 'https://staging.2.whiz.net.br',
    del: false,
  },
  {
    id: 3,
    nome: 'production',
    url: 'https://server.whiz.net.br',
    del: false,
  },
];

describe('Ambientes (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule, AmbienteModule],
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
    // Limpar FKs antes de truncar ambiente
    await prisma.fila_mensagens_mortas.deleteMany();
    await prisma.inboxes.deleteMany();
    await prisma.ambiente.deleteMany();

    // Re-seed os 3 ambientes fixos
    await prisma.ambiente.createMany({ data: SEED });
  });

  // ─── AC-1 ──────────────────────────────────────────────────────────────────

  it('AC-1: GET /ambientes retorna 200 com array de 3 ambientes (del=false)', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .get('/ambientes')
      .expect(200);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(Array.isArray(body)).toBe(true);
    const items = body as unknown as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    items.forEach((item) => {
      expect(item).toHaveProperty('del', false);
    });
  });

  it('AC-1: GET /ambientes retorna apenas ambientes com del=false', async () => {
    // Arrange — soft-delete o ambiente id=3
    await prisma.ambiente.update({
      where: { id: 3 },
      data: { del: true },
    });

    // Act
    const res = await request(app.getHttpServer())
      .get('/ambientes')
      .expect(200);

    // Assert
    const items = res.body as unknown as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    items.forEach((item) => {
      expect(item).toHaveProperty('del', false);
    });
  });

  // ─── AC-2 ──────────────────────────────────────────────────────────────────

  it('AC-2: GET /ambientes/2 retorna 200 com nome=staging e url=https://staging.2.whiz.net.br', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .get('/ambientes/2')
      .expect(200);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('nome', 'staging');
    expect(body).toHaveProperty('url', 'https://staging.2.whiz.net.br');
    expect(body).toHaveProperty('id', 2);
    expect(body).toHaveProperty('del', false);
  });

  // ─── AC-3 ──────────────────────────────────────────────────────────────────

  it('AC-3: GET /ambientes/99 retorna 404', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .get('/ambientes/99')
      .expect(404);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 404);
  });

  // ─── AC-4 ──────────────────────────────────────────────────────────────────

  it('AC-4: POST /ambientes com DTO válido e id novo retorna 201 AmbienteResponseDto', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .post('/ambientes')
      .send({ id: 10, nome: 'homolog', url: 'https://homolog.whiz.net.br' })
      .expect(201);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('id', 10);
    expect(body).toHaveProperty('nome', 'homolog');
    expect(body).toHaveProperty('url', 'https://homolog.whiz.net.br');
    expect(body).toHaveProperty('del', false);
    expect(Object.keys(body).sort()).toEqual(
      ['del', 'id', 'nome', 'url'].sort(),
    );
  });

  it('AC-4: POST /ambientes com id existente retorna 409 ConflictException', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .post('/ambientes')
      .send({ id: 1, nome: 'duplicado', url: 'https://dev.2.whiz.net.br' })
      .expect(409);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 409);
  });

  // ─── AC-6 ──────────────────────────────────────────────────────────────────

  it('AC-6: POST /ambientes com url inválida retorna 400', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .post('/ambientes')
      .send({ id: 20, nome: 'teste', url: 'nao-e-uma-url-valida' })
      .expect(400);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 400);
  });

  it('AC-6: POST /ambientes sem campo obrigatório retorna 400', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .post('/ambientes')
      .send({ id: 20, nome: 'sem-url' })
      .expect(400);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 400);
  });

  // ─── AC-7 ──────────────────────────────────────────────────────────────────

  it('AC-7: PATCH /ambientes/:id com novo nome retorna 200 e nome atualizado', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .patch('/ambientes/1')
      .send({ nome: 'dev-updated' })
      .expect(200);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('id', 1);
    expect(body).toHaveProperty('nome', 'dev-updated');
    expect(body).toHaveProperty('del', false);
  });

  it('AC-7: PATCH /ambientes/:id com id inexistente retorna 404', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .patch('/ambientes/99')
      .send({ nome: 'ghost' })
      .expect(404);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 404);
  });

  // ─── AC-8 ──────────────────────────────────────────────────────────────────

  it('AC-8: DELETE /ambientes/:id realiza soft-delete e ambiente ausente de GET /ambientes', async () => {
    // Act — deletar
    await request(app.getHttpServer()).delete('/ambientes/3').expect(200);

    // Assert — ausente da listagem
    const listRes = await request(app.getHttpServer())
      .get('/ambientes')
      .expect(200);
    const items = listRes.body as unknown as Array<Record<string, unknown>>;
    const found = items.find((i) => i['id'] === 3);
    expect(found).toBeUndefined();

    // Assert — del=true no banco
    const record = await prisma.ambiente.findUnique({ where: { id: 3 } });
    expect(record?.del).toBe(true);
  });

  it('AC-8: DELETE /ambientes/:id com id inexistente retorna 404', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .delete('/ambientes/99')
      .expect(404);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 404);
  });
});
