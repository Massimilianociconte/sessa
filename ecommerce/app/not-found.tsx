import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-ivory px-4 text-center">
      <div>
        <p className="font-script text-5xl text-terracotta">Sessa</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold">Pagina non trovata</h1>
        <p className="mt-2 text-ink/60">Il prodotto o la pagina che cerchi non è disponibile.</p>
        <Link href="/" className="btn-primary mt-6">
          Torna allo shop
        </Link>
      </div>
    </main>
  );
}
