import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { checkoutSchema } from "@/lib/validation";
import { addItemToCart, getCartByToken, getOrCreateCartForLocation } from "@/lib/services/cart";
import { getSlotOptions } from "@/lib/services/fulfillment-slots";
import { beginRegistration, completeRegistration } from "@/lib/services/registration";

/** Sede aperta 24/7: le fasce disponibili non dipendono dall'ora del test. */
export const ALL_DAY_HOURS =
  '{"mon":[["00:00","24:00"]],"tue":[["00:00","24:00"]],"wed":[["00:00","24:00"]],"thu":[["00:00","24:00"]],"fri":[["00:00","24:00"]],"sat":[["00:00","24:00"]],"sun":[["00:00","24:00"]]}';

export function assertTestDatabase(): void {
  assert.match(process.env.DATABASE_URL ?? "", /sessa_test/, "i test di integrazione girano solo su sessa_test");
}

export async function assertDomainError(promise: Promise<unknown>, code?: string): Promise<DomainError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof DomainError, `atteso DomainError, ricevuto ${String(error)}`);
    if (code) assert.equal(error.code, code, error.message);
    return error;
  }
  assert.fail("Era atteso un DomainError");
}

export async function stockOf(storeVariantId: string): Promise<number> {
  return (await prisma.storeVariant.findUniqueOrThrow({ where: { id: storeVariantId } })).stockQty;
}

export async function newCart(locationId: string, storeVariantId: string, qty = 1) {
  const token = randomBytes(24).toString("hex");
  const cart = await getOrCreateCartForLocation(token, locationId);
  await addItemToCart(cart.id, storeVariantId, qty);
  const loaded = await getCartByToken(token);
  assert.ok(loaded);
  return loaded;
}

/** Chiavi delle fasce libere della sede, dalla più vicina. */
export async function slotKeys(locationId: string): Promise<string[]> {
  const location = await prisma.location.findUniqueOrThrow({ where: { id: locationId } });
  const { days } = await getSlotOptions(location, 0);
  return days.flatMap((day) => day.slots.filter((slot) => !slot.full).map((slot) => slot.key));
}

export function checkoutInput(overrides: Record<string, unknown> = {}) {
  return checkoutSchema.parse({
    email: `cliente-${randomBytes(4).toString("hex")}@example.com`,
    phone: "333 123 4567",
    firstName: "Ada",
    lastName: "Lovelace",
    fulfillmentType: "PICKUP",
    paymentMethod: "cash_on_pickup",
    acceptTerms: "on",
    checkoutIdempotencyKey: randomBytes(24).toString("hex"),
    ...overrides
  });
}

/** Registrazione completa come farebbe il cliente: richiesta + link email. */
export async function registerAccount(email: string, firstName = "Anna", lastName = "Verdi", password = "passwordlunga1") {
  const started = await beginRegistration({ email, firstName, lastName });
  assert.ok(started.devLink, "link di attivazione atteso");
  const token = new URL(started.devLink).searchParams.get("token");
  assert.ok(token);
  return (await completeRegistration(token, password)).customerId;
}
