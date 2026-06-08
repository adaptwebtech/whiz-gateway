# Changelog — despacho-mensagens

## 2026-06-08 · hotfix · hotfix-despacho-retries-log

- Sintoma: Default de `DISPATCH_MAX_RETRIES` fixo em `5` e log de tentativa falha sem URL do ambiente nem HTTP status, dificultando diagnóstico em produção.
- Root cause: Fallback literal `'5'` em `dispatch-handler.service.ts` e `Joi.number().default(5)` em `config.validation.ts`; string de log não usava `ambiente.url` nem `(err as AxiosError).response?.status`, ambos disponíveis no escopo do `catch`.
- Fix: Default elevado para `10` em ambos os pontos (Joi schema e fallback do service); mensagem de warn reformatada para `Tentativa X/N falhou para inbox <id> (url: <url>): <AxiosError STATUS>`.
- Arquivos: `src/config/config.validation.ts`, `src/dispatch/dispatch-handler.service.ts`
- REG: REG-1 (10 tentativas sem env definida), REG-2 (log warn com URL e status HTTP em falha 404)
- Triage: docs/fixes/despacho-mensagens-hotfix-despacho-retries-log.md
