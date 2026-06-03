/**
 * Unit tests — WppService (wpp-adapter-core)
 *
 * AC-3: WppService calls GET ${META_GRAPH_URL}/debug_token with correct Authorization header
 * AC-4: Meta 200 → caller receives 200 and same body
 * AC-5: Meta 400 → caller receives 400 and same error body (not 502)
 * AC-6: HttpService timeout/network error → throws BadGatewayException with ErrorResponseDto shape
 * AC-7: POST with JSON body → body forwarded intact + Content-Type: application/json
 * AC-8: Query params in request → forwarded unchanged to Meta
 */

import { HttpService } from '@nestjs/axios';
import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';
import { WppService } from './wpp.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeHttpService(): jest.Mocked<Pick<HttpService, 'request'>> {
  return { request: jest.fn() } as unknown as jest.Mocked<
    Pick<HttpService, 'request'>
  >;
}

function makeConfigService(
  overrides: Record<string, string> = {},
): jest.Mocked<Pick<ConfigService, 'get'>> {
  const defaults: Record<string, string> = {
    META_GRAPH_URL: 'https://graph.facebook.com/v20.0',
    META_ACCESS_TOKEN: 'test-meta-token',
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => defaults[key] ?? undefined),
  } as unknown as jest.Mocked<Pick<ConfigService, 'get'>>;
}

function makeAxiosResponse<T>(status: number, data: T): AxiosResponse<T> {
  return {
    status,
    statusText: String(status),
    data,
    headers: {},
    config: { headers: {} } as AxiosResponse['config'],
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const META_GRAPH_URL = 'https://graph.facebook.com/v20.0';
const META_ACCESS_TOKEN = 'test-meta-token';

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('WppService — unit', () => {
  let svc: WppService;
  let httpService: ReturnType<typeof makeHttpService>;
  let configService: ReturnType<typeof makeConfigService>;

  beforeEach(() => {
    jest.resetAllMocks();
    httpService = makeHttpService();
    configService = makeConfigService();
    svc = new WppService(
      httpService as unknown as HttpService,
      configService as unknown as ConfigService,
    );
  });

  // ─── AC-3 ──────────────────────────────────────────────────────────────────

  it('AC-3: dado valid X-API-KEY, quando GET /wpp/debug_token?input_token=abc, então HttpService.request chamado com URL correta e Authorization: Bearer token', async () => {
    // Arrange
    const responseData = { data: { app_id: '123' } };
    httpService.request.mockReturnValue(
      of(makeAxiosResponse(200, responseData)),
    );

    // Act
    await svc.forward('GET', 'debug_token', { query: { input_token: 'abc' } });

    // Assert
    expect(httpService.request).toHaveBeenCalledTimes(1);
    const callArgs = httpService.request.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(callArgs).toMatchObject({
      method: 'GET',
      headers: expect.objectContaining({
        Authorization: `Bearer ${META_ACCESS_TOKEN}`,
      }),
    });
    // URL should contain the path without double slash
    const url = callArgs['url'] as string;
    expect(url).toBe(`${META_GRAPH_URL}/debug_token`);
    expect(url).not.toMatch(/[^:]\/\//);
  });

  it('AC-3: URL montada sem barra dupla entre META_GRAPH_URL e path', async () => {
    // Arrange
    httpService.request.mockReturnValue(of(makeAxiosResponse(200, {})));

    // Act
    await svc.forward('GET', 'debug_token', {});

    // Assert
    const callArgs = httpService.request.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    const url = callArgs['url'] as string;
    expect(url).toBe(`${META_GRAPH_URL}/debug_token`);
  });

  // ─── AC-4 ──────────────────────────────────────────────────────────────────

  it('AC-4: dado Meta responde 200 { data: ... }, quando forward, então retorna status 200 e mesmo body', async () => {
    // Arrange
    const responseData = { data: { foo: 'bar' } };
    httpService.request.mockReturnValue(
      of(makeAxiosResponse(200, responseData)),
    );

    // Act
    const result = await svc.forward('GET', 'debug_token', {});

    // Assert
    expect(result.status).toBe(200);
    expect(result.data).toEqual(responseData);
  });

  // ─── AC-5 ──────────────────────────────────────────────────────────────────

  it('AC-5: dado Meta responde 400 { error: {...} }, quando forward, então retorna status 400 e mesmo body (não 502)', async () => {
    // Arrange
    const errorData = { error: { message: 'Invalid token', code: 190 } };
    const axiosError = Object.assign(
      new Error('Request failed with status code 400'),
      {
        response: makeAxiosResponse(400, errorData),
        isAxiosError: true,
      },
    );
    httpService.request.mockReturnValue(throwError(() => axiosError));

    // Act
    const result = await svc.forward('GET', 'debug_token', {});

    // Assert
    expect(result.status).toBe(400);
    expect(result.data).toEqual(errorData);
  });

  it('AC-5: dado Meta responde 500, quando forward, então retorna status 500 (não 502)', async () => {
    // Arrange
    const errorData = { error: { message: 'Server Error' } };
    const axiosError = Object.assign(
      new Error('Request failed with status code 500'),
      {
        response: makeAxiosResponse(500, errorData),
        isAxiosError: true,
      },
    );
    httpService.request.mockReturnValue(throwError(() => axiosError));

    // Act
    const result = await svc.forward('GET', 'some-path', {});

    // Assert
    expect(result.status).toBe(500);
    expect(result.data).toEqual(errorData);
  });

  // ─── AC-6 ──────────────────────────────────────────────────────────────────

  it('AC-6: dado HttpService lança erro de timeout, quando forward, então lança BadGatewayException', async () => {
    // Arrange
    const timeoutError = Object.assign(
      new Error('timeout of 30000ms exceeded'),
      {
        code: 'ECONNABORTED',
      },
    );
    httpService.request.mockReturnValue(throwError(() => timeoutError));

    // Act & Assert
    await expect(svc.forward('GET', 'debug_token', {})).rejects.toThrow(
      BadGatewayException,
    );
  });

  it('AC-6: dado HttpService lança erro de rede (ECONNREFUSED), quando forward, então lança BadGatewayException', async () => {
    // Arrange
    const networkError = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });
    httpService.request.mockReturnValue(throwError(() => networkError));

    // Act & Assert
    await expect(svc.forward('GET', 'debug_token', {})).rejects.toThrow(
      BadGatewayException,
    );
  });

  // ─── AC-7 ──────────────────────────────────────────────────────────────────

  it('AC-7: dado POST /wpp/.../messages com JSON body, quando forward, então body e Content-Type: application/json encaminhados', async () => {
    // Arrange
    const requestBody = {
      messaging_product: 'whatsapp',
      to: '5511999999999',
      type: 'text',
      text: { body: 'Hello' },
    };
    httpService.request.mockReturnValue(
      of(makeAxiosResponse(200, { messages: [{ id: 'msg-id-1' }] })),
    );

    // Act
    await svc.forward('POST', '123456789/messages', {
      body: requestBody,
      contentType: 'application/json',
    });

    // Assert
    const callArgs = httpService.request.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(callArgs['data']).toEqual(requestBody);
    const headers = callArgs['headers'] as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  // ─── AC-8 ──────────────────────────────────────────────────────────────────

  it('AC-8: dado query params no request, quando forward, então encaminhados inalterados à Meta', async () => {
    // Arrange
    const queryParams = { input_token: 'abc123', access_token: 'tok' };
    httpService.request.mockReturnValue(
      of(makeAxiosResponse(200, { data: {} })),
    );

    // Act
    await svc.forward('GET', 'debug_token', { query: queryParams });

    // Assert
    const callArgs = httpService.request.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(callArgs['params']).toEqual(queryParams);
  });

  it('AC-8: dado query params vazios, quando forward, então nenhum query param enviado', async () => {
    // Arrange
    httpService.request.mockReturnValue(of(makeAxiosResponse(200, {})));

    // Act
    await svc.forward('GET', 'debug_token', {});

    // Assert
    const callArgs = httpService.request.mock.calls[0][0] as Record<
      string,
      unknown
    >;
    // params should be undefined or empty
    expect(callArgs['params'] ?? undefined).toBeFalsy();
  });
});
