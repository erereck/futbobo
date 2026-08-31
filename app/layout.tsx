import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./premium.css";
import "./mobile-career-nav.css";

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
  title: {
    default: "Futbobo — Simulador de Carreira de Jogador de Futebol",
    template: "%s | Futbobo",
  },
  description:
    "Crie seu jogador aos 12 anos, dispute 36 ligas e 139 seleções, jogue finais no futebol de botão e construa uma carreira única. Grátis no navegador.",
  applicationName: "Futbobo",
  authors: [{ name: "EriLab", url: "https://futbobo.top/" }],
  creator: "EriLab",
  publisher: "EriLab",
  category: "games",
  classification: "Jogo de esporte e simulação",
  keywords: [
    "Futbobo",
    "simulador de carreira de jogador",
    "jogo de futebol online",
    "modo carreira jogador",
    "simulador de futebol brasileiro",
    "futebol de botão",
    "jogo de Copa do Mundo",
    "jogo de futebol para navegador",
    "jogo de futebol grátis",
  ],
  alternates: {
    canonical: "/",
    languages: { "pt-BR": "/" },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: "favicon.svg",
    shortcut: "favicon.svg",
  },
  manifest: "manifest.webmanifest",
  openGraph: {
    title: "Futbobo — Simulador de Carreira de Jogador de Futebol",
    description:
      "Dos 12 anos à aposentadoria: 637 clubes, 36 ligas, 139 seleções, decisões, transferências e finais jogáveis no futebol de botão.",
    type: "website",
    url: "https://futbobo.top/",
    siteName: "Futbobo",
    locale: "pt_BR",
    images: [{ url: "og-v6.png", width: 1200, height: 630, alt: "Futbobo — Sua carreira, seu legado" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Futbobo — Simulador de Carreira de Jogador de Futebol",
    description: "Crie seu jogador, construa uma carreira mundial e jogue as maiores finais no futebol de botão.",
    images: ["og-v6.png"],
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "VideoGame",
  name: "Futbobo",
  alternateName: "Futbobo: Sua carreira, seu legado",
  url: "https://futbobo.top/",
  image: "https://futbobo.top/og-v6.png",
  description:
    "Simulador brasileiro de carreira de jogador de futebol, dos 12 anos à aposentadoria, com 637 clubes, 36 ligas, 139 seleções e partidas jogáveis de futebol de botão.",
  genre: ["Esporte", "Simulação", "RPG"],
  gamePlatform: ["Navegador", "Android", "Windows"],
  operatingSystem: ["Web", "Android", "Windows"],
  applicationCategory: "Game",
  inLanguage: "pt-BR",
  playMode: ["SinglePlayer", "MultiPlayer"],
  isAccessibleForFree: true,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "BRL",
    availability: "https://schema.org/InStock",
  },
  author: { "@type": "Organization", name: "EriLab" },
  publisher: { "@type": "Organization", name: "EriLab" },
  datePublished: "2026-07-21",
  dateModified: "2026-08-11",
};

export const viewport: Viewport = {
  themeColor: "#07110d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${manrope.variable} ${barlowCondensed.variable}`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        {children}
      </body>
    </html>
  );
}
