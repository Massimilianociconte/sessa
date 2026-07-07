import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Pagine private/transazionali fuori dall'indice.
        disallow: ["/admin", "/checkout", "/carrello", "/ordine/"]
      }
    ],
    sitemap: `${SITE_URL}/sitemap.xml`
  };
}
