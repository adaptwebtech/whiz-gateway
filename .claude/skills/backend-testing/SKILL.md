---
name: backend-testing
description: Phase-2 of /feature via feature-router — Jest+Supertest tests from spec ACs. Don't invoke directly.
---

# Backend Testing — Jest + Supertest (NestJS)

Phase 2: spec with ACs exists. Write failing tests. No impl. Skeletons in `docs/CODEBASE-SKELETONS.md`.

## Three layers

| Layer | Scope | Mock |
|---|---|---|
| Unit | One class | All deps |
| Integration | Controller + real service + pipes/guards | DB, HTTP, queues |
| E2E | Full `AppModule` + Supertest | True externals only |

## File layout

```
src/<feature>/<x>.service.spec.ts          # unit
src/<feature>/<x>.controller.spec.ts       # integration
src/<feature>/dto/create-<x>.dto.spec.ts   # unit (DTO validation)
test/<feature>.e2e-spec.ts                 # e2e
```

## AC mapping (mandatory)

Every test name refs AC ID: `it('AC-3: rejects empty items array with 400', ...)`. Untested AC = not done.

## AAA anatomy

Arrange → Act → Assert, blank line between. `describe` groups by behavior not method.

## Layer rules

- **Unit:** manual instantiation (`new Service(...mocks)`) preferred over `Test.createTestingModule`. `jest.fn()` mocks + `jest.resetAllMocks()` in `beforeEach`.
- **Integration:** `Test.createTestingModule`, override boundaries only. Keep real `ValidationPipe { whitelist: true, transform: true }`, DTOs, guards.
- **E2E:** real `AppModule`. Override only true externals. Real Postgres (Docker/Testcontainers — never SQLite). `npx prisma migrate deploy` before. Clean tables in `beforeEach` in FK order.

## RabbitMQ mocks

- **Unit / Integration:** override `RABBITMQ_SERVICE` token with `{ assertQueue: jest.fn(), deleteQueue: jest.fn(), startConsuming: jest.fn(), stopConsuming: jest.fn() }`. Never open real AMQP connection.
- **E2E (queue lifecycle ACs):** use real RabbitMQ (Docker). After inbox creation assert queue exists via `channel.checkQueue(name)`. After deletion assert queue gone (`checkQueue` throws). Assert DLQ receives message by triggering consumer error and polling `inbox.dead-letter`.
- **Consumer unit test:** instantiate handler class directly, call the handler method, assert side effects (repo calls, events).

## Lint-safe supertest (mandatory)

```ts
import request from 'supertest';
import { App } from 'supertest/types';
let app: INestApplication<App>;

// Body access:
const res = await request(app.getHttpServer()).get('/items/1').expect(200);
const body = res.body as Record<string, unknown>;
expect(body.id).toBe('abc');
```

**NEVER** `const request = require('supertest')` or untyped `INestApplication`.

`expect.objectContaining()` as property value → suppress on that line:
```ts
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
nested: expect.objectContaining({ id: 1 }),
```

Outer arg of `toHaveBeenCalledWith` needs no suppression.

## Guards override

```ts
.overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
```

Role stub: read `req.headers['x-test-role']`, set `req.user` inside `canActivate`.

## Coverage

Unit 80-95% services. Integration: every route × every documented status. E2E: happy path + auth/ownership/payment fail. Don't e2e every 400.

## Will NOT do

No Cypress/Playwright. No snapshots on responses. Don't test framework (`@IsEmail`).

## Anti-patterns

Mocking what you're testing · shared state · asserting on logs · `toBeDefined()` only · `try/catch` instead of `rejects.toBeInstanceOf` · giant `it`.

## Lint gate

`./node_modules/.bin/eslint "{src,test}/**/*.ts" --no-fix` → 0 errors.

## Dispatch

Validate preconditions (spec with ACs). Read spec §6 `[backend]` ACs + §7 API contract. Invoke `backend-testing-agent`. Direct edit only for trivial.