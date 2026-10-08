import { randomBytes } from 'crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { LoggerService } from '../logger/logger.service';
import {
  HEADERS_REDIGIDOS,
  META_ERROR_LOGS_REPOSITORY,
  OrigemErroMeta,
  PREFIXO_CHAVE_ERRO,
  VALOR_REDIGIDO,
} from './constants/meta-error-logs-tokens.constants';
import { ListMetaErrorLogsQueryDto } from './dto/list-meta-error-logs-query.dto';
import { MetaErrorLogResponseDto } from './dto/meta-error-log-response.dto';
import type { IMetaErrorLogsRepository } from './interfaces/meta-error-logs-repository.interface';
import {
  extrairErrosDeWebhook,
  type ErroDeWebhook,
} from './meta-webhook-errors.extractor';

/**
 * O que o chamador sabe sobre o erro. Nada aqui é truncado: o corpo da Meta é a
 * razão de existir desta tabela.
 */
export interface DadosErroMeta {
  origem: OrigemErroMeta;
  metodo: string;
  subPath: string;
  /**
   * URL absoluta de fato requisitada. Guardá-la ao lado do `subPath` é o que
   * torna visível uma URL montada errado: o primeiro erro que esta tabela
   * capturou em produção foi o `?sig=<mac>` do id de sessão perdido na
   * montagem, e o `subPath` sozinho não mostrava isso.
   */
  url?: string;
  /** `null` em erro de transporte: não houve resposta. */
  status?: number | null;
  /** Código de erro da Meta (131053, 131049…), independente do status HTTP. */
  codigoMeta?: number | null;
  corpo?: unknown;
  /** Headers enviados. A redação dos segredos é feita aqui. */
  requisicao?: Record<string, unknown>;
  jobId?: string | null;
  /** `wamid` da mensagem, nas falhas que a Meta reporta por webhook. */
  referencia?: string | null;
  mensagem?: string | null;
}

/**
 * Guarda inteiro todo erro que a Meta devolve — e toda falha de entrega de
 * callback — sob uma chave curta que é emitida em log no mesmo instante.
 *
 * O motivo: o gateway logava apenas o status (`forwardBinary POST upload:… → 400
 * (Meta error passthrough)`) e jogava o corpo fora. O corpo é o único lugar onde
 * a Meta escreve o que está errado, e sem ele um upload quebrado chegava ao
 * whiz-server como `Timeout aguardando job de upload do gateway: <jobId>`.
 */
@Injectable()
export class MetaErrorLogsService {
  constructor(
    @Inject(META_ERROR_LOGS_REPOSITORY)
    private readonly repo: IMetaErrorLogsRepository,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Chave de busca: curta o bastante para caber numa linha de log e colar numa
   * query, larga o bastante (48 bits) para não colidir dentro da janela de 14
   * dias.
   */
  private novaChave(): string {
    return `${PREFIXO_CHAVE_ERRO}-${randomBytes(6).toString('hex').toUpperCase()}`;
  }

  /**
   * Substitui os headers sensíveis. O log existe para diagnosticar a Meta, não
   * para arquivar credenciais — e estes registros ficam 14 dias no banco.
   */
  private redigir(
    headers?: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (!headers) return undefined;
    const saida: Record<string, unknown> = {};
    for (const [nome, valor] of Object.entries(headers)) {
      saida[nome] = HEADERS_REDIGIDOS.includes(nome.toLowerCase())
        ? VALOR_REDIGIDO
        : valor;
    }
    return saida;
  }

  /**
   * Grava o erro e devolve a chave. Nunca lança: uma falha no banco não pode
   * mudar o resultado da requisição que estava em curso (NFR-1) — devolve
   * `null` e registra o próprio tombo.
   */
  async persistir(dados: DadosErroMeta): Promise<string | null> {
    const chave = this.novaChave();
    try {
      await this.repo.create({
        chave,
        origem: dados.origem,
        metodo: dados.metodo,
        subPath: dados.subPath,
        url: dados.url,
        status: dados.status ?? null,
        codigoMeta: dados.codigoMeta ?? null,
        corpo: dados.corpo,
        requisicao: this.redigir(dados.requisicao),
        jobId: dados.jobId ?? null,
        referencia: dados.referencia ?? null,
        mensagem: dados.mensagem ?? null,
      });
    } catch (err) {
      this.logger.error(
        `Falha ao persistir erro da Meta (origem=${dados.origem} subPath=${dados.subPath}): ${String(err)}`,
      );
      return null;
    }

    this.logger.error(
      `erro da Meta persistido chave=${chave} origem=${dados.origem} status=${String(dados.status ?? 'n/a')} codigoMeta=${String(dados.codigoMeta ?? '-')} subPath=${dados.subPath} jobId=${dados.jobId ?? '-'} referencia=${dados.referencia ?? '-'} url=${dados.url ?? '-'}`,
    );
    return chave;
  }

  /**
   * Persiste os erros embutidos num webhook de ENTRADA da Meta, um registro por
   * erro, e devolve as chaves emitidas.
   *
   * Roda em TODO webhook, e o caso normal é não achar nada: `extrairErrosDeWebhook`
   * devolve lista vazia e isto sai sem tocar no banco. Nunca lança — a ingestão
   * de webhook não pode falhar por causa de um log.
   */
  async persistirErrosDeWebhook(
    payload: Record<string, unknown>,
  ): Promise<string[]> {
    let erros: ErroDeWebhook[];
    try {
      erros = extrairErrosDeWebhook(payload);
    } catch (err) {
      this.logger.error(`Falha ao extrair erros do webhook: ${String(err)}`);
      return [];
    }
    if (erros.length === 0) return [];

    const chaves: string[] = [];
    for (const erro of erros) {
      const chave = await this.persistir({
        origem: 'webhook-status',
        metodo: 'WEBHOOK',
        // Não há URL nem sub-path: a Meta é quem chamou. O que identifica o
        // evento é a WABA e o número.
        subPath: `waba:${erro.wabaId ?? '-'} pid:${erro.pid ?? '-'}`,
        // Sem status HTTP: quem chamou foi a Meta. O código dela vai no campo
        // próprio.
        status: null,
        codigoMeta: erro.codigo ?? null,
        corpo: erro.corpo,
        referencia: erro.referencia ?? null,
        mensagem: erro.resumo,
      });
      if (chave) chaves.push(chave);
    }
    return chaves;
  }

  async findByChave(chave: string): Promise<MetaErrorLogResponseDto> {
    const registro = await this.repo.findByChave(chave);
    if (!registro) {
      throw new NotFoundException(`Nenhum erro da Meta com chave=${chave}.`);
    }
    return registro;
  }

  async findMany(
    filter: ListMetaErrorLogsQueryDto,
  ): Promise<MetaErrorLogResponseDto[]> {
    return this.repo.findMany({
      ...filter,
      limit: filter.limit ?? 50,
      offset: filter.offset ?? 0,
    });
  }
}
