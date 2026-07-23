import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://erereck.github.io/futbobo/"),
  title: "Futbobo — Sua carreira começa na base",
  description:
    "Construa uma carreira no futebol brasileiro dos 12 anos à aposentadoria.",
  icons: {
    icon: "favicon.svg",
    shortcut: "favicon.svg",
  },
  manifest: "manifest.webmanifest",
  openGraph: {
    title: "Futbobo — Sua carreira começa na base",
    description:
      "Escolha um clube, conquiste seu espaço e escreva sua história no Brasileirão.",
    type: "website",
    url: "https://erereck.github.io/futbobo/",
    siteName: "Futbobo",
    images: [{ url: "og.png", width: 1200, height: 630, alt: "Futbobo — Sua carreira começa na base" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Futbobo — Sua carreira começa na base",
    description: "Dos 12 anos ao topo do futebol brasileiro.",
    images: ["og.png"],
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
