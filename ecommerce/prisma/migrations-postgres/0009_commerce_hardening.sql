ALTER TABLE "Cart"
  ADD COLUMN IF NOT EXISTS "customerId" TEXT,
  ADD COLUMN IF NOT EXISTS "abandonedEmailAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Cart_customerId_status_idx" ON "Cart"("customerId", "status");

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "refundedCents" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "CheckoutNonce" (
  "key" TEXT PRIMARY KEY,
  "cartId" TEXT NOT NULL,
  "orderId" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CheckoutNonce_cartId_createdAt_idx" ON "CheckoutNonce"("cartId", "createdAt");

CREATE TABLE IF NOT EXISTS "ReturnRequest" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "customerId" TEXT,
  "reason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "refundCents" INTEGER,
  "adminNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3)
);

CREATE INDEX IF NOT EXISTS "ReturnRequest_orderId_createdAt_idx" ON "ReturnRequest"("orderId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReturnRequest_status_createdAt_idx" ON "ReturnRequest"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "ReturnRequest_customerId_createdAt_idx" ON "ReturnRequest"("customerId", "createdAt");
