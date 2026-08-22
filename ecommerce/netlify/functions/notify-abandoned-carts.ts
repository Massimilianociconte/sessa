import type { Config } from "@netlify/functions";

const notifyAbandonedCarts = async () => {
  const siteUrl = Netlify.env.get("URL");
  const secret = Netlify.env.get("MAINTENANCE_SECRET");
  if (!siteUrl || !secret) throw new Error("Abandoned cart worker configuration missing");
  const response = await fetch(`${siteUrl.replace(/\/$/, "")}/api/internal/jobs/abandoned-carts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(25_000)
  });
  if (!response.ok) throw new Error(`Abandoned cart worker failed with status ${response.status}`);
};

export default notifyAbandonedCarts;
export const config: Config = { schedule: "0 * * * *" };
