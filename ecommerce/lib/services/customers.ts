import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export async function listCustomers(query?: string, page = 1, pageSize = 50) {
  const normalizedQuery = query?.trim().slice(0, 100);
  const safePage = Math.max(1, Math.floor(page));
  const safePageSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
  const where: Prisma.CustomerWhereInput | undefined = normalizedQuery
    ? {
          OR: [
            { email: { contains: normalizedQuery, mode: "insensitive" } },
            { firstName: { contains: normalizedQuery, mode: "insensitive" } },
            { lastName: { contains: normalizedQuery, mode: "insensitive" } }
          ]
        }
    : undefined;
  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (safePage - 1) * safePageSize,
      take: safePageSize
    }),
    prisma.customer.count({ where })
  ]);

  const customerIds = customers.map((customer) => customer.id);
  const [orderCounts, lifetimeTotals] = customerIds.length
    ? await Promise.all([
        prisma.order.groupBy({
          by: ["customerId"],
          where: { customerId: { in: customerIds } },
          _count: { _all: true }
        }),
        prisma.order.groupBy({
          by: ["customerId"],
          where: {
            customerId: { in: customerIds },
            status: { notIn: ["CANCELLED", "REFUNDED"] }
          },
          _sum: { totalCents: true }
        })
      ])
    : [[], []];

  const orderCountByCustomer = new Map(
    orderCounts
      .filter((row) => row.customerId)
      .map((row) => [row.customerId!, row._count._all])
  );
  const lifetimeByCustomer = new Map(
    lifetimeTotals
      .filter((row) => row.customerId)
      .map((row) => [row.customerId!, row._sum.totalCents ?? 0])
  );

  return {
    items: customers.map((c) => ({
      ...c,
      orderCount: orderCountByCustomer.get(c.id) ?? 0,
      // Il valore cliente esclude ordini annullati/rimborsati
      lifetimeCents: lifetimeByCustomer.get(c.id) ?? 0
    })),
    total,
    page: safePage,
    pageCount: Math.max(1, Math.ceil(total / safePageSize))
  };
}

export async function getCustomer(id: string) {
  return prisma.customer.findUnique({
    where: { id },
    include: {
      orders: { orderBy: { placedAt: "desc" }, include: { items: true } },
      addresses: { orderBy: { createdAt: "desc" } }
    }
  });
}
