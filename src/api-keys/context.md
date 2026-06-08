# API Keys

Contexto responsável pela emissão, armazenamento seguro e revogação de chaves de API que autenticam integrações externas nas rotas `/wpp/*` do gateway.

## Language

**rawKey**:
Valor secreto da chave em texto plano, 64 caracteres hexadecimais. Gerado com CSPRNG, retornado uma única vez na criação e nunca persistido ou logado.
_Avoid_: "chave em claro", "API key value", "token"

**hashedKey**:
SHA-256 de `rawKey + salt`. Único valor derivado do segredo que é persistido no banco e no cache Redis.
_Avoid_: "hash da chave", "key hash"

**salt**:
Bytes aleatórios por chave (32 hex chars), gerados com CSPRNG e persistidos. Individualiza o hash de cada chave.
_Avoid_: "nonce", "pepper"

**AdminKeyGuard**:
Guard que protege os endpoints de gestão (`/api-keys`). Valida o header `Authorization: Bearer {ADMIN_API_KEY}` com comparação timing-safe.
_Avoid_: "autenticação de admin", "bearer guard"

**ApiKeyGuard**:
Guard que protege as rotas de integração (`/wpp/*`). Lê o header `X-API-KEY`, consulta o cache Redis e valida o hash com comparação timing-safe.
_Avoid_: "guard de integração", "key guard"

**cache Redis**:
Hash `apikeys:valid` no Redis onde field = uid e value = JSON `{hashedKey, salt, name}`. Populado no boot e mantido sincronizado. Elimina acesso ao banco no caminho quente de validação.
_Avoid_: "cache de chaves", "Redis hash"

**AdminOrApiKeyGuard**:
Guard composto que aceita requisições autenticadas via `AdminKeyGuard` **ou** `ApiKeyGuard`. Tenta o caminho admin (síncrono, sem I/O) primeiro; se falhar, consulta o Redis via `ApiKeyGuard`. Lança `UnauthorizedException` apenas se ambos falharem. Usado por `InboxController` para aceitar tanto operadores internos quanto integrações externas.
_Avoid_: "guard duplo", "multi-guard", "guard combinado"

**revogação**:
Soft-delete da chave (`del = true`) combinado com remoção imediata do campo correspondente no cache Redis. Após a revogação, toda validação via `ApiKeyGuard` passa a retornar `401`.
_Avoid_: "exclusão", "delete", "invalidação"
