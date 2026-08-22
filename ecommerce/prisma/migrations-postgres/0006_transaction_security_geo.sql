BEGIN;

-- Ledger idempotente dei webhook di pagamento. Viene popolato nella stessa
-- transazione che riconcilia PaymentAttempt e Order.
CREATE TABLE IF NOT EXISTS "PaymentWebhookEvent" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "orderId" TEXT,
  "paymentAttemptId" TEXT,
  "error" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

DROP INDEX IF EXISTS "PaymentWebhookEvent_eventId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentWebhookEvent_provider_eventId_key"
  ON "PaymentWebhookEvent"("provider", "eventId");
CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_provider_receivedAt_idx"
  ON "PaymentWebhookEvent"("provider", "receivedAt");
CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_status_receivedAt_idx"
  ON "PaymentWebhookEvent"("status", "receivedAt");
CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_orderId_receivedAt_idx"
  ON "PaymentWebhookEvent"("orderId", "receivedAt");
CREATE INDEX IF NOT EXISTS "PaymentWebhookEvent_paymentAttemptId_idx"
  ON "PaymentWebhookEvent"("paymentAttemptId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentWebhookEvent_orderId_fkey') THEN
    ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentWebhookEvent_paymentAttemptId_fkey') THEN
    ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_paymentAttemptId_fkey"
      FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentWebhookEvent_status_check') THEN
    ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_status_check"
      CHECK ("status" IN ('RECEIVED','PROCESSED','IGNORED','REVIEW'));
  END IF;
END $$;

-- Lo stato CONFIRMED separa la conferma commerciale dall'incasso: gli ordini
-- pagati al ritiro possono entrare in preparazione restando paymentStatus=PENDING.
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_status_check";
ALTER TABLE "Order" ADD CONSTRAINT "Order_status_check" CHECK (
  "status" IN ('PENDING_PAYMENT','CONFIRMED','PAID','PROCESSING','READY','SHIPPED','DELIVERED','CANCELLED','REFUNDED')
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_fulfillment_state_check') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_fulfillment_state_check" CHECK (
      ("status" <> 'READY' OR "fulfillmentType" = 'PICKUP') AND
      ("status" <> 'SHIPPED' OR "fulfillmentType" = 'DELIVERY')
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_payment_state_check') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_payment_state_check" CHECK (
      ("status" <> 'PAID' OR "paymentStatus" = 'PAID') AND
      ("status" <> 'REFUNDED' OR "paymentStatus" = 'REFUNDED') AND
      ("paymentStatus" <> 'REFUNDED' OR "status" = 'REFUNDED')
    );
  END IF;
END $$;

-- Un solo indice parziale copre tutti gli attempt che possono ancora parlare
-- con il provider; la versione piu stretta era ridondante.
DROP INDEX IF EXISTS "PaymentAttempt_one_active_per_order_key";

-- Bonifica non distruttiva degli indirizzi legacy e vincolo anti-race.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "customerId" ORDER BY "createdAt" DESC, "id" DESC
  ) AS rn
  FROM "Address"
  WHERE "customerId" IS NOT NULL AND "isDefault" = TRUE
)
UPDATE "Address" a
SET "isDefault" = FALSE
FROM ranked r
WHERE a."id" = r."id" AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "Address_one_default_per_customer_key"
  ON "Address"("customerId") WHERE "customerId" IS NOT NULL AND "isDefault" = TRUE;

-- Gli input applicativi vengono normalizzati, ma questi indici impediscono che
-- import, query raw o due versioni del gestionale creino identita equivalenti.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Customer" GROUP BY LOWER("email") HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Customer contiene email duplicate senza distinzione maiuscole/minuscole';
  END IF;
  IF EXISTS (SELECT 1 FROM "AdminUser" GROUP BY LOWER("email") HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'AdminUser contiene email duplicate senza distinzione maiuscole/minuscole';
  END IF;
  IF EXISTS (SELECT 1 FROM "DiscountCode" GROUP BY UPPER("code") HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'DiscountCode contiene codici duplicati senza distinzione maiuscole/minuscole';
  END IF;
  IF EXISTS (SELECT 1 FROM "GiftCard" GROUP BY UPPER("code") HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'GiftCard contiene codici duplicati senza distinzione maiuscole/minuscole';
  END IF;
  IF EXISTS (SELECT 1 FROM "Referral" GROUP BY UPPER("code") HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Referral contiene codici duplicati senza distinzione maiuscole/minuscole';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Customer" WHERE "referralCode" IS NOT NULL
    GROUP BY UPPER("referralCode") HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Customer contiene referralCode duplicati senza distinzione maiuscole/minuscole';
  END IF;
END $$;

UPDATE "Customer" SET "email" = LOWER("email") WHERE "email" <> LOWER("email");
UPDATE "AdminUser" SET "email" = LOWER("email") WHERE "email" <> LOWER("email");
UPDATE "DiscountCode" SET "code" = UPPER("code") WHERE "code" <> UPPER("code");
UPDATE "GiftCard" SET "code" = UPPER("code") WHERE "code" <> UPPER("code");
UPDATE "Referral" SET "code" = UPPER("code") WHERE "code" <> UPPER("code");
UPDATE "Customer" SET "referralCode" = UPPER("referralCode")
  WHERE "referralCode" IS NOT NULL AND "referralCode" <> UPPER("referralCode");

CREATE UNIQUE INDEX IF NOT EXISTS "Customer_email_ci_key" ON "Customer"(LOWER("email"));
CREATE UNIQUE INDEX IF NOT EXISTS "AdminUser_email_ci_key" ON "AdminUser"(LOWER("email"));
CREATE UNIQUE INDEX IF NOT EXISTS "DiscountCode_code_ci_key" ON "DiscountCode"(UPPER("code"));
CREATE UNIQUE INDEX IF NOT EXISTS "GiftCard_code_ci_key" ON "GiftCard"(UPPER("code"));
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_code_ci_key" ON "Referral"(UPPER("code"));
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_referralCode_ci_key"
  ON "Customer"(UPPER("referralCode")) WHERE "referralCode" IS NOT NULL;

-- Correzione puntuale da fonte ufficiale Merlata Bloom. Non sovrascrive futuri
-- aggiornamenti del gestionale: interviene solo sui due valori seed obsoleti.
UPDATE "Location" SET "address" = 'Via Gottlieb Wilhelm Daimler, 0 C2'
  WHERE "slug" = 'merlata-bloom' AND "address" = 'Via Gottlieb Wilhelm Daimler, C2';
UPDATE "Location" SET "hours" = '09:00–23:00'
  WHERE "slug" = 'merlata-bloom' AND "hours" IN ('09:00–22:00', '09:00-22:00');

-- Difesa in profondita Supabase/Postgres: Prisma usa il ruolo proprietario e
-- continua a funzionare; anon/authenticated non ricevono accesso Data API.
DO $$
DECLARE
  table_name TEXT;
  app_tables TEXT[] := ARRAY[
    'Location','Category','Product','ProductVariant','ProductImage','StoreVariant','StockMovement',
    'Cart','CartItem','Customer','CustomerPasskey','CustomerBackupCode','RateLimitEntry','CustomerToken',
    'PasswordResetToken','EmailMessage','CustomerSession','Address','Order','OrderCounter','PaymentAttempt',
    'PaymentWebhookEvent','OrderItem','OrderEvent','DiscountCode','DiscountLocation','DiscountCategory',
    'DiscountProduct','DiscountRedemption','GiftCard','GiftCardTransaction','Referral','ShippingZone',
    'ShippingRate','AdminUser','AdminSession','AuditLog','Setting'
  ];
BEGIN
  FOREACH table_name IN ARRAY app_tables LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', table_name);
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon', table_name);
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM authenticated', table_name);
      END IF;
    END IF;
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
  END IF;
END $$;

COMMIT;
