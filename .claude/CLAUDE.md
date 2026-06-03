# Development Workflow

## Behavior

- Identify goal + expected output before acting. Ambiguous → ask.
- Never assume architecture, folder structure, deps, patterns not shown.
- Before new logic: "Does this already exist?"
- Follow project patterns. No personal prefs.
- Simple + readable first. Complexity only when needed.

Complex problems: decompose → state logic + confidence per part → synthesize. Confidence <0.8 → restructure.

**Output format every response:**
```
RESPOSTA CLARA: [what was done/answered]
NÍVEL DE CONFIANÇA: [0.0–1.0]
```

## Repo paths

`.repo-paths.local.json` at root (gitignored). Missing → `cp .repo-paths.example.json .repo-paths.local.json`. Never hardcode paths.

## Entry points

| Command | When |
|---|---|
| `/feature <name>` | New feature — spec → tests → code → doc |
| `/fix <description>` | Bug or refactor on existing feature |
| `/hotfix <description>` | Prod broken — always auto-mode |

Hooks block phase skills outside pipeline; never call directly. `router-prompts` hook injects enforced questions (autonomy, pre-phase-3 runner, fix branch, triage batches) while `.claude/state/*.txt` unset — record answer, goes silent.

## Codebase Map

`docs/CODEBASE.md` authoritative. Large sections in sub-files:

| Need | File |
|---|---|
| Feature → files | `docs/codebase/features.md` |
| Symbols | `docs/codebase/symbols.md` |
| ERD (per domain) | `docs/codebase/erd.md` → `erd/<domain>.md` |
| Module glossary | `src/<module>/context.md` (ubiquitous language) |
| Context relationships | `docs/codebase/context-map.md` (global) |
| Tree | `docs/codebase/structure.md` |
| Module graph, env, conventions | `docs/CODEBASE.md` inline |
| Skeletons | `docs/CODEBASE-SKELETONS.md` |
| Doc formats | `docs/conventions/{CONTEXT,CONTEXT-MAP,ADR}-FORMAT.md` |

**Before any grep/find/ls:** check map first.

**Forbidden discovery:**
- `ls`/`find`/`grep`/`Glob` to locate files/symbols/features
- `Explore`/`Agent` to locate
- `Read src/` for inspiration — use skeletons

**Permitted:**
- `Read docs/specs/*.md`, `docs/implementation/<YYYY-MM-DD>-<feature>.md`
- `grep`/`find` ONLY for internal logic inside already-identified file
- Phase 4 doc skill: `Read src/<feature>/` for files in features.md/symbols.md

Map stale → stop, tell user. Never invent.

## Zero-assumption policy

Stop and ask: scope, entities, rules, naming, edge cases, env. Never infer "reasonable defaults". List all questions at once.

## Pipeline (never skip)

1. **Spec** → `docs/specs/<YYYY-MM-DD>-<feature>.md` — AC-N Given/When/Then
2. **Tests** → one per AC, RED before phase 3
3. **Code** → tests GREEN, lint 0, build 0
4. **Doc** → `docs/implementation/<YYYY-MM-DD>-<feature>.md` + README + map updated

§7 has HTTP endpoints → backend active. New module/file/env/schema → update map before phase 4.

## NestJS

- `ValidationPipe { whitelist, forbidNonWhitelisted, transform }` global
- Services inject interfaces + tokens — never concretes
- Controllers: HTTP mapping only
- Return `ResponseDto` — never raw entities
- NestJS exceptions — never `{ error }`
- `ConfigService` — never `process.env`
- No `forwardRef`
- `Logger` — never `console.log`
- Prisma + repo wrapper · Redis via `@nestjs/cache-manager` or ioredis
- RabbitMQ via `amqp-connection-manager` wrapped in `RabbitMQModule` — never raw `amqplib` outside it

## RabbitMQ

Topology: one queue per inbox (created on demand) + one static DLQ.

- `amqp-connection-manager` for dynamic queue management — `@nestjs/microservices` RmqTransport for static queues only
- Wrap all channel ops in `RabbitMQService` (singleton `@Global()` module) injected by `IRabbitMQService` token
- Queue naming via `QueueNameFactory.inbox(id: string) → 'inbox.<id>'` — never hardcode queue names
- DLQ: single `inbox.dead-letter` queue (declared on app bootstrap)
- Each dynamic queue declared with `{ 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': 'inbox.dead-letter' }`
- Queue creation on inbox creation: `IRabbitMQService.assertQueue(name, dlqArgs)` then `startConsuming(name, handler)` — inbox service only
- Queue deletion on inbox deletion: `IRabbitMQService.stopConsuming(name)` then `deleteQueue(name)` — inbox service only
- DLQ consumer: `DeadLetterConsumerService` bootstraps on app start, consumes `inbox.dead-letter`
- `ConfigService` for `RABBITMQ_URL` — never `process.env`

## Swagger (PT-BR)

- All decorator text PT-BR (`summary`, `description`, `ApiResponse`, `ApiProperty`)
- Every DTO field: `@ApiProperty()`/`@ApiPropertyOptional()` + `description` + `example`
- Every method: `@ApiOperation` + `@ApiResponse` per status
- Guarded class: `@ApiBearerAuth('bearer')` + `@ApiTags('PT-BR')`
- Swagger UI `/docs` — never change path

## Language

Docs PT-BR (`docs/specs/`, `docs/implementation/`, README). Mermaid labels PT-BR. Code identifiers/paths/CLI/constants English.