import Footer from "@/components/storefront/Footer";
import Header from "@/components/storefront/Header";
import type { LegalDocument } from "@/lib/legal/documents";

export default function LegalPage({ document, complete }: { document: LegalDocument; complete: boolean }) {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-serif text-4xl font-semibold">{document.title}</h1>
        <p className="mt-2 text-sm text-ink/60">{document.intro}</p>
        {!complete && (
          <p className="mt-4 rounded-xl bg-majolica/20 px-4 py-3 text-sm font-semibold text-ink/75" role="status">
            Alcuni dati aziendali sono in fase di configurazione.
          </p>
        )}
        <nav aria-label="Indice" className="mt-6 rounded-2xl border border-ink/10 bg-white p-4 text-sm">
          <ul className="grid gap-1 sm:grid-cols-2">
            {document.sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-terracotta hover:underline">
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {document.sections.map((section) => (
          <section key={section.id} id={section.id} className="mt-8 scroll-mt-24">
            <h2 className="font-serif text-2xl font-semibold">{section.title}</h2>
            <div className="mt-3 space-y-3 text-[15px] leading-7 text-ink/80">
              {section.blocks.map((block, index) =>
                block.type === "p" ? (
                  <p key={index}>{block.text}</p>
                ) : block.type === "ul" ? (
                  <ul key={index} className="list-disc space-y-1 pl-5">
                    {block.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <div key={index} className="overflow-x-auto">
                    <table className="w-full min-w-[480px] border-collapse text-sm">
                      <thead>
                        <tr>
                          {block.head.map((cell) => (
                            <th key={cell} className="border-b border-ink/15 py-2 pr-3 text-left font-semibold">
                              {cell}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {block.rows.map((row) => (
                          <tr key={row.join("|")} className="border-b border-ink/5">
                            {row.map((cell, cellIndex) => (
                              <td key={cellIndex} className="py-2 pr-3 align-top">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          </section>
        ))}
      </main>
      <Footer />
    </>
  );
}
