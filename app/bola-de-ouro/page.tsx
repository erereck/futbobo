import type { Metadata } from "next";
import BallonDorPreview from "./BallonDorPreview";

// Rota de vitrine da gala: assistir à cerimônia a qualquer hora, sem jogar uma temporada.
export const metadata: Metadata = {
  title: { absolute: "Futbobo · Bola de Ouro" },
  robots: { index: false, follow: false },
};

export default function BallonDorPreviewPage() {
  return <BallonDorPreview />;
}
