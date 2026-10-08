# MetaErrorLogs

Guarda inteiro o erro que a Meta devolve — e a falha de entrega de callback —
sob uma chave curta que é emitida em log no mesmo instante. Existe porque o
gateway logava só o status do erro e descartava o corpo, que é o único lugar
onde a Meta escreve o motivo.

## Language

**Chave de busca** (`chave`):
Identificador curto e único (`ERRMETA-<12 hex>`) emitido em log no instante do
persist. É o que se cola numa query, ou na URL `GET /meta-error-logs/<chave>`,
para recuperar o erro inteiro.
_Avoid_: id do erro, correlation id, trace id

**Origem**:
Em qual caminho o erro aconteceu: `forward`, `forwardMultipart`,
`forwardBinary`, `callback` ou `webhook-status`. As três primeiras são chamadas à
Meta; `callback` é a entrega do resultado de um job ao whiz-server;
`webhook-status` é o caminho de ENTRADA.
_Avoid_: tipo, categoria, fonte

**Falha assíncrona** (`webhook-status`):
Recusa que nenhuma resposta HTTP revela — o `POST /messages` devolve `200` com um
`wamid` e a recusa chega depois, num `statuses[].errors[]`. Era o ponto cego da
tabela. `status` fica `null` (não houve requisição nossa), `codigo_meta` guarda o
código e `referencia` guarda o `wamid`.
_Avoid_: erro de webhook, falha pós-envio

**Código da Meta** (`codigo_meta`):
`131053`, `131049`, `100`… Vive em coluna própria, **nunca** no `status`:
`?status=400` e `?codigo_meta=131053` perguntam coisas diferentes.
_Avoid_: código de erro, error code

**Referência** (`referencia`):
O `wamid` da mensagem a que o erro se refere. É por ele que o registro liga à
mensagem no whiz.
_Avoid_: id da mensagem, correlação

**URL requisitada** (`url`):
Rota ABSOLUTA que saiu do processo, com base URL e query string montadas. O
`sub_path` é o que o caller pediu; a `url` é o que foi de fato pedido à Meta. A
distinção é o que torna visível uma URL montada errado — o primeiro erro que esta
tabela capturou em produção foi o `?sig=` do id de sessão ausente na URL final.
_Avoid_: endpoint, rota, destino

**Corpo** (`corpo`):
Resposta da Meta gravada **sem truncar**. Truncar é exatamente o que fazia o log
ser inútil.
_Avoid_: payload, body, resposta

**Erro de transporte**:
Ausência de resposta (timeout, DNS, conexão). Grava `status = null` e preenche
`mensagem`.
_Avoid_: erro de rede, falha de conexão

**Redação**:
Substituição por `[REDACTED]` dos headers de `HEADERS_REDIGIDOS`
(`authorization`, `x-meta-access-token`, `x-api-key`, `x-callback-secret`,
`cookie`) antes de gravar. Estes registros vivem 14 dias no banco; credencial
nenhuma entra.
_Avoid_: mascarar, sanitizar, ofuscar

**TTL de 14 dias**:
Janela de retenção, aplicada por cron de hard delete às 03:30
(`MetaErrorLogsCleanupService`) — não é um TTL do Postgres.
_Avoid_: expiração, retenção, purge

## Notas de operação

- `persistir` **nunca lança**: uma falha de banco não pode mudar o resultado da
  requisição que estava em curso. Devolve `null` e registra o próprio tombo.
- `MetaErrorLogsModule` é `@Global` porque o serviço é injetado em caminhos
  transversais (`WppService`, consumer de upload) e importá-lo em cada um abriria
  ciclo com `ApiKeysModule`, usado aqui pelo guard da rota de consulta.
- `WppService` e o consumer recebem o serviço com `@Optional()`: a ausência do
  log não derruba um forward, e as suítes que constroem os dois à mão seguem
  valendo.
