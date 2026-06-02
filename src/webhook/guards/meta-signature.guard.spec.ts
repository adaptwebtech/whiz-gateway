/**
 * Unit tests — MetaSignatureGuard (webhook-ingestao)
 *
 * AC-9: signature comparison uses crypto.timingSafeEqual (timing-safe)
 */

import * as crypto from 'crypto';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaSignatureGuard } from './meta-signature.guard';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const META_APP_SECRET = 'test-secret-value';

function computeValidSignature(rawBody: Buffer, secret: string): string {
  const hmac = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return `sha256=${hmac}`;
}

function makeConfigService(secret: string): jest.Mocked<ConfigService> {
  return {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'META_APP_SECRET') return secret;
      return undefined;
    }),
  } as unknown as jest.Mocked<ConfigService>;
}

function makeExecutionContext(
  rawBody: Buffer,
  signature: string,
): ExecutionContext {
  const mockRequest = {
    rawBody,
    headers: {
      'x-hub-signature-256': signature,
    },
  };

  return {
    switchToHttp: () => ({
      getRequest: () => mockRequest,
    }),
  } as unknown as ExecutionContext;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MetaSignatureGuard — unit', () => {
  let guard: MetaSignatureGuard;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    jest.resetAllMocks();
    configService = makeConfigService(META_APP_SECRET);
    guard = new MetaSignatureGuard(configService);
  });

  // ─── AC-9 ──────────────────────────────────────────────────────────────────

  it('AC-9: comparação de assinaturas utiliza crypto.timingSafeEqual', () => {
    // Arrange
    const rawBody = Buffer.from('{"object":"test"}');
    const validSig = computeValidSignature(rawBody, META_APP_SECRET);
    const ctx = makeExecutionContext(rawBody, validSig);

    const timingSafeEqualSpy = jest.spyOn(crypto, 'timingSafeEqual');

    // Act
    guard.canActivate(ctx);

    // Assert
    expect(timingSafeEqualSpy).toHaveBeenCalled();
  });

  it('AC-9: assinatura válida retorna true (guard permite passagem)', () => {
    // Arrange
    const rawBody = Buffer.from('{"object":"whatsapp_business_account"}');
    const validSig = computeValidSignature(rawBody, META_APP_SECRET);
    const ctx = makeExecutionContext(rawBody, validSig);

    // Act
    const result = guard.canActivate(ctx);

    // Assert
    expect(result).toBe(true);
  });

  it('AC-9: assinatura inválida lança UnauthorizedException (nunca retorna true)', () => {
    // Arrange
    const rawBody = Buffer.from('{"object":"test"}');
    const invalidSig = 'sha256=invalidsignaturehex';
    const ctx = makeExecutionContext(rawBody, invalidSig);

    // Act & Assert
    expect(() => {
      void guard.canActivate(ctx);
    }).toThrow(UnauthorizedException);
  });

  it('AC-9: header ausente lança UnauthorizedException', () => {
    // Arrange
    const rawBody = Buffer.from('{"object":"test"}');
    const mockRequest = {
      rawBody,
      headers: {},
    };
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;

    // Act & Assert
    expect(() => {
      void guard.canActivate(ctx);
    }).toThrow(UnauthorizedException);
  });

  it('AC-9: assinatura de corpo diferente é rejeitada com UnauthorizedException', () => {
    // Arrange — assinar um corpo diferente
    const rawBodyReal = Buffer.from('{"real":"body"}');
    const rawBodyFake = Buffer.from('{"tampered":"body"}');
    const sigForFake = computeValidSignature(rawBodyFake, META_APP_SECRET);
    const ctx = makeExecutionContext(rawBodyReal, sigForFake);

    // Act & Assert
    expect(() => {
      void guard.canActivate(ctx);
    }).toThrow(UnauthorizedException);
  });

  it('AC-9: timingSafeEqual é chamado com buffers de tamanho igual (proteção timing)', () => {
    // Arrange
    const rawBody = Buffer.from('{"object":"test"}');
    const validSig = computeValidSignature(rawBody, META_APP_SECRET);
    const ctx = makeExecutionContext(rawBody, validSig);

    const timingSafeEqualSpy = jest.spyOn(crypto, 'timingSafeEqual');

    // Act
    guard.canActivate(ctx);

    // Assert — ambos os buffers passados devem ter o mesmo tamanho
    const callArgs = timingSafeEqualSpy.mock.calls[0];
    expect(callArgs).toBeDefined();
    expect(callArgs[0].length).toBe(callArgs[1].length);
  });
});
