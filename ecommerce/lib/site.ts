/** URL pubblico del negozio, normalizzato (senza slash finale). */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001").replace(
  /\/$/,
  ""
);
