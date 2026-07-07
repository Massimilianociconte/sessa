/**
 * Tipi di dominio e macchine a stati.
 * SQLite non ha enum: queste union sono la fonte di verità per i campi String
 * dello schema Prisma, applicate con Zod ai confini (actions/API).
 */

export const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  DRAFT: "Bozza",
  ACTIVE: "Pubblicato",
  ARCHIVED: "Archiviato"
};

export const ORDER_STATUSES = [
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "READY",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED"
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "In attesa di pagamento",
  PAID: "Pagato",
  PROCESSING: "In preparazione",
  READY: "Pronto per il ritiro",
  SHIPPED: "Spedito",
  DELIVERED: "Consegnato",
  CANCELLED: "Annullato",
  REFUNDED: "Rimborsato"
};

/**
 * Transizioni ammesse. Ogni cambio stato passa da orders.transitionOrder():
 * mai aggiornare Order.status direttamente. Da PROCESSING si può andare a
 * READY (ritiro in sede) oppure SHIPPED (consegna).
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["PROCESSING", "CANCELLED", "REFUNDED"],
  PROCESSING: ["READY", "SHIPPED", "CANCELLED"],
  READY: ["DELIVERED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: []
};

/** Stati per cui lo stock è ancora impegnato: l'annullamento da questi stati ricarica il magazzino. */
export const STOCK_HOLDING_STATUSES: OrderStatus[] = [
  "PENDING_PAYMENT",
  "PAID",
  "PROCESSING",
  "READY"
];

export const FULFILLMENT_TYPES = ["PICKUP", "DELIVERY"] as const;
export type FulfillmentType = (typeof FULFILLMENT_TYPES)[number];

export const FULFILLMENT_LABELS: Record<FulfillmentType, string> = {
  PICKUP: "Ritiro in sede",
  DELIVERY: "Consegna a domicilio"
};

export const DISCOUNT_SCOPES = ["ALL", "LOCATIONS", "CATEGORIES", "PRODUCTS"] as const;
export type DiscountScope = (typeof DISCOUNT_SCOPES)[number];

export const DISCOUNT_SCOPE_LABELS: Record<DiscountScope, string> = {
  ALL: "Tutta la piattaforma",
  LOCATIONS: "Sedi selezionate",
  CATEGORIES: "Categorie selezionate",
  PRODUCTS: "Prodotti selezionati"
};

export const PAYMENT_STATUSES = ["PENDING", "AUTHORIZED", "PAID", "REFUNDED", "FAILED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "In attesa",
  AUTHORIZED: "Autorizzato",
  PAID: "Pagato",
  REFUNDED: "Rimborsato",
  FAILED: "Fallito"
};

export const PAYMENT_METHODS = ["bank_transfer", "cash_on_pickup", "card", "gift_card"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: "Bonifico bancario",
  cash_on_pickup: "Pagamento al ritiro/consegna",
  card: "Carta di credito",
  gift_card: "Gift card"
};

export const DISCOUNT_TYPES = ["PERCENT", "FIXED"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const STOCK_REASONS = ["ORDER", "CANCEL_RESTOCK", "RESTOCK", "ADJUSTMENT", "INITIAL"] as const;
export type StockReason = (typeof STOCK_REASONS)[number];

export const STOCK_REASON_LABELS: Record<StockReason, string> = {
  ORDER: "Ordine",
  CANCEL_RESTOCK: "Storno da annullo",
  RESTOCK: "Riassortimento",
  ADJUSTMENT: "Rettifica manuale",
  INITIAL: "Carico iniziale"
};

export const ADMIN_ROLES = ["OWNER", "ADMIN", "STAFF"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string = "DOMAIN_ERROR"
  ) {
    super(message);
    this.name = "DomainError";
  }
}
