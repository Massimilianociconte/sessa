#!/bin/sh
set -eu

# Runner migrazioni PostgreSQL Sessa 1930.
#
# Modello di sicurezza:
#   1. Ogni migrazione e SCRITTA PER ESSERE IDEMPOTENTE (IF NOT EXISTS,
#      bonifiche difensive, DROP CONSTRAINT IF EXISTS): un ri-run non altera
#      mai lo stato corretto e ripara uno stato parziale lasciato da un crash
#      a meta file (0002-0008 autocommit statement-per-statement).
#   2. Il ledger "_sessa_migration_ledger" (nome + sha256) registra cio che e
#      stato applicato e quando: traccia operativa per deploy e DR.
#   3. `--bootstrap` richiede un DB vuoto (0000_assert_empty fallisce altrimenti).
#      Ordine bootstrap: guard vuotezza → 0001_init → creazione ledger → resto.
#
# Uso:
#   DATABASE_URL=... sh prisma/run-postgres-migrations.sh
#   MIGRATION_DATABASE_URL=... sh prisma/run-postgres-migrations.sh --bootstrap

if [ -n "${MIGRATION_DATABASE_URL:-}" ]; then
  DATABASE_URL="$MIGRATION_DATABASE_URL"
  export DATABASE_URL
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL o MIGRATION_DATABASE_URL obbligatoria" >&2
  exit 1
fi

SCHEMA="prisma/schema.prisma"

execute_sql() {
  npx prisma db execute --schema "$SCHEMA" --file "$1"
}

checksum_of() {
  shasum -a 256 "$1" | cut -d' ' -f1
}

record_in_ledger() {
  file="$1"
  name=$(basename "$file")
  checksum=$(checksum_of "$file")
  npx prisma db execute --schema "$SCHEMA" --stdin <<SQL
INSERT INTO "_sessa_migration_ledger" ("name", "checksum") VALUES ('$name', '$checksum')
ON CONFLICT ("name") DO UPDATE
  SET "checksum" = EXCLUDED."checksum", "applied_at" = CURRENT_TIMESTAMP;
SQL
}

apply_migration() {
  file="$1"
  echo "+ $(basename "$file")"
  execute_sql "$file"
  record_in_ledger "$file"
}

MODE="${1:-}"

# 0. Guard + schema iniziale sul bootstrap (PRIMA del ledger: il guard
#    esige lo schema completamente vuoto).
if [ "$MODE" = "--bootstrap" ]; then
  echo "+ 0000_assert_empty.sql"
  execute_sql prisma/migrations-postgres/0000_assert_empty.sql
  echo "+ 0001_init.sql"
  execute_sql prisma/migrations-postgres/0001_init.sql
  record_in_ledger prisma/migrations-postgres/0000_assert_empty.sql
  record_in_ledger prisma/migrations-postgres/0001_init.sql
fi

# 1. Ledger (dopo il guard di vuotezza nel caso bootstrap).
execute_sql prisma/migrations-postgres/0000_ledger.sql

# 2. Migrazioni additive/idempotenti.
for migration in \
  prisma/migrations-postgres/0002_account_email_pwa_hardening.sql \
  prisma/migrations-postgres/0003_passkeys.sql \
  prisma/migrations-postgres/0004_rate_limit.sql \
  prisma/migrations-postgres/0005_commerce_integrity.sql \
  prisma/migrations-postgres/0006_transaction_security_geo.sql \
  prisma/migrations-postgres/0007_operations_security_merchant.sql \
  prisma/migrations-postgres/0008_location_geo_gbp.sql \
  prisma/migrations-postgres/0009_commerce_hardening.sql \
  prisma/migrations-postgres/0010_refund_state_and_fk_integrity.sql
do
  apply_migration "$migration"
done

echo "Migrazioni completate."
