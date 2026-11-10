"use client";

import { useMemo, useState } from "react";
import { awardFinalists, awardPresentation } from "../../../career/state";
import FutboboIcon from "../../FutboboIcon";
import { Stamp } from "./primitives";
import styles from "./awards.module.css";

/** Rótulos guardados em caixa alta viram frase normal no papel. */
function sentence(text: string) {
  const lower = text.toLocaleLowerCase("pt-BR");
  return lower.charAt(0).toLocaleUpperCase("pt-BR") + lower.slice(1);
}

/** Prêmio conquistado: uma figurinha com medalha e o carimbo de "conquistado". */
export function AwardSticker({ award }: { award: string }) {
  const presentation = awardPresentation(award);
  return (
    <article className={styles.sticker} data-tier={presentation.tier}>
      <span className={styles.medal} aria-hidden="true"><FutboboIcon name={presentation.tier === "legendary" ? "medal" : "trophy"} /></span>
      <div className={styles.stickerCopy}>
        <small>{sentence(presentation.kicker)}</small>
        <strong>{award}</strong>
        <p>{presentation.description}</p>
      </div>
      <b className={styles.stamp}>{presentation.tier === "legendary" ? "Melhor do mundo" : "Conquistado"}</b>
    </article>
  );
}

/** Indicação com três finalistas: o envelope fechado até o jogador abrir. */
export function AwardEnvelope({
  award,
  playerName,
  seed,
  season,
  won,
  winner,
  finalists: providedFinalists,
}: {
  award: string;
  playerName: string;
  seed: number;
  season: number;
  won: boolean;
  winner: string;
  finalists?: string[];
}) {
  const [revealed, setRevealed] = useState(false);
  const presentation = awardPresentation(award);
  const finalists = useMemo(
    () => providedFinalists?.length === 3 ? providedFinalists : awardFinalists(playerName, award, seed, season),
    [providedFinalists, playerName, award, seed, season],
  );
  const revealedWinner = won ? playerName : winner;

  return (
    <article className={styles.envelope} data-tier={presentation.tier} data-open={revealed ? "" : undefined}>
      <header className={styles.envelopeHead}>
        <span className={styles.medal} aria-hidden="true"><FutboboIcon name="trophy" /></span>
        <div>
          <small>Os três finalistas</small>
          <strong>{award}</strong>
        </div>
      </header>
      {!revealed ? (
        <>
          <ol className={styles.finalists}>
            {finalists.map((name, index) => (
              <li key={name} data-you={name === playerName ? "" : undefined}>
                <b className={styles.num}>{index + 1}</b>
                <span>{name}</span>
                {name === playerName && <em>você</em>}
              </li>
            ))}
          </ol>
          <p className={styles.note}>O envelope está nas mãos do apresentador.</p>
          <Stamp variant="primary" onClick={() => setRevealed(true)}>Abrir o envelope</Stamp>
        </>
      ) : (
        <div className={styles.reveal}>
          <small>O vencedor é…</small>
          <strong>{revealedWinner}</strong>
          {won ? (
            <AwardSticker award={award} />
          ) : (
            <div className={styles.nearMiss}>
              <strong>Você chegou à final</strong>
              <p>Seu nome esteve no envelope até o último instante. Desta vez, {revealedWinner} levou o prêmio.</p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
