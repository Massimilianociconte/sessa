"use client";

import { useState } from "react";

export default function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard non disponibile */
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input readOnly value={value} className="input-field font-mono text-sm" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" onClick={copy} className="btn-secondary shrink-0">
        {copied ? "Copiato!" : "Copia"}
      </button>
    </div>
  );
}
