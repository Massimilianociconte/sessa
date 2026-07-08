import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { hashPassword } from "@/lib/auth/password";
import { enqueueEmail } from "@/lib/services/email";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 ora

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Codice referral leggibile e univoco (predispone la Fase 4). */
async function generateReferralCode(firstName: string): Promise<string> {
  const prefix = firstName.replace(/[^a-zA-Z]/g, "").slice(0, 6).toUpperCase() || "SESSA";
  for (let i = 0; i < 5; i++) {
    const code = `${prefix}-${randomBytes(3).toString("hex").toUpperCase()}`;
    const clash = await prisma.customer.findUnique({ where: { referralCode: code } });
    if (!clash) return code;
  }
  return `SESSA-${randomBytes(5).toString("hex").toUpperCase()}`;
}

/**
 * Registra un account. Se esiste già un cliente "ospite" (creato da un checkout
 * senza registrazione) con la stessa email, l'account viene "reclamato" e lo
 * storico ordini precedente resta collegato.
 */
export async function registerCustomer(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  marketingOptIn: boolean;
}): Promise<string> {
  const email = input.email.toLowerCase();
  const existing = await prisma.customer.findUnique({ where: { email } });
  if (existing?.passwordHash) {
    throw new DomainError("Esiste già un account con questa email.", "EMAIL_TAKEN");
  }
  const passwordHash = hashPassword(input.password);
  const referralCode = existing?.referralCode ?? (await generateReferralCode(input.firstName));

  if (existing) {
    await prisma.customer.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone ?? existing.phone,
        marketingOptIn: input.marketingOptIn,
        referralCode
      }
    });
    return existing.id;
  }
  try {
    const created = await prisma.customer.create({
      data: {
        email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        marketingOptIn: input.marketingOptIn,
        referralCode
      }
    });
    return created.id;
  } catch (error) {
    // Doppio submit simultaneo: il vincolo unique sull'email vince la race.
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") {
      throw new DomainError("Esiste già un account con questa email.", "EMAIL_TAKEN");
    }
    throw error;
  }
}

export async function getAccountOverview(customerId: string) {
  const [
    customer,
    orderCount,
    lastOrders,
    defaultAddress,
    addressCount,
    spent,
    activeGiftCards,
    availableDiscounts
  ] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        marketingOptIn: true,
        emailVerified: true,
        referralCode: true,
        createdAt: true
      }
    }),
    prisma.order.count({ where: { customerId } }),
    prisma.order.findMany({
      where: { customerId },
      orderBy: { placedAt: "desc" },
      take: 3,
      include: {
        items: { select: { qty: true, productName: true, variantName: true } },
        location: { select: { name: true, slug: true, city: true } }
      }
    }),
    prisma.address.findFirst({
      where: { customerId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }]
    }),
    prisma.address.count({ where: { customerId } }),
    prisma.order.aggregate({
      where: { customerId, paymentStatus: { in: ["PAID", "AUTHORIZED"] } },
      _sum: { totalCents: true }
    }),
    prisma.giftCard.findMany({
      where: {
        customerId,
        isActive: true,
        balanceCents: { gt: 0 },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
      },
      orderBy: { createdAt: "desc" },
      take: 3
    }),
    prisma.discountCode.findMany({
      where: {
        customerId,
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] }]
      },
      include: {
        redemptions: { where: { customerId }, select: { id: true } }
      },
      orderBy: [{ endsAt: "asc" }, { createdAt: "desc" }],
      take: 3
    })
  ]);
  const totalGiftCardCents = activeGiftCards.reduce((sum, card) => sum + card.balanceCents, 0);
  return {
    customer,
    orderCount,
    lastOrders,
    latestOrder: lastOrders[0] ?? null,
    defaultAddress,
    addressCount,
    totalSpentCents: spent._sum.totalCents ?? 0,
    activeGiftCards,
    totalGiftCardCents,
    availableDiscounts
  };
}

export async function listCustomerOrders(customerId: string) {
  return prisma.order.findMany({
    where: { customerId },
    orderBy: { placedAt: "desc" },
    include: { items: true, location: { select: { name: true, slug: true, city: true } } }
  });
}

export async function getCustomerOrderByCode(customerId: string, code: string) {
  const order = await prisma.order.findUnique({
    where: { code },
    include: { items: true, location: true, events: { orderBy: { createdAt: "desc" } } }
  });
  if (!order || order.customerId !== customerId) return null;
  return order;
}

export async function listAddresses(customerId: string) {
  return prisma.address.findMany({
    where: { customerId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }]
  });
}

export async function listCustomerGiftCards(customerId: string) {
  return prisma.giftCard.findMany({
    where: { customerId },
    include: {
      transactions: {
        orderBy: { createdAt: "desc" },
        take: 6
      }
    },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }]
  });
}

export async function listCustomerDiscountCodes(customerId: string) {
  return prisma.discountCode.findMany({
    where: { customerId },
    include: {
      locations: { include: { location: { select: { name: true, city: true } } } },
      categories: { include: { category: { select: { name: true } } } },
      products: { include: { product: { select: { name: true } } } },
      redemptions: {
        where: { customerId },
        orderBy: { createdAt: "desc" },
        select: { id: true, amountCents: true, createdAt: true, order: { select: { code: true } } }
      }
    },
    orderBy: [{ isActive: "desc" }, { endsAt: "asc" }, { createdAt: "desc" }]
  });
}

export async function getCustomerPreferenceSnapshot(customerId: string) {
  const [customer, defaultAddress, latestOrder, locations] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        marketingOptIn: true,
        emailVerified: true,
        preferredLocationId: true,
        preferredFulfillment: true,
        birthday: true,
        preferredLocation: { select: { id: true, name: true, slug: true, city: true, isActive: true } }
      }
    }),
    prisma.address.findFirst({
      where: { customerId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }]
    }),
    prisma.order.findFirst({
      where: { customerId },
      orderBy: { placedAt: "desc" },
      include: { location: { select: { name: true, slug: true, city: true } } }
    }),
    prisma.location.findMany({
      where: { isActive: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, city: true, pickupEnabled: true, deliveryEnabled: true }
    })
  ]);

  // Risoluzione preferenza: quella salvata dal cliente vince; l'ultimo ordine è il fallback.
  const savedLocation = customer?.preferredLocation?.isActive ? customer.preferredLocation : null;
  const effectiveLocation = savedLocation ?? latestOrder?.location ?? null;
  const effectiveFulfillment = customer?.preferredFulfillment ?? latestOrder?.fulfillmentType ?? null;

  return {
    customer,
    defaultAddress,
    latestOrder,
    savedLocation,
    inferredLocation: latestOrder?.location ?? null,
    inferredFulfillmentType: latestOrder?.fulfillmentType ?? null,
    effectiveLocation,
    effectiveFulfillment,
    locations
  };
}

/** Preferenza effettiva per il checkout (salvata, altrimenti dedotta dall'ultimo ordine). */
export async function getEffectiveFulfillmentPreference(customerId: string): Promise<string | null> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { preferredFulfillment: true }
  });
  if (customer?.preferredFulfillment) return customer.preferredFulfillment;
  const lastOrder = await prisma.order.findFirst({
    where: { customerId },
    orderBy: { placedAt: "desc" },
    select: { fulfillmentType: true }
  });
  return lastOrder?.fulfillmentType ?? null;
}

export async function createAddress(
  customerId: string,
  data: {
    label?: string;
    fullName: string;
    line1: string;
    line2?: string;
    city: string;
    province: string;
    postalCode: string;
    phone?: string;
    isDefault: boolean;
  }
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const count = await tx.address.count({ where: { customerId } });
    const makeDefault = data.isDefault || count === 0;
    if (makeDefault) {
      await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
    }
    await tx.address.create({ data: { ...data, customerId, isDefault: makeDefault } });
  });
}

export async function updateAddress(
  customerId: string,
  addressId: string,
  data: {
    label?: string;
    fullName: string;
    line1: string;
    line2?: string;
    city: string;
    province: string;
    postalCode: string;
    phone?: string;
    isDefault: boolean;
  }
): Promise<void> {
  const owned = await prisma.address.findFirst({ where: { id: addressId, customerId } });
  if (!owned) throw new DomainError("Indirizzo non trovato.");
  await prisma.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
    }
    await tx.address.update({ where: { id: addressId }, data });
  });
}

export async function deleteAddress(customerId: string, addressId: string): Promise<void> {
  await prisma.address.deleteMany({ where: { id: addressId, customerId } });
}

export async function setDefaultAddress(customerId: string, addressId: string): Promise<void> {
  const owned = await prisma.address.findFirst({ where: { id: addressId, customerId } });
  if (!owned) return;
  await prisma.$transaction(async (tx) => {
    await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } });
    await tx.address.update({ where: { id: addressId }, data: { isDefault: true } });
  });
}

/** Crea un token di reset per l'email; ritorna il token in chiaro se il cliente esiste. */
export async function createResetToken(email: string): Promise<string | null> {
  const customer = await prisma.customer.findUnique({ where: { email: email.toLowerCase() } });
  if (!customer) return null;
  const token = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      tokenHash: hashToken(token),
      customerId: customer.id,
      expiresAt: new Date(Date.now() + RESET_TTL_MS)
    }
  });
  return token;
}

export async function consumeResetToken(token: string, newPassword: string): Promise<void> {
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { customer: { select: { email: true, firstName: true } } }
  });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    throw new DomainError("Link di reimpostazione non valido o scaduto.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: row.customerId },
      data: { passwordHash: hashPassword(newPassword) }
    });
    await tx.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    // Invalida eventuali sessioni attive dopo il reset.
    await tx.customerSession.deleteMany({ where: { customerId: row.customerId } });
  });
  await enqueueEmail({
    toEmail: row.customer.email,
    subject: "Password account Sessa 1930 reimpostata",
    type: "SECURITY_PASSWORD_CHANGED",
    body: `Ciao ${row.customer.firstName},\n\nla password del tuo account Sessa 1930 è stata reimpostata. Tutte le sessioni precedenti sono state chiuse.\n\nSe non sei stato tu, contatta subito Sessa.`
  });
}
