import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/auth/constants";
import { invalidateMemo, memoTtl } from "@/lib/ttl-cache";

// Memo breve della sessione per istanza lambda: il DB è in un'altra regione e
// questa è LA query pagata da ogni pagina/action autenticata. Ogni revoca
// invalida la cache dell'istanza; su altre istanze una sessione revocata può
// sopravvivere al massimo SESSION_MEMO_TTL_MS (finestra accettata, vedi docs).
const SESSION_MEMO_TTL_MS = 20_000;

const SESSION_DAYS = 30;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const MAX_USER_AGENT_LENGTH = 500;
const MAX_IP_LENGTH = 80;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function trimNullable(value: string | null, max: number): string | null {
  const clean = value?.trim();
  if (!clean) return null;
  return clean.slice(0, max);
}

async function getRequestSessionContext() {
  const h = await headers();
  return {
    userAgent: trimNullable(h.get("user-agent"), MAX_USER_AGENT_LENGTH),
    ipAddress: trimNullable(h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "local", MAX_IP_LENGTH)
  };
}

async function currentSessionTokenHash(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

/** Crea la sessione cliente a DB e imposta il cookie (solo l'hash del token tocca il DB). */
export async function createCustomerSession(customerId: string) {
  const token = randomBytes(32).toString("hex");
  const context = await getRequestSessionContext();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const session = await prisma.customerSession.create({
    data: {
      tokenHash: hashToken(token),
      customerId,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      lastSeenAt: new Date(),
      expiresAt
    },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      lastSeenAt: true,
      expiresAt: true,
      createdAt: true
    }
  });
  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt
  });
  return session;
}

export async function destroyCustomerSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;
  if (token) {
    await prisma.customerSession.deleteMany({ where: { tokenHash: hashToken(token) } });
    invalidateMemo(`sess:${hashToken(token)}`);
  }
  cookieStore.delete(CUSTOMER_SESSION_COOKIE);
}

export async function destroyAllCustomerSessions(customerId: string): Promise<void> {
  await prisma.customerSession.deleteMany({ where: { customerId } });
  invalidateMemo("sess:");
  const cookieStore = await cookies();
  cookieStore.delete(CUSTOMER_SESSION_COOKIE);
}

export async function destroyOtherCustomerSessions(customerId: string): Promise<void> {
  const tokenHash = await currentSessionTokenHash();
  if (!tokenHash) {
    await destroyAllCustomerSessions(customerId);
    return;
  }
  await prisma.customerSession.deleteMany({
    where: {
      customerId,
      NOT: { tokenHash }
    }
  });
  invalidateMemo("sess:");
}

export async function destroyCustomerSessionById(customerId: string, sessionId: string): Promise<"current" | "other" | "missing"> {
  const tokenHash = await currentSessionTokenHash();
  const target = await prisma.customerSession.findFirst({
    where: { id: sessionId, customerId },
    select: { tokenHash: true }
  });
  if (!target) return "missing";

  await prisma.customerSession.deleteMany({ where: { id: sessionId, customerId } });
  invalidateMemo(`sess:${target.tokenHash}`);
  if (target.tokenHash === tokenHash) {
    const cookieStore = await cookies();
    cookieStore.delete(CUSTOMER_SESSION_COOKIE);
    return "current";
  }
  return "other";
}

export type SessionCustomer = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  referralCode: string | null;
  emailVerified: boolean;
};

export const getSessionCustomer = cache(async (): Promise<SessionCustomer | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = hashToken(token);
  // Il touch di lastSeenAt avviene solo sul miss del memo: la risoluzione
  // effettiva resta ~TOUCH_INTERVAL + TTL, più che sufficiente per l'elenco
  // dispositivi della sezione Sicurezza.
  const context = await getRequestSessionContext();
  return memoTtl(`sess:${tokenHash}`, SESSION_MEMO_TTL_MS, async () => {
    const session = await prisma.customerSession.findUnique({
      where: { tokenHash },
      include: { customer: true }
    });
    if (!session || session.expiresAt < new Date()) return null;
    const lastSeenAt = session.lastSeenAt ?? session.createdAt;

    if (Date.now() - lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
      await prisma.customerSession.update({
        where: { id: session.id },
        data: {
          lastSeenAt: new Date(),
          userAgent: context.userAgent ?? session.userAgent,
          ipAddress: context.ipAddress ?? session.ipAddress
        }
      });
    }

    const { id, email, firstName, lastName, phone, referralCode, emailVerified } = session.customer;
    return { id, email, firstName, lastName, phone, referralCode, emailVerified };
  });
});

export async function requireCustomer(): Promise<SessionCustomer> {
  const customer = await getSessionCustomer();
  if (!customer) throw new Error("Non autorizzato: accesso cliente richiesto.");
  return customer;
}

/** Invalida tutte le sessioni del cliente e ne apre una nuova (dopo cambio password). */
export async function rotateCustomerSessions(customerId: string): Promise<void> {
  await prisma.customerSession.deleteMany({ where: { customerId } });
  invalidateMemo("sess:");
  await createCustomerSession(customerId);
}

export async function pruneExpiredCustomerSessions(): Promise<void> {
  await prisma.customerSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

export async function listCustomerSessions(customerId: string) {
  await pruneExpiredCustomerSessions();
  const tokenHash = await currentSessionTokenHash();
  const sessions = await prisma.customerSession.findMany({
    where: { customerId },
    orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      tokenHash: true,
      userAgent: true,
      ipAddress: true,
      lastSeenAt: true,
      createdAt: true,
      expiresAt: true
    }
  });
  return sessions.map(({ tokenHash: sessionTokenHash, ...session }) => ({
    ...session,
    isCurrent: Boolean(tokenHash && sessionTokenHash === tokenHash)
  }));
}
