import { z } from "zod";
import {
  ADMIN_ROLES,
  DISCOUNT_SCOPES,
  DISCOUNT_TYPES,
  FULFILLMENT_TYPES,
  ORDER_STATUSES,
  CHECKOUT_PAYMENT_METHODS,
  PRODUCT_STATUSES
} from "@/lib/domain";
import { romeDayRange } from "@/lib/datetime";
import { isValidItalianPostalCode, isValidItalianProvince, normalizeItalianPhone } from "@/lib/commerce/address-it";
import { isValidCodiceFiscale, isValidPartitaIva, isValidSdiCode } from "@/lib/commerce/italian-tax-ids";

/** Schemi Zod: unica dogana tra FormData/input esterni e i servizi. */

const trimmed = (max = 200) => z.string().trim().min(1, "Campo obbligatorio").max(max);
const optionalTrimmed = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

const optionalCalendarDate = optionalTrimmed(10).refine(
  (value) => value === undefined || romeDayRange(value) !== null,
  "Data non valida"
);

/**
 * Nomi di persona: lettere (anche accentate), spazi, apostrofi, punti e
 * trattini. Niente cifre, URL o markup: i nomi finiscono nelle email inviate
 * dal dominio del negozio e non devono poter trasportare link di phishing.
 */
const PERSON_NAME = /^[\p{L}\p{M}][\p{L}\p{M}' .\-’]*$/u;
export const personName = (max = 80) =>
  z
    .string()
    .trim()
    .min(1, "Campo obbligatorio")
    .max(max)
    .regex(PERSON_NAME, "Usa solo lettere, spazi, apostrofi o trattini");

/** Testo breve libero (destinatario, ragione sociale) ma senza link ne markup. */
const NO_LINKS = /(https?:|www\.|:\/\/|[<>])/i;
export const plainLabel = (max = 120) =>
  z
    .string()
    .trim()
    .min(1, "Campo obbligatorio")
    .max(max)
    .refine((value) => !NO_LINKS.test(value), "Link e simboli < > non sono ammessi");

const passwordInput = z
  .string()
  .min(12, "La password deve avere almeno 12 caratteri")
  .max(128, "La password non può superare 128 caratteri");

const checkbox = z.preprocess((value) => value === "on" || value === "true" || value === true, z.boolean());

export const checkoutSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Email non valida").max(254),
    phone: optionalTrimmed(40).refine(
      (value) => value === undefined || normalizeItalianPhone(value) !== null,
      "Telefono non valido"
    ),
    firstName: personName(80),
    lastName: personName(80),
    fulfillmentType: z.enum(FULFILLMENT_TYPES),
    /** Fascia scelta: "YYYY-MM-DDTHH:mm" Europe/Rome. Assente solo per la spedizione nazionale. */
    slot: optionalTrimmed(16),
    line1: optionalTrimmed(160),
    line2: optionalTrimmed(160),
    city: optionalTrimmed(80),
    province: optionalTrimmed(4),
    postalCode: optionalTrimmed(10),
    country: z.string().trim().toUpperCase().length(2).default("IT"),
    shippingRateId: optionalTrimmed(64),
    paymentMethod: z.enum(CHECKOUT_PAYMENT_METHODS),
    customerNote: optionalTrimmed(1000),
    marketingOptIn: checkbox.default(false),
    acceptTerms: checkbox.default(false),
    invoiceRequested: checkbox.default(false),
    invoiceName: optionalTrimmed(160),
    invoiceVatNumber: optionalTrimmed(16),
    invoiceTaxCode: optionalTrimmed(16),
    invoiceSdi: optionalTrimmed(7),
    invoicePec: optionalTrimmed(254),
    invoiceAddress: optionalTrimmed(300),
    /** Importo che il cliente ha visto: se il server calcola altro, si chiede conferma. */
    expectedAmountDueCents: z.coerce.number().int().min(0).optional(),
    checkoutIdempotencyKey: optionalTrimmed(80)
  })
  .superRefine((data, ctx) => {
    if (!data.acceptTerms) {
      ctx.addIssue({
        path: ["acceptTerms"],
        code: "custom",
        message: "Per ordinare devi accettare le condizioni di vendita"
      });
    }
    if (data.slot !== undefined && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(data.slot)) {
      ctx.addIssue({ path: ["slot"], code: "custom", message: "Fascia oraria non valida" });
    }
    if (data.fulfillmentType === "PICKUP" && !data.slot) {
      ctx.addIssue({ path: ["slot"], code: "custom", message: "Scegli giorno e fascia di ritiro" });
    }
    if (data.paymentMethod === "cash_on_pickup" && data.fulfillmentType !== "PICKUP") {
      ctx.addIssue({
        path: ["paymentMethod"],
        code: "custom",
        message: "Il pagamento in sede è disponibile solo per il ritiro"
      });
    }
    // Per la consegna a domicilio i campi indirizzo e il telefono sono obbligatori.
    if (data.fulfillmentType === "DELIVERY") {
      if (!data.line1) ctx.addIssue({ path: ["line1"], code: "custom", message: "Indirizzo obbligatorio" });
      else if (NO_LINKS.test(data.line1)) ctx.addIssue({ path: ["line1"], code: "custom", message: "Indirizzo non valido" });
      if (!data.city) ctx.addIssue({ path: ["city"], code: "custom", message: "Città obbligatoria" });
      if (!data.province) ctx.addIssue({ path: ["province"], code: "custom", message: "Provincia obbligatoria" });
      if (!data.postalCode || !isValidItalianPostalCode(data.postalCode))
        ctx.addIssue({ path: ["postalCode"], code: "custom", message: "CAP non valido (5 cifre)" });
      if (data.province && !isValidItalianProvince(data.province))
        ctx.addIssue({ path: ["province"], code: "custom", message: "Provincia non valida (sigla di 2 lettere)" });
      if (!data.shippingRateId)
        ctx.addIssue({ path: ["shippingRateId"], code: "custom", message: "Scegli un metodo di consegna" });
      if (!data.phone)
        ctx.addIssue({ path: ["phone"], code: "custom", message: "Il telefono serve al corriere per la consegna" });
    }
    if (data.invoiceRequested) {
      if (!data.invoiceName || NO_LINKS.test(data.invoiceName))
        ctx.addIssue({ path: ["invoiceName"], code: "custom", message: "Indica nome o ragione sociale" });
      if (!data.invoiceVatNumber && !data.invoiceTaxCode)
        ctx.addIssue({ path: ["invoiceTaxCode"], code: "custom", message: "Indica partita IVA o codice fiscale" });
      if (data.invoiceVatNumber && !isValidPartitaIva(data.invoiceVatNumber))
        ctx.addIssue({ path: ["invoiceVatNumber"], code: "custom", message: "Partita IVA non valida" });
      if (data.invoiceTaxCode && !isValidCodiceFiscale(data.invoiceTaxCode))
        ctx.addIssue({ path: ["invoiceTaxCode"], code: "custom", message: "Codice fiscale non valido" });
      if (data.invoiceVatNumber && !data.invoiceSdi && !data.invoicePec)
        ctx.addIssue({ path: ["invoiceSdi"], code: "custom", message: "Per le aziende indica codice SDI o PEC" });
      if (data.invoiceSdi && !isValidSdiCode(data.invoiceSdi))
        ctx.addIssue({ path: ["invoiceSdi"], code: "custom", message: "Codice SDI non valido (7 caratteri)" });
      if (data.invoicePec && !z.string().email().safeParse(data.invoicePec).success)
        ctx.addIssue({ path: ["invoicePec"], code: "custom", message: "PEC non valida" });
      if (!data.invoiceAddress || NO_LINKS.test(data.invoiceAddress))
        ctx.addIssue({ path: ["invoiceAddress"], code: "custom", message: "Indica l'indirizzo di fatturazione" });
    }
  });
export type CheckoutFormInput = z.infer<typeof checkoutSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email non valida"),
  password: z.string().min(1, "Password obbligatoria").max(128, "Password non valida")
});

// --- Clienti ---
/** Registrazione sicura email-first: la password si sceglie solo dal link ricevuto. */
export const customerRegistrationRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email non valida").max(254),
  firstName: personName(80),
  lastName: personName(80),
  phone: optionalTrimmed(40).refine(
    (value) => value === undefined || normalizeItalianPhone(value) !== null,
    "Telefono non valido"
  ),
  acceptPrivacy: checkbox.refine((value) => value, "Conferma di aver letto l'informativa privacy")
});

export const customerLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email non valida"),
  password: z.string().min(1, "Password obbligatoria").max(128, "Password non valida")
});

export const profileSchema = z.object({
  firstName: personName(80),
  lastName: personName(80),
  phone: optionalTrimmed(40),
  marketingOptIn: z.coerce.boolean().default(false)
});

export const italianAddressSchema = z.object({
  fullName: plainLabel(120),
  line1: plainLabel(160),
  city: trimmed(80),
  province: z
    .string()
    .trim()
    .toUpperCase()
    .refine(isValidItalianProvince, "Provincia non valida (sigla di 2 lettere)"),
  postalCode: z.string().trim().refine(isValidItalianPostalCode, "CAP non valido (5 cifre)"),
  phone: z
    .string()
    .trim()
    .min(1, "Telefono obbligatorio")
    .refine((value) => normalizeItalianPhone(value) !== null, "Telefono non valido")
});

export const addressSchema = z.object({
  label: optionalTrimmed(40),
  fullName: plainLabel(120),
  line1: plainLabel(160),
  line2: optionalTrimmed(160),
  city: trimmed(80),
  province: z
    .string()
    .trim()
    .toUpperCase()
    .refine(isValidItalianProvince, "Provincia non valida (sigla di 2 lettere)"),
  postalCode: z.string().trim().refine(isValidItalianPostalCode, "CAP non valido (5 cifre)"),
  phone: optionalTrimmed(40).refine(
    (value) => value === undefined || normalizeItalianPhone(value) !== null,
    "Telefono non valido"
  ),
  isDefault: z.coerce.boolean().default(false)
});

export const resetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email non valida")
});

export const resetSchema = z.object({
  token: z.string().min(1),
  password: passwordInput
});

export const productSchema = z.object({
  name: trimmed(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug non valido (solo minuscole, numeri e trattini)"),
  description: z.string().trim().max(5000).default(""),
  shortDescription: optionalTrimmed(300),
  status: z.enum(PRODUCT_STATUSES),
  featured: z.coerce.boolean().default(false),
  position: z.coerce.number().int().min(0).default(0),
  taxRateBps: z.coerce.number().int().min(0).max(10000).default(1000),
  categoryId: optionalTrimmed(64),
  image: optionalTrimmed(500),
  tags: z.string().trim().max(300).default(""),
  allergens: z.string().trim().max(500).default(""),
  ingredients: z.string().trim().max(1000).default(""),
  merchantEnabled: z.coerce.boolean().default(true),
  merchantTitle: optionalTrimmed(150),
  merchantDescription: optionalTrimmed(5000),
  googleProductCategory: optionalTrimmed(300),
  storageInfo: z.string().trim().max(500).default(""),
  shippingScope: z.enum(["LOCAL", "NATIONAL"]).default("LOCAL"),
  leadTimeHours: z.coerce.number().int().min(0).max(720).default(0)
}).superRefine((data, ctx) => {
  // Vendita a distanza di alimenti: informazioni obbligatorie prima dell'acquisto.
  if (data.status !== "ACTIVE") return;
  if (!data.ingredients) {
    ctx.addIssue({ path: ["ingredients"], code: "custom", message: "Ingredienti obbligatori per pubblicare il prodotto" });
  }
  if (!data.allergens) {
    ctx.addIssue({ path: ["allergens"], code: "custom", message: "Allergeni obbligatori per pubblicare (scrivi \"nessuno\" se assenti)" });
  }
  if (!data.storageInfo) {
    ctx.addIssue({ path: ["storageInfo"], code: "custom", message: "Indica come conservare il prodotto per pubblicarlo" });
  }
});

export const variantSchema = z.object({
  name: trimmed(120),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,40}$/, "SKU non valido (maiuscole, numeri, trattini)"),
  price: z.string().trim().min(1, "Prezzo base obbligatorio"),
  compareAt: optionalTrimmed(20),
  gtin: optionalTrimmed(14).refine((value) => value === undefined || /^\d{8,14}$/.test(value), "GTIN non valido"),
  mpn: optionalTrimmed(70),
  weightGrams: z.coerce.number().int().min(0).optional(),
  isActive: z.coerce.boolean().default(true),
  position: z.coerce.number().int().min(0).default(0)
});

export const categorySchema = z.object({
  name: trimmed(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug non valido"),
  description: optionalTrimmed(1000),
  accent: z.enum(["terracotta", "blue", "green"]).default("terracotta"),
  position: z.coerce.number().int().min(0).default(0),
  isActive: z.coerce.boolean().default(true),
  image: optionalTrimmed(500)
});

export const discountSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,32}$/, "Codice non valido (3-32 caratteri, A-Z 0-9 -)"),
    description: optionalTrimmed(300),
    type: z.enum(DISCOUNT_TYPES),
    value: z.string().trim().min(1, "Valore obbligatorio"),
    scope: z.enum(DISCOUNT_SCOPES).default("ALL"),
    minSubtotal: optionalTrimmed(20),
    maxUses: z.coerce.number().int().min(1).optional(),
    perUserLimit: z.coerce.number().int().min(1).optional(),
    firstOrderOnly: z.coerce.boolean().default(false),
    stackable: z.coerce.boolean().default(false),
    startsAt: optionalCalendarDate,
    endsAt: optionalCalendarDate,
    isActive: z.coerce.boolean().default(true)
  })
  .refine(
    (d) => !(d.startsAt && d.endsAt) || d.startsAt <= d.endsAt,
    { message: "La data di fine deve seguire quella di inizio", path: ["endsAt"] }
  );

export const locationSchema = z.object({
  name: trimmed(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug non valido"),
  city: trimmed(80),
  address: trimmed(200),
  province: optionalTrimmed(4),
  postalCode: optionalTrimmed(10),
  phone: optionalTrimmed(40),
  hours: optionalTrimmed(200),
  image: optionalTrimmed(500),
  pickupEnabled: z.coerce.boolean().default(true),
  deliveryEnabled: z.coerce.boolean().default(true),
  isActive: z.coerce.boolean().default(true),
  position: z.coerce.number().int().min(0).default(0),
  merchantStoreCode: optionalTrimmed(64).refine(
    (value) => value === undefined || /^[A-Za-z0-9]+$/.test(value),
    "Codice negozio Merchant non valido"
  ),
  merchantEnabled: z.coerce.boolean().default(false),
  merchantPickupSla: z.enum(["same day", "next day", "2-day", "3-day", "4-day", "5-day", "6-day", "multi-week"]).default("same day"),
  latitude: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.coerce.number().min(-90).max(90).optional()
  ),
  longitude: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? undefined : value),
    z.coerce.number().min(-180).max(180).optional()
  ),
  googleMapsUrl: optionalTrimmed(500),
  gbpUrl: optionalTrimmed(500),
  closedDates: z
    .string()
    .trim()
    .max(4000)
    .default("")
    .refine(
      (value) => value.split(/[\s,;]+/).filter(Boolean).every((date) => romeDayRange(date) !== null),
      "Chiusure: usa date nel formato AAAA-MM-GG separate da virgola"
    ),
  leadTimeMinutes: z.coerce.number().int().min(0).max(20160).default(120),
  slotMinutes: z.coerce.number().int().min(5).max(240).default(30),
  slotCapacity: z.coerce.number().int().min(0).max(10000).default(0),
  maxAdvanceDays: z.coerce.number().int().min(1).max(366).default(60),
  notificationEmail: optionalTrimmed(254).refine(
    (value) => value === undefined || z.string().email().safeParse(value).success,
    "Email avvisi non valida"
  ),
  localDeliveryPostalCodes: z
    .string()
    .trim()
    .max(4000)
    .default("")
    .refine(
      (value) => value.split(/[\s,;]+/).filter(Boolean).every((cap) => /^\d{2,5}$/.test(cap)),
      "CAP serviti: usa CAP o prefissi numerici separati da virgola"
    )
}).superRefine((data, ctx) => {
  if (data.isActive && !data.pickupEnabled && !data.deliveryEnabled) {
    ctx.addIssue({
      path: ["pickupEnabled"],
      code: "custom",
      message: "Una sede attiva deve offrire almeno ritiro o consegna."
    });
  }
});

export const storeVariantSchema = z.object({
  price: optionalTrimmed(20), // vuoto = usa prezzo base
  isAvailable: z.coerce.boolean().default(true),
  lowStockThreshold: z.coerce.number().int().min(0).default(5)
});

export const shippingRateSchema = z.object({
  zoneId: trimmed(64),
  name: trimmed(120),
  scope: z.enum(["LOCAL", "NATIONAL"]).default("NATIONAL"),
  amount: z.string().trim().min(1, "Costo obbligatorio"),
  freeAbove: optionalTrimmed(20),
  position: z.coerce.number().int().min(0).default(0),
  isActive: z.coerce.boolean().default(true)
});

export const orderTransitionSchema = z.object({
  orderId: trimmed(64),
  to: z.enum(ORDER_STATUSES),
  note: optionalTrimmed(500),
  paymentRef: optionalTrimmed(120)
});

export const stockAdjustSchema = z.object({
  storeVariantId: trimmed(64),
  delta: z.coerce
    .number()
    .int()
    .refine((n) => n !== 0, "La variazione non può essere zero"),
  reason: z.enum(["RESTOCK", "ADJUSTMENT"]),
  note: optionalTrimmed(300)
});

export const adminUserSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email non valida"),
  name: trimmed(120),
  password: passwordInput,
  role: z.enum(ADMIN_ROLES).default("STORE_MANAGER")
});

export const storeSettingsSchema = z.object({
  storeName: trimmed(120),
  storeEmail: z.string().trim().toLowerCase().email("Email non valida"),
  storePhone: optionalTrimmed(40),
  storeAddress: optionalTrimmed(300),
  storeVat: optionalTrimmed(60),
  bankTransferInstructions: optionalTrimmed(2000)
});

const optionalEmail = optionalTrimmed(254).refine(
  (value) => value === undefined || z.string().email().safeParse(value).success,
  "Email non valida"
);

/** Dati aziendali (note legali, condizioni), destinatari avvisi e regole di pagamento. */
export const legalSettingsSchema = z.object({
  companyName: optionalTrimmed(160),
  registeredOffice: optionalTrimmed(300),
  vatNumber: optionalTrimmed(16).refine((value) => value === undefined || isValidPartitaIva(value), "Partita IVA non valida"),
  taxCode: optionalTrimmed(16),
  rea: optionalTrimmed(40),
  pec: optionalEmail,
  supportEmail: optionalEmail,
  privacyEmail: optionalEmail,
  supportPhone: optionalTrimmed(40),
  termsVersion: z.string().trim().regex(/^[0-9A-Za-z.-]{1,20}$/, "Versione condizioni non valida").default("2026-09"),
  ordersEmail: optionalEmail,
  alertsEmail: optionalEmail,
  alertsWebhookUrl: optionalTrimmed(500).refine(
    (value) => value === undefined || /^https:\/\/[^\s]+$/.test(value),
    "Il webhook deve essere un URL https"
  ),
  cashMax: z.string().trim().default("150,00"),
  cashMaxAdvanceDays: z.coerce.number().int().min(1).max(60).default(7),
  bankTransferMinBusinessDays: z.coerce.number().int().min(1).max(30).default(3),
  bankTransferReservationBusinessDays: z.coerce.number().int().min(1).max(15).default(2),
  maxCardAttempts: z.coerce.number().int().min(1).max(20).default(5),
  customerCancelHours: z.coerce.number().int().min(0).max(720).default(24)
});

/** Converte FormData in oggetto piatto per Zod (checkbox → boolean-friendly). */
export function formDataToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}
