import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { enqueueEmail } from "@/lib/services/email";

/**
 * Export completo dei dati personali (GDPR art. 20 — portabilità).
 * Ritorna un oggetto serializzabile in JSON scaricabile dal cliente.
 */
export async function exportCustomerData(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      addresses: true,
      orders: {
        orderBy: { placedAt: "desc" },
        include: { items: true, events: { orderBy: { createdAt: "asc" } } }
      },
      giftCards: { include: { transactions: { orderBy: { createdAt: "asc" } } } },
      redemptions: { include: { order: { select: { code: true } }, discount: { select: { code: true } } } },
      referralsMade: true,
      referralUsed: true,
      sessions: { select: { createdAt: true, lastSeenAt: true, expiresAt: true, ipAddress: true, userAgent: true } },
      preferredLocation: { select: { name: true, city: true } }
    }
  });
  if (!customer || customer.anonymizedAt) throw new DomainError("Account non valido.");

  return {
    exportedAt: new Date().toISOString(),
    profile: {
      email: customer.email,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      marketingOptIn: customer.marketingOptIn,
      emailVerified: customer.emailVerified,
      referralCode: customer.referralCode,
      preferredLocation: customer.preferredLocation,
      preferredFulfillment: customer.preferredFulfillment,
      birthday: customer.birthday,
      createdAt: customer.createdAt
    },
    addresses: customer.addresses.map((a) => ({
      label: a.label,
      fullName: a.fullName,
      line1: a.line1,
      line2: a.line2,
      city: a.city,
      province: a.province,
      postalCode: a.postalCode,
      phone: a.phone,
      isDefault: a.isDefault
    })),
    orders: customer.orders.map((o) => ({
      code: o.code,
      placedAt: o.placedAt,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      fulfillmentType: o.fulfillmentType,
      fulfillmentAt: o.fulfillmentAt,
      location: o.locationName,
      totals: {
        subtotalCents: o.subtotalCents,
        discountCents: o.discountCents,
        giftCardCents: o.giftCardCents,
        shippingCents: o.shippingCents,
        taxCents: o.taxCents,
        totalCents: o.totalCents
      },
      items: o.items.map((i) => ({
        product: i.productName,
        variant: i.variantName,
        qty: i.qty,
        unitCents: i.unitCents,
        totalCents: i.totalCents
      })),
      history: o.events.map((e) => ({ at: e.createdAt, type: e.type, message: e.message }))
    })),
    giftCards: customer.giftCards.map((g) => ({
      code: g.code,
      balanceCents: g.balanceCents,
      isActive: g.isActive,
      expiresAt: g.expiresAt,
      transactions: g.transactions.map((t) => ({ at: t.createdAt, delta: t.delta, reason: t.reason }))
    })),
    discountRedemptions: customer.redemptions.map((r) => ({
      code: r.discount?.code,
      order: r.order?.code,
      amountCents: r.amountCents,
      at: r.createdAt
    })),
    referrals: {
      made: customer.referralsMade.map((r) => ({ status: r.status, createdAt: r.createdAt })),
      used: customer.referralUsed ? { status: customer.referralUsed.status, createdAt: customer.referralUsed.createdAt } : null
    },
    sessions: customer.sessions
  };
}

/**
 * Eliminazione account (GDPR art. 17). I dati personali vengono anonimizzati;
 * gli ordini restano come snapshot per obblighi fiscali/contabili, ma scollegati
 * da ogni identità riutilizzabile. Le gift card restano spendibili tramite codice.
 */
export async function deleteCustomerAccount(customerId: string): Promise<void> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer || customer.anonymizedAt) throw new DomainError("Account non valido.");
  const originalEmail = customer.email;
  const firstName = customer.firstName;

  await prisma.$transaction([
    prisma.address.deleteMany({ where: { customerId } }),
    prisma.customerSession.deleteMany({ where: { customerId } }),
    prisma.passwordResetToken.deleteMany({ where: { customerId } }),
    prisma.customerToken.deleteMany({ where: { customerId } }),
    prisma.customerBackupCode.deleteMany({ where: { customerId } }),
    prisma.customer.update({
      where: { id: customerId },
      data: {
        email: `eliminato-${customerId}@anonimo.sessa1930.invalid`,
        firstName: "Account",
        lastName: "Eliminato",
        phone: null,
        notes: null,
        marketingOptIn: false,
        passwordHash: null,
        emailVerified: false,
        referralCode: null,
        preferredLocationId: null,
        preferredFulfillment: null,
        birthday: null,
        totpSecret: null,
        totpEnabledAt: null,
        totpLastStep: null,
        anonymizedAt: new Date()
      }
    })
  ]);

  await enqueueEmail({
    toEmail: originalEmail,
    subject: "Il tuo account Sessa 1930 è stato eliminato",
    type: "ACCOUNT_DELETED",
    body: `Ciao ${firstName},\n\ncome richiesto, il tuo account Sessa 1930 è stato eliminato e i dati personali anonimizzati. Gli ordini restano conservati in forma anonima per gli obblighi di legge.\n\nGrazie per essere stato con noi.`
  });
}
