-- Resolução de webhooks de NÍVEL WABA.
--
-- Payloads como `account_update`, `phone_number_quality_update` e
-- `message_template_*` não trazem `value.metadata.phone_number_id`, então a
-- resolução por `pid` falhava e todos iam para a fila de mensagens mortas como
-- INBOX_NAO_REGISTRADA. `waba_id` dá o segundo caminho de resolução.
--
-- Não é único: uma WABA tem vários números, logo várias inboxes — e todos os
-- números de uma WABA moram no mesmo ambiente, que é o que o roteamento procura.
ALTER TABLE "inboxes" ADD COLUMN IF NOT EXISTS "waba_id" TEXT;

CREATE INDEX IF NOT EXISTS "inboxes_waba_id_idx" ON "inboxes"("waba_id");
