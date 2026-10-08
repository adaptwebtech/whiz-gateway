import * as fs from 'fs';
import * as path from 'path';
import { HttpService } from '@nestjs/axios';
import {
  BadGatewayException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { MetaTokenStore } from '../meta-token/meta-token.store';
import { MetaErrorLogsService } from '../meta-error-logs/meta-error-logs.service';
import { OrigemErroMeta } from '../meta-error-logs/constants/meta-error-logs-tokens.constants';

export interface WppForwardOptions {
  query?: Record<string, string | string[]>;
  body?: unknown;
  headers?: Record<string, string>;
  contentType?: string;
  /**
   * Força o `META_ACCESS_TOKEN` global, ignorando o token por-inbox do contexto.
   * Usado em caminhos que identificam o **app**, não o cliente (ex.: `subscribed_apps`).
   */
  forceAppToken?: boolean;
}

export interface WppForwardResult {
  status: number;
  data: unknown;
  /**
   * Chave do erro persistido em `logs_erros_meta`, quando a chamada falhou.
   * Viaja até o callback de upload para que o erro que o whiz-server propaga ao
   * front traga por onde puxar o corpo inteiro da Meta.
   */
  chaveErro?: string;
}

@Injectable()
export class WppService {
  private readonly logger = new Logger(WppService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly metaTokenStore: MetaTokenStore,
    // `@Optional` de propósito: as suítes que constroem o WppService à mão
    // (e qualquer caminho sem o módulo global carregado) continuam valendo, e a
    // ausência do log nunca pode derrubar um forward.
    @Optional() private readonly erros?: MetaErrorLogsService,
  ) {}

  /**
   * Persiste o erro INTEIRO e devolve a chave. Engole qualquer falha própria:
   * um log que não grava não pode mudar o resultado do forward (NFR-1).
   */
  private async persistirErro(dados: {
    origem: OrigemErroMeta;
    metodo: string;
    subPath: string;
    url?: string;
    status: number | null;
    corpo?: unknown;
    requisicao?: Record<string, unknown>;
    jobId?: string;
    mensagem?: string;
  }): Promise<string | undefined> {
    if (!this.erros) return undefined;
    try {
      return (await this.erros.persistir(dados)) ?? undefined;
    } catch (err) {
      this.logger.error(
        `falha ao persistir erro da Meta (${dados.origem} ${dados.subPath}): ${String(err)}`,
      );
      return undefined;
    }
  }

  /**
   * Resolve o Bearer: token por-inbox do contexto (`X-Meta-Access-Token`) →
   * `META_ACCESS_TOKEN` global (fallback legado). `forceAppToken` sempre usa o global.
   */
  private resolveToken(forceAppToken?: boolean): string {
    const perRequestToken = forceAppToken
      ? undefined
      : this.metaTokenStore.getToken();
    return (
      perRequestToken ?? this.configService.get<string>('META_ACCESS_TOKEN')!
    );
  }

  async forward(
    method: string,
    path: string,
    opts: WppForwardOptions,
  ): Promise<WppForwardResult> {
    const baseUrl = this.configService.get<string>('META_GRAPH_URL')!;
    const token = this.resolveToken(opts.forceAppToken);

    // Normalize: strip leading slash from path to avoid double-slash
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    const url = `${baseUrl}/${normalizedPath}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': opts.contentType ?? 'application/json',
      ...opts.headers,
    };

    this.logger.log(`forward ${method} ${normalizedPath}`);

    try {
      const response = await firstValueFrom(
        this.httpService.request({
          method,
          url,
          params: opts.query ?? undefined,
          data: opts.body,
          headers,
        }),
      );
      this.logger.log(
        `forward ${method} ${normalizedPath} → ${response.status}`,
      );
      return { status: response.status, data: response.data };
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.response) {
        // Meta returned an HTTP error (4xx/5xx) — pass through transparently
        const chaveErro = await this.persistirErro({
          origem: 'forward',
          metodo: method,
          subPath: normalizedPath,
          url,
          status: axiosErr.response.status,
          corpo: axiosErr.response.data,
          requisicao: headers,
        });
        this.logger.log(
          `forward ${method} ${normalizedPath} → ${axiosErr.response.status} (Meta error passthrough) chaveErro=${chaveErro ?? '-'}`,
        );
        return {
          status: axiosErr.response.status,
          data: axiosErr.response.data,
          chaveErro,
        };
      }
      // Transport error (timeout, network) → 502
      await this.persistirErro({
        origem: 'forward',
        metodo: method,
        subPath: normalizedPath,
        url,
        status: null,
        requisicao: headers,
        mensagem: String(err),
      });
      this.logger.error(
        `forward ${method} ${normalizedPath} → transport error: ${String(err)}`,
      );
      throw new BadGatewayException(
        'Erro de transporte ao contatar a Meta API',
      );
    }
  }

  /**
   * Repassa o upload de mídia à Meta.
   *
   * `filename` e `mediaType` vêm do multipart ORIGINAL e precisam sobreviver à
   * viagem pela fila. O job só guarda o arquivo num tmp cujo nome é o `jobId` —
   * um UUID **sem extensão** — e remontar o form com esse nome fazia a Meta
   * recusar o áudio depois de aceitá-lo:
   *
   *   131053 Media upload error
   *   "Audio file uploaded with mimetype as audio/mp4, however on processing it
   *    is of type application/octet-stream. Please choose a different file."
   *
   * Ou seja: a Meta lê o `Content-Type` da parte (audio/mp4), mas ao processar o
   * arquivo cai em `application/octet-stream` porque não tem nem extensão no nome
   * nem o campo `type` para confirmar. Os dois vinham do whiz-server e eram
   * descartados aqui.
   */
  async forwardMultipart(
    subPath: string,
    tmpFilePath: string,
    contentType: string,
    messagingProduct: string,
    filename?: string,
    mediaType?: string,
    jobId?: string,
  ): Promise<WppForwardResult> {
    const fileBuffer = await fs.promises.readFile(tmpFilePath);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FormData = require('form-data') as typeof import('form-data');
    const form = new FormData();
    form.append('messaging_product', messagingProduct);
    // `type` é o campo que a Meta usa para confirmar o mime do arquivo. Só é
    // enviado quando veio do cliente — inventar um valor aqui seria pior que
    // omitir, porque passaria a discordar do `Content-Type` da parte.
    if (mediaType) form.append('type', mediaType);
    form.append('file', fileBuffer, {
      // Fallback no basename do tmp (o jobId) só para jobs antigos, enfileirados
      // antes deste campo existir; o caminho normal usa o nome original.
      filename: filename || path.basename(tmpFilePath),
      contentType,
    });

    const baseUrl = this.configService.get<string>('META_GRAPH_URL')!;
    const token = this.resolveToken();
    const normalizedPath = subPath.startsWith('/') ? subPath.slice(1) : subPath;
    const url = `${baseUrl}/${normalizedPath}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      ...(form.getHeaders() as Record<string, string>),
    };

    this.logger.log(`forwardMultipart POST ${normalizedPath}`);
    try {
      const response = await firstValueFrom(
        this.httpService.request({
          method: 'POST',
          url,
          data: form,
          headers,
        }),
      );
      this.logger.log(
        `forwardMultipart POST ${normalizedPath} → ${response.status}`,
      );
      return { status: response.status, data: response.data };
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.response) {
        const chaveErro = await this.persistirErro({
          origem: 'forwardMultipart',
          metodo: 'POST',
          subPath: normalizedPath,
          url,
          status: axiosErr.response.status,
          corpo: axiosErr.response.data,
          requisicao: { ...headers, filename, type: mediaType },
          jobId,
        });
        this.logger.log(
          `forwardMultipart POST ${normalizedPath} → ${axiosErr.response.status} (Meta error passthrough) chaveErro=${chaveErro ?? '-'}`,
        );
        return {
          status: axiosErr.response.status,
          data: axiosErr.response.data,
          chaveErro,
        };
      }
      await this.persistirErro({
        origem: 'forwardMultipart',
        metodo: 'POST',
        subPath: normalizedPath,
        url,
        status: null,
        requisicao: { ...headers, filename, type: mediaType },
        jobId,
        mensagem: String(err),
      });
      this.logger.error(
        `forwardMultipart POST ${normalizedPath} → transport error: ${String(err)}`,
      );
      throw new BadGatewayException(
        'Erro de transporte ao contatar a Meta API',
      );
    }
  }

  async forwardBinary(
    subPath: string,
    tmpFilePath: string,
    contentType: string,
    fileOffset: string,
    jobId?: string,
  ): Promise<WppForwardResult> {
    const fileBuffer = await fs.promises.readFile(tmpFilePath);
    const baseUrl = this.configService.get<string>('META_GRAPH_URL')!;
    const token = this.resolveToken();
    const normalizedPath = subPath.startsWith('/') ? subPath.slice(1) : subPath;
    const url = `${baseUrl}/${normalizedPath}`;

    // `file_offset` é obrigatório para a Meta. Nunca deixar o valor viajar
    // vazio: axios omite um header `undefined`, e a Meta responde 400 sem dizer
    // qual parâmetro faltou. Quem resolve a origem do valor é o controller.
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
      file_offset: fileOffset || '0',
    };

    this.logger.log(`forwardBinary POST ${normalizedPath}`);
    try {
      const response = await firstValueFrom(
        this.httpService.request({
          method: 'POST',
          url,
          data: fileBuffer,
          headers,
        }),
      );
      this.logger.log(
        `forwardBinary POST ${normalizedPath} → ${response.status}`,
      );
      return { status: response.status, data: response.data };
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.response) {
        const chaveErro = await this.persistirErro({
          origem: 'forwardBinary',
          metodo: 'POST',
          subPath: normalizedPath,
          url,
          status: axiosErr.response.status,
          corpo: axiosErr.response.data,
          requisicao: { ...headers, tamanhoEmBytes: String(fileBuffer.length) },
          jobId,
        });
        this.logger.log(
          `forwardBinary POST ${normalizedPath} → ${axiosErr.response.status} (Meta error passthrough) chaveErro=${chaveErro ?? '-'}`,
        );
        return {
          status: axiosErr.response.status,
          data: axiosErr.response.data,
          chaveErro,
        };
      }
      await this.persistirErro({
        origem: 'forwardBinary',
        metodo: 'POST',
        subPath: normalizedPath,
        url,
        status: null,
        requisicao: { ...headers, tamanhoEmBytes: String(fileBuffer.length) },
        jobId,
        mensagem: String(err),
      });
      this.logger.error(
        `forwardBinary POST ${normalizedPath} → transport error: ${String(err)}`,
      );
      throw new BadGatewayException(
        'Erro de transporte ao contatar a Meta API',
      );
    }
  }
}
