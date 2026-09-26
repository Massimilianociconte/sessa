#!/bin/sh
# Ricrea da zero il database di test (solo locale, solo sessa_test) e applica
# tutte le migrazioni come in un bootstrap reale.
set -eu
URL="${TEST_DATABASE_URL:-postgresql://localhost:5432/sessa_test}"
case "$URL" in
  postgresql://*@localhost:*/sessa_test*|postgresql://localhost:*/sessa_test*|postgresql://*@127.0.0.1:*/sessa_test*|postgresql://127.0.0.1:*/sessa_test*) ;;
  *) echo "reset-db rifiuta $URL: ammesso solo sessa_test su localhost" >&2; exit 1 ;;
esac
psql "$URL" -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;' >/dev/null
DATABASE_URL="$URL" MIGRATION_DATABASE_URL="$URL" PRISMA_HIDE_UPDATE_MESSAGE=1 sh prisma/run-postgres-migrations.sh --bootstrap >/dev/null 2>&1 || {
  echo "Bootstrap migrazioni fallito su $URL" >&2
  DATABASE_URL="$URL" MIGRATION_DATABASE_URL="$URL" sh prisma/run-postgres-migrations.sh --bootstrap
  exit 1
}
echo "sessa_test pronto."
