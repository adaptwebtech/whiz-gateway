# Triage — gateway-foundation · split-interfaces-constants
> Branch: refactor  Criado: 2026-06-01

## 1. Sintoma

Três arquivos flat agrupam múltiplos exports de naturezas distintas em um único arquivo:

- `src/rabbitmq/rabbitmq.interface.ts` exporta juntos: token de injeção (`RABBITMQ_SERVICE`, Symbol), tipo auxiliar (`MessageHandler`) e interface de contrato (`IRabbitMQService`).
- `src/rabbitmq/rabbitmq.constants.ts` exporta duas constantes relacionadas mas logicamente separáveis: `DLQ_NAME` e `DEFAULT_DLQ_ARGS`.
- `src/swagger/swagger.constants.ts` exporta duas constantes de caminho: `SWAGGER_PATH` e `SWAGGER_JSON_PATH`.

Não há comportamento quebrado. O objetivo é que cada export tenha seu próprio arquivo dentro de uma subpasta `interfaces/` ou `constants/`, alinhando a estrutura ao padrão 1-export-por-arquivo.

Stacktrace: N/A — refactor estrutural sem falha de runtime.

## 2. Repro

N/A — sem mudança de comportamento.

## 3. Root cause

Os arquivos foram criados como flat single-files durante a fase de bootstrap da feature `gateway-foundation`. Não existe separação por responsabilidade dentro de `rabbitmq/` nem `swagger/`: tokens de injeção, types, interfaces e constantes de infraestrutura convivem no mesmo arquivo, dificultando descoberta e causando acoplamento desnecessário entre importadores.

Invariante quebrada: convenção de 1 símbolo exportado por arquivo (ou 1 grupo coeso por arquivo de barrel) não é respeitada em `rabbitmq.interface.ts` (3 exports de naturezas diferentes) e implicitamente nos outros arquivos.

## 4. Scope de arquivos

### Arquivos a dividir/mover (fontes)

| Arquivo atual | Exports contidos |
|---|---|
| `src/rabbitmq/rabbitmq.interface.ts` | `RABBITMQ_SERVICE` (Symbol/token) · `MessageHandler` (type) · `IRabbitMQService` (interface) |
| `src/rabbitmq/rabbitmq.constants.ts` | `DLQ_NAME` (const) · `DEFAULT_DLQ_ARGS` (const) |
| `src/swagger/swagger.constants.ts` | `SWAGGER_PATH` (const) · `SWAGGER_JSON_PATH` (const) |

### Nova estrutura proposta

```
src/rabbitmq/
  interfaces/
    rabbitmq-service.interface.ts     ← IRabbitMQService + MessageHandler (coesos: type é param da interface)
  constants/
    rabbitmq-tokens.constants.ts      ← RABBITMQ_SERVICE (token de injeção — separado de infra de fila)
    rabbitmq-queue.constants.ts       ← DLQ_NAME + DEFAULT_DLQ_ARGS (coesos: DEFAULT_DLQ_ARGS depende de DLQ_NAME)

src/swagger/
  constants/
    swagger-paths.constants.ts        ← SWAGGER_PATH + SWAGGER_JSON_PATH (coesos: mesmo domínio semântico)
```

> Nota: `MessageHandler` fica junto de `IRabbitMQService` pois é o tipo do parâmetro `handler` do contrato — não faz sentido separar. `DLQ_NAME` e `DEFAULT_DLQ_ARGS` ficam juntos pois `DEFAULT_DLQ_ARGS` referencia `DLQ_NAME` diretamente. `SWAGGER_PATH` e `SWAGGER_JSON_PATH` ficam juntos pois são dois lados do mesmo recurso.

### Arquivos importadores que precisam atualizar imports

| Importador | Import atual | Novo import |
|---|---|---|
| `src/rabbitmq/rabbitmq.service.ts` | `'./rabbitmq.constants'` → `DEFAULT_DLQ_ARGS, DLQ_NAME` | `'./constants/rabbitmq-queue.constants'` |
| `src/rabbitmq/rabbitmq.service.ts` | `'./rabbitmq.interface'` → `IRabbitMQService, MessageHandler` | `'./interfaces/rabbitmq-service.interface'` |
| `src/rabbitmq/rabbitmq.module.ts` | `'./rabbitmq.interface'` → `RABBITMQ_SERVICE` | `'./constants/rabbitmq-tokens.constants'` |
| `src/rabbitmq/rabbitmq.constants.spec.ts` | `'./rabbitmq.constants'` → `DEFAULT_DLQ_ARGS, DLQ_NAME` | `'./constants/rabbitmq-queue.constants'` |
| `src/rabbitmq/rabbitmq.service.spec.ts` | `'./rabbitmq.constants'` → `DLQ_NAME` | `'./constants/rabbitmq-queue.constants'` |
| `src/swagger/swagger.setup.service.ts` | `'./swagger.constants'` → `SWAGGER_JSON_PATH, SWAGGER_PATH` | `'./constants/swagger-paths.constants'` |

**Total: 4 arquivos de produto + 2 arquivos de teste.**

### Estratégia de barrel (opcional mas recomendada)

Manter `src/rabbitmq/rabbitmq.interface.ts` e `src/rabbitmq/rabbitmq.constants.ts` como barrel files re-exportando das subpastas elimina a necessidade de atualizar importadores externos (futuras features). Isso é uma decisão de escopo a confirmar antes da implementação.

## 5. Behavior delta

Nenhuma — refactor puramente estrutural. Mesmos símbolos, mesmos valores, mesmos tipos. Nenhum endpoint, nenhuma lógica de runtime alterada.

## 6. Risco

- **Baixo** para comportamento funcional: apenas movimentação de arquivos, sem alteração de lógica.
- **Médio** para cobertura de testes: os specs `rabbitmq.constants.spec.ts` e `rabbitmq.service.spec.ts` importam diretamente dos arquivos flat; se os caminhos de import não forem atualizados (ou se barrels não forem criados), os testes quebram com `Cannot find module`.
- Nenhuma migração de banco, nenhuma mudança de endpoint, nenhuma alteração de schema RabbitMQ.
- Features pendentes (`cadastro-inboxes`, `fila-mensagens-mortas`, `despacho-mensagens`) ainda não importam esses arquivos — sem impacto cruzado.

## 7. Plano de teste

- REG-1: `rabbitmq.constants.spec.ts` continua passando após atualização do import para `./constants/rabbitmq-queue.constants` — valida que `DLQ_NAME` e `DEFAULT_DLQ_ARGS` mantêm os mesmos valores.
- REG-2: `rabbitmq.service.spec.ts` continua passando — valida que `RabbitMQService` ainda resolve `IRabbitMQService`, `MessageHandler` e `DLQ_NAME` corretamente após remapeamento de imports.
- REG-3: `swagger.setup.service.spec.ts` continua passando — valida que `SWAGGER_PATH` e `SWAGGER_JSON_PATH` chegam com os valores corretos ao `SwaggerSetupService`.
- REG-4: `npm run build` sem erros de compilação TypeScript — valida que todos os caminhos de import foram atualizados consistentemente.
- REG-5: `npm run lint` com zero warnings/errors — valida que novos arquivos seguem convenções ESLint do projeto.
