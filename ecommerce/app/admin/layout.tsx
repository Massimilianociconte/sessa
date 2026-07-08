import type { Metadata, Viewport } from "next";

/**
 * Segment layout dell'intero gestionale (/admin/*): sovrascrive manifest,
 * icone e colori così Android/iOS installano "Sessa Gestionale" come app
 * separata dallo shop (scope /admin, icona blu ceramica dedicata).
 */
export const metadata: Metadata = {
  title: {
    default: "Gestionale | Sessa 1930",
    template: "%s | Gestionale Sessa"
  },
  manifest: "/admin.webmanifest",
  applicationName: "Sessa Gestionale",
  appleWebApp: {
    capable: true,
    title: "Sessa Gestionale",
    statusBarStyle: "default"
  },
  icons: {
    icon: [
      { url: "/icons/admin-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/admin-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/icons/admin-192.png", sizes: "192x192", type: "image/png" }]
  },
  robots: { index: false, follow: false }
};

export const viewport: Viewport = {
  themeColor: "#1F4E79",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
