/**
 * Barriera tra ambienti: fuori da NODE_ENV=production nessun processo
 * (next dev, seed, script, test) può aprire una connessione verso un host
 * Postgres remoto. Prima era solo un warning e il `.env` locale puntava al DB
 * di produzione: ogni esperimento scriveva sui dati reali dei clienti.
 *
 * L'override esiste per i comandi di release eseguiti consapevolmente
 * (migrazioni, verifiche): SESSA_ALLOW_REMOTE_DB=1 esplicito nella shell.
 * Il vecchio flag SESSA_ALLOW_PROD_DB_FROM_DEV e accettato per compatibilita.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "host.docker.internal", "postgres", "db"]);

export function isLocalDatabaseHost(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") return false;
    // Socket unix (host vuoto o path) = locale.
    return parsed.hostname === "" || LOCAL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function remoteDatabaseAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.NODE_ENV === "production" ||
    env.SESSA_ALLOW_REMOTE_DB === "1" ||
    env.SESSA_ALLOW_PROD_DB_FROM_DEV === "1"
  );
}

/** Lancia se un processo non di produzione punta a un database remoto. */
export function assertDatabaseTargetAllowed(url: string | undefined, env: NodeJS.ProcessEnv = process.env): void {
  if (!url || remoteDatabaseAllowed(env) || isLocalDatabaseHost(url)) return;
  let host = "sconosciuto";
  try {
    host = new URL(url).hostname;
  } catch {
    // URL non parsabile: si blocca comunque.
  }
  throw new Error(
    `[db-guard] Connessione rifiutata: NODE_ENV=${env.NODE_ENV ?? "undefined"} verso host remoto "${host}". ` +
      "Usa un Postgres locale in .env (es. postgresql://localhost:5432/sessa_dev). " +
      "Solo per comandi di release consapevoli: SESSA_ALLOW_REMOTE_DB=1."
  );
}
