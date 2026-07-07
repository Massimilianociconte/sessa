import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";

/**
 * Coda email (outbox) con invio reale via SMTP quando configurato.
 * Se SMTP_HOST non è impostato, l'email viene registrata e loggata (dev),
 * così il flusso funziona anche senza credenziali. Per attivare l'invio reale
 * impostare SMTP_HOST/PORT/USER/PASS/FROM in .env.
 */
export type EmailType =
  | "ORDER_CONFIRMATION"
  | "PASSWORD_RESET"
  | "REFERRAL_WELCOME"
  | "REFERRAL_REWARD"
  | "SECURITY_LOGIN"
  | "SECURITY_PASSWORD_CHANGED";

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

export async function enqueueEmail(input: {
  toEmail: string;
  subject: string;
  body: string;
  type: EmailType;
  reference?: string;
}): Promise<void> {
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
  await deliver(message.id);
}

async function deliver(id: string): Promise<void> {
  try {
    const message = await prisma.emailMessage.findUnique({ where: { id } });
    if (!message) return;
    const transport = getTransport();
    if (transport) {
      await transport.sendMail({
        from: process.env.SMTP_FROM ?? "Sessa 1930 <no-reply@sessa1930.com>",
        to: message.toEmail,
        subject: message.subject,
        text: message.body
      });
    } else if (process.env.NODE_ENV !== "production") {
      console.log(`[email:${message.type}] → ${message.toEmail}: ${message.subject}`);
    }
    await prisma.emailMessage.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date() }
    });
  } catch (error) {
    await prisma.emailMessage.update({
      where: { id },
      data: { status: "FAILED", error: error instanceof Error ? error.message : "unknown" }
    });
  }
}
