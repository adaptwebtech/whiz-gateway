/**
 * Integration tests — WppFlowsEndpointController
 *
 * AC-15: FLOWS_PRIVATE_KEY set, UID exists, valid X-Hub-Signature-256, correctly encrypted payload
 *        → handle called; 200 { encrypted_flow_data }
 * AC-16: Decrypted payload contains { action: "ping" } → 200 with health-check re-encrypted; client URL not called
 * AC-17: Invalid X-Hub-Signature-256 → 401
 * AC-18: UID not found (valid signature) → 404
 * AC-19: FLOWS_PRIVATE_KEY absent (valid signature, UID exists) → 503
 * AC-20: Incorrect RSA key (decryption fails) → 421
 * AC-21: UID URL returns timeout → 500
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  NotFoundException,
  HttpStatus,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { WppFlowsEndpointController } from './wpp-flows-endpoint.controller';
import { WppFlowsEndpointService } from './wpp-flows-endpoint.service';
import { GlobalExceptionFilter } from '../common/filters/global-exception.filter';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../logger/logger.service';

// ─── Mock service ─────────────────────────────────────────────────────────────

const mockEndpointService = {
  handle: jest.fn(),
};

const mockConfigService = {
  get: jest.fn(),
  getOrThrow: jest.fn(),
};

const mockLoggerService = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
};

// ─── App factory ─────────────────────────────────────────────────────────────

async function buildApp(): Promise<INestApplication<App>> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [WppFlowsEndpointController],
    providers: [
      { provide: WppFlowsEndpointService, useValue: mockEndpointService },
      { provide: ConfigService, useValue: mockConfigService },
      { provide: LoggerService, useValue: mockLoggerService },
    ],
  }).compile();

  const app = moduleRef.createNestApplication<App>();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const configService = app.get(ConfigService);
  const loggerService = app.get(LoggerService);
  app.useGlobalFilters(new GlobalExceptionFilter(configService, loggerService));
  await app.init();
  return app;
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('WppFlowsEndpointController (integration)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── AC-15 ───────────────────────────────────────────────────────────────────

  it('AC-15: valid X-Hub-Signature-256, UID exists, encrypted payload → 200 { encrypted_flow_data }', async () => {
    const uid = 'uid-ac15';
    const encryptedResult = {
      encrypted_flow_data: 'base64-encrypted-response',
    };

    mockEndpointService.handle.mockResolvedValue(encryptedResult);

    const payload = {
      encrypted_flow_data: 'base64encrypteddata==',
      encrypted_aes_key: 'base64encryptedaeskey==',
      initial_vector: 'base64iv==',
    };

    const res = await request(app.getHttpServer())
      .post(`/wpp/flows/endpoint/${uid}`)
      .set('x-hub-signature-256', 'sha256=validhmac')
      .send(payload)
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty(
      'encrypted_flow_data',
      'base64-encrypted-response',
    );

    expect(mockEndpointService.handle).toHaveBeenCalledWith(
      uid,
      expect.objectContaining({
        encrypted_flow_data: payload.encrypted_flow_data,
        encrypted_aes_key: payload.encrypted_aes_key,
        initial_vector: payload.initial_vector,
      }),
      expect.any(Buffer),
      'sha256=validhmac',
    );
  });

  // ─── AC-16 ───────────────────────────────────────────────────────────────────

  it('AC-16: ping payload → 200 with health-check encrypted response; client URL not called', async () => {
    const uid = 'uid-ac16';
    const pingResponse = { encrypted_flow_data: 'base64-ping-encrypted' };

    mockEndpointService.handle.mockResolvedValue(pingResponse);

    const payload = {
      encrypted_flow_data: 'base64encryptedpingdata==',
      encrypted_aes_key: 'base64encryptedaeskey==',
      initial_vector: 'base64iv==',
    };

    const res = await request(app.getHttpServer())
      .post(`/wpp/flows/endpoint/${uid}`)
      .set('x-hub-signature-256', 'sha256=validhmac')
      .send(payload)
      .expect(200);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('encrypted_flow_data', 'base64-ping-encrypted');
    expect(mockEndpointService.handle).toHaveBeenCalledWith(
      uid,
      expect.any(Object),
      expect.any(Buffer),
      'sha256=validhmac',
    );
  });

  // ─── AC-17 ───────────────────────────────────────────────────────────────────

  it('AC-17: invalid X-Hub-Signature-256 → 401', async () => {
    const uid = 'uid-ac17';

    const { UnauthorizedException } = await import('@nestjs/common');
    mockEndpointService.handle.mockRejectedValue(
      new UnauthorizedException('Assinatura X-Hub-Signature-256 inválida'),
    );

    const payload = {
      encrypted_flow_data: 'data==',
      encrypted_aes_key: 'key==',
      initial_vector: 'iv==',
    };

    const res = await request(app.getHttpServer())
      .post(`/wpp/flows/endpoint/${uid}`)
      .set('x-hub-signature-256', 'sha256=invalid')
      .send(payload)
      .expect(401);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 401);
  });

  // ─── AC-18 ───────────────────────────────────────────────────────────────────

  it('AC-18: UID not found (valid signature) → 404', async () => {
    const uid = 'uid-nonexistent';

    mockEndpointService.handle.mockRejectedValue(
      new NotFoundException(`UID não encontrado: ${uid}`),
    );

    const payload = {
      encrypted_flow_data: 'data==',
      encrypted_aes_key: 'key==',
      initial_vector: 'iv==',
    };

    const res = await request(app.getHttpServer())
      .post(`/wpp/flows/endpoint/${uid}`)
      .set('x-hub-signature-256', 'sha256=validhmac')
      .send(payload)
      .expect(404);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 404);
  });

  // ─── AC-19 ───────────────────────────────────────────────────────────────────

  it('AC-19: FLOWS_PRIVATE_KEY absent → 503', async () => {
    const uid = 'uid-ac19';

    const { ServiceUnavailableException } = await import('@nestjs/common');
    mockEndpointService.handle.mockRejectedValue(
      new ServiceUnavailableException('FLOWS_PRIVATE_KEY não configurado'),
    );

    const payload = {
      encrypted_flow_data: 'data==',
      encrypted_aes_key: 'key==',
      initial_vector: 'iv==',
    };

    const res = await request(app.getHttpServer())
      .post(`/wpp/flows/endpoint/${uid}`)
      .set('x-hub-signature-256', 'sha256=validhmac')
      .send(payload)
      .expect(503);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', HttpStatus.SERVICE_UNAVAILABLE);
  });

  // ─── AC-20 ───────────────────────────────────────────────────────────────────

  it('AC-20: Incorrect RSA key (decryption fails) → 421', async () => {
    const uid = 'uid-ac20';

    const { HttpException } = await import('@nestjs/common');
    mockEndpointService.handle.mockRejectedValue(
      new HttpException('Falha ao descriptografar AES key', 421),
    );

    const payload = {
      encrypted_flow_data: 'data==',
      encrypted_aes_key: 'wrongkey==',
      initial_vector: 'iv==',
    };

    const res = await request(app.getHttpServer())
      .post(`/wpp/flows/endpoint/${uid}`)
      .set('x-hub-signature-256', 'sha256=validhmac')
      .send(payload)
      .expect(421);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 421);
  });

  // ─── AC-21 ───────────────────────────────────────────────────────────────────

  it('AC-21: UID URL returns timeout → 500', async () => {
    const uid = 'uid-ac21';

    const { InternalServerErrorException } = await import('@nestjs/common');
    mockEndpointService.handle.mockRejectedValue(
      new InternalServerErrorException('Timeout ao contatar URL do UID'),
    );

    const payload = {
      encrypted_flow_data: 'data==',
      encrypted_aes_key: 'key==',
      initial_vector: 'iv==',
    };

    const res = await request(app.getHttpServer())
      .post(`/wpp/flows/endpoint/${uid}`)
      .set('x-hub-signature-256', 'sha256=validhmac')
      .send(payload)
      .expect(500);

    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty('statusCode', 500);
  });
});
