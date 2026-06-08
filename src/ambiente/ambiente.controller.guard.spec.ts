import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AdminKeyGuard } from '../api-keys/guards/admin-key.guard';
import { AmbienteController } from './ambiente.controller';
import { AmbienteService } from './ambiente.service';

describe('AmbienteController — AdminKeyGuard (AC-1, AC-2)', () => {
  let app: INestApplication<App>;

  const mockAmbienteService = {
    findAll: jest.fn(),
  };

  const mockConfigService = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'ADMIN_API_KEY') return 'test-admin-key';
      throw new Error(`Unknown config key: ${key}`);
    }),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AmbienteController],
      providers: [
        { provide: AmbienteService, useValue: mockAmbienteService },
        { provide: ConfigService, useValue: mockConfigService },
        AdminKeyGuard,
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    // NOTE: guards are NOT applied globally here.
    // Tests verify that the controller/routes apply guards via @UseGuards decorators.
    // Since guards are not yet declared on the controller, AC-1 will FAIL (RED).
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
    mockConfigService.getOrThrow.mockImplementation((key: string) => {
      if (key === 'ADMIN_API_KEY') return 'test-admin-key';
      throw new Error(`Unknown config key: ${key}`);
    });
  });

  it('AC-1: GET /ambientes sem Authorization retorna 401', async () => {
    await request(app.getHttpServer()).get('/ambientes').expect(401);
  });

  it('AC-2: GET /ambientes com Authorization Bearer válido retorna 200', async () => {
    mockAmbienteService.findAll.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/ambientes')
      .set('Authorization', 'Bearer test-admin-key')
      .expect(200);
  });
});
