-- CreateTable
CREATE TABLE "whatsapp_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "phone_e164" TEXT,
    "display_name" TEXT,
    "jid" TEXT,
    "session_enc" BYTEA,
    "status" TEXT NOT NULL DEFAULT 'DISCONNECTED',
    "last_qr_at" TIMESTAMPTZ,
    "last_connected_at" TIMESTAMPTZ,
    "last_send_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_accounts_user_id_key" ON "whatsapp_accounts"("user_id");

-- CreateIndex
CREATE INDEX "whatsapp_accounts_user_id_idx" ON "whatsapp_accounts"("user_id");

-- CreateIndex
CREATE INDEX "whatsapp_accounts_status_idx" ON "whatsapp_accounts"("status");

-- AddForeignKey
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
