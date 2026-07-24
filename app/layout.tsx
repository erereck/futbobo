import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://erereck.github.io/futbobo/"),
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
    url: "https://erereck.github.io/futbobo/",
    siteName: "Futbobo",
    images: [{ url: "og-v5.png", width: 1200, height: 630, alt: "Futbobo — Sua carreira, seu legado" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Futbobo — Sua carreira, seu legado",
    description: "Metas, contratos, treinador, rivalidades e 46 conquistas em uma carreira mundial.",
    images: ["og-v5.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1f17",
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
      <body>{children}</body>
    </html>
  );
}
