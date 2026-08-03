import * as Sentry from '@sentry/nestjs';
import { construirOpcoesSentry } from './sentry/sentry-options';

/**
 * Bootstrap da instrumentação Sentry/GlitchTip (FR-1).
 *
 * Precisa rodar como efeito de import **antes** do `AppModule`: a
 * auto-instrumentação OpenTelemetry do SDK só consegue patchear http, express,
 * pg, ioredis e amqplib se for instalada antes desses módulos serem carregados.
 * Por isso este é o único lugar do gateway autorizado a ler `process.env`
 * direto — o `ConfigModule` ainda não existe neste ponto (NFR-6 da spec
 * `sentry`).
 */
Sentry.init(construirOpcoesSentry(process.env));
