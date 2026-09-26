import assert from "node:assert/strict";
import test from "node:test";
import { parseRomeDateTimeLocal } from "@/lib/datetime";
import {
  addBusinessDays,
  businessDaysBetween,
  earliestDateAfterBusinessDays,
  isBusinessDay,
  italianHolidays,
  parseRangesText,
  parseWeeklyHours,
  scheduleConfigFor,
  serializeWeeklyHours,
  slotKeyContaining,
  upcomingSlotDays,
  validateSlotKey
} from "@/lib/commerce/scheduling";
import {
  bankTransferReservationExpiry,
  checkPaymentMethod,
  DEFAULT_CHECKOUT_POLICY,
  shouldSendBankTransferReminder
} from "@/lib/commerce/checkout-policy";
import { allocateProportionally, computeIncludedTax } from "@/lib/commerce/tax";
import { isValidCodiceFiscale, isValidPartitaIva, isValidSdiCode } from "@/lib/commerce/italian-tax-ids";
import { allowedShippingScopes, isPostalCodeServed } from "@/lib/commerce/shipping-scope";
import { customerCancellation } from "@/lib/commerce/customer-cancellation";
import { assertDatabaseTargetAllowed, isLocalDatabaseHost } from "@/lib/db-guard";
import { isTrustedSiteUrl, renderEmailHtml } from "@/lib/services/email";
import { orderTokenCookieName, resolveOrderToken } from "@/lib/order-access";
import { isTrackablePath, sanitizedPageLocation } from "@/lib/analytics-location";
import { canonicalEmailIdentity } from "@/lib/services/referral";
import { signLink, verifyLink } from "@/lib/security/signed-links";
import { decryptSensitiveValue, encryptSensitiveValue, isCurrentEnvelope, refreshEncryptedValue } from "@/lib/security/secret-box";
import { backupCodeHashCandidates, hashBackupCode } from "@/lib/auth/two-factor-credentials";
import { clientIpFromHeaders } from "@/lib/auth/client-ip";
import { evaluateDiscount } from "@/lib/services/discounts";
import { makeDiscount } from "./support/fixtures";

const OTTAVIANO = {
  openingHours: '{"mon":[["06:30","21:00"]],"tue":[],"wed":[["06:30","21:00"]],"thu":[["06:30","21:00"]],"fri":[["06:30","21:00"]],"sat":[["06:30","21:00"]],"sun":[["06:30","21:00"]]}',
  closedDates: "2026-12-25",
  leadTimeMinutes: 120,
  slotMinutes: 30,
  maxAdvanceDays: 60
};
const rome = (value: string) => parseRomeDateTimeLocal(value)!;

test("le fasce rispettano giorno di chiusura, festività della sede e preparazione", () => {
  const config = scheduleConfigFor(OTTAVIANO);
  assert.equal(config.configured, true);
  // Lunedì 12 ottobre 2026 ore 10:00 → primo slot alle 12:00 (120 minuti).
  const now = rome("2026-10-12T10:00");
  const days = upcomingSlotDays(config, now, 0, 7);
  assert.equal(days[0].dateKey, "2026-10-12");
  assert.equal(days[0].slots[0].key, "2026-10-12T12:00");
  // Il martedì (chiuso) non compare mai.
  assert.equal(days.some((day) => day.dateKey === "2026-10-13"), false);
  assert.equal(validateSlotKey("2026-10-13T10:00", config, now).ok, false);
  // Fuori orario e troppo presto.
  assert.equal(validateSlotKey("2026-10-12T03:00", config, now).ok, false);
  assert.equal(validateSlotKey("2026-10-12T11:00", config, now).ok, false);
  assert.equal(validateSlotKey("2026-10-12T12:00", config, now).ok, true);
  // Chiusura straordinaria e anticipo massimo.
  assert.equal(validateSlotKey("2026-12-25T10:00", config, rome("2026-12-20T10:00")).ok, false);
  assert.equal(validateSlotKey("2027-03-01T10:00", config, now).ok, false);
  // Preparazione del prodotto (48h) sposta la prima fascia utile.
  assert.equal(validateSlotKey("2026-10-12T12:00", config, now, 48 * 60).ok, false);
  assert.equal(validateSlotKey("2026-10-14T12:00", config, now, 48 * 60).ok, true);
});

test("le fasce fino a mezzanotte e il cambio d'ora non producono orari impossibili", () => {
  const config = scheduleConfigFor({ ...OTTAVIANO, openingHours: serializeWeeklyHours({ mon: [["07:00", "24:00"]], tue: [["07:00", "24:00"]], wed: [["07:00", "24:00"]], thu: [["07:00", "24:00"]], fri: [["07:00", "24:00"]], sat: [["07:00", "24:00"]], sun: [["00:00", "04:00"]] }), closedDates: "" });
  const saturday = upcomingSlotDays(config, rome("2026-10-24T06:00"), 0, 1)[0];
  assert.equal(saturday.slots[saturday.slots.length - 1].label, "23:30–24:00");
  // Domenica 29 marzo 2026: alle 02:00 si passa alle 03:00, 02:00-02:30 non esiste.
  const dstDay = upcomingSlotDays(config, rome("2026-03-28T20:00"), 0, 2).find((day) => day.dateKey === "2026-03-29");
  assert.ok(dstDay);
  assert.equal(dstDay!.slots.some((slot) => slot.key === "2026-03-29T02:00"), false);
  assert.equal(slotKeyContaining(rome("2026-10-24T10:17"), config), "2026-10-24T10:00");
});

test("gli orari del gestionale si leggono e si validano", () => {
  assert.deepEqual(parseRangesText("06:30-13:00, 16:00-20:00"), [["06:30", "13:00"], ["16:00", "20:00"]]);
  assert.deepEqual(parseRangesText("chiuso"), []);
  assert.equal(parseRangesText("20:00-10:00"), null);
  assert.equal(parseRangesText("dalle 9"), null);
  assert.equal(parseWeeklyHours('{"mon":[["10:00","09:00"]]}'), null);
  assert.equal(parseWeeklyHours("non json"), null);
});

test("giorni lavorativi bancari: weekend e festività nazionali esclusi", () => {
  const holidays = italianHolidays(2027);
  assert.equal(holidays.has("2027-03-29"), true); // Lunedì dell'Angelo 2027
  assert.equal(isBusinessDay("2026-12-25"), false);
  assert.equal(isBusinessDay("2026-10-17"), false); // sabato
  // Venerdì sera + 2 giorni lavorativi = martedì sera.
  const due = addBusinessDays(rome("2026-10-16T20:00"), 2);
  assert.equal(due.toISOString(), rome("2026-10-20T20:00").toISOString());
  assert.equal(businessDaysBetween(rome("2026-10-16T20:00"), rome("2026-10-20T10:00")), 2);
  assert.equal(earliestDateAfterBusinessDays(rome("2026-10-16T10:00"), 3), "2026-10-21");
});

test("regole di pagamento: contanti solo ritiro, entro limiti; bonifico solo con anticipo", () => {
  const now = rome("2026-10-12T10:00");
  const base = { amountDueCents: 5000, hasPhone: true, stripeEnabled: true, now, settings: DEFAULT_CHECKOUT_POLICY };
  assert.equal(checkPaymentMethod({ ...base, method: "cash_on_pickup", fulfillmentType: "DELIVERY", slotStart: rome("2026-10-13T10:00") }).ok, false);
  assert.equal(checkPaymentMethod({ ...base, method: "cash_on_pickup", fulfillmentType: "PICKUP", slotStart: rome("2026-10-13T10:00"), hasPhone: false }).ok, false);
  assert.equal(checkPaymentMethod({ ...base, method: "cash_on_pickup", fulfillmentType: "PICKUP", slotStart: rome("2026-10-13T10:00"), amountDueCents: 50_000 }).ok, false);
  assert.equal(checkPaymentMethod({ ...base, method: "cash_on_pickup", fulfillmentType: "PICKUP", slotStart: rome("2026-11-12T10:00") }).ok, false);
  assert.equal(checkPaymentMethod({ ...base, method: "cash_on_pickup", fulfillmentType: "PICKUP", slotStart: rome("2026-10-13T10:00") }).ok, true);
  assert.equal(checkPaymentMethod({ ...base, method: "bank_transfer", fulfillmentType: "PICKUP", slotStart: rome("2026-10-13T10:00") }).ok, false);
  assert.equal(checkPaymentMethod({ ...base, method: "bank_transfer", fulfillmentType: "PICKUP", slotStart: rome("2026-10-16T10:00") }).ok, true);
  assert.equal(checkPaymentMethod({ ...base, method: "card", fulfillmentType: "PICKUP", slotStart: null, stripeEnabled: false }).ok, false);
});

test("la prenotazione del bonifico scade in giorni lavorativi e prima della fascia", () => {
  const friday = rome("2026-10-16T20:00");
  assert.equal(bankTransferReservationExpiry(friday, null, DEFAULT_CHECKOUT_POLICY).toISOString(), rome("2026-10-20T20:00").toISOString());
  const slot = rome("2026-10-20T10:00");
  assert.equal(bankTransferReservationExpiry(friday, slot, DEFAULT_CHECKOUT_POLICY).toISOString(), rome("2026-10-19T10:00").toISOString());
  assert.equal(shouldSendBankTransferReminder({ now: rome("2026-10-19T21:00"), placedAt: friday, expiresAt: rome("2026-10-20T20:00"), alreadySent: false }), true);
  assert.equal(shouldSendBankTransferReminder({ now: rome("2026-10-19T21:00"), placedAt: friday, expiresAt: rome("2026-10-20T20:00"), alreadySent: true }), false);
});

test("IVA: sconto sulle sole righe idonee e spedizione pro quota per aliquota", () => {
  assert.deepEqual(allocateProportionally(100, [1, 1, 1]), [34, 33, 33]);
  const lines = [
    { grossCents: 1100, taxRateBps: 1000, discountEligible: false },
    { grossCents: 1220, taxRateBps: 2200, discountEligible: true }
  ];
  const tax = computeIncludedTax(lines, 220, 0);
  assert.deepEqual(tax.discountedLines, [1100, 1000]);
  assert.equal(tax.taxCents, 100 + 180);
  const withShipping = computeIncludedTax([{ grossCents: 1100, taxRateBps: 1000, discountEligible: true }], 0, 550);
  assert.equal(withShipping.taxCents, 150);
});

test("lo sconto per categoria indica quali righe riguarda", () => {
  const discount = makeDiscount({ scope: "CATEGORIES", categories: [{ id: "dc", discountId: "disc-test", categoryId: "c2" }] });
  const result = evaluateDiscount(discount, {
    locationId: "loc-1",
    subtotalCents: 3000,
    lines: [
      { productId: "p1", categoryId: "c1", lineCents: 2000 },
      { productId: "p2", categoryId: "c2", lineCents: 1000 }
    ],
    customerId: null
  });
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.eligibleLines, [false, true]);
});

test("P.IVA, codice fiscale e SDI con cifra di controllo", () => {
  assert.equal(isValidPartitaIva("01234567897"), true);
  assert.equal(isValidPartitaIva("IT01234567897"), true);
  assert.equal(isValidPartitaIva("01234567890"), false);
  assert.equal(isValidCodiceFiscale("RSSMRA85T10A562S"), true);
  assert.equal(isValidCodiceFiscale("RSSMRA85T10A562X"), false);
  assert.equal(isValidSdiCode("ABC1234"), true);
  assert.equal(isValidSdiCode("AB"), false);
});

test("il fresco viaggia solo nei CAP della sede, il corriere solo con prodotti spedibili", () => {
  assert.equal(isPostalCodeServed("80044", "80044, 800"), true);
  assert.equal(isPostalCodeServed("80012", "800"), true);
  assert.equal(isPostalCodeServed("20121", "800"), false);
  assert.equal(isPostalCodeServed("8004", "800"), false);
  const fresh = allowedShippingScopes({ allItemsShippable: false, postalCode: "20121", localDeliveryPostalCodes: "800" });
  assert.equal(fresh.size, 0);
  const boxed = allowedShippingScopes({ allItemsShippable: true, postalCode: "20121", localDeliveryPostalCodes: "800" });
  assert.deepEqual([...boxed], ["NATIONAL"]);
});

test("l'annullo self-service rispetta stato, anticipo e metodo di pagamento", () => {
  const now = rome("2026-10-12T10:00");
  const base = { status: "PAID", paymentStatus: "PAID", paymentProvider: "stripe", paymentMethod: "card", fulfillmentAt: rome("2026-10-14T10:00") };
  assert.equal(customerCancellation(base, now).allowed, true);
  assert.equal(customerCancellation({ ...base, fulfillmentAt: rome("2026-10-12T20:00") }, now).allowed, false);
  assert.equal(customerCancellation({ ...base, status: "PROCESSING" }, now).allowed, false);
  assert.equal(customerCancellation({ ...base, paymentProvider: "manual", paymentMethod: "bank_transfer" }, now).allowed, false);
});

test("il guard impedisce a dev/test/seed di toccare database remoti", () => {
  assert.equal(isLocalDatabaseHost("postgresql://u@localhost:5432/sessa_dev"), true);
  assert.equal(isLocalDatabaseHost("postgresql://u:p@aws-0-eu-central-1.pooler.supabase.com:6543/postgres"), false);
  assert.throws(() => assertDatabaseTargetAllowed("postgresql://u:p@db.supabase.co:5432/postgres", { NODE_ENV: "development" }));
  assert.doesNotThrow(() => assertDatabaseTargetAllowed("postgresql://u:p@db.supabase.co:5432/postgres", { NODE_ENV: "production" }));
  assert.doesNotThrow(() => assertDatabaseTargetAllowed("postgresql://u:p@db.supabase.co:5432/postgres", { NODE_ENV: "test", SESSA_ALLOW_REMOTE_DB: "1" }));
});

test("le email non trasformano testo utente in link o HTML", () => {
  assert.equal(isTrustedSiteUrl("http://localhost:3001/account/reset?token=x"), true);
  assert.equal(isTrustedSiteUrl("https://evil.example/login"), false);
  const html = renderEmailHtml("Oggetto <b>", {
    text: 'Ciao https://evil.example/"><img src=x onerror=alert(1)>\n\nsegui http://localhost:3001/ordine/SES-1',
    cta: { url: "https://evil.example/phish", label: "Apri" }
  });
  assert.equal(html.includes('href="https://evil.example'), false);
  assert.equal(html.includes("<img src=x"), false);
  assert.equal(html.includes("Oggetto &lt;b&gt;"), true);
  assert.equal(html.includes('href="http://localhost:3001/ordine/SES-1"'), true);
  const withCta = renderEmailHtml("x", { text: "Ciao", cta: { url: "http://localhost:3001/account/attiva?token=a&b=1", label: "Attiva" } });
  assert.equal(withCta.includes('href="http://localhost:3001/account/attiva?token=a&amp;b=1"'), true);
});

test("il token ordine vive in un cookie per ordine, non nell'URL", () => {
  const token = "a".repeat(32);
  assert.equal(orderTokenCookieName("SES-2026-000001"), "sessa_ot_SES-2026-000001");
  assert.equal(resolveOrderToken("SES-2026-000001", undefined, () => token), token);
  assert.equal(resolveOrderToken("SES-2026-000001", "non-valido", () => undefined), null);
  assert.equal(resolveOrderToken("SES-2026-000001", token, () => undefined), token);
});

test("Analytics riceve URL ripuliti e nessuna area personale", () => {
  assert.equal(sanitizedPageLocation("https://shop.example/sede/ottaviano?utm_source=ig&t=segreto"), "https://shop.example/sede/ottaviano?utm_source=ig");
  assert.equal(isTrackablePath("/ordine/SES-1"), false);
  assert.equal(isTrackablePath("/account/reset"), false);
  assert.equal(isTrackablePath("/sede/ottaviano"), true);
});

test("gli alias email non aggirano l'anti auto-invito del referral", () => {
  assert.equal(canonicalEmailIdentity("Nome.Cognome+1@gmail.com"), canonicalEmailIdentity("nomecognome@googlemail.com"));
  assert.notEqual(canonicalEmailIdentity("nome.cognome@libero.it"), canonicalEmailIdentity("nomecognome@libero.it"));
});

test("rotazione del segreto: dati cifrati e codici di recupero restano validi", () => {
  const original = { current: process.env.SESSION_SECRET, previous: process.env.SESSION_SECRET_PREVIOUS };
  try {
    process.env.SESSION_SECRET = "vecchio-segreto-di-test-lungo-almeno-32-caratteri";
    delete process.env.SESSION_SECRET_PREVIOUS;
    const envelope = encryptSensitiveValue("JBSWY3DPEHPK3PXP");
    const oldBackupHash = hashBackupCode("ABCD-EFGH");
    const signature = signLink("unsubscribe", "cust-1");

    process.env.SESSION_SECRET = "nuovo-segreto-di-test-lungo-almeno-32-caratteri!";
    process.env.SESSION_SECRET_PREVIOUS = "vecchio-segreto-di-test-lungo-almeno-32-caratteri";
    assert.equal(decryptSensitiveValue(envelope), "JBSWY3DPEHPK3PXP");
    assert.equal(isCurrentEnvelope(envelope), false);
    const refreshed = refreshEncryptedValue(envelope);
    assert.equal(isCurrentEnvelope(refreshed), true);
    assert.ok(backupCodeHashCandidates("abcd-efgh").includes(oldBackupHash));
    assert.equal(verifyLink("unsubscribe", "cust-1", signature), true);
    assert.equal(verifyLink("unsubscribe", "cust-2", signature), false);

    delete process.env.SESSION_SECRET_PREVIOUS;
    assert.equal(decryptSensitiveValue(refreshed), "JBSWY3DPEHPK3PXP");
    assert.throws(() => decryptSensitiveValue(envelope));
  } finally {
    process.env.SESSION_SECRET = original.current;
    if (original.previous === undefined) delete process.env.SESSION_SECRET_PREVIOUS;
    else process.env.SESSION_SECRET_PREVIOUS = original.previous;
  }
});

test("l'IP client ignora cf-connecting-ip se Cloudflare non è dichiarato", () => {
  const headers = new Headers({ "x-nf-client-connection-ip": "203.0.113.5", "cf-connecting-ip": "198.51.100.9" });
  assert.equal(clientIpFromHeaders(headers, {} as NodeJS.ProcessEnv), "203.0.113.5");
  assert.equal(clientIpFromHeaders(headers, { TRUSTED_PROXY: "cloudflare" } as unknown as NodeJS.ProcessEnv), "198.51.100.9");
});
