import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { LoggerService } from '../../logger/logger.service';

/** Número de caracteres do prefixo da assinatura expostos no log (nunca a assinatura inteira). */
const SIGNATURE_LOG_PREFIX_LEN = 12;

@Injectable()
export class MetaSignatureGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{
      rawBody?: Buffer;
      headers: Record<string, string | string[] | undefined>;
    }>();
    const signature = req.headers['x-hub-signature-256'];
    const rawBody = req.rawBody;

    if (!signature || typeof signature !== 'string') {
      this.logger.warn(
        'Falha de assinatura no webhook Meta (POST /webhook): ' +
          'causa=assinatura-ausente — header X-Hub-Signature-256 ausente ou não-string.',
      );
      throw new UnauthorizedException('Assinatura ausente');
    }

    if (!rawBody || rawBody.length === 0) {
      this.logger.warn(
        'Falha de assinatura no webhook Meta (POST /webhook): ' +
          'causa=corpo-cru-ausente — rawBody vazio ou ausente (verificar bodyParser rawBody no bootstrap).',
      );
      throw new UnauthorizedException('Corpo da requisição ausente');
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
      this.logger.warn(this.buildMismatchLog(signature, rawBody, secret));
      throw new UnauthorizedException('Assinatura inválida');
    }

    return true;
  }

  /**
   * Monta o log de diagnóstico de HMAC divergente sem vazar o secret (AC-3/AC-8):
   * expõe apenas o prefixo da assinatura recebida, o tamanho do corpo cru e se
   * o `META_APP_SECRET` está configurado.
   */
  private buildMismatchLog(
    signature: string,
    rawBody: Buffer,
    secret: string,
  ): string {
    const signaturePrefix = signature.slice(0, SIGNATURE_LOG_PREFIX_LEN);
    return (
      'Falha de assinatura no webhook Meta (POST /webhook): causa=hmac-divergente. ' +
      `rawBodyBytes=${rawBody.length} ` +
      `assinaturaPrefix=${signaturePrefix} ` +
      `metaAppSecretConfigurado=${secret.length > 0}.`
    );
  }
}
