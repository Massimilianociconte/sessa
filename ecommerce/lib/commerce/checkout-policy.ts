import { addBusinessDays, businessDaysBetween } from "@/lib/commerce/scheduling";

/**
 * Regole commerciali del checkout, pure e testabili. Obiettivo: nessun metodo
 * di pagamento deve permettere di bloccare lo stock senza un impegno reale
 * (ordini fittizi) e nessuna merce fresca esce senza incasso.
 */
export type CheckoutPolicySettings = {
  /** Importo massimo pagabile in sede al ritiro. */
  cashMaxCents: number;
  /** Anticipo massimo (giorni) per un ordine da pagare al ritiro. */
  cashMaxAdvanceDays: number;
  /** Giorni lavorativi minimi tra ordine e ritiro/consegna per il bonifico. */
  bankTransferMinBusinessDays: number;
  /** Giorni lavorativi entro cui il bonifico deve risultare accreditato. */
  bankTransferReservationBusinessDays: number;
  /** Tentativi di pagamento online massimi per ordine (ogni tentativo prolunga la riserva). */
  maxCardAttempts: number;
};

export const DEFAULT_CHECKOUT_POLICY: CheckoutPolicySettings = {
  cashMaxCents: 15_000,
  cashMaxAdvanceDays: 7,
  bankTransferMinBusinessDays: 3,
  bankTransferReservationBusinessDays: 2,
  maxCardAttempts: 5
};

export type PaymentRuleInput = {
  method: "bank_transfer" | "cash_on_pickup" | "card";
  fulfillmentType: "PICKUP" | "DELIVERY";
  amountDueCents: number;
  /** Inizio fascia di ritiro/consegna; null per spedizione nazionale senza fascia. */
  slotStart: Date | null;
  hasPhone: boolean;
  stripeEnabled: boolean;
  now: Date;
  settings: CheckoutPolicySettings;
};

export type PaymentRuleResult = { ok: true } | { ok: false; reason: string; field?: string };

export function checkPaymentMethod(input: PaymentRuleInput): PaymentRuleResult {
  if (input.amountDueCents <= 0) return { ok: true };
  switch (input.method) {
    case "card":
      return input.stripeEnabled
        ? { ok: true }
        : { ok: false, reason: "Pagamento con carta temporaneamente non disponibile.", field: "paymentMethod" };
    case "cash_on_pickup": {
      if (input.fulfillmentType !== "PICKUP") {
        return { ok: false, reason: "Il pagamento in sede è disponibile solo per il ritiro.", field: "paymentMethod" };
      }
      if (!input.hasPhone) {
        return { ok: false, reason: "Per pagare al ritiro indica un numero di telefono.", field: "phone" };
      }
      if (input.amountDueCents > input.settings.cashMaxCents) {
        return {
          ok: false,
          reason: `Il pagamento al ritiro è disponibile fino a ${(input.settings.cashMaxCents / 100).toFixed(2).replace(".", ",")} €. Scegli carta o bonifico.`,
          field: "paymentMethod"
        };
      }
      if (
        input.slotStart &&
        input.slotStart.getTime() - input.now.getTime() > input.settings.cashMaxAdvanceDays * 24 * 60 * 60_000
      ) {
        return {
          ok: false,
          reason: `Il pagamento al ritiro è disponibile per ritiri entro ${input.settings.cashMaxAdvanceDays} giorni. Per date più lontane paga con carta o bonifico.`,
          field: "paymentMethod"
        };
      }
      return { ok: true };
    }
    case "bank_transfer": {
      if (
        input.slotStart &&
        businessDaysBetween(input.now, input.slotStart) < input.settings.bankTransferMinBusinessDays
      ) {
        return {
          ok: false,
          reason: `Il bonifico richiede almeno ${input.settings.bankTransferMinBusinessDays} giorni lavorativi prima del ritiro o della consegna, il tempo dell'accredito. Scegli una data successiva o paga con carta.`,
          field: "paymentMethod"
        };
      }
      return { ok: true };
    }
  }
}

/**
 * Scadenza della riserva per bonifico: N giorni lavorativi (weekend e festivi
 * esclusi) e comunque almeno 24 ore prima della fascia, per dare tempo alla
 * sede di preparare solo ordini pagati.
 */
export function bankTransferReservationExpiry(now: Date, slotStart: Date | null, settings: CheckoutPolicySettings): Date {
  const byBusinessDays = addBusinessDays(now, settings.bankTransferReservationBusinessDays);
  if (!slotStart) return byBusinessDays;
  const beforeSlot = new Date(slotStart.getTime() - 24 * 60 * 60_000);
  const expiry = beforeSlot < byBusinessDays ? beforeSlot : byBusinessDays;
  return expiry.getTime() < now.getTime() + 60 * 60_000 ? new Date(now.getTime() + 60 * 60_000) : expiry;
}

/** Promemoria 24 ore prima della scadenza, solo se la finestra e abbastanza lunga da avere senso. */
export function shouldSendBankTransferReminder(input: {
  now: Date;
  placedAt: Date;
  expiresAt: Date;
  alreadySent: boolean;
}): boolean {
  if (input.alreadySent) return false;
  const window = input.expiresAt.getTime() - input.placedAt.getTime();
  const remaining = input.expiresAt.getTime() - input.now.getTime();
  return window > 30 * 60 * 60_000 && remaining > 0 && remaining <= 24 * 60 * 60_000;
}
