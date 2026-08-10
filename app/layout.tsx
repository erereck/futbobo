import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./premium.css";

const manrope = localFont({
  src: "../public/fonts/manrope-latin.woff2",
  variable: "--font-manrope",
  weight: "400 800",
  display: "swap",
});

const barlowCondensed = localFont({
  src: [
    { path: "../public/fonts/barlow-condensed-600.woff2", weight: "600" },
    { path: "../public/fonts/barlow-condensed-700.woff2", weight: "700" },
    { path: "../public/fonts/barlow-condensed-800.woff2", weight: "800" },
    { path: "../public/fonts/barlow-condensed-900.woff2", weight: "900" },
  ],
  variable: "--font-barlow-condensed",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://futbobo.top/"),
  title: "Futbobo — Sua carreira, seu legado",
  description:
    "Construa uma carreira dos 12 anos à aposentadoria: contratos, metas, rivalidades, 402 clubes, 22 ligas e as maiores competições do mundo.",
  icons: {
    icon: "favicon.svg",
    shortcut: "favicon.svg",
  },
  manifest: "manifest.webmanifest",
  openGraph: {
    title: "Futbobo — Sua carreira, seu legado",
    description:
      "Contratos, treinador, rivalidades, conquistas, Brasil, Europa e Seleção. Cada carreira vira uma história diferente.",
    type: "website",
    url: "https://futbobo.top/",
    siteName: "Futbobo",
    images: [{ url: "og-v6.png", width: 1200, height: 630, alt: "Futbobo — Sua carreira, seu legado" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Futbobo — Sua carreira, seu legado",
    description: "Metas, contratos, treinador, rivalidades e 46 conquistas em uma carreira mundial.",
    images: ["og-v6.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#07110d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${manrope.variable} ${barlowCondensed.variable}`}>{children}</body>
    </html>
  );
}
