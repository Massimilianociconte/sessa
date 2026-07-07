import { manualProvider } from "./manual";
import { stripeProvider } from "./stripe";
import type { PaymentProvider } from "./types";

const providers: Record<string, PaymentProvider> = {
  [manualProvider.id]: manualProvider,
  [stripeProvider.id]: stripeProvider
};

export function getPaymentProvider(id: string): PaymentProvider {
  return providers[id] ?? manualProvider;
}

/** Provider da usare in base al metodo di pagamento scelto dal cliente. */
export function providerForMethod(method: string | null | undefined): string {
  return method === "card" ? "stripe" : "manual";
}

export { isStripeConfigured } from "./stripe";
export type { PaymentProvider } from "./types";
