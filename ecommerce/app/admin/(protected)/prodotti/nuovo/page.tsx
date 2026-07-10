import Link from "next/link";
import Flash from "@/components/admin/Flash";
import ProductFields from "@/components/admin/ProductFields";
import { createProductAction } from "@/lib/actions/admin/products";
import { prisma } from "@/lib/db";
import { requireAdminCapability } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Nuovo prodotto" };

export default async function NewProductPage({
  searchParams
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  await requireAdminCapability("catalog:manage");
  const { err } = await searchParams;
  const categories = await prisma.category.findMany({ orderBy: { position: "asc" } });

  return (
    <>
      <div className="flex items-center gap-3">
        <Link href="/admin/prodotti" className="btn-ghost text-sm">
          ← Prodotti
        </Link>
        <h1 className="font-serif text-3xl font-semibold">Nuovo prodotto</h1>
      </div>
      <div className="mt-4">
        <Flash err={err} />
      </div>

      <form action={createProductAction} className="card mt-4 max-w-3xl space-y-6 p-6">
        <ProductFields categories={categories} />
        <button type="submit" className="btn-primary">
          Crea prodotto
        </button>
        <p className="text-xs text-ink/40">
          Le varianti (prezzi e stock) si aggiungono nella pagina del prodotto dopo la creazione.
        </p>
      </form>
    </>
  );
}
