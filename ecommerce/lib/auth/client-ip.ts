import { isIP } from "node:net";

/**
 * IP del client da header dell'hosting. Su Netlify `x-nf-client-connection-ip`
 * e impostato dalla CDN e non falsificabile. Se davanti c'e Cloudflare, quel
 * valore diventa l'IP del nodo Cloudflare (condiviso da migliaia di clienti):
 * con TRUSTED_PROXY=cloudflare si usa `cf-connecting-ip`. Senza il flag
 * `cf-connecting-ip` viene ignorato, perche chiunque potrebbe inviarlo.
 */
function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  let candidate = value.split(",")[0]?.trim() ?? "";
  if (candidate.startsWith("[") && candidate.includes("]")) {
    candidate = candidate.slice(1, candidate.indexOf("]"));
  } else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.slice(0, candidate.lastIndexOf(":"));
  }
  return isIP(candidate) ? candidate.toLowerCase() : null;
}

export function clientIpFromHeaders(headers: Headers, env: NodeJS.ProcessEnv = process.env): string {
  const behindCloudflare = env.TRUSTED_PROXY === "cloudflare";
  const candidates = behindCloudflare
    ? [headers.get("cf-connecting-ip"), headers.get("x-nf-client-connection-ip")]
    : [headers.get("x-nf-client-connection-ip"), headers.get("x-real-ip"), headers.get("x-forwarded-for")];
  for (const candidate of candidates) {
    const normalized = normalizeIp(candidate);
    if (normalized) return normalized;
  }
  return "unknown";
}
