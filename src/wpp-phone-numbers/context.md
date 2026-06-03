# WppPhoneNumbers

Proxy stateless para operações de gestão de números de telefone WhatsApp, registro, WABA, inscrições de app e inspeção de token. Não possui persistência local — encaminha todas as requisições à Meta Cloud API via `WppService`.

## Language

**Phone Number ID**:
ID Meta opaco que identifica um número de telefone registrado no WhatsApp Cloud. O proxy nunca interpreta seu valor.
_Avoid_: número, phone, telefone

**WABA**:
WhatsApp Business Account. Agrupa números de telefone e suas configurações de negócio dentro da Meta.
_Avoid_: conta, business account, BA

**Business / Business Portfolio**:
Portfólio de negócios Meta que possui ou compartilha WABAs. Identificado por um `businessId` opaco.
_Avoid_: empresa, cliente, tenant

**ID opaco**:
Identificador Meta cujo tipo (número, WABA, Business) não é inferido pelo proxy — a Meta resolve por ID. Usado em `GET /wpp/:id`.
_Avoid_: ID genérico, ID desconhecido

**name_status**:
Status de aprovação do display name de um número, obtido via `fields=name_status` na query da Meta.
_Avoid_: status do nome, aprovação

**request_code**:
Pedido de código de verificação enviado pela Meta ao número via SMS ou VOICE. Primeiro passo do fluxo de verificação.
_Avoid_: solicitar código, pedir verificação

**verify_code**:
Confirmação do código recebido para verificar o número junto à Meta. Segundo passo do fluxo de verificação.
_Avoid_: confirmar código, validar código

**Two-step verification (PIN)**:
PIN de 6 dígitos exigido pela Meta ao registrar um número na Cloud API. Definido via `POST /:phoneNumberId` com `SetTwoStepPinDto`.
_Avoid_: senha, autenticação de dois fatores, 2FA

**register**:
Registro de um número de telefone na WhatsApp Cloud API com `messaging_product: whatsapp` e PIN. Habilita o número para envio/recebimento via Cloud API.
_Avoid_: ativar, habilitar, onboarding

**deregister**:
Cancelamento do registro de um número na Cloud API. Reverte o efeito de `register`.
_Avoid_: desativar, remover, excluir número

**subscribed_apps**:
Inscrições de uma WABA para receber webhooks em um app Meta. Gerenciadas via POST (inscrever), GET (listar) e DELETE (cancelar).
_Avoid_: webhooks da WABA, apps inscritos

**override_callback_uri**:
URL de callback alternativa fornecida por WABA para sobrescrever a URL padrão do app. Acompanhada de `verify_token`.
_Avoid_: URL customizada, callback alternativo

**debug_token**:
Endpoint Meta que inspeciona metadados e validade de um access token. Útil para diagnóstico de autenticação.
_Avoid_: inspecionar token, validar token, token info
