import { z } from "zod";
import {
  ADMIN_ROLES,
  DISCOUNT_SCOPES,
  DISCOUNT_TYPES,
  FULFILLMENT_TYPES,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PRODUCT_STATUSES
} from "@/lib/domain";

/** Schemi Zod: unica dogana tra FormData/input esterni e i servizi. */

const trimmed = (max = 200) => z.string().trim().min(1, "Campo obbligatorio").max(max);
const optionalTrimmed = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? undefined : v))
    .optional();

export const checkoutSchema = z
  .object({
    email: z.string().trim().toLowerCase().email("Email non valida"),
    phone: optionalTrimmed(40),
    firstName: trimmed(80),
    lastName: trimmed(80),
    fulfillmentType: z.enum(FULFILLMENT_TYPES),
    fulfillmentAt: z.string().trim().min(1, "Indica quando vuoi ricevere l'ordine"),
    line1: optionalTrimmed(160),
    line2: optionalTrimmed(160),
    city: optionalTrimmed(80),
    province: optionalTrimmed(4),
    postalCode: optionalTrimmed(10),
    country: z.string().trim().toUpperCase().length(2).default("IT"),
    shippingRateId: optionalTrimmed(64),
    paymentMethod: z.enum(PAYMENT_METHODS),
    customerNote: optionalTrimmed(1000),
    marketingOptIn: z.coerce.boolean().default(false)
  })
  .superRefine((data, ctx) => {
    // Data/ora richiesta: valida e non nel passato.
    const when = new Date(data.fulfillmentAt);
    if (Number.isNaN(when.getTime())) {
      ctx.addIssue({ path: ["fulfillmentAt"], code: "custom", message: "Data/ora non valida" });
    } else if (when.getTime() < Date.now() - 60_000) {
      ctx.addIssue({ path: ["fulfillmentAt"], code: "custom", message: "Scegli una data/ora futura" });
    }
    // Per la consegna a domicilio i campi indirizzo sono obbligatori.
    if (data.fulfillmentType === "DELIVERY") {
      if (!data.line1) ctx.addIssue({ path: ["line1"], code: "custom", message: "Indirizzo obbligatorio" });
      if (!data.city) ctx.addIssue({ path: ["city"], code: "custom", message: "Città obbligatoria" });
      if (!data.province) ctx.addIssue({ path: ["province"], code: "custom", message: "Provincia obbligatoria" });
      if (!data.postalCode || !/^\d{5}$/.test(data.postalCode))
        ctx.addIssue({ path: ["postalCode"], code: "custom", message: "CAP non valido (5 cifre)" });
      if (!data.shippingRateId)
        ctx.addIssue({ path: ["shippingRateId"], code: "custom", message: "Scegli un metodo di spedizione" });
    }
  });
export type CheckoutFormInput = z.infer<typeof checkoutSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email non valida"),
  password: z.string().min(1, "Password obbligatoria")
});

// --- Clienti ---
export const customerRegisterSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email non valida"),
  password: z.string().min(10, "La password deve avere almeno 10 caratteri"),
  firstName: trimmed(80),
  lastName: trimmed(80),
  phone: optionalTrimmed(40),
  marketingOptIn: z.coerce.boolean().default(false)
});

export const customerLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email non valida"),
  password: z.string().min(1, "Password obbligatoria")
});

export const profileSchema = z.object({
  firstName: trimmed(80),
  lastName: trimmed(80),
  phone: optionalTrimmed(40),
  marketingOptIn: z.coerce.boolean().default(false)
});

export const addressSchema = z.object({
  label: optionalTrimmed(40),
  fullName: trimmed(120),
  line1: trimmed(160),
  line2: optionalTrimmed(160),
  city: trimmed(80),
  province: z.string().trim().min(1, "Provincia obbligatoria").max(4),
  postalCode: z.string().trim().regex(/^\d{5}$/, "CAP non valido (5 cifre)"),
  phone: optionalTrimmed(40),
  isDefault: z.coerce.boolean().default(false)
});

export const resetRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email non valida")
});

export const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(10, "La password deve avere almeno 10 caratteri")
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
  ingredients: z.string().trim().max(1000).default("")
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
    startsAt: optionalTrimmed(30),
    endsAt: optionalTrimmed(30),
    isActive: z.coerce.boolean().default(true)
  })
  .refine(
    (d) => !(d.startsAt && d.endsAt) || new Date(d.startsAt) <= new Date(d.endsAt),
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
  position: z.coerce.number().int().min(0).default(0)
});

export const storeVariantSchema = z.object({
  price: optionalTrimmed(20), // vuoto = usa prezzo base
  isAvailable: z.coerce.boolean().default(true),
  lowStockThreshold: z.coerce.number().int().min(0).default(5)
});

export const shippingRateSchema = z.object({
  zoneId: trimmed(64),
  name: trimmed(120),
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
  password: z.string().min(10, "Minimo 10 caratteri"),
  role: z.enum(ADMIN_ROLES).default("STAFF")
});

export const storeSettingsSchema = z.object({
  storeName: trimmed(120),
  storeEmail: z.string().trim().toLowerCase().email("Email non valida"),
  storePhone: optionalTrimmed(40),
  storeAddress: optionalTrimmed(300),
  storeVat: optionalTrimmed(60),
  bankTransferInstructions: optionalTrimmed(2000)
});

/** Converte FormData in oggetto piatto per Zod (checkbox → boolean-friendly). */
export function formDataToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}
