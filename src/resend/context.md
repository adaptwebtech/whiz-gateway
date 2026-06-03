# Resend

Re-dispara mensagens mortas elegíveis pelo mesmo caminho de envio, marcando-as como reenviadas.

## Language

**Re-disparo**:
Reprocessar uma mensagem morta pelo mesmo caminho de envio do Dispatch.
_Avoid_: retry, reenvio, replay

**Elegível**:
Registro `del=false` que casa com o filtro (e, por padrão, `reenviado=false`).
_Avoid_: válido, pendente

**`reenviado`**:
Booleano marcado `true` após um re-disparo bem-sucedido. Compartilhado com o contexto DeadLetter.
_Avoid_: resent, concluído
