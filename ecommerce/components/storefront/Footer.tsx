import Link from "next/link";
import CookiePreferencesButton from "@/components/privacy/CookiePreferencesButton";
import { getSetting } from "@/lib/services/settings";
import { getLegalInfo } from "@/lib/services/commerce-settings";

export default async function Footer({
  location
}: {
  location?: { address: string; city: string; postalCode?: string; phone?: string | null; name?: string };
}) {
  const [name, address, phone, email, vat, legal] = await Promise.all([
    getSetting("store.name", "Sessa 1930"),
    getSetting("store.address", ""),
    getSetting("store.phone", ""),
    getSetting("store.email", ""),
    getSetting("store.vat", ""),
    getLegalInfo()
  ]);
  // Dati obbligatori del gestore (D.Lgs. 70/2003): ragione sociale e P.IVA.
  const companyLine = legal["legal.companyName"]
    ? `${legal["legal.companyName"]}${legal["legal.vatNumber"] ? ` · P.IVA ${legal["legal.vatNumber"]}` : ""}${legal["legal.rea"] ? ` · REA ${legal["legal.rea"]}` : ""}`
    : vat;
  const contactAddress = location
    ? `${location.address}${location.postalCode ? `, ${location.postalCode}` : ""} ${location.city}`
    : address;
  const contactPhone = location?.phone || (!location ? phone : "");
  const contactLabel = location?.name ?? "Contatti";

  return (
    <footer className="mt-20 border-t border-terracotta/15 bg-white/50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-3">
        <div>
          <p className="font-script text-3xl text-terracotta">{name}</p>
          <p className="mt-2 max-w-xs text-sm text-ink/60">
            Pasticceria partenopea dal 1930. Un'esplosione di gusto e felicità.
          </p>
        </div>
        <div className="text-sm text-ink/70">
          <p className="font-semibold uppercase tracking-wide text-ink/50">{contactLabel}</p>
          <p className="mt-2">{contactAddress}</p>
          {contactPhone && <p>{contactPhone}</p>}
          <p>{email}</p>
        </div>
        <div className="text-sm text-ink/70">
          <p className="font-semibold uppercase tracking-wide text-ink/50">Il tuo account</p>
          <p className="mt-2 flex flex-col gap-1">
            <Link href="/account" className="hover:text-terracotta">Area personale</Link>
            <Link href="/account/ordini" className="hover:text-terracotta">I miei ordini</Link>
            <Link href="/account/invita" className="hover:text-terracotta">Invita un amico</Link>
            <CookiePreferencesButton />
          </p>
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-ink/10 px-4 py-5 text-xs text-ink/50">
        <p>{companyLine}</p>
        <nav aria-label="Informazioni legali" className="flex flex-wrap gap-x-4 gap-y-1">
          <Link href="/condizioni-di-vendita" className="hover:text-terracotta">Condizioni di vendita</Link>
          <Link href="/privacy" className="hover:text-terracotta">Privacy</Link>
          <Link href="/cookie" className="hover:text-terracotta">Cookie</Link>
          <Link href="/note-legali" className="hover:text-terracotta">Note legali</Link>
        </nav>
      </div>
    </footer>
  );
}
