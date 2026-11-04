import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Futuros do Futbobo — Laboratório de conceitos",
  description:
    "Seis formas de jogar uma carreira: campo por turnos, rotas, contratos, promessas, cartas e gestos.",
  robots: { index: false, follow: false },
};

export default function ConceptsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
