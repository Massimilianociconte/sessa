"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/domain";
import { parseEuroToCents } from "@/lib/money";
import { issueGiftCard, toggleGiftCard } from "@/lib/services/giftcards";
import { backWithError, backWithMessage, requireString } from "./helpers";

const PATH = "/admin/gift-card";

export async function createGiftCardAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const amountRaw = requireString(formData, "amount");
  const expiresRaw = String(formData.get("expiresAt") ?? "").trim();
  const emailRaw = String(formData.get("customerEmail") ?? "").trim().toLowerCase();

  let amountCents: number;
  try {
    amountCents = parseEuroToCents(amountRaw);
  } catch {
    backWithError(PATH, "Importo non valido: usa il formato 25,00");
  }

  let customerId: string | null = null;
  if (emailRaw) {
    const customer = await prisma.customer.findUnique({ where: { email: emailRaw } });
    if (!customer) backWithError(PATH, `Nessun cliente con email ${emailRaw}.`);
    customerId = customer.id;
  }

  try {
    const card = await issueGiftCard({
      amountCents,
      expiresAt: expiresRaw ? new Date(expiresRaw) : null,
      customerId
    });
    await audit(user.email, "giftcard.create", "GiftCard", card.id, { amountCents, customerId });
    backWithMessage(PATH, `Gift card ${card.code} emessa (${amountRaw} €).`);
  } catch (error) {
    if (error instanceof DomainError) backWithError(PATH, error.message);
    throw error;
  }
}

export async function toggleGiftCardAction(formData: FormData): Promise<void> {
  const user = await requireAdmin();
  const id = requireString(formData, "id");
  await toggleGiftCard(id);
  await audit(user.email, "giftcard.toggle", "GiftCard", id);
  revalidatePath(PATH);
  backWithMessage(PATH, "Gift card aggiornata.");
}
