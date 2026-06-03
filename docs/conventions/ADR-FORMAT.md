# Formato — ADR (Architecture Decision Record)

ADRs ficam em `docs/adr/` com numeração sequencial: `0001-slug.md`, `0002-slug.md`. Crie `docs/adr/` de forma preguiçosa — só quando o primeiro ADR for necessário.

## Template

```md
# {Título curto da decisão}

{1-3 frases: qual o contexto, o que decidimos e por quê.}
```

Só isso. Um ADR pode ser um único parágrafo. O valor está em registrar *que* uma decisão foi tomada e *por quê* — não em preencher seções.

## Seções opcionais

Inclua apenas quando agregam valor real. A maioria dos ADRs não precisa.

- **Status** (`proposed | accepted | deprecated | superseded by ADR-NNNN`) — útil quando decisões são revisitadas.
- **Considered Options** — só quando as alternativas rejeitadas valem ser lembradas.
- **Consequences** — só quando efeitos não-óbvios precisam ser destacados.

## Numeração

Varra `docs/adr/` pelo maior número existente e incremente em um.

## Quando oferecer um ADR

Os três precisam ser verdadeiros:

1. **Difícil de reverter** — o custo de mudar de ideia depois é relevante.
2. **Surpreendente sem contexto** — um leitor futuro olhará o código e perguntará "por que fizeram assim?".
3. **Resultado de um trade-off real** — havia alternativas genuínas e uma foi escolhida por razões específicas.

Se qualquer um falta, pule o ADR. Fácil de reverter → você só reverte. Não surpreendente → ninguém pergunta por quê. Sem alternativa real → nada a registrar além do óbvio.

### O que qualifica

- **Forma arquitetural.** "Write model é event-sourced; read model projetado no Postgres."
- **Padrões de integração entre contextos.** "Ordering e Billing se comunicam por eventos de domínio, não HTTP síncrono."
- **Escolhas de tecnologia com lock-in.** Banco, message bus, auth, deploy target. Não toda lib — só as que levariam um trimestre pra trocar.
- **Decisões de fronteira/escopo.** "Dados do cliente pertencem ao contexto Customer; outros referenciam por ID." Os não-s são tão valiosos quanto os sim-s.
- **Desvios deliberados do caminho óbvio.** "Usamos SQL manual em vez de ORM porque X." Impede o próximo engenheiro de "consertar" algo deliberado.
- **Restrições não visíveis no código.** "Não podemos usar AWS por compliance." "Resposta < 200ms por contrato com parceiro."
- **Alternativas rejeitadas quando a rejeição é não-óbvia.** Considerou GraphQL e escolheu REST por razões sutis? Registre — senão alguém sugere GraphQL de novo em seis meses.
