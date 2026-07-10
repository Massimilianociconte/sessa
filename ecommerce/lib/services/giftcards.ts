import { randomBytes } from "node:crypto";
import type { GiftCard, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";

/**
 * Gift card a saldo con ledger (GiftCardTransaction). Il riscatto è atomico:
 * decremento condizionale (balance >= importo) dentro la transazione di checkout,
 * così non si può mai spendere più del saldo né usarla due volte in parallelo.
 */

/** Codice leggibile con 80 bit di entropia; i vecchi codici restano validi. */
export async function generateGiftCardCode(): Promise<string> {
  for (let i = 0; i < 6; i++) {
    const raw = randomBytes(10).toString("hex").toUpperCase();
    const code = `GIFT-${raw.match(/.{1,4}/g)!.join("-")}`;
    const clash = await prisma.giftCard.findUnique({ where: { code } });
    if (!clash) return code;
  }
  return `GIFT-${randomBytes(16).toString("hex").toUpperCase()}`;
}

export async function issueGiftCard(input: {
  amountCents: number;
  expiresAt?: Date | null;
  customerId?: string | null;
  code?: string;
}): Promise<GiftCard> {
  if (input.amountCents <= 0) throw new DomainError("Importo gift card non valido.");
  const code = input.code ?? (await generateGiftCardCode());
  return prisma.$transaction(async (tx) => {
    const card = await tx.giftCard.create({
      data: {
        code,
        initialCents: input.amountCents,
        balanceCents: input.amountCents,
        expiresAt: input.expiresAt ?? null,
        customerId: input.customerId ?? null
      }
    });
    await tx.giftCardTransaction.create({
      data: { giftCardId: card.id, delta: input.amountCents, reason: "ISSUE" }
    });
    return card;
  });
}

export async function loadGiftCard(code: string): Promise<GiftCard | null> {
  return prisma.giftCard.findUnique({ where: { code: code.trim().toUpperCase() } });
}

export type GiftCardCheck =
  | { ok: true; card: GiftCard }
  | { ok: false; reason: string };

/** Validità (attiva, non scaduta, saldo > 0, eventuale intestazione cliente). */
export function checkGiftCard(card: GiftCard | null, customerId?: string | null): GiftCardCheck {
  if (!card || !card.isActive) return { ok: false, reason: "Gift card non valida." };
  if (card.expiresAt && card.expiresAt < new Date()) return { ok: false, reason: "Gift card scaduta." };
  if (card.balanceCents <= 0) return { ok: false, reason: "Gift card esaurita." };
  if (card.customerId && card.customerId !== customerId) {
    return { ok: false, reason: "Gift card intestata a un altro cliente." };
  }
  return { ok: true, card };
}

/** Importo effettivamente utilizzabile su un totale dovuto. */
export function giftCardApplicable(card: GiftCard, amountDueCents: number): number {
  return Math.max(0, Math.min(card.balanceCents, amountDueCents));
}

/**
 * Riscatto atomico dentro una transazione: decremento condizionale + ledger.
 * Ritorna l'importo effettivamente scalato (0 se saldo insufficiente nel frattempo).
 */
export async function redeemGiftCardInTx(
  tx: Prisma.TransactionClient,
  giftCardId: string,
  amountCents: number,
  reference: string
): Promise<number> {
  if (amountCents <= 0) return 0;
  const updated = await tx.giftCard.updateMany({
    where: {
      id: giftCardId,
      isActive: true,
      balanceCents: { gte: amountCents },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
    },
    data: { balanceCents: { decrement: amountCents } }
  });
  if (updated.count === 0) return 0;
  await tx.giftCardTransaction.create({
    data: { giftCardId, delta: -amountCents, reason: "REDEEM", reference }
  });
  return amountCents;
}

export async function listGiftCards() {
  return prisma.giftCard.findMany({
    include: { customer: { select: { email: true } }, _count: { select: { transactions: true } } },
    orderBy: { createdAt: "desc" }
  });
}

export async function toggleGiftCard(id: string): Promise<void> {
  const card = await prisma.giftCard.findUnique({ where: { id } });
  if (!card) throw new DomainError("Gift card non trovata.");
  await prisma.giftCard.update({ where: { id }, data: { isActive: !card.isActive } });
}
