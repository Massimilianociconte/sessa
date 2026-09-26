#!/bin/sh
set -eu

DATABASE_URL="${MIGRATION_DATABASE_URL:-${DATABASE_URL:-}}"
export DATABASE_URL

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL o MIGRATION_DATABASE_URL obbligatoria" >&2
  exit 1
fi

echo "== 1/2 Diff Prisma (tabelle, colonne, indici noti al datamodel) =="
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --exit-code

# Il diff di Prisma NON vede CHECK constraint, indici parziali/espressivi e FK
# aggiunte solo via SQL: qui sotto la verifica esplicita degli invarianti
# critici introdotti dalle migrazioni 0005-0010.

echo "== 2/2 Vincoli critici non visibili al diff Prisma =="

npx prisma db execute --schema prisma/schema.prisma --stdin <<'SQL'
DO $$
DECLARE
  missing TEXT[];
  actual  TEXT[];
BEGIN
  SELECT COALESCE(array_agg(conname ORDER BY conname), '{}') INTO actual
  FROM pg_constraint
  WHERE conrelid = 'public."Order"'::regclass AND contype = 'c'
    AND conname IN (
      'Order_paymentStatus_check',      -- include PARTIALLY_REFUNDED (0010)
      'Order_refunded_cents_range',     -- 0 <= refundedCents <= totalCents (0010)
      'Order_payment_state_check',      -- 0006
      'Order_fulfillment_state_check'   -- 0006
    );
  IF array_length(actual, 1) IS NULL OR array_length(actual, 1) <> 4 THEN
    missing := missing || array['Order: mancano CHECK pagamento/rimborso (attese 4, trovate ' || coalesce(array_length(actual,1)::text,'0') || ')'];
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'ReturnRequest_one_active_per_order_key'
  ) THEN
    missing := missing || array['ReturnRequest: manca indice unico parziale un-reso-attivo-per-ordine (0010)'];
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Order_paymentStatus_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%PARTIALLY_REFUNDED%'
  ) THEN
    missing := missing || array['Order: Order_paymentStatus_check non include PARTIALLY_REFUNDED'];
  END IF;

  IF (
    SELECT COUNT(*) FROM pg_constraint
    WHERE conname IN (
      'Cart_customerId_fkey', 'CheckoutNonce_orderId_fkey',
      'ReturnRequest_orderId_fkey', 'ReturnRequest_customerId_fkey'
    )
  ) <> 4 THEN
    missing := missing || array['FK 0009/0010 incomplete (Cart/CheckoutNonce/ReturnRequest)'];
  END IF;

  IF (
    SELECT COUNT(*) FROM pg_indexes
    WHERE tablename = 'Order'
      AND indexname IN ('Order_status_fulfillmentAt_idx')
  ) <> 1 THEN
    missing := missing || array['Order: manca indice status+fulfillmentAt (0010)'];
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Order_payment_state_check'
      AND pg_get_constraintdef(oid) NOT LIKE '%PARTIALLY_REFUNDED%'
  ) THEN
    missing := missing || array['Order: Order_payment_state_check blocca i rimborsi parziali (0011)'];
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relkind = 'S' AND relname = 'order_number_seq') THEN
    missing := missing || array['Manca la sequenza order_number_seq (0011)'];
  END IF;

  IF (
    SELECT COUNT(*) FROM pg_constraint
    WHERE conname IN ('Location_schedule_check', 'Product_fulfillment_check', 'ShippingRate_scope_check')
  ) <> 3 THEN
    missing := missing || array['CHECK 0011 incomplete (Location/Product/ShippingRate)'];
  END IF;

  IF (
    SELECT COUNT(*) FROM "_sessa_migration_ledger"
  ) < 10 THEN
    missing := missing || array['Ledger migrazioni assente o incompleto: rieseguire db:deploy'];
  END IF;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'VERIFICA FALLITA: %', array_to_string(missing, ' | ');
  END IF;
  RAISE NOTICE 'Tutti i vincoli critici sono presenti.';
END $$;
SQL

echo "Verifica schema completata."
