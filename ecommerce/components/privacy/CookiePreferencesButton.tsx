"use client";

import { OPEN_CONSENT_EVENT } from "@/lib/consent";

export default function CookiePreferencesButton() {
  return (
    <button
      type="button"
      className="text-left hover:text-terracotta"
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
    >
      Preferenze cookie
    </button>
  );
}
