import type { Metadata } from "next";
import PresentationPreview from "./PresentationPreview";

// Laboratório da apresentação do reforço: assistir sem jogar uma carreira (fora dos menus).
export const metadata: Metadata = {
  title: { absolute: "Futbobo · Apresentação do reforço" },
  robots: { index: false, follow: false },
};

export default function PresentationPreviewPage() {
  return <PresentationPreview />;
}
