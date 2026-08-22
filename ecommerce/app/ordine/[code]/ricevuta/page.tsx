import { notFound } from "next/navigation";
import { formatCents } from "@/lib/money";
import { formatRomeDateTime } from "@/lib/datetime";
import { getOrderForTracking } from "@/lib/services/orders";
import { FULFILLMENT_LABELS, type FulfillmentType } from "@/lib/domain";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ricevuta ordine", robots: { index: false, follow: false } };

export default async function OrderReceiptPage({
  params,
  searchParams
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const [{ code }, { t }] = await Promise.all([params, searchParams]);
  if (!t) notFound();
  const order = await getOrderForTracking(code, t);
  if (!order) notFound();

  return (
    <main className="mx-auto max-w-2xl bg-white px-6 py-10 text-ink print:px-0">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-terracotta">Sessa 1930</p>
      <h1 className="mt-2 font-serif text-3xl font-semibold">Ricevuta {order.code}</h1>
      <p className="mt-1 text-sm text-ink/60">Emessa il {formatRomeDateTime(order.placedAt)}</p>
      <dl className="mt-6 grid gap-2 text-sm">
        <div><dt className="font-semibold">Sede</dt><dd>{order.locationName}</dd></div>
        <div><dt className="font-semibold">Cliente</dt><dd>{order.email}</dd></div>
        <div><dt className="font-semibold">Evasione</dt><dd>{FULFILLMENT_LABELS[order.fulfillmentType as FulfillmentType]}</dd></div>
      </dl>
      <ul className="mt-6 divide-y divide-ink/10 border-y border-ink/10">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between py-3 text-sm">
            <span>{item.qty} × {item.productName} ({item.variantName})</span>
            <span>{formatCents(item.totalCents)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 space-y-1 text-sm">
        <p className="flex justify-between"><span>Subtotale</span><span>{formatCents(order.subtotalCents)}</span></p>
        {order.discountCents > 0 && <p className="flex justify-between"><span>Sconto</span><span>−{formatCents(order.discountCents)}</span></p>}
        {order.giftCardCents > 0 && <p className="flex justify-between"><span>Gift card</span><span>−{formatCents(order.giftCardCents)}</span></p>}
        <p className="flex justify-between"><span>Spedizione</span><span>{formatCents(order.shippingCents)}</span></p>
        <p className="flex justify-between font-semibold"><span>Totale</span><span>{formatCents(order.totalCents)}</span></p>
        {order.refundedCents > 0 && <p className="flex justify-between text-terracotta"><span>Rimborsato</span><span>−{formatCents(order.refundedCents)}</span></p>}
      </div>
      <p className="mt-8 text-xs text-ink/45">Documento informativo dello shop. Non sostituisce una fattura elettronica se dovuta.</p>
    </main>
  );
}
