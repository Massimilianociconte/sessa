import Link from "next/link";
import { requireAdminCapability } from "@/lib/auth/session";
import { getMerchantReadiness, merchantFeedUrls } from "@/lib/merchant/google-feeds";

export const dynamic = "force-dynamic";
export const metadata = { title: "Google Merchant Center" };

export default async function MerchantCenterPage() {
  await requireAdminCapability("merchant:manage");
  const readiness = await getMerchantReadiness();
  const urls = merchantFeedUrls();
  const blockers =
    readiness.missingStoreCode.length +
    readiness.invalidStoreCode.length +
    readiness.missingImage.length +
    readiness.missingDescription.length +
    (readiness.tokenConfigured ? 0 : 1) +
    (readiness.enabledLocations > 0 ? 0 : 1);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-terracotta">Canale Google</p><h1 className="mt-1 font-serif text-3xl font-semibold">Merchant Center</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-ink/55">Feed primario e inventario locale condividono lo SKU variante. Prezzi e quantità arrivano dallo stesso assortimento per sede usato dal checkout.</p></div>
        <span className={`badge ${blockers === 0 ? "bg-brilliant/10 text-emerald-800" : "bg-majolica/30 text-yellow-900"}`}>{blockers === 0 ? "Pronto alla connessione" : `${blockers} verifiche richieste`}</span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Sedi abilitate</p><p className="mt-1 font-serif text-3xl font-semibold">{readiness.enabledLocations}/{readiness.locations.length}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Prodotti</p><p className="mt-1 font-serif text-3xl font-semibold">{readiness.productCount}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Varianti / ID</p><p className="mt-1 font-serif text-3xl font-semibold">{readiness.variantCount}</p></div>
        <div className="card p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink/45">Token feed</p><p className="mt-2 font-semibold">{readiness.tokenConfigured ? "Configurato" : "Da configurare"}</p></div>
      </div>

      <section className="card mt-6 p-6">
        <h2 className="font-serif text-2xl font-semibold">Sorgenti dati pianificate</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink/55">Inserisci questi URL come sorgenti pianificate in Merchant Center. Il token impedisce download anonimi delle quantità locali e deve restare segreto.</p>
        {urls ? (
          <div className="mt-4 space-y-4">
            <div><label className="label-field">Prodotti</label><input readOnly value={urls.products} className="input-field font-mono text-xs" /></div>
            <div><label className="label-field">Inventario locale</label><input readOnly value={urls.localInventory} className="input-field font-mono text-xs" /></div>
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-terracotta/10 px-4 py-3 text-sm font-semibold text-terracotta">Imposta `MERCHANT_FEED_TOKEN` con almeno 32 caratteri nelle variabili Netlify e ridistribuisci il sito.</p>
        )}
      </section>

      <section className="card mt-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-serif text-2xl font-semibold">Qualità catalogo</h2><p className="mt-1 text-sm text-ink/55">Un prodotto senza immagine non entra nei feed; gli store code devono corrispondere esattamente al Business Profile.</p></div><div className="flex gap-2"><Link href="/admin/sedi" className="btn-secondary">Configura sedi</Link><Link href="/admin/prodotti" className="btn-primary">Rivedi prodotti</Link></div></div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div><p className="text-sm font-semibold">Store code mancanti</p><p className="mt-1 text-sm text-ink/55">{readiness.missingStoreCode.length ? readiness.missingStoreCode.map((item) => item.name).join(", ") : "Nessuno"}</p></div>
          <div><p className="text-sm font-semibold">Store code non validi</p><p className="mt-1 text-sm text-ink/55">{readiness.invalidStoreCode.length ? readiness.invalidStoreCode.map((item) => item.name).join(", ") : "Nessuno"}</p></div>
          <div><p className="text-sm font-semibold">Immagini mancanti</p><p className="mt-1 text-sm text-ink/55">{readiness.missingImage.length ? readiness.missingImage.map((item) => item.name).join(", ") : "Nessuna"}</p></div>
          <div><p className="text-sm font-semibold">Descrizioni mancanti</p><p className="mt-1 text-sm text-ink/55">{readiness.missingDescription.length ? readiness.missingDescription.map((item) => item.name).join(", ") : "Nessuna"}</p></div>
        </div>
      </section>
    </>
  );
}
