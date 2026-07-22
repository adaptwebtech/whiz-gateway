# Guia de Uso do Gateway

> **O que é**: proxy multi-tenant de webhooks da Meta. Recebe eventos
> (WhatsApp, Instagram, Messenger), descobre para **qual ambiente** (servidor
> whiz-v2) cada evento pertence e **repassa o payload** para lá.
> **Sem prefixo global** — todas as rotas ficam na raiz. Swagger em `GET /docs`,
> painel admin em `GET /ui`.

---

## 1. Modelo mental (em 30 segundos)

```
Meta  ──POST /webhook*──►  Gateway  ──resolve pid──►  inbox  ──id_ambiente──►  ambiente.url  ──►  servidor whiz-v2
                             │                                                                        (development / staging / production)
                             └── falhou? → fila_mensagens_mortas (DLQ)
```

Duas entidades governam tudo:

| Entidade    | O que é                                                        | Chave         |
|-------------|----------------------------------------------------------------|---------------|
| **ambiente**| Destino lógico (`development`/`staging`/`production`), tem `url` base | `id` fixo (int) |
| **inbox**   | Correlaciona um `pid` (identificador Meta) a um `id_ambiente`  | `pid` único   |

**Resolução = `pid` do webhook → inbox → `inbox.id_ambiente` → `ambiente.url`.**
Definir o ambiente é, portanto, dois passos: **(1)** criar o ambiente com sua
`url`; **(2)** criar a inbox que aponta o `pid` para aquele ambiente.

---

## 2. Autenticação

| Recurso        | Guard                | Header                                   |
|----------------|----------------------|------------------------------------------|
| `/ambientes/*` | `AdminKeyGuard`      | `Authorization: Bearer <ADMIN_API_KEY>`  |
| `/inboxes/*`   | `AdminOrApiKeyGuard` | `Authorization: Bearer <ADMIN_API_KEY>` **ou** `x-api-key: <chave>` |
| `/webhook*`    | (Meta) ou nenhum     | ver §5 — assinatura HMAC / verify token  |

`ADMIN_API_KEY` vem do `.env`. As `x-api-key` são criadas em `/api-keys`.

---

## 3. Como definir o ambiente (passo a passo com exemplos)

### 3.1 Criar o ambiente

`POST /ambientes` — `id` é **fixo** (você escolhe, não é autoincrement).
Campos: `id` (int ≥1), `nome` (string), `url` (URL base do servidor destino).

```bash
curl -X POST https://gateway.exemplo.com/ambientes \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": 1,
    "nome": "development",
    "url": "https://dev.2.whiz.net.br"
  }'
```

Convenção usual de `id`: `1=development`, `2=staging`, `3=production` (livre —
o que importa é a inbox referenciar o `id` certo).

Outras operações:

```bash
# Listar ambientes ativos
curl https://gateway.exemplo.com/ambientes -H "Authorization: Bearer $ADMIN_API_KEY"

# Trocar a url (ex.: novo host do servidor) — invalida o cache Redis? Ver §6
curl -X PATCH https://gateway.exemplo.com/ambientes/1 \
  -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{"url": "https://dev2.2.whiz.net.br"}'

# Soft-delete (del=true; para de resolver, não apaga)
curl -X DELETE https://gateway.exemplo.com/ambientes/1 -H "Authorization: Bearer $ADMIN_API_KEY"

# Testar o endpoint (verifica se a url do ambiente está de pé)
# reachable=true se respondeu qualquer HTTP (mesmo 4xx/5xx); false em rede/timeout
curl https://gateway.exemplo.com/ambientes/1/test -H "Authorization: Bearer $ADMIN_API_KEY"
# → {"url":"...","reachable":true,"status":200,"elapsedMs":143,"error":null}
```

### 3.2 Apontar uma inbox para o ambiente

`POST /inboxes` — cria a correlação `pid → id_ambiente`.
Campos: `id_ambiente` (int), `pid` (string única), `nome` (string).

**O `pid` DEVE ser o identificador que a Meta manda no webhook** (ver §5.3):

| Canal                              | `pid` a cadastrar                          |
|------------------------------------|--------------------------------------------|
| WhatsApp                           | `phone_number_id` (o PNID do número)       |
| Instagram (Facebook Login)         | IGID = `entry[0].id`                        |
| Instagram Login (OAuth direto)     | IGID = `entry[0].id`                        |
| Messenger (página Facebook)        | Page ID = `entry[0].id`                     |

```bash
# WhatsApp: pid = phone_number_id
curl -X POST https://gateway.exemplo.com/inboxes \
  -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{ "id_ambiente": 1, "pid": "109876543210987", "nome": "WhatsApp Dev" }'

# Instagram Login: pid = IGID (entry[0].id)
curl -X POST https://gateway.exemplo.com/inboxes \
  -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{ "id_ambiente": 1, "pid": "17841400000000000", "nome": "Instagram Dev" }'
```

Pronto: qualquer webhook cujo `pid` seja `109876543210987` agora resolve para
o ambiente `1` → `https://dev.2.whiz.net.br`.

---

## 4. Rotas de ingestão (o que a Meta chama)

Todas em `POST` (evento) + `GET` (handshake de verificação). **Sem prefixo.**

| Rota                        | Canal                         | Guard HMAC        | Verify token (GET) |
|-----------------------------|-------------------------------|-------------------|--------------------|
| `/webhook`                  | **WhatsApp**                  | `META_APP_SECRET` | `META_VERIFY_TOKEN`|
| `/webhook/instagram`        | Instagram (Facebook Login)    | ❌ (passthrough)   | `META_VERIFY_TOKEN`|
| `/webhook/instagram-login`  | **Instagram Login** (OAuth)   | ❌ (passthrough)   | `IG_VERIFY_TOKEN`  |
| `/webhook/messenger`        | Messenger (página FB)         | ❌ (passthrough)   | `META_VERIFY_TOKEN`|

> ⚠️ **`/webhook` (raiz) é SÓ WhatsApp.** Ele valida a assinatura com
> `META_APP_SECRET`. Se um app Meta **diferente** (ex.: Instagram Login, que é
> um app separado com secret próprio) entregar na raiz `/webhook`, o HMAC não
> confere → **401 `Assinatura inválida`**. Instagram Login **tem** que ir em
> `POST /webhook/instagram-login`. Configure o Callback URL certo no painel Meta.

---

## 5. Como as rotas são resolvidas DEPOIS que o ambiente está definido

Dois fluxos, com uma diferença crucial no **destino**.

### 5.1 WhatsApp — `POST /webhook`

1. `MetaSignatureGuard` valida `X-Hub-Signature-256` com `META_APP_SECRET`.
   Falhou → **401** (e, se o corpo tiver forma Meta, vai para mensagens mortas
   com status `ASSINATURA_INVALIDA`).
2. Extrai `pid` de `entry[0].changes[0].value.metadata.phone_number_id`.
3. `inboxRepo.findByPid(pid)` → inbox. Não achou → DLQ `INBOX_NAO_REGISTRADA`.
4. `DispatchHandlerService.handle(inbox.id, payload)`:
   - Faz fan-out para `redirecionamentos-webhooks` (redirects extras por PID).
   - Resolve `ambiente = getAmbiente(inbox.id_ambiente)` (cache Redis, TTL 3600s).
   - **`POST {ambiente.url}`** (a **url base, sem sub-caminho**) com o JSON, com
     retry exponencial (`DISPATCH_MAX_RETRIES`/`DISPATCH_BACKOFF_BASE_MS`).
   - Headers: `x-callback-secret: <CALLBACK_SECRET>`.

> **Destino WhatsApp = `ambiente.url` exatamente.** A `url` do ambiente já é o
> endpoint que recebe o webhook de WhatsApp no servidor.

### 5.2 Instagram / Messenger — `POST /webhook/{instagram|instagram-login|messenger}`

1. **Sem HMAC no gateway** (passthrough) — o controller responde **200 na hora**
   (fire-and-forget). A re-verificação da assinatura acontece no servidor.
2. Extrai `pid` de `entry[0].id` (IGID para Instagram, Page ID para Messenger).
   Ausente → DLQ `INBOX_NAO_REGISTRADA`.
3. `inboxRepo.findByPid(pid)` → inbox. Não achou/`del` → DLQ.
4. `forward(subPath, inbox, rawBody, signature)`:
   - Resolve `ambiente` (mesmo cache Redis).
   - **`POST {ambiente.url}{subPath}`** — a url base **+ sub-caminho fixo** pela
     rota de ingestão:

     | Rota de ingestão            | `subPath` no destino          |
     |-----------------------------|-------------------------------|
     | `/webhook/instagram`        | `/webhooks/instagram`         |
     | `/webhook/instagram-login`  | `/webhooks/instagram-login`   |
     | `/webhook/messenger`        | `/webhooks/messenger`         |

   - Repassa o **corpo cru** (bytes originais, sem reserializar) + os headers
     `x-hub-signature-256` (original) e `x-callback-secret`. Preservar os bytes
     é o que permite o servidor validar o HMAC com `IG_APP_SECRET`/`FB_APP_SECRET`.

> **Destino Instagram/Messenger = `ambiente.url` + sub-caminho fixo da rota.**

### 5.3 Tabela-resumo de resolução

| Rota de ingestão            | Fonte do `pid`                                    | Destino final                          | HMAC no gateway |
|-----------------------------|---------------------------------------------------|----------------------------------------|-----------------|
| `POST /webhook`             | `entry[0].changes[0].value.metadata.phone_number_id` | `{ambiente.url}`                     | ✅ `META_APP_SECRET` |
| `POST /webhook/instagram`   | `entry[0].id`                                     | `{ambiente.url}/webhooks/instagram`    | ❌ passthrough |
| `POST /webhook/instagram-login` | `entry[0].id`                                 | `{ambiente.url}/webhooks/instagram-login` | ❌ passthrough |
| `POST /webhook/messenger`   | `entry[0].id`                                     | `{ambiente.url}/webhooks/messenger`    | ❌ passthrough |

---

## 6. Cache do ambiente (pegadinha ao trocar a `url`)

`getAmbiente(id)` lê primeiro do Redis (`ambiente:<id>`, TTL **3600s**). Ao
fazer `PATCH /ambientes/:id` para trocar a `url`, a resolução pode continuar
usando a `url` antiga **até 1h** (até o cache expirar). Para valer na hora,
invalide/limpe a chave `ambiente:<id>` no Redis após o PATCH.

---

## 7. Quando a entrega falha → mensagens mortas (DLQ)

Falhas caem na tabela `fila_mensagens_mortas` (via fila RabbitMQ
`inbox.dead-letter`). Status possíveis (`StatusFalhaMensagem`):

| Status                  | Quando                                                        |
|-------------------------|--------------------------------------------------------------|
| `INBOX_NAO_REGISTRADA`  | `pid` ausente no payload, ou nenhuma inbox para o `pid`       |
| `AMBIENTE_INDISPONIVEL` | inbox ok mas ambiente `del`/inalcançável (sem resposta HTTP)  |
| `FALHA_ENVIO`           | destino respondeu com erro HTTP após esgotar os retries       |
| `NACK_RECEBIDO`         | inbox some entre resolução e despacho                         |
| `ASSINATURA_INVALIDA`   | HMAC divergente em `POST /webhook` com corpo em forma Meta     |

Operações (auth `x-api-key`):

```bash
# Listar mensagens mortas
curl https://gateway.exemplo.com/dead-letter -H "x-api-key: $API_KEY"

# Reenviar: re-posta o payload persistido ao ambiente resolvido pela inbox e
# marca reenviado=true. Destino = url base do ambiente (não reconstrói o subPath
# de Instagram/Messenger). 400 se faltar payload/inbox/ambiente.
curl -X POST https://gateway.exemplo.com/dead-letter/<id>/resend -H "x-api-key: $API_KEY"

# Excluir (soft-delete)
curl -X DELETE https://gateway.exemplo.com/dead-letter/<id> -H "x-api-key: $API_KEY"
```

---

## 8. Exemplo ponta-a-ponta (WhatsApp, ambiente novo)

```bash
export GW=https://gateway.exemplo.com
export ADMIN_API_KEY=...   # do .env do gateway

# 1) Cria o ambiente de staging apontando para o servidor de staging
curl -X POST $GW/ambientes -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":2,"nome":"staging","url":"https://staging.2.whiz.net.br"}'

# 2) Registra a inbox: o phone_number_id do número WhatsApp → ambiente 2
curl -X POST $GW/inboxes -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id_ambiente":2,"pid":"109876543210987","nome":"WhatsApp Staging"}'

# 3) No painel da Meta (app WhatsApp): Callback URL = https://gateway.exemplo.com/webhook
#    Verify token = META_VERIFY_TOKEN. App secret do app = META_APP_SECRET do gateway.

# 4) Pronto. Toda mensagem daquele número:
#    Meta → POST $GW/webhook → pid 109876543210987 → ambiente 2
#         → POST https://staging.2.whiz.net.br
```

Para **Instagram Login**, os passos 1–2 são iguais (só o `pid` é o IGID); no
passo 3 o Callback URL é `https://gateway.exemplo.com/webhook/instagram-login`
e o verify token é `IG_VERIFY_TOKEN` (app Instagram separado).

---

## 9. Variáveis de ambiente relevantes

| Var                        | Uso                                                        |
|----------------------------|------------------------------------------------------------|
| `ADMIN_API_KEY`            | Bearer para `/ambientes` e `/inboxes`                      |
| `META_APP_SECRET`          | HMAC de `POST /webhook` (WhatsApp)                         |
| `META_VERIFY_TOKEN`        | handshake GET de `/webhook`, `/webhook/instagram`, `/webhook/messenger` |
| `IG_VERIFY_TOKEN`          | handshake GET de `/webhook/instagram-login`               |
| `CALLBACK_SECRET`          | header `x-callback-secret` enviado ao servidor destino     |
| `DISPATCH_MAX_RETRIES`     | tentativas de forward (default 10)                         |
| `DISPATCH_BACKOFF_BASE_MS` | base do backoff exponencial (default 1000ms)              |
| `DATABASE_URL` / `RABBITMQ_URL` / `REDIS_URL` | infra                                    |

---

## 10. Referências no código

| Assunto                 | Arquivo                                              |
|-------------------------|------------------------------------------------------|
| Ingestão WhatsApp       | `src/webhook/webhook.controller.ts` · `webhook.service.ts` |
| Guard HMAC              | `src/webhook/guards/meta-signature.guard.ts`         |
| Despacho WhatsApp       | `src/dispatch/dispatch-handler.service.ts`           |
| Ingestão Instagram/Messenger | `src/instagram-webhook/instagram-webhook.controller.ts` · `instagram-webhook.service.ts` |
| Forward passthrough     | `src/instagram-webhook/instagram-webhook-forwarder.service.ts` |
| Ambientes (CRUD)        | `src/ambiente/`                                       |
| Inboxes (CRUD)          | `src/inbox/`                                          |
| Mensagens mortas        | `src/dead-letter/`                                   |
