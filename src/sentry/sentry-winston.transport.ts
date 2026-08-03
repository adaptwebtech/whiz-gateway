import * as Sentry from '@sentry/nestjs';
import type { SeverityLevel } from '@sentry/nestjs';
import Transport from 'winston-transport';
import { MARCADOR_SENTRY_IGNORAR } from './sentry.constants';

/** Entrada de log entregue pelo winston ao transport. */
interface EntradaLog {
  level: string;
  message?: unknown;
  optionalParams?: unknown;
}

const NIVEIS_SENTRY: Record<string, SeverityLevel> = {
  error: 'error',
  warn: 'warning',
  info: 'info',
  http: 'info',
  verbose: 'debug',
  debug: 'debug',
  silly: 'debug',
};

/**
 * Ponte Winston → Sentry (FR-12). Todo log vira breadcrumb; log de nível
 * `error` também vira evento, exceto quando marcado como já capturado pelo
 * `GlobalExceptionFilter` (evita evento duplicado).
 */
export class SentryWinstonTransport extends Transport {
  log(entrada: EntradaLog, proximo: () => void): void {
    try {
      if (Sentry.getClient() !== undefined) {
        const nivel = NIVEIS_SENTRY[entrada.level] ?? 'info';
        const mensagem =
          typeof entrada.message === 'string'
            ? entrada.message
            : JSON.stringify(entrada.message);

        Sentry.addBreadcrumb({
          category: 'log',
          level: nivel,
          message: mensagem,
        });

        if (
          entrada.level === 'error' &&
          !SentryWinstonTransport.temMarcador(entrada.optionalParams)
        ) {
          Sentry.captureMessage(mensagem, {
            level: 'error',
            tags: { origem: 'log' },
          });
        }
      }
    } catch {
      // Observabilidade nunca interrompe o pipeline de log (FR-16).
    }

    proximo();
  }

  /**
   * O `LoggerService` repassa os `optionalParams` do Nest como metadado, então
   * o marcador pode chegar solto ou dentro de um array aninhado.
   */
  private static temMarcador(valor: unknown): boolean {
    if (valor === MARCADOR_SENTRY_IGNORAR) {
      return true;
    }
    if (Array.isArray(valor)) {
      return valor.some((item) => SentryWinstonTransport.temMarcador(item));
    }
    return false;
  }
}
