# Instagram Webhook

Ingestão de webhooks Meta de Instagram e Messenger e redirecionamento passthrough
do corpo cru para o servidor whiz-v2 do ambiente correto. Cobre os inboxes
`INSTAGRAM` (Facebook Login), `INSTAGRAM_LOGIN` (Instagram Login) e
`MESSENGER_META` (Página Facebook, object=page).

## Language

**IGID / pageId**:
Id da conta que chega em `entry[].id`. Para `INSTAGRAM` é o `igBusinessAccountId`,
para `INSTAGRAM_LOGIN` é o `igUserId`, para `MESSENGER_META` é o `pageId` da Página
Facebook. É o `pid` do inbox no gateway.
_Avoid_: ig id, account id (isolados)

**PID (estendido)**:
Identificador externo único do inbox (`inboxes.pid`). Era só o
`phone_number_id` (WhatsApp); agora também o IGID (Instagram). Agnóstico de
provedor.
_Avoid_: phone_number_id (é apenas um caso)

**Passthrough cru**:
Encaminhar os bytes exatos que a Meta assinou, sem reserializar, preservando
`x-hub-signature-256`, para que o HMAC do servidor valide.
_Avoid_: proxy, encaminhar JSON parseado

**Sub-caminho de destino**:
Sufixo anexado à `ambiente.url` no forward — `/webhooks/instagram`,
`/webhooks/instagram-login` ou `/webhooks/messenger` — fixado pela rota de
ingestão (map `SURFACE_SUBPATH`).
_Avoid_: rota do servidor

**Surface**:
Qual rota/tipo recebeu o evento (`instagram` · `instagram-login` · `messenger`);
determina o verify token do handshake e o sub-caminho. `instagram` e `messenger`
usam `META_VERIFY_TOKEN`; `instagram-login` usa `IG_VERIFY_TOKEN`.
_Avoid_: canal, provider
