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
    expect(Number(retries)).toBe(5);
    expect(Number(backoff)).toBe(1000);
  });
});
