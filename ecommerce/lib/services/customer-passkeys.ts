import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON
} from "@simplewebauthn/server";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { SITE_URL } from "@/lib/site";

/**
 * Passkey WebAuthn (FIDO2) per gli account cliente.
 * - Registrazione: solo con sessione attiva; credenziale discoverable così
 *   il login può avvenire senza digitare l'email (Face ID/Touch ID/Android).
 * - Login: verifica assertion, anti-clonazione via counter, aggiorna lastUsedAt.
 * - La challenge vive in un cookie httpOnly FIRMATO (HMAC con SESSION_SECRET):
 *   niente stato server, ma il client non può scegliersi la challenge.
 */

const RP_NAME = "Sessa 1930";
const CHALLENGE_COOKIE = "sessa_wa_ch";
const CHALLENGE_TTL_S = 300;

function rpId(): string {
  return new URL(SITE_URL).hostname;
}

function expectedOrigin(): string {
  return new URL(SITE_URL).origin;
}

function hmacKey(): string {
  return process.env.SESSION_SECRET ?? "sessa-dev-secret";
}

function sign(value: string): string {
  return createHmac("sha256", hmacKey()).update(value).digest("base64url");
}

/** Salva la challenge attesa (firmata) nel cookie della cerimonia. */
async function storeChallenge(purpose: "reg" | "auth", challenge: string): Promise<void> {
  const payload = `${purpose}.${challenge}`;
  const cookieStore = await cookies();
  cookieStore.set(CHALLENGE_COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CHALLENGE_TTL_S
  });
}

/** Legge e consuma la challenge attesa; null se assente/manomessa/di altro tipo. */
async function consumeChallenge(purpose: "reg" | "auth"): Promise<string | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(CHALLENGE_COOKIE)?.value;
  cookieStore.delete(CHALLENGE_COOKIE);
  if (!raw) return null;
  const lastDot = raw.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const payload = raw.slice(0, lastDot);
  const signature = raw.slice(lastDot + 1);
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [p, challenge] = payload.split(".", 2);
  if (p !== purpose || !challenge) return null;
  return challenge;
}

export type PasskeySummary = {
  id: string;
  name: string;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
};

export async function listPasskeys(customerId: string): Promise<PasskeySummary[]> {
  const rows = await prisma.customerPasskey.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, deviceType: true, backedUp: true, createdAt: true, lastUsedAt: true }
  });
  return rows;
}

/** Opzioni per registrare una nuova passkey del cliente loggato. */
export async function beginPasskeyRegistration(customer: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const existing = await prisma.customerPasskey.findMany({
    where: { customerId: customer.id },
    select: { credentialId: true, transports: true }
  });
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpId(),
    userID: Buffer.from(customer.id, "utf8"),
    userName: customer.email,
    userDisplayName: `${customer.firstName} ${customer.lastName}`.trim() || customer.email,
    attestationType: "none",
    excludeCredentials: existing.map((cred) => ({
      id: cred.credentialId,
      transports: parseTransports(cred.transports)
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred"
    }
  });
  await storeChallenge("reg", options.challenge);
  return options;
}

/** Verifica la risposta di registrazione e salva la credenziale. */
export async function finishPasskeyRegistration(
  customerId: string,
  response: RegistrationResponseJSON,
  name: string
): Promise<PasskeySummary> {
  const challenge = await consumeChallenge("reg");
  if (!challenge) throw new DomainError("Sessione di registrazione scaduta: riprova.");

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: expectedOrigin(),
    expectedRPID: rpId(),
    requireUserVerification: false
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new DomainError("Verifica della passkey non riuscita: riprova.");
  }

  const info = verification.registrationInfo;
  const label = name.trim().slice(0, 60) || "Passkey";
  const row = await prisma.customerPasskey.create({
    data: {
      customerId,
      credentialId: info.credential.id,
      publicKey: Buffer.from(info.credential.publicKey).toString("base64url"),
      counter: info.credential.counter,
      transports: info.credential.transports?.join(",") ?? null,
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      name: label
    },
    select: { id: true, name: true, deviceType: true, backedUp: true, createdAt: true, lastUsedAt: true }
  });
  return row;
}

/** Opzioni di login usernameless: il browser propone le passkey salvate. */
export async function beginPasskeyLogin(): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const options = await generateAuthenticationOptions({
    rpID: rpId(),
    userVerification: "preferred",
    allowCredentials: []
  });
  await storeChallenge("auth", options.challenge);
  return options;
}

/** Verifica l'assertion e ritorna il cliente autenticato. */
export async function finishPasskeyLogin(
  response: AuthenticationResponseJSON
): Promise<{ customerId: string; passkeyName: string }> {
  const challenge = await consumeChallenge("auth");
  if (!challenge) throw new DomainError("Sessione di accesso scaduta: riprova.");

  const credential = await prisma.customerPasskey.findUnique({
    where: { credentialId: response.id },
    include: { customer: { select: { id: true, anonymizedAt: true } } }
  });
  if (!credential || credential.customer.anonymizedAt) {
    throw new DomainError("Passkey non riconosciuta su questo negozio.");
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: expectedOrigin(),
    expectedRPID: rpId(),
    requireUserVerification: false,
    credential: {
      id: credential.credentialId,
      publicKey: Buffer.from(credential.publicKey, "base64url"),
      counter: credential.counter,
      transports: parseTransports(credential.transports)
    }
  });
  if (!verification.verified) {
    throw new DomainError("Verifica della passkey non riuscita.");
  }

  await prisma.customerPasskey.update({
    where: { id: credential.id },
    data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() }
  });
  return { customerId: credential.customer.id, passkeyName: credential.name };
}

export async function deletePasskey(customerId: string, passkeyId: string): Promise<boolean> {
  const result = await prisma.customerPasskey.deleteMany({
    where: { id: passkeyId, customerId }
  });
  return result.count > 0;
}

function parseTransports(value: string | null): AuthenticatorTransportFuture[] | undefined {
  if (!value) return undefined;
  return value.split(",").filter(Boolean) as AuthenticatorTransportFuture[];
}

// Tipo transport importabile solo dal pacchetto types: alias locale minimale.
type AuthenticatorTransportFuture = "ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb";
