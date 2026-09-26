import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { refundOrder } from "@/lib/services/payment-attempts";
import { enqueueEmail } from "@/lib/services/email";
import { getOpsRecipients } from "@/lib/services/commerce-settings";
import { trackingUrl } from "@/lib/services/order-messages";
import { SITE_URL } from "@/lib/site";

const RETURN_WINDOW_DAYS = 14;

export async function requestReturn(orderId: string, customerId: string, reason: string): Promise<void> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, customerId },
    select: {
      id: true,
      code: true,
      status: true,
      deliveredAt: true,
      email: true,
      locationName: true,
      location: { select: { notificationEmail: true } }
    }
  });
  if (!order) throw new DomainError("Ordine non trovato.");
  if (order.status !== "DELIVERED") throw new DomainError("Puoi richiedere un reso solo dopo la consegna.");
  const deliveredAt = order.deliveredAt ?? new Date(0);
  if (Date.now() - deliveredAt.getTime() > RETURN_WINDOW_DAYS * 24 * 60 * 60_000) {
    throw new DomainError("La finestra di reso di 14 giorni è scaduta.");
  }
  const open = await prisma.returnRequest.findFirst({
    where: { orderId, status: { in: ["REQUESTED", "APPROVED"] } }
  });
  if (open) throw new DomainError("C'è già una richiesta di reso aperta.");
  try {
    await prisma.returnRequest.create({
      data: { orderId, customerId, reason: reason.trim().slice(0, 500), status: "REQUESTED" }
    });
    // La sede deve saperlo: prima le segnalazioni restavano invisibili a tutti.
    const recipients = await getOpsRecipients();
    const to = order.location?.notificationEmail?.trim() || recipients.orders;
    if (to) {
      await enqueueEmail({
        toEmail: to,
        subject: `Segnalazione cliente sull'ordine ${order.code}`,
        body: `Il cliente ${order.email} ha inviato una segnalazione sull'ordine ${order.code} (${order.locationName}).\n\nMotivo: ${reason.trim().slice(0, 500)}`,
        cta: { url: `${SITE_URL}/admin/ordini/${order.id}`, label: "Gestisci nel gestionale" },
        type: "STORE_RETURN_REQUEST",
        reference: `${order.code}:${Date.now()}`
      }).catch(() => undefined);
    }
  } catch (error) {
    // Indice unico parziale ReturnRequest_one_active_per_order_key (0010):
    // chiude la race fra due richieste concorrenti dello stesso cliente.
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") {
      throw new DomainError("C'è già una richiesta di reso aperta.");
    }
    throw error;
  }
}

/**
 * Risoluzione di una richiesta di reso, sicura sotto crash e concorrenza.
 *
 * Il rimborso tocca il provider esterno e quindi non può stare dentro un'unica
 * transazione locale: si usa uno stato intermedio APPROVED come "lease".
 *   REQUESTED → (claim atomico) → APPROVED → refundOrder() → REFUNDED
 *
 * Ogni passaggio e riprendibile: se il processo muore fra APPROVED e REFUNDED,
 * un nuovo tentativo di resolveReturnRequest riparte da APPROVED ed esegue il
 * rimborso mancante (refundOrder e idempotente sui rimborsi già completati).
 * Non esiste più nessun window in cui il denaro e stato erogato senza che lo
 * stato della pratica lo rifletta, ne doppie approvazioni concorrenti.
 */
async function notifyReturnOutcome(requestId: string, text: string): Promise<void> {
  const request = await prisma.returnRequest.findUnique({
    where: { id: requestId },
    include: { order: { select: { code: true, publicToken: true, email: true } } }
  });
  if (!request) return;
  await enqueueEmail({
    toEmail: request.order.email,
    subject: `Aggiornamento sulla tua segnalazione — ordine ${request.order.code}`,
    body: text,
    cta: { url: trackingUrl(request.order), label: "Vedi l'ordine" },
    type: "RETURN_UPDATE",
    reference: `${request.id}:${request.status}`
  }).catch(() => undefined);
}

export async function resolveReturnRequest(
  requestId: string,
  actorEmail: string,
  decision: "APPROVED" | "REJECTED",
  refundCents?: number,
  note?: string
): Promise<void> {
  const request = await prisma.returnRequest.findUnique({ where: { id: requestId } });
  if (!request) throw new DomainError("Richiesta non trovata.");

  if (request.status === "REFUNDED" || request.status === "REJECTED") {
    throw new DomainError("Questa richiesta è già stata risolta.");
  }

  if (decision === "REJECTED") {
    if (request.status !== "REQUESTED") {
      throw new DomainError("La richiesta è già stata approvata: usa il rimborso dall'ordine.");
    }
    const rejected = await prisma.returnRequest.updateMany({
      where: { id: requestId, status: "REQUESTED" },
      data: { status: "REJECTED", resolvedAt: new Date(), adminNote: note?.trim().slice(0, 500) || "Non accolta" }
    });
    if (rejected.count === 0) {
      throw new DomainError("Lo stato della richiesta è cambiato. Ricarica e riprova.");
    }
    await notifyReturnOutcome(
      requestId,
      `La sede ha valutato la tua segnalazione e non può accoglierla.${note?.trim() ? `\n\nMotivazione: ${note.trim().slice(0, 500)}` : ""}\n\nPer chiarimenti rispondi alla sede indicando il codice ordine.`
    );
    return;
  }

  // APPROVED: claim atomico da REQUESTED, o ripresa di una richiesta già
  // approvata ma non ancora rimborsata (retry dopo crash/errore provider).
  const claimed = await prisma.returnRequest.updateMany({
    where: { id: requestId, status: "REQUESTED" },
    data: { status: "APPROVED", adminNote: note?.trim().slice(0, 500) || "Accolta: rimborso in corso", refundCents: refundCents ?? null }
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
    // Già finalizzata da un retry concorrente: ok.
    return;
  }
  // L'email con l'importo rimborsato parte da refundOrder; qui il solo esito.
  await notifyReturnOutcome(requestId, "La sede ha accolto la tua segnalazione e ha disposto il rimborso: riceverai una conferma separata con l'importo.");
}
