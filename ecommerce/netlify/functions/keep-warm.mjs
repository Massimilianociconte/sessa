/**
 * Ping periodico anti cold-start: mantiene calda almeno un'istanza del server
 * handler Next (il cold start pesa ~5s: bundle grande + Prisma + TLS verso il
 * DB in un'altra regione). Il piano free non ha "provisioned concurrency",
 * quindi si scalda la lambda visitando una rotta reale che tocca il database.
 */
export default async () => {
  const base = process.env.URL ?? "https://sessa-ecommerce.netlify.app";
  try {
    const started = Date.now();
    const response = await fetch(`${base}/api/cart`, {
      headers: { "user-agent": "sessa-keep-warm" }
    });
    console.log(`[keep-warm] ${response.status} in ${Date.now() - started}ms`);
  } catch (error) {
    console.error("[keep-warm] ping fallito:", error);
  }
  return new Response("ok");
};

export const config = {
  schedule: "*/5 * * * *"
};
