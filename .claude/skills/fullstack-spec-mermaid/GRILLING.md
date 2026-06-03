# Grilling — interrogate before writing the spec

Goal: reach shared, unambiguous understanding **before** a single spec section is written. The spec is a contract; a fuzzy contract poisons every downstream phase.

## Protocol

- **Interview relentlessly.** Walk each branch of the design tree, resolving dependencies one decision at a time.
- **One question at a time. Wait for the answer before the next.** No 10-question dumps.
- **Recommend an answer per question.** State your default + confidence; let the user confirm or correct.
- **Map before asking.** If a question is answerable from the codebase map (`docs/codebase/features.md`, `symbols.md`, `src/<module>/context.md`, existing specs), consult the map instead of asking. Never broad-grep `src/` — respects the zero-discovery rule.
- Stop only when two engineers would build the same thing from the answers.

## During the session

### Challenge against the glossary
Read the relevant `src/<module>/context.md` first. When a term the user uses conflicts with the glossary, flag it immediately:
> "Glossary defines 'inbox' as a logical channel with a dedicated queue — you seem to mean the Meta phone number. Which is it?"

### Sharpen fuzzy / overloaded language
Vague or doubled-up term → propose a precise canonical one:
> "You said 'mensagem' — the inbound webhook payload, or the dispatched outbound record? Different entities."

### Stress-test with concrete scenarios
When domain relationships come up, invent edge scenarios that force precision about boundaries:
> "Ambiente deleted while an inbox still has un-consumed messages — queue dropped, drained, or blocked?"

### Cross-reference with code
When the user states how something works, check the map/skeletons. Surface contradictions:
> "Symbols show `DispatchService` retries 5×, but you just said 3 — which is right?"

### Capture terms inline
When a domain term is resolved, append it to that module's `src/<module>/context.md` right then (format: `docs/conventions/CONTEXT-FORMAT.md`). Glossary only — no implementation detail. Don't batch.

## Convergence → hand to spec

Only after grilling converges, write `docs/specs/<feature>.md` using `SPEC-TEMPLATE.md`. Unresolved items go to spec §14 Open questions — not into a half-asked spec.

## ADR offer (sparingly)

Offer an ADR (`docs/adr/NNNN-slug.md`, format `docs/conventions/ADR-FORMAT.md`) only when all three hold: hard to reverse · surprising without context · result of a real trade-off. Otherwise skip.
