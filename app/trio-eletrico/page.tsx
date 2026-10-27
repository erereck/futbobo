import type { Metadata } from "next";
import TrioPreview from "./TrioPreview";

// Rota de vitrine da festa do título: assistir ao trio elétrico a qualquer hora, sem ganhar uma Copa.
export const metadata: Metadata = {
  title: { absolute: "Futbobo · Trio elétrico" },
  robots: { index: false, follow: false },
};

export default function TrioPreviewPage() {
  return <TrioPreview />;
}
