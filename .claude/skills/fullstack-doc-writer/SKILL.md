---
name: fullstack-doc-writer
description: Internal phase-4 skill dispatched by feature-router. Derives implementation doc from code on disk. Do not invoke directly — use /feature.
---

# Backend Implementation Doc Writer

Phase 4 exception: Read `src/<feature>/` files listed in features.md/symbols.md. No broad scans. Feature absent from maps → stop.

## Mandatory map sync (same commit)

- `docs/codebase/features.md` — add/update feature → files entry
- `docs/codebase/erd.md` — regenerate if `schema.prisma` changed
- `docs/codebase/symbols.md` — add services, controllers, public DTOs, interfaces

## Output

`docs/implementation/<feature-name>.md`. Exists → **update**, preserve human notes unless invalidated.

## Source extraction

| File | Extract |
|---|---|
| `*.controller.ts` | Endpoint table: method, path, guards, DTO, return, status |
| `*.module.ts` | imports, exports, providers (token bindings) |
| `dto/*.ts` | Fields, types, validators, transforms |
| `entities/*` / schema | Columns, indexes, relations |
| `*.service.ts` | Public signatures |
| `interfaces/*` + `tokens.ts` | Extension points |
| `ConfigService.get(...)` | Config table |

No source → "None". Never invent.

## Doc structure

```markdown
# <Feature Name>
> **Status:** stable | in-progress | deprecated
> **Spec:** docs/specs/<feature>.md
> **Backend:** src/<feature>/

## 1. Overview
## 2. Public API (HTTP) — table + per-endpoint detail + curl
## 3. Module surface — import, exports, config, peers
## 4. System architecture — Mermaid (class, sequence, state)
## 5. Data model — erDiagram from actual columns
## 6. DTOs — field tables with validators
## 7. Configuration — env var table
## 8. Dependencies — internal, external, libs
## 9. Extension points — interfaces, events, hooks
## 10. Errors — exception → status → trigger table
## 11. Operational notes
## 12. Spec drift (empty if aligned)
## 13. Changelog (append-only, dated)
```

## Workflow

1. Read `*.module.ts` — map surface.
2. Walk controller — endpoint table + thrown exceptions via service.
3. Walk DTOs — field tables.
4. Walk entities — ER from columns.
5. Grep `ConfigService.get` — config table.
6. Diff vs spec — note drift.
7. Preserve human content (ops notes, changelog).
8. Append changelog, never rewrite.

## Include / skip

**Include:** endpoints, exports, config, errors, extension points.
**Skip:** private helpers, spec "why" (link to spec), test details.

## Anti-patterns

Regenerating spec · lying about coverage · rewriting changelog · prose blobs instead of tables · stale curl · ignoring drift.

## Dispatch

Validate preconditions (impl done). Read spec §6 ACs as context. Invoke `fullstack-doc-writer-agent`. Direct edit only for trivial.