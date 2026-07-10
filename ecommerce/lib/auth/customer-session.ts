import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/auth/constants";
import { getRequestSecurityContext } from "@/lib/auth/request-context";

const SESSION_DAYS = 30;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const MAX_SESSIONS_PER_CUSTOMER = 20;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function currentSessionTokenHash(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

/** Crea la sessione cliente a DB e imposta il cookie (solo l'hash del token tocca il DB). */
export async function createCustomerSession(customerId: string) {
  const token = randomBytes(32).toString("hex");
  const context = await getRequestSecurityContext();
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
  const overflow = await prisma.customerSession.findMany({
    where: { customerId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: MAX_SESSIONS_PER_CUSTOMER,
    select: { id: true }
  });
  if (overflow.length > 0) {
    await prisma.customerSession.deleteMany({
      where: { id: { in: overflow.map((item) => item.id) } }
    });
  }
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
  }
  cookieStore.delete(CUSTOMER_SESSION_COOKIE);
}

export async function destroyAllCustomerSessions(customerId: string): Promise<void> {
  await prisma.customerSession.deleteMany({ where: { customerId } });
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
}

export async function destroyCustomerSessionById(customerId: string, sessionId: string): Promise<"current" | "other" | "missing"> {
  const tokenHash = await currentSessionTokenHash();
  const target = await prisma.customerSession.findFirst({
    where: { id: sessionId, customerId },
    select: { tokenHash: true }
  });
  if (!target) return "missing";

  await prisma.customerSession.deleteMany({ where: { id: sessionId, customerId } });
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
  // Nessuna cache cross-request: logout/reset/revoca devono essere immediati
  // anche quando la richiesta successiva atterra sulla stessa lambda calda.
  const context = await getRequestSecurityContext();
  const session = await prisma.customerSession.findUnique({
    where: { tokenHash },
    include: { customer: true }
  });
  if (!session || session.expiresAt < new Date() || session.customer.anonymizedAt) return null;
  const lastSeenAt = session.lastSeenAt ?? session.createdAt;

  if (Date.now() - lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
    const touched = await prisma.customerSession.updateMany({
      where: { id: session.id, tokenHash, expiresAt: { gt: new Date() } },
      data: {
        lastSeenAt: new Date(),
        userAgent: context.userAgent ?? session.userAgent,
        ipAddress: context.ipAddress ?? session.ipAddress
      }
    });
    if (touched.count !== 1) return null;
  }

  const { id, email, firstName, lastName, phone, referralCode, emailVerified } = session.customer;
  return { id, email, firstName, lastName, phone, referralCode, emailVerified };
});

export async function requireCustomer(nextPath = "/account"): Promise<SessionCustomer> {
  const customer = await getSessionCustomer();
  if (!customer) {
    redirect(`/account/login?expired=1&next=${encodeURIComponent(nextPath)}`);
  }
  return customer;
}

/** Invalida tutte le sessioni del cliente e ne apre una nuova (dopo cambio password). */
export async function rotateCustomerSessions(customerId: string): Promise<void> {
  await prisma.customerSession.deleteMany({ where: { customerId } });
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
