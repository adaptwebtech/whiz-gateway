# WppMisc

Módulo de proxy stateless para os recursos auxiliares da WhatsApp Cloud API não cobertos por módulos com spec próprio.

## Language

**QR code (`message_qrdls`)**:
"Message QR Code / Deep Link" — código que abre uma conversa no WhatsApp com texto pré-preenchido. Identificado por `code`/`:qrCodeId`.
_Avoid_: deep link code, scan code

**`prefilled_message`**:
Texto que vem pré-preenchido na conversa ao escanear o QR code. Campo obrigatório na criação/atualização.
_Avoid_: mensagem padrão, texto inicial

**`generate_qr_image`**:
Flag de criação que indica o formato da imagem do QR a ser gerada pela Meta (`SVG` ou `PNG`). Presente apenas na criação; ausente na atualização.
_Avoid_: formato da imagem, tipo de QR

**Criação vs. atualização de QR code**:
Distinção feita exclusivamente pela **presença de `code` no body**: sem `code` → Meta cria; com `code` → Meta atualiza. O gateway repassa o body íntegro sem decidir.
_Avoid_: criar QR, atualizar QR (no adapter — a decisão é da Meta)

**Analytics**:
Métricas de mensagens enviadas/entregues, agregadas por granularidade. Consultado via `fields=analytics.start(..).end(..).granularity(..)`.
_Avoid_: métricas de mensagens, estatísticas

**Conversation analytics**:
Métricas de conversas (categorias/tipos), consultado via `fields=conversation_analytics...`. Servido pela **mesma rota** que `analytics`; desambiguado pelo conteúdo de `fields`.
_Avoid_: métricas de conversas, analytics de conversas

**Field expansion**:
Sintaxe Meta `fields=campo.param(..).sub{..}` para selecionar/parametrizar campos aninhados de um recurso. Repassada íntegra pelo gateway sem reprocessamento.
_Avoid_: query de campos, seleção de campos

**`extendedcredits`**:
Linhas de crédito estendido associadas a um Business no sistema de faturamento Meta. Recurso somente-leitura via GET.
_Avoid_: crédito, limite, saldo

**Commerce settings**:
Configuração de carrinho (`is_cart_enabled`) e visibilidade de catálogo (`is_catalog_visible`) de um número de telefone. Leitura via GET; atualização via POST com query string.
_Avoid_: configuração de e-commerce, settings de comércio

**Block users**:
Lista de usuários (números de telefone) bloqueados de enviar mensagens a um número específico. Operações: listar (GET), bloquear (POST), desbloquear (DELETE com body).
_Avoid_: banir usuário, silenciar, bloquear contato

**`messaging_product`**:
Discriminador Meta obrigatório nos bodies de `block_users` e `business_compliance_info`. Sempre `"whatsapp"`.
_Avoid_: produto, tipo de canal

**Business compliance**:
Informações de conformidade regulatória exigidas na Índia: nome/tipo de entidade, status de registro e dados do `grievance_officer`. Leitura via GET; registro via POST.
_Avoid_: compliance, conformidade de negócio

**Grievance officer**:
Responsável legal da empresa pelo recebimento e tratamento de reclamações de usuários — exigência regulatória indiana. Campos: `name`, `email`, `landline_number?`, `mobile_number?`.
_Avoid_: responsável, ombudsman, canal de reclamações

**`is_registered`**:
Flag booleana em `BusinessComplianceDto` que indica se a entidade empresarial está registrada formalmente.
_Avoid_: registrado, ativo, validado

**Proxy stateless**:
Padrão de implementação onde o controller mapeia diretamente HTTP → `WppService.forward` sem service de domínio intermediário, sem persistência local e sem reinterpretação da resposta da Meta.
_Avoid_: pass-through controller, thin controller
