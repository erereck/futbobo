import type { Metadata } from "next";
import PrototypeBotao from "./PrototypeBotao";
import "../botao/botao.css";
import "./prototype.css";

const publicAssetRoot = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Laboratório 5×5",
  description: "Protótipo visual experimental do futebol de botão do Futbobo.",
  robots: { index: false, follow: false },
  icons: { icon: `${publicAssetRoot}/favicon.svg`, shortcut: `${publicAssetRoot}/favicon.svg` },
};

export default function PrototypeBotaoPage() {
  return <PrototypeBotao />;
}
