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
  META_VERIFY_TOKEN: Joi.string().allow('').optional(),
  META_APP_SECRET: Joi.string().allow('').optional(),
  DISPATCH_MAX_RETRIES: Joi.number().default(5),
  DISPATCH_BACKOFF_BASE_MS: Joi.number().default(1000),
});
