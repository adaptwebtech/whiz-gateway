/**
 * Integration tests — WppController (wpp-adapter-core)
 *
 * AC-1: Sem X-API-KEY → 401 e nenhuma chamada à Meta
 * AC-2: X-API-KEY inválida → 401
 */

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import request from 'supertest';
import { App } from 'supertest/types';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { ConfigService } from '@nestjs/config';
import { WppModule } from './wpp.module';
import { WppService } from './wpp.service';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockWppService = {
  forward: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string) => {
    if (key === 'META_GRAPH_URL') return 'https://graph.facebook.com/v20.0';
    if (key === 'META_ACCESS_TOKEN') return 'test-meta-token';
    return undefined;
  }),
};

const mockHttpService = {
  request: jest.fn(),
};

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('WppController — integration', () => {
  let app: INestApplication<App>;

  // ─── AC-1 & AC-2: Guard rejeita ────────────────────────────────────────────

  describe('ApiKeyGuard rejeita (AC-1, AC-2)', () => {
    beforeEach(async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [WppModule],
      })
        .overrideProvider(WppService)
        .useValue(mockWppService)
        .overrideProvider(ConfigService)
        .useValue(mockConfigService)
        .overrideProvider(HttpService)
        .useValue(mockHttpService)
        .overrideGuard(ApiKeyGuard)
        .useValue({ canActivate: () => false })
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

    afterEach(async () => {
      await app.close();
      jest.resetAllMocks();
    });

    it('AC-1: dado sem X-API-KEY, quando GET /wpp/debug_token, então 401 e WppService.forward não chamado', async () => {
      // Act
      await request(app.getHttpServer())
        .get('/wpp/debug_token?input_token=abc')
        .expect(401);

      // Assert — guard blocked before service call
      expect(mockWppService.forward).not.toHaveBeenCalled();
    });

    it('AC-2: dado X-API-KEY inválida, quando GET /wpp/debug_token, então 401', async () => {
      // Act & Assert
      await request(app.getHttpServer())
        .get('/wpp/debug_token?input_token=abc')
        .set('X-API-KEY', 'invalid-key')
        .expect(401);

      expect(mockWppService.forward).not.toHaveBeenCalled();
    });
  });

  // ─── Guard permite: health check do módulo ─────────────────────────────────

  describe('ApiKeyGuard permite (smoke test)', () => {
    beforeEach(async () => {
      mockWppService.forward.mockResolvedValue({
        status: 200,
        data: { data: {} },
      });

      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [WppModule],
      })
        .overrideProvider(WppService)
        .useValue(mockWppService)
        .overrideProvider(ConfigService)
        .useValue(mockConfigService)
        .overrideProvider(HttpService)
        .useValue(mockHttpService)
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

    afterEach(async () => {
      await app.close();
      jest.resetAllMocks();
    });

    it('AC-1: dado guard ativo e chave válida, quando GET /wpp/debug_token, então WppService.forward é chamado (não 401)', async () => {
      // Act & Assert
      await request(app.getHttpServer())
        .get('/wpp/debug_token?input_token=abc')
        .set('X-API-KEY', 'valid-key')
        .expect(200);

      expect(mockWppService.forward).toHaveBeenCalled();
    });
  });
});
