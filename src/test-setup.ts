process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/test_db';
process.env.RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
process.env.META_VERIFY_TOKEN =
  process.env.META_VERIFY_TOKEN || 'test-verify-token';
process.env.META_APP_SECRET = process.env.META_APP_SECRET || 'test-app-secret';
