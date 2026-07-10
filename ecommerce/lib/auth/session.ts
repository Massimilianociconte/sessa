import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import {
  hasAdminCapability,
  isAdminRole,
  type AdminCapability
} from "@/lib/auth/admin-authorization";
import type { AdminRole } from "@/lib/domain";
import { getRequestSecurityContext } from "@/lib/auth/request-context";

export { SESSION_COOKIE };
const SESSION_DAYS = 7;
const MAX_SESSIONS_PER_ADMIN = 10;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Crea la sessione a DB e imposta il cookie. Nel DB va solo l'hash del token. */
export async function createSession(userId: string, userAgent?: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const context = userAgent === undefined ? await getRequestSecurityContext() : null;
  await prisma.adminSession.create({
    data: { tokenHash: hashToken(token), userId, expiresAt, userAgent: userAgent ?? context?.userAgent }
  });
  const overflow = await prisma.adminSession.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: MAX_SESSIONS_PER_ADMIN,
    select: { id: true }
  });
  if (overflow.length > 0) {
    await prisma.adminSession.deleteMany({ where: { id: { in: overflow.map((item) => item.id) } } });
  }
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  cookieStore.delete(SESSION_COOKIE);
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
};

/**
 * Utente della sessione corrente, o null. Cache per-request:
 * layout e actions nella stessa richiesta non ripetono la query.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true }
  });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) {
    return null;
  }
  const { id, email, name, role } = session.user;
  if (!isAdminRole(role)) return null;
  return { id, email, name, role };
});

/** Da chiamare in testa a OGNI server action admin. Lancia se non autenticato. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/admin/login?expired=1");
  }
  return user;
}

export async function requireAdminCapability(capability: AdminCapability): Promise<SessionUser> {
  const user = await requireAdmin();
  if (!hasAdminCapability(user.role, capability)) {
    redirect(`/admin?denied=${encodeURIComponent("Permessi insufficienti per questa operazione.")}`);
  }
  return user;
}

/** Pulizia sessioni scadute (richiamata al login, costo trascurabile). */
export async function pruneExpiredSessions(): Promise<void> {
  await prisma.adminSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

/**
 * Rotazione totale: elimina tutte le sessioni dell'utente (logout globale) e
 * ne apre una nuova per il browser corrente. Usata dopo il cambio password,
 * così eventuali sessioni rubate restano invalidate.
 */
export async function rotateSessionsForUser(userId: string): Promise<void> {
  await prisma.adminSession.deleteMany({ where: { userId } });
  await createSession(userId);
}
