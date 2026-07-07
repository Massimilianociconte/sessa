import { getSetting } from "@/lib/services/settings";
import type { PaymentInitInput, PaymentInitResult, PaymentProvider } from "./types";

/**
 * Provider "manual": bonifico bancario o pagamento al ritiro.
 * L'ordine nasce PENDING_PAYMENT e viene marcato pagato dal gestionale.
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
        instructions: `${instructions}\nCausale: ${input.orderCode}`
      };
    }
    return {
      ok: true,
      reference: `manual:${input.orderCode}`,
      instructions:
        "Pagherai al ritiro in sede (Piazza Municipio 27, Ottaviano). Porta con te il codice ordine."
    };
  }
};
