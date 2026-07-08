import { PrismaClient } from "@prisma/client";

// Singleton: evita di esaurire connessioni con l'hot reload di Next in dev.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Connessione database. Su Netlify il Postgres (Neon) viene provisionato in
 * automatico e la connection string arriva come NETLIFY_DATABASE_URL; in
 * locale/altri host si usa DATABASE_URL.
 */
const databaseUrl = process.env.NETLIFY_DATABASE_URL ?? process.env.DATABASE_URL;

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient(databaseUrl ? { datasourceUrl: databaseUrl } : undefined);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
