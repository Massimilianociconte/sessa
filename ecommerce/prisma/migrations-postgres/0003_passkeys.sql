-- Passkey WebAuthn per gli account cliente. Additiva e idempotente.

CREATE TABLE IF NOT EXISTS "CustomerPasskey" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "credentialId" TEXT NOT NULL,
  "publicKey" TEXT NOT NULL,
  "counter" INTEGER NOT NULL DEFAULT 0,
  "transports" TEXT,
  "deviceType" TEXT,
  "backedUp" BOOLEAN NOT NULL DEFAULT false,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  CONSTRAINT "CustomerPasskey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerPasskey_credentialId_key"
  ON "CustomerPasskey"("credentialId");

CREATE INDEX IF NOT EXISTS "CustomerPasskey_customerId_idx"
  ON "CustomerPasskey"("customerId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerPasskey_customerId_fkey'
  ) THEN
    ALTER TABLE "CustomerPasskey"
      ADD CONSTRAINT "CustomerPasskey_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
