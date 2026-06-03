# Formato — context.md (glossário por módulo)

Um `src/<módulo>/context.md` por módulo. Glossário da linguagem ubíqua daquele contexto — **nada além disso**. Sem detalhe de implementação, sem spec, sem rascunho.

## Estrutura

```md
# {Nome do Contexto}

{Uma ou duas frases: o que este contexto é e por que existe.}

## Language

**Inbox**:
Canal lógico que recebe mensagens de um ambiente; possui uma fila RabbitMQ dedicada.
_Avoid_: canal, queue, caixa

**Ambiente**:
Tenant que agrupa inboxes e credenciais Meta.
_Avoid_: tenant, env, workspace
```

## Regras

- **Seja opinativo.** Quando existem várias palavras para o mesmo conceito, escolha a melhor e liste as outras em `_Avoid_`.
- **Definições curtas.** Uma ou duas frases. Defina o que a coisa É, não o que ela faz.
- **Só termos específicos deste contexto.** Conceitos gerais de programação (timeout, tipos de erro, padrões utilitários) não entram, mesmo que o projeto os use muito. Antes de adicionar: é um conceito único deste contexto ou conceito geral? Só o primeiro entra.
- **Agrupe termos sob subtítulos** quando clusters naturais surgirem. Se tudo pertence a uma área coesa, lista plana basta.

## Quem escreve / quem lê

- **Escreve:** `fullstack-doc-writer` (fase 4) — cria/atualiza por módulo tocado. Grilling (`fullstack-spec-mermaid`) também acrescenta termos resolvidos durante a entrevista.
- **Lê:** grilling do spec (desafia terminologia), `fix-triage` (termos do domínio). Mapa global em [`../codebase/context-map.md`](../codebase/context-map.md) — formato em [`CONTEXT-MAP-FORMAT.md`](./CONTEXT-MAP-FORMAT.md).
