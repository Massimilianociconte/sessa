import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { refundOrder } from "@/lib/services/payment-attempts";

const RETURN_WINDOW_DAYS = 14;

export async function requestReturn(orderId: string, customerId: string, reason: string): Promise<void> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId },
    select: { id: true, status: true, deliveredAt: true }
  });
  if (!order) throw new DomainError("Ordine non trovato.");
  if (order.status !== "DELIVERED") throw new DomainError("Puoi richiedere un reso solo dopo la consegna.");
  const deliveredAt = order.deliveredAt ?? new Date(0);
  if (Date.now() - deliveredAt.getTime() > RETURN_WINDOW_DAYS * 24 * 60 * 60_000) {
    throw new DomainError("La finestra di reso di 14 giorni e scaduta.");
  }
  const open = await prisma.returnRequest.findFirst({
    where: { orderId, status: { in: ["REQUESTED", "APPROVED"] } }
  });
  if (open) throw new DomainError("C'e gia una richiesta di reso aperta.");
  try {
    await prisma.returnRequest.create({
      data: { orderId, customerId, reason: reason.trim().slice(0, 500), status: "REQUESTED" }
    });
  } catch (error) {
    // Indice unico parziale ReturnRequest_one_active_per_order_key (0010):
    // chiude la race fra due richieste concorrenti dello stesso cliente.
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") {
      throw new DomainError("C'e gia una richiesta di reso aperta.");
    }
    throw error;
  }
}

/**
 * Risoluzione di una richiesta di reso, sicura sotto crash e concorrenza.
 *
 * Il rimborso tocca il provider esterno e quindi non puo stare dentro un'unica
 * transazione locale: si usa uno stato intermedio APPROVED come "lease".
 *   REQUESTED → (claim atomico) → APPROVED → refundOrder() → REFUNDED
 *
 * Ogni passaggio e riprendibile: se il processo muore fra APPROVED e REFUNDED,
 * un nuovo tentativo di resolveReturnRequest riparte da APPROVED ed esegue il
 * rimborso mancante (refundOrder e idempotente sui rimborsi gia completati).
 * Non esiste piu nessun window in cui il denaro e stato erogato senza che lo
 * stato della pratica lo rifletta, ne doppie approvazioni concorrenti.
 */
export async function resolveReturnRequest(
  requestId: string,
  actorEmail: string,
  decision: "APPROVED" | "REJECTED",
  refundCents?: number
): Promise<void> {
  const request = await prisma.returnRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new DomainError("Richiesta non trovata.");

  if (request.status === "REFUNDED" || request.status === "REJECTED") {
    throw new DomainError("Questa richiesta e stata gia risolta.");
  }

  if (decision === "REJECTED") {
    if (request.status !== "REQUESTED") {
      throw new DomainError("La richiesta e gia stata approvata: usa il rimborso dall'ordine.");
    }
    const rejected = await prisma.returnRequest.updateMany({
      where: { id: requestId, status: "REQUESTED" },
      data: { status: "REJECTED", resolvedAt: new Date(), adminNote: "Respinta" }
    });
    if (rejected.count === 0) {
      throw new DomainError("Lo stato della richiesta e cambiato. Ricarica e riprova.");
    }
    return;
  }

  // APPROVED: claim atomico da REQUESTED, o ripresa di una richiesta gia
  // approvata ma non ancora rimborsata (retry dopo crash/errore provider).
  const claimed = await prisma.returnRequest.updateMany({
    where: { id: requestId, status: "REQUESTED" },
    data: { status: "APPROVED", adminNote: "Approvata: rimborso in corso", refundCents: refundCents ?? null }
  });
  if (claimed.count === 0 && request.status !== "APPROVED") {
    throw new DomainError("Lo stato della richiesta e cambiato. Ricarica e riprova.");
  }

  try {
    await refundOrder(request.orderId, actorEmail, "Reso approvato", { amountCents: refundCents });
  } catch (error) {
    // Rimborso non partito: la richiesta resta APPROVED (non REQUESTED) cosi
    // il retry prosegue da qui invece di ricreare il beneficio due volte.
    throw error instanceof DomainError ? error : new DomainError("Rimborso non riuscito. La richiesta resta approvata: riprova.");
  }

  const finalized = await prisma.returnRequest.updateMany({
    where: { id: requestId, status: "APPROVED" },
    data: { status: "REFUNDED", resolvedAt: new Date(), refundCents: refundCents ?? null }
  });
  if (finalized.count === 0) {
    // Gia finalizzata da un retry concorrente: ok.
    return;
  }
}
