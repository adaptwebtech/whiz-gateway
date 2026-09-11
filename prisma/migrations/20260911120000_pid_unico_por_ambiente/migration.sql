-- `pid` passa a ser único POR AMBIENTE, e não globalmente.
--
-- `development`, `staging` e `production` são deployments distintos do whiz atrás
-- do mesmo gateway. O mesmo número pode estar cadastrado em mais de um — o caso
-- comum é um número usado em teste que depois vai para produção.
--
-- Com o unique global, o segundo cadastro batia em 409; e o whiz, que trata 409
-- como "já registrado", marcava a inbox como registrada apontando para a entrada
-- do OUTRO ambiente. A inbox aparecia conectada e os webhooks iam para o ambiente
-- errado.
--
-- Não há risco de a migração falhar por dado existente: o unique global era mais
-- restritivo que o composto, então todo par (pid, id_ambiente) já é único hoje.
DROP INDEX IF EXISTS "inboxes_pid_key";

CREATE UNIQUE INDEX IF NOT EXISTS "inboxes_pid_id_ambiente_key" ON "inboxes"("pid", "id_ambiente");

-- O roteamento de webhook procura por `pid` SEM ambiente (o payload da Meta não
-- diz de qual ambiente é), então o índice isolado continua necessário — o
-- composto só serve a essa busca quando `pid` é o primeiro campo, o que é o caso,
-- mas manter o índice explícito deixa a intenção clara e sobrevive a reordenação.
CREATE INDEX IF NOT EXISTS "inboxes_pid_idx" ON "inboxes"("pid");
