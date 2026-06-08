import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { RedisService } from '../redis/redis.service';
import { DeadLetterController } from './dead-letter.controller';
import { DeadLetterService } from './dead-letter.service';

describe('DeadLetterController — ApiKeyGuard (AC-5, AC-6)', () => {
  let app: INestApplication<App>;

  const mockDeadLetterService = {
    findMany: jest.fn(),
  };

  const VALID_API_KEY = 'valid-test-api-key';
  const SALT = 'random-salt-456';
  const HASHED_KEY = createHash('sha256')
    .update(VALID_API_KEY + SALT)
    .digest('hex');

  const mockRedisService = {
    hgetall: jest.fn(),
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeadLetterController],
      providers: [
        { provide: DeadLetterService, useValue: mockDeadLetterService },
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
    // Since guards are not yet declared on the controller, AC-5 will FAIL (RED).
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('AC-5: GET /dead-letter sem x-api-key retorna 401', async () => {
    await request(app.getHttpServer()).get('/dead-letter').expect(401);
  });

  it('AC-6: GET /dead-letter com x-api-key válido no Redis retorna 200', async () => {
    mockRedisService.hgetall.mockResolvedValue({
      'key-1': JSON.stringify({
        hashedKey: HASHED_KEY,
        salt: SALT,
        name: 'test',
      }),
    });
    mockDeadLetterService.findMany.mockResolvedValue([]);

    await request(app.getHttpServer())
      .get('/dead-letter')
      .set('x-api-key', VALID_API_KEY)
      .expect(200);
  });
});
