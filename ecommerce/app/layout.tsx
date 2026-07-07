import type { Metadata, Viewport } from "next";
import { Allura, Cormorant_Garamond, Manrope } from "next/font/google";
import Script from "next/script";
import PwaRegister from "@/components/PwaRegister";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const serif = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  weight: ["400", "500", "600", "700"]
});

const sans = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: ["400", "500", "600", "700"]
});

const script = Allura({
  subsets: ["latin"],
  variable: "--font-script",
  display: "swap",
  weight: "400"
});

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Shop | Sessa 1930",
    template: "%s | Sessa 1930"
  },
  description:
    "Lo shop online di Sessa 1930: sfogliatelle, grandi lievitati e pasticceria partenopea dal laboratorio di Ottaviano.",
  applicationName: "Sessa 1930 Shop",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Sessa 1930",
    statusBarStyle: "black-translucent"
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" }
    ],
    apple: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ]
  },
  formatDetection: {
    telephone: true,
    email: true,
    address: true
  },
  other: {
    "apple-mobile-web-app-capable": "yes"
  },
  openGraph: {
    type: "website",
    siteName: "Sessa 1930",
    locale: "it_IT"
  }
};

export const viewport: Viewport = {
  themeColor: "#D65A1F",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: alcune estensioni del browser iniettano attributi
    // su <html> (es. crxlauncher) prima dell'idratazione; è innocuo e va ignorato.
    <html lang="it" suppressHydrationWarning>
      <body className={`${serif.variable} ${sans.variable} ${script.variable} font-sans antialiased`}>
        {GA_ID && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
            <Script id="sessa-ga4" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                window.gtag = gtag;
                gtag('js', new Date());
                gtag('config', '${GA_ID}', { send_page_view: true });
              `}
            </Script>
          </>
        )}
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
