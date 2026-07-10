import { prisma } from "@/lib/db";
import { safeErrorMetadata } from "@/lib/safe-log";

/**
 * Traccia ogni azione di scrittura del gestionale.
 * Best-effort: un errore di audit non deve bloccare l'operazione.
 */
export async function audit(
  actorEmail: string,
  action: string,
  entity: string,
  entityId?: string,
  payload?: unknown
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorEmail,
        action,
        entity,
        entityId,
        payload: payload === undefined ? null : JSON.stringify(payload)
      }
    });
  } catch (error) {
    console.error("Audit log fallito", safeErrorMetadata(error));
  }
}
