# Webhook

Ingestão de eventos Meta. Valida o handshake e a assinatura HMAC, depois trafega o payload cru sem interpretá-lo.

## Language

**Verify token**:
`META_VERIFY_TOKEN`, comparado ao `hub.verify_token` no handshake de verificação do webhook.
_Avoid_: token de verificação, chave

**App secret**:
`META_APP_SECRET`, chave HMAC usada para validar `X-Hub-Signature-256`.
_Avoid_: segredo, secret key

**Raw body**:
Corpo HTTP cru (bytes), necessário para validar a assinatura HMAC corretamente.
_Avoid_: body, payload parseado

**Passthrough**:
O gateway não interpreta o conteúdo do payload; trafega o JSON cru até a fila.
_Avoid_: proxy, encaminhamento, parse

**PID**:
`phone_number_id` extraído de `entry[].changes[].value.metadata.phone_number_id`; correlaciona o webhook a um inbox.
_Avoid_: phone, número

**HMAC divergente**:
`X-Hub-Signature-256` presente mas o HMAC do corpo cru com `META_APP_SECRET` não confere. Causa provável: entrega de um app Meta diferente (ex.: Instagram Login, app separado, deve ir a `POST /webhook/instagram-login`).
_Avoid_: assinatura ausente (causa distinta)
