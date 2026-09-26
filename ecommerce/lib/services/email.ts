import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site";
import { safeErrorMetadata } from "@/lib/safe-log";
import { REDACTED_EMAIL_BODY, retainedEmailBody } from "@/lib/security/email-retention";
import { decryptSensitiveValue, encryptSensitiveValue } from "@/lib/security/secret-box";
import { recordOperationalError } from "@/lib/observability";

/**
 * Coda email (outbox) con invio reale via SMTP quando configurato.
 * - SMTP_HOST impostato → invio reale (HTML brandizzato + testo).
 * - SMTP assente in sviluppo → log in console, messaggio marcato SENT (i link
 *   restano testabili perché le action li mostrano inline).
 * - SMTP assente in PRODUZIONE → il chiamante riceve un errore esplicito e il
 *   worker porta il messaggio a FAILED/DEAD: niente falsi "SENT".
 * Config: SMTP_HOST/PORT/SECURE/USER/PASS/FROM (vedi .env.example).
 */
export type EmailType =
  | "ORDER_CONFIRMATION"
  | "PAYMENT_INSTRUCTIONS"
  | "PASSWORD_RESET"
  | "REFERRAL_WELCOME"
  | "REFERRAL_REWARD"
  | "SECURITY_LOGIN"
  | "SECURITY_PASSWORD_CHANGED"
  | "EMAIL_VERIFICATION"
  | "EMAIL_CHANGE"
  | "ACCOUNT_DELETED"
  | "SECURITY_2FA"
  | "REFUND_CONFIRMATION"
  | "ORDER_READY"
  | "ORDER_SHIPPED"
  | "ORDER_CANCELLED"
  | "ORDER_DELIVERED"
  | "PAYMENT_REMINDER"
  | "STORE_NEW_ORDER"
  | "STORE_RETURN_REQUEST"
  | "RETURN_UPDATE"
  | "REGISTRATION"
  | "OPS_ALERT"
  | "ABANDONED_CART";

/** Pulsante principale dell'email: accettato solo se punta al sito del negozio. */
export type EmailCta = { url: string; label: string };

export type EmailInput = {
  toEmail: string;
  subject: string;
  body: string;
  type: EmailType;
  reference?: string;
  dedupeKey?: string;
  cta?: EmailCta;
  /** Link di disiscrizione (email promozionali): footer + header List-Unsubscribe. */
  unsubscribeUrl?: string;
};

type StoredEmail = { text: string; cta?: EmailCta; unsubscribeUrl?: string };
const STORED_EMAIL_MARKER = "sessa-email:v2:";

/**
 * Il corpo salvato (cifrato) porta con se anche CTA e link di disiscrizione:
 * contengono token (reset, attivazione) e devono restare protetti come il testo.
 */
function packEmail(input: EmailInput): string {
  const stored: StoredEmail = { text: input.body, cta: input.cta, unsubscribeUrl: input.unsubscribeUrl };
  return `${STORED_EMAIL_MARKER}${JSON.stringify(stored)}`;
}

function unpackEmail(plain: string): StoredEmail {
  if (!plain.startsWith(STORED_EMAIL_MARKER)) return { text: plain };
  try {
    const parsed = JSON.parse(plain.slice(STORED_EMAIL_MARKER.length)) as StoredEmail;
    return typeof parsed.text === "string" ? parsed : { text: plain };
  } catch {
    return { text: plain };
  }
}

/** Solo URL assoluti del sito del negozio possono diventare link o pulsanti. */
export function isTrustedSiteUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const site = new URL(SITE_URL);
    return parsed.origin === site.origin && (parsed.protocol === "https:" || parsed.hostname === "localhost");
  } catch {
    return false;
  }
}

export type EmailDeliveryResult = {
  id: string;
  status: "QUEUED" | "SENT" | "FAILED";
  error?: string;
};

export type EmailWorkerResult = {
  claimed: number;
  sent: number;
  failed: number;
  dead: number;
};

type ClaimedEmail = {
  id: string;
  toEmail: string;
  subject: string;
  body: string;
  type: string;
  reference: string | null;
  attemptCount: number;
  maxAttempts: number;
  lockToken: string;
};

let transporter: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter | null {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
      connectionTimeout: 8_000,
      greetingTimeout: 8_000,
      socketTimeout: 15_000
    });
  }
  return transporter;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Veste grafica unica per tutte le email transazionali. Il testo semplice resta
 * la fonte ed e sempre escapato: nessun contenuto fornito dagli utenti (nomi,
 * note, user agent) può diventare HTML, link cliccabile o pulsante. Solo gli URL
 * del sito del negozio sono cliccabili; il pulsante nasce da una CTA esplicita.
 */
export function renderEmailHtml(subject: string, stored: StoredEmail): string {
  const paragraphs = stored.text
    .split(/\n{2,}/)
    .map((block) => {
      const safe = escapeHtml(block.trim()).replaceAll("\n", "<br/>");
      const withLinks = safe.replace(/(https?:\/\/[^\s<]+)/g, (match) => {
        const raw = match.replaceAll("&amp;", "&");
        return isTrustedSiteUrl(raw)
          ? `<a href="${match}" style="color:#D65A1F;word-break:break-all;">${match}</a>`
          : match;
      });
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#2b2622;">${withLinks}</p>`;
    })
    .join("");

  const cta = stored.cta && isTrustedSiteUrl(stored.cta.url) ? stored.cta : null;
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td style="border-radius:999px;background:#D65A1F;">
        <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:13px 30px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;letter-spacing:.4px;color:#FAF6EF;text-decoration:none;">${escapeHtml(cta.label)}</a>
      </td></tr></table>`
    : "";
  const unsubscribe = stored.unsubscribeUrl && isTrustedSiteUrl(stored.unsubscribeUrl)
    ? `<br/><a href="${escapeHtml(stored.unsubscribeUrl)}" style="color:#bdb3a8;">Non ricevere più queste comunicazioni</a>`
    : "";
  const siteHost = escapeHtml(SITE_URL.replace(/^https?:\/\//, ""));

  return `<!doctype html>
<html lang="it">
  <body style="margin:0;padding:0;background:#FAF6EF;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF6EF;padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr>
            <td style="background:#D65A1F;border-radius:18px 18px 0 0;padding:26px 32px;text-align:center;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:38px;line-height:1;color:#FAF6EF;">Sessa</div>
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:4px;color:#FFE9D6;margin-top:6px;">PASTICCERIA DAL 1930</div>
            </td>
          </tr>
          <tr>
            <td style="background:#FFFFFF;padding:32px;border:1px solid #eee2d4;border-top:0;">
              <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.3;color:#171412;">${escapeHtml(subject)}</h1>
              ${paragraphs}
              ${button}
            </td>
          </tr>
          <tr>
            <td style="background:#171412;border-radius:0 0 18px 18px;padding:20px 32px;text-align:center;">
              <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.7;color:#bdb3a8;">
                Sessa 1930 &middot; Pasticceria partenopea &middot; <a href="${escapeHtml(SITE_URL)}" style="color:#F2B84B;text-decoration:none;">${siteHost}</a><br/>
                Email automatica: non rispondere a questo messaggio.${unsubscribe}
              </div>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

/** Testo semplice: la CTA viene aggiunta in coda se non e già presente nel corpo. */
function renderEmailText(stored: StoredEmail): string {
  const parts = [stored.text];
  if (stored.cta && isTrustedSiteUrl(stored.cta.url) && !stored.text.includes(stored.cta.url)) {
    parts.push(`${stored.cta.label}: ${stored.cta.url}`);
  }
  if (stored.unsubscribeUrl) parts.push(`Per non ricevere più queste comunicazioni: ${stored.unsubscribeUrl}`);
  return parts.join("\n\n");
}

export async function enqueueEmail(input: EmailInput): Promise<EmailDeliveryResult> {
  const dedupeKey = input.dedupeKey ?? (input.reference ? `${input.type}:${input.reference}` : null);
  let message: { id: string; status: string; error: string | null };
  try {
    message = await prisma.emailMessage.create({
      data: {
        toEmail: input.toEmail.trim().toLowerCase(),
        subject: input.subject,
        body: encryptSensitiveValue(packEmail(input)),
        type: input.type,
        reference: input.reference,
        dedupeKey,
        status: "QUEUED",
        nextAttemptAt: new Date()
      },
      select: { id: true, status: true, error: true }
    });
  } catch (error) {
    if (dedupeKey && typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") {
      const existing = await prisma.emailMessage.findUnique({
        where: { dedupeKey },
        select: { id: true, status: true, error: true }
      });
      if (existing) {
        return {
          id: existing.id,
          status: existing.status === "SENT" ? "SENT" : existing.status === "DEAD" ? "FAILED" : "QUEUED",
          error: existing.error ?? undefined
        };
      }
    }
    throw error;
  }

  // In sviluppo l'invio immediato mantiene testabili i link senza attendere il cron.
  if (process.env.NODE_ENV !== "production") {
    const result = await processEmailQueue({ limit: 1, onlyId: message.id });
    return result.sent === 1
      ? { id: message.id, status: "SENT" }
      : { id: message.id, status: "FAILED", error: "Consegna email locale non riuscita." };
  }
  if (!process.env.SMTP_HOST) {
    return { id: message.id, status: "FAILED", error: "SMTP non configurato (SMTP_HOST mancante)" };
  }
  return { id: message.id, status: "QUEUED" };
}

/**
 * Accodamento DENTRO una transazione chiamante (outbox pattern): la riga
 * EmailMessage committa atomicamente con l'evento di business che la produce
 * (es. creazione ordine). Un crash fra commit ed enqueue separato non può più
 * perdere la conferma. Il dedupeKey rende l'operazione idempotente: un
 * conflitto con un messaggio già presente viene ignorato in silenzio.
 *
 * L'invio reale resta compito del worker (processEmailQueue).
 */
export async function enqueueEmailInTx(tx: Prisma.TransactionClient, input: EmailInput): Promise<void> {
  const dedupeKey = input.dedupeKey ?? (input.reference ? `${input.type}:${input.reference}` : null);
  // ON CONFLICT DO NOTHING: un try/catch sul vincolo unico dentro una
  // transazione PostgreSQL lascerebbe la transazione abortita.
  await tx.emailMessage.createMany({
    data: [
      {
        toEmail: input.toEmail.trim().toLowerCase(),
        subject: input.subject,
        body: encryptSensitiveValue(packEmail(input)),
        type: input.type,
        reference: input.reference,
        dedupeKey,
        status: "QUEUED",
        nextAttemptAt: new Date()
      }
    ],
    skipDuplicates: true
  });
}

async function claimEmailMessages(limit: number, onlyId?: string): Promise<ClaimedEmail[]> {
  const lockToken = randomUUID();
  const leaseCutoff = new Date(Date.now() - 5 * 60 * 1000);
  const onlyIdClause = onlyId ? Prisma.sql`AND "id" = ${onlyId}` : Prisma.empty;
  return prisma.$queryRaw<ClaimedEmail[]>(Prisma.sql`
    WITH candidates AS (
      SELECT "id"
      FROM "EmailMessage"
      WHERE (
        ("status" IN ('QUEUED','FAILED') AND "nextAttemptAt" <= CURRENT_TIMESTAMP)
        OR ("status" = 'PROCESSING' AND "lockedAt" < ${leaseCutoff})
      )
      ${onlyIdClause}
      ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${Math.max(1, Math.min(limit, 25))}
    )
    UPDATE "EmailMessage" AS message
    SET "status" = 'PROCESSING',
        "lockToken" = ${lockToken},
        "lockedAt" = CURRENT_TIMESTAMP,
        "lastAttemptAt" = CURRENT_TIMESTAMP,
        "attemptCount" = message."attemptCount" + 1,
        "updatedAt" = CURRENT_TIMESTAMP
    FROM candidates
    WHERE message."id" = candidates."id"
    RETURNING message."id", message."toEmail", message."subject", message."body",
              message."type", message."reference", message."attemptCount",
              message."maxAttempts", message."lockToken"
  `);
}

function retryDelayMs(attemptCount: number): number {
  return Math.min(60, 2 ** Math.max(0, attemptCount - 1)) * 60_000;
}

async function deliverClaimed(message: ClaimedEmail): Promise<"SENT" | "FAILED" | "DEAD"> {
  try {
    const stored = unpackEmail(decryptSensitiveValue(message.body));
    const transport = getTransport();
    if (transport) {
      await transport.sendMail({
        from: process.env.SMTP_FROM ?? "Sessa 1930 <no-reply@sessa1930.com>",
        to: message.toEmail,
        subject: message.subject,
        text: renderEmailText(stored),
        html: renderEmailHtml(message.subject, stored),
        ...(stored.unsubscribeUrl && isTrustedSiteUrl(stored.unsubscribeUrl)
          ? {
              list: { unsubscribe: { url: stored.unsubscribeUrl, comment: "Disiscrizione" } },
              headers: { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
            }
          : {})
      });
    } else if (process.env.NODE_ENV === "production") {
      const error = new Error("SMTP_NOT_CONFIGURED") as Error & { code?: string };
      error.code = "SMTP_NOT_CONFIGURED";
      throw error;
    } else {
      console.log(`[email:${message.type}] → ${message.toEmail}: ${message.subject}`);
    }
    await prisma.emailMessage.updateMany({
      where: { id: message.id, status: "PROCESSING", lockToken: message.lockToken },
      data: {
        status: "SENT",
        sentAt: new Date(),
        body: retainedEmailBody(stored.text),
        // Dopo la conferma di cancellazione account non resta traccia del destinatario.
        ...(message.type === "ACCOUNT_DELETED" ? { toEmail: "redatto@anonimo.sessa1930.invalid" } : {}),
        error: null,
        lockToken: null,
        lockedAt: null
      }
    });
    return "SENT";
  } catch (error) {
    const metadata = safeErrorMetadata(error);
    const publicError = metadata.code ? `${metadata.name} (${metadata.code})` : metadata.name;
    const dead = message.attemptCount >= message.maxAttempts;
    await prisma.emailMessage.updateMany({
      where: { id: message.id, status: "PROCESSING", lockToken: message.lockToken },
      data: {
        status: dead ? "DEAD" : "FAILED",
        error: publicError,
        nextAttemptAt: new Date(Date.now() + retryDelayMs(message.attemptCount)),
        lockToken: null,
        lockedAt: null
      }
    }).catch(() => undefined);
    await recordOperationalError({
      // Un allarme email non consegnato non genera un altro allarme via email.
      level: dead && message.type !== "OPS_ALERT" ? "CRITICAL" : "WARNING",
      source: "email-worker",
      code: dead ? "EMAIL_DEAD" : "EMAIL_RETRY_SCHEDULED",
      message: dead ? "Messaggio email non consegnato dopo tutti i tentativi." : "Consegna email fallita; nuovo tentativo pianificato.",
      entityType: "EmailMessage",
      entityId: message.id,
      fingerprintKey: dead ? message.id : message.type,
      error,
      metadata: { emailType: message.type, attemptCount: message.attemptCount }
    });
    return dead ? "DEAD" : "FAILED";
  }
}

const EMAIL_SEND_CONCURRENCY = 4;

export async function processEmailQueue(options: { limit?: number; onlyId?: string } = {}): Promise<EmailWorkerResult> {
  const claimed = await claimEmailMessages(options.limit ?? 20, options.onlyId);
  const result: EmailWorkerResult = { claimed: claimed.length, sent: 0, failed: 0, dead: 0 };
  // Concorrenza limitata: un handshake SMTP lento non blocca la coda e il
  // provider non viene saturato; il lease di 5 minuti copre l'intero lotto.
  const statuses: Array<"SENT" | "FAILED" | "DEAD"> = [];
  for (let index = 0; index < claimed.length; index += EMAIL_SEND_CONCURRENCY) {
    statuses.push(...(await Promise.all(claimed.slice(index, index + EMAIL_SEND_CONCURRENCY).map(deliverClaimed))));
  }
  for (const status of statuses) {
    if (status === "SENT") result.sent += 1;
    else if (status === "DEAD") result.dead += 1;
    else result.failed += 1;
  }
  return result;
}

export async function retryEmailMessage(id: string): Promise<boolean> {
  const updated = await prisma.emailMessage.updateMany({
    where: { id, status: { in: ["FAILED", "DEAD"] }, body: { not: REDACTED_EMAIL_BODY } },
    data: {
      status: "QUEUED",
      attemptCount: 0,
      nextAttemptAt: new Date(),
      error: null,
      lockToken: null,
      lockedAt: null
    }
  });
  return updated.count === 1;
}

export async function pruneEmailHistory(): Promise<{ sent: number; dead: number }> {
  const [sent, dead] = await prisma.$transaction([
    prisma.emailMessage.deleteMany({
      where: { status: "SENT", sentAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
    }),
    prisma.emailMessage.deleteMany({
      where: { status: "DEAD", updatedAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } }
    })
  ]);
  return { sent: sent.count, dead: dead.count };
}
