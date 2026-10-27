"use client";

// Convite da festa do título no fim da temporada em que o jogador ganhou a Copa
// do Mundo pela seleção. A cutscene (palco 2D, 3D e batucada) só é baixada no
// clique: a carreira ganha este cartão e nada mais. Depois de assistir, o
// cartão encolhe para "Festa vista · Rever".

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType, CSSProperties } from "react";
import { readBotao3dPerformance, readBotao3dPreference, webglAvailable } from "../botao/view-mode";
import type { PlayerAppearance } from "../player-appearance";
import { buildParadeInput } from "./parade-script";
import { primeParadeAudio } from "./parade-audio";
import type { ParadeCutsceneProps } from "./ParadeCutscene";
import styles from "./launch-card.module.css";

/** Sem rede (ou um deploy novo trocou os arquivos): a festa não abre, mas a carreira não cai. */
function ParadeUnavailable({ onClose }: ParadeCutsceneProps) {
  useEffect(() => {
    onClose?.();
  }, [onClose]);
  return null;
}

const ParadeCutscene = dynamic(() => import("./ParadeCutscene").catch(() => ({ default: ParadeUnavailable as ComponentType<ParadeCutsceneProps> })), {
  ssr: false,
  loading: () => <div className={styles.veil} />,
});

export type ParadeLaunchCardProps = {
  seed: number;
  season: number;
  countryId: string;
  playerName: string;
  appearance: PlayerAppearance;
  number: number;
  /** Estrelas da seleção já contando esta Copa (`paradeStars`). */
  stars: number;
};

type Session = { key: number; mode: "3d" | "2d"; performance: boolean };

export default function ParadeLaunchCard({ seed, season, countryId, playerName, appearance, number, stars }: ParadeLaunchCardProps) {
  const input = useMemo(
    () => buildParadeInput({ seed, season, countryId, player: { name: playerName, appearance, number }, stars }),
    [seed, season, countryId, playerName, appearance, number, stars],
  );
  const [session, setSession] = useState<Session | null>(null);
  // A festa congela no clique: a carreira pode renderizar à vontade durante a cena.
  const [frozenInput, setFrozenInput] = useState(input);
  const [watched, setWatched] = useState(false);

  const open = useCallback(() => {
    // O clique é o gesto que libera o som; a cutscene ainda vai baixar.
    primeParadeAudio();
    const use3d = readBotao3dPreference() && webglAvailable();
    setFrozenInput(input);
    setSession({ key: Date.now(), mode: use3d ? "3d" : "2d", performance: use3d && readBotao3dPerformance().enabled });
  }, [input]);

  const close = useCallback(() => {
    setSession(null);
    setWatched(true);
  }, []);

  const style = { "--c1": input.country.primary, "--c2": input.country.secondary } as CSSProperties;

  return (
    <article className={`${styles.card} ${watched ? styles.compact : ""}`} style={style}>
      {!watched ? (
        <>
          <span className={styles.confetti} aria-hidden="true" />
          <header className={styles.header}>
            <span className={styles.badge} aria-hidden="true">
              <svg viewBox="0 0 32 32"><path d="M3 21h17v-9h5l4 5v4h-2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" /><circle cx="9" cy="23" r="2.6" fill="currentColor" /><circle cx="23" cy="23" r="2.6" fill="currentColor" /><path d="M5 12V7m4 5V5m4 7V8m4 4V6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
            </span>
            <div>
              <small>A FESTA DO TÍTULO</small>
              <strong>Trio elétrico pelas ruas de {input.city.name}</strong>
            </div>
          </header>
          <p className={styles.copy}>{input.city.avenue} lotada, a seleção no alto do trio e a taça da Copa do Mundo {season} nas suas mãos.</p>
          <div className={styles.stars} aria-label={`${stars} estrelas`}>
            {Array.from({ length: Math.min(stars, 10) }, (_, index) => <i key={index} aria-hidden="true">★</i>)}
          </div>
          <button type="button" className={styles.watch} onClick={open}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>
            Assistir à festa
          </button>
        </>
      ) : (
        <div className={styles.compactRow}>
          <span className={styles.check} aria-hidden="true">★</span>
          <span className={styles.compactText}><b>Festa vista</b> · {input.city.name}</span>
          <button type="button" className={styles.replay} onClick={open}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10a6 6 0 1 0 1.8-4.3M4 3.5v3.2h3.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Rever
          </button>
        </div>
      )}

      {session && (
        <ParadeCutscene
          key={session.key}
          input={frozenInput}
          mode={session.mode}
          performance={session.performance}
          onFinish={close}
          onClose={close}
        />
      )}
    </article>
  );
}
