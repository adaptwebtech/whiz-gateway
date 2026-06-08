# Redirecionamentos Webhooks

Registros de redirecionamento temporário de webhooks para URLs externas com TTL configurável. O gateway repassa o payload bruto do webhook a todas as URLs ativas elegíveis em fire-and-forget.

## Language

**Redirecionamento**:
Registro que mapeia uma URL externa para receber cópias de webhooks. Possui TTL (`data_expiracao`) e filtro opcional de ambiente.
_Avoid_: regra, forward, proxy

**Ativo**:
Redirecionamento com `del=false` e (`data_expiracao IS NULL` OR `data_expiracao > now()`).
_Avoid_: válido, habilitado, vigente

**data_expiracao**:
DateTime após o qual o redirecionamento não é mais elegível para dispatch. `null` = nunca expira. Padrão: `now() + 15 min`.
_Avoid_: TTL, validade, timeout

**Dispatch**:
Ação de repassar o payload bruto do webhook a todos os redirecionamentos ativos elegíveis para o ambiente resolvido via PID → inbox.
_Avoid_: envio, forward, relay

**Fire-and-forget**:
Dispatch inicia os envios HTTP e retorna imediatamente. Erros são logados; não propagados ao caller.
_Avoid_: assíncrono (genérico demais)

**Elegível**:
Redirecionamento ativo cujo `id_ambiente` corresponde ao do inbox resolvido (`id_ambiente = X OR id_ambiente IS NULL`).
_Avoid_: aplicável, compatível
