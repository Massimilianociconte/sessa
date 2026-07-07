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
    include: {
      orders: { select: { totalCents: true, status: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 200
  });
  return customers.map((c) => ({
    ...c,
    orderCount: c.orders.length,
    // Il valore cliente esclude ordini annullati/rimborsati
    lifetimeCents: c.orders
      .filter((o) => o.status !== "CANCELLED" && o.status !== "REFUNDED")
      .reduce((sum, o) => sum + o.totalCents, 0)
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
