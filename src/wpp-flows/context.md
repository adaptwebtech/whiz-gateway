# WppFlows

Proxy autenticado para a WhatsApp Flows API (criação, publicação, ciclo de vida e métricas de Flows interativos em uma WABA) com suporte a flows dinâmicos (gateway injeta `endpoint_uri` automaticamente) e endpoint criptografado RSA-OAEP + AES-256-GCM para interações em tempo real.

## Language

**Flow**: formulário ou jornada interativa do WhatsApp criado e versionado na Meta. Identificado por um `flowId` opaco fornecido pela Meta.
_Avoid_: "chatbot", "formulário estático", "template".

**WABA**: WhatsApp Business Account — container dos Flows na Meta. Identificado por `wabaId` nas rotas de criação.
_Avoid_: "conta", "empresa".

**Draft**: estado inicial do Flow após criação — editável, pode ser enviado em modo teste.
_Avoid_: "rascunho não publicado" (redundante).

**Published**: Flow publicado via `/publish` — imutável, enviável a usuários reais.
_Avoid_: "ativo", "live".

**Deprecated**: Flow marcado via `/deprecate` — não enviável a novos usuários, mas mantido para histórico.
_Avoid_: "desativado", "removido" (remoção é DELETE).

**UID**: identificador opaco gerado pelo gateway para uma entrada de `flow_callbacks_urls` (gerenciada por `wpp-flow-callbacks`). Presente no path das rotas dinâmicas (`:uid`) e embutido no `endpoint_uri` configurado na Meta.
_Avoid_: "ID do flow", "flowId" (são entidades distintas).

**`endpoint_uri`**: URL configurada em um Flow dinâmico para receber payloads criptografados da Meta quando o usuário interage com o Flow. Nas rotas com `:uid`, o gateway constrói e injeta este valor automaticamente: `GATEWAY_PUBLIC_URL/wpp/flows/endpoint/:uid`.
_Avoid_: "webhook URL", "callback URL" (termo próprio da API Meta Flows).

**`FLOWS_PRIVATE_KEY`**: chave privada RSA-2048 PEM armazenada como variável de ambiente. Usada para descriptografar a AES Key recebida da Meta no endpoint criptografado. Nunca logada.
_Avoid_: "chave secreta", "private key" (usar sempre o nome da env).

**`GATEWAY_PUBLIC_URL`**: URL pública e acessível do gateway (ex.: `https://gateway.example.com`). Usada para compor o `endpoint_uri` injetado nas rotas dinâmicas.
_Avoid_: "host", "base URL".

**Encrypted Payload**: corpo enviado pela Meta no endpoint criptografado — `{ encrypted_flow_data, encrypted_aes_key, initial_vector }`, todos em base64. O gateway descriptografa, processa e re-criptografa antes de responder.
_Avoid_: "payload criptado", "body da Meta".

**AES Key**: chave AES-256 gerada pela Meta por interação, criptografada com RSA-OAEP usando a chave pública do gateway. Descriptografada pelo `WppFlowsEndpointService` com `FLOWS_PRIVATE_KEY`.
_Avoid_: "chave simétrica", "session key".

**Ping**: payload especial `{ action: "ping" }` enviado periodicamente pela Meta para verificar disponibilidade do endpoint. O gateway responde com `{ data: '{"version":"3.0"}' }` re-criptografado sem chamar o URL do UID.
_Avoid_: "health check externo", "heartbeat".

**`421`**: código HTTP retornado ao indicar falha de descriptografia — sinaliza à Meta que a chave pública está desatualizada; a Meta re-busca a chave pública via `/whatsapp_business_encryption` e retenta automaticamente.
_Avoid_: "erro 421" sem contexto de re-tentativa da Meta.

**`flow_callbacks_urls`**: tabela gerenciada pelo módulo `wpp-flow-callbacks` que armazena o mapeamento `uid → url`. Consultada por `WppFlowCallbacksService.getUrl(uid)` — com cache Redis de 1 hora — pelas rotas dinâmicas e pelo endpoint criptografado.
_Avoid_: "tabela de flows", "registro de callbacks".

**IV Flipado**: convenção da Meta para re-criptografia de resposta — o primeiro byte do `initial_vector` recebido sofre XOR com `0x01` para evitar reutilização de nonce no AES-GCM.
_Avoid_: "IV invertido", "novo IV" (é derivado do original, não gerado).
