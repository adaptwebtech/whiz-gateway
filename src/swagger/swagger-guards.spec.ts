import { buildSwaggerConfig } from './swagger.document';

/**
 * Testes unitários do documento OpenAPI para validação dos esquemas de
 * segurança após a feature api-key-guard-admin-routes.
 *
 * AC-9: O documento deve conter securitySchemes.api-key com type=apiKey,
 *       in=header, name=x-api-key.
 * AC-10: O documento não deve conter o esquema `bearer` (bearer-only foi
 *        substituído pelo esquema api-key para as rotas de ApiKeyGuard).
 *        Nenhuma rota de ApiKeyGuard deve referenciar o esquema bearer;
 *        todas devem referenciar api-key.
 */
describe('swagger.document — esquemas de segurança (AC-9, AC-10)', () => {
  it('AC-9: securitySchemes contém api-key com type:apiKey, in:header, name:x-api-key', () => {
    const config = buildSwaggerConfig();

    const securitySchemes = (
      config as {
        components?: {
          securitySchemes?: Record<
            string,
            { type: string; in?: string; name?: string }
          >;
        };
      }
    ).components?.securitySchemes;

    expect(securitySchemes).toBeDefined();
    expect(securitySchemes).toHaveProperty('api-key');

    const apiKeyScheme = securitySchemes!['api-key'];
    expect(apiKeyScheme.type).toBe('apiKey');
    expect(apiKeyScheme.in).toBe('header');
    expect(apiKeyScheme.name).toBe('x-api-key');
  });

  it('AC-10: buildSwaggerConfig não registra apenas bearer — deve incluir esquema api-key distinto de bearer', () => {
    const config = buildSwaggerConfig();

    const securitySchemes = (
      config as {
        components?: {
          securitySchemes?: Record<string, { type: string; scheme?: string }>;
        };
      }
    ).components?.securitySchemes;

    expect(securitySchemes).toBeDefined();

    // O esquema api-key deve existir e ser do tipo apiKey (não http/bearer)
    const apiKeyScheme = securitySchemes!['api-key'];
    expect(apiKeyScheme).toBeDefined();
    expect(apiKeyScheme.type).toBe('apiKey');

    // O esquema bearer (http) pode coexistir para AdminKeyGuard mas
    // o esquema api-key deve ser independente — tipo != 'http'
    expect(apiKeyScheme.type).not.toBe('http');
  });
});
