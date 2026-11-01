"use client";

// "Jogar a base": a lista dos anos da base com um minigame do Scorebobo por ano.
//
// Chega sob demanda (a carreira monta com `next/dynamic`): nem este painel nem o
// Scorebobo entram no primeiro carregamento de "/". Quem guarda o andamento é o
// save (`game.youthPlay`, gravado a cada `setGame`); aqui só se despacham as
// transições puras de app/career/youth-play.ts:
// - a cena pronta gasta a chance (`startYouthChance`), o fim da jogada guarda a
//   melhor nota (`recordYouthStars`) e o 3D que cai sem resultado devolve a chance;
// - "Continuar" no resultado passa o ano (`advanceYouthYear`) quando ele fechou (★★★ ou as 3
//   chances); com chance sobrando só volta à lista, e quem aceita a nota antes é o "Seguir";
// - "Simular o resto" fecha a base com os anos que faltam valendo 0★;
// - com o bônus aplicado o painel vira o resumo, e o Voltar da revelação cai aqui
//   de novo sem rejogar nada nem somar o bônus outra vez.

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType, Dispatch, ReactNode, SetStateAction } from "react";
import { createPortal } from "react-dom";
import { enableBotao3dPerformanceAuto } from "../../botao/view-mode";
import type { GameState, YouthPlayYear } from "../../career/model";
import type { Club } from "../../game-data";
import {
  YOUTH_PLAY_CHANCES,
  advanceYouthYear,
  chooseYouthMode,
  currentYouthPlayYear,
  isYouthYearDone,
  recordYouthStars,
  refundYouthChance,
  scoreboboTrackName,
  skipRemainingYouth,
  startYouthChance,
  youthYearStars,
} from "../../career/youth-play";
import type { CareerChallengeProps } from "../../scorebobo/CareerChallenge";
import styles from "./CareerMinigames.module.css";

/**
 * Sem rede (ou um deploy novo trocou os arquivos): o minigame não abre e nenhuma chance é gasta.
 * O `next/dynamic` guarda esta tela até recarregar, por isso o botão é Recarregar.
 */
function ChallengeUnavailable({ onLeave }: CareerChallengeProps) {
  return (
    <div className={styles.veil} role="alertdialog" aria-labelledby="career-minigame-error">
      <p id="career-minigame-error">O minigame não abriu. Recarregue a página: o que você já jogou está salvo.</p>
      <button type="button" className={styles.play} onClick={() => window.location.reload()} autoFocus>Recarregar</button>
      <button type="button" className={styles.ghost} onClick={onLeave}>Voltar</button>
    </div>
  );
}

const CareerChallenge = dynamic(() => import("../../scorebobo/CareerChallenge").catch(() => ({ default: ChallengeUnavailable as ComponentType<CareerChallengeProps> })), {
  ssr: false,
  loading: () => <div className={styles.veil}><p>Preparando o campo…</p></div>,
});

export type YouthPlayPanelProps = {
  game: GameState;
  setGame: Dispatch<SetStateAction<GameState>>;
  /** Clube da base (o time da casa nos minigames). */
  club: Club;
  /** Escudo do clube e a marca, desenhados pela carreira (os primitivos dela ficam fora deste pedaço). */
  badge: ReactNode;
  brand: ReactNode;
  /** Modo desempenho da carreira: vira o `performance` do Scorebobo. */
  performance: boolean;
  /** Fim da base (bônus aplicado): segue para a revelação. */
  onContinue: () => void;
};

/** A fase aberta no minigame; `chancesUsed` congela o que o save tinha na abertura. */
type Open = { index: number; chancesUsed: number };

function Stars({ value, label }: { value: number; label?: string }) {
  const lit = Math.max(0, Math.min(3, Math.round(value)));
  return (
    <span className={styles.stars} role="img" aria-label={label ?? `${lit} de 3 estrelas`}>
      {[0, 1, 2].map((index) => <i key={index} className={index < lit ? styles.starOn : styles.starOff} aria-hidden="true">★</i>)}
    </span>
  );
}

function chanceLine(year: YouthPlayYear) {
  if (year.skipped) return "Simulado · conta 0★";
  if (year.chancesUsed === 0) return `${YOUTH_PLAY_CHANCES} chances`;
  return `${year.chancesUsed} de ${YOUTH_PLAY_CHANCES} chances usadas`;
}

export default function YouthPlayPanel({ game, setGame, club, badge, brand, performance, onContinue }: YouthPlayPanelProps) {
  const [open, setOpen] = useState<Open | null>(null);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const chosen = game.youthPlay !== null;
  const playing = game.youthPlay?.bonus === null;
  const summary = game.youthPlay?.mode === "play" && game.youthPlay.bonus !== null;

  const listRef = useRef<HTMLOListElement>(null);
  const summaryTitleRef = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const focusKey = `${summary}:${game.youthPlay?.current ?? -1}`;
  const lastFocusKey = useRef(focusKey);

  // O resumo abre do topo (a lista podia estar rolada até o último ano).
  useEffect(() => {
    if (summary) window.scrollTo({ top: 0, behavior: "instant" });
  }, [summary]);

  // O botão focado some (minigame fechado, "Seguir", fim da base): o foco vai para o ano em jogo
  // ("Jogar · chance N de 3" ou "Seguir") ou para o título do resumo, nunca para o topo da página.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    const moved = wasOpen.current || lastFocusKey.current !== focusKey;
    wasOpen.current = false;
    lastFocusKey.current = focusKey;
    if (!moved) return;
    (summaryTitleRef.current ?? listRef.current?.querySelector<HTMLElement>("[aria-current=step] button"))?.focus({ preventScroll: true });
  }, [open, focusKey]);

  // "Jogar a base" na tela de escolha monta este painel com a escolha ainda por gravar:
  // grava daqui, para as transições não entrarem no primeiro carregamento de "/".
  useEffect(() => {
    if (!chosen) setGame((current) => chooseYouthMode(current, "play"));
  }, [chosen, setGame]);

  // Com ano para jogar, a cena do Scorebobo (e o three.js) já começa a baixar.
  useEffect(() => {
    if (!playing) return;
    void import("../../scorebobo/CareerChallenge").then((module) => module.warmCareerChallenge()).catch(() => undefined);
  }, [playing]);

  const closeChallenge = useCallback(() => setOpen(null), []);
  const chanceStart = useCallback(() => setGame(startYouthChance), [setGame]);
  const chanceResult = useCallback((stars: number) => setGame((current) => recordYouthStars(current, stars)), [setGame]);
  const chanceRefund = useCallback(() => setGame(refundYouthChance), [setGame]);
  // Igual ao Treino especial: com chance sobrando e menos de ★★★, o "Continuar" do resultado não queima as chances.
  const continueYear = useCallback(() => {
    setGame((current) => {
      const year = currentYouthPlayYear(current);
      return year && isYouthYearDone(year) ? advanceYouthYear(current) : current;
    });
    setOpen(null);
  }, [setGame]);
  const slowDevice = useCallback(() => {
    enableBotao3dPerformanceAuto();
  }, []);

  const play = game.youthPlay;
  // Escolha sendo gravada (o efeito acima): o mesmo "abrindo" do carregamento do painel.
  if (!play || play.mode !== "play") return <section className="youth-screen"><p className="simulating-label"><span /> Abrindo a base...</p></section>;

  const finished = play.bonus !== null;
  const lastAge = game.youthYears.at(-1)?.age ?? game.revealAge;
  const ageOf = (index: number) => game.youthYears[index]?.age ?? 12 + index;
  const totalStars = play.years.reduce((sum, year) => sum + youthYearStars(year), 0);
  const current = finished ? null : play.years[play.current] ?? null;
  const openYear = open ? play.years[open.index] ?? null : null;

  function playYear(index: number, year: YouthPlayYear) {
    if (isYouthYearDone(year)) return;
    setConfirmSkip(false);
    setOpen({ index, chancesUsed: year.chancesUsed });
  }

  function simulateRest() {
    setConfirmSkip(false);
    setGame(skipRemainingYouth);
  }

  if (finished) {
    const bonus = play.bonus ?? 0;
    const average = play.years.length ? totalStars / play.years.length : 0;
    return (
      <section className={`${styles.youthPage} screen-enter`} aria-labelledby="youth-summary-kicker youth-summary-title">
        {brand}
        <header className={styles.youthHeader}>
          {badge}
          <div>
            <small id="youth-summary-kicker">FIM DAS CATEGORIAS DE BASE</small>
            <strong id="youth-summary-title" ref={summaryTitleRef} tabIndex={-1}>{club.shortName}</strong>
            <p>Formado na base · dos 12 aos {lastAge} · {totalStars}★ em {play.years.length} anos · média {average.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</p>
          </div>
        </header>
        <div className={styles.bonus} data-bonus={bonus}>
          <strong>+{bonus}</strong>
          <span>de potencial máximo</span>
          <p>{bonus === 3 ? "A base inteira jogando no limite. O teto subiu tudo o que dava." : bonus > 0 ? "O que você mostrou na base subiu o seu teto." : "Desta vez a base não deixou bônus. O teto segue o da formação."} O número continua em segredo.</p>
        </div>
        <ol className={styles.years}>
          {play.years.map((year, index) => {
            const event = game.youthYears[index];
            return (
              <li key={`${index}-${year.levelId}`} className={styles.year} data-state={year.skipped ? "skipped" : "done"}>
                <span className={styles.age}>{ageOf(index)}<small>ANOS</small></span>
                <div className={styles.yearCopy}>
                  <strong>{scoreboboTrackName(year.levelId)}</strong>
                  <small>{year.skipped ? "Simulado · conta 0★" : event?.title ?? chanceLine(year)}</small>
                </div>
                <Stars value={youthYearStars(year)} />
              </li>
            );
          })}
        </ol>
        <div className={styles.footer}>
          <button type="button" className="primary-button" onClick={onContinue}>Continuar <b>→</b></button>
        </div>
      </section>
    );
  }

  return (
    <>
      {/* Com o minigame aberto a lista sai do teclado: um "Seguir" escondido passaria o ano no meio da jogada. */}
      <section className={`${styles.youthPage} screen-enter`} aria-labelledby="youth-play-kicker youth-play-title" inert={open ? true : undefined}>
        {brand}
        <header className={styles.youthHeader}>
          {badge}
          <div>
            <small id="youth-play-kicker">JOGANDO A BASE · SCOREBOBO</small>
            <strong id="youth-play-title">{club.shortName}</strong>
            <p>Dos 12 aos {lastAge}. Um minigame por ano, 3 chances, vale a melhor. A média das estrelas vira até +3 de potencial máximo.</p>
          </div>
        </header>
        <div className={styles.tally}><span>ESTRELAS NA BASE</span><strong>{totalStars}<small> de {play.years.length * 3}</small></strong></div>
        <ol ref={listRef} className={styles.years}>
          {play.years.map((year, index) => {
            const state = index < play.current ? "done" : index === play.current ? "current" : "next";
            const event = game.youthYears[index];
            const done = isYouthYearDone(year);
            return (
              <li key={`${index}-${year.levelId}`} className={styles.year} data-state={state} aria-current={state === "current" ? "step" : undefined}>
                <span className={styles.age}>{ageOf(index)}<small>ANOS</small></span>
                <div className={styles.yearCopy}>
                  <strong>{scoreboboTrackName(year.levelId)}</strong>
                  <small>{state === "done" ? event?.title ?? chanceLine(year) : chanceLine(year)}</small>
                  {state === "done" && event?.text ? <p>{event.text}</p> : null}
                </div>
                {state === "next" ? <span className={styles.lock}>{index === play.years.length - 1 ? "FINAL" : ""}</span> : <Stars value={youthYearStars(year)} />}
                {state === "current" && (
                  <div className={styles.yearActions}>
                    {!done && (
                      <button type="button" className={styles.play} onClick={() => playYear(index, year)}>
                        {year.chancesUsed === 0 ? "Jogar" : `Jogar · chance ${year.chancesUsed + 1} de ${YOUTH_PLAY_CHANCES}`}
                      </button>
                    )}
                    {year.chancesUsed > 0 && (
                      <button type="button" className={done ? styles.play : styles.ghost} onClick={() => setGame(advanceYouthYear)}>
                        {index === play.years.length - 1 ? "Fechar a base" : "Seguir"} <b>→</b>
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <div className={styles.footer}>
          {confirmSkip ? (
            <div className={styles.confirm} role="alertdialog" aria-labelledby="youth-skip-title">
              <strong id="youth-skip-title">Simular o resto da base?</strong>
              <p>Os anos que faltam contam 0★ na média{current && current.chancesUsed > 0 ? " (o ano em jogo fica com a melhor nota que você fez)" : ""}.</p>
              <div>
                <button type="button" className={styles.ghost} onClick={() => setConfirmSkip(false)}>Continuar jogando</button>
                <button type="button" className={styles.danger} onClick={simulateRest}>Simular o resto</button>
              </div>
            </div>
          ) : (
            <button type="button" className={styles.ghost} onClick={() => setConfirmSkip(true)}>Simular o resto</button>
          )}
        </div>
      </section>
      {/* No body: a animação de entrada (.screen-enter) deixa um transform na section, e o fixed do minigame
          passaria a medir a section (rolada, sem o topo do HUD no celular) em vez da tela. */}
      {open && openYear && createPortal(
        <CareerChallenge
          key={`youth-${open.index}`}
          levelId={openYear.levelId}
          kicker={`BASE · ${ageOf(open.index)} ANOS`}
          player={{ name: game.name, number: game.number, appearance: game.playerAppearance, club }}
          maxChances={YOUTH_PLAY_CHANCES}
          chancesUsed={open.chancesUsed}
          performance={performance}
          onChanceStart={chanceStart}
          onChanceResult={chanceResult}
          onChanceRefund={chanceRefund}
          onContinue={continueYear}
          onLeave={closeChallenge}
          onSlowDevice={slowDevice}
        />,
        document.body,
      )}
    </>
  );
}
