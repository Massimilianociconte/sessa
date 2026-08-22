import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { safeErrorMetadata } from "@/lib/safe-log";

export type OperationalLevel = "INFO" | "WARNING" | "ERROR" | "CRITICAL";

type OperationalEventInput = {
  level?: OperationalLevel;
  source: string;
  code: string;
  message: string;
  correlationId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  orderId?: string | null;
  locationId?: string | null;
  metadata?: Record<string, string | number | boolean | null | undefined>;
  fingerprintKey?: string;
};

const SENSITIVE_KEY = /(email|phone|address|name|token|secret|password|cookie|authorization|body|payload)/i;

function bounded(value: string | null | undefined, limit: number): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, limit) : null;
}

function safeMetadata(value?: OperationalEventInput["metadata"]): string | null {
  if (!value) return null;
  const clean: Record<string, string | number | boolean | null> = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key) || item === undefined) continue;
    clean[key.slice(0, 80)] = typeof item === "string" ? item.slice(0, 300) : item;
  }
  const serialized = JSON.stringify(clean);
  return serialized === "{}" ? null : serialized.slice(0, 4000);
}

function fingerprint(input: OperationalEventInput): string {
  const material = [
    input.source,
    input.code,
    input.fingerprintKey ?? input.entityId ?? input.orderId ?? input.locationId ?? "global"
  ].join("\u001f");
  return createHash("sha256").update(material).digest("hex");
}

/**
 * Best-effort operational ledger. It aggregates recurring failures, reopens
 * resolved events if they recur and intentionally drops common PII/secrets.
 */
export async function recordOperationalEvent(input: OperationalEventInput): Promise<void> {
  const now = new Date();
  const level = input.level ?? "ERROR";
  const data = {
    level,
    source: input.source.slice(0, 80),
    code: input.code.slice(0, 100),
    message: input.message.slice(0, 500),
    correlationId: bounded(input.correlationId, 160),
    entityType: bounded(input.entityType, 80),
    entityId: bounded(input.entityId, 160),
    orderId: bounded(input.orderId, 160),
    locationId: bounded(input.locationId, 160),
    metadata: safeMetadata(input.metadata)
  };

  try {
    await prisma.operationalEvent.upsert({
      where: { fingerprint: fingerprint(input) },
      create: { fingerprint: fingerprint(input), ...data, firstSeenAt: now, lastSeenAt: now },
      update: {
        ...data,
        occurrenceCount: { increment: 1 },
        lastSeenAt: now,
        resolvedAt: null,
        resolvedBy: null
      }
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      source: "observability",
      code: "EVENT_PERSIST_FAILED",
      error: safeErrorMetadata(error)
    }));
  }

  console[level === "INFO" ? "info" : level === "WARNING" ? "warn" : "error"](
    JSON.stringify({ level: level.toLowerCase(), source: data.source, code: data.code, correlationId: data.correlationId })
  );
}

export async function recordOperationalError(
  input: Omit<OperationalEventInput, "metadata"> & { error: unknown; metadata?: OperationalEventInput["metadata"] }
): Promise<void> {
  const error = safeErrorMetadata(input.error);
  await recordOperationalEvent({
    ...input,
    metadata: { ...input.metadata, errorName: error.name, errorCode: error.code ?? null }
  });
}
