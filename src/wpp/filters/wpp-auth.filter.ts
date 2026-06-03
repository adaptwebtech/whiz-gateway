import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';

/**
 * Filtro de exceção para o módulo WPP.
 * Converte ForbiddenException (403) em UnauthorizedException (401)
 * para manter a semântica correta de autenticação por API Key.
 */
@Catch(ForbiddenException)
export class WppAuthFilter implements ExceptionFilter {
  catch(_exception: ForbiddenException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const unauthorized = new UnauthorizedException(
      'Chave de API ausente ou inválida',
    );
    response.status(unauthorized.getStatus()).json(unauthorized.getResponse());
  }
}
