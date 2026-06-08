/**
 * Integration tests — ResendController (reenvio-mensagens)
 *
 * AC-1: No criteria in body → POST /messages/resend → 400
 * AC-6: dataInicio > dataFim → 400
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { ResendController } from './resend.controller';
import { ResendService } from './resend.service';

// ─── Mock ResendService ───────────────────────────────────────────────────────

const mockResendService = {
  resend: jest.fn(),
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ResendController — integration', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [ResendController],
      providers: [
        {
          provide: ResendService,
          useValue: mockResendService,
        },
      ],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication<App>();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
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
    expect(mockResendService.resend).not.toHaveBeenCalled();
  });

  it('AC-1: POST /messages/resend sem body retorna 400', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .post('/messages/resend')
      .expect(400);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 400);
  });

  it('AC-1: POST /messages/resend com apenas forcarReenviadas (sem pid nem datas) retorna 400', async () => {
    // Act
    const res = await request(app.getHttpServer())
      .post('/messages/resend')
      .send({ forcarReenviadas: true })
      .expect(400);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 400);
  });

  // ─── AC-6 ──────────────────────────────────────────────────────────────────

  it('AC-6: POST /messages/resend com dataInicio > dataFim retorna 400', async () => {
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
    expect(mockResendService.resend).not.toHaveBeenCalled();
  });

  it('AC-6: POST /messages/resend com dataInicio=dataFim (igual) é aceito', async () => {
    // Arrange
    mockResendService.resend.mockResolvedValueOnce({
      total: 0,
      reenviadas: 0,
      falhas: 0,
    });

    // Act — mesma data deve passar na validação (não é inválido)
    const isoDate = '2026-06-01T00:00:00.000Z';
    await request(app.getHttpServer())
      .post('/messages/resend')
      .send({ dataInicio: isoDate, dataFim: isoDate })
      .expect(200);
  });

  it('AC-6: POST /messages/resend com dataInicio e sem dataFim retorna 400 (critério incompleto)', async () => {
    // Act — dataInicio sem dataFim e sem pid não é critério válido
    const res = await request(app.getHttpServer())
      .post('/messages/resend')
      .send({ dataInicio: '2026-06-01T00:00:00.000Z' })
      .expect(400);

    // Assert
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 400);
  });
});
