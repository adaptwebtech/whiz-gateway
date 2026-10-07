-- Erros da Meta persistidos INTEIROS, com chave curta de busca e TTL de 14 dias.
--
-- O log do gateway registrava só o status (`forwardBinary POST … → 400 (Meta
-- error passthrough)`) e descartava o corpo — o único lugar onde a Meta escreve
-- o motivo. Resultado: um upload quebrado chegava ao whiz-server como
-- `Timeout aguardando job de upload do gateway: <jobId>`, sem causa em nenhuma
-- das três camadas.
--
-- `chave` é emitida em log no instante do persist: é por ela que se recupera o
-- erro inteiro (`SELECT * FROM logs_erros_meta WHERE chave = 'ERRMETA-…'`).
-- A limpeza é um cron diário (hard delete > 14 dias), não um TTL do Postgres.
CREATE TABLE IF NOT EXISTS "logs_erros_meta" (
  "id"         TEXT NOT NULL,
  "chave"      TEXT NOT NULL,
  "origem"     TEXT NOT NULL,
  "metodo"     TEXT NOT NULL,
  "sub_path"   TEXT NOT NULL,
  "status"     INTEGER,
  "corpo"      JSONB,
  "requisicao" JSONB,
  "job_id"     TEXT,
  "mensagem"   TEXT,
  "data"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "logs_erros_meta_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "logs_erros_meta_chave_key" ON "logs_erros_meta"("chave");
CREATE INDEX IF NOT EXISTS "logs_erros_meta_data_idx"   ON "logs_erros_meta"("data");
CREATE INDEX IF NOT EXISTS "logs_erros_meta_job_id_idx" ON "logs_erros_meta"("job_id");
CREATE INDEX IF NOT EXISTS "logs_erros_meta_origem_idx" ON "logs_erros_meta"("origem");
