function fullyDecodeUri(value: string): string | null {
  let current = value;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(current);
      if (next === current) return next;
      current = next;
    } catch {
      return null;
    }
  }
  return current;
}

function normalizeLocalPath(pathname: string): string | null {
  const segments: string[] = [];
  for (const part of pathname.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(part);
  }
  return `/${segments.join("/")}`;
}

/** Accetta solo path locali del perimetro richiesto; blocca open redirect e traversal. */
export function safeNextPath(
  value: FormDataEntryValue | string | null | undefined,
  allowedPrefix: "/account" | "/admin",
  fallback: string
): string {
  if (typeof value !== "string") return fallback;
  const candidate = value.trim();
  if (candidate.length > 512) return fallback;
  if (candidate.startsWith("//") || candidate.includes("\\") || /[\u0000-\u001f\u007f]/.test(candidate)) {
    return fallback;
  }

  const decoded = fullyDecodeUri(candidate);
  if (!decoded || decoded.includes("\\") || decoded.startsWith("//") || /[\u0000-\u001f\u007f]/.test(decoded)) {
    return fallback;
  }

  const queryIndex = decoded.search(/[?#]/);
  const rawPath = queryIndex >= 0 ? decoded.slice(0, queryIndex) : decoded;
  const suffix = queryIndex >= 0 ? decoded.slice(queryIndex) : "";
  if (suffix.includes("//") || suffix.includes("\\")) return fallback;

  const normalized = normalizeLocalPath(rawPath);
  if (!normalized) return fallback;
  if (normalized !== allowedPrefix && !normalized.startsWith(`${allowedPrefix}/`)) {
    return fallback;
  }
  return `${normalized}${suffix}`;
}
