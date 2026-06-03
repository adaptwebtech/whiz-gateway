import * as Joi from 'joi';

/**
 * Schema de validação das variáveis de ambiente (NFR-7).
 * A ausência de qualquer env obrigatória falha o bootstrap.
 */
export const configValidationSchema = Joi.object({
  DATABASE_URL: Joi.string().required(),
  RABBITMQ_URL: Joi.string().required(),
  ENV: Joi.string()
    .valid('development', 'staging', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),
  META_VERIFY_TOKEN: Joi.when('ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  META_APP_SECRET: Joi.when('ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  DISPATCH_MAX_RETRIES: Joi.number().default(5),
  DISPATCH_BACKOFF_BASE_MS: Joi.number().default(1000),
  REDIS_URL: Joi.string().required(),
  // strip() remove ADMIN_API_KEY do cache validado para que ConfigService leia
  // process.env ao vivo em cada requisição (necessário para testes e2e).
  ADMIN_API_KEY: Joi.string().required().strip(),
  META_GRAPH_URL: Joi.when('ENV', {
    is: 'production',
    then: Joi.string().uri().required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  META_ACCESS_TOKEN: Joi.when('ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().allow('').optional(),
  }),
});
