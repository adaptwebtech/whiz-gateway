# ERD — Domínio foundation (compartilhado)

Schema compartilhado por todas as features. Fonte: `prisma/schema.prisma`.

```mermaid
erDiagram
    ambiente ||--o{ inboxes : "id_ambiente (RESTRICT)"
    inboxes ||--o{ fila_mensagens_mortas : "id_inbox (opcional, SET NULL)"

    ambiente {
        int id PK "fixo (1/2/3), sem autoincrement"
        string nome "obrigatorio"
        string url "url base do ambiente"
        boolean del "padrao false"
    }
    inboxes {
        string id PK "uuid"
        int id_ambiente FK "para ambiente.id"
        string pid "unique, phone_number_id"
        string nome "obrigatorio"
        boolean del "padrao false"
        datetime data "padrao agora"
    }
    fila_mensagens_mortas {
        string id PK "uuid"
        json message "payload cru (JSONB)"
        string id_inbox FK "nullable, para inboxes.id"
        StatusFalhaMensagem status "obrigatorio"
        boolean reenviado "padrao false"
        boolean del "padrao false"
        datetime data "padrao agora"
    }
```

**Enum `StatusFalhaMensagem`:** `INBOX_NAO_REGISTRADA`, `FALHA_ENFILEIRAMENTO`, `NACK_RECEBIDO`, `FALHA_ENVIO`, `AMBIENTE_INDISPONIVEL`.

**Constraints (migration `create_tables`):**
- `inboxes_pid_key` UNIQUE em `inboxes.pid`.
- FK `inboxes.id_ambiente` → `ambiente.id` (`ON DELETE RESTRICT ON UPDATE CASCADE`).
- FK `fila_mensagens_mortas.id_inbox` → `inboxes.id` (`ON DELETE SET NULL ON UPDATE CASCADE`).

**Seed (migration `seed_ambientes`):** `(1, development, https://dev.2.whiz.net.br)`, `(2, staging, https://staging.2.whiz.net.br)`, `(3, production, https://server.whiz.net.br)`.
