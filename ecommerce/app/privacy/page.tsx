import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import { getLegalContext } from "@/lib/legal/context";
import { privacyPolicy } from "@/lib/legal/documents";
import { SITE_URL } from "@/lib/site";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Informativa privacy",
  description: "Come Sessa 1930 tratta i dati personali di clienti e visitatori dello shop online.",
  alternates: { canonical: `${SITE_URL}/privacy` }
};

export default async function Page() {
  const context = await getLegalContext();
  return <LegalPage document={privacyPolicy(context)} complete={context.legal.complete} />;
}
