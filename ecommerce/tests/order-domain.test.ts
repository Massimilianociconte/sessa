import assert from "node:assert/strict";
import test from "node:test";
import { assertOrderTransitionAllowed, DomainError, STOCK_HOLDING_STATUSES } from "../lib/domain";

test("un ordine cash confermato puo entrare in preparazione senza risultare pagato", () => {
  assert.doesNotThrow(() =>
    assertOrderTransitionAllowed({
      from: "CONFIRMED",
      to: "PROCESSING",
      paymentStatus: "PENDING",
      fulfillmentType: "PICKUP"
    })
  );
});

test("un ordine pagato non puo essere annullato senza rimborso", () => {
  assert.throws(
    () =>
      assertOrderTransitionAllowed({
        from: "PROCESSING",
        to: "CANCELLED",
        paymentStatus: "PAID",
        fulfillmentType: "PICKUP"
      }),
    DomainError
  );
});

test("gli stati READY e SHIPPED rispettano la modalita di evasione", () => {
  assert.throws(
    () =>
      assertOrderTransitionAllowed({
        from: "PROCESSING",
        to: "READY",
        paymentStatus: "PENDING",
        fulfillmentType: "DELIVERY"
      }),
    DomainError
  );
  assert.throws(
    () =>
      assertOrderTransitionAllowed({
        from: "PROCESSING",
        to: "SHIPPED",
        paymentStatus: "PENDING",
        fulfillmentType: "PICKUP"
      }),
    DomainError
  );
});

test("il rimborso richiede un pagamento acquisito", () => {
  assert.throws(
    () =>
      assertOrderTransitionAllowed({
        from: "CONFIRMED",
        to: "REFUNDED",
        paymentStatus: "PENDING",
        fulfillmentType: "PICKUP"
      }),
    DomainError
  );
});

test("un ritiro o una consegna non pagati si possono annullare dopo READY o SHIPPED", () => {
  assert.doesNotThrow(() =>
    assertOrderTransitionAllowed({
      from: "READY",
      to: "CANCELLED",
      paymentStatus: "PENDING",
      fulfillmentType: "PICKUP"
    })
  );
  assert.doesNotThrow(() =>
    assertOrderTransitionAllowed({
      from: "SHIPPED",
      to: "CANCELLED",
      paymentStatus: "PENDING",
      fulfillmentType: "DELIVERY"
    })
  );
});

test("un ordine READY pagato non si annulla: va rimborsato", () => {
  assert.throws(
    () =>
      assertOrderTransitionAllowed({
        from: "READY",
        to: "CANCELLED",
        paymentStatus: "PAID",
        fulfillmentType: "PICKUP"
      }),
    DomainError
  );
});

test("un pagamento arrivato su un ordine gia cancellato si puo rimborsare", () => {
  assert.doesNotThrow(() =>
    assertOrderTransitionAllowed({
      from: "CANCELLED",
      to: "REFUNDED",
      paymentStatus: "PAID",
      fulfillmentType: "PICKUP"
    })
  );
});

test("uno SHIPPED tiene ancora lo stock, cosi un rimborso puo riassegnarlo", () => {
  assert.equal(STOCK_HOLDING_STATUSES.includes("SHIPPED"), true);
  assert.equal(STOCK_HOLDING_STATUSES.includes("READY"), true);
  assert.equal(STOCK_HOLDING_STATUSES.includes("DELIVERED"), false);
});

test("un rimborso parziale si puo chiudere con un rimborso totale e non si puo annullare", () => {
  assert.doesNotThrow(() =>
    assertOrderTransitionAllowed({
      from: "PAID",
      to: "REFUNDED",
      paymentStatus: "PARTIALLY_REFUNDED",
      fulfillmentType: "PICKUP"
    })
  );
  assert.throws(
    () =>
      assertOrderTransitionAllowed({
        from: "PAID",
        to: "CANCELLED",
        paymentStatus: "PARTIALLY_REFUNDED",
        fulfillmentType: "PICKUP"
      }),
    DomainError
  );
});
