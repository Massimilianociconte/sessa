import { prisma } from "@/lib/db";
import { signLink, verifyLink } from "@/lib/security/signed-links";
import { SITE_URL } from "@/lib/site";

export function unsubscribeUrl(customerId: string): string {
  return `${SITE_URL}/account/disiscrizione?c=${encodeURIComponent(customerId)}&s=${signLink("unsubscribe", customerId)}`;
}

export function oneClickUnsubscribeUrl(customerId: string): string {
  return `${SITE_URL}/api/disiscrizione?c=${encodeURIComponent(customerId)}&s=${signLink("unsubscribe", customerId)}`;
}

/** Revoca del consenso marketing da link firmato (senza login). */
export async function unsubscribeFromLink(customerId: string, signatureValue: string): Promise<boolean> {
  if (!customerId || !signatureValue || !verifyLink("unsubscribe", customerId, signatureValue)) return false;
  await prisma.customer.updateMany({
    where: { id: customerId },
    data: {
      marketingOptIn: false,
      marketingConsentAt: new Date(),
      marketingConsentSource: "unsubscribe-link",
      marketingConsentVersion: null
    }
  });
  return true;
}
