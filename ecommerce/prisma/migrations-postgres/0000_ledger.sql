-- Ledger delle migrazioni applicate (storia + checksum per tracciabilita).
-- Il runner registra qui ogni file dopo l'applicazione; la sicurezza del
-- ri-run e garantita dall'idempotenza delle migrazioni stesse.

CREATE TABLE IF NOT EXISTS "_sessa_migration_ledger" (
  name       TEXT PRIMARY KEY,
  checksum   TEXT NOT NULL,
  applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_by TEXT NOT NULL DEFAULT 'run-postgres-migrations.sh'
);
