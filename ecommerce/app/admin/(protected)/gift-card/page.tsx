import Flash from "@/components/admin/Flash";
import { createGiftCardAction, toggleGiftCardAction } from "@/lib/actions/admin/giftcards";
import { formatCents } from "@/lib/money";
import { listGiftCards } from "@/lib/services/giftcards";
import { requireAdminCapability } from "@/lib/auth/session";
import { formatRomeDate } from "@/lib/datetime";

export const dynamic = "force-dynamic";

export const metadata = { title: "Gift card" };

export default async function AdminGiftCardsPage({
  searchParams
}: {
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  await requireAdminCapability("promotions:manage");
  const { msg, err } = await searchParams;
  const cards = await listGiftCards();

  return (
    <>
      <h1 className="font-serif text-3xl font-semibold">Gift card & crediti</h1>
      <p className="mt-1 text-sm text-ink/50">
        Emetti gift card a saldo. Il cliente le usa al checkout: il saldo scala in modo tracciato e
        non può mai andare in negativo.
      </p>
      <div className="mt-4">
        <Flash msg={msg} err={err} />
      </div>

      <div className="mt-4 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-ink/50">
                <th className="px-4 py-3">Codice</th>
                <th className="px-4 py-3">Saldo / Iniziale</th>
                <th className="px-4 py-3">Intestazione</th>
                <th className="px-4 py-3">Scadenza</th>
                <th className="px-4 py-3">Stato</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {cards.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink/50">
                    Nessuna gift card emessa.
                  </td>
                </tr>
              )}
              {cards.map((card) => (
                <tr key={card.id} className="border-b border-ink/5">
                  <td className="px-4 py-3 font-mono font-bold">{card.code}</td>
                  <td className="px-4 py-3">
                    <span className={card.balanceCents === 0 ? "text-ink/40" : "font-semibold"}>
                      {formatCents(card.balanceCents)}
                    </span>
                    <span className="text-ink/40"> / {formatCents(card.initialCents)}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink/60">{card.customer?.email ?? "Al portatore"}</td>
                  <td className="px-4 py-3 text-xs text-ink/60">
                    {card.expiresAt ? formatRomeDate(card.expiresAt) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${card.isActive ? "bg-brilliant/15 text-emerald-800" : "bg-ink/10 text-ink/50"}`}>
                      {card.isActive ? "Attiva" : "Bloccata"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <form action={toggleGiftCardAction}>
                      <input type="hidden" name="id" value={card.id} />
                      <button type="submit" className="text-xs font-semibold text-ceramic hover:underline">
                        {card.isActive ? "Blocca" : "Sblocca"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="card h-fit p-6">
          <h2 className="mb-4 font-serif text-xl font-semibold">Emetti gift card</h2>
          <form action={createGiftCardAction} className="space-y-3">
            <div>
              <label className="label-field">Importo (€)</label>
              <input name="amount" required className="input-field" placeholder="25,00" />
            </div>
            <div>
              <label className="label-field">Intesta a cliente (email, opzionale)</label>
              <input name="customerEmail" type="email" className="input-field" placeholder="cliente@email.it" />
            </div>
            <div>
              <label className="label-field">Scadenza (opzionale)</label>
              <input name="expiresAt" type="date" className="input-field" />
            </div>
            <button type="submit" className="btn-primary w-full">
              Emetti gift card
            </button>
            <p className="text-xs text-ink/40">Il codice viene generato automaticamente (formato GIFT-XXXX-XXXX).</p>
          </form>
        </section>
      </div>
    </>
  );
}
