import type { Metadata } from "next";
import Scorebobo from "./Scorebobo";

// Demo do Scorebobo, o modo "desenhe a jogada" dos treinos (só no Modo 3D).
export const metadata: Metadata = {
  title: { absolute: "Futbobo · Scorebobo" },
  robots: { index: false, follow: false },
};

export default function ScoreboboPage() {
  return <Scorebobo />;
}
