import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { lowStockVariants } from "@/lib/services/inventory";

/** Stati che contano come ricavo (ordine non annullato/rimborsato). */
const REVENUE_STATUSES = ["PAID", "PROCESSING", "READY", "SHIPPED", "DELIVERED"];

/** Stati operativi: ordini pagati che il laboratorio deve ancora preparare/consegnare. */
const QUEUE_STATUSES = ["PAID", "PROCESSING", "READY"];

export const DASHBOARD_RANGES = ["today", "7d", "30d", "month"] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export const DASHBOARD_RANGE_LABELS: Record<DashboardRange, string> = {
  today: "Oggi",
  "7d": "Ultimi 7 giorni",
  "30d": "Ultimi 30 giorni",
  month: "Mese corrente"
};

function rangeBounds(range: DashboardRange): { from: Date; prevFrom: Date; prevTo: Date } {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (range) {
    case "today":
      return {
        from: startOfDay,
        prevFrom: new Date(startOfDay.getTime() - 24 * 60 * 60 * 1000),
        prevTo: startOfDay
      };
    case "7d": {
      const from = new Date(startOfDay.getTime() - 6 * 24 * 60 * 60 * 1000);
      return { from, prevFrom: new Date(from.getTime() - 7 * 24 * 60 * 60 * 1000), prevTo: from };
    }
    case "30d": {
      const from = new Date(startOfDay.getTime() - 29 * 24 * 60 * 60 * 1000);
      return { from, prevFrom: new Date(from.getTime() - 30 * 24 * 60 * 60 * 1000), prevTo: from };
    }
    case "month": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, prevFrom: new Date(now.getFullYear(), now.getMonth() - 1, 1), prevTo: from };
    }
  }
}

export type DashboardFilter = {
  locationId?: string;
  range?: DashboardRange;
};

export async function getDashboardData(filter?: DashboardFilter) {
  const range: DashboardRange = filter?.range ?? "today";
  const locationId = filter?.locationId;
  const { from, prevFrom, prevTo } = rangeBounds(range);
  const scope: Prisma.OrderWhereInput = locationId ? { locationId } : {};

  const [
    ordersInRange,
    revenueInRange,
    prevOrders,
    prevRevenue,
    pendingCount,
    processingCount,
    readyCount,
    fulfillmentQueue,
    recentOrders,
    lowStock,
    topItems,
    byLocation,
    locations
  ] = await Promise.all([
    prisma.order.count({ where: { ...scope, placedAt: { gte: from } } }),
    prisma.order.aggregate({
      _sum: { totalCents: true },
      where: { ...scope, placedAt: { gte: from }, status: { in: REVENUE_STATUSES } }
    }),
    prisma.order.count({ where: { ...scope, placedAt: { gte: prevFrom, lt: prevTo } } }),
    prisma.order.aggregate({
      _sum: { totalCents: true },
      where: { ...scope, placedAt: { gte: prevFrom, lt: prevTo }, status: { in: REVENUE_STATUSES } }
    }),
    prisma.order.count({ where: { ...scope, status: "PENDING_PAYMENT" } }),
    prisma.order.count({ where: { ...scope, status: { in: ["PAID", "PROCESSING"] } } }),
    prisma.order.count({ where: { ...scope, status: "READY" } }),
    // Coda operativa: cosa preparare, ordinata per data di ritiro/consegna richiesta.
    prisma.order.findMany({
      where: { ...scope, status: { in: QUEUE_STATUSES } },
      orderBy: [{ fulfillmentAt: "asc" }, { placedAt: "asc" }],
      take: 10,
      include: {
        items: { select: { qty: true, productName: true, variantName: true } },
        location: { select: { name: true } }
      }
    }),
    prisma.order.findMany({
      where: scope,
      orderBy: { placedAt: "desc" },
      take: 8,
      include: { items: { select: { qty: true } }, location: { select: { name: true } } }
    }),
    lowStockVariants(locationId),
    prisma.orderItem.groupBy({
      by: ["productName"],
      _sum: { qty: true, totalCents: true },
      where: {
        order: { ...scope, placedAt: { gte: from }, status: { in: REVENUE_STATUSES } }
      },
      orderBy: { _sum: { qty: "desc" } },
      take: 5
    }),
    // Confronto sedi sul periodo (sempre globale: serve a orientare il colpo d'occhio).
    prisma.order.groupBy({
      by: ["locationId", "locationName"],
      _count: { _all: true },
      _sum: { totalCents: true },
      where: { placedAt: { gte: from }, status: { in: REVENUE_STATUSES } },
      orderBy: { _sum: { totalCents: "desc" } }
    }),
    prisma.location.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true, isActive: true } })
  ]);

  const revenueCents = revenueInRange._sum.totalCents ?? 0;
  const prevRevenueCents = prevRevenue._sum.totalCents ?? 0;

  return {
    range,
    locationId: locationId ?? null,
    ordersInRange,
    revenueCents,
    avgOrderCents: ordersInRange > 0 ? Math.round(revenueCents / ordersInRange) : 0,
    prevOrders,
    prevRevenueCents,
    pendingCount,
    processingCount,
    readyCount,
    fulfillmentQueue,
    recentOrders,
    lowStock,
    topItems,
    byLocation: byLocation.map((row) => ({
      locationId: row.locationId,
      locationName: row.locationName ?? locations.find((l) => l.id === row.locationId)?.name ?? "—",
      orders: row._count._all,
      revenueCents: row._sum.totalCents ?? 0
    })),
    locations
  };
}
