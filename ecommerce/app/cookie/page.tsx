import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import { cookiePolicy } from "@/lib/legal/documents";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Cookie policy",
  description: "Cookie tecnici e statistici usati dallo shop Sessa 1930 e gestione del consenso.",
  alternates: { canonical: `${SITE_URL}/cookie` }
};

export default function Page() {
  return <LegalPage document={cookiePolicy()} complete />;
}
