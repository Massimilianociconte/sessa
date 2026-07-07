import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
];

const noStoreHeaders = [
  ...securityHeaders,
  { key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" },
  { key: "CDN-Cache-Control", value: "no-store" },
  { key: "Cloudflare-CDN-Cache-Control", value: "no-store" }
];

const longStaticHeaders = [
  ...securityHeaders,
  { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
  { key: "CDN-Cache-Control", value: "public, max-age=31536000, immutable" },
  { key: "Cloudflare-CDN-Cache-Control", value: "public, max-age=31536000, immutable" }
];

const productImageHeaders = [
  ...securityHeaders,
  { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
  { key: "CDN-Cache-Control", value: "public, max-age=604800, stale-while-revalidate=604800" },
  { key: "Cloudflare-CDN-Cache-Control", value: "public, max-age=604800, stale-while-revalidate=604800" }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: noStoreHeaders },
      { source: "/checkout", headers: noStoreHeaders },
      { source: "/checkout/:path*", headers: noStoreHeaders },
      { source: "/carrello", headers: noStoreHeaders },
      { source: "/carrello/:path*", headers: noStoreHeaders },
      { source: "/account", headers: noStoreHeaders },
      { source: "/account/:path*", headers: noStoreHeaders },
      { source: "/admin", headers: noStoreHeaders },
      { source: "/admin/:path*", headers: noStoreHeaders },
      { source: "/ordine/:path*", headers: noStoreHeaders },
      { source: "/icons/:path*", headers: longStaticHeaders },
      { source: "/brand/:path*", headers: longStaticHeaders },
      { source: "/patterns/:path*", headers: longStaticHeaders },
      { source: "/images/stickers/:path*", headers: longStaticHeaders },
      { source: "/images/products/:path*", headers: productImageHeaders },
      {
        source: "/manifest.webmanifest",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }
        ]
      },
      {
        source: "/sw.js",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" }
        ]
      },
      {
        source: "/offline.html",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "no-cache, must-revalidate" }
        ]
      }
    ];
  },
  // L'app vive in una sottocartella del repo padre (che ha un suo lockfile):
  // fisso la root così file tracing e turbopack usano questa cartella.
  turbopack: {
    root: projectRoot
  },
  outputFileTracingRoot: projectRoot
};

export default nextConfig;
