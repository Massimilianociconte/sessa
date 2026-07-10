BEGIN;

-- Nuovi campi di riconciliazione/compensazione.
ALTER TABLE "Cart" ADD COLUMN IF NOT EXISTS "convertedOrderId" TEXT;
ALTER TABLE "Cart" ADD COLUMN IF NOT EXISTS "convertedAt" TIMESTAMP(3);
ALTER TABLE "DiscountRedemption" ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3);
ALTER TABLE "DiscountRedemption" ADD COLUMN IF NOT EXISTS "reversalReason" TEXT;

CREATE TABLE IF NOT EXISTS "PaymentAttempt" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "method" TEXT,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "status" TEXT NOT NULL DEFAULT 'CREATED',
  "idempotencyKey" TEXT NOT NULL,
  "providerRef" TEXT,
  "providerPaymentRef" TEXT,
  "checkoutUrl" TEXT,
  "instructions" TEXT,
  "error" TEXT,
  "expiresAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- Bonifica fail-closed prima delle nuove FK.
UPDATE "Cart" c SET "giftCardCode" = NULL
WHERE c."giftCardCode" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "GiftCard" g WHERE g."code" = c."giftCardCode");
UPDATE "DiscountCode" d SET "isActive" = FALSE, "customerId" = NULL
WHERE d."customerId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Customer" c WHERE c."id" = d."customerId");
UPDATE "Referral" r SET "redeemedOrderId" = NULL
WHERE r."redeemedOrderId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "Order" o WHERE o."id" = r."redeemedOrderId");

-- Duplicati legacy: preserva il record ma scollega le occorrenze eccedenti.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "orderId" ORDER BY "createdAt", "id") AS rn
  FROM "DiscountRedemption" WHERE "orderId" IS NOT NULL
)
UPDATE "DiscountRedemption" d SET "orderId" = NULL
FROM ranked r WHERE d."id" = r."id" AND r.rn > 1;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "redeemedOrderId" ORDER BY "createdAt", "id") AS rn
  FROM "Referral" WHERE "redeemedOrderId" IS NOT NULL
)
UPDATE "Referral" r SET "redeemedOrderId" = NULL
FROM ranked x WHERE r."id" = x."id" AND x.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "StockMovement_storeVariantId_reason_reference_key"
  ON "StockMovement"("storeVariantId", "reason", "reference");
CREATE UNIQUE INDEX IF NOT EXISTS "Cart_convertedOrderId_key" ON "Cart"("convertedOrderId");
CREATE UNIQUE INDEX IF NOT EXISTS "DiscountRedemption_orderId_key" ON "DiscountRedemption"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "GiftCardTransaction_giftCardId_reason_reference_key"
  ON "GiftCardTransaction"("giftCardId", "reason", "reference");
CREATE UNIQUE INDEX IF NOT EXISTS "Referral_redeemedOrderId_key" ON "Referral"("redeemedOrderId");

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentAttempt_idempotencyKey_key" ON "PaymentAttempt"("idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentAttempt_providerRef_key" ON "PaymentAttempt"("providerRef");
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentAttempt_providerPaymentRef_key" ON "PaymentAttempt"("providerPaymentRef");
CREATE INDEX IF NOT EXISTS "PaymentAttempt_orderId_createdAt_idx" ON "PaymentAttempt"("orderId", "createdAt");
CREATE INDEX IF NOT EXISTS "PaymentAttempt_orderId_status_idx" ON "PaymentAttempt"("orderId", "status");
CREATE INDEX IF NOT EXISTS "PaymentAttempt_provider_status_updatedAt_idx" ON "PaymentAttempt"("provider", "status", "updatedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentAttempt_one_active_per_order_key"
  ON "PaymentAttempt"("orderId") WHERE "status" IN ('CREATED', 'PENDING');
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentAttempt_one_live_per_order_key"
  ON "PaymentAttempt"("orderId") WHERE "status" IN ('CREATED', 'INITIALIZING', 'PENDING');

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Cart_giftCardCode_fkey') THEN
    ALTER TABLE "Cart" ADD CONSTRAINT "Cart_giftCardCode_fkey" FOREIGN KEY ("giftCardCode") REFERENCES "GiftCard"("code") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Cart_convertedOrderId_fkey') THEN
    ALTER TABLE "Cart" ADD CONSTRAINT "Cart_convertedOrderId_fkey" FOREIGN KEY ("convertedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DiscountCode_customerId_fkey') THEN
    ALTER TABLE "DiscountCode" ADD CONSTRAINT "DiscountCode_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Referral_redeemedOrderId_fkey') THEN
    ALTER TABLE "Referral" ADD CONSTRAINT "Referral_redeemedOrderId_fkey" FOREIGN KEY ("redeemedOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentAttempt_orderId_fkey') THEN
    ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- CHECK ad alto valore: proteggono anche da SQL/admin/raw writes fuori dai servizi.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Product_status_check') THEN
    ALTER TABLE "Product" ADD CONSTRAINT "Product_status_check" CHECK ("status" IN ('DRAFT','ACTIVE','ARCHIVED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Product_taxRateBps_check') THEN
    ALTER TABLE "Product" ADD CONSTRAINT "Product_taxRateBps_check" CHECK ("taxRateBps" BETWEEN 0 AND 10000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ProductVariant_money_check') THEN
    ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_money_check" CHECK ("basePriceCents" >= 0 AND ("compareAtCents" IS NULL OR "compareAtCents" >= 0));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StoreVariant_stock_money_check') THEN
    ALTER TABLE "StoreVariant" ADD CONSTRAINT "StoreVariant_stock_money_check" CHECK ("stockQty" >= 0 AND "lowStockThreshold" >= 0 AND ("priceCentsOverride" IS NULL OR "priceCentsOverride" >= 0) AND ("compareAtCents" IS NULL OR "compareAtCents" >= 0));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StockMovement_delta_reason_check') THEN
    ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_delta_reason_check" CHECK ("delta" <> 0 AND "reason" IN ('ORDER','CANCEL_RESTOCK','RESTOCK','ADJUSTMENT','INITIAL'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Cart_status_check') THEN
    ALTER TABLE "Cart" ADD CONSTRAINT "Cart_status_check" CHECK ("status" IN ('ACTIVE','CONVERTED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CartItem_qty_check') THEN
    ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_qty_check" CHECK ("qty" BETWEEN 1 AND 99);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_status_check') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_status_check" CHECK ("status" IN ('PENDING_PAYMENT','PAID','PROCESSING','READY','SHIPPED','DELIVERED','CANCELLED','REFUNDED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_fulfillment_check') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_fulfillment_check" CHECK ("fulfillmentType" IN ('PICKUP','DELIVERY'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_paymentStatus_check') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_paymentStatus_check" CHECK ("paymentStatus" IN ('PENDING','AUTHORIZED','PAID','REFUNDED','FAILED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_totals_check') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_totals_check" CHECK (
      "subtotalCents" >= 0 AND "discountCents" >= 0 AND "giftCardCents" >= 0 AND
      "shippingCents" >= 0 AND "taxCents" >= 0 AND "totalCents" >= 0 AND
      "discountCents" <= "subtotalCents" AND "giftCardCents" <= "totalCents" AND
      "totalCents" = "subtotalCents" - "discountCents" + "shippingCents"
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderItem_amounts_check') THEN
    ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_amounts_check" CHECK ("unitCents" >= 0 AND "qty" > 0 AND "totalCents" = "unitCents" * "qty" AND "taxRateBps" BETWEEN 0 AND 10000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DiscountCode_values_check') THEN
    ALTER TABLE "DiscountCode" ADD CONSTRAINT "DiscountCode_values_check" CHECK (
      "type" IN ('PERCENT','FIXED') AND "scope" IN ('ALL','LOCATIONS','CATEGORIES','PRODUCTS') AND
      "value" > 0 AND ("type" <> 'PERCENT' OR "value" <= 10000) AND "usedCount" >= 0 AND
      ("maxUses" IS NULL OR "maxUses" > 0) AND ("perUserLimit" IS NULL OR "perUserLimit" > 0) AND
      ("minSubtotalCents" IS NULL OR "minSubtotalCents" >= 0) AND
      ("startsAt" IS NULL OR "endsAt" IS NULL OR "startsAt" <= "endsAt")
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DiscountRedemption_amount_check') THEN
    ALTER TABLE "DiscountRedemption" ADD CONSTRAINT "DiscountRedemption_amount_check" CHECK ("amountCents" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GiftCard_balance_check') THEN
    ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_balance_check" CHECK ("initialCents" > 0 AND "balanceCents" BETWEEN 0 AND "initialCents" AND "currency" = 'EUR');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GiftCardTransaction_delta_reason_check') THEN
    ALTER TABLE "GiftCardTransaction" ADD CONSTRAINT "GiftCardTransaction_delta_reason_check" CHECK ("delta" <> 0 AND "reason" IN ('ISSUE','REDEEM','REFUND','ADJUSTMENT'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Referral_status_check') THEN
    ALTER TABLE "Referral" ADD CONSTRAINT "Referral_status_check" CHECK ("status" IN ('PENDING','SIGNED_UP','REDEEMED'));
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'PaymentAttempt_values_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%INITIALIZING%'
  ) THEN
    ALTER TABLE "PaymentAttempt" DROP CONSTRAINT "PaymentAttempt_values_check";
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PaymentAttempt_values_check') THEN
    ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_values_check" CHECK (
      "amountCents" > 0 AND "currency" = 'EUR' AND
      "status" IN ('CREATED','INITIALIZING','PENDING','PAID','FAILED','EXPIRED','REFUNDED','REVIEW')
    );
  END IF;
END $$;

COMMIT;
