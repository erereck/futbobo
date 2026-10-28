"use client";

// Raiz da rota /scorebobo: abertura com as fases e, ao escolher uma, a fase em
// tela cheia. Junta o que é do jogador (save, estrelas, som, desempenho) com o
// que é da fase (herói, cores dos times) antes de criar a simulação.

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { readBotao3dPerformance, webglAvailable } from "../botao/view-mode";
import { playUiSound, primeScoreboboAudio, setScoreboboMuted } from "./audio";
import LevelPlayer from "./LevelPlayer";
import { SCORE_LEVELS } from "./sim/levels";
import {
  CLASSIC_HOME,
  levelUnlocked,
  levelWithHero,
  loadScoreboboProfile,
  pickAwayTeam,
  readMuted,
  readProgress,
  rememberMuted,
  serverMuted,
  serverProgress,
  setPerformancePreference,
  setUnlockAll,
  subscribeMuted,
  subscribeProgress,
  teamsFor,
  type ScoreboboProfile,
  type TeamInfo,
} from "./storage";
import { TitleScreen } from "./TitleScreen";
import type { ScoreLevel, ScoreTeams } from "./types";

// WebGL e preferências só existem no navegador: o servidor desenha a abertura e o hidrato corrige.
const noopSubscribe = () => () => undefined;
let webglCache: boolean | null = null;
const readWebgl = () => (webglCache ??= webglAvailable());
const serverTrue = () => true;
const readPerformanceDefault = () => readBotao3dPerformance().enabled;
const serverFalse = () => false;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const readReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;

/** Adversário enquanto os clubes ainda não chegaram (só a cor da prancheta usa). */
const PLACEHOLDER_AWAY: TeamInfo = { id: "away", name: "Adversário", abbr: "ADV", primary: "#d71920", secondary: "#111111" };

type Session = {
  key: number;
  index: number;
  level: ScoreLevel;
  teams: ScoreTeams;
  home: TeamInfo;
  away: TeamInfo;
};

let profilePromise: Promise<ScoreboboProfile> | null = null;
const profileOnce = () => (profilePromise ??= loadScoreboboProfile());

export default function Scorebobo() {
  // Sem WebGL o servidor e o primeiro quadro assumem que tem: o aviso só aparece se faltar mesmo.
  const hasWebgl = useSyncExternalStore(noopSubscribe, readWebgl, serverTrue);
  const progress = useSyncExternalStore(subscribeProgress, readProgress, serverProgress);
  const muted = useSyncExternalStore(subscribeMuted, readMuted, serverMuted);
  const performanceDefault = useSyncExternalStore(noopSubscribe, readPerformanceDefault, serverFalse);
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, serverFalse);
  const performanceMode = progress.performance ?? performanceDefault;

  const [profile, setProfile] = useState<ScoreboboProfile | null>(null);
  const [menuAway, setMenuAway] = useState<TeamInfo>(PLACEHOLDER_AWAY);
  const [session, setSession] = useState<Session | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let alive = true;
    profileOnce().then(async (loaded) => {
      if (!alive) return;
      setProfile(loaded);
      // Já baixa os clubes (e escolhe o rival da prancheta) enquanto o jogador olha o menu.
      const away = await pickAwayTeam(loaded.club, SCORE_LEVELS[0]?.id ?? "scorebobo");
      if (alive) setMenuAway(away);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setScoreboboMuted(muted);
  }, [muted]);

  // Voltar do Android/navegador dentro de uma fase volta às fases, não sai da rota.
  useEffect(() => {
    const onPop = () => setSession(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const start = useCallback(async (index: number, replace: boolean) => {
    const base = SCORE_LEVELS[index];
    if (!base) return;
    primeScoreboboAudio();
    playUiSound("select");
    setStarting(true);
    try {
      const loaded = await profileOnce();
      const home = loaded.club ?? CLASSIC_HOME;
      const away = await pickAwayTeam(home, base.id);
      const level = levelWithHero(base, loaded);
      if (!replace) {
        try {
          window.history.pushState({ scorebobo: base.id }, "");
        } catch {
          // Sem histórico: o botão "Fases" continua voltando.
        }
      }
      setSession((current) => ({ key: (current?.key ?? 0) + 1, index, level, teams: teamsFor(home, away), home, away }));
    } finally {
      setStarting(false);
    }
  }, []);

  const play = useCallback((index: number) => void start(index, false), [start]);

  const backToLevels = useCallback(() => {
    const state = window.history.state as { scorebobo?: string } | null;
    if (state?.scorebobo) window.history.back();
    else setSession(null);
  }, []);

  const nextLevel = useCallback(() => {
    if (!session) return;
    void start(session.index + 1, true);
  }, [session, start]);

  const toggleMute = useCallback(() => {
    const next = !readMuted();
    rememberMuted(next);
    setScoreboboMuted(next);
  }, []);

  const togglePerformance = useCallback(() => setPerformancePreference(!performanceMode), [performanceMode]);
  const toggleUnlockAll = useCallback(() => {
    const next = !readProgress().unlockAll;
    setUnlockAll(next);
    if (next) playUiSound("unlock");
  }, []);

  const nextIndex = session ? session.index + 1 : -1;
  const hasNext = nextIndex > 0 && nextIndex < SCORE_LEVELS.length;
  const nextUnlocked = hasNext && levelUnlocked(SCORE_LEVELS, nextIndex, progress);

  const levels = useMemo(() => SCORE_LEVELS, []);

  return (
    <>
      <TitleScreen
        levels={levels}
        progress={progress}
        profile={profile}
        away={menuAway}
        hasWebgl={hasWebgl}
        performance={performanceMode}
        muted={muted}
        reducedMotion={reducedMotion || Boolean(session)}
        starting={starting}
        covered={Boolean(session)}
        onPlay={play}
        onTogglePerformance={togglePerformance}
        onToggleMute={toggleMute}
        onToggleUnlockAll={toggleUnlockAll}
      />
      {session && (
        <LevelPlayer
          key={session.key}
          level={session.level}
          levelIndex={session.index}
          teams={session.teams}
          home={session.home}
          away={session.away}
          performance={performanceMode}
          muted={muted}
          onToggleMute={toggleMute}
          hasNext={hasNext}
          nextUnlocked={nextUnlocked}
          onNext={nextLevel}
          onLevels={backToLevels}
        />
      )}
    </>
  );
}
