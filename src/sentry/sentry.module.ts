import { Global, Module, OnApplicationShutdown } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { SentryModule as SentryNestModule } from '@sentry/nestjs/setup';
import { TIMEOUT_FLUSH_MS } from './sentry.constants';
import { SentryHttpMetricsInterceptor } from './sentry-http-metrics.interceptor';
import { SentryMetricsService } from './sentry-metrics.service';
import { SentryService } from './sentry.service';

/**
 * Módulo global de observabilidade. `SentryNestModule.forRoot()` liga a
 * instrumentação Nest do SDK (nomes de transação, spans de controller);
 * `SentryHttpMetricsInterceptor` entra como interceptor global.
 *
 * O `Sentry.init` em si vive em `src/instrument.ts`, carregado antes do Nest.
 */
@Global()
@Module({
  imports: [SentryNestModule.forRoot()],
  providers: [
    SentryService,
    SentryMetricsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: SentryHttpMetricsInterceptor,
    },
  ],
  exports: [SentryService, SentryMetricsService],
})
export class SentryModule implements OnApplicationShutdown {
  constructor(private readonly sentryService: SentryService) {}

  async onApplicationShutdown(): Promise<void> {
    await this.sentryService.descarregar(TIMEOUT_FLUSH_MS);
  }
}
