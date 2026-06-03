---
name: fix-triage
description: Phase-1 of /fix·/hotfix via fix-router — triage doc. Don't invoke directly.
---

# fix-triage (Phase 1 — triage doc)

Read stacktrace files (max 3) + §8/§10 for the target feature + spec/impl + `src/<module>/context.md` glossary. No broad grep/find in `src/`.

## Precondition

`.claude/state/fix-mode.txt ∈ {simple-fix, refactor, hotfix}`. `none` → abort, run fix-router.

## Modes

- **simple-fix / refactor** → interactive main thread. No subagent.
- **hotfix** → dispatch `fix-triage-agent`. Stub §1/§3/§4 required, rest TODO. Phase 2 skipped.

## Workflow (simple-fix / refactor)

1. Find feature in `docs/codebase/features.md`. Absent → abort.
2. **Questions:** the `router-prompts` hook injects Batch 1 (sintoma/frequência/repro/stacktrace) and Batch 2 (confirma root cause/§4/blast-radius). Read `src/<module>/context.md` first.
3. Directed reads (between batches): spec + impl + stacktrace files (max 3) + symbols cited.
4. Formulate root cause: file + function + broken invariant. (Ask Batch 2 after this.)
5. Compose §7: REG-N (simple-fix) or CHAR-N (refactor).
6. Write `docs/fixes/<feature>-<slug>.md` (structure in [`TRIAGE-REF.md`](./TRIAGE-REF.md)).
7. Write slug to `.claude/state/fix-current.txt`.
8. Present summary. `pause` → wait approval.

Apply the **pushback doctrine** in [`TRIAGE-REF.md`](./TRIAGE-REF.md) — demand artifacts, not opinions.

## Hand-off

§7 needs REG-N / CHAR-N that `fix-regression-testing` materializes 1:1.

## Anti-patterns

Skip Q&A in simple-fix · triage with neither stacktrace nor code read · §4 "módulo inteiro" · dispatch subagent in simple-fix/refactor · forget slug in `fix-current.txt`.
