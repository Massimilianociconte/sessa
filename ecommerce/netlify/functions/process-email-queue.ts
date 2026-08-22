import type { Config } from "@netlify/functions";

const processEmailQueue = async () => {
  const siteUrl = Netlify.env.get("URL");
  const secret = Netlify.env.get("MAINTENANCE_SECRET");
  if (!siteUrl || !secret) throw new Error("Email worker configuration missing");
  const response = await fetch(`${siteUrl.replace(/\/$/, "")}/api/internal/jobs/email`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(25_000)
  });
  if (!response.ok) throw new Error(`Email worker failed with status ${response.status}`);
  const result = await response.json();
  console.log(JSON.stringify({ worker: "email", result }));
};

export default processEmailQueue;

export const config: Config = { schedule: "* * * * *" };
