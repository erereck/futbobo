"use client";

// Escudo do time no HUD. Usa o PNG real quando o clube tem asset verificado e
// cai na sigla colorida quando não tem — mesmo comportamento do resto do jogo.

import Image from "next/image";
import { useState } from "react";
import type { BotaoTeam } from "./types";

export default function TeamCrest({ team, size = 30 }: { team: BotaoTeam; size?: number }) {
  const [failed, setFailed] = useState(false);
  const showBadge = Boolean(team.badge) && !failed;
  return (
    <span
      className="botao-crest"
      style={{ background: team.primary, borderColor: team.secondary, width: size, height: size }}
      aria-hidden="true"
    >
      {showBadge ? (
        <Image
          className="botao-crest-image"
          src={team.badge as string}
          alt=""
          width={size}
          height={size}
          unoptimized
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        team.abbr
      )}
    </span>
  );
}
