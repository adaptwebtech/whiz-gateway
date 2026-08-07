# Resolução de webhook por WABA

## 1. Context

O gateway resolve a inbox de um webhook de WhatsApp por
`entry[0].changes[0].value.metadata.phone_number_id` (`WebhookService.extractPid`). Isso cobre
`messages` e `message_echoes` — e **só**.

Metade dos webhooks que a Meta manda para uma WABA descreve a **conta**, não uma mensagem:
`account_update`, `phone_number_quality_update`, `message_template_status_update`,
`message_template_quality_update`, `message_template_components_update`, `account_review_update`,
`account_alerts`, `business_capability_update`, `template_category_update`, `user_preferences`,
`payment_configuration_update`, `phone_number_name_update`. Nenhum deles tem `value.metadata`.

Resultado hoje: **todos vão para a fila de mensagens mortas** com status
`INBOX_NAO_REGISTRADA`, e o servidor nunca fica sabendo de queda de qualidade, mudança de limite,
template reprovado ou restrição de conta. O handler de `message_template_status_update` que existe no
whiz-server nunca é acionado em produção.

Esta spec adiciona o segundo caminho de resolução: `entry[0].id`, que na Cloud API é o **id da
WABA**.

## 2. Scope

**In:**
- Coluna `inboxes.waba_id` (nullable, **não** única) + índice.
- `waba_id` em `CreateInboxDto`, `UpdateInboxDto` e `InboxResponseDto`.
- `IInboxRepository.findByWabaId`.
- `WebhookService`: resolução em dois passos (pid → WABA).
- Painel `/ui` e `docs/GUIA-GATEWAY.md` sincronizados.

**Out:**
- Rotas `/webhook/{instagram,instagram-login,messenger}`: já resolvem por `entry[0].id` como `pid`,
  não precisam de fallback.
- Interpretar o conteúdo dos eventos — quem faz isso é o whiz-server.
- Backfill de `waba_id` nas inboxes já cadastradas (o servidor reenvia o registro ao reconectar;
  enquanto isso, o comportamento é o de hoje).

## 3. Glossary

- **WABA**: WhatsApp Business Account. Agrupa números; é o objeto que a Meta assina para webhook.
- **Evento de nível WABA**: mudança que descreve a conta/template/número, sem `metadata`.
- **`pid`**: identificador que o gateway usa como chave da inbox (para WhatsApp, o
  `phone_number_id`).

## 4. Functional requirements

- **FR-1**: `inboxes` aceita `waba_id` opcional na criação e na atualização, e o devolve na resposta.
- **FR-2**: `waba_id` **não** é único — uma WABA tem vários números.
- **FR-3**: `POST /webhook` resolve primeiro por `pid`; não achando, por `waba_id = entry[0].id`.
- **FR-4**: nenhum dos dois resolveu → DLQ `INBOX_NAO_REGISTRADA` (comportamento atual preservado).
- **FR-5**: WABA com inboxes em ambientes divergentes → `warn` em log, e usa a mais antiga.
- **FR-6**: reviver uma inbox soft-deletada preserva o `waba_id` já registrado, salvo se um novo for
  informado.

## 5. Non-functional

- **NFR-1**: a consulta por WABA só acontece quando a resolução por pid falha — zero custo extra no
  caminho quente (`messages`).
- **NFR-2**: migration aditiva e idempotente.
- **NFR-3**: painel `/ui` e `GUIA-GATEWAY.md` atualizados no mesmo PR (regra de sincronia do repo).

## 6. Data model

```sql
ALTER TABLE "inboxes" ADD COLUMN IF NOT EXISTS "waba_id" TEXT;
CREATE INDEX IF NOT EXISTS "inboxes_waba_id_idx" ON "inboxes"("waba_id");
```

## 7. API contract

- `POST /inboxes` — campo novo opcional `waba_id: string`.
- `PATCH /inboxes/:id` — idem.
- Respostas de inbox passam a incluir `waba_id: string | null` (7 campos, era 6).

## 8. Acceptance criteria

- **AC-1** — *Given* um payload de nível WABA (sem `metadata`, com `entry[0].id` de WABA
  registrada), *when* `POST /webhook`, *then* a inbox é resolvida pela WABA e o payload é
  despachado; nada vai para a DLQ. Vale para qualquer `field`, inclusive um que a Meta ainda não
  documentou.
- **AC-2** — *Given* um payload de nível WABA cuja WABA não está registrada, *then* DLQ
  `INBOX_NAO_REGISTRADA`.
- **AC-3** — *Given* um payload com `pid` que resolve, *then* `findByWabaId` **não** é chamado
  (o pid tem precedência).
- **AC-4** — *Given* um payload com `pid` **não** registrado mas com WABA registrada, *then* cai no
  fallback e despacha.
- **AC-5** — *Given* `POST /inboxes` com `waba_id`, *then* o valor é persistido e devolvido na
  resposta (agora com 7 campos).
