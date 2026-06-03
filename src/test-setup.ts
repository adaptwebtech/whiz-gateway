process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5433/whiz_gateway';
process.env.RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
process.env.META_VERIFY_TOKEN =
  process.env.META_VERIFY_TOKEN || 'test-verify-token';
process.env.META_APP_SECRET = process.env.META_APP_SECRET || 'test-app-secret';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.ADMIN_API_KEY =
  process.env.ADMIN_API_KEY || 'test-admin-key-default';
process.env.META_GRAPH_URL =
  process.env.META_GRAPH_URL || 'https://graph.facebook.com/v20.0';
process.env.META_ACCESS_TOKEN =
  process.env.META_ACCESS_TOKEN || 'test-meta-token';
