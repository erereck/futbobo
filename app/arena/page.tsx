import type { Metadata } from "next";
import ArenaPrototype from "./ArenaPrototype";

export const metadata: Metadata = {
  title: "Futbobo Pulse Arena — Prototype",
  description: "Protótipo experimental de partida em tempo real do Futbobo.",
  robots: { index: false, follow: false },
};

export default function ArenaPage() {
  return <ArenaPrototype />;
}
