-- CreateTable: flow_callbacks_urls was never created in previous migrations
CREATE TABLE "flow_callbacks_urls" (
    "uid" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "del" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "flow_callbacks_urls_pkey" PRIMARY KEY ("uid")
);

-- RenameColumn: date → data in api_keys
ALTER TABLE "api_keys" RENAME COLUMN "date" TO "data";
