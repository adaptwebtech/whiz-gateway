/**
 * Unit tests — WppFlowsEndpointService
 *
 * AC-15: FLOWS_PRIVATE_KEY set, UID exists, valid X-Hub-Signature-256, correctly encrypted payload
 *        → AES key decrypted RSA-OAEP; payload decrypted AES-256-GCM; forward JSON to UID URL with Bearer;
 *          response re-encrypted with flipped IV; 200 { encrypted_flow_data }
 * AC-16: Decrypted payload contains { action: "ping" } → health-check re-encrypted; client URL not called
 * AC-17: Invalid X-Hub-Signature-256 → throws UnauthorizedException (401)
 * AC-18: UID not found (valid signature) → throws NotFoundException (404)
 * AC-19: FLOWS_PRIVATE_KEY absent → throws ServiceUnavailableException (503)
 * AC-20: Incorrect RSA key (decryption fails) → throws HttpException 421
 * AC-21: UID URL returns timeout → throws InternalServerErrorException (500)
 */

import * as crypto from 'crypto';
import {
  UnauthorizedException,
  NotFoundException,
  ServiceUnavailableException,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { WppFlowsEndpointService } from './wpp-flows-endpoint.service';
import { WppFlowCallbacksService } from '../wpp-flow-callbacks/wpp-flow-callbacks.service';
import { ConfigService } from '@nestjs/config';

// ─── Helpers: RSA key pair for tests ─────────────────────────────────────────

let testKeyPair: { privateKey: string; publicKey: string };

beforeAll(() => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  testKeyPair = { privateKey, publicKey };
});

// ─── Helper: encrypt payload the same way Meta would ─────────────────────────

function encryptPayload(
  payload: object,
  publicKeyPem: string,
): {
  encryptedFlowData: string;
  encryptedAesKey: string;
  initialVector: string;
} {
  // Generate AES-256 key and IV
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  // Encrypt payload with AES-256-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const plaintext = Buffer.from(JSON.stringify(payload));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes
  const encryptedFlowDataBuffer = Buffer.concat([encrypted, authTag]);

  // Encrypt AES key with RSA-OAEP
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
  };
}

// ─── Helper: compute HMAC-SHA256 signature the way Meta would ─────────────────

function computeSignature(body: Buffer, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(body);
  return `sha256=${hmac.digest('hex')}`;
}

// ─── Helper: decrypt response (same AES key, IV XOR 0x01 on first byte) ──────

function decryptResponse(
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

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockFlowCallbacksService = {
  getUrl: jest.fn(),
} as unknown as jest.Mocked<WppFlowCallbacksService>;

const META_APP_SECRET = 'test-meta-app-secret';
const CLIENT_URL = 'https://client.example.com/flow-handler';

let mockConfigGet: jest.Mock;
let mockConfigGetOrThrow: jest.Mock;

function buildMockConfigService(privateKey: string | undefined): ConfigService {
  mockConfigGet = jest.fn().mockImplementation((key: string) => {
    if (key === 'META_APP_SECRET') return META_APP_SECRET;
    if (key === 'FLOWS_PRIVATE_KEY') return privateKey ?? undefined;
    if (key === 'META_ACCESS_TOKEN') return 'meta-access-token-test';
    return undefined;
  });
  mockConfigGetOrThrow = jest.fn().mockImplementation((key: string) => {
    if (key === 'META_APP_SECRET') return META_APP_SECRET;
    if (key === 'FLOWS_PRIVATE_KEY') return privateKey;
    if (key === 'META_ACCESS_TOKEN') return 'meta-access-token-test';
    throw new Error(`Config key not found: ${key}`);
  });

  return {
    get: mockConfigGet,
    getOrThrow: mockConfigGetOrThrow,
  } as unknown as ConfigService;
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('WppFlowsEndpointService', () => {
  let service: WppFlowsEndpointService;

  beforeEach(() => {
    jest.resetAllMocks();
  });

  // ─── AC-17 ───────────────────────────────────────────────────────────────────

  describe('verifySignature / handle — signature checks', () => {
    it('AC-17: invalid X-Hub-Signature-256 → throws UnauthorizedException', async () => {
      const configService = buildMockConfigService(testKeyPair.privateKey);
      service = new WppFlowsEndpointService(
        configService,
        mockFlowCallbacksService,
      );

      const rawBody = Buffer.from(
        '{"encrypted_flow_data":"x","encrypted_aes_key":"y","initial_vector":"z"}',
      );
      const invalidSignature = 'sha256=invalidhash';

      await expect(
        service.handle(
          'uid-test',
          {
            encrypted_flow_data: 'x',
            encrypted_aes_key: 'y',
            initial_vector: 'z',
          },
          rawBody,
          invalidSignature,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('AC-17: missing X-Hub-Signature-256 header → throws UnauthorizedException', async () => {
      const configService = buildMockConfigService(testKeyPair.privateKey);
      service = new WppFlowsEndpointService(
        configService,
        mockFlowCallbacksService,
      );

      const rawBody = Buffer.from('{}');

      await expect(
        service.handle(
          'uid-test',
          {
            encrypted_flow_data: 'x',
            encrypted_aes_key: 'y',
            initial_vector: 'z',
          },
          rawBody,
          '',
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── AC-18 ───────────────────────────────────────────────────────────────────

  describe('UID lookup — handle', () => {
    it('AC-18: UID not found (valid signature) → throws NotFoundException', async () => {
      const configService = buildMockConfigService(testKeyPair.privateKey);
      service = new WppFlowsEndpointService(
        configService,
        mockFlowCallbacksService,
      );

      (mockFlowCallbacksService.getUrl as jest.Mock).mockResolvedValue(null);

      const payload = {
        encrypted_flow_data: 'data==',
        encrypted_aes_key: 'key==',
        initial_vector: 'iv==',
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const validSig = computeSignature(rawBody, META_APP_SECRET);

      await expect(
        service.handle('uid-nonexistent', payload, rawBody, validSig),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── AC-19 ───────────────────────────────────────────────────────────────────

  describe('FLOWS_PRIVATE_KEY absent', () => {
    it('AC-19: FLOWS_PRIVATE_KEY not configured → throws ServiceUnavailableException', async () => {
      const configService = buildMockConfigService(undefined);
      service = new WppFlowsEndpointService(
        configService,
        mockFlowCallbacksService,
      );

      (mockFlowCallbacksService.getUrl as jest.Mock).mockResolvedValue(
        CLIENT_URL,
      );

      const payload = {
        encrypted_flow_data: 'data==',
        encrypted_aes_key: 'key==',
        initial_vector: 'iv==',
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const validSig = computeSignature(rawBody, META_APP_SECRET);

      await expect(
        service.handle('uid-ac19', payload, rawBody, validSig),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  // ─── AC-20 ───────────────────────────────────────────────────────────────────

  describe('RSA decryption failure', () => {
    it('AC-20: Incorrect RSA key (decryption fails) → throws HttpException 421', async () => {
      // Generate a different key pair — private key will not match the public key used to encrypt
      const wrongKeyPair = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      const configService = buildMockConfigService(wrongKeyPair.privateKey);
      service = new WppFlowsEndpointService(
        configService,
        mockFlowCallbacksService,
      );

      (mockFlowCallbacksService.getUrl as jest.Mock).mockResolvedValue(
        CLIENT_URL,
      );

      // Encrypt with testKeyPair.publicKey but service will decrypt with wrongKeyPair.privateKey
      const { encryptedFlowData, encryptedAesKey, initialVector } =
        encryptPayload(
          { action: 'navigate', screen: 'SCREEN_1' },
          testKeyPair.publicKey,
        );

      const payload = {
        encrypted_flow_data: encryptedFlowData,
        encrypted_aes_key: encryptedAesKey,
        initial_vector: initialVector,
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const validSig = computeSignature(rawBody, META_APP_SECRET);

      await expect(
        service.handle('uid-ac20', payload, rawBody, validSig),
      ).rejects.toThrow(HttpException);

      try {
        await service.handle('uid-ac20', payload, rawBody, validSig);
      } catch (err) {
        expect((err as HttpException).getStatus()).toBe(421);
      }
    });
  });

  // ─── AC-15 ───────────────────────────────────────────────────────────────────

  describe('full crypto flow — handle', () => {
    it('AC-15: valid signature, UID exists, correct encryption → AES decrypted; payload forwarded with Bearer; response re-encrypted; returns 200 { encrypted_flow_data }', async () => {
      const configService = buildMockConfigService(testKeyPair.privateKey);
      service = new WppFlowsEndpointService(
        configService,
        mockFlowCallbacksService,
      );

      (mockFlowCallbacksService.getUrl as jest.Mock).mockResolvedValue(
        CLIENT_URL,
      );

      const clientResponsePayload = { screen: 'SUCCESS', data: {} };

      // Mock forwardToClient to avoid real HTTP call
      jest
        .spyOn(
          service as unknown as {
            forwardToClient: (url: string, payload: object) => Promise<object>;
          },
          'forwardToClient',
        )
        .mockResolvedValue(clientResponsePayload);

      const inputPayload = {
        action: 'navigate',
        screen: 'SCREEN_1',
        data: { key: 'value' },
      };
      const { encryptedFlowData, encryptedAesKey, initialVector } =
        encryptPayload(inputPayload, testKeyPair.publicKey);

      const payload = {
        encrypted_flow_data: encryptedFlowData,
        encrypted_aes_key: encryptedAesKey,
        initial_vector: initialVector,
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const validSig = computeSignature(rawBody, META_APP_SECRET);

      const result = await service.handle(
        'uid-ac15',
        payload,
        rawBody,
        validSig,
      );

      expect(result).toHaveProperty('encrypted_flow_data');
      expect(typeof result.encrypted_flow_data).toBe('string');

      // Decrypt the response to verify it contains the client's response
      const aesKey = crypto.privateDecrypt(
        {
          key: testKeyPair.privateKey,
          oaepHash: 'sha256',
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        },
        Buffer.from(encryptedAesKey, 'base64'),
      );
      const ivBuffer = Buffer.from(initialVector, 'base64');
      const decryptedResponse = decryptResponse(
        result.encrypted_flow_data,
        aesKey,
        ivBuffer,
      );

      expect(decryptedResponse).toEqual(clientResponsePayload);
    });
  });

  // ─── AC-16 ───────────────────────────────────────────────────────────────────

  describe('ping action — handle', () => {
    it('AC-16: { action: "ping" } → health-check re-encrypted returned; client URL not called', async () => {
      const configService = buildMockConfigService(testKeyPair.privateKey);
      service = new WppFlowsEndpointService(
        configService,
        mockFlowCallbacksService,
      );

      (mockFlowCallbacksService.getUrl as jest.Mock).mockResolvedValue(
        CLIENT_URL,
      );

      const forwardToClientSpy = jest
        .spyOn(
          service as unknown as {
            forwardToClient: (url: string, payload: object) => Promise<object>;
          },
          'forwardToClient',
        )
        .mockResolvedValue({ screen: 'SUCCESS' });

      const pingPayload = { action: 'ping' };
      const { encryptedFlowData, encryptedAesKey, initialVector } =
        encryptPayload(pingPayload, testKeyPair.publicKey);

      const payload = {
        encrypted_flow_data: encryptedFlowData,
        encrypted_aes_key: encryptedAesKey,
        initial_vector: initialVector,
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const validSig = computeSignature(rawBody, META_APP_SECRET);

      const result = await service.handle(
        'uid-ac16',
        payload,
        rawBody,
        validSig,
      );

      expect(result).toHaveProperty('encrypted_flow_data');
      expect(typeof result.encrypted_flow_data).toBe('string');

      // Verify forwardToClient was NOT called for ping
      expect(forwardToClientSpy).not.toHaveBeenCalled();

      // Verify decrypted response is the health-check response
      const aesKey = crypto.privateDecrypt(
        {
          key: testKeyPair.privateKey,
          oaepHash: 'sha256',
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        },
        Buffer.from(encryptedAesKey, 'base64'),
      );
      const ivBuffer = Buffer.from(initialVector, 'base64');
      const decryptedResponse = decryptResponse(
        result.encrypted_flow_data,
        aesKey,
        ivBuffer,
      );

      expect(decryptedResponse).toHaveProperty('data');
    });
  });

  // ─── AC-21 ───────────────────────────────────────────────────────────────────

  describe('client URL timeout', () => {
    it('AC-21: forwardToClient throws timeout → throws InternalServerErrorException (500)', async () => {
      const configService = buildMockConfigService(testKeyPair.privateKey);
      service = new WppFlowsEndpointService(
        configService,
        mockFlowCallbacksService,
      );

      (mockFlowCallbacksService.getUrl as jest.Mock).mockResolvedValue(
        CLIENT_URL,
      );

      jest
        .spyOn(
          service as unknown as {
            forwardToClient: (url: string, payload: object) => Promise<object>;
          },
          'forwardToClient',
        )
        .mockRejectedValue(new Error('ETIMEDOUT'));

      const inputPayload = { action: 'navigate', screen: 'SCREEN_1' };
      const { encryptedFlowData, encryptedAesKey, initialVector } =
        encryptPayload(inputPayload, testKeyPair.publicKey);

      const payload = {
        encrypted_flow_data: encryptedFlowData,
        encrypted_aes_key: encryptedAesKey,
        initial_vector: initialVector,
      };
      const rawBody = Buffer.from(JSON.stringify(payload));
      const validSig = computeSignature(rawBody, META_APP_SECRET);

      await expect(
        service.handle('uid-ac21', payload, rawBody, validSig),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
});
