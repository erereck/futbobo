"use client";

// Uma fase do Scorebobo como minigame da carreira (um ano da base, uma fase do
// Treino especial). O jogador da carreira em memória vira o herói (nome,
// número e aparência), o clube dele é o time da casa, e cada chance é uma
// montagem nova da fase. Quem conta as chances e grava no save é a carreira,
// pelos avisos daqui; a fase só joga.
//
// Este arquivo chega sob demanda (`next/dynamic` com `ssr:false` na carreira):
// nada do Scorebobo nem do three.js entra no primeiro carregamento dela. Monte
// com uma `key` por fase (ano ou fase do treino): os avisos de fechar valem uma
// vez por montagem.
//
// As chances:
// - a chance é gasta quando a jogada começa de verdade (cena pronta): fechar ou
//   recarregar no meio deixa a chance gasta, com o que ela tinha (0★);
// - o 3D que cai ANTES de começar não gasta nada; DEPOIS de começar, sem
//   resultado, a chance volta (`onChanceRefund`) e a mesma chance remonta;
// - o 3D que cai depois do resultado não abre chance nova sozinho (a volta do
//   WebGL no Android remontaria sem ninguém pedir): a nota fica e a fase fecha.

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { readBotao3dPerformance } from "../botao/view-mode";
import type { PlayerAppearance } from "../player-appearance";
import { primeScoreboboAudio, setScoreboboMuted, warmScoreboboAudio } from "./audio";
import LevelPlayer, { type ScoreboboCareerMode } from "./LevelPlayer";
import { SCORE_LEVELS } from "./sim/levels";
import {
  levelWithHero,
  pickAwayTeam,
  profileFromCareer,
  readMuted,
  rememberMuted,
  serverMuted,
  subscribeMuted,
  teamInfoFromClub,
  teamsFor,
  type ClubLike,
  type StarCount,
  type TeamInfo,
} from "./storage";
import type { ScoreLevel, ScoreTeams } from "./types";
import albumCss from "../components/career/album/album.module.css";
import styles from "./CareerChallenge.module.css";

export type CareerChallengeProps = {
  /** Id de uma fase de `SCORE_LEVELS`. */
  levelId: string;
  /** "BASE · 13 ANOS" / "TREINO ESPECIAL · 1 DE 2": no lugar de "FASE 0X". */
  kicker: string;
  /** O jogador da carreira em memória; sem clube, o time da casa é o amarelo e azul clássico. */
  player: { name: string; number: number; appearance: PlayerAppearance; club: ClubLike | null };
  /** Chances desta fase (3). */
  maxChances: number;
  /** Já gastas (vem do save). Esgotadas ao abrir: nada monta e chama `onLeave`. */
  chancesUsed: number;
  /** Modo desempenho da carreira (vale a partir da montagem de cada chance). */
  performance: boolean;
  /** A jogada começou de verdade: grava chancesUsed+1 no save. */
  onChanceStart: () => void;
  /** Fim da jogada com as estrelas (0..3): grava max(melhor, estrelas). */
  onChanceResult: (stars: number) => void;
  /** Devolve a chance (o 3D caiu depois de começar, sem resultado). */
  onChanceRefund?: () => void;
  /** "Continuar": fecha o minigame; o host decide se o ano/fase avança (só com ★★★ ou sem chance sobrando). */
  onContinue: () => void;
  /** Fecha sem avançar (sair na pausa, voltar depois da falha do 3D). */
  onLeave: () => void;
  /** O aparelho não deu conta: a carreira liga o modo desempenho dela (`enableBotao3dPerformanceAuto`). */
  onSlowDevice?: () => void;
};

/**
 * Clique em "Jogar" na carreira: a cena (e o three.js) já começa a baixar e a
 * torcida a ser gerada. Chame por import dinâmico deste arquivo (um import
 * estático traria o Scorebobo para o primeiro carregamento da carreira).
 */
export function warmCareerChallenge() {
  if (typeof window === "undefined") return;
  void import("./three/view").catch(() => undefined);
  warmScoreboboAudio();
}

type Stage = { index: number; level: ScoreLevel; teams: ScoreTeams; home: TeamInfo; away: TeamInfo };

/** Montagem da fase: a `key` muda a cada chance nova e a cada remontagem do 3D. */
type Mount = { key: number; chance: number };

export default function CareerChallenge({
  levelId,
  kicker,
  player,
  maxChances,
  chancesUsed,
  performance,
  onChanceStart,
  onChanceResult,
  onChanceRefund,
  onContinue,
  onLeave,
  onSlowDevice,
}: CareerChallengeProps) {
  const muted = useSyncExternalStore(subscribeMuted, readMuted, serverMuted);
  // O que vale é o que veio na abertura: a fase, o herói e o time não mudam no meio da jogada.
  const [opening] = useState(() => {
    const index = SCORE_LEVELS.findIndex((item) => item.id === levelId);
    const base = SCORE_LEVELS[index];
    if (!base || chancesUsed >= maxChances) return null;
    const profile = profileFromCareer(player);
    const home = teamInfoFromClub(player.club);
    return { index, level: levelWithHero(base, profile), home };
  });
  const [stage, setStage] = useState<Stage | null>(null);
  // Chances gastas, contadas aqui (começa no que veio do save): o "Chance N de 3" e o "Tentar de novo (N)".
  const usedRef = useRef(chancesUsed);
  const [mount, setMount] = useState<Mount>(() => ({ key: 1, chance: Math.min(maxChances, chancesUsed + 1) }));
  /** A montagem atual: começou (chance gasta), teve resultado, devolveu a chance. */
  const playRef = useRef({ begun: false, scored: false, refunded: false });
  const closedRef = useRef(false);
  const [slowDevice, setSlowDevice] = useState(false);

  // O host refaz as funções a cada render: os avisos leem daqui.
  const hostRef = useRef({ onChanceStart, onChanceResult, onChanceRefund, onContinue, onLeave, onSlowDevice });
  useEffect(() => {
    hostRef.current = { onChanceStart, onChanceResult, onChanceRefund, onContinue, onLeave, onSlowDevice };
  });

  const close = useCallback((how: "continue" | "leave") => {
    // Um toque duplo no "Continuar" não pode avançar dois anos.
    if (closedRef.current) return;
    closedRef.current = true;
    if (how === "continue") hostRef.current.onContinue();
    else hostRef.current.onLeave();
  }, []);

  // Fase que não existe ou chances esgotadas ao abrir: nada monta.
  useEffect(() => {
    if (opening) return;
    if (!SCORE_LEVELS.some((item) => item.id === levelId)) console.error("[scorebobo] fase da carreira não existe", levelId);
    close("leave");
  }, [opening, levelId, close]);

  // O adversário sai dos clubes (já carregados na carreira); `pickAwayTeam` nunca rejeita.
  useEffect(() => {
    if (!opening) return;
    let alive = true;
    void pickAwayTeam(opening.home, opening.level.id).then((away) => {
      if (alive) setStage({ index: opening.index, level: opening.level, teams: teamsFor(opening.home, away), home: opening.home, away });
    });
    return () => {
      alive = false;
    };
  }, [opening]);

  // Som: o mudo é o mesmo do /scorebobo e da partida; o toque em "Jogar" já foi o gesto (a fase destrava de novo no dedo).
  useEffect(() => {
    setScoreboboMuted(muted);
  }, [muted]);
  useEffect(() => {
    if (!opening) return;
    primeScoreboboAudio();
    warmScoreboboAudio();
  }, [opening]);

  const toggleMute = useCallback(() => {
    const next = !readMuted();
    rememberMuted(next);
    setScoreboboMuted(next);
  }, []);

  /** Chance nova (ou a mesma, devolvida) numa montagem nova. */
  const mountNext = useCallback(() => {
    playRef.current = { begun: false, scored: false, refunded: false };
    setMount((current) => ({ key: current.key + 1, chance: Math.min(maxChances, usedRef.current + 1) }));
  }, [maxChances]);

  const begin = useCallback(() => {
    const play = playRef.current;
    if (play.begun) return;
    play.begun = true;
    usedRef.current += 1;
    hostRef.current.onChanceStart();
  }, []);

  const result = useCallback((stars: StarCount) => {
    playRef.current.scored = true;
    hostRef.current.onChanceResult(stars);
  }, []);

  // O 3D caiu: começou e ficou sem resultado, a chance volta (a mesma chance remonta no "Tentar de novo").
  const failure = useCallback(() => {
    const play = playRef.current;
    const refund = hostRef.current.onChanceRefund;
    if (!play.begun || play.scored || play.refunded || !refund) return;
    play.refunded = true;
    usedRef.current = Math.max(0, usedRef.current - 1);
    refund();
  }, []);

  // "Tentar de novo" da falha do 3D e a volta do WebGL (Android de volta do fundo).
  const remount = useCallback(() => {
    if (closedRef.current) return;
    const play = playRef.current;
    if ((play.begun && play.scored) || usedRef.current >= maxChances) {
      close("leave");
      return;
    }
    mountNext();
  }, [maxChances, close, mountNext]);

  // "Tentar de novo (N)" do resultado: só aparece com chance sobrando.
  const retry = useCallback(() => {
    if (closedRef.current || usedRef.current >= maxChances) return;
    mountNext();
  }, [maxChances, mountNext]);

  // Como no /scorebobo: a próxima montagem já vem no modo desempenho, a não ser que o jogador o tenha desligado na mão.
  const slow = useCallback(() => {
    if (!readBotao3dPerformance().userOff) setSlowDevice(true);
    hostRef.current.onSlowDevice?.();
  }, []);

  const career = useMemo<ScoreboboCareerMode>(
    () => ({
      kicker,
      retriesLeft: Math.max(0, maxChances - mount.chance),
      note: `Chance ${mount.chance} de ${maxChances}`,
      onBegin: begin,
      onResult: result,
      onRetry: retry,
      onContinue: () => close("continue"),
      onLeave: () => close("leave"),
      onFailure: failure,
    }),
    [kicker, maxChances, mount.chance, begin, result, retry, close, failure],
  );

  const leaveLevels = useCallback(() => close("leave"), [close]);

  if (!opening) return null;

  return (
    <div className={`${albumCss.tokens} ${styles.root}`}>
      {stage && (
        <LevelPlayer
          key={mount.key}
          level={stage.level}
          levelIndex={stage.index}
          teams={stage.teams}
          home={stage.home}
          away={stage.away}
          performance={performance || slowDevice}
          muted={muted}
          onToggleMute={toggleMute}
          hasNext={false}
          nextUnlocked={false}
          onNext={leaveLevels}
          onLevels={leaveLevels}
          onSlowDevice={slow}
          onRemount={remount}
          career={career}
        />
      )}
    </div>
  );
}
