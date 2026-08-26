import type { Metadata } from "next";
import PrototypeBotao from "./PrototypeBotao";
import "../botao/botao.css";
import "./prototype.css";

export const metadata: Metadata = {
  title: "Laboratório 5×5",
  description: "Protótipo visual experimental do futebol de botão do Futbobo.",
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function PrototypeBotaoPage() {
  return <PrototypeBotao />;
}
