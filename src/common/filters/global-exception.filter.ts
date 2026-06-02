import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { LoggerService } from '../../logger/logger.service';
import { ErrorResponseDto } from '../dto/error-response.dto';

const MAX_PAYLOAD_BODY_BYTES = 10240;

/**
 * Filtro global de exceções (FR-10/12, NFR-1/3). Resolve status, message e
 * details conforme o flowchart da §11 e registra a falha via LoggerService.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, message } = this.resolve(exception);
    const isProduction = this.configService.get<string>('ENV') === 'production';

    const body: ErrorResponseDto = {
      statusCode,
      timestamp: new Date().toISOString(),
      message,
    };

    if (!isProduction) {
      body.details = this.buildDetails(request, exception);
    }

    const method = request?.method ?? 'UNKNOWN';
    const route = request?.url ?? 'UNKNOWN';
    this.loggerService.error(
      `HTTP ${statusCode} ON ${method} | ${route} - ${message}`,
    );

    response.status(statusCode).json(body);
  }

  private resolve(exception: unknown): {
    statusCode: number;
    message: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      return { statusCode: status, message: this.extractMessage(res) };
    }

    if (exception instanceof Error) {
      return {
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: exception.message,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal Server Error',
    };
  }

  private extractMessage(res: string | object): string {
    if (typeof res === 'string') {
      return res;
    }
    const message = (res as { message?: unknown }).message;
    if (Array.isArray(message)) {
      return message.join(', ');
    }
    if (typeof message === 'string') {
      return message;
    }
    return 'Error';
  }

  private buildDetails(
    request: Request | undefined,
    exception: unknown,
  ): Record<string, unknown> {
    const details: Record<string, unknown> = {};
    if (request) {
      details.headers = request.headers;
      details.params = request.params;
      details.query = request.query;
      if (request.body !== undefined) {
        details.body = this.truncate(request.body);
      }
    }
    if (exception instanceof Error && exception.stack) {
      details.stack = exception.stack;
    }
    return details;
  }

  private truncate(body: unknown): unknown {
    const serialized = JSON.stringify(body);
    if (
      typeof serialized === 'string' &&
      Buffer.byteLength(serialized, 'utf8') > MAX_PAYLOAD_BODY_BYTES
    ) {
      return `${serialized.slice(0, MAX_PAYLOAD_BODY_BYTES)}…`;
    }
    return body;
  }
}
