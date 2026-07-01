import { brandFacts, imageCredits, socialLinks } from "@/data/site-content";
import { SessaSignature } from "@/components/SessaSignature";

export function Footer() {
  return (
    <footer className="relative z-[80] overflow-hidden bg-ink text-ivory">
      <div className="mx-auto grid max-w-[1320px] gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1fr_1fr_1fr] lg:px-12">
        <div>
          <SessaSignature
            ariaLabel="Sessa"
            className="h-auto w-[180px] sm:w-[210px]"
            tail="short"
          />
          <p className="mt-5 max-w-sm text-sm leading-7 text-ivory/[0.64]">
            Sessa 1930. Tradizione partenopea, cura al dettaglio, qualità e passione.
          </p>
        </div>
        <address className="not-italic text-sm leading-7 text-ivory/[0.72]">
          {brandFacts.address}
          <br />
          <a className="hover:text-white" href={`tel:${brandFacts.phone.replace(/\s/g, "")}`}>
            {brandFacts.phone}
          </a>
          <br />
          <a className="hover:text-white" href={`mailto:${brandFacts.email}`}>
            {brandFacts.email}
          </a>
          <br />
          <span className="mt-4 inline-block">{brandFacts.ottavianoHours}</span>
          <br />
          {brandFacts.marketHours}
        </address>
        <div className="text-sm leading-7 text-ivory/[0.72] md:text-right">
          <div className="flex flex-wrap gap-5 md:justify-end">
            {socialLinks.map((link) => (
              <a
                key={link.href}
                className="hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream"
                href={link.href}
                target="_blank"
                rel="noreferrer"
              >
                {link.label}
              </a>
            ))}
          </div>
          <p className="mt-8 text-xs text-ivory/[0.45]">
            {brandFacts.vat}
            <br />
            Fonti:{" "}
            {imageCredits.map((credit, index) => (
              <span key={credit.href}>
                <a className="underline-offset-4 hover:underline" href={credit.href}>
                  {credit.label}
                </a>
                {index < imageCredits.length - 1 ? ", " : "."}
              </span>
            ))}
          </p>
        </div>
      </div>
    </footer>
  );
}
