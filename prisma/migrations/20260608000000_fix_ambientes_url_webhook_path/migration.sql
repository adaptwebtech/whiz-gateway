-- Corrige URLs dos ambientes fixos: adiciona sufixo /webhook/api-oficial
UPDATE "ambiente" SET "url" = 'https://dev.2.whiz.net.br/webhook/api-oficial' WHERE "id" = 1;
UPDATE "ambiente" SET "url" = 'https://staging.2.whiz.net.br/webhook/api-oficial' WHERE "id" = 2;
UPDATE "ambiente" SET "url" = 'https://server.whiz.net.br/webhook/api-oficial' WHERE "id" = 3;
