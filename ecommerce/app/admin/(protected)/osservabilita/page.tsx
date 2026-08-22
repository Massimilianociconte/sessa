import Flash from "@/components/admin/Flash";
import {
  resolveOperationalEventAction,
  retryEmailAction,
  runAbandonedCartWorkerAction,
  runEmailWorkerAction,
  runStockReservationWorkerAction
} from "@/lib/actions/admin/operations";
import { requireAdminCapability } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatRomeDateTime } from "@/lib/datetime";

export const dynamic = "force-dynamic";
export const metadata = { title: "Osservabilità" };

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  return domain ? `${local.slice(0, 2)}***@${domain}` : "***";
}

export default async function ObservabilityPage({
  searchParams
}: {
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const [{ msg, err }] = await Promise.all([searchParams, requireAdminCapability("operations:view")]);
  const now = new Date();
  const [events, emailCounts, queuedEmails, expiredReservations, webhookReviews] = await Promise.all([
    prisma.operationalEvent.findMany({
      where: { resolvedAt: null },
      orderBy: [{ level: "desc" }, { lastSeenAt: "desc" }],
      take: 50
    }),
    prisma.emailMessage.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.emailMessage.findMany({
      where: { status: { in: ["FAILED", "DEAD"] } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { id: true, toEmail: true, type: true, status: true, attemptCount: true, maxAttempts: true, error: true, updatedAt: true }
    }),
    prisma.order.count({
      where: { status: "PENDING_PAYMENT", stockReleasedAt: null, stockReservationExpiresAt: { lte: now } }
    }),
    prisma.paymentWebhookEvent.count({ where: { status: "REVIEW" } })
  ]);
  const emailCount = Object.fromEntries(emailCounts.map((row) => [row.status, row._count._all]));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-terracotta">Controllo operativo</p><h1 className="mt-1 font-serif text-3xl font-semibold">Osservabilità</h1><p className="mt-1 max-w-2xl text-sm text-ink/55">Errori aggregati, coda email, webhook da riconciliare e prenotazioni stock in scadenza, senza token o dati sensibili nei log.</p></div>
        <div className="flex flex-wrap gap-2"><form action={runEmailWorkerAction}><button type="submit" className="btn-secondary">Esegui coda email</button></form><form action={runAbandonedCartWorkerAction}><button type="submit" className="btn-secondary">Avvisa carrelli abbandonati</button></form><form action={runStockReservationWorkerAction}><button type="submit" className="btn-primary">Verifica prenotazioni</button></form></div>
      </div>
      <div className="mt-4"><Flash msg={msg} err={err} /></div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Eventi aperti</p><p className="mt-1 font-serif text-3xl font-semibold">{events.length}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Email in attesa</p><p className="mt-1 font-serif text-3xl font-semibold">{(emailCount.QUEUED ?? 0) + (emailCount.PROCESSING ?? 0)}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Prenotazioni scadute</p><p className="mt-1 font-serif text-3xl font-semibold">{expiredReservations}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Webhook in revisione</p><p className="mt-1 font-serif text-3xl font-semibold">{webhookReviews}</p></div>
      </div>

      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-ink/10 p-5"><h2 className="font-serif text-xl font-semibold">Eventi operativi aperti</h2></div>
        {events.length === 0 ? <p className="p-8 text-center text-sm text-ink/50">Nessun evento aperto.</p> : <ul className="divide-y divide-ink/10">{events.map((event) => <li key={event.id} className="flex flex-wrap items-start justify-between gap-4 p-5"><div className="min-w-0"><p className="flex flex-wrap items-center gap-2 font-semibold"><span className={`badge ${event.level === "CRITICAL" ? "bg-terracotta/15 text-terracotta" : event.level === "WARNING" ? "bg-majolica/30 text-yellow-900" : "bg-ceramic/10 text-ceramic"}`}>{event.level}</span>{event.code}</p><p className="mt-2 text-sm text-ink/65">{event.message}</p><p className="mt-1 text-xs text-ink/40">{event.source} · {event.occurrenceCount} occorrenze · ultimo {formatRomeDateTime(event.lastSeenAt)}</p></div><form action={resolveOperationalEventAction}><input type="hidden" name="eventId" value={event.id} /><button type="submit" className="btn-ghost text-sm">Risolto</button></form></li>)}</ul>}
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-ink/10 p-5"><h2 className="font-serif text-xl font-semibold">Email da verificare</h2><p className="mt-1 text-xs text-ink/45">Il destinatario è mascherato; il corpo resta cifrato finché necessario.</p></div>
        {queuedEmails.length === 0 ? <p className="p-8 text-center text-sm text-ink/50">Nessuna email fallita.</p> : <ul className="divide-y divide-ink/10">{queuedEmails.map((email) => <li key={email.id} className="flex flex-wrap items-center justify-between gap-4 p-4"><div><p className="font-semibold">{email.type} <span className="badge ml-2 bg-ink/10 text-ink/55">{email.status}</span></p><p className="text-xs text-ink/45">{maskEmail(email.toEmail)} · tentativo {email.attemptCount}/{email.maxAttempts} · {email.error ?? "errore non classificato"}</p></div><form action={retryEmailAction}><input type="hidden" name="emailId" value={email.id} /><button type="submit" className="btn-secondary text-sm">Rimetti in coda</button></form></li>)}</ul>}
      </section>
    </>
  );
}
