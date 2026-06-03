import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { RedisService } from '../../redis/redis.service';

interface RedisHashEntry {
  hashedKey: string;
  salt: string;
  name: string;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const rawKey = request.headers['x-api-key'];

    if (!rawKey || typeof rawKey !== 'string') {
      throw new UnauthorizedException('Chave de API ausente');
    }

    const entries = await this.redis.hgetall('apikeys:valid');

    if (!entries) {
      throw new UnauthorizedException('Chave de API inválida');
    }

    for (const value of Object.values(entries)) {
      const entry: RedisHashEntry = JSON.parse(value) as RedisHashEntry;
      const computedHash = createHash('sha256')
        .update(rawKey + entry.salt)
        .digest('hex');

      const computedBuf = Buffer.from(computedHash);
      const storedBuf = Buffer.from(entry.hashedKey);

      if (
        computedBuf.length === storedBuf.length &&
        timingSafeEqual(computedBuf, storedBuf)
      ) {
        return true;
      }
    }

    throw new UnauthorizedException('Chave de API inválida');
  }
}
