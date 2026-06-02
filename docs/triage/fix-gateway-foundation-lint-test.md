# Triage — gateway-foundation · lint-test
> Branch: simple-fix  Criado: 2026-06-01

## 1. Sintoma

`npm run lint` e `npm run test` falham. Dois pontos de falha independentes:

**Lint:**
```
Cannot find module 'swagger-ui-dist' or its corresponding type declarations.
(ou erro equivalente de parserService / resolução de tipos no ESLint type-checked)
```

**Test (app.module.scheduler.spec.ts — AC-14):**
```
Cannot find module 'swagger-ui-dist' from 'src/swagger/swagger.setup.service.ts'
```
O teste que faz bootstrap completo do `AppModule` explode antes de chegar ao assert porque `SwaggerSetupService` importa `swagger-ui-dist` no topo do módulo e o pacote não está instalado.

Todos os outros testes unitários (queue-name.factory, rabbitmq.constants, rabbitmq.service, global-exception.filter, config, prisma/schema, prisma/migrations) não dependem de `swagger-ui-dist` e devem passar de forma independente.

## 2. Repro

1. Clonar o repositório e executar `npm install` (o `package.json` não contém `swagger-ui-dist`).
2. Executar `npm run lint` — ESLint usa `tseslint.configs.recommendedTypeChecked` com `parserOptions.projectService: true`; o compilador TS falha ao resolver `swagger-ui-dist`, propagando erro para o lint.
3. Executar `npm run test` — Jest carrega `app.module.scheduler.spec.ts`, que importa `AppModule`, que registra `AppSwaggerModule`, que instancia `SwaggerSetupService`, que executa `import * as swaggerUiDist from 'swagger-ui-dist'` no topo do arquivo — módulo ausente, Jest rejeita a carga.

## 3. Root cause

**Causa raiz única:** `swagger-ui-dist` está sendo usado em
`src/swagger/swagger.setup.service.ts` (linha 5) mas não está declarado em
`dependencies` nem em `devDependencies` do `package.json`.

- `SwaggerSetupService.onModuleInit` chama
  `(swaggerUiDist as { getAbsoluteFSPath: () => string }).getAbsoluteFSPath()`
  para localizar os assets estáticos da UI (linhas 44-46).
- O import é estático (top-level), portanto qualquer ambiente que não tenha o
  pacote instalado falha na resolução do módulo antes mesmo de qualquer lógica
  ser executada.
- O eslint config usa `tseslint.configs.recommendedTypeChecked` com
  `parserOptions: { projectService: true }`, que exige que todos os imports
  sejam resolvíveis pelo compilador TS; a ausência do pacote produz erro de
  compilação durante a análise do lint.

Invariante quebrada: toda dependência usada em código-fonte deve estar listada
em `package.json`.

## 4. Scope de arquivos

- `package.json` — adicionar `swagger-ui-dist` em `dependencies`
- `src/swagger/swagger.setup.service.ts` — nenhuma mudança de lógica; só
  confirmação de que o import resolve após a correção acima

## 5. Behavior delta

Antes: `npm run lint` e `npm run test` (suite `app.module.scheduler.spec.ts`)
falham com `Cannot find module 'swagger-ui-dist'`.

Depois: o pacote é resolvido normalmente; lint passa sem erros de resolução de
módulo; teste AC-14 chega ao assert e verifica `SchedulerRegistry`.

## 6. Risco

Baixo. A correção é puramente aditiva (declaração de dependência já usada em
produção). Nenhuma migração de schema, nenhum endpoint alterado, nenhuma
lógica de negócio modificada. Risco adjacente: se a versão instalada
implicitamente (`node_modules`) divergir da fixada no `package.json`, pode
haver mismatch de assets estáticos do Swagger UI — mitigado fixando a mesma
versão já presente em `node_modules`.

## 7. Plano de teste

- REG-1: `npm run lint` executa sem erros após adicionar `swagger-ui-dist` ao `package.json`.
- REG-2: `npm run test` executa `app.module.scheduler.spec.ts` com sucesso (AC-14 verde).
- REG-3: `GET /docs` retorna `200 text/html` com Swagger UI (validação manual ou e2e existente AC-7).
