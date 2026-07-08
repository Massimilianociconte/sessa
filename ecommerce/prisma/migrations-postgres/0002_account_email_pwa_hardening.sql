-- Sessa 1930 production safety patch.
-- Idempotent Postgres migration for the account/security/email/PWA workstream.
-- It is intentionally additive: no DROP, no destructive ALTER.

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "allergens" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "ingredients" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "preferredLocationId" TEXT,
  ADD COLUMN IF NOT EXISTS "preferredFulfillment" TEXT,
  ADD COLUMN IF NOT EXISTS "birthday" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "anonymizedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "totpSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "totpEnabledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "totpLastStep" INTEGER;

ALTER TABLE "PasswordResetToken"
  ADD COLUMN IF NOT EXISTS "usedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "CustomerBackupCode" (
  "id" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerBackupCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CustomerToken" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "payload" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "EmailMessage" (
  "id" TEXT NOT NULL,
  "toEmail" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "reference" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CustomerSession" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerSession_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CustomerSession"
  ADD COLUMN IF NOT EXISTS "userAgent" TEXT,
  ADD COLUMN IF NOT EXISTS "ipAddress" TEXT,
  ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerBackupCode_codeHash_key" ON "CustomerBackupCode"("codeHash");
CREATE INDEX IF NOT EXISTS "CustomerBackupCode_customerId_idx" ON "CustomerBackupCode"("customerId");

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerToken_tokenHash_key" ON "CustomerToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "CustomerToken_customerId_type_idx" ON "CustomerToken"("customerId", "type");
CREATE INDEX IF NOT EXISTS "CustomerToken_expiresAt_idx" ON "CustomerToken"("expiresAt");

CREATE INDEX IF NOT EXISTS "PasswordResetToken_usedAt_idx" ON "PasswordResetToken"("usedAt");

CREATE INDEX IF NOT EXISTS "EmailMessage_status_createdAt_idx" ON "EmailMessage"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "EmailMessage_reference_idx" ON "EmailMessage"("reference");
CREATE INDEX IF NOT EXISTS "EmailMessage_toEmail_createdAt_idx" ON "EmailMessage"("toEmail", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "CustomerSession_tokenHash_key" ON "CustomerSession"("tokenHash");
CREATE INDEX IF NOT EXISTS "CustomerSession_customerId_idx" ON "CustomerSession"("customerId");
CREATE INDEX IF NOT EXISTS "CustomerSession_customerId_lastSeenAt_idx" ON "CustomerSession"("customerId", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "CustomerSession_expiresAt_idx" ON "CustomerSession"("expiresAt");

CREATE INDEX IF NOT EXISTS "Customer_preferredLocationId_idx" ON "Customer"("preferredLocationId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Customer_preferredLocationId_fkey'
  ) THEN
    ALTER TABLE "Customer"
      ADD CONSTRAINT "Customer_preferredLocationId_fkey"
      FOREIGN KEY ("preferredLocationId") REFERENCES "Location"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerBackupCode_customerId_fkey'
  ) THEN
    ALTER TABLE "CustomerBackupCode"
      ADD CONSTRAINT "CustomerBackupCode_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerToken_customerId_fkey'
  ) THEN
    ALTER TABLE "CustomerToken"
      ADD CONSTRAINT "CustomerToken_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSession_customerId_fkey'
  ) THEN
    ALTER TABLE "CustomerSession"
      ADD CONSTRAINT "CustomerSession_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
