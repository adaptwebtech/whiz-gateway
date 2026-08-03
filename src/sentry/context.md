# Contexto — sentry

Observabilidade do gateway: erros, rastros de performance e métricas enviados ao
GlitchTip (backend compatível com o protocolo Sentry).

## Linguagem ubíqua

- **DSN**: credencial de ingestão do projeto (`http://<chave>@<host>/<projeto>`).
  Pública por design — identifica o projeto, não autoriza leitura. _Avoid_:
  "token do Sentry".
- **Evento**: item de erro/mensagem que vira _issue_ no GlitchTip. _Avoid_: log
  (log é a linha de console; só o nível `error` se torna evento).
- **Breadcrumb**: migalha de contexto anexada ao próximo evento do escopo; não
  gera issue por si.
- **Transação**: span raiz de um rastro — uma requisição HTTP ou o snapshot de
  métricas. É o que alimenta a aba de performance.
- **Amostragem**: fração de transações enviadas. Base `SENTRY_TRACES_SAMPLE_RATE`
  (1%); o `tracesSampler` decide caso a caso.
- **Snapshot de métricas**: transação sintética `whiz.metrics.snapshot`, emitida
  a cada 60s com os agregados da janela como atributos. É o caminho que entrega
  números no GlitchTip. _Avoid_: trace metrics (a API `Sentry.metrics.*`, que o
  GlitchTip descarta).
- **Janela**: intervalo de agregação em memória (60s) de contadores e
  distribuições, por réplica.
- **Rota de ruído**: rota sem valor de observabilidade (`/health`, `/docs`,
  `/ui`), amostrada em 0.
- **Rota de ingestão**: `/webhook*`, onde um `401`/`403` indica configuração
  errada de app Meta e por isso vira evento de nível `warning`.
- **Marcador de log ignorado**: `MARCADOR_SENTRY_IGNORAR`, passado nos
  `optionalParams` de um log `error` já capturado pelo filtro global, para a
  ponte Winston não duplicar o evento.

## Símbolos

| Símbolo | Arquivo | Papel |
|---|---|---|
| `construirOpcoesSentry` | `sentry-options.ts` | Função pura env → `NodeOptions`. |
| `construirAmostradorDeRastros` | `sentry-options.ts` | `tracesSampler`: 1 no snapshot, 0 em ruído, base no resto. |
| `criarIntegracoesSentry` | `sentry-options.ts` | Remove `ProcessSession` e reinstala `httpIntegration` sem sessões. |
| `escrubarEventoSentry` | `sentry-options.ts` | `beforeSend`: filtra headers sensíveis. |
| `SentryService` | `sentry.service.ts` | Política de captura + `flush`; nunca propaga falha do SDK. |
| `SentryMetricsService` | `sentry-metrics.service.ts` | Janela de métricas + `emitirSnapshot()` (`@Cron` de 1 min). |
| `SentryHttpMetricsInterceptor` | `sentry-http-metrics.interceptor.ts` | `APP_INTERCEPTOR`: contagem e latência por rota/método/classe de status. |
| `SentryWinstonTransport` | `sentry-winston.transport.ts` | Transport Winston → breadcrumb + evento de nível `error`. |
| `SentryModule` | `sentry.module.ts` | `@Global`; importa `SentryModule.forRoot()` do SDK e faz o flush no shutdown. |
| `METRICAS` | `sentry.constants.ts` | Nomes das métricas do gateway. |

## Relações

- `src/instrument.ts` chama `Sentry.init` como efeito de import, antes do
  `AppModule` — única exceção autorizada a ler `process.env` direto.
- `LoggerService` (módulo `logger`) adiciona `SentryWinstonTransport` aos
  transports do Winston.
- `GlobalExceptionFilter` (módulo `common`) injeta `SentryService`.
- `DispatchHandlerService` (módulo `dispatch`) injeta `SentryMetricsService`.
- Sinais que o GlitchTip não ingere (sessões, Sentry Logs, trace metrics) ficam
  desligados por padrão.
