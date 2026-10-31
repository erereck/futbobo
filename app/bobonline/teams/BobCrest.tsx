// Escudo gerado do time (SVG inline, sem rede). `cpu` põe o selo CPU no canto:
// os times da CPU não levam sufixo no nome, a interface é que avisa.

import type { JSX } from "react";
import type { BobTeam } from "../types";
import { crestSvg } from "./crest";
import "./teams.css";

export default function BobCrest({
  team,
  size = 40,
  cpu = false,
}: {
  team: Pick<BobTeam, "abbr" | "primary" | "secondary" | "crest">;
  size?: number;
  cpu?: boolean /* selo CPU */;
}): JSX.Element {
  // crestSvg saneia tudo que entra (cores, sigla e forma): seguro como innerHTML.
  return (
    <span className={cpu ? "bob-crest bob-crest-cpu" : "bob-crest"} style={{ width: size, height: size }} aria-hidden="true">
      <span className="bob-crest-art" dangerouslySetInnerHTML={{ __html: crestSvg(team, size) }} />
      {cpu && <b>CPU</b>}
    </span>
  );
}
