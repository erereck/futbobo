import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://erereck.github.io/futbobo/"),
  title: "Futbobo — Do Brasil ao mundo",
  description:
    "Construa uma carreira dos 12 anos à aposentadoria, atravesse oito ligas e defenda sua Seleção nas maiores competições do mundo.",
  icons: {
    icon: "favicon.svg",
    shortcut: "favicon.svg",
  },
  manifest: "manifest.webmanifest",
  openGraph: {
    title: "Futbobo — A carreira agora é mundial",
    description:
      "Comece na base brasileira, conquiste a Europa e dispute Copa do Mundo, Eurocopa ou Copa América por sua Seleção.",
    type: "website",
    url: "https://erereck.github.io/futbobo/",
    siteName: "Futbobo",
    images: [{ url: "og-v4.png", width: 1200, height: 630, alt: "Futbobo — A carreira agora é mundial" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Futbobo — A carreira agora é mundial",
    description: "Oito ligas, 58 clubes e dez Seleções. Sua carreira ficou global.",
    images: ["og-v4.png"],
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
