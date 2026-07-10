/** Accetta solo path locali del perimetro richiesto; blocca open redirect e backslash. */
export function safeNextPath(
  value: FormDataEntryValue | string | null | undefined,
  allowedPrefix: "/account" | "/admin",
  fallback: string
): string {
  if (typeof value !== "string") return fallback;
  const candidate = value.trim();
  if (candidate.length > 512) return fallback;
  if (
    !candidate.startsWith(`${allowedPrefix}/`) &&
    candidate !== allowedPrefix
  ) {
    return fallback;
  }
  if (candidate.startsWith("//") || candidate.includes("\\") || /[\u0000-\u001f\u007f]/.test(candidate)) {
    return fallback;
  }
  return candidate;
}
