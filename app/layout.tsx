import type { Metadata } from "next";
import { Allura, Cormorant_Garamond, Manrope } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Sessa 1930 | Tradizione partenopea",
  description:
    "Esperienza editoriale per Sessa 1930, pasticceria partenopea nata a Ottaviano con sedi nei Mercati Centrali.",
  openGraph: {
    title: "Sessa 1930 | Tradizione partenopea",
    description:
      "Prodotti, sedi e storia reali dal sito ufficiale Sessa 1930, reinterpretati in una landing calda e contemporanea.",
    type: "website"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className={`${serif.variable} ${sans.variable} ${script.variable} font-sans`}>
        {children}
      </body>
    </html>
  );
}
