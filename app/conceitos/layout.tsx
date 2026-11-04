import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Futuros do Futbobo — Laboratório de conceitos",
  description: "Seis conceitos interativos para o próximo Futbobo. Explore menus e decisões de carreira.",
  robots: { index: false, follow: false },
};

export default function ConceptsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
