# Erros da Meta persistidos inteiros (`meta-error-logs`)

## 1. Context

O upload de mídia resumível via gateway está quebrado em produção e em staging, e o log do
gateway é inútil para diagnosticar:

```
{"level":"info","message":"forwardBinary POST upload:MTphdHRhY2htZW50Oj... → 400 (Meta error passthrough)","optionalParams":["WppService"]}
```

O status aparece; o **corpo** do erro da Meta — o único lugar onde o motivo está escrito — é
descartado. Pior: esse `400` é devolvido ao consumer como resultado normal
(`WppForwardResult`), o job é marcado `failed`, e o whiz-server que esperava o callback viu
apenas:

```
Timeout aguardando job de upload do gateway: ce15210a-5da8-4aa7-a662-d55771b47169
```

Ou seja: três camadas, nenhuma com o motivo.

**Causa raiz do `400`** (o que motivou esta spec): a Meta exige o header `file_offset` no POST
binário da sessão resumível. O whiz-server o manda, mas a rota do gateway é alcançada pela
internet (`https://gateway.whiz.net.br`) através de um reverse proxy nginx (CloudPanel), e o
nginx **descarta headers com underscore** por padrão (`underscores_in_headers off`). O header
morre no proxy, `req.headers['file_offset']` chega `undefined`, `forwardBinary` manda
`file_offset: undefined` (axios omite o header) e a Meta responde `400`.

Em `development` o mesmo arquivo sobe porque `development` roda em **modo direto**
(`GatewayTargetService.AMBIENTES_COM_GATEWAY = ["production", "staging"]`): o whiz-server fala
com `graph.facebook.com` sem passar por proxy nenhum, e o header chega intacto.

## 2. Scope

**In:**
- `file_offset` deixa de depender de um header com underscore: aceito por **query param**, com
  fallback para header (`file_offset`, `file-offset`, `x-file-offset`) e default `"0"`.
- `forwardBinary` nunca manda `file_offset` ausente/`undefined` para a Meta.
- Tabela `logs_erros_meta`: todo erro da Meta (4xx/5xx), todo erro de transporte e toda falha de
  entrega de callback persistidos **inteiros**, sem truncar.
- **Chave de busca** curta por registro, emitida em log no momento do persist.
- TTL de 14 dias por cron de limpeza (hard delete).
- `GET /meta-error-logs` e `GET /meta-error-logs/:chave`, sob `ApiKeyGuard`.
- A chave viaja no `error` do callback de upload, para aparecer no erro que o whiz-server
  propaga ao front.
- `callbackUrl` ausente num job deixa de ser silencioso.

**Out:**
- Retentativa automática do upload que falhou — o whiz-server decide.
- Mudar o contrato de sucesso (`202 { jobId }` + callback) — permanece.
- Backfill dos erros já ocorridos: o corpo foi descartado, não existe.
- Ligar `underscores_in_headers on` no nginx: fora deste repositório, e a correção por query
  param dispensa.

## 3. Glossary

- **Chave de busca** (`chave`): identificador curto e único (`ERRMETA-<12 hex>`) emitido em log
  no instante do persist. É o que se cola numa query para achar o erro inteiro.
- **Erro da Meta**: resposta 4xx/5xx com corpo, devolvida pelo Graph e hoje repassada
  transparentemente ao caller.
- **Erro de transporte**: ausência de resposta (timeout, DNS, conexão). Virava `502` sem rastro.
- **Falha de entrega de callback**: `POST <callback_url>` que não respondeu `2xx` após a escada
  de retentativas. Era só um `logger.error` volátil.

## 4. Functional requirements

- **FR-1**: `POST /wpp/uploads/:uploadId` resolve o `file_offset` nesta ordem: query param
  `file_offset` → header `file_offset` → header `file-offset` → header `x-file-offset` →
  `"0"`.
- **FR-2**: quando o offset vem do default, o gateway loga `warn` dizendo de onde ele veio
  (diagnóstico do header comido pelo proxy).
- **FR-3**: `WppService.forwardBinary` recebe `fileOffset: string` (não mais opcional) e sempre
  manda o header para a Meta.
- **FR-4**: `MetaErrorLogsService.persistir(dados)` grava um registro e **devolve a chave**.
- **FR-5**: o corpo da resposta da Meta é gravado inteiro, sem truncar, como `Json`.
- **FR-6**: o persist emite um `logger.error` contendo a chave, a origem, o status e o sub-path.
- **FR-7**: `forward`, `forwardMultipart` e `forwardBinary` persistem tanto o erro da Meta
  (4xx/5xx) quanto o erro de transporte, e continuam com o comportamento atual de retorno
  (passthrough / `502`).
- **FR-8**: o header `Authorization` **nunca** é persistido; é substituído por `"[REDACTED]"`.
- **FR-9**: o consumer inclui `chaveErro` no `error` do callback quando o job falhou e a chave
  existe.
- **FR-10**: job com `callbackUrl` ausente gera `warn` nomeando o `jobId` e o status.
- **FR-11**: escada de retentativas de callback esgotada → persiste um registro de origem
  `callback`.
- **FR-12**: `GET /meta-error-logs/:chave` devolve o registro inteiro; inexistente → `404`.
- **FR-13**: `GET /meta-error-logs` lista os mais recentes, com `limit` (default 50, máx 200) e
  filtros opcionais `origem`, `status` e `job_id`.
- **FR-14**: cron diário remove registros com mais de 14 dias e loga a contagem.

## 5. Non-functional

- **NFR-1**: falha ao persistir o log **nunca** altera o fluxo da requisição — é capturada e
  reduzida a um `logger.error`.
- **NFR-2**: migration aditiva e idempotente.
- **NFR-3**: nenhuma chamada extra ao banco no caminho de sucesso.

## 6. Data model

```sql
CREATE TABLE IF NOT EXISTS "logs_erros_meta" (
  "id"         TEXT NOT NULL,
  "chave"      TEXT NOT NULL,
  "origem"     TEXT NOT NULL,
  "metodo"     TEXT NOT NULL,
  "sub_path"   TEXT NOT NULL,
  "status"     INTEGER,
  "corpo"      JSONB,
  "requisicao" JSONB,
  "job_id"     TEXT,
  "mensagem"   TEXT,
  "data"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "logs_erros_meta_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "logs_erros_meta_chave_key" ON "logs_erros_meta"("chave");
CREATE INDEX IF NOT EXISTS "logs_erros_meta_data_idx"   ON "logs_erros_meta"("data");
CREATE INDEX IF NOT EXISTS "logs_erros_meta_job_id_idx" ON "logs_erros_meta"("job_id");
CREATE INDEX IF NOT EXISTS "logs_erros_meta_origem_idx" ON "logs_erros_meta"("origem");
```

## 7. API contract

- `POST /wpp/uploads/:uploadId?callback_url=…&file_offset=0` — query param `file_offset` novo e
  opcional.
- `GET /meta-error-logs?origem=&status=&job_id=&limit=&offset=` → `MetaErrorLogResponseDto[]`.
- `GET /meta-error-logs/:chave` → `MetaErrorLogResponseDto`, `404` quando não existe.
- Callback de upload, caso `failed`: `error` ganha `chaveErro: "ERRMETA-…"` ao lado do corpo da
  Meta.

## 8. Acceptance criteria

- **AC-1** — *Given* `POST /wpp/uploads/:id?file_offset=7` **sem** header de offset, *when* o job
  é enfileirado, *then* `job.fileOffset === "7"`.
- **AC-2** — *Given* a mesma rota sem query param e sem header algum (o caso do nginx), *then*
  `job.fileOffset === "0"` e um `warn` é emitido.
- **AC-3** — *Given* header `file_offset: 3` e nenhum query param, *then* `job.fileOffset === "3"`
  (compatibilidade com o whiz-server antigo).
- **AC-4** — *Given* query param e header divergentes, *then* o **query param** vence.
- **AC-5** — *Given* a Meta responde `400` com corpo em `forwardBinary`, *then* um registro é
  persistido com `origem="forwardBinary"`, `status=400`, `corpo` igual ao corpo recebido, e o
  retorno segue sendo `{ status: 400, data: <corpo> }`.
- **AC-6** — *Given* o mesmo cenário, *then* um `logger.error` contendo a `chave` é emitido.
- **AC-7** — *Given* um erro de transporte em `forwardBinary`, *then* um registro de
  `status=null` com `mensagem` preenchida é persistido e `BadGatewayException` continua sendo
  lançada.
- **AC-8** — *Given* headers com `Authorization`, *then* o registro guarda `"[REDACTED]"` nesse
  campo.
- **AC-9** — *Given* `persistir` lança (banco fora), *then* `forwardBinary` devolve o passthrough
  normalmente e nada é propagado.
- **AC-10** — *Given* um job `resumable-binary` cujo resultado é `400` e que tem `callbackUrl`,
  *then* o corpo do webhook é `{ jobId, status:"failed", error: { …corpoDaMeta, chaveErro } }`.
- **AC-11** — *Given* um job que falhou **sem** `callbackUrl`, *then* um `warn` nomeando o
  `jobId` é emitido.
- **AC-12** — *Given* todas as retentativas de callback esgotadas, *then* um registro de
  `origem="callback"` é persistido e sua chave é logada.
- **AC-13** — *Given* `GET /meta-error-logs/:chave` de uma chave existente, *then* `200` com o
  registro inteiro; chave inexistente → `404`.
- **AC-14** — *Given* o cron de limpeza, *then* `hardDeleteOlderThan` é chamado com um corte de
  exatamente 14 dias e a contagem é logada.
- **AC-15** — *Given* `GET /meta-error-logs` sem `limit`, *then* 50 registros no máximo, mais
  recentes primeiro.

---

# Adendo (2026-10-08) — o `?sig=` do id de sessão, e a URL no registro

A instrumentação acima entrou em produção e capturou, no primeiro upload, o erro
que estava escondido desde o começo:

```json
{"debug_info":{"type":"ParameterValidationError",
  "message":"HMAC check failed! sessionId=upload:MTphdHRhY2htZW50Ojc5MjVkMDRkLTc0NDgtNDM5NC1hYzdjLWY2MjRlYjg2NGMxZD9maWxlX3R5cGU9aW1hZ2UlMkZqcGVnJmZpbGVfbGVuZ3RoPTQxMjQ3JmZpbGVfbmFtZT1mYzI2MjMyMy01ZWIxLTQwMTktOWRkYi1lNjZlZWZlYTliMzAuanBlZw== mac=",
  "retriable":false}}
```

`mac=` **vazio**. Não era o `file_offset` — era o HMAC da sessão.

## Causa raiz (a de verdade)

O id que a Meta devolve em `POST /app/uploads` **não é path-safe**:

```
upload:MTphdHRhY2htZW50Ojc5MjVkMDRk?sig=ARZqAApVPDDNjMlPTpM
       └─ base64 do payload ───────┘ └─ HMAC da sessão ────┘
```

O whiz-server montava `/uploads/${sessionId}?callback_url=…&file_offset=0`, o
que produz uma URL com **dois `?`**. Medido com o Express real:

| URL enviada | `req.params.uploadId` | `req.query` |
|---|---|---|
| `…/uploads/upload:X?sig=ARZq?callback_url=https%3A%2F%2F…&file_offset=0` | `upload:X` — **sig perdido** | `{ sig: "ARZq?callback_url=https://…", file_offset: "0" }` |

Duas consequências, as duas observadas:

1. o sub-path forwardado à Meta era `upload:X`, sem HMAC → `HMAC check failed! …
   mac=`;
2. `callback_url` foi engolido como parte do valor de `sig` → `job.callbackUrl`
   `undefined` → o resultado nunca voltava → `Timeout aguardando job de upload do
   gateway: <jobId>` no whiz-server.

**`development` funcionava** porque o modo direto monta `${base}/${sessionId}`
sem anexar query nenhuma: o `?sig=` sobrevive intacto. A hipótese anterior
(header `file_offset` comido pelo nginx) explicava o mesmo sintoma e **estava
errada** como causa operante — o `requisicao` persistido mostra
`"file_offset":"0"` chegando à Meta, então aquele caminho já funcionava. O
endurecimento daquele PR segue válido por contrato, mas não era o defeito.

## Novos FRs

- **FR-15**: `POST /wpp/uploads/:uploadId` aceita `upload_session`, o id COMPLETO
  da sessão em **base64url**, e o usa como sub-path.
- **FR-16**: `upload_session` que não decodifique para algo começando com
  `upload:` → `400`, antes de gravar tmp ou enfileirar job.
- **FR-17**: sem `upload_session`, cai no path param. Se ele não contiver
  `?sig=`, emite `warn` nomeando o `HMAC check failed` que a Meta vai devolver.
- **FR-18**: `logs_erros_meta` ganha a coluna `url` — a URL ABSOLUTA de fato
  requisitada, ao lado do `sub_path`.
- **FR-19**: a `url` aparece na linha de log do persist.

## Novos ACs

- **AC-16** — *Given* `upload_session` em base64url do id com `?sig=`, *then*
  `job.subPath` é o id completo, sig incluído.
- **AC-17** — *Given* o mesmo, *then* `callback_url` e `file_offset` seguem sendo
  lidos corretamente (não há mais `?` a mais para engolir nada).
- **AC-18** — *Given* nenhum `upload_session`, *then* usa o path param
  (compatibilidade com o whiz-server ainda não atualizado).
- **AC-19** — *Given* `upload_session` com base64url inválido, ou que decodifique
  para algo fora de `upload:…`, *then* `400`, sem tmp em disco e sem job na fila.
- **AC-20** — *Given* o path param já trazendo o sig percent-encoded, *then* ele
  é preservado.
- **AC-21** — *Given* qualquer erro persistido, *then* a `url` absoluta
  requisitada está no registro e na linha de log.

## Data model (adendo)

```sql
ALTER TABLE "logs_erros_meta" ADD COLUMN IF NOT EXISTS "url" TEXT;
```

## Por que base64url e não percent-encoding no path

`encodeURIComponent(sessionId)` **funciona** no Express (medido: o path param
volta com o `?sig=` intacto). Mas vira `%3F` no path, e normalizar escapes de
path é precisamente o que um reverse proxy pode fazer — é o mesmo tipo de aposta
que já custou um incidente aqui. base64url é `[A-Za-z0-9-_]`: sem `?`, sem `%`,
sem `+` (que `URLSearchParams` e o parser do Express leem como espaço). Não há o
que reescrever.

---

# Adendo 2 (2026-10-08) — o ponto cego: falha que chega por WEBHOOK

A tabela cobria o caminho de **saída**. Metade das falhas da Cloud API não passa
por ali: o `POST /messages` responde `200` com um `wamid`, e a recusa chega
segundos depois, num webhook de status.

```json
{"statuses":[{"id":"wamid.HBgM…","status":"failed","recipient_id":"553597602772",
  "errors":[{"code":131053,"title":"Media upload error","error_data":{"details":
  "Video file has size 63787247 bytes but must be atmost 16777216 bytes and non-empty"}}]}]}
```

Nenhuma resposta HTTP revela isso, então `logs_erros_meta` não enxergava: o erro
existia só como uma linha de log, sem registro e **sem chave de busca**.

## Novos FRs

- **FR-20**: `WebhookService.handleIncoming` persiste todo erro embutido no
  payload de entrada, antes de resolver inbox e despachar.
- **FR-21**: um registro por erro. Origem `webhook-status`; `referencia` recebe o
  `wamid`; `sub_path` recebe `waba:<id> pid:<id>`.
- **FR-22**: o `status` HTTP fica `null` — quem chamou foi a Meta. O código dela
  vai em `codigo_meta`, coluna nova e indexada.
- **FR-23**: o `corpo` guarda o nó `statuses[]` **inteiro** (wamid, destinatário,
  timestamp e erros), não só o erro.
- **FR-24**: a persistência é fire-and-forget e `@Optional()`: a ingestão do
  webhook não espera o log, e banco fora não segura o despacho ao ambiente.
- **FR-25**: erro em webhook de inbox **não registrada** também é persistido —
  era justamente aí que ele sumia por completo.
- **FR-26**: `GET /meta-error-logs` ganha os filtros `referencia` e
  `codigo_meta`.

## Novos ACs

- **AC-22** — *Given* o webhook 131053, *then* o extrator devolve um erro com o
  `wamid` em `referencia`, o código, a WABA e o pid.
- **AC-23** — *Given* o mesmo, *then* o `corpo` é o `statuses[]` inteiro.
- **AC-24** — *Given* um webhook normal (mensagem recebida, sem `errors`), *then*
  lista vazia e nenhum toque no banco.
- **AC-25** — *Given* `errors` fora de `statuses` (nível conta), *then* também é
  capturado, sem `referencia`; vários statuses com erro viram vários registros.
- **AC-26** — *Given* payload malformado (vem da internet), *then* nunca lança;
  erro sem `code`/`title`/`details` ainda vira registro, com resumo genérico.
- **AC-27** — *Given* o webhook 131053, *then* o payload chega ao persist **e** o
  despacho ao ambiente acontece do mesmo jeito.
- **AC-28** — *Given* o persist indisponível ou não injetado, *then* a ingestão
  segue normalmente.
- **AC-29** — *Given* inbox não registrada, *then* o erro é persistido antes de o
  payload ir para a DLQ.
- **AC-30** — *Given* o webhook, *then* grava `origem=webhook-status`,
  `metodo=WEBHOOK`, `referencia=<wamid>`, `codigo_meta=131053`, e emite chave e
  motivo em log.
- **AC-31** — *Given* o mesmo, *then* `status` HTTP é `null` e o corpo preserva o
  detalhe em bytes.
- **AC-32** — *Given* webhook sem erro, ou banco fora, *then* lista vazia e nada
  propaga.

## Data model (adendo 2)

```sql
ALTER TABLE "logs_erros_meta" ADD COLUMN IF NOT EXISTS "referencia"  TEXT;
ALTER TABLE "logs_erros_meta" ADD COLUMN IF NOT EXISTS "codigo_meta" INTEGER;
CREATE INDEX IF NOT EXISTS "logs_erros_meta_referencia_idx"  ON "logs_erros_meta"("referencia");
CREATE INDEX IF NOT EXISTS "logs_erros_meta_codigo_meta_idx" ON "logs_erros_meta"("codigo_meta");
```

`codigo_meta` é separado do `status` de propósito: `?status=400` pergunta "a
Graph recusou a requisição" e `?codigo_meta=131053` pergunta "mídia grande
demais". Num erro de webhook não existe status HTTP nenhum, e misturar os dois
arruinaria as duas consultas.
