import { FULFILLMENT_LABELS, PAYMENT_METHOD_LABELS, type FulfillmentType, type PaymentMethod } from "@/lib/domain";
import { formatRomeAppointment, formatRomeSlotShort } from "@/lib/datetime";
import { formatCents } from "@/lib/money";
import { SITE_URL } from "@/lib/site";
import type { EmailCta } from "@/lib/services/email";

/**
 * Testi delle comunicazioni d'ordine in un solo posto: cliente e sede ricevono
 * sempre gli stessi dati (articoli, fascia, sede, totali, pagamento). Nessun
 * testo inserito dal cliente finisce prima dei link o nel pulsante.
 */
export type MessageOrder = {
  code: string;
  publicToken: string;
  email: string;
  phone: string | null;
  fulfillmentType: string;
  fulfillmentAt: Date | null;
  locationName: string;
  location?: { address: string; city: string; postalCode?: string | null; phone: string | null; hours: string | null } | null;
  shipFullName: string;
  shipLine1: string;
  shipLine2: string | null;
  shipCity: string;
  shipProvince: string;
  shipPostalCode: string;
  shippingMethodName: string;
  subtotalCents: number;
  discountCents: number;
  discountCodeSnapshot: string | null;
  giftCardCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  paymentMethod: string | null;
  customerNote: string | null;
  invoiceRequested?: boolean;
  items: Array<{ qty: number; productName: string; variantName: string; totalCents: number }>;
};

export type Message = { subject: string; body: string; cta?: EmailCta };

export function trackingUrl(order: Pick<MessageOrder, "code" | "publicToken">): string {
  return `${SITE_URL}/ordine/${encodeURIComponent(order.code)}?t=${order.publicToken}`;
}

export function fulfillmentLine(order: Pick<MessageOrder, "fulfillmentType" | "fulfillmentAt" | "shippingMethodName">): string {
  const label = FULFILLMENT_LABELS[order.fulfillmentType as FulfillmentType] ?? order.fulfillmentType;
  if (order.fulfillmentAt) return `${label}: ${formatRomeAppointment(order.fulfillmentAt)}`;
  return order.fulfillmentType === "DELIVERY" ? `${label} con ${order.shippingMethodName}` : label;
}

function itemsBlock(order: MessageOrder): string {
  return order.items.map((item) => `• ${item.qty} × ${item.productName} (${item.variantName}) — ${formatCents(item.totalCents)}`).join("\n");
}

function totalsBlock(order: MessageOrder): string {
  const due = Math.max(0, order.totalCents - order.giftCardCents);
  return [
    `Subtotale: ${formatCents(order.subtotalCents)}`,
    order.discountCents > 0 ? `Sconto${order.discountCodeSnapshot ? ` ${order.discountCodeSnapshot}` : ""}: −${formatCents(order.discountCents)}` : null,
    order.fulfillmentType === "DELIVERY" ? `Consegna: ${order.shippingCents === 0 ? "gratis" : formatCents(order.shippingCents)}` : null,
    `Totale (IVA inclusa, di cui IVA ${formatCents(order.taxCents)}): ${formatCents(order.totalCents)}`,
    order.giftCardCents > 0 ? `Gift card: −${formatCents(order.giftCardCents)}` : null,
    order.giftCardCents > 0 ? (due > 0 ? `Da pagare: ${formatCents(due)}` : "Ordine già pagato con gift card.") : null
  ]
    .filter(Boolean)
    .join("\n");
}

function placeBlock(order: MessageOrder): string {
  if (order.fulfillmentType === "DELIVERY") {
    return [
      "Consegna a:",
      order.shipFullName,
      `${order.shipLine1}${order.shipLine2 ? `, ${order.shipLine2}` : ""}`,
      `${order.shipPostalCode} ${order.shipCity} (${order.shipProvince})`
    ].join("\n");
  }
  const location = order.location;
  return [
    `Ritiro presso: Sessa 1930 — ${order.locationName}`,
    location ? `${location.address}${location.postalCode ? `, ${location.postalCode}` : ""} ${location.city}` : null,
    location?.phone ? `Telefono sede: ${location.phone}` : null,
    location?.hours ? `Orari: ${location.hours}` : null
  ]
    .filter(Boolean)
    .join("\n");
}

function paymentLabel(order: MessageOrder): string {
  return PAYMENT_METHOD_LABELS[order.paymentMethod as PaymentMethod] ?? order.paymentMethod ?? "—";
}

/** Conferma al cliente: riepilogo contrattuale su supporto durevole (art. 51 Cod. Consumo). */
export function orderConfirmationMessage(order: MessageOrder, termsUrl = `${SITE_URL}/condizioni-di-vendita`): Message {
  return {
    subject: `Conferma ordine ${order.code} — Sessa 1930`,
    body: [
      `Grazie, abbiamo ricevuto il tuo ordine ${order.code}.`,
      fulfillmentLine(order),
      placeBlock(order),
      `Articoli:\n${itemsBlock(order)}`,
      totalsBlock(order),
      `Pagamento: ${paymentLabel(order)}`,
      order.paymentMethod === "cash_on_pickup" ? "Pagherai in sede al ritiro: tieni a portata di mano il codice ordine." : null,
      order.customerNote ? `Note: ${order.customerNote}` : null,
      order.invoiceRequested ? "Hai richiesto la fattura: la riceverai dalla sede con i dati indicati." : null,
      `Condizioni di vendita accettate: ${termsUrl}`,
      `Stato dell'ordine sempre aggiornato: ${trackingUrl(order)}`
    ]
      .filter(Boolean)
      .join("\n\n"),
    cta: { url: trackingUrl(order), label: "Segui il tuo ordine" }
  };
}

/** Avviso alla sede: tutto il necessario per preparare, senza aprire il gestionale. */
export function storeNewOrderMessage(order: MessageOrder & { id: string }): Message {
  return {
    subject: `Nuovo ordine ${order.code} — ${order.fulfillmentAt ? formatRomeSlotShort(order.fulfillmentAt) : order.locationName}`,
    body: [
      `Nuovo ordine ${order.code} per ${order.locationName}.`,
      fulfillmentLine(order),
      `Articoli:\n${itemsBlock(order)}`,
      `Totale: ${formatCents(order.totalCents)} · Pagamento: ${paymentLabel(order)}`,
      `Cliente: ${order.email}${order.phone ? ` · ${order.phone}` : ""}`,
      order.fulfillmentType === "DELIVERY" ? placeBlock(order) : null,
      order.customerNote ? `Note del cliente: ${order.customerNote}` : null,
      order.invoiceRequested ? "Il cliente ha richiesto la fattura (dati nel gestionale)." : null
    ]
      .filter(Boolean)
      .join("\n\n"),
    cta: { url: `${SITE_URL}/admin/ordini/${order.id}`, label: "Apri nel gestionale" }
  };
}

export type CancellationReason = "RESERVATION_EXPIRED" | "PAYMENT_FAILED" | "CUSTOMER" | "STORE";

export function orderCancelledMessage(
  order: MessageOrder,
  reason: CancellationReason,
  options: { refundPending?: boolean } = {}
): Message {
  const why: Record<CancellationReason, string> = {
    RESERVATION_EXPIRED:
      order.paymentMethod === "bank_transfer"
        ? "Non abbiamo ricevuto il bonifico entro la scadenza, quindi i prodotti sono tornati disponibili. Se hai già disposto il pagamento, rispondi alla sede indicando il codice ordine: ti rimborsiamo o riattiviamo l'ordine."
        : "Il pagamento non è stato completato entro il tempo di prenotazione, quindi i prodotti sono tornati disponibili. Nessun importo è stato addebitato.",
    PAYMENT_FAILED: "Il pagamento non è andato a buon fine. Nessun importo è stato addebitato.",
    CUSTOMER: "Abbiamo annullato l'ordine come richiesto.",
    STORE: "La sede ha annullato l'ordine. Per chiarimenti contatta la sede indicando il codice ordine."
  };
  return {
    subject: `Ordine ${order.code} annullato — Sessa 1930`,
    body: [
      `L'ordine ${order.code} è stato annullato.`,
      why[reason],
      options.refundPending ? "Il rimborso degli importi già pagati ti verrà confermato con un messaggio separato." : null,
      `Dettagli: ${trackingUrl(order)}`
    ]
      .filter(Boolean)
      .join("\n\n"),
    cta: { url: trackingUrl(order), label: "Vedi l'ordine" }
  };
}

export function refundMessage(
  order: MessageOrder,
  input: { amountCents: number; fully: boolean; automatic: boolean; giftCardRestoredCents: number }
): Message {
  const lines = [
    input.amountCents > 0
      ? input.automatic
        ? `Abbiamo disposto il rimborso di ${formatCents(input.amountCents)} sul metodo di pagamento usato per l'ordine ${order.code}. L'accredito richiede di norma 5-10 giorni lavorativi.`
        : `Abbiamo registrato un rimborso di ${formatCents(input.amountCents)} per l'ordine ${order.code}. La sede lo effettuerà con lo stesso mezzo usato per il pagamento (bonifico o contanti) e ti contatterà per i dettagli.`
      : null,
    input.giftCardRestoredCents > 0 ? `Il credito di ${formatCents(input.giftCardRestoredCents)} è stato restituito sulla tua gift card.` : null,
    input.fully ? "L'ordine risulta interamente rimborsato." : "Si tratta di un rimborso parziale.",
    `Dettagli: ${trackingUrl(order)}`
  ];
  return {
    subject: `Rimborso ordine ${order.code} — Sessa 1930`,
    body: lines.filter(Boolean).join("\n\n"),
    cta: { url: trackingUrl(order), label: "Vedi l'ordine" }
  };
}

export function paymentReminderMessage(order: MessageOrder, expiresAt: Date, instructions: string): Message {
  return {
    subject: `Promemoria pagamento ordine ${order.code} — Sessa 1930`,
    body: [
      `Il tuo ordine ${order.code} è in attesa del bonifico di ${formatCents(Math.max(0, order.totalCents - order.giftCardCents))}.`,
      `Se il pagamento non risulta accreditato entro ${formatRomeAppointment(expiresAt)}, l'ordine verrà annullato e i prodotti torneranno disponibili.`,
      instructions,
      `Causale: ${order.code}`
    ].join("\n\n"),
    cta: { url: trackingUrl(order), label: "Vedi l'ordine" }
  };
}

export function statusUpdateMessage(order: MessageOrder, status: "READY" | "SHIPPED" | "DELIVERED", tracking?: string | null): Message {
  const texts = {
    READY: {
      subject: `Ordine ${order.code} pronto al ritiro — Sessa 1930`,
      body: `Il tuo ordine ${order.code} è pronto.\n\n${placeBlock(order)}\n\nPorta con te il codice ordine.`
    },
    SHIPPED: {
      subject: `Ordine ${order.code} spedito — Sessa 1930`,
      body: `Il tuo ordine ${order.code} è in consegna.${tracking ? `\n\nTracking: ${tracking}` : ""}`
    },
    DELIVERED: {
      subject: `Ordine ${order.code} consegnato — Sessa 1930`,
      body: `Il tuo ordine ${order.code} risulta ${order.fulfillmentType === "PICKUP" ? "ritirato" : "consegnato"}. Grazie per aver scelto Sessa 1930!\n\nSe qualcosa non va, segnalacelo dalla pagina dell'ordine entro 48 ore: per i prodotti freschi non si applica il diritto di recesso, ma ogni difetto di conformità viene gestito.`
    }
  }[status];
  return { ...texts, body: `${texts.body}\n\nDettagli: ${trackingUrl(order)}`, cta: { url: trackingUrl(order), label: "Vedi l'ordine" } };
}
