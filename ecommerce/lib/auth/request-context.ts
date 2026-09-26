import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { getAuthSecret } from "@/lib/auth/secret";
import { clientIpFromHeaders } from "@/lib/auth/client-ip";

const MAX_USER_AGENT_LENGTH = 500;

/** Preferisce gli header impostati dal CDN/hosting (vedi lib/auth/client-ip.ts). */
export async function getClientIp(): Promise<string> {
  return clientIpFromHeaders(await headers());
}

export async function getRequestSecurityContext(): Promise<{
  ipAddress: string | null;
  userAgent: string | null;
}> {
  const h = await headers();
  const ip = await getClientIp();
  const userAgent = h.get("user-agent")?.trim().slice(0, MAX_USER_AGENT_LENGTH) || null;
  return { ipAddress: ip === "unknown" ? null : ip, userAgent };
}

/** Chiave opaca: email e IP non vengono persistiti in chiaro nel rate-limit store. */
export function rateLimitKey(scope: string, ...identifiers: Array<string | null | undefined>): string {
  const normalizedScope = scope.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 40) || "auth";
  const material = identifiers.map((value) => value?.trim().toLowerCase() ?? "").join("\u001f");
  const digest = createHmac("sha256", getAuthSecret()).update(material).digest("base64url");
  return `${normalizedScope}:${digest}`;
}
