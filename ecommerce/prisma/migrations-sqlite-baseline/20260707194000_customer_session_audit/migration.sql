-- Sessioni cliente realmente gestibili dall'area personale.
-- Manteniamo token solo in forma hash; user agent/IP servono a mostrare i dispositivi
-- e aiutare il cliente a riconoscere accessi sospetti.
ALTER TABLE "CustomerSession" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "CustomerSession" ADD COLUMN "ipAddress" TEXT;
ALTER TABLE "CustomerSession" ADD COLUMN "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "CustomerSession_customerId_lastSeenAt_idx" ON "CustomerSession"("customerId", "lastSeenAt");
