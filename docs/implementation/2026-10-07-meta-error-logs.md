# Erros da Meta persistidos inteiros (`meta-error-logs`)

> Status: stable
> Spec: [docs/specs/2026-10-07-meta-error-logs.md](../specs/2026-10-07-meta-error-logs.md)
> Backend: `src/meta-error-logs/` · `src/wpp/wpp.service.ts` · `src/wpp-media-business-profiles/{wpp-resumable-upload.controller,wpp-media-upload-consumer.service}.ts`
> Guia operacional: [docs/GUIA-GATEWAY.md](../GUIA-GATEWAY.md) §7.1
> Glossário: `src/meta-error-logs/context.md` · `src/wpp/context.md`

## 1. Overview

Duas coisas, uma causa comum: **o gateway não guardava o motivo das falhas de
saída**.

O upload de mídia resumível quebrou em produção e em staging. O que havia para
diagnosticar era isto, do lado do gateway:

```
{"level":"info","message":"forwardBinary POST upload:MTphdHRhY2htZW50Oj… → 400 (Meta error passthrough)","optionalParams":["WppService"]}
```

e isto, do lado do whiz-server:

```
Timeout aguardando job de upload do gateway: ce15210a-5da8-4aa7-a662-d55771b47169
  at GatewayCallbacksService.awaitGatewayJob (…/gateway-callbacks.service.js:52:15)
```

Três camadas, nenhuma com a causa: o corpo do `400` — único lugar onde a Meta
escreve o motivo — era descartado em `forwardBinary`.

### Causa raiz do `400`

A Meta exige o parâmetro `file_offset` no POST binário da sessão resumível. O
whiz-server o manda **como header**, e o header tem underscore no nome.

Em produção e staging, o whiz-server alcança o gateway pela internet
(`WHIZ_GATEWAY_URL=https://gateway.whiz.net.br`), através de um reverse proxy
nginx (CloudPanel — ver `argo/docs/INFRASTRUCTURE.md` §8). O nginx **descarta
headers com underscore** por padrão (`underscores_in_headers off`). Então:

```
whiz-server  --file_offset: 0-->  nginx  --(header descartado)-->  gateway
gateway      req.headers['file_offset'] === undefined
             → job.fileOffset = undefined
             → forwardBinary(…, job.fileOffset!)
             → axios omite header `undefined`
             → Meta: 400
```

Em `development` o mesmo arquivo sobe porque `development` roda em **modo
direto**: `GatewayTargetService.AMBIENTES_COM_GATEWAY = ["production",
"staging"]`, então o whiz-server fala com `graph.facebook.com` sem proxy no
caminho e o header chega intacto. Daí o sintoma "em dev funciona".

### Por que o whiz-server viu um timeout e não o erro

`WppMediaUploadConsumerService.handleJob` já marcava o job como `failed` e
disparava o callback — mas a falha tinha dois pontos cegos:

- `if (!job.callbackUrl) return;` era mudo: um job que falha sem callback
  desaparecia, e do outro lado o `awaitGatewayJob` esperava os 30 s e reportava
  timeout;
- a escada de retentativas do callback (`1+2+4+8+16 s = 31 s`) é **mais longa
  que o `timeoutMs` de 30 s** do `awaitGatewayJob`: qualquer falha de entrega na
  primeira tentativa já garante que o whiz-server veja timeout, não o erro.

## 2. O que mudou

### 2.1 `file_offset` deixa de depender do header (FR-1..FR-3)

`WppResumableUploadController.resolverFileOffset` resolve nesta ordem:

| Ordem | Fonte                  |
|-------|------------------------|
| 1     | query param `file_offset` |
| 2     | header `file_offset`   |
| 3     | header `file-offset`   |
| 4     | header `x-file-offset` |
| 5     | `"0"` (com `warn`)     |

O `warn` do caso 5 nomeia a causa provável ("foi comido por um proxy"), para o
próximo incidente não começar do zero. `forwardBinary` passou a receber
`fileOffset: string` e sempre manda o header à Meta (`fileOffset || '0'`) — o
`job.fileOffset!` virou `job.fileOffset ?? '0'`.

Compatível com o whiz-server atual (que manda só o header) e com jobs já na
fila.

### 2.2 Tabela `logs_erros_meta` (FR-4..FR-8)

Migration `20261007120000_logs_erros_meta` (aditiva, idempotente).

| Coluna       | Nota                                                            |
|--------------|-----------------------------------------------------------------|
| `chave`      | `ERRMETA-<12 hex>`, `@unique`. Emitida em log no persist.        |
| `origem`     | `forward` · `forwardMultipart` · `forwardBinary` · `callback`    |
| `metodo`     | método HTTP                                                      |
| `sub_path`   | sub-path da Meta, ou a URL do callback                           |
| `status`     | `null` em erro de transporte (nenhuma resposta)                  |
| `corpo`      | `Jsonb` — resposta **inteira**, sem truncar                      |
| `requisicao` | `Jsonb` — headers enviados, segredos já substituídos             |
| `job_id`     | job de upload assíncrono correlacionado                          |
| `mensagem`   | mensagem do erro de transporte / da falha de callback            |
| `data`       | `now()`; índice (usado pelo corte do cron)                       |

`MetaErrorLogsService.persistir(dados)` gera a chave, redige, grava, loga e
devolve a chave:

```
erro da Meta persistido chave=ERRMETA-A1B2C3D4E5F6 origem=forwardBinary status=400 subPath=upload:MTph… jobId=ce15210a-…
```

**Nunca lança** (NFR-1): falha de banco vira `logger.error` e `null`, e o
forward em curso segue com seu passthrough de sempre.

Redação (`HEADERS_REDIGIDOS`, case-insensitive): `authorization`,
`x-meta-access-token`, `x-api-key`, `x-callback-secret`, `cookie` →
`[REDACTED]`. Estes registros ficam 14 dias no banco; credencial nenhuma entra.

### 2.3 Onde o persist está ligado (FR-7, FR-11)

- `WppService.forward` — erro da Meta e erro de transporte;
- `WppService.forwardMultipart` — idem (grava também `filename` e `type`);
- `WppService.forwardBinary` — idem (grava também `tamanhoEmBytes` do arquivo e
  o `file_offset` efetivamente enviado, que é o que faltava);
- `WppMediaUploadConsumerService.fireWebhookWithRetry` — `origem: 'callback'`
  quando a escada de retentativas esgota, o que antes era só um `logger.error`
  volátil.

As três primeiras também devolvem a chave em `WppForwardResult.chaveErro` e a
emitem na linha de log existente (`… → 400 (Meta error passthrough)
chaveErro=ERRMETA-…`).

### 2.4 A chave chega ao front (FR-9, FR-10)

O callback de um job que falhou passou a levar a chave dentro do `error`:

```json
{ "jobId": "ce15210a-…", "status": "failed",
  "error": { "error": { "message": "(#100) …" }, "chaveErro": "ERRMETA-A1B2C3D4E5F6" } }
```

`GatewayCallbacksService.awaitGatewayJob` já serializa `result.error` inteiro na
mensagem que lança, então a chave sobe até o payload que o front exibe sem
nenhuma mudança no whiz-server.

E `callbackUrl` ausente num job que falhou virou `warn` nomeando o `jobId` e a
chave, em vez de um `return` mudo.

### 2.5 Consulta e TTL (FR-12..FR-14)

- `GET /meta-error-logs/:chave` → registro inteiro, `404` se não existe;
- `GET /meta-error-logs?origem=&status=&job_id=&limit=&offset=` → mais recentes
  primeiro, `limit` default 50 / máx 200;
- ambas sob `ApiKeyGuard`; o painel `/ui` ganhou a aba **Erros da Meta**
  (somente leitura);
- `MetaErrorLogsCleanupService` roda `@Cron('30 3 * * *')` e apaga o que passou
  de 14 dias (`TTL_ERROS_META_MS`). Hard delete, não soft — a tabela guarda
  corpos inteiros e cresce rápido. 03:30 para não disputar o banco com a limpeza
  da DLQ (03:00).

## 3. Decisões

- **Módulo `@Global`.** O serviço é injetado em caminhos transversais
  (`WppService`, consumer de upload); importar `MetaErrorLogsModule` em cada um
  abriria ciclo com `ApiKeysModule`, usado aqui pelo guard da rota de consulta.
- **`@Optional()` nas duas injeções.** A ausência do log não pode derrubar um
  forward, e as suítes que constroem `WppService`/o consumer à mão continuam
  valendo sem alteração.
- **Cron em vez de TTL do Postgres.** Postgres não tem TTL de linha; `pg_cron`
  não está instalado no cluster. O cron do `@nestjs/schedule` é o mesmo
  mecanismo que a limpeza da DLQ já usa.
- **Query param em vez de pedir `underscores_in_headers on` no nginx.** O proxy
  está fora deste repositório e fora do Argo (não há Ingress CRD); depender de
  uma configuração que não versionamos é trocar um bug por uma armadilha.
- **Default `"0"` em vez de `400`.** O whiz-server faz upload de um único chunk,
  onde o offset é sempre `0`; recusar a requisição transformaria o header comido
  pelo proxy num erro novo em lugar de consertar o antigo. Um upload retomado de
  verdade manda o valor explícito, e o `warn` deixa o rastro.

## 4. Drift em relação à spec

Nenhum. AC-1..AC-15 cobertos.

## 5. Gate

| Item  | Resultado                                      |
|-------|------------------------------------------------|
| Build | `nest build` — 0 erros                          |
| Tests | 69 suites / 548 testes GREEN (`--maxWorkers=2`) |
| Lint  | 0 erros nos arquivos tocados                    |

Suítes novas (29 testes): `src/meta-error-logs/{meta-error-logs.service,meta-error-logs-cleanup.service,meta-error-logs.controller}.spec.ts`,
`src/wpp/wpp-erro-persistido.spec.ts`,
`src/wpp-media-business-profiles/{wpp-resumable-upload-file-offset,wpp-media-upload-callback-erro}.reg.spec.ts`.

Suítes ajustadas (o `jobId` passou a viajar ao `WppService`, para correlacionar
o erro persistido com o job da fila):
`wpp-media-upload-consumer.service.spec.ts`, `wpp-media-upload-filename.reg.spec.ts`.

## 6. Como verificar em produção

1. Tente o upload que falhava. No log do gateway deve aparecer a linha
   `erro da Meta persistido chave=ERRMETA-…` — ou nada, se o `file_offset`
   resolveu o caso.
2. Se aparecer, `GET /meta-error-logs/<chave>` traz o corpo inteiro da Meta.
3. O log do controller agora diz de onde veio o offset:
   `uploadBinary jobId=… uploadId=… fileOffset=0 (query)`. `(default)` com um
   `warn` ao lado confirma que o header foi comido pelo proxy — esperado até o
   whiz-server subir com o query param.

---

# Adendo (2026-10-08) — o `?sig=` perdido, e a `url` no registro

A tabela cumpriu o propósito no primeiro upload depois do deploy: devolveu o
erro que três camadas de log tinham escondido.

```json
corpo: {"debug_info":{"type":"ParameterValidationError",
  "message":"HMAC check failed! sessionId=upload:MTphdHRhY2htZW50Ojc5MjVkMDRk…== mac=",
  "retriable":false}}
requisicao: {"file_offset":"0","Content-Type":"application/octet-stream",
  "Authorization":"[REDACTED]","tamanhoEmBytes":"41247"}
```

`mac=` vazio. E `"file_offset":"0"` **chegou** — ou seja, a hipótese do PR
anterior (header comido pelo nginx) não era a causa operante. Fica registrado:
aquele endurecimento é correto por contrato, mas não consertava este bug.

## Causa raiz

O id de sessão da Meta não é path-safe:

```
upload:MTphdHRhY2htZW50Ojc5MjVkMDRk?sig=ARZqAApVPDDNjMlPTpM
       └─ base64 do payload ───────┘ └─ HMAC da sessão ────┘
```

`/uploads/${sessionId}?callback_url=…&file_offset=0` tem **dois `?`**, e o
Express corta no primeiro. Medido contra o Express real desta `node_modules`:

```
params.uploadId = "upload:MTphdHRhY2htZW50Ojc5MjVkMDRk"          ← sig perdido
query           = { sig: "ARZqAApVPDDNjMlPTpM?callback_url=https://server…",
                    file_offset: "0" }                            ← callback engolido
```

Donde os dois sintomas, exatamente como vistos: `HMAC check failed … mac=` na
Meta, e `job.callbackUrl === undefined` → nenhum callback → `Timeout aguardando
job de upload do gateway` no whiz-server.

`development` escapava porque o modo direto monta `${base}/${sessionId}`, sem
anexar query nenhuma.

## O que mudou

### `upload_session` em base64url (FR-15..FR-17)

`resolverSessionId(uploadId, uploadSessionB64)`:

| ordem | fonte | resultado |
|---|---|---|
| 1 | `?upload_session=<base64url>` | id completo, decodificado |
| 2 | path param contendo `?sig=` | usado como veio |
| 3 | path param sem `?sig=` | usado, **com `warn`** nomeando o `HMAC check failed` que vai vir |

Validação do caso 1: decodifica e exige prefixo `upload:`. `Buffer.from(…,
'base64url')` **não lança** com entrada inválida — ignora o que não reconhece e
devolve lixo —, então sem essa checagem um `upload_session` ruim viraria um
sub-path mutilado, ou apontado para outra rota do Graph. O `400` sai **antes** de
gravar o tmp e de enfileirar o job.

O path param segue sem validação estrita: é um segmento único montado pelo
caller, e recusá-lo mudaria o comportamento de uma rota que hoje é passthrough.

**Por que base64url e não `encodeURIComponent` no path.** O percent-encoding
funciona no Express — medi, o path param volta com o `?sig=` intacto. Mas vira
`%3F` no path, e normalizar escapes de path é exatamente o que um reverse proxy
pode fazer. base64url é `[A-Za-z0-9-_]`: sem `?`, sem `%`, sem `+` (que
`URLSearchParams` e o parser do Express leem como espaço). Não há o que
reescrever.

### Coluna `url` (FR-18, FR-19)

Migration `20261008100000_logs_erros_meta_url` — `ADD COLUMN IF NOT EXISTS`.

`sub_path` é o que o caller pediu; `url` é a rota que **saiu do processo**, com
base URL e query string montadas. Não é cosmético: com a `url` persistida, este
incidente teria sido

```
url: https://graph.facebook.com/v24.0/upload:MTph…==
```

— sig visivelmente ausente — em lugar de uma investigação. Preenchida nos 6
pontos de persist de `WppService` (erro da Meta e erro de transporte em
`forward`, `forwardMultipart`, `forwardBinary`), e presente na linha de log:

```
erro da Meta persistido chave=ERRMETA-… origem=forwardBinary status=400 subPath=… jobId=… url=https://graph.facebook.com/v24.0/upload:…?sig=…
```

O log do controller também passou a dizer a procedência do id e se o callback
veio:

```
uploadBinary jobId=… sessionId=upload:…?sig=… (query upload_session) fileOffset=0 (query) callbackUrl=https://server.whiz.net.br/…
```

## Gate

| item | resultado |
|---|---|
| `nest build` | 0 erros |
| testes | **71 suites / 558 testes GREEN** (`--maxWorkers=2`) |
| lint | 0 erros nos arquivos tocados |

Suítes novas: `src/wpp-media-business-profiles/wpp-resumable-upload-sig.reg.spec.ts`
(AC-16..AC-20), `src/meta-error-logs/meta-error-logs-url.spec.ts` (AC-21), mais
um caso de `url` em `src/wpp/wpp-erro-persistido.spec.ts`.

## PR par

whiz-server: manda `upload_session=<base64url(sessionId)>` em lugar de interpolar
o id cru no path.

---

# Adendo 2 (2026-10-08) — o ponto cego: falha que chega por WEBHOOK

Relatado de produção: envio de vídeo grande por `WHATSAPP_META` falhava, **e o
erro não era persistido nem ganhava chave**. O log tinha isto e nada mais:

```
1 - Payload recebido para dispatch: {"object":"whatsapp_business_account","entry":[{…
  "statuses":[{"id":"wamid.HBgM…","status":"failed","errors":[{"code":131053,
  "title":"Media upload error","error_data":{"details":
  "Video file has size 63787247 bytes but must be atmost 16777216 bytes and non-empty"}}]}]…
```

## Por que escapava

`logs_erros_meta` cobria o caminho de **saída** — `WppService.forward*` e a
entrega de callback. Esta falha é de **entrada**: a Graph respondeu `200` com um
`wamid` no envio, e a recusa chegou depois, num webhook de status. Não existe
resposta HTTP nossa para interceptar. Não era um bug do registro; era um ponto
cego do desenho.

É a mesma família de `131049` ("200 com wamid ≠ entregue"), já conhecida do lado
do whiz-server.

## O que mudou

### `extrairErrosDeWebhook` — função pura, defensiva

`src/meta-error-logs/meta-webhook-errors.extractor.ts`. Varre
`entry[].changes[].value` em dois pontos:

1. `statuses[].errors[]` — falha de entrega de uma mensagem específica (o 131053);
2. `value.errors[]` — erro de nível conta/WABA, sem mensagem associada.

Devolve um item por erro, com `referencia` (o `wamid`), `codigo`, `wabaId`, `pid`,
um `resumo` para o log e o **nó inteiro** em `corpo`. O payload vem da internet:
todo nó fora do formato é ignorado em silêncio e a função nunca lança.

O `resumo` prioriza `error_data.details` — `title` e `message` costumam repetir o
mesmo rótulo genérico ("Media upload error"), e é o `details` que carrega o número
de bytes, isto é, a informação inteira.

### Duas colunas novas

| coluna | por quê |
|---|---|
| `referencia` | o `wamid`, para ligar o registro à mensagem no whiz |
| `codigo_meta` | o código da Meta, **separado** do `status` HTTP |

`codigo_meta` não é preciosismo: `?status=400` pergunta "a Graph recusou a
requisição", `?codigo_meta=131053` pergunta "mídia grande demais". Num erro de
webhook não existe status HTTP nenhum — reaproveitar `status` para o código da
Meta arruinaria as duas consultas. Ambas indexadas e expostas como filtro em
`GET /meta-error-logs`.

### Ligado na ingestão

`WebhookService.handleIncoming` chama `persistirErrosDeWebhook` **antes** de
resolver a inbox — assim o erro é registrado mesmo quando a inbox não está
cadastrada e o payload vai para a DLQ, que era o caso em que ele sumia por
completo.

Fire-and-forget e `@Optional()`, pelo mesmo princípio do resto do módulo: a
ingestão do webhook não espera o log, e banco fora não pode segurar o despacho ao
ambiente.

Linha emitida no persist:

```
erro da Meta persistido chave=ERRMETA-A1B2C3D4E5F6 origem=webhook-status status=n/a codigoMeta=131053 subPath=waba:1613119706411328 pid:1106219235900077 jobId=- referencia=wamid.HBgM… url=-
```

## Sobre o aviso ao front e a persistência da falha

Verificado, **não reimplementado**: o caminho já existe no whiz-server e no front.

- `ApiOficialWebhooksService.handleStatuses` detecta `status=failed`, monta o
  `MetaApiError` por `erroMetaDeStatusWebhook` (que é agnóstico de código, logo
  já cobre o 131053), anexa `conteudo.erro` e reinjeta a mensagem no pipeline;
- o pipeline reaproveita `id`/`dataEnvio`/`cursor` da linha antiga, então
  **ATUALIZA** em vez de duplicar — é isso que faz a falha sobreviver a reabrir a
  conversa;
- no front, `chatUtils.ts` mapeia `conteudo.erro` → `motivoFalha`, e
  `ChatMessage.vue` renderiza o bloco "Não enviado" + motivo para **qualquer**
  tipo de mensagem (só `template_meta` fica de fora, porque desenha o próprio).

O que faltava era só o registro consultável no gateway.

## Gate

| item | resultado |
|---|---|
| `nest build` | 0 erros |
| testes | **74 suites / 577 testes GREEN** (`--maxWorkers=2`) |
| lint | 0 erros nos arquivos tocados |

Suítes novas: `src/meta-error-logs/meta-webhook-errors.extractor.spec.ts` (AC-22..AC-26),
`src/meta-error-logs/meta-error-logs-webhook.spec.ts` (AC-30..AC-32),
`src/webhook/webhook-erro-persistido.reg.spec.ts` (AC-27..AC-29).

Migration `20261008150000_logs_erros_meta_referencia` — duas colunas, aditivas e
idempotentes.
