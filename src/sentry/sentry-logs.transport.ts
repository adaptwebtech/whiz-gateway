import { createSentryWinstonTransport } from '@sentry/nestjs';
import Transport from 'winston-transport';
import { NIVEIS_LOG_SENTRY } from './sentry.constants';

/**
 * Transport oficial winston → Sentry Logs (FR-19).
 *
 * Diferente de `SentryWinstonTransport` (que gera breadcrumb e evento/issue),
 * este alimenta a página **Logs** do GlitchTip: mensagem, nível e o restante do
 * metadado do winston como atributos, correlacionados ao rastro pelo `trace_id`.
 * O SDK só emite envelope quando `enableLogs` está ligado, então o transport
 * pode ficar sempre instalado.
 */
export function criarTransportDeLogsSentry(): Transport {
  const TransportDeLogs = createSentryWinstonTransport(Transport, {
    levels: [...NIVEIS_LOG_SENTRY],
  });

  return new TransportDeLogs();
}
