type ErrorWithCode = { name?: unknown; code?: unknown };

/** Metadati diagnostici senza messaggi Prisma/SMTP, query, token o credenziali. */
export function safeErrorMetadata(error: unknown): { name: string; code?: string } {
  if (typeof error !== "object" || error === null) return { name: "UnknownError" };
  const candidate = error as ErrorWithCode;
  const name = typeof candidate.name === "string" ? candidate.name.slice(0, 80) : "Error";
  const code = typeof candidate.code === "string" ? candidate.code.slice(0, 40) : undefined;
  return code ? { name, code } : { name };
}
