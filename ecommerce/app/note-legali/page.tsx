import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import { getLegalContext } from "@/lib/legal/context";
import { legalNotes } from "@/lib/legal/documents";
import { SITE_URL } from "@/lib/site";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Note legali",
  description: "Dati del gestore dello shop online Sessa 1930.",
  alternates: { canonical: `${SITE_URL}/note-legali` }
};

export default async function Page() {
  const context = await getLegalContext();
  return <LegalPage document={legalNotes(context)} complete={context.legal.complete} />;
}
