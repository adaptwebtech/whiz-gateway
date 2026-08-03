import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable, tap } from 'rxjs';
import { METRICAS } from './sentry.constants';
import { SentryMetricsService } from './sentry-metrics.service';

/**
 * Recorte tipado da requisição express: `Request['route']` é `any` no @types/express,
 * o que derrubaria as regras de type-safety do lint.
 */
interface RequisicaoComRota {
  method?: string;
  url?: string;
  route?: { path?: string };
}

/**
 * Interceptor global de métricas HTTP: contagem por rota/método/classe de
 * status e distribuição de latência, tanto em sucesso quanto em erro (FR-13).
 */
@Injectable()
export class SentryHttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: SentryMetricsService) {}

  intercept(
    contexto: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    if (contexto.getType() !== 'http') {
      return next.handle();
    }

    const http = contexto.switchToHttp();
    const requisicao = http.getRequest<RequisicaoComRota>();
    const metodo = requisicao.method ?? 'UNKNOWN';
    const rota = SentryHttpMetricsInterceptor.resolverRota(requisicao);
    const inicio = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const resposta = http.getResponse<Response>();
          this.registrar(rota, metodo, resposta?.statusCode ?? 200, inicio);
        },
        error: (erro: unknown) => {
          const status = erro instanceof HttpException ? erro.getStatus() : 500;
          this.registrar(rota, metodo, status, inicio);
        },
      }),
    );
  }

  private registrar(
    rota: string,
    metodo: string,
    status: number,
    inicio: number,
  ): void {
    this.metrics.contar(METRICAS.httpRequisicao, {
      rota,
      metodo,
      classe_status: `${Math.floor(status / 100)}xx`,
    });
    this.metrics.registrarDuracao(METRICAS.httpDuracao, Date.now() - inicio, {
      rota,
      metodo,
    });
  }

  /**
   * Prefere o padrão de rota do express (`/inboxes/:id`) para não explodir a
   * cardinalidade com ids concretos; cai para a URL sem query string.
   */
  private static resolverRota(requisicao: RequisicaoComRota): string {
    const padrao = requisicao.route?.path;
    if (typeof padrao === 'string' && padrao.length > 0) {
      return padrao;
    }
    const url = requisicao.url ?? '';
    return url.split('?')[0] || '/';
  }
}
