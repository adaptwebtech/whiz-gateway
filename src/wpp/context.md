# WppAdapterCore

Camada de proxy stateless que intermedia chamadas entre clientes internos e a WhatsApp Cloud API. Centraliza autenticação Meta e normalização de erros de transporte.

## Language

**Forward**:
Operação de repassar uma requisição HTTP ao destino Meta e retornar a resposta ao chamador sem reinterpretação.
_Avoid_: proxy, delegate, pass-through

**Sub-path**:
Parte da rota Meta após a versão (ex.: `{phoneNumberId}/messages`). Concatenado a `META_GRAPH_URL` para formar a URL completa.
_Avoid_: path, route, endpoint

**Transparência**:
Comportamento de retornar o status code e body da Meta ao caller exatamente como recebidos, sem modificação. Aplicável a respostas 2xx, 4xx e 5xx.
_Avoid_: passthrough, repasse

**Erro de transporte**:
Falha de rede ou timeout que impede obtenção de qualquer resposta da Meta (ausência de `response` no erro Axios). Resulta em `502 Bad Gateway`.
_Avoid_: network error, connection error

**META_GRAPH_URL**:
Base URL com versão embutida (ex.: `https://graph.facebook.com/v20.0`). Configurada por env; não aparece nas rotas `/wpp/*`.

**META_ACCESS_TOKEN**:
Bearer token do app Meta. Injetado automaticamente em toda chamada de saída; nunca exposto ao caller.

**forwardMultipart**:
Método de `WppService` que faz pipe de um stream multipart/form-data ao Meta sem reparse do body. Extrai o `Content-Type` (incluindo boundary) do request de entrada e injeta `Authorization`.
_Avoid_: repassar multipart, proxy de arquivo

**forwardBinary**:
Método de `WppService` que lê arquivo de disco e faz pipe binário bruto ao Meta, repassando `Content-Type` e `file_offset`. Chamado pelo consumer após dequeue — não no ciclo de request HTTP.
_Avoid_: upload binário, binary proxy

**file_offset**:
Header obrigatório da Meta no upload binário de sessão resumível. Indica o offset do chunk enviado (normalmente `0` para uploads simples). Repassado pelo gateway sem interpretação.
_Avoid_: offset, posição do arquivo

**callback_url**:
URL opcional fornecida pelo cliente em rotas assíncronas de upload. O consumer dispara `POST <callback_url>` com o resultado após concluir o job. Ausente → fire-and-forget.
_Avoid_: webhook URL, notificação, callback

**Job ID**:
UUID gerado pelo gateway ao receber um upload assíncrono. Retornado no `202`; correlaciona a requisição com o webhook de callback.
_Avoid_: task ID, request ID, correlation ID
