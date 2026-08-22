export type VelocityInput = {
  now: number;
  recentByEmail: number;
  recentByIp: number;
  emailWindowMinutes: number;
  ipWindowMinutes: number;
  emailLimit: number;
  ipLimit: number;
};

export type VelocityDecision = { ok: true } | { ok: false; reason: string };

/** Blocca burst di checkout dallo stesso email o IP prima di creare un ordine. */
export function assessCheckoutVelocity(input: VelocityInput): VelocityDecision {
  if (input.recentByEmail >= input.emailLimit) {
    return {
      ok: false,
      reason: `Troppi ordini da questo account negli ultimi ${input.emailWindowMinutes} minuti. Attendi o contatta la sede.`
    };
  }
  if (input.recentByIp >= input.ipLimit) {
    return {
      ok: false,
      reason: `Troppi ordini da questa rete negli ultimi ${input.ipWindowMinutes} minuti.`
    };
  }
  return { ok: true };
}

export const DEFAULT_CHECKOUT_VELOCITY = {
  emailWindowMinutes: 15,
  ipWindowMinutes: 15,
  emailLimit: 3,
  ipLimit: 8
} as const;
