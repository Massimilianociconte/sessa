import { prisma } from "@/lib/db";
import { enqueueEmail } from "@/lib/services/email";
import { oneClickUnsubscribeUrl } from "@/lib/services/marketing-consent";
import { SITE_URL } from "@/lib/site";

/**
 * Promemoria carrello: comunicazione promozionale, quindi SOLO a clienti con
 * consenso marketing attivo (GDPR/art. 130 Codice privacy) e sempre con link
 * di disiscrizione one-click.
 */
export async function notifyAbandonedCarts(limit = 20): Promise<{ scanned: number; sent: number }> {
  const cutoff = new Date(Date.now() - 3 * 60 * 60_000);
  const carts = await prisma.cart.findMany({
    where: {
      status: "ACTIVE",
      customerId: { not: null },
      customer: { marketingOptIn: true, anonymizedAt: null },
      abandonedEmailAt: null,
      updatedAt: { lte: cutoff },
      items: { some: {} }
    },
    include: {
      customer: { select: { id: true, email: true, firstName: true } },
      location: { select: { name: true, slug: true } },
      items: { select: { id: true } }
    },
    take: Math.max(1, Math.min(limit, 40))
  });
  let sent = 0;
  for (const cart of carts) {
    if (!cart.customer?.email) continue;
    const claimed = await prisma.cart.updateMany({
      where: { id: cart.id, abandonedEmailAt: null },
      data: { abandonedEmailAt: new Date() }
    });
    if (claimed.count === 0) continue;
    await enqueueEmail({
      toEmail: cart.customer.email,
      subject: "Hai lasciato qualcosa nel carrello Sessa",
      type: "ABANDONED_CART",
      reference: cart.id,
      body: `Ciao ${cart.customer.firstName},\n\nhai ancora ${cart.items.length} prodotti nel carrello della sede ${cart.location.name}. Completa l'ordine quando vuoi.`,
      cta: { url: `${SITE_URL}/carrello`, label: "Torna al carrello" },
      unsubscribeUrl: oneClickUnsubscribeUrl(cart.customer.id)
    }).catch(() => undefined);
    sent += 1;
  }
  return { scanned: carts.length, sent };
}
