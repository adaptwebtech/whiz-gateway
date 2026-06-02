import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLogger, format, Logger, transports } from 'winston';

/**
 * LoggerService baseado em Winston, transport de console apenas (OQ-3).
 * Colorido em desenvolvimento, JSON em produção.
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
      transports: [new transports.Console()],
    });
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.info(this.stringify(message), { optionalParams });
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.error(this.stringify(message), { optionalParams });
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.warn(this.stringify(message), { optionalParams });
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.debug(this.stringify(message), { optionalParams });
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.verbose(this.stringify(message), { optionalParams });
  }

  private stringify(message: unknown): string {
    return typeof message === 'string' ? message : JSON.stringify(message);
  }
}
