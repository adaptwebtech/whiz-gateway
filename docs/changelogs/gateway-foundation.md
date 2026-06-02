# Changelog — gateway-foundation

## 2026-06-01 · refactor · split-interfaces-constants

- Sintoma: 3 arquivos planos agrupavam símbolos de responsabilidades distintas (interface, tokens de DI, constantes de fila, constantes de rota Swagger), dificultando a localização e o import seletivo.
- Root cause: ausência de estrutura de subpastas na origem — todos os símbolos eram co-localizados em `rabbitmq.interface.ts`, `rabbitmq.constants.ts` e `swagger.constants.ts`.
- Fix: split em subpastas por grupo coeso — `interfaces/` e `constants/` para RabbitMQ; `constants/` para Swagger. Imports em 7 arquivos atualizados. Sem alteração de lógica ou contratos públicos. Adicionados `rabbitmq-exports.char.spec.ts` e `swagger-exports.char.spec.ts` como regressão de exports.
- Arquivos: `src/rabbitmq/interfaces/rabbitmq-service.interface.ts` · `src/rabbitmq/constants/rabbitmq-tokens.constants.ts` · `src/rabbitmq/constants/rabbitmq-queue.constants.ts` · `src/swagger/constants/swagger-paths.constants.ts` · `src/rabbitmq/rabbitmq-exports.char.spec.ts` · `src/swagger/swagger-exports.char.spec.ts` · `src/rabbitmq/rabbitmq.service.ts` · `src/rabbitmq/rabbitmq.module.ts` · `src/rabbitmq/rabbitmq.constants.spec.ts` · `src/rabbitmq/rabbitmq.service.spec.ts` · `src/swagger/swagger.setup.service.ts`
- REG: REG-1, REG-2
- Triage: docs/fixes/gateway-foundation-split-interfaces-constants.md

## 2026-06-02 · hotfix · ts-strict-property-init

- Sintoma: build TypeScript falhava com TS2564 em propriedades de classes DTO e service que não são inicializadas no construtor, mas via injeção de dependência ou reflexão de decoradores NestJS.
- Root cause: `strictPropertyInitialization` não estava explicitamente desativado no `tsconfig.json`; com `strict` implícito o compilador exigia inicialização definitiva de todas as propriedades de classe.
- Fix: adicionado `"strictPropertyInitialization": false` em `compilerOptions` do `tsconfig.json`, alinhando o comportamento do compilador com o padrão de inicialização por reflexão usado pelo NestJS em DTOs e injectáveis.
- Arquivos: `tsconfig.json`
- REG: n/a
- Triage: docs/fixes/gateway-foundation-ts-strict-property-init.md

## 2026-06-01 · simple-fix · gateway-foundation-lint-test

- Sintoma: ESLint type-checked e bootstrap do `AppModule` nos testes falhavam com "Cannot find module 'swagger-ui-dist'".
- Root cause: `swagger-ui-dist` estava ausente do `package.json`; o `SwaggerSetupService` usa `getAbsoluteFSPath()` desse pacote em runtime, inclusive durante o bootstrap de testes.
- Fix: adicionado `"swagger-ui-dist": "5.32.6"` em `dependencies` no `package.json`; criado `src/swagger/swagger.setup.service.spec.ts` com testes de regressão REG-1 e REG-2.
- Arquivos: `package.json` · `src/swagger/swagger.setup.service.spec.ts`
- REG: REG-1, REG-2
- Triage: docs/fixes/gateway-foundation-lint-test.md
