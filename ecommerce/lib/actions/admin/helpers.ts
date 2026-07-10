import { redirect } from "next/navigation";
import type { ZodError } from "zod";

/** Redirect con messaggio di esito nel query param (?msg / ?err). */
export function backWithMessage(path: string, msg: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`);
}

export function backWithError(path: string, err: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}err=${encodeURIComponent(err)}`);
}

export function firstZodMessage(error: ZodError): string {
  const issue = error.issues[0];
  return issue ? `${String(issue.path[0] ?? "campo")}: ${issue.message}` : "Dati non validi";
}

export function requireString(formData: FormData, key: string, maxLength = 200): string {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Campo mancante: ${key}`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) throw new Error(`Campo non valido: ${key}`);
  return trimmed;
}
