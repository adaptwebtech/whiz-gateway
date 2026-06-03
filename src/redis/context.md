# Redis

Infraestrutura global de acesso ao Redis via `ioredis`, exposta como módulo `@Global()` para todos os contextos do gateway que precisam de cache ou estado compartilhado em memória.

## Language

**RedisService**:
Wrapper injetável sobre o client `ioredis`. Expõe operações hash (`hset`, `hgetall`, `hdel`), string (`get`) e key (`del`). Toda lógica de serialização fica na camada do chamador.
_Avoid_: "cliente Redis", "ioredis wrapper"

**REDIS_CLIENT**:
Token de injeção (Symbol) que provê a instância bruta `ioredis.Redis`. Disponível globalmente para módulos que precisam de operações não cobertas pelo `RedisService`.
_Avoid_: "token do Redis", "ioredis token"

**hash Redis**:
Estrutura de dados chave→campo→valor usada para agrupar entradas relacionadas (ex.: `apikeys:valid`). Permite operações atômicas por campo sem carregar toda a estrutura.
_Avoid_: "mapa Redis", "Redis map"
