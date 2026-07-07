"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-ivory px-4 text-center">
      <div>
        <p className="font-script text-5xl text-terracotta">Sessa</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold">Qualcosa è andato storto</h1>
        <p className="mt-2 text-ink/60">Riprova tra un istante.</p>
        <button onClick={reset} className="btn-primary mt-6">
          Riprova
        </button>
      </div>
    </main>
  );
}
