import { DocumentBuilder } from '@nestjs/swagger';
import { OpenAPIObject } from '@nestjs/swagger';

/**
 * Constrói o documento base OpenAPI em PT-BR com esquema de auth `bearer`
 * (FR-13). Reutilizado pelo bootstrap (main.ts) e pelo registro automático.
 */
export function buildSwaggerConfig(): Omit<OpenAPIObject, 'paths'> {
  return new DocumentBuilder()
    .setTitle('Whiz Gateway')
    .setDescription(
      'Gateway de webhooks da Meta para os ambientes de mensageria Whiz.',
    )
    .setVersion('1.0')
    .addTag('Saúde', 'Verificação de prontidão da aplicação')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'bearer',
    )
    .build();
}
