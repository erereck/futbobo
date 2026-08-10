import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Futebol de Botão Online",
  description:
    "Jogue partidas rápidas de futebol de botão com física, prorrogação, pênaltis, replays e adversários controlados pelo computador.",
  alternates: { canonical: "/botao/" },
};

export default function BotaoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
