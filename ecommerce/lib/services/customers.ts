import { prisma } from "@/lib/db";

export async function listCustomers(query?: string) {
  const customers = await prisma.customer.findMany({
    where: query
      ? {
          OR: [
            { email: { contains: query } },
            { firstName: { contains: query } },
            { lastName: { contains: query } }
          ]
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 200
  });

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

  return customers.map((c) => ({
    ...c,
    orderCount: orderCountByCustomer.get(c.id) ?? 0,
    // Il valore cliente esclude ordini annullati/rimborsati
    lifetimeCents: lifetimeByCustomer.get(c.id) ?? 0
  }));
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
