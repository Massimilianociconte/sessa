/**
 * Throttle anti-brute-force per il login, in memoria di processo.
 * Adeguato a un deployment a istanza singola (tipico per questo negozio).
 * In produzione multi-istanza sostituire con uno store condiviso (Redis/DB).
 *
 * La chiave combina IP + email: un attaccante da un IP viene bloccato senza
 * poter chiudere fuori l'admin legittimo che accede da un altro IP.
 */
type Attempt = { count: number; firstAt: number; blockedUntil: number };

const attempts = new Map<string, Attempt>();

const WINDOW_MS = 15 * 60 * 1000; // finestra di conteggio
const MAX_ATTEMPTS = 8; // tentativi falliti prima del blocco
const BLOCK_MS = 15 * 60 * 1000; // durata del blocco

/** Ritorna i millisecondi residui di blocco, o null se il tentativo è ammesso. */
export function isRateLimited(key: string): number | null {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry) return null;
  if (entry.blockedUntil > now) return entry.blockedUntil - now;
  // Finestra scaduta: azzera il conteggio.
  if (now - entry.firstAt > WINDOW_MS) {
    attempts.delete(key);
    return null;
  }
  return null;
}

export function registerFailedAttempt(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now, blockedUntil: 0 });
    return;
  }
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.blockedUntil = now + BLOCK_MS;
  }
}

export function clearAttempts(key: string): void {
  attempts.delete(key);
}
