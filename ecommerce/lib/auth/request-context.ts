import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { headers } from "next/headers";
import { getAuthSecret } from "@/lib/auth/secret";

const MAX_USER_AGENT_LENGTH = 500;

function normalizeIp(value: string | null): string | null {
  if (!value) return null;
  let candidate = value.trim();
  if (candidate.startsWith("[") && candidate.includes("]")) {
    candidate = candidate.slice(1, candidate.indexOf("]"));
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.slice(0, candidate.lastIndexOf(":"));
  }
  return isIP(candidate) ? candidate : null;
}

/** Preferisce gli header impostati dal CDN/hosting rispetto a X-Forwarded-For. */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const candidates = [
    h.get("x-nf-client-connection-ip"),
    h.get("cf-connecting-ip"),
    h.get("x-real-ip"),
    h.get("x-forwarded-for")?.split(",")[0] ?? null
  ];
  for (const candidate of candidates) {
    const normalized = normalizeIp(candidate);
    if (normalized) return normalized;
  }
  return "unknown";
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
