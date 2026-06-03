---
name: backend-implementation
description: Phase-3 of /feature via feature-router — implement NestJS modules until tests GREEN. Don't invoke directly.
---

# Backend Implementation — NestJS + Prisma

Phase 3: spec + tests exist. Write code → tests GREEN. NestJS conventions in `.claude/CLAUDE.md`. Skeletons in `docs/CODEBASE-SKELETONS.md`.

## Folder layout

```
src/<feature>/
  dto/  entities/  interfaces/
  <x>.controller.ts  <x>.service.ts  <x>.repository.ts
  <x>.module.ts  tokens.ts
```

Tests alongside source (`*.spec.ts`). E2E in `test/`.

## Rules

- **No inline types.** Every shape needs name. HTTP → DTO class. Internal → interface. Naked `Partial`/`Omit` in signatures forbidden.
- **DTOs:** `CreateXDto` (POST), `UpdateXDto = PartialType(CreateXDto)` from `@nestjs/swagger`, `XQueryDto` (GET), `XResponseDto` (return).
- **One module per feature.** No `forwardRef`. No `@Global()`. Export minimum.
- **DI by interface + token.** `{ provide: TOKEN, useClass: Impl }`. Never inject concretes.
- **Services:** one reason to change. NestJS exceptions only. `ConfigService` not `process.env`. `Logger` not `console.log`. Return `plainToInstance(ResponseDto, x, { excludeExtraneousValues: true })`.
- **Controllers:** HTTP mapping only. `@ApiBearerAuth('bearer')` on guarded class. `@ApiTags('PT-BR')`. `@ApiOperation` + `@ApiResponse` per method/status in PT-BR.
- **Repository pattern:** service depends on own repo interface, not Prisma.

## Exceptions

`BadRequestException` 400 · `UnauthorizedException` 401 · `ForbiddenException` 403 · `NotFoundException` 404 · `ConflictException` 409 · `InternalServerErrorException` 500.

## RabbitMQ

- `RabbitMQModule` (`@Global()` singleton): wraps `amqp-connection-manager`, exports `RABBITMQ_SERVICE` token → `IRabbitMQService`
- `QueueNameFactory`: static `inbox(id: string) → 'inbox.<id>'`
- **Inbox creation**: service calls `assertQueue(QueueNameFactory.inbox(id), dlqArgs)` → `startConsuming(name, handler)`
- **Inbox deletion**: service calls `stopConsuming(name)` → `deleteQueue(name)`
- **DLQ consumer**: `DeadLetterConsumerService` — `OnApplicationBootstrap`, consumes `inbox.dead-letter`
- Queue lifecycle lives only in inbox service — not in repository, not in controller
- Never import `amqplib` directly outside `RabbitMQModule`

## Order (TDD)

`prisma generate` → entities → DTOs + `@ApiProperty` → interfaces + tokens → repo (green) → service (green) → controller + Swagger (green) → module wiring (e2e green) → AppModule register.

No advance with red tests.

## Lint gate (mandatory)

`./node_modules/.bin/eslint "{src,test}/**/*.ts" --no-fix` → 0 errors. Common fixes:
- `no-unsafe-*` → cast or explicit type
- `ValidateIf` lambda → always type param: `(o: SomeDto) => ...`

## Anti-patterns

Fat controllers · raw entities returned · `any`/inline types · ORM leak into interfaces · `catch { return null }` · `new Service(...)` outside tests.

## Dispatch

Validate preconditions (spec + tests exist). Read spec §6 `[backend]` ACs + §7 API contract. Invoke `backend-implementation-agent`. Direct edit only for trivial tasks.