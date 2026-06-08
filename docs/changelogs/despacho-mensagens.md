# Changelog — despacho-mensagens

## 2026-06-08 · hotfix · hotfix-despacho-retries-log

- Sintoma: Default de `DISPATCH_MAX_RETRIES` fixo em `5` e log de tentativa falha sem URL do ambiente nem HTTP status, dificultando diagnóstico em produção.
- Root cause: Fallback literal `'5'` em `dispatch-handler.service.ts` e `Joi.number().default(5)` em `config.validation.ts`; string de log não usava `ambiente.url` nem `(err as AxiosError).response?.status`, ambos disponíveis no escopo do `catch`.
- Fix: Default elevado para `10` em ambos os pontos (Joi schema e fallback do service); mensagem de warn reformatada para `Tentativa X/N falhou para inbox <id> (url: <url>): <AxiosError STATUS>`.
- Arquivos: `src/config/config.validation.ts`, `src/dispatch/dispatch-handler.service.ts`
- REG: REG-1 (10 tentativas sem env definida), REG-2 (log warn com URL e status HTTP em falha 404)
- Triage: docs/fixes/despacho-mensagens-hotfix-despacho-retries-log.md

## 2026-06-08 · simple-fix · simple-fix-despacho-dispatch-silent

- Sintoma: Log `"Dispatched inbox"` nunca aparecia; despacho abortava silenciosamente sem nenhum log de retry ou erro; fila do inbox acumulava mensagens sem dreno.
- Root cause: `handle()` não possuía `try/catch` externo — exceção em `getAmbiente()` (redis/repo) escapava sem log; `WebhookService` chamava `void handle()`, descartando silenciosamente a Promise rejeitada.
- Fix: Adicionado `try/catch` externo em `handle()` com `logger.error` para toda exceção inesperada; adicionados `logger.warn` antes de cada `sendToQueue` nos blocos de guarda (inbox nulo/del e ambiente nulo/del); `WebhookService` substituiu `void handle()` por `.catch(err => logger.error(...))`.
- Arquivos: `src/dispatch/dispatch-handler.service.ts`, `src/webhook/webhook.service.ts`
- REG: REG-1, REG-2, REG-3, REG-4, REG-5
- Triage: docs/fixes/despacho-mensagens-simple-fix-despacho-dispatch-silent.md
