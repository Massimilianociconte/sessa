import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site";

/**
 * Coda email (outbox) con invio reale via SMTP quando configurato.
 * - SMTP_HOST impostato → invio reale (HTML brandizzato + testo).
 * - SMTP assente in sviluppo → log in console, messaggio marcato SENT (i link
 *   restano testabili perché le action li mostrano inline).
 * - SMTP assente in PRODUZIONE → il messaggio resta in stato FAILED con errore
 *   esplicito: niente falsi "SENT", l'outbox in DB rende il problema visibile.
 * Config: SMTP_HOST/PORT/SECURE/USER/PASS/FROM (vedi .env.example).
 */
export type EmailType =
  | "ORDER_CONFIRMATION"
  | "PASSWORD_RESET"
  | "REFERRAL_WELCOME"
  | "REFERRAL_REWARD"
  | "SECURITY_LOGIN"
  | "SECURITY_PASSWORD_CHANGED"
  | "EMAIL_VERIFICATION"
  | "EMAIL_CHANGE"
  | "ACCOUNT_DELETED"
  | "SECURITY_2FA";

export type EmailDeliveryResult = {
  id: string;
  status: "SENT" | "FAILED";
  error?: string;
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
          : undefined
    });
  }
  return transporter;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Veste grafica unica per tutte le email transazionali: nastro terracotta,
 * corpo su carta avorio, bottone per il primo link presente nel testo.
 * Il testo semplice resta la fonte: qui viene solo impaginato (i link diventano
 * bottone/cliccabili, i paragrafi mantengono gli a-capo).
 */
function renderHtml(subject: string, body: string): string {
  const linkMatch = body.match(/https?:\/\/[^\s]+/);
  const link = linkMatch?.[0] ?? null;
  const paragraphs = body
    .split(/\n{2,}/)
    .map((block) => {
      const safe = escapeHtml(block.trim()).replaceAll("\n", "<br/>");
      const withLinks = safe.replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1" style="color:#D65A1F;word-break:break-all;">$1</a>'
      );
      return `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#2b2622;">${withLinks}</p>`;
    })
    .join("");

  const button = link
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td style="border-radius:999px;background:#D65A1F;">
        <a href="${link}" style="display:inline-block;padding:13px 30px;border-radius:999px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;letter-spacing:.4px;color:#FAF6EF;text-decoration:none;">Apri il link</a>
      </td></tr></table>`
    : "";

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
                Sessa 1930 &middot; Pasticceria partenopea &middot; <a href="${SITE_URL}" style="color:#F2B84B;text-decoration:none;">${SITE_URL.replace(/^https?:\/\//, "")}</a><br/>
                Email automatica: non rispondere a questo messaggio.
              </div>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export async function enqueueEmail(input: {
  toEmail: string;
  subject: string;
  body: string;
  type: EmailType;
  reference?: string;
}): Promise<EmailDeliveryResult> {
  const message = await prisma.emailMessage.create({
    data: {
      toEmail: input.toEmail,
      subject: input.subject,
      body: input.body,
      type: input.type,
      reference: input.reference,
      status: "QUEUED"
    }
  });
  return deliver(message.id);
}

async function deliver(id: string): Promise<EmailDeliveryResult> {
  try {
    const message = await prisma.emailMessage.findUnique({ where: { id } });
    if (!message) return { id, status: "FAILED", error: "Messaggio non trovato" };
    const transport = getTransport();
    if (transport) {
      await transport.sendMail({
        from: process.env.SMTP_FROM ?? "Sessa 1930 <no-reply@sessa1930.com>",
        to: message.toEmail,
        subject: message.subject,
        text: message.body,
        html: renderHtml(message.subject, message.body)
      });
    } else if (process.env.NODE_ENV === "production") {
      // Niente SMTP in produzione: il messaggio resta FAILED (e non "SENT"),
      // così l'outbox segnala il problema invece di nasconderlo.
      await prisma.emailMessage.update({
        where: { id },
        data: { status: "FAILED", error: "SMTP non configurato (SMTP_HOST mancante)" }
      });
      return { id, status: "FAILED", error: "SMTP non configurato (SMTP_HOST mancante)" };
    } else {
      console.log(`[email:${message.type}] → ${message.toEmail}: ${message.subject}`);
    }
    await prisma.emailMessage.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date() }
    });
    return { id, status: "SENT" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    await prisma.emailMessage.update({
      where: { id },
      data: { status: "FAILED", error: message }
    }).catch(() => undefined);
    return { id, status: "FAILED", error: message };
  }
}
