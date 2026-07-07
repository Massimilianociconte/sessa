/**
 * Astrazione provider di pagamento.
 * Oggi è attivo il provider "manual" (bonifico / ritiro in sede);
 * per Stripe o altri basta implementare questa interfaccia e
 * registrarla in lib/payments/index.ts.
 */

export type PaymentInitInput = {
  orderId?: string;
  orderCode: string;
  publicToken: string;
  totalCents: number;
  email: string;
  method?: string | null;
};

export type PaymentInitResult =
  | {
      ok: true;
      /** Riferimento interno/esterno della transazione. */
      reference: string;
      /** Istruzioni da mostrare al cliente (es. dati bonifico). */
      instructions?: string;
      /** URL a cui redirigere per pagare (checkout esterno tipo Stripe). */
      redirectUrl?: string;
    }
  | { ok: false; error: string };

export interface PaymentProvider {
  id: string;
  label: string;
  init(input: PaymentInitInput): Promise<PaymentInitResult>;
  /** Rimborso (opzionale: il provider manuale lo gestisce fuori piattaforma). */
  refund?(reference: string, amountCents: number): Promise<{ ok: boolean; error?: string }>;
}
