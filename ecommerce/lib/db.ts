import { PrismaClient } from "@prisma/client";
import { assertDatabaseTargetAllowed } from "@/lib/db-guard";

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
      // pooler una connessione per lambda e il default serverless più prudente.
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
 * Guardia anti-disastro: fuori da produzione il processo si rifiuta di
 * collegarsi a un DB remoto (vedi lib/db-guard.ts). In produzione segnala la
 * configurazione a rischio: il session pooler Supabase (porta 5432) tiene una
 * connessione per lambda per tutta la sua vita e si esaurisce a ~15 istanze.
 */
assertDatabaseTargetAllowed(databaseUrl);

function warnIfSessionPoolerInProduction(url: string | undefined): void {
  if (!url || process.env.NODE_ENV !== "production") return;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith("pooler.supabase.com") && parsed.port !== "6543") {
      console.error(
        JSON.stringify({
          level: "critical",
          source: "db",
          code: "SESSION_POOLER_IN_RUNTIME",
          message: "DATABASE_URL usa il session pooler: usare il transaction pooler 6543 con pgbouncer=true."
        })
      );
    }
  } catch {
    // URL non parsabile: la connessione fallira con errore esplicito.
  }
}

warnIfSessionPoolerInProduction(databaseUrl);

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient(databaseUrl ? { datasourceUrl: databaseUrl } : undefined);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
