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
import { DomainError } from "@/lib/domain";
import { getRequestSecurityContext } from "@/lib/auth/request-context";

export { SESSION_COOKIE };
const SESSION_DAYS = 7;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const MAX_SESSIONS_PER_ADMIN = 10;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Crea la sessione a DB e imposta il cookie. Nel DB va solo l'hash del token. */
async function currentSessionTokenHash(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

export async function createSession(
  userId: string,
  userAgent?: string,
  twoFactorVerified = false
): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const context = await getRequestSecurityContext();
  await prisma.adminSession.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      userAgent: userAgent ?? context.userAgent,
      ipAddress: context.ipAddress,
      lastSeenAt: new Date(),
      twoFactorVerifiedAt: twoFactorVerified ? new Date() : null
    }
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
  scopeAllLocations: boolean;
  locationIds: string[];
  twoFactorEnabled: boolean;
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
    include: { user: { include: { locationScopes: { select: { locationId: true } } } } }
  });
  if (!session || session.expiresAt < new Date() || !session.user.isActive) {
    return null;
  }
  const { id, email, name, role, scopeAllLocations, totpEnabledAt, locationScopes } = session.user;
  if (!isAdminRole(role)) return null;
  if (totpEnabledAt && !session.twoFactorVerifiedAt) return null;
  if (Date.now() - session.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
    const context = await getRequestSecurityContext();
    const touched = await prisma.adminSession.updateMany({
      where: { id: session.id, tokenHash: hashToken(token), expiresAt: { gt: new Date() } },
      data: {
        lastSeenAt: new Date(),
        userAgent: context.userAgent ?? session.userAgent,
        ipAddress: context.ipAddress ?? session.ipAddress
      }
    });
    if (touched.count !== 1) return null;
  }
  return {
    id,
    email,
    name,
    role,
    scopeAllLocations,
    locationIds: locationScopes.map((scope) => scope.locationId),
    twoFactorEnabled: Boolean(totpEnabledAt)
  };
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
  if (isAdminTwoFactorRequired() && !user.twoFactorEnabled) {
    redirect("/admin/sicurezza?required=1");
  }
  if (!hasAdminCapability(user.role, capability)) {
    redirect(`/admin?denied=${encodeURIComponent("Permessi insufficienti per questa operazione.")}`);
  }
  return user;
}

/** Come requireAdminCapability ma accetta più capacita alternative. */
export async function requireAdminAnyCapability(capabilities: AdminCapability[]): Promise<SessionUser> {
  const user = await requireAdmin();
  if (isAdminTwoFactorRequired() && !user.twoFactorEnabled) {
    redirect("/admin/sicurezza?required=1");
  }
  if (!capabilities.some((capability) => hasAdminCapability(user.role, capability))) {
    redirect(`/admin?denied=${encodeURIComponent("Permessi insufficienti per questa operazione.")}`);
  }
  return user;
}

/**
 * Gate per i Route Handler (export CSV): stessa politica delle pagine, 2FA
 * obbligatorio compreso, ma con risposte HTTP invece di redirect.
 */
export async function authorizeAdminRoute(
  capability: AdminCapability
): Promise<{ ok: true; user: SessionUser } | { ok: false; status: 401 | 403; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, status: 401, error: "Non autorizzato" };
  if (isAdminTwoFactorRequired() && !user.twoFactorEnabled) {
    return { ok: false, status: 403, error: "Attiva la verifica in due passaggi per scaricare i dati." };
  }
  if (!hasAdminCapability(user.role, capability)) return { ok: false, status: 403, error: "Permessi insufficienti" };
  return { ok: true, user };
}

export function isAdminTwoFactorRequired(): boolean {
  return process.env.NODE_ENV === "production" && process.env.ADMIN_2FA_REQUIRED !== "false";
}

export function hasGlobalAdminLocationAccess(user: SessionUser): boolean {
  return user.scopeAllLocations || user.role === "OWNER" || user.role === "ADMIN";
}

export function canAdminAccessLocation(user: SessionUser, locationId: string | null | undefined): boolean {
  if (!locationId) return false;
  return hasGlobalAdminLocationAccess(user) || user.locationIds.includes(locationId);
}

export function assertAdminLocationAccess(user: SessionUser, locationId: string | null | undefined): void {
  if (!canAdminAccessLocation(user, locationId)) {
    throw new DomainError("Non hai accesso alla sede associata a questa operazione.", "ADMIN_LOCATION_DENIED");
  }
}

/** null means global access; an empty array deliberately means no assigned store. */
export function adminLocationScope(user: SessionUser): string[] | null {
  return hasGlobalAdminLocationAccess(user) ? null : user.locationIds;
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
export async function rotateSessionsForUser(userId: string, twoFactorVerified = true): Promise<void> {
  await prisma.adminSession.deleteMany({ where: { userId } });
  await createSession(userId, undefined, twoFactorVerified);
}

export async function listAdminSessions(userId: string) {
  await pruneExpiredSessions();
  const tokenHash = await currentSessionTokenHash();
  const sessions = await prisma.adminSession.findMany({
    where: { userId },
    orderBy: [{ lastSeenAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      tokenHash: true,
      userAgent: true,
      ipAddress: true,
      lastSeenAt: true,
      twoFactorVerifiedAt: true,
      createdAt: true,
      expiresAt: true
    }
  });
  return sessions.map(({ tokenHash: storedHash, ...session }) => ({
    ...session,
    isCurrent: Boolean(tokenHash && tokenHash === storedHash)
  }));
}

export async function destroyAdminSessionById(userId: string, sessionId: string): Promise<"current" | "other" | "missing"> {
  const tokenHash = await currentSessionTokenHash();
  const target = await prisma.adminSession.findFirst({
    where: { id: sessionId, userId },
    select: { tokenHash: true }
  });
  if (!target) return "missing";
  await prisma.adminSession.deleteMany({ where: { id: sessionId, userId } });
  if (target.tokenHash === tokenHash) {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE);
    return "current";
  }
  return "other";
}

export async function destroyOtherAdminSessions(userId: string): Promise<void> {
  const tokenHash = await currentSessionTokenHash();
  await prisma.adminSession.deleteMany({
    where: { userId, ...(tokenHash ? { NOT: { tokenHash } } : {}) }
  });
}

/** Dopo l'enrollment 2FA conserva il browser corrente e revoca ogni altra sessione. */
export async function secureCurrentAdminSession(userId: string): Promise<void> {
  const tokenHash = await currentSessionTokenHash();
  if (!tokenHash) throw new DomainError("Sessione amministratore non disponibile.");
  await prisma.$transaction(async (tx) => {
    const verified = await tx.adminSession.updateMany({
      where: { userId, tokenHash, expiresAt: { gt: new Date() } },
      data: { twoFactorVerifiedAt: new Date(), lastSeenAt: new Date() }
    });
    if (verified.count !== 1) throw new DomainError("Sessione amministratore non disponibile.");
    await tx.adminSession.deleteMany({ where: { userId, NOT: { tokenHash } } });
  });
}
