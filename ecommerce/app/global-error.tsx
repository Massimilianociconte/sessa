"use client";

import { useEffect } from "react";

export default function GlobalError({
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
    <html lang="it">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#faf6ef",
          color: "#171412",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
        }}
      >
        <main style={{ width: "min(100%, 560px)", textAlign: "center" }}>
          <p style={{ margin: 0, color: "#a83f18", fontSize: "42px", fontFamily: "Georgia, serif" }}>
            Sessa 1930
          </p>
          <h1 style={{ margin: "16px 0 0", fontFamily: "Georgia, serif", fontSize: "clamp(34px, 7vw, 54px)" }}>
            Torniamo subito
          </h1>
          <p style={{ margin: "16px auto 0", maxWidth: "46ch", lineHeight: 1.65, color: "#5f5a55" }}>
            Lo shop non è riuscito ad avviare tutti i suoi servizi. Riprova senza perdere il contenuto del carrello.
          </p>
          {error.digest ? (
            <p style={{ margin: "12px 0 0", fontSize: "12px", color: "#77706a" }}>Codice: {error.digest}</p>
          ) : null}
          <div style={{ marginTop: "24px", display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "12px" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                border: 0,
                borderRadius: "999px",
                padding: "12px 22px",
                background: "#a83f18",
                color: "white",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              Riprova
            </button>
            <button
              type="button"
              onClick={() => window.location.assign("/")}
              style={{
                border: "1px solid #a83f18",
                borderRadius: "999px",
                padding: "12px 22px",
                background: "transparent",
                color: "#a83f18",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              Torna allo shop
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
