#!/bin/sh
set -eu

if [ -n "${DIRECT_URL:-}" ]; then
  DATABASE_URL="$DIRECT_URL"
  export DATABASE_URL
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL o DIRECT_URL obbligatoria" >&2
  exit 1
fi

if [ "${1:-}" = "--bootstrap" ]; then
  npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations-postgres/0000_assert_empty.sql
  npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations-postgres/0001_init.sql
fi

for migration in \
  prisma/migrations-postgres/0002_account_email_pwa_hardening.sql \
  prisma/migrations-postgres/0003_passkeys.sql \
  prisma/migrations-postgres/0004_rate_limit.sql \
  prisma/migrations-postgres/0005_commerce_integrity.sql
do
  npx prisma db execute --schema prisma/schema.prisma --file "$migration"
done
