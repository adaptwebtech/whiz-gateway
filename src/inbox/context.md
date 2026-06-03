# Inbox

Caixa que correlaciona um PID (número Meta) a um ambiente. Cada inbox tem uma fila RabbitMQ dinâmica própria.

## Language

**Inbox**:
Caixa que correlaciona um PID a um ambiente; cada inbox possui uma fila RabbitMQ dinâmica própria.
_Avoid_: canal, caixa de entrada, queue

**PID**:
`phone_number_id` da Meta; identifica o número/WhatsApp de origem e é único por inbox.
_Avoid_: phone, número, telefone

**Fila dinâmica**:
Fila criada sob demanda por inbox, nomeada `inbox.<id>`, criada/destruída junto do inbox.
_Avoid_: queue, fila do inbox, dynamic queue

**Reidratação**:
No bootstrap da aplicação, re-assert das filas + re-consumo dos inboxes ativos.
_Avoid_: rehydrate, recarregar, restaurar
