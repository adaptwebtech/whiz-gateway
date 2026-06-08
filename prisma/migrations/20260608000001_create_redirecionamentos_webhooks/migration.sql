CREATE TABLE "redirecionamentos_webhooks" (
    "uid"            TEXT      NOT NULL,
    "url"            TEXT      NOT NULL,
    "data_expiracao" TIMESTAMP(3),
    "id_ambiente"    INTEGER,
    "data"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "del"            BOOLEAN   NOT NULL DEFAULT false,

    CONSTRAINT "redirecionamentos_webhooks_pkey" PRIMARY KEY ("uid"),
    CONSTRAINT "redirecionamentos_webhooks_id_ambiente_fkey"
        FOREIGN KEY ("id_ambiente") REFERENCES "ambiente"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);
