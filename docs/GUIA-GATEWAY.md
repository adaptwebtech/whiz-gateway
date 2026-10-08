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

> **WhatsApp tem um segundo caminho de resolução.** Os webhooks que descrevem a
> **conta** (qualidade do número, limite de mensagens, status de template, review…) não
> trazem `phone_number_id`. Para eles a resolução é pela **WABA** (`entry[0].id` →
> `inbox.waba_id`). Por isso toda inbox de WhatsApp deve cadastrar `waba_id` — ver §3.2.

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
Campos: `id_ambiente` (int), `pid` (string única), `nome` (string),
`waba_id` (string, **opcional**).

> **`waba_id` — cadastre em toda inbox de WhatsApp.** Metade dos webhooks da Meta
> (`account_update`, `phone_number_quality_update`, `message_template_status_update`,
> `message_template_quality_update`, `account_review_update`, …) descreve a **conta**, não
> uma mensagem, e por isso **não traz `phone_number_id`**. Sem `waba_id` cadastrado esses
> eventos não têm como ser resolvidos e vão todos para mensagens mortas como
> `INBOX_NAO_REGISTRADA`. Ver §5.1.
>
> Ele **não é único**: uma WABA tem vários números, logo várias inboxes — todas com o mesmo
> `waba_id` e, obrigatoriamente, o mesmo `id_ambiente`.

**O `pid` DEVE ser o identificador que a Meta manda no webhook** (ver §5.3):

| Canal                              | `pid` a cadastrar                          |
|------------------------------------|--------------------------------------------|
| WhatsApp                           | `phone_number_id` (o PNID do número)       |
| Instagram (Facebook Login)         | IGID = `entry[0].id`                        |
| Instagram Login (OAuth direto)     | IGID = `entry[0].id`                        |
| Messenger (página Facebook)        | Page ID = `entry[0].id`                     |

```bash
# WhatsApp: pid = phone_number_id, waba_id = a WABA dona do número
curl -X POST https://gateway.exemplo.com/inboxes \
  -H "Authorization: Bearer $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{ "id_ambiente": 1, "pid": "109876543210987", "nome": "WhatsApp Dev", "waba_id": "1613119706411328" }'

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
2. Resolve a inbox em **dois passos**, do mais para o menos específico:
   1. `pid` = `entry[0].changes[0].value.metadata.phone_number_id` →
      `inboxRepo.findByPid(pid)`.
   2. **Fallback:** `waba_id` = `entry[0].id` → `inboxRepo.findByWabaId(wabaId)`.
   Nenhum dos dois resolveu → DLQ `INBOX_NAO_REGISTRADA`.
3. **Por que o fallback existe:** os webhooks que descrevem a CONTA
   (`account_update`, `phone_number_quality_update`, `message_template_status_update`,
   `message_template_quality_update`, `account_review_update`, `account_alerts`,
   `business_capability_update`, `template_category_update`, `user_preferences`, …) não
   têm `value.metadata` — logo, não têm `phone_number_id`. Antes deste fallback **todos
   eles morriam na DLQ**. Se a WABA tiver inboxes em ambientes diferentes (cadastro
   inconsistente), o gateway registra um `warn` e usa a mais antiga.
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
| `POST /webhook`             | `entry[0].changes[0].value.metadata.phone_number_id`, com fallback para `waba_id` = `entry[0].id` | `{ambiente.url}`                     | ✅ `META_APP_SECRET` |
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

## 7.1 Quando a Meta recusa → erros persistidos (`/meta-error-logs`)

A DLQ cobre o caminho **de entrada** (webhook que não chegou ao ambiente). O
caminho **de saída** — uma chamada do gateway à Meta que volta 4xx/5xx — tem
tabela própria: `logs_erros_meta`.

Antes, esse erro só existia como uma linha de log com o status:

```
forwardBinary POST upload:MTphdHRhY2htZW50Oj… → 400 (Meta error passthrough)
```

O corpo — o único lugar onde a Meta escreve o motivo — ia para o lixo. Hoje a
linha de log traz uma **chave**, e o registro inteiro fica no banco por 14 dias:

```
erro da Meta persistido chave=ERRMETA-A1B2C3D4E5F6 origem=forwardBinary status=400 subPath=upload:MTph… jobId=ce15210a-…
```

Cada registro guarda: `origem` (`forward`, `forwardMultipart`, `forwardBinary`
ou `callback`), `metodo`, `sub_path`, **`url`** (a rota ABSOLUTA de fato
requisitada — `sub_path` é o que o caller pediu, `url` é o que saiu do processo),
`status` (`null` em erro de transporte), `corpo` (resposta da Meta **inteira**,
sem truncar), `requisicao` (headers enviados, com `Authorization`, `x-api-key` e
afins substituídos por `[REDACTED]`), `job_id` do upload assíncrono e
`mensagem`.

A `url` é o campo que resolve URL montada errado de cara. O primeiro erro que
esta tabela capturou em produção foi um `HMAC check failed! … mac=` cuja causa
era o `?sig=` do id de sessão ausente na URL final — invisível no `sub_path`,
óbvio na `url`.

Operações (auth `x-api-key`):

```bash
# Abrir um erro pela chave que apareceu no log (ou no `chaveErro` do callback)
curl https://gateway.exemplo.com/meta-error-logs/ERRMETA-A1B2C3D4E5F6 -H "x-api-key: $API_KEY"

# Listar os mais recentes (default 50, máx 200)
curl "https://gateway.exemplo.com/meta-error-logs?origem=forwardBinary&limit=20" -H "x-api-key: $API_KEY"

# Todos os erros de um job de upload
curl "https://gateway.exemplo.com/meta-error-logs?job_id=ce15210a-5da8-4aa7-a662-d55771b47169" -H "x-api-key: $API_KEY"
```

Ou direto no banco:

```sql
SELECT * FROM logs_erros_meta WHERE chave = 'ERRMETA-A1B2C3D4E5F6';
```

**Retenção:** 14 dias, por cron de hard delete às 03:30
(`MetaErrorLogsCleanupService`). Não há soft-delete: o registro desaparece.

**No upload assíncrono**, a chave também viaja no callback. Um job que falha
manda ao `callback_url`:

```json
{ "jobId": "ce15210a-…", "status": "failed",
  "error": { "error": { "message": "(#100) …" }, "chaveErro": "ERRMETA-A1B2C3D4E5F6" } }
```

— então a chave chega até a mensagem que o whiz-server propaga ao front, e dá
para ir do erro na tela ao corpo inteiro da Meta em uma requisição.

### `file_offset` no upload resumível: use query param

`POST /wpp/uploads/:uploadId` aceita o offset por **query param**:

```bash
curl -X POST "https://gateway.exemplo.com/wpp/uploads/upload:MTph…?file_offset=0&callback_url=https://servidor/cb" \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/octet-stream" \
  --data-binary @arquivo.pdf
```

O header `file_offset` continua aceito (e `file-offset`/`x-file-offset`), mas
**não é confiável**: o gateway é alcançado pela internet através de um reverse
proxy nginx, e nginx descarta headers com underscore por padrão
(`underscores_in_headers off`). Com o header comido no proxy, o gateway assume
`"0"` e emite um `warn` dizendo isso. Mande por query param.

### ⚠️ O id de sessão leva um `?sig=` — mande em `upload_session`

O id que a Meta devolve em `POST /app/uploads` **não é path-safe**:

```
upload:MTphdHRhY2htZW50Ojc5MjVkMDRk?sig=ARZqAApVPDDNjMlPTpM
       └─ base64 do payload ───────┘ └─ HMAC da sessão ────┘
```

Interpolar isso no path e anexar `?callback_url=…` produz uma URL com **dois
`?`**. O Express corta no primeiro: o sig se perde e o `callback_url` é engolido
como parte do valor de `sig`. A Meta responde

```
400 {"debug_info":{"type":"ParameterValidationError","message":"HMAC check failed! sessionId=upload:… mac="}}
```

e, sem `callback_url`, o resultado do job nunca volta — o caller vê timeout.

Mande o id COMPLETO em `upload_session`, em **base64url**:

```bash
SESSION='upload:MTph…==?sig=ARZqAApVPDDNjMlPTpM'
UPLOAD_SESSION=$(printf %s "$SESSION" | basenc --base64url | tr -d '=')
TOKEN="${SESSION%%\?*}"   # parte antes do '?', só para log/correlação

curl -X POST "https://gateway.exemplo.com/wpp/uploads/$TOKEN?upload_session=$UPLOAD_SESSION&file_offset=0&callback_url=https://servidor/cb" \
  -H "x-api-key: $API_KEY" -H "Content-Type: application/octet-stream" \
  --data-binary @arquivo.pdf
```

base64url (`[A-Za-z0-9-_]`) não tem `?`, `%` nem `+` — atravessa qualquer proxy e
qualquer parser de query string sem ser reescrito.

O path param continua aceito. Se vier sem `?sig=`, o gateway usa do mesmo jeito e
emite `warn` avisando que a Meta vai recusar. `upload_session` que não decodifique
para `upload:…` → `400`, sem job enfileirado.

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
| `SENTRY_DSN`               | DSN do GlitchTip (default: projeto 2 em `31.97.27.185:30808`) |
| `SENTRY_ENABLED`           | `false` desliga o SDK por completo (default `true`)   |
| `SENTRY_TRACES_SAMPLE_RATE`| fração de transações enviadas (default `0.01` = 1%)   |
| `SENTRY_ENABLE_LOGS`       | envia logs estruturados (default `false` no código, `true` em produção) |
| `SENTRY_ENABLE_METRICS`    | envia trace metrics (default `false` no código, `true` em produção — em avaliação) |
| `SENTRY_RELEASE`           | tag de release do evento (opcional)                   |

---

## 10. Observabilidade (Sentry/GlitchTip)

O gateway envia três sinais para o GlitchTip (`http://31.97.27.185:30808`,
projeto `2`):

1. **Erros** — exceções 5xx viram issue; `401`/`403` nas rotas de ingestão
   (`/webhook*`) viram issue de nível *warning* (é o sintoma típico de app Meta
   errado ou Callback URL apontando para a rota errada); demais `4xx` não geram
   issue, só contador. Logs de nível `error` também viram issue (com as
   migalhas dos logs anteriores anexadas).
2. **Rastros/performance** — 1% das transações HTTP, com spans automáticos de
   Postgres, Redis, RabbitMQ e das chamadas de saída para `ambiente.url`.
   `/health`, `/docs` e `/ui` são amostrados em 0.
3. **Métricas** — contadores e latências agregados em janelas de 60s e
   enviados como a transação `whiz.metrics.snapshot` (amostragem 100%), cujos
   atributos trazem os números:

| Métrica                        | Atributos                          |
|--------------------------------|------------------------------------|
| `gateway.http.requisicao`      | `rota`, `metodo`, `classe_status`  |
| `gateway.http.duracao`         | `rota`, `metodo` (ms)              |
| `gateway.despacho.tentativa`   | `id_inbox`                         |
| `gateway.despacho.sucesso`     | `id_inbox`, `tentativa`            |
| `gateway.despacho.falha`       | `id_inbox`, `status_dlq`           |
| `gateway.despacho.duracao`     | `id_inbox` (ms)                    |
| `gateway.dlq.enfileiramento`   | `status`                           |
| `gauge.processo.*`             | `rss_bytes`, `heap_usado_bytes`, `uptime_s` |

4. **Logs estruturados** — a página **Logs** do projeto recebe todo log de nível
   `info`, `warn`, `error` e `fatal` (o `debug`/`verbose` fica só no console).
   Cada entrada leva nível, mensagem, o metadado do log como atributos e o
   `trace_id` — clicar no `trace_id` abre a transação correspondente. Filtros
   disponíveis: nível, serviço, ambiente e busca full-text na mensagem.

Onde olhar no GlitchTip: **Issues** para erros, **Performance** para as
transações (inclusive o snapshot de métricas), **Logs** para o fluxo de log.

Um log de nível `error` aparece nos dois lugares de propósito: como issue (que
agrupa, deduplica e alerta) e como linha de log (contexto navegável). Não é
duplicação acidental.

Notas operacionais:

- Sem `SENTRY_DSN` (ou com `SENTRY_ENABLED=false`) o SDK fica desligado e nada
  é enviado — é o comportamento em testes.
- GlitchTip fora do ar não afeta o gateway: todo envio é assíncrono e protegido.
- Nenhum segredo vai no evento: `authorization`, `x-api-key`,
  `x-hub-signature-256`, `x-meta-access-token` e `x-callback-secret` são
  substituídos por `[Filtered]`, e `sendDefaultPii` é `false`.
- Para aumentar a amostragem temporariamente em uma investigação, suba
  `SENTRY_TRACES_SAMPLE_RATE` (ex.: `0.2`) e reinicie o pod.
- Log estruturado não substitui `kubectl logs`: o console segue igual (JSON em
  produção). O GlitchTip é a visão pesquisável, com nível como campo próprio em
  vez de texto cru.
- Se o volume de log incomodar, restrinja os níveis em `NIVEIS_LOG_SENTRY`
  (`src/sentry/sentry.constants.ts`) ou desligue com `SENTRY_ENABLE_LOGS=false`.

---

## 11. Referências no código

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
| Erros da Meta (14 dias) | `src/meta-error-logs/`                               |
| Upload resumível        | `src/wpp-media-business-profiles/wpp-resumable-upload.controller.ts` |
| Observabilidade Sentry  | `src/instrument.ts` · `src/sentry/`                  |
