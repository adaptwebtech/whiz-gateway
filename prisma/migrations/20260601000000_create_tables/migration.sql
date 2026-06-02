-- CreateEnum
CREATE TYPE "StatusFalhaMensagem" AS ENUM ('INBOX_NAO_REGISTRADA', 'FALHA_ENFILEIRAMENTO', 'NACK_RECEBIDO', 'FALHA_ENVIO', 'AMBIENTE_INDISPONIVEL');

-- CreateTable
CREATE TABLE "ambiente" (
    "id" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "del" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ambiente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inboxes" (
    "id" TEXT NOT NULL,
    "id_ambiente" INTEGER NOT NULL,
    "pid" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "del" BOOLEAN NOT NULL DEFAULT false,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inboxes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fila_mensagens_mortas" (
    "id" TEXT NOT NULL,
    "message" JSONB NOT NULL,
    "id_inbox" TEXT,
    "status" "StatusFalhaMensagem" NOT NULL,
    "reenviado" BOOLEAN NOT NULL DEFAULT false,
    "del" BOOLEAN NOT NULL DEFAULT false,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fila_mensagens_mortas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inboxes_pid_key" ON "inboxes"("pid");

-- AddForeignKey
ALTER TABLE "inboxes" ADD CONSTRAINT "inboxes_id_ambiente_fkey" FOREIGN KEY ("id_ambiente") REFERENCES "ambiente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fila_mensagens_mortas" ADD CONSTRAINT "fila_mensagens_mortas_id_inbox_fkey" FOREIGN KEY ("id_inbox") REFERENCES "inboxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
