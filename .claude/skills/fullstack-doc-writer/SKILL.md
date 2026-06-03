---
name: fullstack-doc-writer
description: Phase-4 of /feature via feature-router — impl doc from code + sync maps & per-module context docs. Don't invoke directly.
---

# Backend Implementation Doc Writer

Phase 4 exception: Read `src/<feature>/` files listed in features.md/symbols.md. No broad scans. Feature absent from maps → stop.

## Output

`docs/implementation/<feature>.md`. Template + source-extraction table + workflow in [`DOC-TEMPLATE.md`](./DOC-TEMPLATE.md).

## Mandatory map sync (same commit)

- `docs/codebase/features.md` — add/update feature → files entry
- `docs/codebase/erd.md` — regenerate if `schema.prisma` changed
- `docs/codebase/symbols.md` — add services, controllers, public DTOs, interfaces
- **`src/<module>/context.md`** — per touched module: create/update the glossary. Glossary ONLY — no implementation detail. Format: `docs/conventions/CONTEXT-FORMAT.md`.
- **`docs/codebase/context-map.md`** — global: refresh the module's `## Contexts` entry + its `## Relationships` edges. Format: `docs/conventions/CONTEXT-MAP-FORMAT.md`.

## Dispatch

Validate preconditions (impl done). Read spec §6 ACs as context. Invoke `fullstack-doc-writer-agent`. Direct edit only for trivial.
