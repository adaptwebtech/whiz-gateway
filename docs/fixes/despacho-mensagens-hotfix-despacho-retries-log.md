# Triage — despacho-mensagens · hotfix-despacho-retries-log
> Branch: hotfix  Criado: 2026-06-08
> ✅ Hotfix aplicado 2026-06-08. REG inline. Backfill em Phase 4.

## 1. Sintoma

Dois problemas independentes em `DispatchHandlerService`:

1. O default de `DISPATCH_MAX_RETRIES` está fixo em `'5'` tanto no fallback do `config.get` (linha 52) quanto no schema Joi (`config.validation.ts` linha 24). O usuário quer o default elevado para `10`.
2. O log de tentativa falha (linha 69–71) usa apenas `attempt`, `maxRetries` e `inboxId`. Falta a URL alvo (`ambiente.url`) e o HTTP status code da resposta (`err.response.status`), impedindo diagnóstico rápido em produção.

Formato desejado pelo usuário:
```
Tentativa X/10 falhou para inbox Y (url: Z): AxiosError 404
```

Sem stacktrace — issue identificado por inspeção de código + requisição direta do usuário.

## 2. Repro

1. Iniciar gateway sem definir `DISPATCH_MAX_RETRIES` no env.
2. Publicar mensagem em `inbox.<id>` apontando para ambiente que responde 503.
3. Observar logs: com o bug, o handler esgota após 5 tentativas e o warn não contém URL nem status HTTP.
4. Após o fix: handler executa 10 tentativas; cada warn exibe `(url: <ambiente.url>)` e o código HTTP da resposta.

## 3. Root cause

**Problema A — default hardcoded:**
- `src/dispatch/dispatch-handler.service.ts` linha 52: `this.config.get<string>('DISPATCH_MAX_RETRIES') ?? '5'` — fallback literal `'5'`.
- `src/config/config.validation.ts` linha 24: `Joi.number().default(5)` — default Joi também `5`.
- Os dois pontos precisam mudar para `10` para consistência (Joi controla o valor real em runtime via `ConfigService`; o fallback na service é segunda linha de defesa).

**Problema B — log incompleto:**
- `src/dispatch/dispatch-handler.service.ts` linhas 69–71: o bloco `catch` tem acesso a `ambiente.url` (em escopo) e ao objeto `err`. O HTTP status pode ser extraído via `(err as AxiosError).response?.status` — a tipagem `AxiosError` de `axios` (já dependência transitiva de `@nestjs/axios`) expõe `response.status` diretamente.
- A string de log não usa essas variáveis disponíveis.

## 4. Scope de arquivos

- `src/dispatch/dispatch-handler.service.ts` — fallback do `config.get` (linha 52) + mensagem de log (linhas 69–71)
- `src/config/config.validation.ts` — `Joi.number().default(5)` (linha 24)

## 5. Behavior delta

| Aspecto | Antes | Depois |
|---|---|---|
| Tentativas máximas (sem env) | 5 | 10 |
| Formato do log warn | `Tentativa X/5 falhou para inbox Y: <err>` | `Tentativa X/10 falhou para inbox Y (url: Z): AxiosError <STATUS>` |
| Dado disponível no log | apenas `attempt`, `maxRetries`, `inboxId` | `attempt`, `maxRetries`, `inboxId`, `ambiente.url`, HTTP status code |

## 6. Risco

- **Baixo.** Elevar o default de retries aumenta a latência máxima antes do dead-letter (de ~31s para ~1023s com base 1s), mas não altera a lógica de ack/nack nem a estrutura do dead-letter. O comportamento é o mesmo com `DISPATCH_MAX_RETRIES` explícito no env — apenas o fallback muda.
- Sem risco de regressão em rotas HTTP: o módulo não tem endpoints próprios.

## 7. Plano de teste

- **REG-1:** Com `DISPATCH_MAX_RETRIES` ausente do env, confirmar que o serviço executa exatamente 10 tentativas antes de enviar para DLQ (mockar `ambiente.url` retornando 503 em todas as tentativas; contar chamadas ao `HttpService.post`).
- **REG-2:** Em cenário de falha HTTP 404, confirmar que o log `warn` contém a URL do ambiente e o status `404` (spy em `logger.warn`, verificar que a string inclui `(url: <url>)` e `404`).

## Retrospectiva do incidente

- **Detecção:** Identificado por inspeção direta de código durante revisão de configurações de produção — sem alarme ou log de produção associado.
- **Mitigação:** Correção aplicada diretamente nos dois pontos de configuração (`config.validation.ts` e `dispatch-handler.service.ts`); sem necessidade de rollback de dados ou intervenção em fila.
- **Lições:** (1) Defaults de variáveis de configuração críticas devem ter fonte única de verdade — o Joi schema é authoritative; o fallback manual no service é segunda linha de defesa e deve espelhar o mesmo valor. (2) Logs de retry em handlers de fila devem incluir contexto suficiente para diagnóstico imediato (URL de destino + status HTTP) — reduz MTTR em incidentes de integração.
