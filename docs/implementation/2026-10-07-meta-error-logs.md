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
