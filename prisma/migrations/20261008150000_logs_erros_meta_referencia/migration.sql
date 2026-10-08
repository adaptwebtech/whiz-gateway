-- `referencia`: a que objeto o erro se refere, quando ele NÃO vem de uma
-- chamada HTTP de saída.
--
-- A tabela nasceu cobrindo só o caminho de SAÍDA (`WppService.forward*` e a
-- entrega de callback). Mas metade das falhas da Meta é assíncrona: o POST
-- /messages responde 200 com um `wamid`, e a recusa chega depois, num webhook
-- de status:
--
--   "statuses":[{"id":"wamid.HBgM…","status":"failed","errors":[{"code":131053,
--     "title":"Media upload error","error_data":{"details":
--     "Video file has size 63787247 bytes but must be atmost 16777216 bytes…"}}]}]
--
-- Nada disso era persistido, e o erro não ganhava chave de busca. Agora ganha, e
-- `referencia` guarda o `wamid` para ligar o registro à mensagem no whiz.
ALTER TABLE "logs_erros_meta" ADD COLUMN IF NOT EXISTS "referencia" TEXT;

CREATE INDEX IF NOT EXISTS "logs_erros_meta_referencia_idx" ON "logs_erros_meta"("referencia");

-- `codigo_meta`: o código de erro da Meta (131053, 131049, 100…), separado do
-- `status` HTTP. Misturar os dois arruinaria as duas consultas: `?status=400`
-- pergunta "a Graph recusou a requisição" e `?codigo_meta=131053` pergunta
-- "mídia grande demais" — num erro de webhook não existe status HTTP nenhum.
ALTER TABLE "logs_erros_meta" ADD COLUMN IF NOT EXISTS "codigo_meta" INTEGER;

CREATE INDEX IF NOT EXISTS "logs_erros_meta_codigo_meta_idx" ON "logs_erros_meta"("codigo_meta");
