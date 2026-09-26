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
    const key = fingerprint(input);
    const previous = level === "CRITICAL"
      ? await prisma.operationalEvent.findUnique({ where: { fingerprint: key }, select: { resolvedAt: true, occurrenceCount: true } })
      : null;
    const saved = await prisma.operationalEvent.upsert({
      where: { fingerprint: key },
      create: { fingerprint: key, ...data, firstSeenAt: now, lastSeenAt: now },
      update: {
        ...data,
        occurrenceCount: { increment: 1 },
        lastSeenAt: now,
        resolvedAt: null,
        resolvedBy: null
      },
      select: { id: true, occurrenceCount: true }
    });
    // Allarme solo alla prima occorrenza, alla riapertura e a 10/100/1000
    // ripetizioni: niente valanghe di notifiche per lo stesso problema.
    const count = saved.occurrenceCount;
    const reopened = previous?.resolvedAt != null;
    if (level === "CRITICAL" && (count === 1 || reopened || count === 10 || count === 100 || count === 1000)) {
      await dispatchAlert({ ...data, fingerprint: key, count }).catch(() => undefined);
    }
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

type AlertPayload = {
  source: string;
  code: string;
  message: string;
  orderId: string | null;
  fingerprint: string;
  count: number;
};

/**
 * Consegna degli allarmi CRITICAL: webhook https (Slack/Telegram/Teams) e
 * email agli operatori. Gli allarmi generati dal worker email arrivano SOLO
 * via webhook, altrimenti un SMTP guasto produrrebbe email di allarme a loro
 * volta non consegnabili, all'infinito.
 */
async function dispatchAlert(alert: AlertPayload): Promise<void> {
  const { getAlertsWebhookUrl, getOpsRecipients } = await import("@/lib/services/commerce-settings");
  const { SITE_URL } = await import("@/lib/site");
  const text =
    `Sessa e-commerce — allarme ${alert.code} (${alert.source})\n${alert.message}` +
    (alert.orderId ? `\nOrdine: ${SITE_URL}/admin/ordini/${alert.orderId}` : "") +
    (alert.count > 1 ? `\nRipetizioni: ${alert.count}` : "") +
    `\nDettagli: ${SITE_URL}/admin/osservabilita`;
  const webhook = await getAlertsWebhookUrl();
  if (webhook) {
    await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(4_000)
    }).catch(() => undefined);
  }
  if (alert.source === "email-worker") return;
  const recipients = await getOpsRecipients();
  if (!recipients.alerts) return;
  const { enqueueEmail } = await import("@/lib/services/email");
  await enqueueEmail({
    toEmail: recipients.alerts,
    subject: `Allarme e-commerce: ${alert.code}`,
    body: text,
    type: "OPS_ALERT",
    dedupeKey: `OPS_ALERT:${alert.fingerprint}:${alert.count}`,
    cta: { url: `${SITE_URL}/admin/osservabilita`, label: "Apri il pannello operazioni" }
  });
}
