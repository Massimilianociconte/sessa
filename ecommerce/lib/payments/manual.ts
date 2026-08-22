import { getSetting } from "@/lib/services/settings";
import type { PaymentInitInput, PaymentInitResult, PaymentProvider } from "./types";

/**
 * Provider "manual": bonifico bancario o pagamento al ritiro.
 * Il bonifico resta PENDING_PAYMENT; il pagamento al ritiro nasce CONFIRMED,
 * cosi la preparazione non viene bloccata da un incasso che avverra in sede.
 */
export const manualProvider: PaymentProvider = {
  id: "manual",
  label: "Pagamento manuale",

  async init(input: PaymentInitInput): Promise<PaymentInitResult> {
    if (input.method === "bank_transfer") {
      const instructions = await getSetting(
        "payments.bankTransferInstructions",
        "Riceverai via email i dati per il bonifico. Indica il codice ordine nella causale."
      );
      return {
        ok: true,
        reference: `manual:${input.orderCode}`,
        instructions: `${instructions}\nCausale: ${input.orderCode}`,
        expiresAt: input.reservationExpiresAt ?? undefined
      };
    }
    return {
      ok: true,
      reference: `manual:${input.orderCode}`,
      instructions: "Pagherai presso la sede selezionata. Porta con te il codice ordine."
    };
  }
};
