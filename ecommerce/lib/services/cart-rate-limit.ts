import { createHmac } from "node:crypto";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";

type Limit = { max: number; windowMs: number; blockMs: number };

const LIMITS: Record<"mutation" | "discount" | "giftcard" | "checkout", Limit> = {
  mutation: { max: 120, windowMs: 5 * 60_000, blockMs: 5 * 60_000 },
  discount: { max: 30, windowMs: 15 * 60_000, blockMs: 15 * 60_000 },
  giftcard: { max: 10, windowMs: 15 * 60_000, blockMs: 30 * 60_000 },
  checkout: { max: 5, windowMs: 15 * 60_000, blockMs: 30 * 60_000 }
};

function digest(value: string): string {
  const key = process.env.SESSION_SECRET ?? "sessa-rate-limit-development-only";
  return createHmac("sha256", key).update(value).digest("hex").slice(0, 32);
}

function requestIp(headers: Headers): string {
  const value =
    headers.get("x-nf-client-connection-ip") ||
    headers.get("cf-connecting-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0] ||
    headers.get("x-real-ip") ||
    "unknown";
  return value.trim().toLowerCase().slice(0, 80);
}

async function consume(key: string, limit: Limit): Promise<number | null> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - limit.windowMs);
  const existing = await prisma.rateLimitEntry.findUnique({ where: { key } });
  if (existing?.blockedUntil && existing.blockedUntil > now) {
    return existing.blockedUntil.getTime() - now.getTime();
  }
  if (existing?.blockedUntil && existing.blockedUntil <= now) {
    await prisma.rateLimitEntry.updateMany({
      where: { key, blockedUntil: { lte: now } },
      data: { count: 0, firstAt: now, blockedUntil: null }
    });
  }
  await prisma.rateLimitEntry.updateMany({
    where: { key, firstAt: { lt: windowStart } },
    data: { count: 0, firstAt: now, blockedUntil: null }
  });
  const entry = await prisma.rateLimitEntry.upsert({
    where: { key },
    create: { key, count: 1, firstAt: now },
    update: { count: { increment: 1 } }
  });
  if (entry.count <= limit.max) return null;
  const blockedUntil = new Date(now.getTime() + limit.blockMs);
  await prisma.rateLimitEntry.update({ where: { key }, data: { blockedUntil } });
  return limit.blockMs;
}

/** Limite persistente per IP e, quando presente, per cookie cart (mai IP in chiaro a DB). */
export async function enforceCartRateLimit(
  headers: Headers,
  token: string | null | undefined,
  kind: "mutation" | "discount" | "giftcard" | "checkout" = "mutation"
): Promise<void> {
  const limit = LIMITS[kind];
  const keys = [`cart:${kind}:ip:${digest(requestIp(headers))}`];
  if (token) keys.push(`cart:${kind}:token:${digest(token)}`);
  for (const key of keys) {
    try {
      const retryAfter = await consume(key, limit);
      if (retryAfter !== null) {
        throw new DomainError(
          `Troppi tentativi. Riprova tra ${Math.max(1, Math.ceil(retryAfter / 60_000))} minuti.`,
          "RATE_LIMITED"
        );
      }
    } catch (error) {
      if (error instanceof DomainError) throw error;
      // Se il DB e temporaneamente indisponibile, il normale flusso cart dara
      // comunque un errore; il limiter non deve trasformarlo in un outage certo.
    }
  }
}
