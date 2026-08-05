import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as Sentry from '@sentry/nestjs';
import {
  MAX_AMOSTRAS_POR_DISTRIBUICAO,
  NOME_TRANSACAO_SNAPSHOT,
} from './sentry.constants';

/** Atributos de uma métrica (baixa cardinalidade). */
export type AtributosMetrica = Record<string, string | number>;

interface Distribuicao {
  amostras: number[];
  total: number;
}

interface JanelaMetricas {
  contadores: Map<string, number>;
  distribuicoes: Map<string, Distribuicao>;
}

/**
 * Agregador de métricas em memória. O GlitchTip não documenta ingestão da API
 * de trace metrics, então o caminho garantido é a transação sintética
 * `whiz.metrics.snapshot`, emitida a cada minuto com os agregados da janela
 * (FR-15). As chamadas a `Sentry.metrics.*` seguem em paralelo (no-op quando
 * `enableMetrics` é `false`) para o caso de o backend ingerir.
 */
@Injectable()
export class SentryMetricsService {
  private readonly logger = new Logger(SentryMetricsService.name);

  private janela: JanelaMetricas = SentryMetricsService.janelaVazia();

  /** Incrementa um contador da janela. */
  contar(nome: string, atributos: AtributosMetrica = {}, valor = 1): void {
    const chave = SentryMetricsService.chave(nome, atributos);
    const atual = this.janela.contadores.get(chave) ?? 0;
    this.janela.contadores.set(chave, atual + valor);

    this.executarComProtecao(() => {
      Sentry.metrics.count(nome, valor, { attributes: atributos });
    });
  }

  /** Registra uma duração (ms) em uma distribuição da janela. */
  registrarDuracao(
    nome: string,
    duracaoMs: number,
    atributos: AtributosMetrica = {},
  ): void {
    const chave = SentryMetricsService.chave(nome, atributos);
    const distribuicao = this.janela.distribuicoes.get(chave) ?? {
      amostras: [],
      total: 0,
    };

    distribuicao.total += 1;
    if (distribuicao.amostras.length < MAX_AMOSTRAS_POR_DISTRIBUICAO) {
      distribuicao.amostras.push(duracaoMs);
    }
    this.janela.distribuicoes.set(chave, distribuicao);

    this.executarComProtecao(() => {
      Sentry.metrics.distribution(nome, duracaoMs, {
        unit: 'millisecond',
        attributes: atributos,
      });
    });
  }

  /** Valor instantâneo (sem agregação de janela). */
  definirGauge(
    nome: string,
    valor: number,
    unidade?: string,
    atributos: AtributosMetrica = {},
  ): void {
    this.executarComProtecao(() => {
      Sentry.metrics.gauge(nome, valor, {
        unit: unidade,
        attributes: atributos,
      });
    });
  }

  /**
   * Emite a janela corrente como transação de snapshot e começa uma janela
   * nova. Amostragem forçada em 1 pelo `tracesSampler`.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  emitirSnapshot(): void {
    const janela = this.janela;
    this.janela = SentryMetricsService.janelaVazia();

    const atributos = this.montarAtributos(janela);

    if (!this.estaHabilitado()) {
      return;
    }

    try {
      Sentry.startNewTrace(() => {
        Sentry.startSpan(
          {
            name: NOME_TRANSACAO_SNAPSHOT,
            op: 'metrics.snapshot',
            forceTransaction: true,
            attributes: atributos,
          },
          () => undefined,
        );
      });
    } catch (erro: unknown) {
      this.logger.warn(
        `Falha ao emitir snapshot de métricas ao Sentry: ${String(erro)}`,
      );
    }
  }

  private montarAtributos(
    janela: JanelaMetricas,
  ): Record<string, number | string> {
    const atributos: Record<string, number | string> = {};

    for (const [chave, valor] of janela.contadores) {
      atributos[`contador.${chave}`] = valor;
    }

    for (const [chave, distribuicao] of janela.distribuicoes) {
      const ordenadas = [...distribuicao.amostras].sort((a, b) => a - b);
      atributos[`dist.${chave}.total`] = distribuicao.total;
      atributos[`dist.${chave}.p50`] = SentryMetricsService.percentil(
        ordenadas,
        0.5,
      );
      atributos[`dist.${chave}.p95`] = SentryMetricsService.percentil(
        ordenadas,
        0.95,
      );
      atributos[`dist.${chave}.max`] = ordenadas[ordenadas.length - 1] ?? 0;
    }

    const memoria = process.memoryUsage();
    atributos['gauge.processo.rss_bytes'] = memoria.rss;
    atributos['gauge.processo.heap_usado_bytes'] = memoria.heapUsed;
    atributos['gauge.processo.uptime_s'] = Math.round(process.uptime());

    this.definirGauge('gateway.processo.rss', memoria.rss, 'byte');
    this.definirGauge('gateway.processo.heap_usado', memoria.heapUsed, 'byte');

    return atributos;
  }

  private estaHabilitado(): boolean {
    try {
      return Sentry.getClient() !== undefined;
    } catch {
      return false;
    }
  }

  private executarComProtecao(acao: () => void): void {
    if (!this.estaHabilitado()) {
      return;
    }
    try {
      acao();
    } catch (erro: unknown) {
      this.logger.warn(`Falha ao registrar métrica no Sentry: ${String(erro)}`);
    }
  }

  private static janelaVazia(): JanelaMetricas {
    return { contadores: new Map(), distribuicoes: new Map() };
  }

  private static chave(nome: string, atributos: AtributosMetrica): string {
    const pares = Object.keys(atributos)
      .sort()
      .map((chave) => `${chave}=${String(atributos[chave])}`);
    return pares.length > 0 ? `${nome}|${pares.join(',')}` : nome;
  }

  /** Percentil por rank mais próximo (amostras já ordenadas). */
  private static percentil(ordenadas: number[], fracao: number): number {
    if (ordenadas.length === 0) {
      return 0;
    }
    const indice = Math.min(
      ordenadas.length - 1,
      Math.max(0, Math.ceil(fracao * ordenadas.length) - 1),
    );
    return ordenadas[indice];
  }
}
