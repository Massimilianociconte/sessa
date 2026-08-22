import { prisma } from "@/lib/db";
import { enqueueEmail } from "@/lib/services/email";
import { SITE_URL } from "@/lib/site";

export async function notifyAbandonedCarts(limit = 20): Promise<{ scanned: number; sent: number }> {
  const cutoff = new Date(Date.now() - 3 * 60 * 60_000);
  const carts = await prisma.cart.findMany({
    where: {
      status: "ACTIVE",
      customerId: { not: null },
      abandonedEmailAt: null,
      updatedAt: { lte: cutoff },
      items: { some: {} }
    },
    include: {
      customer: { select: { email: true, firstName: true } },
      location: { select: { name: true, slug: true } },
      items: { select: { id: true } }
    },
    take: Math.max(1, Math.min(limit, 40))
  });
  let sent = 0;
  for (const cart of carts) {
    if (!cart.customer?.email) continue;
    await enqueueEmail({
      toEmail: cart.customer.email,
      subject: "Hai lasciato qualcosa nel carrello Sessa",
      type: "ABANDONED_CART",
      reference: cart.id,
      body: `Ciao ${cart.customer.firstName},\n\nhai ancora ${cart.items.length} prodotti nel carrello della sede ${cart.location.name}.\nCompleta l'ordine quando vuoi: ${SITE_URL}/sede/${cart.location.slug}`
    });
    await prisma.cart.update({ where: { id: cart.id }, data: { abandonedEmailAt: new Date() } });
    sent += 1;
  }
  return { scanned: carts.length, sent };
}
