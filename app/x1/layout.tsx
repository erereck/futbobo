import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "X1 Local de Futebol de Botão",
  description:
    "Dois jogadores, um mouse e uma mesa: dispute um X1 local de futebol de botão por turnos no Futbobo.",
  alternates: { canonical: "/x1/" },
};

export default function X1Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
