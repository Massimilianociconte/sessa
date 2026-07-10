import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const SERIALIZABLE_RETRIES = 4;

export function prismaErrorCode(error: unknown): string | null {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : null;
}

/**
 * PostgreSQL puo abortire correttamente una transazione SERIALIZABLE quando due
 * checkout leggono e modificano le stesse invarianti. P2034 e quindi un segnale
 * da ritentare dall'inizio, non un errore da mostrare al cliente.
 */
export async function serializableTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  retries = SERIALIZABLE_RETRIES
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: "Serializable",
        maxWait: 5_000,
        timeout: 20_000
      });
    } catch (error) {
      lastError = error;
      if (prismaErrorCode(error) !== "P2034" || attempt === retries - 1) throw error;
      // Jitter breve: evita che due lambda ripartano in lockstep.
      await new Promise((resolve) => setTimeout(resolve, 15 * (attempt + 1) + Math.floor(Math.random() * 20)));
    }
  }
  throw lastError;
}
