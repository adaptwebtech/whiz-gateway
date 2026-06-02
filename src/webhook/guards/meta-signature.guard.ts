import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class MetaSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{
      rawBody?: Buffer;
      headers: Record<string, string | string[] | undefined>;
    }>();
    const signature = req.headers['x-hub-signature-256'];
    const rawBody = req.rawBody;

    if (!signature || !rawBody || typeof signature !== 'string') {
      throw new UnauthorizedException('Assinatura ausente ou inválida');
    }

    const secret = this.config.get<string>('META_APP_SECRET') ?? '';
    const expectedHex = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');
    const expectedSig = `sha256=${expectedHex}`;

    // MUST use timingSafeEqual — AC-9
    const a = Buffer.from(signature);
    const b = Buffer.from(expectedSig);
    // Buffers must be same length for timingSafeEqual
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Assinatura inválida');
    }

    return true;
  }
}
