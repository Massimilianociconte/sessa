"use client";

import { useRef, useState } from "react";

export default function CopyField({ value }: { value: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"copied" | "selected" | null>(null);

  async function copy() {
    inputRef.current?.select();
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        setStatus("copied");
      } else if (document.execCommand("copy")) {
        setStatus("copied");
      } else {
        setStatus("selected");
      }
    } catch {
      setStatus("selected");
    }
    setTimeout(() => setStatus(null), 1800);
  }

  return (
    <div className="copy-field">
      <input ref={inputRef} readOnly value={value} className="input-field font-mono text-sm" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" onClick={copy} className="btn-secondary shrink-0">
        {status === "copied" ? "Copiato!" : status === "selected" ? "Selezionato" : "Copia"}
      </button>
    </div>
  );
}
