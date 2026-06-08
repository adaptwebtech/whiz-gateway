import { createHash } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AdminKeyGuard } from '../api-keys/guards/admin-key.guard';
import { AdminOrApiKeyGuard } from '../api-keys/guards/admin-or-api-key.guard';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { RedisService } from '../redis/redis.service';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';

const ADMIN_API_KEY = 'test-admin-key';

const VALID_RAW_KEY = 'valid-raw-api-key-abc123';
const SALT = 'test-salt-xyz';
const HASHED_KEY = createHash('sha256')
  .update(VALID_RAW_KEY + SALT)
  .digest('hex');

const mockInboxService = {
  findAll: jest.fn().mockResolvedValue([]),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
};

const mockConfigService = {
  getOrThrow: jest.fn((key: string) => {
    if (key === 'ADMIN_API_KEY') return ADMIN_API_KEY;
    throw new Error(`Config key not mocked: ${key}`);
  }),
  get: jest.fn((key: string) => {
    if (key === 'ADMIN_API_KEY') return ADMIN_API_KEY;
    return undefined;
  }),
};

const validRedisEntry = JSON.stringify({
  hashedKey: HASHED_KEY,
  salt: SALT,
  name: 'test-api-key',
});

const mockRedisService = {
  hgetall: jest.fn((key: string) => {
    if (key === 'apikeys:valid') {
      return Promise.resolve({ 'test-api-key': validRedisEntry });
    }
    return Promise.resolve(null);
  }),
};

describe('InboxController — AdminOrApiKeyGuard (integration)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InboxController],
      providers: [
        { provide: InboxService, useValue: mockInboxService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RedisService, useValue: mockRedisService },
        AdminKeyGuard,
        ApiKeyGuard,
        AdminOrApiKeyGuard,
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
    app.useGlobalGuards(module.get(AdminOrApiKeyGuard));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC-3: GET /inboxes sem autenticação retorna 401', async () => {
    const response = await request(app.getHttpServer()).get('/inboxes');
    expect(response.status).toBe(401);
  });

  it('AC-4: GET /inboxes com x-api-key válida no Redis retorna 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/inboxes')
      .set('x-api-key', VALID_RAW_KEY);
    expect(response.status).toBe(200);
  });

  it('AC-11: GET /inboxes com Authorization: Bearer <ADMIN_API_KEY> válido retorna 200', async () => {
    const response = await request(app.getHttpServer())
      .get('/inboxes')
      .set('Authorization', `Bearer ${ADMIN_API_KEY}`);
    expect(response.status).toBe(200);
  });
});
