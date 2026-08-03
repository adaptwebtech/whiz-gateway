import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { configValidationSchema } from './config.validation';

describe('ConfigService (env loading)', () => {
  let configService: ConfigService;

  beforeEach(async () => {
    jest.resetAllMocks();

    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.RABBITMQ_URL = 'amqp://localhost';
    process.env.META_VERIFY_TOKEN = 'verify';
    process.env.META_APP_SECRET = 'secret';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          validationSchema: configValidationSchema,
        }),
      ],
    }).compile();

    configService = moduleRef.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.RABBITMQ_URL;
    delete process.env.META_VERIFY_TOKEN;
    delete process.env.META_APP_SECRET;
  });

  it('AC-13: provides all envs with documented defaults (ENV=development, PORT=3000, DISPATCH_MAX_RETRIES=5, DISPATCH_BACKOFF_BASE_MS=1000)', () => {
    // Arrange / Act
    const env = configService.get('ENV');
    const port = configService.get('PORT');
    const retries = configService.get('DISPATCH_MAX_RETRIES');
    const backoff = configService.get('DISPATCH_BACKOFF_BASE_MS');

    // Assert
    expect(configService.get('DATABASE_URL')).toBeDefined();
    expect(configService.get('RABBITMQ_URL')).toBeDefined();
    expect(configService.get('META_VERIFY_TOKEN')).toBeDefined();
    expect(configService.get('META_APP_SECRET')).toBeDefined();
    expect(env).toBe('development');
    expect(Number(port)).toBe(3000);
    expect(Number(retries)).toBe(10);
    expect(Number(backoff)).toBe(1000);
  });
});

describe('configValidationSchema (envs do Sentry)', () => {
  const envBase = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    RABBITMQ_URL: 'amqp://localhost',
    REDIS_URL: 'redis://localhost:6379',
    ADMIN_API_KEY: 'admin',
  };

  it('AC-18: Given no SENTRY_* env, when validating, then it passes with documented defaults', () => {
    // Arrange / Act
    const { error, value } = configValidationSchema.validate(
      { ...envBase },
      { allowUnknown: true, abortEarly: false },
    );

    // Assert
    expect(error).toBeUndefined();
    const env = value as Record<string, unknown>;
    expect(env.SENTRY_ENABLED).toBe(true);
    expect(env.SENTRY_TRACES_SAMPLE_RATE).toBe(0.01);
    expect(env.SENTRY_ENABLE_LOGS).toBe(false);
    expect(env.SENTRY_ENABLE_METRICS).toBe(false);
  });

  it('AC-18: Given SENTRY_TRACES_SAMPLE_RATE outside 0..1, when validating, then it fails', () => {
    // Arrange / Act
    const { error } = configValidationSchema.validate(
      { ...envBase, SENTRY_TRACES_SAMPLE_RATE: '2' },
      { allowUnknown: true, abortEarly: false },
    );

    // Assert
    expect(error?.message).toContain('SENTRY_TRACES_SAMPLE_RATE');
  });

  it('AC-18: Given a SENTRY_DSN and SENTRY_RELEASE, when validating, then both are accepted', () => {
    // Arrange / Act
    const { error, value } = configValidationSchema.validate(
      {
        ...envBase,
        SENTRY_DSN: 'http://chave@glitchtip.interno/2',
        SENTRY_RELEASE: 'gateway@1.2.3',
      },
      { allowUnknown: true, abortEarly: false },
    );

    // Assert
    expect(error).toBeUndefined();
    const env = value as Record<string, unknown>;
    expect(env.SENTRY_DSN).toBe('http://chave@glitchtip.interno/2');
    expect(env.SENTRY_RELEASE).toBe('gateway@1.2.3');
  });
});
