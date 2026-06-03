# Ambiente

Destino lógico de re-envio. Cada ambiente tem uma `url` base para onde o payload cru é re-disparado.

## Language

**Ambiente**:
Destino lógico do re-envio (`development`/`staging`/`production`), cada um com uma `url` base; `id` fixo.
_Avoid_: tenant, env, workspace, destino

**Soft-delete (`del`)**:
Booleano `del = true` que oculta o registro das listagens sem removê-lo fisicamente. Presente em todas as tabelas.
_Avoid_: arquivar, desativar, hard-delete
