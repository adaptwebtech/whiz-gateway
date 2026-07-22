import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StatusFalhaMensagem } from '@prisma/client';
import * as crypto from 'crypto';
import { LoggerService } from '../../logger/logger.service';
import { DLQ_NAME } from '../../rabbitmq/constants/rabbitmq-queue.constants';
import { RABBITMQ_SERVICE } from '../../rabbitmq/constants/rabbitmq-tokens.constants';
import type { IRabbitMQService } from '../../rabbitmq/interfaces/rabbitmq-service.interface';

/** Número de caracteres do prefixo da assinatura expostos no log (nunca a assinatura inteira). */
const SIGNATURE_LOG_PREFIX_LEN = 12;

@Injectable()
export class MetaSignatureGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
    @Inject(RABBITMQ_SERVICE) private readonly mq: IRabbitMQService,
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
      this.persistToDeadLetter(rawBody);
      throw new UnauthorizedException('Assinatura inválida');
    }

    return true;
  }

  /**
   * Persiste a entrega rejeitada por HMAC divergente em `fila_mensagens_mortas`
   * via DLQ (AC-5), para que falhas de assinatura deixem rastro recuperável. Só
   * enfileira quando o corpo cru tem forma de webhook Meta (`object` + `entry[]`)
   * — evita poluir a fila com probes/forjas (AC-6). Fire-and-forget: a falha de
   * enfileiramento é logada mas nunca bloqueia o 401 (AC-7). `id_inbox` é nulo:
   * a inbox não é resolvida antes do guard.
   */
  private persistToDeadLetter(rawBody: Buffer): void {
    const payload = this.parseMetaShaped(rawBody);
    if (payload === null) {
      return;
    }
    void this.mq
      .sendToQueue(DLQ_NAME, {
        message: payload,
        id_inbox: null,
        status: StatusFalhaMensagem.ASSINATURA_INVALIDA,
      })
      .catch((err: unknown) => {
        this.logger.error(
          `Falha ao enfileirar entrega de assinatura inválida na DLQ: ${String(err)}`,
        );
      });
  }

  /**
   * Faz parse do corpo cru e retorna o objeto apenas se tiver forma de webhook
   * Meta (`object: string` + `entry: []`). Caso contrário retorna `null`.
   */
  private parseMetaShaped(rawBody: Buffer): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(rawBody.toString('utf8')) as unknown;
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        typeof (parsed as { object?: unknown }).object === 'string' &&
        Array.isArray((parsed as { entry?: unknown }).entry)
      ) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // corpo não-JSON — não é webhook Meta
    }
    return null;
  }

  /**
   * Monta o log de diagnóstico de HMAC divergente sem vazar o secret (AC-3/AC-8):
   * expõe apenas o prefixo da assinatura recebida, o tamanho do corpo cru e se
   * o `META_APP_SECRET` está configurado. Inclui a dica de causa-raiz mais
   * provável (AC-4): entrega assinada por um app Meta diferente do configurado
   * — tipicamente Instagram Login, que deve chegar em outra rota.
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
      `metaAppSecretConfigurado=${secret.length > 0}. ` +
      'Causa provável: a entrega foi assinada por um app Meta diferente do ' +
      'configurado em META_APP_SECRET. Instagram Login é um app Meta separado ' +
      '(app secret próprio) e deve chegar em POST /webhook/instagram-login ' +
      '(passthrough, sem este guard — o servidor re-verifica a assinatura), ' +
      'não em POST /webhook. Verifique o Callback URL do app no painel Meta.'
    );
  }
}
