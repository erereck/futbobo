import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Copa do Mundo de Futebol de Botão",
  description:
    "Escolha uma seleção e jogue uma Copa do Mundo completa em partidas rápidas de futebol de botão, grátis no navegador.",
  alternates: { canonical: "/copa/" },
};

export default function CopaLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
