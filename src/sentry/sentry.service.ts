import { Injectable, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { SeverityLevel } from '@sentry/nestjs';
import { ROTAS_DE_INGESTAO } from './sentry.constants';

/** Contexto HTTP de uma exceção tratada pelo filtro global. */
export interface ContextoExcecaoHttp {
  statusCode: number;
  metodo: string;
  rota: string;
}

/**
 * Fachada do SDK Sentry. Concentra a política de captura (FR-10) e garante que
 * nenhuma falha do SDK escape para o fluxo da requisição (FR-16).
 */
@Injectable()
export class SentryService {
  private readonly logger = new Logger(SentryService.name);

  /** `true` quando o SDK foi inicializado com DSN e está habilitado. */
  estaHabilitado(): boolean {
    try {
      return Sentry.getClient() !== undefined;
    } catch {
      return false;
    }
  }

  /**
   * Captura conforme a política: 5xx como exceção, 401/403 de rota de ingestão
   * como aviso, demais 4xx não geram evento.
   */
  capturarExcecaoHttp(excecao: unknown, contexto: ContextoExcecaoHttp): void {
    const { statusCode, metodo, rota } = contexto;
    const tags = {
      rota,
      metodo,
      status: String(statusCode),
    };

    if (statusCode >= 500) {
      this.executarComProtecao(() => {
        Sentry.captureException(excecao, { level: 'error', tags });
      });
      return;
    }

    if (
      (statusCode === 401 || statusCode === 403) &&
      this.ehRotaDeIngestao(rota)
    ) {
      const mensagem = `HTTP ${statusCode} em rota de ingestão ${metodo} ${rota}: ${this.descrever(excecao)}`;
      this.executarComProtecao(() => {
        Sentry.captureMessage(mensagem, { level: 'warning', tags });
      });
    }
  }

  /** Evento avulso (fora do ciclo de exceção HTTP). */
  capturarMensagem(
    mensagem: string,
    nivel: SeverityLevel = 'info',
    tags: Record<string, string> = {},
  ): void {
    this.executarComProtecao(() => {
      Sentry.captureMessage(mensagem, { level: nivel, tags });
    });
  }

  /** Migalha de contexto anexada ao próximo evento do escopo. */
  adicionarBreadcrumb(
    mensagem: string,
    nivel: SeverityLevel = 'info',
    categoria = 'gateway',
  ): void {
    this.executarComProtecao(() => {
      Sentry.addBreadcrumb({
        category: categoria,
        level: nivel,
        message: mensagem,
      });
    });
  }

  /** Descarrega a fila de envelopes no encerramento (FR-17). */
  async descarregar(timeoutMs: number): Promise<void> {
    if (!this.estaHabilitado()) {
      return;
    }
    try {
      await Sentry.flush(timeoutMs);
    } catch (erro: unknown) {
      this.logger.warn(`Falha ao descarregar eventos Sentry: ${String(erro)}`);
    }
  }

  private ehRotaDeIngestao(rota: string): boolean {
    return ROTAS_DE_INGESTAO.some((prefixo) => rota.startsWith(prefixo));
  }

  private descrever(excecao: unknown): string {
    return excecao instanceof Error ? excecao.message : String(excecao);
  }

  private executarComProtecao(acao: () => void): void {
    if (!this.estaHabilitado()) {
      return;
    }
    try {
      acao();
    } catch (erro: unknown) {
      this.logger.warn(`Falha ao enviar evento ao Sentry: ${String(erro)}`);
    }
  }
}
