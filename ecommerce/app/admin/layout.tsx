import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: {
    default: "Gestionale | Sessa 1930",
    template: "%s | Gestionale Sessa"
  },
  manifest: "/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: "Sessa Gestionale",
    statusBarStyle: "default"
  }
};

export const viewport: Viewport = {
  themeColor: "#D65A1F"
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
