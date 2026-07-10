"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdminCapability } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { DomainError } from "@/lib/domain";
import { parseEuroToCents } from "@/lib/money";
import { issueGiftCard, toggleGiftCard } from "@/lib/services/giftcards";
import { backWithError, backWithMessage, requireString } from "./helpers";
import { romeDayRange } from "@/lib/datetime";

const PATH = "/admin/gift-card";

export async function createGiftCardAction(formData: FormData): Promise<void> {
  const user = await requireAdminCapability("promotions:manage");
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

  const expiryRange = expiresRaw ? romeDayRange(expiresRaw) : null;
  if (expiresRaw && !expiryRange) backWithError(PATH, "Data di scadenza non valida.");

  try {
    const card = await issueGiftCard({
      amountCents,
      // Inclusiva nel gestionale: la card resta valida per tutto il giorno selezionato a Roma.
      expiresAt: expiryRange?.end ?? null,
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
  const user = await requireAdminCapability("promotions:manage");
  const id = requireString(formData, "id");
  await toggleGiftCard(id);
  await audit(user.email, "giftcard.toggle", "GiftCard", id);
  revalidatePath(PATH);
  backWithMessage(PATH, "Gift card aggiornata.");
}
