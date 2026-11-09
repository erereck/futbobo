"use client";

// Treino especial da QUADRA: as duas fases do Scorebobo sorteadas para este ciclo,
// 3 jogadas em cada, vale a melhor. ★★★ nas duas = +1 de overall (padrão do
// "Salto de nível", em app/career/special-training.ts).
//
// Abre por cima da loja e chega sob demanda (`next/dynamic` na carreira): ao
// abrir chama `beginSpecialTraining` (a chave da QUADRA e o par de fases ficam
// gravados antes da primeira jogada; com um treino em andamento, retoma) e daí
// em diante só despacha as transições puras.
// Recarregar no meio: a loja reabre (lastCycleShopSeason só grava ao fechar) e o
// treino continua de onde parou, com a chance que começou já gasta.

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType, Dispatch, SetStateAction } from "react";
import { createPortal } from "react-dom";
import { enableBotao3dPerformanceAuto } from "../../botao/view-mode";
import type { GameState, SpecialTraining } from "../../career/model";
import type { Club } from "../../game-data";
import {
  SPECIAL_TRAINING_CHANCES,
  advanceTraining,
  beginSpecialTraining,
  canSpecialTrainingReward,
  completeSpecialTraining,
  isTrainingStageDone,
  recordTrainingStars,
  refundTrainingChance,
  startTrainingChance,
} from "../../career/special-training";
import { scoreboboTrackName } from "../../career/scorebobo-track";
import { trainingOfSeason } from "../../career/special-training-status";
import type { CareerChallengeProps } from "../../scorebobo/CareerChallenge";
import { Seal, Stamp } from "./album/primitives";
import AlbumSheet, { sheetStyles as styles } from "./album/sheets/AlbumSheet";
import minigame from "./CareerMinigames.module.css";

/**
 * Sem rede (ou um deploy novo trocou os arquivos): o minigame não abre e nenhuma chance é gasta.
 * O `next/dynamic` guarda esta tela até recarregar, por isso o botão é Recarregar (a QUADRA reabre).
 */
function ChallengeUnavailable({ onLeave }: CareerChallengeProps) {
  return (
    <div className={minigame.veil} role="alertdialog" aria-labelledby="training-minigame-error">
      <p id="training-minigame-error">O minigame não abriu. Recarregue a página: o treino continua de onde parou.</p>
      <button type="button" className={minigame.play} onClick={() => window.location.reload()} autoFocus>Recarregar</button>
      <button type="button" className={minigame.ghost} onClick={onLeave}>Voltar</button>
    </div>
  );
}

const CareerChallenge = dynamic(() => import("../../scorebobo/CareerChallenge").catch(() => ({ default: ChallengeUnavailable as ComponentType<CareerChallengeProps> })), {
  ssr: false,
  loading: () => <div className={minigame.veil}><p>Preparando o campo…</p></div>,
});

export type SpecialTrainingPanelProps = {
  game: GameState;
  setGame: Dispatch<SetStateAction<GameState>>;
  /** Clube atual (o time da casa nos minigames); sem clube, o clássico do Scorebobo. */
  club: Club | null;
  /** Modo desempenho da carreira: vira o `performance` do Scorebobo. */
  performance: boolean;
  /** Volta para a loja; `feedback` vira a linha de aviso da QUADRA. */
  onClose: (feedback?: string) => void;
};

/** Sem clube (agente livre): a folha usa a tinta neutra do álbum. */
const NO_CLUB_INKS = { primary: "#161616", secondary: "#f6c431" };

/** A fase aberta no minigame; `chancesUsed` congela o que o save tinha na abertura. */
type Open = { index: number; chancesUsed: number };

const STAR_PATH = "M12 2.6l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.8l-5.8 3.3 1.4-6.4-4.9-4.4 6.5-.7Z";

/** Três estrelas carimbadas: as acesas em amarelo, as que faltam tracejadas. */
function Stars({ value }: { value: number }) {
  const lit = Math.max(0, Math.min(3, Math.round(value)));
  return (
    <span className={styles.stars} role="img" aria-label={`${lit} de 3 estrelas`}>
      {[0, 1, 2].map((index) => (
        <svg key={index} viewBox="0 0 24 24" aria-hidden="true">
          <path d={STAR_PATH} data-on={index < lit ? "" : undefined} data-off={index < lit ? undefined : ""} />
        </svg>
      ))}
    </span>
  );
}

/** Aceita a melhor nota da fase. Sem ★★★ na primeira o +1 já não vem: o treino fecha ali. */
function acceptStage(state: GameState): GameState {
  const next = advanceTraining(state);
  const training = next.specialTraining;
  return training && training.rewarded === null && !canSpecialTrainingReward(training) ? completeSpecialTraining(next) : next;
}

function stageLine(training: SpecialTraining, index: number) {
  const used = training.chancesUsed[index];
  if (index > training.current) return `${SPECIAL_TRAINING_CHANCES} chances`;
  if (used === 0) return index < training.current ? "Não jogada" : `${SPECIAL_TRAINING_CHANCES} chances`;
  return `${used} de ${SPECIAL_TRAINING_CHANCES} chances usadas`;
}

export default function SpecialTrainingPanel({ game, setGame, club, performance, onClose }: SpecialTrainingPanelProps) {
  const [open, setOpen] = useState<Open | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  // Diálogo de verdade: o foco entra nele e a loja e a carreira por trás saem do teclado
  // (um Tab perdido em "Entrar na temporada" fecharia a QUADRA com o treino no meio).
  // Ao fechar, o foco volta para o botão da loja que abriu o painel. Desligado ("Treinado ✓"),
  // vai para o cartão do treino: nunca para um botão de compra, que um Enter a mais compraria.
  useEffect(() => {
    const backdrop = backdropRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblings = Array.from(backdrop?.parentElement?.children ?? []).filter((element): element is HTMLElement => element !== backdrop && element instanceof HTMLElement && !element.inert);
    for (const element of siblings) element.inert = true;
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      for (const element of siblings) element.inert = false;
      if (!previous?.isConnected) return;
      if (!previous.matches(":disabled")) {
        previous.focus({ preventScroll: true });
        return;
      }
      const card = previous.closest<HTMLElement>("article");
      if (!card) return;
      card.tabIndex = -1;
      card.focus({ preventScroll: true });
      card.scrollIntoView({ block: "nearest" });
    };
  }, []);

  // Abrir o painel começa (ou retoma) o treino desta temporada; a cena do Scorebobo já começa a baixar.
  useEffect(() => {
    setGame(beginSpecialTraining);
    void import("../../scorebobo/CareerChallenge").then((module) => module.warmCareerChallenge()).catch(() => undefined);
  }, [setGame]);

  const closeChallenge = useCallback(() => setOpen(null), []);
  const chanceStart = useCallback(() => setGame(startTrainingChance), [setGame]);
  const chanceResult = useCallback((stars: number) => setGame((current) => recordTrainingStars(current, stars)), [setGame]);
  const chanceRefund = useCallback(() => setGame(refundTrainingChance), [setGame]);
  // "Continuar" do resultado: com a fase fechada (★★★ ou sem chance), segue; com chance sobrando e menos
  // de ★★★, só volta ao painel. Aceitar ali seria desistir do +1, e isso fica com o "Encerrar treino" e o aviso.
  const continueStage = useCallback(() => {
    setGame((current) => {
      const training = trainingOfSeason(current);
      return training && training.rewarded === null && isTrainingStageDone(training) ? acceptStage(current) : current;
    });
    setOpen(null);
  }, [setGame]);
  const slowDevice = useCallback(() => {
    enableBotao3dPerformanceAuto();
  }, []);

  const training = game.specialTraining && game.specialTraining.season === game.season ? game.specialTraining : null;
  const finished = training ? training.rewarded !== null : false;
  const openLevel = open && training ? training.levelIds[open.index] : null;

  function closePanel() {
    if (!training || training.rewarded === null) onClose();
    else onClose(training.rewarded ? `Treino especial: ★★★ nas duas fases. +1 de overall, agora ${game.overall}.` : "Treino especial encerrado. Faltou ★★★ nas duas fases.");
  }

  function playStage(index: number) {
    if (!training || index !== training.current || isTrainingStageDone(training, index)) return;
    setOpen({ index, chancesUsed: training.chancesUsed[index] });
  }

  return (
    <AlbumSheet
      ink="green"
      club={club ?? NO_CLUB_INKS}
      stacked
      titleId="special-training-title"
      kicker="QUADRA · Scorebobo"
      title="Treino especial"
      backdropRef={backdropRef}
      dialogRef={dialogRef}
      inert={Boolean(open)}
      footer={<Stamp variant={finished || !training ? "primary" : "default"} onClick={closePanel}>Voltar para a QUADRA</Stamp>}
      after={open && openLevel ? createPortal(
        <CareerChallenge
          key={`training-${game.season}-${open.index}`}
          levelId={openLevel}
          kicker={`TREINO ESPECIAL · ${open.index + 1} DE 2`}
          player={{ name: game.name, number: game.number, appearance: game.playerAppearance, club }}
          maxChances={SPECIAL_TRAINING_CHANCES}
          chancesUsed={open.chancesUsed}
          performance={performance}
          onChanceStart={chanceStart}
          onChanceResult={chanceResult}
          onChanceRefund={chanceRefund}
          onContinue={continueStage}
          onLeave={closeChallenge}
          onSlowDevice={slowDevice}
        />,
        // No body: dentro do fundo da folha, o z-index do minigame ficaria preso abaixo dos avisos da carreira.
        document.body,
      ) : null}
    >
      <p className={styles.lead}>Duas fases sorteadas para este ciclo. 3 jogadas em cada, vale a melhor. ★★★ nas duas = +1 de overall, de graça.</p>

      {!training ? (
        <p className={styles.lead}>Sorteando as duas fases…</p>
      ) : (
        <>
          {finished && (
            <div className={styles.verdict} role="status">
              {training.rewarded ? (
                <><Seal text="+1 OVR" tone="green" /><div><strong>3★ nas duas: +1 de overall!</strong><span>Agora você é {game.overall} OVR.</span></div></>
              ) : (
                <><Seal text="Sem bônus" tone="red" /><div><strong>Faltou: ★★★ nas duas</strong><span>Sem bônus neste ciclo. O próximo Treino especial chega com a QUADRA, daqui a quatro temporadas.</span></div></>
              )}
            </div>
          )}
          <ol className={styles.stages}>
            {training.levelIds.map((levelId, index) => {
              const state = finished || index < training.current ? "done" : index === training.current ? "current" : "next";
              const done = isTrainingStageDone(training, index);
              const used = training.chancesUsed[index];
              const best = training.bestStars[index];
              const last = index === training.levelIds.length - 1;
              return (
                <li key={`${index}-${levelId}`} className={styles.stage} data-state={state} aria-current={state === "current" ? "step" : undefined}>
                  <span className={styles.stageNo}>{index + 1}<small>de 2</small></span>
                  <div className={styles.stageCopy}>
                    <strong>{scoreboboTrackName(levelId)}</strong>
                    <small>{stageLine(training, index)}</small>
                  </div>
                  {state === "next" ? <span className={styles.locked}>Abre depois da fase 1</span> : <Stars value={best} />}
                  {state === "current" && (!done || used > 0) && (
                    <div className={styles.stageActions}>
                      {!done && (
                        <Stamp variant="primary" onClick={() => playStage(index)}>
                          {used === 0 ? "Treinar" : `Treinar · chance ${used + 1} de ${SPECIAL_TRAINING_CHANCES}`}
                        </Stamp>
                      )}
                      {used > 0 && (
                        <Stamp variant={done ? "primary" : "default"} onClick={() => setGame(acceptStage)}>
                          {!last && best >= 3 ? "Próxima fase" : "Encerrar treino"}
                        </Stamp>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          {!finished && training.current === 0 && training.chancesUsed[0] > 0 && training.bestStars[0] < 3 && (
            <p className={styles.warning}>Sem ★★★ nesta fase o +1 já não vem: encerrar agora fecha o treino do ciclo.</p>
          )}
        </>
      )}
    </AlbumSheet>
  );
}
