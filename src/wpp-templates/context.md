# WppTemplates

Contexto de proxy stateless para as operações de message templates da WhatsApp Cloud API. Expõe leitura, criação, edição e remoção de templates de uma WABA sem persistência local.

## Language

**Template (message template)**:
Modelo de mensagem pré-aprovado pela Meta, necessário para envio fora da janela de 24 horas. Entidade que vive exclusivamente na Meta; não é armazenada localmente.
_Avoid_: template de mensagem, modelo

**WABA**:
WhatsApp Business Account. Container que agrupa os templates de uma integração. Identificada por `:wabaId` nas rotas.
_Avoid_: conta WhatsApp, business account

**templateId**:
Identificador único de um template na Meta (`<TEMPLATE_ID>`). Usado nas operações de leitura por ID, edição e eventual exclusão por ID.
_Avoid_: id do template, template ID

**wabaId**:
Identificador da WABA (`{{WABA-ID}}`). Usado como prefixo de path nas operações de listagem, criação e remoção.
_Avoid_: id da conta, waba ID

**category**:
Categoria do template determinada pela Meta: `AUTHENTICATION`, `MARKETING` ou `UTILITY`. Documentada no DTO mas não validada localmente — a Meta é a autoridade.
_Avoid_: tipo do template, classificação

**components**:
Array JSON que descreve as partes estruturais do template (HEADER, BODY, FOOTER, BUTTONS). Passado íntegro à Meta sem inspeção do shape interno.
_Avoid_: partes do template, sections

**namespace (message_template_namespace)**:
Identificador da WABA usado para referenciar templates no envio de mensagens. Obtido via `GET /wpp/:wabaId?fields=message_template_namespace`.
_Avoid_: namespace da conta

**hsm_id**:
Identificador de um template específico (Highly Structured Message) usado na remoção por ID, combinado com `name`.
_Avoid_: id HSM, template HSM id

**Passthrough**:
Comportamento de encaminhar body ou query params à Meta sem reinterpretar, transformar ou validar o conteúdo. Válido para `components[]`, `category` e todos os query params desta feature.
_Avoid_: proxy, repasse, forward (reservado para o contrato de `WppAdapterCore`)
