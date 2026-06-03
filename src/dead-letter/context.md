# DeadLetter

DLQ estática única + persistência e limpeza das mensagens que falharam no fluxo.

## Language

**Mensagem morta**:
Webhook que falhou em algum ponto do fluxo; persistido em `fila_mensagens_mortas` com um `status`.
_Avoid_: dead message, falha, erro

**DLQ**:
Dead-letter queue estática única: `inbox.dead-letter`. Destino de todo `nack` sem requeue.
_Avoid_: fila de erro, fila morta

**Hard-delete**:
Remoção física do registro, distinta do soft-delete (`del=true`).
_Avoid_: purge, apagar

**`reenviado`**:
Booleano: a mensagem morta já foi re-disparada com sucesso.
_Avoid_: resent, processado

**`status`**:
Enum `StatusFalhaMensagem` — indica em que ponto do fluxo a mensagem falhou.
_Avoid_: estado, situação
