-- Adiciona o status ASSINATURA_INVALIDA ao enum StatusFalhaMensagem.
-- Usado para persistir em fila_mensagens_mortas as entregas Meta rejeitadas
-- por HMAC divergente no MetaSignatureGuard (POST /webhook).
-- Idempotente: seguro em ambientes onde o valor já foi aplicado.
ALTER TYPE "StatusFalhaMensagem" ADD VALUE IF NOT EXISTS 'ASSINATURA_INVALIDA';
