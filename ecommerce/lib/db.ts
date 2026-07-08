import { PrismaClient } from "@prisma/client";

// Singleton: evita di esaurire connessioni con l'hot reload di Next in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Connessione database. Su Netlify il Postgres (Neon) viene provisionato in
 * automatico e la connection string arriva come NETLIFY_DATABASE_URL; in
 * locale/altri host si usa DATABASE_URL.
 */
const rawDatabaseUrl = process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL;

function withConnectionLimit(url: string | undefined): string | undefined {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    if ((parsed.protocol === "postgres:" || parsed.protocol === "postgresql:") && !parsed.searchParams.has("connection_limit")) {
      // Next/Netlify build e funzioni serverless possono aprire piu worker in parallelo.
      // Prisma di default crea pool piu ampi e saturerebbe Postgres; ma 1 sola
      // connessione SERIALIZZA le Promise.all (dashboard ≈ 13 query in fila sulla
      // rete). Col pooler in transaction mode (pgbouncer) un piccolo pool per
      // lambda e sicuro e parallelizza le letture.
      parsed.searchParams.set("connection_limit", process.env.NODE_ENV === "production" ? "5" : "3");
      parsed.searchParams.set("pool_timeout", parsed.searchParams.get("pool_timeout") ?? "20");
      return parsed.toString();
    }
  } catch {
    return url;
  }

  return url;
}

const databaseUrl = withConnectionLimit(rawDatabaseUrl);

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient(databaseUrl ? { datasourceUrl: databaseUrl } : undefined);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
