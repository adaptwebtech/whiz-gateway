import * as crypto from 'crypto';
import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WppFlowCallbacksService } from '../wpp-flow-callbacks/wpp-flow-callbacks.service';
import { FlowEndpointRequestDto } from './dto/flow-endpoint-request.dto';

/**
 * Serviço responsável pela criptografia e encaminhamento do endpoint de Flows.
 * Implementa verificação de assinatura HMAC-SHA256, descriptografia RSA-OAEP + AES-256-GCM
 * e re-criptografia da resposta do cliente com IV invertido.
 */
@Injectable()
export class WppFlowsEndpointService {
  private readonly logger = new Logger(WppFlowsEndpointService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly flowCallbacksService: WppFlowCallbacksService,
  ) {}

  async handle(
    uid: string,
    body: FlowEndpointRequestDto,
    rawBody: Buffer,
    signature: string,
  ): Promise<{ encrypted_flow_data: string }> {
    // 1. Verificar assinatura
    if (!this.verifySignature(rawBody, signature)) {
      throw new UnauthorizedException(
        'Assinatura X-Hub-Signature-256 inválida',
      );
    }

    // 2. Buscar URL do UID
    const url = await this.flowCallbacksService.getUrl(uid);
    if (!url) {
      throw new NotFoundException(`UID não encontrado: ${uid}`);
    }

    // 3. Verificar FLOWS_PRIVATE_KEY
    const privateKey = this.configService.get<string>('FLOWS_PRIVATE_KEY');
    if (!privateKey) {
      throw new ServiceUnavailableException(
        'FLOWS_PRIVATE_KEY não configurado',
      );
    }

    // 4. Descriptografar chave AES via RSA-OAEP
    let aesKey: Buffer;
    try {
      aesKey = this.decryptAesKey(body.encrypted_aes_key);
    } catch {
      this.logger.warn(
        `WppFlowsEndpointService: falha ao descriptografar AES key uid=${uid}`,
      );
      throw new HttpException('Falha ao descriptografar AES key', 421);
    }

    // 5. Descriptografar payload via AES-256-GCM
    let decryptedPayload: object;
    try {
      decryptedPayload = this.decryptPayload(
        body.encrypted_flow_data,
        aesKey,
        body.initial_vector,
      );
    } catch {
      this.logger.warn(
        `WppFlowsEndpointService: falha ao descriptografar payload uid=${uid}`,
      );
      throw new HttpException('Falha ao descriptografar payload', 421);
    }

    const payloadWithAction = decryptedPayload as Record<string, unknown>;

    // 6. Ping → retornar health-check sem chamar cliente
    if (payloadWithAction['action'] === 'ping') {
      const pingResponse = { data: '{"version":"3.0"}' };
      const encrypted = this.encryptResponse(
        pingResponse,
        aesKey,
        body.initial_vector,
      );
      return { encrypted_flow_data: encrypted };
    }

    // 7. Encaminhar para cliente
    let clientResponse: object;
    try {
      clientResponse = await this.forwardToClient(url, decryptedPayload);
    } catch (err) {
      if (err instanceof InternalServerErrorException) {
        throw err;
      }
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      this.logger.error(
        `WppFlowsEndpointService: erro ao encaminhar uid=${uid}: ${message}`,
      );
      throw new InternalServerErrorException(
        `URL do UID retornou erro: ${message}`,
      );
    }

    // 8. Re-criptografar resposta com IV invertido
    const encrypted = this.encryptResponse(
      clientResponse,
      aesKey,
      body.initial_vector,
    );
    return { encrypted_flow_data: encrypted };
  }

  verifySignature(rawBody: Buffer, signature: string): boolean {
    if (!signature) return false;
    const secret = this.configService.get<string>('META_APP_SECRET') ?? '';
    const expected =
      'sha256=' +
      crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signature),
      );
    } catch {
      return false;
    }
  }

  private decryptAesKey(encryptedKey: string): Buffer {
    const pem = this.configService.get<string>('FLOWS_PRIVATE_KEY')!;
    return crypto.privateDecrypt(
      {
        key: pem,
        oaepHash: 'sha256',
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      },
      Buffer.from(encryptedKey, 'base64'),
    );
  }

  private decryptPayload(
    encryptedFlowData: string,
    aesKey: Buffer,
    initialVector: string,
  ): object {
    const buf = Buffer.from(encryptedFlowData, 'base64');
    const authTag = buf.subarray(buf.length - 16);
    const ciphertext = buf.subarray(0, buf.length - 16);
    const iv = Buffer.from(initialVector, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return JSON.parse(decrypted.toString('utf8')) as object;
  }

  private encryptResponse(
    payload: object,
    aesKey: Buffer,
    initialVector: string,
  ): string {
    const iv = Buffer.from(initialVector, 'base64');
    const flippedIv = Buffer.from(iv);
    flippedIv[0] = flippedIv[0] ^ 0x01;
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, flippedIv);
    const plaintext = Buffer.from(JSON.stringify(payload));
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([encrypted, authTag]).toString('base64');
  }

  private async forwardToClient(url: string, payload: object): Promise<object> {
    const token = this.configService.get<string>('META_ACCESS_TOKEN') ?? '';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new InternalServerErrorException(
        `URL do UID retornou status ${response.status}`,
      );
    }
    return response.json() as Promise<object>;
  }
}
