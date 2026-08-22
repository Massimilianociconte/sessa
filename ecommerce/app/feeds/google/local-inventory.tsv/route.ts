import { buildGoogleLocalInventoryFeed, authorizeMerchantFeed } from "@/lib/merchant/google-feeds";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!authorizeMerchantFeed(request)) return new Response("Unauthorized", { status: 401 });
  return new Response(await buildGoogleLocalInventoryFeed(), {
    headers: {
      "Content-Type": "text/tab-separated-values; charset=utf-8",
      "Content-Disposition": "inline; filename=google-local-inventory.tsv",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
