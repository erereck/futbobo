"use client";

// Convite da gala da Bola de Ouro no fim da temporada da carreira.
//
// Mostra só os três finalistas (sem spoiler) e abre a cerimônia em tela cheia.
// A cerimônia (palco 2D, 3D e som) é baixada só no clique: a carreira ganha
// este cartão e nada mais. Depois de assistir (ou fechar), o cartão vira o
// resultado.

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComponentType, CSSProperties } from "react";
import { readBotao3dPerformance, readBotao3dPreference, webglAvailable } from "../botao/view-mode";
import type { PlayerAppearance } from "../player-appearance";
import { buildBallonDorCeremony, type CeremonyFinalist } from "./ballon-dor-script";
import type { BallonDorCeremonyProps } from "./BallonDorCeremony";
import { primeCeremonyAudio } from "./ceremony-audio";
import styles from "./gala-card.module.css";

/** Sem rede (ou um deploy novo trocou os arquivos): a gala não abre, mas a carreira não cai — o cartão vira o resultado. */
function CeremonyUnavailable({ onClose }: BallonDorCeremonyProps) {
  useEffect(() => {
    onClose?.();
  }, [onClose]);
  return null;
}

const BallonDorCeremony = dynamic(() => import("./BallonDorCeremony").catch(() => ({ default: CeremonyUnavailable as ComponentType<BallonDorCeremonyProps> })), {
  ssr: false,
  loading: () => <div className={styles.veil} />,
});

export type BallonDorGalaCardProps = {
  seed: number;
  season: number;
  playerName: string;
  appearance: PlayerAppearance;
  number: number;
  clubId: string;
  nationality?: string;
  /** Os três nomes da indicação (o jogador entre eles). */
  finalists: string[];
  won: boolean;
  winner: string;
  rivals?: Array<{ name: string; currentClubId?: string; nationality?: string }>;
};

type Session = { key: number; mode: "3d" | "2d"; performance: boolean };

export default function BallonDorGalaCard({ seed, season, playerName, appearance, number, clubId, nationality, finalists, won, winner, rivals }: BallonDorGalaCardProps) {
  // A carreira monta a lista de finalistas a cada render: a chave segura o elenco da noite.
  const finalistsKey = finalists.join("\u0001");
  const input = useMemo(
    () => buildBallonDorCeremony({
      seed,
      season,
      player: { name: playerName, appearance, number, clubId, nationality },
      finalists: finalistsKey.split("\u0001"),
      won,
      winner,
      rivals,
    }),
    [seed, season, playerName, appearance, number, clubId, nationality, finalistsKey, won, winner, rivals],
  );
  const [session, setSession] = useState<Session | null>(null);
  // A noite congela no clique: a carreira pode renderizar à vontade durante a gala.
  const [frozenInput, setFrozenInput] = useState(input);
  const [watched, setWatched] = useState(false);

  const podium = useMemo(() => [...input.finalists].sort((a, b) => a.place - b.place), [input]);
  const first = podium[0];
  const user = input.finalists.find((finalist) => finalist.isUser) ?? input.finalists[1];

  const open = useCallback(() => {
    // O clique é o gesto que libera o som; a cerimônia ainda vai baixar.
    primeCeremonyAudio();
    const use3d = readBotao3dPreference() && webglAvailable();
    setFrozenInput(input);
    setSession({ key: Date.now(), mode: use3d ? "3d" : "2d", performance: use3d && readBotao3dPerformance().enabled });
  }, [input]);

  const close = useCallback(() => {
    setSession(null);
    setWatched(true);
  }, []);

  return (
    <article className={`${styles.card} ${watched ? (user.place === 1 ? styles.won : styles.lost) : ""}`}>
      <span className={styles.rays} aria-hidden="true" />
      <header className={styles.header}>
        <span className={styles.emblem} aria-hidden="true" />
        <div>
          <small>{watched ? "RESULTADO DA GALA" : "A GALA DA BOLA DE OURO"}</small>
          <strong>Ballon d&apos;Or {season}</strong>
        </div>
      </header>

      {!watched ? (
        <>
          <span className={styles.label}>OS TRÊS FINALISTAS</span>
          <ul className={styles.finalists}>
            {input.finalists.map((finalist) => (
              <FinalistRow key={finalist.id} finalist={finalist} />
            ))}
          </ul>
          <p className={styles.copy}>O palco está montado e o envelope só abre na cerimônia.</p>
          <div className={styles.actions}>
            <button type="button" className={styles.watch} onClick={open}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>
              Assistir à cerimônia
            </button>
            <button type="button" className={styles.quick} onClick={() => setWatched(true)}>Ver só o resultado</button>
          </div>
        </>
      ) : (
        <>
          <div className={styles.result}>
            <small>{user.place === 1 ? "VOCÊ É O MELHOR DO MUNDO" : `VOCÊ TERMINOU EM ${user.place}º LUGAR`}</small>
            <strong>{user.place === 1 ? `Bola de Ouro ${season}` : first.name}</strong>
            <p>{user.place === 1 ? "Seu nome foi chamado no fim da noite." : `levou a Bola de Ouro ${season}. Você fechou o ano no top 3 do mundo.`}</p>
          </div>
          <ol className={styles.podium}>
            {podium.map((finalist) => (
              <li key={finalist.id} className={finalist.isUser ? styles.you : ""}>
                <b>{finalist.place}º</b>
                <span>{finalist.name}</span>
                {finalist.isUser && <em>VOCÊ</em>}
              </li>
            ))}
          </ol>
          <div className={styles.actions}>
            <button type="button" className={styles.replay} onClick={open}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10a6 6 0 1 0 1.8-4.3M4 3.5v3.2h3.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Rever cerimônia
            </button>
          </div>
        </>
      )}

      {session && (
        <BallonDorCeremony
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

function FinalistRow({ finalist }: { finalist: CeremonyFinalist }) {
  return (
    <li className={finalist.isUser ? styles.you : ""} style={{ "--club-a": finalist.club.primary, "--club-b": finalist.club.secondary } as CSSProperties}>
      <i aria-hidden="true" />
      <span>{finalist.name}</span>
      <small>{finalist.isUser ? "VOCÊ" : finalist.club.shortName}</small>
    </li>
  );
}
