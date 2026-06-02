import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './app.module';

describe('AppModule scheduler registration', () => {
  let moduleRef: TestingModule;

  beforeEach(async () => {
    jest.resetAllMocks();

    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.RABBITMQ_URL = 'amqp://localhost';
    process.env.META_VERIFY_TOKEN = 'verify';
    process.env.META_APP_SECRET = 'secret';

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
  });

  afterEach(async () => {
    await moduleRef?.close();
    delete process.env.DATABASE_URL;
    delete process.env.RABBITMQ_URL;
    delete process.env.META_VERIFY_TOKEN;
    delete process.env.META_APP_SECRET;
  });

  it('AC-14: SchedulerRegistry is resolvable (ScheduleModule.forRoot registered)', () => {
    // Arrange / Act
    const registry = moduleRef.get(SchedulerRegistry, { strict: false });

    // Assert
    expect(registry).toBeInstanceOf(SchedulerRegistry);
  });
});
