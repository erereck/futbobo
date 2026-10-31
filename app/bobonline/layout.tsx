import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bobonline: botão online com os amigos",
  description:
    "Crie seu time de futebol de botão, abra uma sala e jogue X1 ou torneio de 4 ou 8 jogadores, direto entre os aparelhos.",
  alternates: { canonical: "/bobonline/" },
};

export default function BobonlineLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
