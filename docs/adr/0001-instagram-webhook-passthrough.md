# Redirecionamento de webhooks de Instagram por passthrough cru

**Status**: accepted

O gateway redireciona webhooks de Instagram (`INSTAGRAM` e `INSTAGRAM_LOGIN`)
para o servidor whiz-v2 encaminhando os **bytes crus** exatos que a Meta
assinou, junto do header `x-hub-signature-256` original, sem verificar o HMAC
no gateway e sem reserializar o corpo. O servidor whiz-v2 é o único verificador
da assinatura (já re-verifica com `FB_APP_SECRET`/`IG_APP_SECRET`). Escolhido
para não duplicar os segredos de app no gateway e porque qualquer
reserialização quebraria o HMAC do servidor.

## Considered Options

- **Verificar no gateway também** (defense-in-depth): rejeitado — exigiria
  `FB_APP_SECRET`/`IG_APP_SECRET` no gateway (sprawl de segredos) sem ganho
  real, já que o servidor re-verifica de qualquer forma.
- **Fan-out por `entry[]`**: inviável sob passthrough — o gateway não tem
  segredo para re-assinar corpos parciais; corpos por-entry falhariam o HMAC do
  servidor.

## Consequences

- Roteamento em lote usa `entry[0].id`; o corpo cru inteiro vai a um único
  ambiente. Entries de outros ambientes num mesmo lote são ignorados pelo
  servidor destino (aceito).
- O que a DLQ persiste (`message` JSON parseado) é insuficiente para re-HMAC —
  reenvio de webhooks de Instagram mortos não é suportado sem gravar rawBody +
  assinatura. Aceito para v1.
- O gateway responde `200` ao Meta em falhas internas (fire-and-forget) para
  não acionar a fila de retry da Meta.
