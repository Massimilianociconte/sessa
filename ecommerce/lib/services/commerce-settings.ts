import { DEFAULT_CHECKOUT_POLICY, type CheckoutPolicySettings } from "@/lib/commerce/checkout-policy";
import { getSettings } from "@/lib/services/settings";

/** Versione corrente delle condizioni di vendita accettate al checkout. */
export const DEFAULT_TERMS_VERSION = "2026-09";

function positiveInt(value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export async function getCheckoutPolicy(): Promise<CheckoutPolicySettings & { termsVersion: string }> {
  const s = await getSettings([
    "payments.cashMaxCents",
    "payments.cashMaxAdvanceDays",
    "payments.bankTransferMinBusinessDays",
    "payments.bankTransferReservationBusinessDays",
    "payments.maxCardAttempts",
    "legal.termsVersion"
  ]);
  return {
    cashMaxCents: positiveInt(s["payments.cashMaxCents"], DEFAULT_CHECKOUT_POLICY.cashMaxCents, 0),
    cashMaxAdvanceDays: positiveInt(s["payments.cashMaxAdvanceDays"], DEFAULT_CHECKOUT_POLICY.cashMaxAdvanceDays, 1, 60),
    bankTransferMinBusinessDays: positiveInt(
      s["payments.bankTransferMinBusinessDays"],
      DEFAULT_CHECKOUT_POLICY.bankTransferMinBusinessDays,
      1,
      30
    ),
    bankTransferReservationBusinessDays: positiveInt(
      s["payments.bankTransferReservationBusinessDays"],
      DEFAULT_CHECKOUT_POLICY.bankTransferReservationBusinessDays,
      1,
      15
    ),
    maxCardAttempts: positiveInt(s["payments.maxCardAttempts"], DEFAULT_CHECKOUT_POLICY.maxCardAttempts, 1, 20),
    termsVersion:
      typeof s["legal.termsVersion"] === "string" && s["legal.termsVersion"]
        ? (s["legal.termsVersion"] as string)
        : DEFAULT_TERMS_VERSION
  };
}

/** Dati aziendali obbligatori per note legali e condizioni (D.Lgs. 70/2003 art. 7). */
export const LEGAL_SETTING_KEYS = [
  "legal.companyName",
  "legal.registeredOffice",
  "legal.vatNumber",
  "legal.taxCode",
  "legal.rea",
  "legal.pec",
  "legal.supportEmail",
  "legal.privacyEmail",
  "legal.supportPhone"
] as const;

export type LegalKey = (typeof LEGAL_SETTING_KEYS)[number];

export const LEGAL_KEY_LABELS: Record<LegalKey, string> = {
  "legal.companyName": "ragione sociale",
  "legal.registeredOffice": "sede legale",
  "legal.vatNumber": "partita IVA",
  "legal.taxCode": "codice fiscale",
  "legal.rea": "numero REA",
  "legal.pec": "PEC",
  "legal.supportEmail": "email assistenza clienti",
  "legal.privacyEmail": "email privacy",
  "legal.supportPhone": "telefono assistenza"
};
export type LegalInfo = Record<LegalKey, string> & { complete: boolean; missing: LegalKey[] };

const REQUIRED_LEGAL_KEYS: LegalKey[] = [
  "legal.companyName",
  "legal.registeredOffice",
  "legal.vatNumber",
  "legal.rea",
  "legal.pec",
  "legal.supportEmail",
  "legal.privacyEmail"
];

export async function getLegalInfo(): Promise<LegalInfo> {
  const s = await getSettings([...LEGAL_SETTING_KEYS]);
  const info = Object.fromEntries(
    LEGAL_SETTING_KEYS.map((key) => [key, typeof s[key] === "string" ? (s[key] as string).trim() : ""])
  ) as Record<LegalKey, string>;
  const missing = REQUIRED_LEGAL_KEYS.filter((key) => !info[key]);
  return { ...info, complete: missing.length === 0, missing };
}

/** Destinatari degli avvisi operativi (nuovi ordini senza email di sede, resi, allarmi). */
export async function getOpsRecipients(): Promise<{ orders: string | null; alerts: string | null }> {
  const s = await getSettings(["notifications.ordersEmail", "notifications.alertsEmail", "store.email"]);
  const pick = (value: unknown) => (typeof value === "string" && /.+@.+\..+/.test(value) ? value.trim() : null);
  const fallback = pick(s["store.email"]);
  return {
    orders: pick(s["notifications.ordersEmail"]) ?? fallback,
    alerts: pick(s["notifications.alertsEmail"]) ?? fallback
  };
}

/** Ore minime prima della fascia per l'annullo self-service del cliente. */
export async function getCustomerCancelHours(): Promise<number> {
  const s = await getSettings(["orders.customerCancelHours"]);
  return positiveInt(s["orders.customerCancelHours"], 24, 0, 720);
}

/** Webhook https per gli allarmi operativi (Slack/Telegram/Teams). */
export async function getAlertsWebhookUrl(): Promise<string | null> {
  const s = await getSettings(["notifications.alertsWebhookUrl"]);
  const value = s["notifications.alertsWebhookUrl"];
  return typeof value === "string" && /^https:\/\/\S+$/.test(value) ? value : null;
}
