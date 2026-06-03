# Triage reference — structure + pushback

## Doc structure — `docs/fixes/<feature>-<slug>.md`

Slug kebab-case describing the defect (`stale-cache`, `null-on-logout`).

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

## Pushback doctrine

Demand concrete artifacts, not opinions. ≤3 focused questions per round.

| Input | Pushback |
|---|---|
| "Fix this" sem repro | "No repro = no triage. List env, payload, role, last-known-good." |
| "500 error" só | "500 é sintoma. Logs do server? Payload? DB?" |
| "Refactor cleaner" | "Refactor needs metric: símbolo, smell, target." |
| §4 > 5 arquivos | "Scope grande = root cause mal isolado OU é refactor. Divida." |
| Fix proposto antes §3 fechada | "Risco: tratar sintoma. Volte §3." |
| "Sem REG, é simples" | "Sem REG = sem gate. Trivial demais → trivial demais pra fix dedicado." |
| Mudança contrato público | "DTO/rota/prop/env = breaking. Spec ou versionar." |
