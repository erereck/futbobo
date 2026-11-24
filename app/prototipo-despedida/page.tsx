import type { Metadata } from "next";
import FarewellPreview from "./FarewellPreview";

// Laboratório da despedida da lenda: assistir sem jogar sete temporadas (fora dos menus).
export const metadata: Metadata = {
  title: { absolute: "Futbobo · Despedida da lenda" },
  robots: { index: false, follow: false },
};

export default function FarewellPreviewPage() {
  return <FarewellPreview />;
}
