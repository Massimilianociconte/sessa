-- Operations/security/merchant hardening (forward-only, idempotent).
-- Adds expiring stock reservations, a leased email outbox, location-scoped
-- admin roles + TOTP, operational telemetry and Google Merchant attributes.

BEGIN;

-- -------------------------------------------------------------------------
-- Merchant Center readiness
-- -------------------------------------------------------------------------

ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS "merchantStoreCode" TEXT;
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS "merchantEnabled" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS "merchantPickupSla" TEXT NOT NULL DEFAULT 'same day';
ALTER TABLE "Location" DROP CONSTRAINT IF EXISTS "Location_merchantPickupSla_check";
ALTER TABLE "Location" ALTER COLUMN "merchantPickupSla" SET DEFAULT 'same day';
UPDATE "Location" SET "merchantPickupSla" = 'same day' WHERE "merchantPickupSla" = 'same_day';
UPDATE "Location" SET "merchantPickupSla" = 'next day' WHERE "merchantPickupSla" = 'next_day';

CREATE UNIQUE INDEX IF NOT EXISTS "Location_merchantStoreCode_key"
  ON "Location"("merchantStoreCode");

ALTER TABLE "Location" ADD CONSTRAINT "Location_merchantPickupSla_check" CHECK (
  "merchantPickupSla" IN ('same day','next day','2-day','3-day','4-day','5-day','6-day','multi-week')
);

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "merchantEnabled" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "merchantTitle" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "merchantDescription" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "googleProductCategory" TEXT;

ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "gtin" TEXT;
ALTER TABLE "ProductVariant" ADD COLUMN IF NOT EXISTS "mpn" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_gtin_key" ON "ProductVariant"("gtin");

-- -------------------------------------------------------------------------
-- Stock reservation lifecycle
-- -------------------------------------------------------------------------

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "stockReservationExpiresAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "stockReleasedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Order_status_stockReservationExpiresAt_idx"
  ON "Order"("status", "stockReservationExpiresAt");
CREATE INDEX IF NOT EXISTS "Order_stockReleasedAt_idx" ON "Order"("stockReleasedAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_stock_reservation_state_check') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_stock_reservation_state_check" CHECK (
      "stockReservationExpiresAt" IS NULL OR "status" = 'PENDING_PAYMENT'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_stock_release_state_check') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_stock_release_state_check" CHECK (
      "stockReleasedAt" IS NULL OR "status" IN ('CANCELLED','REFUNDED')
    );
  END IF;
END $$;

-- -------------------------------------------------------------------------
-- Async email outbox with leases and bounded retry
-- -------------------------------------------------------------------------

ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;
ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "maxAttempts" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);
ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "lockToken" TEXT;
ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "lastAttemptAt" TIMESTAMP(3);
ALTER TABLE "EmailMessage" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "EmailMessage_dedupeKey_key" ON "EmailMessage"("dedupeKey");
DROP INDEX IF EXISTS "EmailMessage_lockToken_key";
CREATE INDEX IF NOT EXISTS "EmailMessage_lockToken_idx" ON "EmailMessage"("lockToken");
CREATE INDEX IF NOT EXISTS "EmailMessage_status_nextAttemptAt_idx"
  ON "EmailMessage"("status", "nextAttemptAt");
CREATE INDEX IF NOT EXISTS "EmailMessage_status_lockedAt_idx"
  ON "EmailMessage"("status", "lockedAt");
DROP INDEX IF EXISTS "EmailMessage_status_createdAt_idx";
ALTER TABLE "EmailMessage" ALTER COLUMN "updatedAt" DROP DEFAULT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailMessage_status_check') THEN
    ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_status_check" CHECK (
      "status" IN ('QUEUED','PROCESSING','SENT','FAILED','DEAD')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmailMessage_attempts_check') THEN
    ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_attempts_check" CHECK (
      "attemptCount" >= 0 AND "maxAttempts" BETWEEN 1 AND 20
    );
  END IF;
END $$;

-- -------------------------------------------------------------------------
-- Location-scoped admin roles, sessions and two-factor authentication
-- -------------------------------------------------------------------------

ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "scopeAllLocations" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "totpSecret" TEXT;
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "totpEnabledAt" TIMESTAMP(3);
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "totpLastStep" INTEGER;

-- Preserve existing access while replacing the ambiguous legacy STAFF role.
UPDATE "AdminUser" SET "scopeAllLocations" = TRUE WHERE "role" IN ('OWNER','ADMIN','STAFF');
UPDATE "AdminUser" SET "role" = 'STORE_MANAGER' WHERE "role" = 'STAFF';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdminUser_role_check') THEN
    ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_role_check" CHECK (
      "role" IN ('OWNER','ADMIN','STORE_MANAGER','FULFILLMENT','MARKETING')
    );
  END IF;
END $$;

ALTER TABLE "AdminSession" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;
ALTER TABLE "AdminSession" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AdminSession" ADD COLUMN IF NOT EXISTS "twoFactorVerifiedAt" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "AdminSession_userId_lastSeenAt_idx"
  ON "AdminSession"("userId", "lastSeenAt");

CREATE TABLE IF NOT EXISTS "AdminBackupCode" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminBackupCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AdminBackupCode_codeHash_key" ON "AdminBackupCode"("codeHash");
CREATE INDEX IF NOT EXISTS "AdminBackupCode_adminId_idx" ON "AdminBackupCode"("adminId");

CREATE TABLE IF NOT EXISTS "AdminLocation" (
  "adminId" TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminLocation_pkey" PRIMARY KEY ("adminId", "locationId")
);
CREATE INDEX IF NOT EXISTS "AdminLocation_locationId_idx" ON "AdminLocation"("locationId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdminBackupCode_adminId_fkey') THEN
    ALTER TABLE "AdminBackupCode" ADD CONSTRAINT "AdminBackupCode_adminId_fkey"
      FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdminLocation_adminId_fkey') THEN
    ALTER TABLE "AdminLocation" ADD CONSTRAINT "AdminLocation_adminId_fkey"
      FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AdminLocation_locationId_fkey') THEN
    ALTER TABLE "AdminLocation" ADD CONSTRAINT "AdminLocation_locationId_fkey"
      FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- -------------------------------------------------------------------------
-- Aggregated, privacy-conscious operational observability
-- -------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "OperationalEvent" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'ERROR',
  "source" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "correlationId" TEXT,
  "entityType" TEXT,
  "entityId" TEXT,
  "orderId" TEXT,
  "locationId" TEXT,
  "metadata" TEXT,
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedBy" TEXT,
  CONSTRAINT "OperationalEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OperationalEvent_fingerprint_key" ON "OperationalEvent"("fingerprint");
CREATE INDEX IF NOT EXISTS "OperationalEvent_level_resolvedAt_lastSeenAt_idx"
  ON "OperationalEvent"("level", "resolvedAt", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "OperationalEvent_source_code_lastSeenAt_idx"
  ON "OperationalEvent"("source", "code", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "OperationalEvent_orderId_lastSeenAt_idx"
  ON "OperationalEvent"("orderId", "lastSeenAt");
CREATE INDEX IF NOT EXISTS "OperationalEvent_locationId_lastSeenAt_idx"
  ON "OperationalEvent"("locationId", "lastSeenAt");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OperationalEvent_level_check') THEN
    ALTER TABLE "OperationalEvent" ADD CONSTRAINT "OperationalEvent_level_check" CHECK (
      "level" IN ('INFO','WARNING','ERROR','CRITICAL')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OperationalEvent_occurrence_check') THEN
    ALTER TABLE "OperationalEvent" ADD CONSTRAINT "OperationalEvent_occurrence_check" CHECK (
      "occurrenceCount" >= 1
    );
  END IF;
END $$;

-- Prisma uses the owner role. Supabase Data API roles receive no direct access.
DO $$
DECLARE
  table_name TEXT;
  new_tables TEXT[] := ARRAY['AdminBackupCode','AdminLocation','OperationalEvent'];
BEGIN
  FOREACH table_name IN ARRAY new_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', table_name);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon', table_name);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM authenticated', table_name);
    END IF;
  END LOOP;
END $$;

COMMIT;
