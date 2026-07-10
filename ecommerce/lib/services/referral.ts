import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/services/settings";
import { enqueueEmail } from "@/lib/services/email";
import { SITE_URL } from "@/lib/site";

export const REFERRAL_COOKIE = "sessa_ref";

export type ReferralConfig = {
  friendType: "PERCENT" | "FIXED";
  friendValue: number; // bps o centesimi
  referrerType: "PERCENT" | "FIXED";
  referrerValue: number;
  minSubtotalCents: number;
};

const DEFAULT_CONFIG: ReferralConfig = {
  friendType: "PERCENT",
  friendValue: 1000, // 10% all'amico
  referrerType: "FIXED",
  referrerValue: 500, // 5€ a chi invita
  minSubtotalCents: 2000
};

export async function getReferralConfig(): Promise<ReferralConfig> {
  const s = await getSettings([
    "referral.friendType",
    "referral.friendValue",
    "referral.referrerType",
    "referral.referrerValue",
    "referral.minSubtotalCents"
  ]);
  return {
    friendType: (s["referral.friendType"] as "PERCENT" | "FIXED") ?? DEFAULT_CONFIG.friendType,
    friendValue: (s["referral.friendValue"] as number) ?? DEFAULT_CONFIG.friendValue,
    referrerType: (s["referral.referrerType"] as "PERCENT" | "FIXED") ?? DEFAULT_CONFIG.referrerType,
    referrerValue: (s["referral.referrerValue"] as number) ?? DEFAULT_CONFIG.referrerValue,
    minSubtotalCents: (s["referral.minSubtotalCents"] as number) ?? DEFAULT_CONFIG.minSubtotalCents
  };
}

export function referralLink(referralCode: string): string {
  return `${SITE_URL}/r/${referralCode}`;
}

/** Codice sconto univoco riservato a un cliente. */
async function issueReservedDiscountInTx(tx: Prisma.TransactionClient, input: {
  prefix: string;
  customerId: string;
  type: "PERCENT" | "FIXED";
  value: number;
  minSubtotalCents: number;
  firstOrderOnly: boolean;
  description: string;
}): Promise<string> {
  let code = "";
  for (let i = 0; i < 6; i++) {
    const candidate = `${input.prefix}-${randomBytes(3).toString("hex").toUpperCase()}`;
    if (!(await tx.discountCode.findUnique({ where: { code: candidate } }))) {
      code = candidate;
      break;
    }
  }
  if (!code) code = `${input.prefix}-${randomBytes(5).toString("hex").toUpperCase()}`;
  await tx.discountCode.create({
    data: {
      code,
      description: input.description,
      type: input.type,
      value: input.value,
      scope: "ALL",
      customerId: input.customerId,
      minSubtotalCents: input.minSubtotalCents,
      firstOrderOnly: input.firstOrderOnly,
      perUserLimit: 1,
      maxUses: 1
    }
  });
  return code;
}

/**
 * Collega il referral alla registrazione di un nuovo cliente.
 * Anti-abuso: nessun auto-invito (email/id diversi), un solo referral per invitato
 * (invitedCustomerId @unique), un referrer valido esistente.
 * Emette lo sconto di benvenuto per l'amico.
 */
export async function linkReferralOnSignup(
  newCustomerId: string,
  newEmail: string,
  referralCode: string
): Promise<void> {
  const referrer = await prisma.customer.findUnique({ where: { referralCode } });
  if (!referrer) return;
  if (referrer.id === newCustomerId) return; // auto-invito
  if (referrer.email.toLowerCase() === newEmail.toLowerCase()) return; // stessa persona

  const config = await getReferralConfig();

  try {
    const friendCode = await prisma.$transaction(async (tx) => {
      // Un cliente può essere invitato una sola volta.
      const already = await tx.referral.findUnique({ where: { invitedCustomerId: newCustomerId } });
      if (already) return null;

      const code = await issueReservedDiscountInTx(tx, {
        prefix: "BENV",
        customerId: newCustomerId,
        type: config.friendType,
        value: config.friendValue,
        minSubtotalCents: config.minSubtotalCents,
        firstOrderOnly: true,
        description: `Benvenuto: invitato da ${referrer.firstName}`
      });

      await tx.referral.create({
        data: {
          code: `REF-${randomBytes(5).toString("hex").toUpperCase()}`,
          referrerId: referrer.id,
          invitedCustomerId: newCustomerId,
          status: "SIGNED_UP"
        }
      });

      return code;
    });
    if (!friendCode) return;

    await enqueueEmail({
      toEmail: newEmail,
      subject: "Benvenuto in Sessa 1930 — hai uno sconto",
      body: `Ti diamo il benvenuto! Usa il codice ${friendCode} al tuo primo ordine.`,
      type: "REFERRAL_WELCOME"
    });
  } catch {
    // Corsa: referral già creato altrove o codice sconto collisione; la transazione rollbacka tutto.
    return;
  }
}

/**
 * Alla PRIMA conversione (ordine) dell'invitato: segna il referral REDEEMED e
 * premia chi ha invitato con un codice riservato. Idempotente: l'update
 * condizionale su status="SIGNED_UP" garantisce ricompensa una sola volta.
 */
export async function maybeConvertReferral(invitedCustomerId: string, orderId: string): Promise<void> {
  const config = await getReferralConfig();
  const reward = await prisma.$transaction(async (tx) => {
    const paidOrder = await tx.order.findFirst({
      where: { id: orderId, customerId: invitedCustomerId, status: "PAID", paymentStatus: "PAID" },
      select: { id: true }
    });
    if (!paidOrder) return null;
    const referral = await tx.referral.findUnique({
      where: { invitedCustomerId },
      include: { referrer: true }
    });
    if (!referral || referral.status !== "SIGNED_UP") return null;

    const converted = await tx.referral.updateMany({
      where: { id: referral.id, status: "SIGNED_UP" },
      data: { status: "REDEEMED", redeemedOrderId: orderId, redeemedAt: new Date() }
    });
    if (converted.count === 0) return null; // già convertito da una richiesta concorrente

    const rewardCode = await issueReservedDiscountInTx(tx, {
      prefix: "GRAZIE",
      customerId: referral.referrerId,
      type: config.referrerType,
      value: config.referrerValue,
      minSubtotalCents: config.minSubtotalCents,
      firstOrderOnly: false,
      description: "Ricompensa referral: un amico ha ordinato"
    });

    await tx.order.update({
      where: { id: orderId },
      data: { referralCodeSnapshot: referral.code }
    });

    return { toEmail: referral.referrer.email, rewardCode };
  });
  if (!reward) return;

  await enqueueEmail({
    toEmail: reward.toEmail,
    subject: "Un amico ha ordinato — ecco il tuo premio",
    body: `Grazie per aver invitato un amico! Usa il codice ${reward.rewardCode} sul tuo prossimo ordine.`,
    type: "REFERRAL_REWARD"
  });
}

export async function getReferralStats(customerId: string) {
  const referrals = await prisma.referral.findMany({
    where: { referrerId: customerId },
    include: { invitedCustomer: { select: { firstName: true, createdAt: true } } },
    orderBy: { createdAt: "desc" }
  });
  return {
    total: referrals.length,
    redeemed: referrals.filter((r) => r.status === "REDEEMED").length,
    referrals
  };
}
