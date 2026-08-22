-- 0010 — Integrità rimborso parziale, FK mancanti (0009), invarianti resi.
--
-- Allinea il DB al dominio applicativo:
--   1. Order.paymentStatus ammette PARTIALLY_REFUNDED (scritto da refundOrder
--      per i rimborsi parziali; prima di questa migrazione la CHECK abortiva
--      faceva rollback della transazione DOPO il rimborso provider).
--   2. refundedCents vincolata fra 0 e totalCents.
--   3. FK per le tabelle create in 0009 senza vincoli: Cart.customerId,
--      CheckoutNonce.orderId, ReturnRequest.orderId/customerId.
--   4. CHECK su ReturnRequest.status e refundCents + regola "un solo reso
--      attivo per ordine" (indice unico parziale).
--   5. Indice [status, fulfillmentAt] per la coda di evasione del dashboard.
--   6. Ledger interno delle migrazioni usato dal runner (idempotenza).
--
-- Come le precedenti: bonifiche fail-closed PRIMA dei vincoli, tutto dentro
-- una transazione, rieseguibile senza effetti collaterali.

BEGIN;

DO $$
DECLARE
  orphan_count INTEGER;
BEGIN

  ---------------------------------------------------------------------------
  -- 1+2. Stato pagamento: PARTIALLY_REFUNDED + range refundedCents
  ---------------------------------------------------------------------------

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Order_paymentStatus_check'
  ) THEN
    -- La vecchia CHECK esclude PARTIALLY_REFUNDED: va ricreata.
    ALTER TABLE "Order" DROP CONSTRAINT "Order_paymentStatus_check";
  END IF;
  ALTER TABLE "Order" ADD CONSTRAINT "Order_paymentStatus_check"
    CHECK ("paymentStatus" IN ('PENDING','AUTHORIZED','PAID','PARTIALLY_REFUNDED','REFUNDED','FAILED'));

  SELECT COUNT(*) INTO orphan_count FROM "Order"
  WHERE "refundedCents" < 0 OR "refundedCents" > "totalCents";
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Bonifica fallita: % ordini con refundedCents fuori range', orphan_count;
  END IF;
  ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_refunded_cents_range";
  ALTER TABLE "Order" ADD CONSTRAINT "Order_refunded_cents_range"
    CHECK ("refundedCents" BETWEEN 0 AND "totalCents");

  ---------------------------------------------------------------------------
  -- 3a. Cart.customerId → Customer(id) ON DELETE SET NULL
  ---------------------------------------------------------------------------

  SELECT COUNT(*) INTO orphan_count FROM "Cart" c
  LEFT JOIN "Customer" cu ON cu."id" = c."customerId"
  WHERE c."customerId" IS NOT NULL AND cu."id" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Bonifica fallita: % carrelli con customerId orfano', orphan_count;
  END IF;
  ALTER TABLE "Cart" DROP CONSTRAINT IF EXISTS "Cart_customerId_fkey";
  ALTER TABLE "Cart" ADD CONSTRAINT "Cart_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

  ---------------------------------------------------------------------------
  -- 3b. CheckoutNonce.orderId → Order(id) ON DELETE SET NULL
  ---------------------------------------------------------------------------

  SELECT COUNT(*) INTO orphan_count FROM "CheckoutNonce" n
  LEFT JOIN "Order" o ON o."id" = n."orderId"
  WHERE n."orderId" IS NOT NULL AND o."id" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Bonifica fallita: % nonce con orderId orfano', orphan_count;
  END IF;
  ALTER TABLE "CheckoutNonce" DROP CONSTRAINT IF EXISTS "CheckoutNonce_orderId_fkey";
  ALTER TABLE "CheckoutNonce" ADD CONSTRAINT "CheckoutNonce_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

  ---------------------------------------------------------------------------
  -- 3c. ReturnRequest.orderId → Order CASCADE, .customerId → Customer SET NULL
  ---------------------------------------------------------------------------

  SELECT COUNT(*) INTO orphan_count FROM "ReturnRequest" r
  LEFT JOIN "Order" o ON o."id" = r."orderId"
  WHERE o."id" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Bonifica fallita: % richieste reso con orderId orfano', orphan_count;
  END IF;
  SELECT COUNT(*) INTO orphan_count FROM "ReturnRequest" r
  LEFT JOIN "Customer" cu ON cu."id" = r."customerId"
  WHERE r."customerId" IS NOT NULL AND cu."id" IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Bonifica fallita: % richieste reso con customerId orfano', orphan_count;
  END IF;
  ALTER TABLE "ReturnRequest" DROP CONSTRAINT IF EXISTS "ReturnRequest_orderId_fkey";
  ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  ALTER TABLE "ReturnRequest" DROP CONSTRAINT IF EXISTS "ReturnRequest_customerId_fkey";
  ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

  ---------------------------------------------------------------------------
  -- 4. Invarianti richieste di reso
  ---------------------------------------------------------------------------

  ALTER TABLE "ReturnRequest" DROP CONSTRAINT IF EXISTS "ReturnRequest_status_check";
  ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_status_check"
    CHECK ("status" IN ('REQUESTED','APPROVED','REJECTED','REFUNDED'));

  ALTER TABLE "ReturnRequest" DROP CONSTRAINT IF EXISTS "ReturnRequest_refund_cents_range";
  ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_refund_cents_range"
    CHECK ("refundCents" IS NULL OR "refundCents" >= 0);

  -- Un solo reso attivo (REQUESTED/APPROVED) per ordine: chiude la race di
  -- requestReturn lato database mantenendo lo storico delle richieste chiuse.
  CREATE UNIQUE INDEX IF NOT EXISTS "ReturnRequest_one_active_per_order_key"
    ON "ReturnRequest"("orderId")
    WHERE "status" IN ('REQUESTED','APPROVED');

  ---------------------------------------------------------------------------
  -- 5. Coda di evasione: dashboard ordina/filter per fulfillmentAt
  ---------------------------------------------------------------------------

  CREATE INDEX IF NOT EXISTS "Order_status_fulfillmentAt_idx" ON "Order"("status", "fulfillmentAt");

END $$;

-----------------------------------------------------------------------------
-- 6. Ledger migrazioni: il runner registra qui ogni file applicato con
--    checksum, cosi un re-run non ri-esegue mai due volte la stessa migrazione
--    e `db:verify` puo confrontare lo stato atteso.
-----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "_sessa_migration_ledger" (
  name       TEXT PRIMARY KEY,
  checksum   TEXT NOT NULL,
  applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_by TEXT NOT NULL DEFAULT 'run-postgres-migrations.sh'
);

COMMIT;
