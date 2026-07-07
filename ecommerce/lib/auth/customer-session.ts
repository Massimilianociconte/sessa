import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { CUSTOMER_SESSION_COOKIE } from "@/lib/auth/constants";

const SESSION_DAYS = 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Crea la sessione cliente a DB e imposta il cookie (solo l'hash del token tocca il DB). */
export async function createCustomerSession(customerId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.customerSession.create({ data: { tokenHash: hashToken(token), customerId, expiresAt } });
  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt
  });
}

export async function destroyCustomerSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;
  if (token) await prisma.customerSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  cookieStore.delete(CUSTOMER_SESSION_COOKIE);
}

export async function destroyAllCustomerSessions(customerId: string): Promise<void> {
  await prisma.customerSession.deleteMany({ where: { customerId } });
  const cookieStore = await cookies();
  cookieStore.delete(CUSTOMER_SESSION_COOKIE);
}

export type SessionCustomer = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  referralCode: string | null;
};

export const getSessionCustomer = cache(async (): Promise<SessionCustomer | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.customerSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { customer: true }
  });
  if (!session || session.expiresAt < new Date()) return null;
  const { id, email, firstName, lastName, phone, referralCode } = session.customer;
  return { id, email, firstName, lastName, phone, referralCode };
});

export async function requireCustomer(): Promise<SessionCustomer> {
  const customer = await getSessionCustomer();
  if (!customer) throw new Error("Non autorizzato: accesso cliente richiesto.");
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
  return prisma.customerSession.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      expiresAt: true
    }
  });
}
