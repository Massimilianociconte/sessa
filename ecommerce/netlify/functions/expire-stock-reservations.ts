import type { Config } from "@netlify/functions";

const expireStockReservations = async () => {
  const siteUrl = Netlify.env.get("URL");
  const secret = Netlify.env.get("MAINTENANCE_SECRET");
  if (!siteUrl || !secret) throw new Error("Stock worker configuration missing");
  const response = await fetch(`${siteUrl.replace(/\/$/, "")}/api/internal/jobs/stock-reservations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(25_000)
  });
  if (!response.ok) throw new Error(`Stock worker failed with status ${response.status}`);
  const result = await response.json();
  console.log(JSON.stringify({ worker: "stock-reservations", result }));
};

export default expireStockReservations;

export const config: Config = { schedule: "*/5 * * * *" };
