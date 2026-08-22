import { PrismaClient } from "@prisma/client";

// Singleton: evita di esaurire connessioni con l'hot reload di Next in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Connessione runtime PostgreSQL. DATABASE_URL deve puntare al pooler runtime;
 * MIGRATION_DATABASE_URL e riservata ai comandi di release e non viene mai
 * usata dalle lambda.
 */
const rawDatabaseUrl = process.env.DATABASE_URL ?? process.env.NETLIFY_DATABASE_URL;

function withConnectionLimit(url: string | undefined): string | undefined {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    if (parsed.protocol === "postgres:" || parsed.protocol === "postgresql:") {
      const isSupabasePooler = parsed.hostname.endsWith("pooler.supabase.com");
      const isTransactionPooler = isSupabasePooler && parsed.port === "6543";
      // Il session pooler Supabase live ha pool_size 15: 5 connessioni per ogni
      // cold lambda lo esauriscono con appena tre istanze. Anche sul transaction
      // pooler una connessione per lambda e il default serverless piu prudente.
      const configured = process.env.DATABASE_CONNECTION_LIMIT;
      const safeDefault = isSupabasePooler ? "1" : process.env.NODE_ENV === "production" ? "2" : "3";
      // Su Supabase il limite sicuro vince anche su una query string legacy con
      // connection_limit=5; per alzarlo serve l'override esplicito e monitorato.
      if (configured || isSupabasePooler || !parsed.searchParams.has("connection_limit")) {
        parsed.searchParams.set("connection_limit", configured ?? safeDefault);
      }
      if (isTransactionPooler && !parsed.searchParams.has("pgbouncer")) {
        parsed.searchParams.set("pgbouncer", "true");
      }
      parsed.searchParams.set("pool_timeout", parsed.searchParams.get("pool_timeout") ?? "20");
      return parsed.toString();
    }
  } catch {
    return url;
  }

  return url;
}

const databaseUrl = withConnectionLimit(rawDatabaseUrl);

/**
 * Guardia anti-disastro: in sviluppo il .env locale non deve MAI puntare al
 * database di produzione (rischio di scrivere dati demo/cancellazioni test
 * direttamente in prod). Il check e' un warning forte, non un blocco: alcuni
 * comandi amministrativi possono volersi collegare consapevolmente; per far
 * tacere l'avviso in modo esplicito esiste SESSA_ALLOW_PROD_DB_FROM_DEV=1.
 */
function warnIfDevTargetsProduction(url: string | undefined): void {
  if (!url || process.env.NODE_ENV === "production") return;
  if (process.env.SESSA_ALLOW_PROD_DB_FROM_DEV === "1") return;
  try {
    const host = new URL(url).hostname;
    if (host.endsWith("pooler.supabase.com") || host.endsWith("supabase.co")) {
      console.warn(
        "\n" +
          "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n" +
          "!! ATTENZIONE: sviluppo collegato a un database Supabase remoto. !!\n" +
          "!! Se e' il DB di PRODUZIONE, ogni comando locale (dev, seed,  !!\n" +
          "!! test) scrive sui dati reali. Imposta un DATABASE_URL locale  !!\n" +
          "!! oppure SESSA_ALLOW_PROD_DB_FROM_DEV=1 se e' intenzionale.    !!\n" +
          "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n"
      );
    }
  } catch {
    // URL non parsabile: la connessione fallira' da sola con errore chiaro.
  }
}

warnIfDevTargetsProduction(databaseUrl);

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient(databaseUrl ? { datasourceUrl: databaseUrl } : undefined);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
