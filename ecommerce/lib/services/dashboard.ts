import { prisma } from "@/lib/db";
import { lowStockVariants } from "@/lib/services/inventory";

/** Stati che contano come ricavo (ordine non annullato/rimborsato). */
const REVENUE_STATUSES = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

export async function getDashboardData() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    ordersToday,
    revenueToday,
    revenueMonth,
    pendingCount,
    processingCount,
    recentOrders,
    lowStock,
    topItems
  ] = await Promise.all([
    prisma.order.count({ where: { placedAt: { gte: startOfDay } } }),
    prisma.order.aggregate({
      _sum: { totalCents: true },
      where: { placedAt: { gte: startOfDay }, status: { in: REVENUE_STATUSES } }
    }),
    prisma.order.aggregate({
      _sum: { totalCents: true },
      where: { placedAt: { gte: startOfMonth }, status: { in: REVENUE_STATUSES } }
    }),
    prisma.order.count({ where: { status: "PENDING_PAYMENT" } }),
    prisma.order.count({ where: { status: { in: ["PAID", "PROCESSING"] } } }),
    prisma.order.findMany({
      orderBy: { placedAt: "desc" },
      take: 8,
      include: { items: { select: { qty: true } } }
    }),
    lowStockVariants(),
    prisma.orderItem.groupBy({
      by: ["productName"],
      _sum: { qty: true, totalCents: true },
      where: { order: { placedAt: { gte: thirtyDaysAgo }, status: { in: REVENUE_STATUSES } } },
      orderBy: { _sum: { qty: "desc" } },
      take: 5
    })
  ]);

  return {
    ordersToday,
    revenueTodayCents: revenueToday._sum.totalCents ?? 0,
    revenueMonthCents: revenueMonth._sum.totalCents ?? 0,
    pendingCount,
    processingCount,
    recentOrders,
    lowStock,
    topItems
  };
}
