import assert from "node:assert/strict";
import test from "node:test";
import {
  assertOrderTransitionAllowed,
  DomainError,
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  STOCK_HOLDING_STATUSES,
  type OrderStatus
} from "@/lib/domain";

function allow(input: Parameters<typeof assertOrderTransitionAllowed>[0]) {
  assert.doesNotThrow(() => assertOrderTransitionAllowed(input));
}

function deny(input: Parameters<typeof assertOrderTransitionAllowed>[0]) {
  assert.throws(() => assertOrderTransitionAllowed(input), DomainError);
}

test("la macchina a stati elenca ogni stato e REFUNDED e terminale", () => {
  assert.deepEqual(Object.keys(ORDER_TRANSITIONS).sort(), [...ORDER_STATUSES].sort());
  assert.deepEqual(ORDER_TRANSITIONS.REFUNDED, []);
  for (const from of ORDER_STATUSES) {
    for (const to of ORDER_TRANSITIONS[from]) {
      assert.ok((ORDER_STATUSES as readonly string[]).includes(to), `${from} → ${to} deve essere uno stato noto`);
    }
  }
});

test("gli stati che trattengono stock includono SHIPPED e escludono DELIVERED", () => {
  const holding = new Set(STOCK_HOLDING_STATUSES);
  for (const status of ["PENDING_PAYMENT", "CONFIRMED", "PAID", "PROCESSING", "READY", "SHIPPED"] as OrderStatus[]) {
    assert.equal(holding.has(status), true, status);
  }
  assert.equal(holding.has("DELIVERED"), false);
  assert.equal(holding.has("CANCELLED"), false);
  assert.equal(holding.has("REFUNDED"), false);
});

test("un ritiro cash confermato puo avanzare senza risultare pagato", () => {
  allow({ from: "CONFIRMED", to: "PROCESSING", paymentStatus: "PENDING", fulfillmentType: "PICKUP" });
  allow({ from: "PROCESSING", to: "READY", paymentStatus: "PENDING", fulfillmentType: "PICKUP" });
  allow({ from: "READY", to: "DELIVERED", paymentStatus: "PENDING", fulfillmentType: "PICKUP" });
});

test("READY e SHIPPED rispettano ritiro e consegna", () => {
  deny({ from: "PROCESSING", to: "READY", paymentStatus: "PAID", fulfillmentType: "DELIVERY" });
  deny({ from: "PROCESSING", to: "SHIPPED", paymentStatus: "PAID", fulfillmentType: "PICKUP" });
  allow({ from: "PROCESSING", to: "READY", paymentStatus: "PAID", fulfillmentType: "PICKUP" });
  allow({ from: "PROCESSING", to: "SHIPPED", paymentStatus: "PAID", fulfillmentType: "DELIVERY" });
});

test("un pagamento acquisito non si annulla: va rimborsato", () => {
  deny({ from: "PAID", to: "CANCELLED", paymentStatus: "PAID", fulfillmentType: "PICKUP" });
  deny({ from: "PROCESSING", to: "CANCELLED", paymentStatus: "PAID", fulfillmentType: "PICKUP" });
  deny({ from: "READY", to: "CANCELLED", paymentStatus: "PAID", fulfillmentType: "PICKUP" });
  deny({ from: "PAID", to: "CANCELLED", paymentStatus: "PARTIALLY_REFUNDED", fulfillmentType: "PICKUP" });
  allow({ from: "PAID", to: "REFUNDED", paymentStatus: "PAID", fulfillmentType: "PICKUP" });
  allow({ from: "PAID", to: "REFUNDED", paymentStatus: "PARTIALLY_REFUNDED", fulfillmentType: "PICKUP" });
});

test("un ordine non pagato si puo annullare anche dopo READY o SHIPPED, ma non rimborsare", () => {
  allow({ from: "READY", to: "CANCELLED", paymentStatus: "PENDING", fulfillmentType: "PICKUP" });
  allow({ from: "SHIPPED", to: "CANCELLED", paymentStatus: "PENDING", fulfillmentType: "DELIVERY" });
  deny({ from: "CONFIRMED", to: "REFUNDED", paymentStatus: "PENDING", fulfillmentType: "PICKUP" });
  deny({ from: "PENDING_PAYMENT", to: "REFUNDED", paymentStatus: "PENDING", fulfillmentType: "PICKUP" });
});

test("un pagamento arrivato su un ordine gia cancellato si puo rimborsare", () => {
  allow({ from: "CANCELLED", to: "REFUNDED", paymentStatus: "PAID", fulfillmentType: "PICKUP" });
  deny({ from: "CANCELLED", to: "REFUNDED", paymentStatus: "PENDING", fulfillmentType: "PICKUP" });
  deny({ from: "REFUNDED", to: "CANCELLED", paymentStatus: "REFUNDED", fulfillmentType: "PICKUP" });
});

test("saltare stati o tornare indietro non e ammesso", () => {
  deny({ from: "PENDING_PAYMENT", to: "PROCESSING", paymentStatus: "PENDING", fulfillmentType: "PICKUP" });
  deny({ from: "PAID", to: "READY", paymentStatus: "PAID", fulfillmentType: "PICKUP" });
  deny({ from: "DELIVERED", to: "PROCESSING", paymentStatus: "PAID", fulfillmentType: "PICKUP" });
  deny({ from: "CONFIRMED", to: "PAID", paymentStatus: "PENDING", fulfillmentType: "PICKUP" });
});
