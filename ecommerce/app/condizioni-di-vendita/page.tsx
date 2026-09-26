import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import { getLegalContext } from "@/lib/legal/context";
import { salesConditions } from "@/lib/legal/documents";
import { SITE_URL } from "@/lib/site";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Condizioni di vendita",
  description: "Condizioni generali di vendita dello shop Sessa 1930: ordini, pagamenti, ritiro e consegna, recesso e rimborsi.",
  alternates: { canonical: `${SITE_URL}/condizioni-di-vendita` }
};

export default async function Page() {
  const context = await getLegalContext();
  return <LegalPage document={salesConditions(context)} complete={context.legal.complete} />;
}
