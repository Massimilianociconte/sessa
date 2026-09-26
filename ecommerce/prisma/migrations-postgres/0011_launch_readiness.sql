-- 0011 — Prontezza al lancio (audit 26/09/2026).
--
--   1. RegistrationRequest: la registrazione non crea piu un Customer prima
--      della prova di possesso dell'email (niente profili falsi per email altrui).
--   2. Location: orari strutturati, chiusure, lead time, fasce e capienza,
--      email di notifica ordini, CAP serviti dalla consegna locale del fresco.
--   3. Product: tempo di preparazione, conservazione, ambito di spedizione
--      (LOCAL = solo ritiro/consegna locale, NATIONAL = spedibile con corriere).
--   4. ShippingRate.scope: tariffe locali (fresco) distinte da quelle nazionali.
--   5. Order: richiesta fattura, accettazione condizioni, promemoria bonifico.
--   6. Customer: prova del consenso marketing (data, fonte, versione informativa).
--   7. CartItem: prezzo visto dal cliente, per segnalare le variazioni.
--   8. Sequenza numerica codici ordine fuori dalla transazione di checkout
--      (niente contesa SERIALIZABLE sulla riga OrderCounter).
--   9. Order_payment_state_check: un ordine ancora in stato PAID (non ancora
--      in preparazione) puo avere un rimborso parziale. La versione 0006
--      richiedeva paymentStatus = 'PAID' e faceva fallire ogni rimborso
--      parziale, anche quelli arrivati da Stripe via webhook (retry infiniti).
--
-- Additiva e idempotente come le precedenti: rieseguibile senza effetti.

BEGIN;

CREATE TABLE IF NOT EXISTS "RegistrationRequest" (
  "id" TEXT PRIMARY KEY,
  "tokenHash" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "phone" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "RegistrationRequest_tokenHash_key" ON "RegistrationRequest"("tokenHash");
CREATE INDEX IF NOT EXISTS "RegistrationRequest_email_createdAt_idx" ON "RegistrationRequest"("email", "createdAt");
CREATE INDEX IF NOT EXISTS "RegistrationRequest_expiresAt_idx" ON "RegistrationRequest"("expiresAt");

ALTER TABLE "Location"
  ADD COLUMN IF NOT EXISTS "openingHours" TEXT,
  ADD COLUMN IF NOT EXISTS "closedDates" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "leadTimeMinutes" INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS "slotMinutes" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "slotCapacity" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "maxAdvanceDays" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "notificationEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "localDeliveryPostalCodes" TEXT NOT NULL DEFAULT '';

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "leadTimeHours" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "storageInfo" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "shippingScope" TEXT NOT NULL DEFAULT 'LOCAL';

ALTER TABLE "ShippingRate"
  ADD COLUMN IF NOT EXISTS "scope" TEXT NOT NULL DEFAULT 'NATIONAL';

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "invoiceRequested" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "invoiceData" TEXT,
  ADD COLUMN IF NOT EXISTS "termsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "termsVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "paymentReminderSentAt" TIMESTAMP(3);

ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "marketingConsentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "marketingConsentSource" TEXT,
  ADD COLUMN IF NOT EXISTS "marketingConsentVersion" TEXT;

ALTER TABLE "CartItem"
  ADD COLUMN IF NOT EXISTS "unitCentsSnapshot" INTEGER;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Location_schedule_check') THEN
    ALTER TABLE "Location" ADD CONSTRAINT "Location_schedule_check" CHECK (
      "leadTimeMinutes" BETWEEN 0 AND 20160 AND
      "slotMinutes" BETWEEN 5 AND 240 AND
      "slotCapacity" >= 0 AND
      "maxAdvanceDays" BETWEEN 1 AND 366
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Product_fulfillment_check') THEN
    ALTER TABLE "Product" ADD CONSTRAINT "Product_fulfillment_check" CHECK (
      "leadTimeHours" BETWEEN 0 AND 720 AND "shippingScope" IN ('LOCAL','NATIONAL')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ShippingRate_scope_check') THEN
    ALTER TABLE "ShippingRate" ADD CONSTRAINT "ShippingRate_scope_check" CHECK ("scope" IN ('LOCAL','NATIONAL'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CartItem_snapshot_check') THEN
    ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_snapshot_check" CHECK ("unitCentsSnapshot" IS NULL OR "unitCentsSnapshot" >= 0);
  END IF;
END $$;

-- Stato ordine / stato pagamento: PAID ammette anche un rimborso parziale.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Order_payment_state_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%PARTIALLY_REFUNDED%'
  ) THEN
    ALTER TABLE "Order" DROP CONSTRAINT "Order_payment_state_check";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_payment_state_check') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_payment_state_check" CHECK (
      ("status" <> 'PAID' OR "paymentStatus" IN ('PAID', 'PARTIALLY_REFUNDED')) AND
      ("status" <> 'REFUNDED' OR "paymentStatus" = 'REFUNDED') AND
      ("paymentStatus" <> 'REFUNDED' OR "status" = 'REFUNDED')
    );
  END IF;
END $$;

-- Orari noti delle sedi Sessa (fonte: seed e schede Google Business).
-- Solo dove l'orario strutturato non e ancora stato configurato dal gestionale.
UPDATE "Location" SET "openingHours" = '{"mon":[["06:30","21:00"]],"tue":[],"wed":[["06:30","21:00"]],"thu":[["06:30","21:00"]],"fri":[["06:30","21:00"]],"sat":[["06:30","21:00"]],"sun":[["06:30","21:00"]]}'
  WHERE "slug" = 'ottaviano' AND "openingHours" IS NULL;
UPDATE "Location" SET "openingHours" = '{"mon":[["07:00","24:00"]],"tue":[["07:00","24:00"]],"wed":[["07:00","24:00"]],"thu":[["07:00","24:00"]],"fri":[["07:00","24:00"]],"sat":[["07:00","24:00"]],"sun":[["07:00","24:00"]]}'
  WHERE "slug" IN ('torino', 'milano', 'firenze', 'roma') AND "openingHours" IS NULL;
UPDATE "Location" SET "openingHours" = '{"mon":[["09:00","23:00"]],"tue":[["09:00","23:00"]],"wed":[["09:00","23:00"]],"thu":[["09:00","23:00"]],"fri":[["09:00","23:00"]],"sat":[["09:00","23:00"]],"sun":[["09:00","23:00"]]}'
  WHERE "slug" = 'merlata-bloom' AND "openingHours" IS NULL;
UPDATE "Location" SET "openingHours" = '{"mon":[["06:00","23:00"]],"tue":[["06:00","23:00"]],"wed":[["06:00","23:00"]],"thu":[["06:00","23:00"]],"fri":[["06:00","23:00"]],"sat":[["06:00","23:00"]],"sun":[["06:00","23:00"]]}'
  WHERE "slug" = 'roma-termini' AND "openingHours" IS NULL;

-- I grandi lievitati confezionati ("Box Regalo") sono gli unici spedibili;
-- tutto il resto e fresco e resta ritiro/consegna locale. Rivedibile per
-- prodotto dal gestionale.
UPDATE "Product" SET "shippingScope" = 'NATIONAL'
  WHERE "shippingScope" = 'LOCAL'
    AND "categoryId" IN (SELECT "id" FROM "Category" WHERE "slug" = 'box-regalo')
    AND NOT EXISTS (SELECT 1 FROM "_sessa_migration_ledger" WHERE "name" = '0011_launch_readiness.sql');

-- Sequenza dei codici ordine: parte dal massimo gia emesso (codici e contatore).
CREATE SEQUENCE IF NOT EXISTS "order_number_seq" AS BIGINT START WITH 1 MINVALUE 1;
SELECT setval(
  '"order_number_seq"',
  GREATEST(
    (SELECT COALESCE(MAX(NULLIF(substring("code" FROM '^SES-[0-9]{4}-([0-9]+)$'), '')::BIGINT), 0) FROM "Order"),
    (SELECT COALESCE(MAX("value"), 0) FROM "OrderCounter"),
    (SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM "order_number_seq"),
    0
  ) + 1,
  false
);

COMMIT;
