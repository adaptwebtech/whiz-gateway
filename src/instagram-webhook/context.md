# Instagram Webhook

Ingestão de webhooks de Instagram da Meta e redirecionamento passthrough do
corpo cru para o servidor whiz-v2 do ambiente correto. Cobre os inboxes
`INSTAGRAM` (Facebook Login) e `INSTAGRAM_LOGIN` (Instagram Login).

## Language

**IGID**:
Id da conta profissional de Instagram; chega em `entry[].id`. Para `INSTAGRAM`
é o `igBusinessAccountId`, para `INSTAGRAM_LOGIN` é o `igUserId`. É o `pid` do
inbox no gateway.
_Avoid_: ig id, account id, page id

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
Sufixo anexado à `ambiente.url` no forward — `/webhooks/instagram` ou
`/webhooks/instagram-login` — fixado pela rota de ingestão.
_Avoid_: rota do servidor

**Surface**:
Qual das duas rotas/tipos de Instagram recebeu o evento (`instagram` vs
`instagram-login`); determina o verify token do handshake e o sub-caminho.
_Avoid_: canal, provider
