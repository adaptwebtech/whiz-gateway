import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

@Injectable()
export class AdminKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Chave de administrador ausente ou inválida',
      );
    }

    const token = authHeader.slice(7);
    const adminKey = this.config.getOrThrow<string>('ADMIN_API_KEY');

    const tokenBuf = Buffer.from(token);
    const adminBuf = Buffer.from(adminKey);

    if (tokenBuf.length !== adminBuf.length) {
      throw new UnauthorizedException('Chave de administrador inválida');
    }

    if (!timingSafeEqual(tokenBuf, adminBuf)) {
      throw new UnauthorizedException('Chave de administrador inválida');
    }

    return true;
  }
}
