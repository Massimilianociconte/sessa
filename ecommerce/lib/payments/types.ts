/**
 * Astrazione provider di pagamento.
 * Oggi è attivo il provider "manual" (bonifico / ritiro in sede);
 * per Stripe o altri basta implementare questa interfaccia e
 * registrarla in lib/payments/index.ts.
 */

export type PaymentInitInput = {
  /** ID persistente incluso nei metadata provider per riconciliare webhook anticipati. */
  attemptId: string;
  orderId?: string;
  orderCode: string;
  publicToken: string;
  totalCents: number;
  email: string;
  method?: string | null;
  /** Chiave stabile del nostro PaymentAttempt, riusata sui retry di rete. */
  idempotencyKey: string;
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
      /** Scadenza comunicata dal provider per non riusare sessioni morte. */
      expiresAt?: Date;
    }
  | { ok: false; error: string; /** false = configurazione/input definitivo; true = rete/provider ritentabile */ retryable?: boolean };

export interface PaymentProvider {
  id: string;
  label: string;
  init(input: PaymentInitInput): Promise<PaymentInitResult>;
  /** Rimborso (opzionale: il provider manuale lo gestisce fuori piattaforma). */
  refund?(
    paymentReference: string,
    amountCents: number,
    idempotencyKey: string
  ): Promise<{ ok: boolean; reference?: string; error?: string }>;
  /** Chiude una sessione non ancora pagata quando l'ordine non e piu pagabile. */
  cancel?(reference: string): Promise<{ ok: boolean; error?: string }>;
}
