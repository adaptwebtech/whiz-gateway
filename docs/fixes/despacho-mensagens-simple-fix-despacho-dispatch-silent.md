# Triage — despacho-mensagens · simple-fix-despacho-dispatch-silent
> Branch: simple-fix  Criado: 2026-06-08

## 1. Sintoma

- Log `"Dispatched inbox"` nunca aparece.
- Nenhum log `"Tentativa X/Y falhou"` durante o ciclo de retry.
- `WebhookService` loga inbox encontrado corretamente: `inbox id=36650ac8, id_ambiente=3, del=false`.
- Usuário relata RabbitMQ "stuck and not consuming" — fila do inbox acumula mensagens sem dreno.
- O despacho parece abortar silenciosamente ANTES do loop de retry.

Stacktrace: nenhum — falha silenciosa (sem exceção capturada nos logs).

## 2. Repro

1. Enviar webhook com payload válido para inbox `36650ac8` (id_ambiente=3).
2. Observar logs: WebhookService confirma inbox encontrado.
3. Nenhum log de dispatch ou retry aparece após a linha do inbox.
4. Fila `inbox.36650ac8` acumula mensagens sem consumo.
5. DLQ `inbox.dead-letter` não recebe entradas novas (descartando hipótese de AMBIENTE_INDISPONIVEL silencioso).

## 3. Root cause

**Arquivo:** `src/dispatch/dispatch-handler.service.ts`, método `getAmbiente()`, linhas 113–123.

**Invariante quebrada:** `getAmbiente()` chama `this.ambienteRepo.findById(id)` diretamente (raw repository), que pode lançar exceção (ex.: erro de conexão com Postgres ou Redis). Quando `redis.get()` ou `ambienteRepo.findById()` lança, a exceção sobe para `handle()` sem nenhum `try/catch` envolvendo a chamada `getAmbiente`. Em `WebhookService`, a chamada é `void this.dispatchHandler.handle(inbox.id, payload)` (linha 47) — o `void` descarta a Promise rejeitada, engolindo a exceção silenciosamente. Resultado: nenhum log de dispatch, nenhum retry, nenhuma entrada no DLQ, fila travada.

**Causa secundária confirmável:** O `handle()` possui `try/catch` apenas DENTRO do loop de retry (linhas 64–109), cobrindo somente erros HTTP. Qualquer exceção lançada fora do loop (nas chamadas `inboxRepo.findById`, `redis.get`, `ambienteRepo.findById`, ou `mq.sendToQueue` no bloco de guarda) escapa sem log e é silenciada pelo `void`.

**Causa agravante:** Não há `logger.warn/error` antes dos `sendToQueue` do bloco de guarda (linhas 35–41 e 46–51), então mesmo quando `sendToQueue` falha (RabbitMQ down), não existe nenhuma evidência nos logs.

## 4. Scope de arquivos

- `src/dispatch/dispatch-handler.service.ts` — envolver `handle()` inteiro em `try/catch` de último recurso; adicionar `logger.warn` antes de cada `sendToQueue` de guarda; logar erro se exceção inesperada escapar.
- `src/webhook/webhook.service.ts` — substituir `void this.dispatchHandler.handle(...)` por `await` + `catch` que loga o erro capturado.

## 5. Behavior delta

**Antes:** Exceção em `getAmbiente()` ou nos `sendToQueue` de guarda escapa silenciosamente via `void`; fila trava sem qualquer log.
**Depois:** Toda exceção dentro de `handle()` é capturada e logada com `logger.error`; `WebhookService` loga se `handle()` rejeitar; fila drena normalmente ou falha de forma observável.

## 6. Risco

- **Baixo** para funcionalidade de despacho — a lógica de retry e dead-letter existente não é alterada.
- **Médio** para `WebhookService` — trocar `void` por `await` dentro de um método que já retorna `Promise<void>` não altera o contrato HTTP (resposta 200 já foi enviada antes), mas muda a ordem de resolução da promise interna; nenhum dado de produção é afetado.
- Sem migrações, sem novos endpoints, sem impacto em outros módulos.

## 7. Plano de teste

- **REG-1:** Dado `ambienteRepo.findById` lançando erro, quando `handle()` é chamado, então `logger.error` é chamado e nenhuma mensagem é silenciosamente descartada.
- **REG-2:** Dado `redis.get` lançando erro, quando `getAmbiente()` é chamado, então a exceção é capturada por `handle()` e logada (não engolida por `void`).
- **REG-3:** Dado `mq.sendToQueue` lançando erro no bloco de guarda (inbox inválido), quando `handle()` processa, então `logger.error` emite entrada antes de rejeitar.
- **REG-4:** Dado `WebhookService.handleIncoming` com dispatch que lança, quando chamado, então `WebhookService` loga o erro capturado e não silencia a Promise.
- **REG-5:** Dado cenário happy-path (ambiente válido, HTTP 2xx), quando `handle()` executa, então log `"Dispatched inbox"` aparece inalterado.
