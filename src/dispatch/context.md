# Dispatch

Consome a fila de cada inbox e re-envia o payload cru para a `url` do ambiente, com retry e backoff exponencial.

## Language

**Re-envio**:
POST HTTP do payload cru para a `url` do ambiente do inbox.
_Avoid_: forward, repost, envio

**Backoff exponencial**:
Espera crescente entre tentativas (`base * 2^n`), limitada por `DISPATCH_MAX_RETRIES`.
_Avoid_: retry delay, espera

**`ack` / `nack`**:
Confirmação (`ack`) ou recusa (`nack`) da mensagem no RabbitMQ; `nack` sem requeue roteia para a DLQ.
_Avoid_: confirmar, rejeitar

**Handler**:
Função registrada em `startConsuming` que processa cada mensagem da fila do inbox.
_Avoid_: callback, listener, consumer
