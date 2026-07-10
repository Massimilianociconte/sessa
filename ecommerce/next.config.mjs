import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const contentSecurityPolicy = [
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : [])
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy
  }
];

const noStoreHeaders = [
  ...securityHeaders,
  { key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" },
  { key: "CDN-Cache-Control", value: "no-store" },
  { key: "Cloudflare-CDN-Cache-Control", value: "no-store" }
];

// Questi URL pubblici non hanno hash nel nome: un anno + immutable renderebbe
// invisibile una sostituzione di logo/icona/immagine dopo un deploy.
const publicAssetHeaders = [
  ...securityHeaders,
  { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
  { key: "CDN-Cache-Control", value: "public, max-age=604800, stale-while-revalidate=604800" },
  { key: "Cloudflare-CDN-Cache-Control", value: "public, max-age=604800, stale-while-revalidate=604800" }
];

const productImageHeaders = [
  ...securityHeaders,
  { key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" },
  { key: "CDN-Cache-Control", value: "public, max-age=604800, stale-while-revalidate=604800" },
  { key: "Cloudflare-CDN-Cache-Control", value: "public, max-age=604800, stale-while-revalidate=604800" }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
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
      { source: "/icons/:path*", headers: publicAssetHeaders },
      { source: "/brand/:path*", headers: publicAssetHeaders },
      { source: "/patterns/:path*", headers: publicAssetHeaders },
      { source: "/images/stickers/:path*", headers: publicAssetHeaders },
      { source: "/images/sfondo-sedi/:path*", headers: publicAssetHeaders },
      { source: "/images/404/:path*", headers: publicAssetHeaders },
      { source: "/images/products/:path*", headers: productImageHeaders },
      {
        source: "/manifest.webmanifest",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" }
        ]
      },
      {
        source: "/admin.webmanifest",
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
