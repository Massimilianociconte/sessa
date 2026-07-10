export const REDACTED_EMAIL_BODY =
  "[Contenuto rimosso dopo il tentativo di consegna per proteggere dati personali e token.]";

export function retainedEmailBody(body: string, environment = process.env.NODE_ENV): string {
  return environment === "production" ? REDACTED_EMAIL_BODY : body;
}
