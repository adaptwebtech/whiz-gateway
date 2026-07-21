/**
 * Unit tests — MetaSignatureGuard (webhook-ingestao)
 *
 * AC-9: signature comparison uses crypto.timingSafeEqual (timing-safe)
 * AC-1/2/3/8 (webhook-401-diagnostics): structured diagnostic logging
 */

import * as crypto from 'crypto';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../logger/logger.service';
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

function makeLoggerService(): jest.Mocked<LoggerService> {
  return {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  } as unknown as jest.Mocked<LoggerService>;
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
  let logger: jest.Mocked<LoggerService>;

  beforeEach(() => {
    jest.resetAllMocks();
    configService = makeConfigService(META_APP_SECRET);
    logger = makeLoggerService();
    guard = new MetaSignatureGuard(configService, logger);
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

  // ─── AC-1/2/3/8 — diagnostic logging ───────────────────────────────────────

  it('AC-1: header ausente loga causa=assinatura-ausente', () => {
    // Arrange
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ rawBody: Buffer.from('{}'), headers: {} }),
      }),
    } as unknown as ExecutionContext;

    // Act & Assert
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain('causa=assinatura-ausente');
  });

  it('AC-2: corpo cru ausente loga causa=corpo-cru-ausente', () => {
    // Arrange — header presente, rawBody ausente
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { 'x-hub-signature-256': 'sha256=abc' },
        }),
      }),
    } as unknown as ExecutionContext;

    // Act & Assert
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain('causa=corpo-cru-ausente');
  });

  it('AC-3: HMAC divergente loga rawBodyBytes, assinaturaPrefix e metaAppSecretConfigurado', () => {
    // Arrange
    const rawBody = Buffer.from('{"object":"test"}');
    const invalidSig = 'sha256=deadbeefcafebabe0123456789';
    const ctx = makeExecutionContext(rawBody, invalidSig);

    // Act & Assert
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    const logged = logger.warn.mock.calls[0][0] as string;
    expect(logged).toContain('causa=hmac-divergente');
    expect(logged).toContain(`rawBodyBytes=${rawBody.length}`);
    expect(logged).toContain('assinaturaPrefix=sha256=deadb');
    expect(logged).toContain('metaAppSecretConfigurado=true');
  });

  it('AC-4: log de HMAC divergente inclui dica de causa-raiz Instagram Login / rota correta', () => {
    // Arrange
    const rawBody = Buffer.from('{"object":"instagram"}');
    const invalidSig = 'sha256=invalidsignaturehex';
    const ctx = makeExecutionContext(rawBody, invalidSig);

    // Act
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);

    // Assert
    const logged = logger.warn.mock.calls[0][0] as string;
    expect(logged).toContain('Instagram Login');
    expect(logged).toContain('POST /webhook/instagram-login');
  });

  it('AC-8: o valor de META_APP_SECRET nunca aparece no log', () => {
    // Arrange
    const rawBody = Buffer.from('{"object":"test"}');
    const invalidSig = 'sha256=invalidsignaturehex';
    const ctx = makeExecutionContext(rawBody, invalidSig);

    // Act
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);

    // Assert
    const logged = logger.warn.mock.calls[0][0] as string;
    expect(logged).not.toContain(META_APP_SECRET);
  });
});
