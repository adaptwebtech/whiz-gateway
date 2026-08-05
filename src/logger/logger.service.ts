import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLogger, format, Logger, transports } from 'winston';
import { criarTransportDeLogsSentry } from '../sentry/sentry-logs.transport';
import { SentryWinstonTransport } from '../sentry/sentry-winston.transport';

/**
 * LoggerService baseado em Winston (feature `sentry`):
 *
 * - console (colorido em desenvolvimento, JSON em produção);
 * - `SentryWinstonTransport` — breadcrumb de todo log e evento/issue para nível
 *   `error`;
 * - transport oficial de Sentry Logs — a página *Logs* do GlitchTip, restrita
 *   aos níveis de `NIVEIS_LOG_SENTRY`.
 */
@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly logger: Logger;

  constructor(private readonly configService: ConfigService) {
    const env = this.configService.get<string>('ENV') ?? 'development';
    const isProduction = env === 'production';

    this.logger = createLogger({
      level: 'info',
      format: isProduction
        ? format.combine(format.timestamp(), format.json())
        : format.combine(
            format.timestamp(),
            format.colorize(),
            format.printf(({ level, message, timestamp, stack }) => {
              const text = (stack as string) ?? (message as string);
              return `${String(timestamp)} ${level}: ${text}`;
            }),
          ),
      transports: [
        new transports.Console(),
        new SentryWinstonTransport(),
        criarTransportDeLogsSentry(),
      ],
    });
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.info(this.stringify(message), ...this.meta(optionalParams));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.error(this.stringify(message), ...this.meta(optionalParams));
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.warn(this.stringify(message), ...this.meta(optionalParams));
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.debug(this.stringify(message), ...this.meta(optionalParams));
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.verbose(this.stringify(message), ...this.meta(optionalParams));
  }

  private stringify(message: unknown): string {
    return typeof message === 'string' ? message : JSON.stringify(message);
  }

  /**
   * Só repassa metadado quando há parâmetros extras (FR-20): o transport de
   * logs transforma cada campo do metadado em atributo, e `optionalParams: []`
   * poluiria todo log com um atributo vazio.
   */
  private meta(
    optionalParams: unknown[],
  ): [] | [{ optionalParams: unknown[] }] {
    return optionalParams.length > 0 ? [{ optionalParams }] : [];
  }
}
