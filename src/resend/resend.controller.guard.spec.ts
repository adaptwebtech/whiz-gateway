import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { RedisService } from '../redis/redis.service';
import { ResendController } from './resend.controller';
import { ResendService } from './resend.service';

describe('ResendController — ApiKeyGuard (AC-7, AC-8)', () => {
  let app: INestApplication<App>;

  const mockResendService = {
    resend: jest.fn(),
  };

  const VALID_API_KEY = 'valid-test-api-key';
  const SALT = 'random-salt-789';
  const HASHED_KEY = createHash('sha256')
    .update(VALID_API_KEY + SALT)
    .digest('hex');

  const mockRedisService = {
    hgetall: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ResendController],
      providers: [
        { provide: ResendService, useValue: mockResendService },
        { provide: RedisService, useValue: mockRedisService },
        ApiKeyGuard,
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
    // Since guards are not yet declared on the controller, AC-7 will FAIL (RED).
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('AC-7: POST /messages/resend sem x-api-key retorna 401', async () => {
    await request(app.getHttpServer())
      .post('/messages/resend')
      .send({ pid: 'test-pid' })
      .expect(401);
  });

  it('AC-8: POST /messages/resend com x-api-key válido no Redis retorna 200', async () => {
    mockRedisService.hgetall.mockResolvedValue({
      'key-1': JSON.stringify({
        hashedKey: HASHED_KEY,
        salt: SALT,
        name: 'test',
      }),
    });
    mockResendService.resend.mockResolvedValue({
      total: 0,
      reenviadas: 0,
      falhas: 0,
    });

    await request(app.getHttpServer())
      .post('/messages/resend')
      .set('x-api-key', VALID_API_KEY)
      .send({ pid: 'test-pid' })
      .expect(200);
  });
});
