import Link from "next/link";
import { redirect } from "next/navigation";
import AuthShell from "@/components/account/AuthShell";
import { unsubscribeFromLink } from "@/lib/services/marketing-consent";

export const dynamic = "force-dynamic";
export const metadata = { title: "Disiscrizione", robots: { index: false, follow: false } };

async function unsubscribeAction(formData: FormData) {
  "use server";
  const ok = await unsubscribeFromLink(String(formData.get("c") ?? ""), String(formData.get("s") ?? ""));
  redirect(`/account/disiscrizione?esito=${ok ? "ok" : "errore"}`);
}

export default async function UnsubscribePage({
  searchParams
}: {
  searchParams: Promise<{ c?: string; s?: string; esito?: string }>;
}) {
  const { c, s, esito } = await searchParams;
  return (
    <AuthShell
      eyebrow="Preferenze email"
      title="Comunicazioni promozionali"
      brandClaim="Solo quello che vuoi."
      brandCopy="Le email sugli ordini continuano ad arrivare: smetti solo di ricevere promemoria e offerte."
      highlights={["Nessun login richiesto", "Effetto immediato", "Riattivabile dal profilo"]}
      sticker="/images/stickers/pasticceria-tradizionale-sessa-sticker.webp"
      footer={
        <div className="auth-links">
          <Link href="/" className="auth-link-strong">Torna allo shop</Link>
        </div>
      }
    >
      {esito === "ok" ? (
        <p className="auth-notice" role="status">Fatto: non riceverai più comunicazioni promozionali.</p>
      ) : esito === "errore" || !c || !s ? (
        <p className="text-sm text-ink/60">Link non valido. Puoi gestire il consenso dall&apos;area personale, sezione Preferenze.</p>
      ) : (
        <form action={unsubscribeAction} className="space-y-4">
          <input type="hidden" name="c" value={c} />
          <input type="hidden" name="s" value={s} />
          <p className="text-sm text-ink/70">Confermi di non voler più ricevere promemoria e offerte da Sessa 1930?</p>
          <button type="submit" className="btn-primary w-full">Conferma la disiscrizione</button>
        </form>
      )}
    </AuthShell>
  );
}
