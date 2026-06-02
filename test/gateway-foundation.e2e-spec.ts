import {
  Body,
  Controller,
  Get,
  INestApplication,
  Module,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { IsString } from 'class-validator';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { LoggerModule } from '../src/logger/logger.module';
import { LoggerService } from '../src/logger/logger.service';

// --- throwaway fixtures for AC-8..11 (test-only, never shipped) ---

class SampleDto {
  @IsString()
  name!: string;
}

@Controller('throw')
class ThrowController {
  @Get()
  raise(): never {
    throw new Error('generic failure');
  }
}

@Controller('validate')
class ValidateController {
  @Post()
  create(@Body() dto: SampleDto): SampleDto {
    return dto;
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    LoggerModule,
  ],
  controllers: [ThrowController, ValidateController],
})
class FixtureModule {}

async function bootstrapFixture(env: string): Promise<INestApplication<App>> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [FixtureModule],
  }).compile();

  const app = moduleRef.createNestApplication<App>();
  const config = app.get(ConfigService);
  jest.spyOn(config, 'get').mockImplementation((key: string) => {
    if (key === 'ENV') return env;
    return undefined;
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(
    new GlobalExceptionFilter(config, app.get(LoggerService)),
  );
  await app.init();
  return app;
}

describe('Gateway Foundation (e2e)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('AppModule routes', () => {
    let app: INestApplication<App>;

    beforeEach(async () => {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleRef.createNestApplication<App>();
      await app.init();
    });

    afterEach(async () => {
      await app.close();
    });

    it('AC-6: GET / returns 200 readiness with status ok and ISO8601 timestamp', async () => {
      // Act
      const res = await request(app.getHttpServer()).get('/').expect(200);

      // Assert
      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('timestamp');
      expect(Number.isNaN(Date.parse(String(res.body.timestamp)))).toBe(false);
    });

    it('AC-7: GET /docs returns 200 Swagger UI HTML', async () => {
      // Act
      const res = await request(app.getHttpServer()).get('/docs').expect(200);

      // Assert
      expect(res.text).toContain('Swagger UI');
    });
  });

  describe('GlobalExceptionFilter behaviour', () => {
    it('AC-8: ENV != production exposes details on a generic 500 error', async () => {
      // Arrange
      const app = await bootstrapFixture('development');

      // Act
      const res = await request(app.getHttpServer()).get('/throw').expect(500);

      // Assert
      expect(res.body).toHaveProperty('statusCode', 500);
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('message');
      expect(res.body).toHaveProperty('details');
      await app.close();
    });

    it('AC-9: ENV == production omits details on a generic 500 error', async () => {
      // Arrange
      const app = await bootstrapFixture('production');

      // Act
      const res = await request(app.getHttpServer()).get('/throw').expect(500);

      // Assert
      expect(res.body).toHaveProperty('statusCode', 500);
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('message');
      expect(res.body).not.toHaveProperty('details');
      await app.close();
    });
  });

  describe('Global ValidationPipe behaviour', () => {
    it('AC-10: invalid DTO yields 400 with aggregated validation message', async () => {
      // Arrange
      const app = await bootstrapFixture('development');

      // Act
      const res = await request(app.getHttpServer())
        .post('/validate')
        .send({ name: 123 })
        .expect(400);

      // Assert
      expect(res.body).toHaveProperty('statusCode', 400);
      expect(typeof res.body.message).toBe('string');
      expect(String(res.body.message)).toContain('name');
      await app.close();
    });

    it('AC-11: non-whitelisted property yields 400 (forbidNonWhitelisted)', async () => {
      // Arrange
      const app = await bootstrapFixture('development');

      // Act
      await request(app.getHttpServer())
        .post('/validate')
        .send({ name: 'ok', extra: 'nope' })
        .expect(400);

      // Assert handled by .expect(400)
      await app.close();
    });
  });
});
