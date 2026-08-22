import Link from "next/link";
import CookiePreferencesButton from "@/components/privacy/CookiePreferencesButton";
import { getSetting } from "@/lib/services/settings";

export default async function Footer({
  location
}: {
  location?: { address: string; city: string; postalCode?: string; phone?: string | null; name?: string };
}) {
  const [name, address, phone, email, vat] = await Promise.all([
    getSetting("store.name", "Sessa 1930"),
    getSetting("store.address", ""),
    getSetting("store.phone", ""),
    getSetting("store.email", ""),
    getSetting("store.vat", "")
  ]);
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
          <p className="mt-4 text-xs text-ink/40">{vat}</p>
        </div>
      </div>
    </footer>
  );
}
