/**
 * E2E tests — wpp-flows
 *
 * AC-22: App running, valid X-API-KEY, UID exists, GATEWAY_PUBLIC_URL set, Meta stub,
 *        POST /wpp/:uid/:wabaId/flows (multipart) → stub receives body with correct endpoint_uri;
 *        Authorization injected by adapter
 *
 * AC-23: App running, FLOWS_PRIVATE_KEY, META_APP_SECRET, UID with stub URL,
 *        payload encrypted with matching public key, stub returns { screen: "SUCCESS" },
 *        POST /wpp/flows/endpoint/:uid with valid X-Hub-Signature-256
 *        → 200 with encrypted_flow_data decryptable to { screen: "SUCCESS" }
 */

import * as crypto from 'crypto';
import * as http from 'http';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../src/logger/logger.service';
import { RABBITMQ_SERVICE } from '../src/rabbitmq/constants/rabbitmq-tokens.constants';
import { REDIS_CLIENT } from '../src/redis/constants/redis-tokens.constants';

// ─── Mock RabbitMQ ────────────────────────────────────────────────────────────

const MOCK_RABBITMQ = {
  assertQueue: jest.fn().mockResolvedValue(undefined),
  deleteQueue: jest.fn().mockResolvedValue(undefined),
  startConsuming: jest.fn().mockResolvedValue(undefined),
  stopConsuming: jest.fn().mockResolvedValue(undefined),
  sendToQueue: jest.fn().mockResolvedValue(undefined),
  isConnected: jest.fn().mockReturnValue(true),
  defaultDlqArgs: {},
};

// ─── In-memory Redis mock ─────────────────────────────────────────────────────

class InMemoryRedis {
  private store: Map<string, Map<string, string>> = new Map();
  private stringStore: Map<string, string> = new Map();

  hset(key: string, field: string, value: string): Promise<void> {
    if (!this.store.has(key)) this.store.set(key, new Map());
    this.store.get(key)!.set(field, value);
    return Promise.resolve();
  }

  hgetall(key: string): Promise<Record<string, string> | null> {
    const hash = this.store.get(key);
    if (!hash || hash.size === 0) return Promise.resolve(null);
    const result: Record<string, string> = {};
    hash.forEach((v, k) => {
      result[k] = v;
    });
    return Promise.resolve(result);
  }

  hdel(key: string, field: string): Promise<void> {
    this.store.get(key)?.delete(field);
    return Promise.resolve();
  }

  del(key: string): Promise<void> {
    this.store.delete(key);
    this.stringStore.delete(key);
    return Promise.resolve();
  }

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.stringStore.get(key) ?? null);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  set(key: string, value: string, ..._rest: unknown[]): Promise<'OK'> {
    this.stringStore.set(key, value);
    return Promise.resolve('OK');
  }

  pipeline() {
    return this;
  }

  exec() {
    return Promise.resolve([]);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function seedApiKey(redis: InMemoryRedis, rawKey: string): Promise<void> {
  const salt = 'test-salt-fixed';
  const hashedKey = createHash('sha256')
    .update(rawKey + salt)
    .digest('hex');
  const entry = JSON.stringify({
    hashedKey,
    salt,
    name: 'e2e-wpp-flows-key',
  });
  await redis.hset('apikeys:valid', 'wpp-flows-test-uid', entry);
}

function encryptPayloadForMeta(
  payload: object,
  publicKeyPem: string,
): {
  encryptedFlowData: string;
  encryptedAesKey: string;
  initialVector: string;
  aesKey: Buffer;
} {
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const plaintext = Buffer.from(JSON.stringify(payload));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const encryptedFlowDataBuffer = Buffer.concat([encrypted, authTag]);

  const encryptedAesKeyBuffer = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      oaepHash: 'sha256',
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    },
    aesKey,
  );

  return {
    encryptedFlowData: encryptedFlowDataBuffer.toString('base64'),
    encryptedAesKey: encryptedAesKeyBuffer.toString('base64'),
    initialVector: iv.toString('base64'),
    aesKey,
  };
}

function computeHmacSignature(body: string | Buffer, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  return `sha256=${hmac.digest('hex')}`;
}

function decryptEncryptedFlowData(
  encryptedFlowData: string,
  aesKey: Buffer,
  originalIv: Buffer,
): object {
  const flippedIv = Buffer.from(originalIv);
  flippedIv[0] = flippedIv[0] ^ 0x01;

  const encryptedBuffer = Buffer.from(encryptedFlowData, 'base64');
  const authTag = encryptedBuffer.subarray(encryptedBuffer.length - 16);
  const ciphertext = encryptedBuffer.subarray(0, encryptedBuffer.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, flippedIv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8')) as object;
}

// ─── Stub HTTP server ─────────────────────────────────────────────────────────

function createStubServer(
  handler: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body: string,
  ) => void,
): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        handler(req, res, body);
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

// ─── Test RSA key pair ────────────────────────────────────────────────────────

const TEST_META_APP_SECRET = 'e2e-meta-app-secret-flows-test';

let testKeyPair: { privateKey: string; publicKey: string };

beforeAll(() => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  testKeyPair = { privateKey, publicKey };
});

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('WppFlows (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let inMemoryRedis: InMemoryRedis;

  const VALID_API_KEY = 'e2e-flows-valid-key-abcdef1234567890abcdef';
  const GATEWAY_PUBLIC_URL = 'https://gateway.example.com';

  beforeAll(async () => {
    inMemoryRedis = new InMemoryRedis();
    await seedApiKey(inMemoryRedis, VALID_API_KEY);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RABBITMQ_SERVICE)
      .useValue(MOCK_RABBITMQ)
      .overrideProvider(REDIS_CLIENT)
      .useValue(inMemoryRedis)
      .compile();

    app = moduleRef.createNestApplication<App>();

    const configService = app.get(ConfigService);
    const loggerService = app.get(LoggerService);

    // Override config values for flows e2e
    jest
      .spyOn(configService, 'get')
      .mockImplementation((key: string, defaultValue?: unknown) => {
        if (key === 'GATEWAY_PUBLIC_URL') return GATEWAY_PUBLIC_URL;
        if (key === 'FLOWS_PRIVATE_KEY') return testKeyPair.privateKey;
        if (key === 'META_APP_SECRET') return TEST_META_APP_SECRET;
        // Fall through to original for other keys
        return defaultValue;
      });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(
      new GlobalExceptionFilter(configService, loggerService),
    );

    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.flowCallbackUrl.deleteMany();
    jest.clearAllMocks();
  });

  // ─── AC-22 ─────────────────────────────────────────────────────────────────

  it('AC-22: App running, valid X-API-KEY, UID exists, GATEWAY_PUBLIC_URL set, Meta stub, POST /wpp/:uid/:wabaId/flows → stub receives body with correct endpoint_uri; Authorization injected', async () => {
    // Create a flow callback URL record for the UID
    const uid = 'uid-e2e-ac22';
    await prisma.flowCallbackUrl.create({
      data: { uid, url: 'https://client.example.com/flow', del: false },
    });

    // Stub that acts as Meta Graph API — captures the request
    let capturedAuthHeader: string | undefined;
    let capturedBody: Record<string, unknown> = {};

    const { server: metaStub, url: metaStubUrl } = await createStubServer(
      (req, res, body) => {
        capturedAuthHeader = req.headers['authorization'] as string;
        try {
          capturedBody = JSON.parse(body) as Record<string, unknown>;
        } catch {
          capturedBody = {};
        }
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'flow-created-001' }));
      },
    );

    try {
      // Override META_GRAPH_URL to point to our stub
      const configService = app.get(ConfigService);
      const originalGet = configService.get.bind(configService);
      jest
        .spyOn(configService, 'get')
        .mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'META_GRAPH_URL') return metaStubUrl;
          if (key === 'GATEWAY_PUBLIC_URL') return GATEWAY_PUBLIC_URL;
          if (key === 'FLOWS_PRIVATE_KEY') return testKeyPair.privateKey;
          if (key === 'META_APP_SECRET') return TEST_META_APP_SECRET;
          if (key === 'META_ACCESS_TOKEN') return 'e2e-test-token';
          return originalGet(key, defaultValue) as unknown;
        });

      const res = await request(app.getHttpServer())
        .post(`/wpp/${uid}/waba-e2e-001/flows`)
        .set('X-API-KEY', VALID_API_KEY)
        .field('name', 'E2E Dynamic Flow')
        .field('categories', '["SIGN_UP"]')
        .expect(201);

      const body = res.body as Record<string, unknown>;
      expect(body).toHaveProperty('id', 'flow-created-001');

      // Verify endpoint_uri injected in forwarded body
      expect(capturedBody).toHaveProperty(
        'endpoint_uri',
        `${GATEWAY_PUBLIC_URL}/wpp/flows/endpoint/${uid}`,
      );

      // Verify name field still present
      expect(capturedBody).toHaveProperty('name', 'E2E Dynamic Flow');

      // Verify Authorization injected
      expect(capturedAuthHeader).toBeDefined();
      expect(capturedAuthHeader).toMatch(/^Bearer /);
    } finally {
      metaStub.close();
    }
  });

  // ─── AC-23 ─────────────────────────────────────────────────────────────────

  it('AC-23: FLOWS_PRIVATE_KEY, META_APP_SECRET, UID with stub URL, encrypted payload, POST /wpp/flows/endpoint/:uid → 200 with encrypted_flow_data decryptable to { screen: "SUCCESS" }', async () => {
    const uid = 'uid-e2e-ac23';

    // Create a stub that acts as the client backend receiving the decrypted payload
    let capturedClientRequest: Record<string, unknown> = {};
    let capturedClientAuthHeader: string | undefined;

    const { server: clientStub, url: clientStubUrl } = await createStubServer(
      (req, res, body) => {
        capturedClientAuthHeader = req.headers['authorization'] as string;
        try {
          capturedClientRequest = JSON.parse(body) as Record<string, unknown>;
        } catch {
          capturedClientRequest = {};
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ screen: 'SUCCESS' }));
      },
    );

    try {
      await prisma.flowCallbackUrl.create({
        data: { uid, url: clientStubUrl, del: false },
      });

      // Seed the UID URL in Redis cache
      await inMemoryRedis.set(`flow_cb:${uid}`, clientStubUrl);

      // Override ConfigService for this test
      const configService = app.get(ConfigService);
      jest
        .spyOn(configService, 'get')
        .mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === 'FLOWS_PRIVATE_KEY') return testKeyPair.privateKey;
          if (key === 'META_APP_SECRET') return TEST_META_APP_SECRET;
          if (key === 'META_ACCESS_TOKEN') return 'e2e-test-token';
          if (key === 'GATEWAY_PUBLIC_URL') return GATEWAY_PUBLIC_URL;
          return defaultValue;
        });

      // Encrypt a payload with the matching public key
      const inputPayload = {
        action: 'navigate',
        screen: 'SCREEN_1',
        data: { user_id: '42' },
      };
      const { encryptedFlowData, encryptedAesKey, initialVector, aesKey } =
        encryptPayloadForMeta(inputPayload, testKeyPair.publicKey);

      const requestPayload = {
        encrypted_flow_data: encryptedFlowData,
        encrypted_aes_key: encryptedAesKey,
        initial_vector: initialVector,
      };

      const rawBody = JSON.stringify(requestPayload);
      const validSignature = computeHmacSignature(
        rawBody,
        TEST_META_APP_SECRET,
      );

      const res = await request(app.getHttpServer())
        .post(`/wpp/flows/endpoint/${uid}`)
        .set('x-hub-signature-256', validSignature)
        .set('Content-Type', 'application/json')
        .send(requestPayload)
        .expect(200);

      const body = res.body as Record<string, unknown>;
      expect(body).toHaveProperty('encrypted_flow_data');
      expect(typeof body.encrypted_flow_data).toBe('string');

      // Decrypt the response to verify it contains { screen: "SUCCESS" }
      const ivBuffer = Buffer.from(initialVector, 'base64');
      const decryptedResponse = decryptEncryptedFlowData(
        body.encrypted_flow_data as string,
        aesKey,
        ivBuffer,
      );

      expect(decryptedResponse).toEqual({ screen: 'SUCCESS' });

      // Verify client stub received the decrypted payload
      expect(capturedClientRequest).toHaveProperty('action', 'navigate');
      expect(capturedClientRequest).toHaveProperty('screen', 'SCREEN_1');

      // Verify Authorization was injected when calling client
      expect(capturedClientAuthHeader).toBeDefined();
      expect(capturedClientAuthHeader).toMatch(/^Bearer /);
    } finally {
      clientStub.close();
    }
  });
});
