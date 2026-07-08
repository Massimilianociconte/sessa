import { prisma } from "@/lib/db";

/**
 * Throttle anti-brute-force per login e azioni sensibili.
 *
 * Store primario: Postgres (tabella RateLimitEntry) — condiviso tra tutte le
 * lambda: su serverless la memoria di processo si azzera a ogni cold start e
 * non è condivisa tra istanze, quindi da sola non protegge davvero.
 * Fallback: memoria di processo se il database non risponde (fail-open sul
 * DB, ma il tentativo resta comunque contato localmente).
 *
 * La chiave combina IP + email: un attaccante da un IP viene bloccato senza
 * poter chiudere fuori l'utente legittimo che accede da un altro IP.
 */
type Attempt = { count: number; firstAt: number; blockedUntil: number };

const memoryAttempts = new Map<string, Attempt>();

const WINDOW_MS = 15 * 60 * 1000; // finestra di conteggio
const MAX_ATTEMPTS = 8; // tentativi falliti prima del blocco
const BLOCK_MS = 15 * 60 * 1000; // durata del blocco
const PRUNE_AFTER_MS = 24 * 60 * 60 * 1000; // pulizia voci vecchie

function memoryIsLimited(key: string, now: number): number | null {
  const entry = memoryAttempts.get(key);
  if (!entry) return null;
  if (entry.blockedUntil > now) return entry.blockedUntil - now;
  if (now - entry.firstAt > WINDOW_MS) memoryAttempts.delete(key);
  return null;
}

function memoryRegisterFailure(key: string, now: number): void {
  const entry = memoryAttempts.get(key);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    memoryAttempts.set(key, { count: 1, firstAt: now, blockedUntil: 0 });
    return;
  }
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) entry.blockedUntil = now + BLOCK_MS;
}

/** Ritorna i millisecondi residui di blocco, o null se il tentativo è ammesso. */
export async function isRateLimited(key: string): Promise<number | null> {
  const now = Date.now();
  const memoryBlock = memoryIsLimited(key, now);
  if (memoryBlock !== null) return memoryBlock;
  try {
    const entry = await prisma.rateLimitEntry.findUnique({ where: { key } });
    if (!entry) return null;
    if (entry.blockedUntil && entry.blockedUntil.getTime() > now) {
      return entry.blockedUntil.getTime() - now;
    }
    return null;
  } catch {
    // DB non raggiungibile: resta solo la protezione in memoria locale.
    return null;
  }
}

export async function registerFailedAttempt(key: string): Promise<void> {
  const now = Date.now();
  memoryRegisterFailure(key, now);
  try {
    // 1. Finestra scaduta → riparte il conteggio (update condizionale, niente race).
    await prisma.rateLimitEntry.updateMany({
      where: { key, firstAt: { lt: new Date(now - WINDOW_MS) } },
      data: { count: 0, firstAt: new Date(now), blockedUntil: null }
    });
    // 2. Conta il fallimento (upsert nativo: sicuro sotto concorrenza).
    const entry = await prisma.rateLimitEntry.upsert({
      where: { key },
      create: { key, count: 1, firstAt: new Date(now) },
      update: { count: { increment: 1 } }
    });
    // 3. Soglia raggiunta → blocco.
    if (entry.count >= MAX_ATTEMPTS && !entry.blockedUntil) {
      await prisma.rateLimitEntry.update({
        where: { key },
        data: { blockedUntil: new Date(now + BLOCK_MS) }
      });
    }
    // Pulizia opportunistica (economica: usa l'indice su updatedAt).
    if (entry.count === 1) {
      await prisma.rateLimitEntry
        .deleteMany({ where: { updatedAt: { lt: new Date(now - PRUNE_AFTER_MS) } } })
        .catch(() => null);
    }
  } catch {
    // Fallback già registrato in memoria.
  }
}

export async function clearAttempts(key: string): Promise<void> {
  memoryAttempts.delete(key);
  await prisma.rateLimitEntry.deleteMany({ where: { key } }).catch(() => null);
}
