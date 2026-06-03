---
name: fullstack-spec-mermaid
description: Phase-1 of /feature via feature-router — grill, then write docs/specs/<feature>.md. Don't invoke directly.
---

# Backend Spec with Mermaid

Phase 1: produce `docs/specs/<YYYY-MM-DD>-<feature>.md` (date = today, name kebab-case). Spec = contract every downstream phase must satisfy. **Grill before you write.**

## Workflow

1. **Grill first.** Read [`GRILLING.md`](./GRILLING.md) and interview the user one question at a time until convergence. Read the relevant `src/<module>/context.md` glossary first to challenge terminology. Map answers via `docs/codebase/` instead of asking when possible. **Do not write the spec file until grilling converges.**
2. **Write the spec.** Use the 14-section layout, diagram table, and FR/AC/API/QUEUE formats in [`SPEC-TEMPLATE.md`](./SPEC-TEMPLATE.md). Unresolved items → §14 Open questions, never a half-asked spec.
3. **Capture terms.** New domain terms resolved during grilling → append to `src/<module>/context.md` (format: `docs/conventions/CONTEXT-FORMAT.md`).
4. **Offer ADR only if it qualifies** — hard to reverse + surprising + real trade-off → `docs/adr/NNNN-slug.md` (format: `docs/conventions/ADR-FORMAT.md`). Otherwise skip.

The router-prompts hook injects the glossary-read reminder when this skill triggers.
