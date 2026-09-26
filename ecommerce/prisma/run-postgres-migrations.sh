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

# Conferma esplicita per database remoti: una migrazione lanciata per errore
# dal .env di sviluppo non deve mai raggiungere la produzione in silenzio.
TARGET=$(node -e 'try{const u=new URL(process.argv[1]);console.log(`${u.hostname||"socket-locale"}:${u.port||"5432"}${u.pathname}`)}catch{console.log("url-non-valida")}' "$DATABASE_URL")
case "$TARGET" in
  localhost:*|127.0.0.1:*|socket-locale:*|"[::1]":*) ;;
  *)
    if [ "${SESSA_CONFIRM_REMOTE_MIGRATION:-}" != "1" ]; then
      echo "Database REMOTO: $TARGET" >&2
      if [ -t 0 ]; then
        printf "Scrivi MIGRA per applicare le migrazioni a questo database: " >&2
        read -r answer
        [ "$answer" = "MIGRA" ] || { echo "Annullato." >&2; exit 1; }
      else
        echo "Imposta SESSA_CONFIRM_REMOTE_MIGRATION=1 per confermare in modalita non interattiva." >&2
        exit 1
      fi
    fi
    # I comandi Prisma sotto devono poter raggiungere il DB remoto.
    SESSA_ALLOW_REMOTE_DB=1
    export SESSA_ALLOW_REMOTE_DB
    ;;
esac
echo "Target migrazioni: $TARGET"

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
  # Il ledger deve esistere prima di registrarvi 0000/0001: su un DB vuoto
  # (bootstrap o restore di disaster recovery) l'INSERT falliva con P1014.
  execute_sql prisma/migrations-postgres/0000_ledger.sql
  record_in_ledger prisma/migrations-postgres/0000_assert_empty.sql
  record_in_ledger prisma/migrations-postgres/0001_init.sql
fi

# 1. Ledger (dopo il guard di vuotezza nel caso bootstrap; idempotente).
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
  prisma/migrations-postgres/0010_refund_state_and_fk_integrity.sql \
  prisma/migrations-postgres/0011_launch_readiness.sql
do
  apply_migration "$migration"
done

echo "Migrazioni completate."
