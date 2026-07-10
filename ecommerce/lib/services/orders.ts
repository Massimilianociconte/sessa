import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  DomainError,
  ORDER_STATUS_LABELS,
  ORDER_TRANSITIONS,
  type PaymentStatus,
  STOCK_HOLDING_STATUSES,
  type OrderStatus
} from "@/lib/domain";
import { audit } from "@/lib/audit";
import { safeErrorMetadata } from "@/lib/safe-log";
import { maybeConvertReferral } from "@/lib/services/referral";
import { romeDateKey, romeDayRange } from "@/lib/datetime";
import { getStripe, isStripeConfigured } from "@/lib/payments/stripe";

const orderInclude = {
  items: true,
  customer: true,
  location: true,
  events: { orderBy: { createdAt: "desc" } }
} satisfies Prisma.OrderInclude;

export type FullOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export type OrderFilter = {
  status?: OrderStatus;
  query?: string; // codice, email, nome, telefono, riferimento pagamento
  locationId?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  fulfillmentType?: string;
  discountCode?: string;
  placedFrom?: Date; // ordini piazzati da (incluso)
  placedTo?: Date; // ordini piazzati fino a (escluso: passare il giorno dopo)
  fulfillmentOn?: Date; // giorno di ritiro/consegna richiesto
  page?: number; // 1-based
  take?: number;
};

export function buildOrderWhere(filter?: OrderFilter): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};
  if (filter?.status) where.status = filter.status;
  if (filter?.locationId) where.locationId = filter.locationId;
  if (filter?.paymentStatus) where.paymentStatus = filter.paymentStatus;
  if (filter?.paymentMethod) where.paymentMethod = filter.paymentMethod;
  if (filter?.fulfillmentType) where.fulfillmentType = filter.fulfillmentType;
  if (filter?.discountCode) where.discountCodeSnapshot = { contains: filter.discountCode.toUpperCase(), mode: "insensitive" };
  if (filter?.placedFrom || filter?.placedTo) {
    where.placedAt = {
      ...(filter.placedFrom ? { gte: filter.placedFrom } : {}),
      ...(filter.placedTo ? { lt: filter.placedTo } : {})
    };
  }
  if (filter?.fulfillmentOn) {
    const range = romeDayRange(romeDateKey(filter.fulfillmentOn));
    if (range) where.fulfillmentAt = { gte: range.start, lt: range.end };
  }
  if (filter?.query) {
    const q = filter.query.trim();
    where.OR = [
      { id: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { customerId: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q, mode: "insensitive" } },
      { shipFullName: { contains: q, mode: "insensitive" } },
      { locationName: { contains: q, mode: "insensitive" } },
      { paymentRef: { contains: q, mode: "insensitive" } },
      { paymentMethod: { contains: q, mode: "insensitive" } },
      { discountCodeSnapshot: { contains: q.toUpperCase(), mode: "insensitive" } },
      { giftCardCodeSnapshot: { contains: q.toUpperCase(), mode: "insensitive" } },
      { referralCodeSnapshot: { contains: q.toUpperCase(), mode: "insensitive" } }
    ];
  }
  return where;
}

export async function listOrders(filter?: OrderFilter) {
  const where = buildOrderWhere(filter);
  const take = filter?.take ?? 50;
  const page = Math.max(1, filter?.page ?? 1);
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { items: true, location: { select: { name: true } } },
      orderBy: { placedAt: "desc" },
      skip: (page - 1) * take,
      take
    }),
    prisma.order.count({ where })
  ]);
  return { orders, total, page, pageCount: Math.max(1, Math.ceil(total / take)), take };
}

/** Aggregati sull'INTERO filtro (non solo la pagina corrente) per i KPI operativi. */
export async function orderFilterStats(filter?: OrderFilter) {
  const where = buildOrderWhere(filter);
  const [paid, failed, pickup, total] = await Promise.all([
    prisma.order.aggregate({
      _sum: { totalCents: true },
      _count: { _all: true },
      where: { ...where, paymentStatus: "PAID" }
    }),
    prisma.order.count({ where: { ...where, paymentStatus: "FAILED" } }),
    prisma.order.count({ where: { ...where, fulfillmentType: "PICKUP" } }),
    prisma.order.count({ where })
  ]);
  return {
    total,
    paidCount: paid._count._all,
    revenueCents: paid._sum.totalCents ?? 0,
    failedCount: failed,
    pickupCount: pickup,
    deliveryCount: total - pickup
  };
}

/** Export operativo: tutti gli ordini del filtro (cap alto di sicurezza), righe incluse. */
export async function listOrdersForExport(filter?: OrderFilter) {
  return prisma.order.findMany({
    where: buildOrderWhere(filter),
    include: { items: true, location: { select: { name: true } } },
    orderBy: { placedAt: "desc" },
    take: 5000
  });
}

export async function getOrder(id: string): Promise<FullOrder | null> {
  return prisma.order.findUnique({ where: { id }, include: orderInclude });
}

export async function getOrderForTracking(code: string, publicToken: string): Promise<FullOrder | null> {
  const order = await prisma.order.findUnique({ where: { code }, include: orderInclude });
  if (!order || order.publicToken !== publicToken) return null;
  return order;
}

type TransitionOptions = {
  note?: string;
  paymentRef?: string;
  restock?: boolean;
  paymentStatus?: PaymentStatus;
};

type TransitionResult = {
  orderId: string;
  orderCode: string;
  customerId: string | null;
  from: OrderStatus;
  to: OrderStatus;
};

/** Restituisce gift card e disponibilita coupon quando l'ordine viene stornato. */
async function reverseCheckoutBenefitsInTx(
  tx: Prisma.TransactionClient,
  order: {
    id: string;
    code: string;
    discountCodeId: string | null;
    giftCardCodeSnapshot: string | null;
    giftCardCents: number;
  },
  reason: string
): Promise<void> {
  if (order.discountCodeId) {
    const redemption = await tx.discountRedemption.findUnique({ where: { orderId: order.id } });
    if (redemption && !redemption.reversedAt) {
      const reversed = await tx.discountRedemption.updateMany({
        where: { id: redemption.id, reversedAt: null },
        data: { reversedAt: new Date(), reversalReason: reason }
      });
      if (reversed.count > 0) {
        await tx.discountCode.updateMany({
          where: { id: order.discountCodeId, usedCount: { gt: 0 } },
          data: { usedCount: { decrement: 1 } }
        });
      }
    }
  }

  if (order.giftCardCodeSnapshot && order.giftCardCents > 0) {
    const card = await tx.giftCard.findUnique({ where: { code: order.giftCardCodeSnapshot } });
    if (card) {
      const alreadyRestored = await tx.giftCardTransaction.findUnique({
        where: {
          giftCardId_reason_reference: {
            giftCardId: card.id,
            reason: "REFUND",
            reference: order.code
          }
        }
      });
      if (!alreadyRestored) {
        await tx.giftCard.update({
          where: { id: card.id },
          data: { balanceCents: { increment: order.giftCardCents } }
        });
        await tx.giftCardTransaction.create({
          data: {
            giftCardId: card.id,
            delta: order.giftCardCents,
            reason: "REFUND",
            reference: order.code
          }
        });
      }
    }
  }
}

/**
 * Variante transazionale condivisa da admin e webhook. L'update condizionale
 * sullo stato e la barriera che impedisce doppio restock/evento sotto concorrenza.
 */
export async function transitionOrderInTx(
  tx: Prisma.TransactionClient,
  orderId: string,
  to: OrderStatus,
  actorEmail: string,
  opts?: TransitionOptions
): Promise<TransitionResult> {
  const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) throw new DomainError("Ordine non trovato.");
  const from = order.status as OrderStatus;
  if (!ORDER_TRANSITIONS[from]?.includes(to)) {
    throw new DomainError(
      `Transizione non ammessa: ${ORDER_STATUS_LABELS[from]} → ${ORDER_STATUS_LABELS[to]}.`
    );
  }
  if (to === "REFUNDED" && order.paymentStatus !== "PAID") {
    throw new DomainError("Un ordine non pagato non puo essere rimborsato.");
  }

  const now = new Date();
  const data: Prisma.OrderUncheckedUpdateManyInput = { status: to };
  if (to === "PAID") {
    data.paidAt = now;
    data.paymentStatus = "PAID";
  }
  if (opts?.paymentRef) data.paymentRef = opts.paymentRef;
  if (opts?.paymentStatus) data.paymentStatus = opts.paymentStatus;
  if (to === "SHIPPED") data.shippedAt = now;
  if (to === "DELIVERED") data.deliveredAt = now;
  if (to === "CANCELLED") data.cancelledAt = now;
  if (to === "REFUNDED") data.paymentStatus = "REFUNDED";

  const claimed = await tx.order.updateMany({ where: { id: orderId, status: from }, data });
  if (claimed.count === 0) {
    throw new DomainError("Lo stato dell'ordine e cambiato durante l'operazione. Ricarica e riprova.", "ORDER_STATE_CONFLICT");
  }

  if (to === "PAID") {
    await tx.paymentAttempt.updateMany({
      where: { orderId, status: { in: ["CREATED", "INITIALIZING", "PENDING"] } },
      data: { status: "PAID", completedAt: now, error: null }
    });
  }

  const automaticallyRestock =
    (to === "CANCELLED" || to === "REFUNDED") && STOCK_HOLDING_STATUSES.includes(from);
  const shouldRestock = opts?.restock ?? automaticallyRestock;
  if (shouldRestock && order.locationId) {
    for (const item of order.items) {
      if (!item.variantId) continue;
      const sv = await tx.storeVariant.findUnique({
        where: { locationId_variantId: { locationId: order.locationId, variantId: item.variantId } }
      });
      if (!sv) continue;
      await tx.storeVariant.update({
        where: { id: sv.id },
        data: { stockQty: { increment: item.qty } }
      });
      await tx.stockMovement.create({
        data: {
          storeVariantId: sv.id,
          delta: item.qty,
          reason: "CANCEL_RESTOCK",
          reference: order.code,
          actor: actorEmail
        }
      });
    }
  }

  if (to === "CANCELLED" || to === "REFUNDED") {
    await reverseCheckoutBenefitsInTx(tx, order, to);
  }

  await tx.orderEvent.create({
    data: {
      orderId,
      type: "STATUS_CHANGE",
      message:
        `${ORDER_STATUS_LABELS[from]} → ${ORDER_STATUS_LABELS[to]}` +
        (opts?.note ? ` — ${opts.note}` : ""),
      actor: actorEmail
    }
  });

  return { orderId, orderCode: order.code, customerId: order.customerId, from, to };
}

/**
 * Unico punto d'ingresso applicativo per i cambi di stato. Gli effetti di DB
 * sono atomici; audit e reward referral sono side effect idempotenti post-commit.
 */
export async function transitionOrder(
  orderId: string,
  to: OrderStatus,
  actorEmail: string,
  opts?: TransitionOptions
): Promise<void> {
  if (to === "PAID") {
    const payment = await prisma.order.findUnique({
      where: { id: orderId },
      select: { paymentProvider: true, paymentStatus: true }
    });
    if (payment?.paymentProvider === "stripe" && payment.paymentStatus !== "PAID") {
      throw new DomainError("Gli ordini Stripe diventano pagati solo tramite webhook verificato.");
    }
  }
  if (to === "CANCELLED") {
    const activeStripeAttempts = await prisma.paymentAttempt.findMany({
      where: { orderId, provider: "stripe", status: { in: ["CREATED", "INITIALIZING", "PENDING"] } },
      select: { id: true, status: true, providerRef: true }
    });
    if (activeStripeAttempts.length > 0 && !isStripeConfigured()) {
      throw new DomainError("Impossibile annullare in sicurezza: Stripe non e configurato per chiudere il pagamento attivo.");
    }
    for (const attempt of activeStripeAttempts) {
      if (attempt.status === "INITIALIZING" && !attempt.providerRef) {
        throw new DomainError("Pagamento in inizializzazione: attendi qualche secondo prima di annullare.");
      }
      if (attempt.providerRef) {
        try {
          const session = await getStripe().checkout.sessions.retrieve(attempt.providerRef);
          if (session.payment_status === "paid") {
            throw new DomainError("Pagamento gia acquisito: attendi la riconciliazione prima di annullare.");
          }
          if (session.status === "open") {
            await getStripe().checkout.sessions.expire(attempt.providerRef);
          } else if (session.status !== "expired") {
            throw new DomainError("Pagamento Stripe in elaborazione: annullamento temporaneamente bloccato.");
          }
        } catch (error) {
          if (error instanceof DomainError) throw error;
          throw new DomainError("Non e stato possibile chiudere la sessione Stripe; ordine non annullato.");
        }
      }
      await prisma.paymentAttempt.updateMany({
        where: { id: attempt.id, status: { in: ["CREATED", "INITIALIZING", "PENDING"] } },
        data: { status: "EXPIRED", error: "Chiuso prima dell'annullamento ordine.", completedAt: new Date() }
      });
    }
  }
  const result = await prisma.$transaction((tx) => transitionOrderInTx(tx, orderId, to, actorEmail, opts));

  await audit(actorEmail, "order.status", "Order", orderId, { to, note: opts?.note });
  if (to === "PAID" && result.customerId) {
    await maybeConvertReferral(result.customerId, orderId).catch((error) => {
      console.error("Conversione referral post-pagamento fallita", safeErrorMetadata(error));
    });
  }
}

export async function setTracking(
  orderId: string,
  carrier: string,
  code: string,
  actorEmail: string
): Promise<void> {
  await prisma.order.update({ where: { id: orderId }, data: { trackingCarrier: carrier, trackingCode: code } });
  await prisma.orderEvent.create({
    data: { orderId, type: "TRACKING", message: `Tracking impostato: ${carrier} ${code}`, actor: actorEmail }
  });
  await audit(actorEmail, "order.tracking", "Order", orderId, { carrier, code });
}

export async function setAdminNote(orderId: string, note: string, actorEmail: string): Promise<void> {
  await prisma.order.update({ where: { id: orderId }, data: { adminNote: note } });
  await prisma.orderEvent.create({
    data: { orderId, type: "NOTE", message: "Nota interna aggiornata.", actor: actorEmail }
  });
}
