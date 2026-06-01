---
name: fix-triage
description: Internal fix-pipeline phase-1 skill. Dispatched by fix-router. Do not invoke directly — use /fix or /hotfix.
---

# fix-triage (Phase 1 — triage doc)

Read stacktrace files (max 3) + §8/§10 for target feature + spec/impl. No broad grep/find in `src/`.

## Precondition

`.claude/state/fix-mode.txt ∈ {simple-fix, refactor, hotfix}`. `none` → abort, run fix-router.

## Modes

- **simple-fix / refactor** → interactive main thread. Ask user through all 7 sections. No subagent.
- **hotfix** → dispatch `fix-triage-agent`. Stub: §1/§3/§4 required, rest TODO. Phase 2 skipped.

## Output

`docs/fixes/<feature>-<slug>.md` (slug kebab-case describing defect: `stale-cache`, `null-on-logout`).

## Structure

```markdown
# Triage — <feature> · <slug>
> Branch: <branch>  Criado: YYYY-MM-DD

## 1. Sintoma           <repro + literal stacktrace>
## 2. Repro             <numbered steps; refactor: N/A>
## 3. Root cause        <file, function, line, broken invariant>
## 4. Scope de arquivos <- src/...>
## 5. Behavior delta    <before vs after; refactor: None>
## 6. Risco             <adjacent features, prod data, migrations>
## 7. Plano de teste    <REG-N (simple-fix) | CHAR-N (refactor) | N/A (hotfix)>
```

## Workflow (simple-fix / refactor)

1. Find feature in `docs/codebase/features.md`. Absent → abort.
2. **AskUserQuestion (4 batched):**
   - Sintoma — atual vs esperado?
   - Frequência — sempre, às vezes, regressão?
   - Repro — env, payload, role, last known-good?
   - Stacktrace? (cole ou "nenhum")
3. Directed reads: spec + impl + stacktrace files (max 3) + symbols cited.
4. Formulate root cause: file + function + broken invariant.
5. **AskUserQuestion (3 batched):**
   - Confirma root cause? [Sim | Não | Parcial]
   - §4 corretos? Correções?
   - Blast radius — features adjacentes?
6. Compose §7: REG-N (simple-fix) or CHAR-N (refactor).
7. Write `docs/fixes/<feature>-<slug>.md`.
8. Write slug to `.claude/state/fix-current.txt`.
9. Present summary. `pause` → wait approval.

## Pushback doctrine

| Input | Pushback |
|---|---|
| "Fix this" sem repro | "No repro = no triage. List env, payload, role, last-known-good." |
| "500 error" só | "500 é sintoma. Logs do server? Payload? DB?" |
| "Refactor cleaner" | "Refactor needs metric: símbolo, smell, target." |
| §4 > 5 arquivos | "Scope grande = root cause mal isolado OU é refactor. Divida." |
| Fix proposto antes §3 fechada | "Risco: tratar sintoma. Volte §3." |
| "Sem REG, é simples" | "Sem REG = sem gate. Trivial demais → trivial demais pra fix dedicado." |
| Mudança contrato público | "DTO/rota/prop/env = breaking. Spec ou versionar." |

1-3 perguntas focadas por rodada. Artefatos concretos, não opiniões.

## Anti-patterns

Skip Q&A em simple-fix · 10 perguntas de uma vez · triage sem stacktrace E sem code read · §4 "módulo inteiro" · dispatch subagent em simple-fix/refactor · esquecer slug em `state/fix-current.txt`.

## Hand-off

§7 precisa ter REG-N / CHAR-N que `fix-regression-testing` materializa 1:1.