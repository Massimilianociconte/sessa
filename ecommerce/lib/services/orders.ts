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
  take?: number;
};

export async function listOrders(filter?: OrderFilter) {
  const where: Prisma.OrderWhereInput = {};
  if (filter?.status) where.status = filter.status;
  if (filter?.locationId) where.locationId = filter.locationId;
  if (filter?.paymentStatus) where.paymentStatus = filter.paymentStatus;
  if (filter?.paymentMethod) where.paymentMethod = filter.paymentMethod;
  if (filter?.fulfillmentType) where.fulfillmentType = filter.fulfillmentType;
  if (filter?.discountCode) where.discountCodeSnapshot = { contains: filter.discountCode.toUpperCase() };
  if (filter?.query) {
    const q = filter.query.trim();
    where.OR = [
      { id: { contains: q } },
      { code: { contains: q } },
      { customerId: { contains: q } },
      { email: { contains: q } },
      { phone: { contains: q } },
      { shipFullName: { contains: q } },
      { locationName: { contains: q } },
      { paymentRef: { contains: q } },
      { paymentMethod: { contains: q } },
      { discountCodeSnapshot: { contains: q.toUpperCase() } },
      { giftCardCodeSnapshot: { contains: q.toUpperCase() } },
      { referralCodeSnapshot: { contains: q.toUpperCase() } }
    ];
  }
  return prisma.order.findMany({
    where,
    include: { items: true, location: { select: { name: true } } },
    orderBy: { placedAt: "desc" },
    take: filter?.take ?? 100
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

/**
 * Unico punto d'ingresso per i cambi di stato. Applica la macchina a stati,
 * i timestamp e gli effetti (ricarico stock della SEDE su annullo, pagamento).
 */
export async function transitionOrder(
  orderId: string,
  to: OrderStatus,
  actorEmail: string,
  opts?: { note?: string; paymentRef?: string; restock?: boolean; paymentStatus?: PaymentStatus }
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new DomainError("Ordine non trovato.");
    const from = order.status as OrderStatus;
    if (!ORDER_TRANSITIONS[from]?.includes(to)) {
      throw new DomainError(
        `Transizione non ammessa: ${ORDER_STATUS_LABELS[from]} → ${ORDER_STATUS_LABELS[to]}.`
      );
    }

    const now = new Date();
    const data: Prisma.OrderUpdateInput = { status: to };
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

    await tx.order.update({ where: { id: orderId }, data });

    const shouldRestock =
      to === "CANCELLED" && (opts?.restock ?? STOCK_HOLDING_STATUSES.includes(from));
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
  });

  await audit(actorEmail, "order.status", "Order", orderId, { to, note: opts?.note });
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
