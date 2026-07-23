"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  CLUBS,
  FIRST_MATCH_EVENT,
  FORMATIONS,
  POSITIONS,
  PRO_EVENTS,
  YOUTH_EVENTS,
  type Club,
  type Effect,
  type GameEvent,
  type PositionKey,
} from "./game-data";

type Phase =
  | "welcome"
  | "identity"
  | "academy"
  | "formation"
  | "youth"
  | "revelation"
  | "career"
  | "season-result"
  | "transfer"
  | "summary";

type PlayerStats = {
  appearances: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  goalsConceded: number;
};

type YouthYear = {
  age: number;
  title: string;
  text: string;
  delta: number;
};

type SeasonRecord = PlayerStats & {
  age: number;
  season: number;
  clubId: string;
  overall: number;
  title: boolean;
  eventTitle: string;
};

type SeasonResult = SeasonRecord & {
  resultText: string;
  development: number;
  marketValue: number;
  calledUp: boolean;
};

type GameState = {
  version: 1;
  phase: Phase;
  seed: number;
  name: string;
  number: number;
  foot: "Direita" | "Esquerda";
  position: PositionKey;
  academyClubId: string;
  formationId: string;
  archetype: string;
  revealAge: number;
  youthScore: number;
  youthYears: YouthYear[];
  proOffers: string[];
  currentClubId: string;
  age: number;
  season: number;
  overall: number;
  potential: number;
  morale: number;
  fitness: number;
  reputation: number;
  leadership: number;
  money: number;
  nationalLevel: number;
  stats: PlayerStats;
  trophies: number;
  currentEventId: string;
  nextEventId: string;
  seenEvents: string[];
  history: SeasonRecord[];
  lastResult: SeasonResult | null;
  transferOffers: string[];
};

const SAVE_KEY = "futbobo:career:v1";

const EMPTY_STATS: PlayerStats = {
  appearances: 0,
  goals: 0,
  assists: 0,
  cleanSheets: 0,
  goalsConceded: 0,
};

function initialState(): GameState {
  return {
    version: 1,
    phase: "welcome",
    seed: Date.now() % 2147483647,
    name: "",
    number: 10,
    foot: "Direita",
    position: "MEI",
    academyClubId: "",
    formationId: "",
    archetype: "",
    revealAge: 18,
    youthScore: 0,
    youthYears: [],
    proOffers: [],
    currentClubId: "",
    age: 12,
    season: 2026,
    overall: 42,
    potential: 78,
    morale: 76,
    fitness: 92,
    reputation: 0,
    leadership: 10,
    money: 0,
    nationalLevel: 0,
    stats: { ...EMPTY_STATS },
    trophies: 0,
    currentEventId: FIRST_MATCH_EVENT.id,
    nextEventId: "",
    seenEvents: [],
    history: [],
    lastResult: null,
    transferOffers: [],
  };
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function seeded(seed: number, salt = 0) {
  let value = (seed + salt * 2654435761) >>> 0;
  value += 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

function pick<T>(items: T[], seed: number, salt = 0): T {
  return items[Math.floor(seeded(seed, salt) * items.length) % items.length];
}

function clubById(id: string) {
  return CLUBS.find((club) => club.id === id) ?? CLUBS[0];
}

function positionByKey(key: PositionKey) {
  return POSITIONS.find((position) => position.key === key) ?? POSITIONS[6];
}

function marketValue(overall: number, age: number) {
  const base = Math.pow(Math.max(1, overall - 42), 2.45) * 9000;
  const ageFactor = age <= 24 ? 1.2 : age <= 29 ? 1 : Math.max(0.18, 1 - (age - 29) * 0.1);
  return Math.max(50000, Math.round((base * ageFactor) / 10000) * 10000);
}

function formatMoney(value: number) {
  if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  return `€${Math.round(value / 1000)}K`;
}

function addStats(a: PlayerStats, b: PlayerStats): PlayerStats {
  return {
    appearances: a.appearances + b.appearances,
    goals: a.goals + b.goals,
    assists: a.assists + b.assists,
    cleanSheets: a.cleanSheets + b.cleanSheets,
    goalsConceded: a.goalsConceded + b.goalsConceded,
  };
}

function selectOffers(state: GameState, count: number, salt: number) {
  const current = state.currentClubId || state.academyClubId;
  const currentRep = current ? clubById(current).reputation : 3;
  const targetRep = clamp(Math.round((state.overall - 56) / 6), 2, 5);
  const candidates = CLUBS.filter((club) => club.id !== current).sort((a, b) => {
    const scoreA = Math.abs(a.reputation - Math.max(currentRep, targetRep)) + seeded(state.seed, salt + CLUBS.indexOf(a));
    const scoreB = Math.abs(b.reputation - Math.max(currentRep, targetRep)) + seeded(state.seed, salt + CLUBS.indexOf(b));
    return scoreA - scoreB;
  });
  return candidates.slice(0, count).map((club) => club.id);
}

function eligibleEvents(state: GameState) {
  return PRO_EVENTS.filter((event) => {
    if (event.minAge !== undefined && state.age < event.minAge) return false;
    if (event.maxAge !== undefined && state.age > event.maxAge) return false;
    if (event.minOvr !== undefined && state.overall < event.minOvr) return false;
    if (event.maxOvr !== undefined && state.overall > event.maxOvr) return false;
    if (event.needsLowFitness && state.fitness > 67) return false;
    if (event.needsNational && state.nationalLevel < 1) return false;
    if (event.oneTime && state.seenEvents.includes(event.id)) return false;
    return true;
  });
}

function selectNextEvent(state: GameState, salt: number) {
  const events = eligibleEvents(state);
  const unseen = events.filter((event) => !state.seenEvents.includes(event.id));
  return pick(unseen.length ? unseen : events, state.seed + state.season, salt)?.id ?? "extra-training";
}

function createYouthJourney(state: GameState, formationId: string) {
  const formation = FORMATIONS.find((item) => item.id === formationId) ?? FORMATIONS[0];
  const club = clubById(state.academyClubId);
  const rawScore =
    41 +
    club.academy * 5 +
    formation.technical * 1.2 +
    formation.physical * 0.8 +
    formation.mental +
    seeded(state.seed, 11) * 22 -
    formation.risk * seeded(state.seed, 17);
  const score = clamp(Math.round(rawScore), 45, 98);
  const revealAge = score >= 82 ? 16 : score >= 67 ? 17 : 18;
  const overall = clamp(Math.round(45 + score * 0.27 + seeded(state.seed, 22) * 4), 55, 72);
  const potential = clamp(Math.round(69 + score * 0.25 + seeded(state.seed, 23) * 5), overall + 5, 96);
  const used = new Set<number>();
  const youthYears: YouthYear[] = [];
  for (let age = 12; age <= revealAge; age += 1) {
    let eventIndex = Math.floor(seeded(state.seed, age * 13) * YOUTH_EVENTS.length);
    while (used.has(eventIndex)) eventIndex = (eventIndex + 1) % YOUTH_EVENTS.length;
    used.add(eventIndex);
    const event = YOUTH_EVENTS[eventIndex];
    const positive = seeded(state.seed, age * 19) < score / 110;
    youthYears.push({
      age,
      title: age === revealAge ? "A revelação" : event.title,
      text: age === revealAge ? `O ${club.shortName} colocou seu nome na lista do elenco profissional.` : positive ? event.positive : event.neutral,
      delta: age === 12 ? 0 : positive ? 2 + Math.floor(seeded(state.seed, age * 29) * 3) : 1,
    });
  }
  const offerBase: GameState = { ...state, overall };
  const otherOffers = selectOffers(offerBase, 2, 41);
  return {
    formation,
    score,
    revealAge,
    overall,
    potential,
    youthYears,
    offers: [state.academyClubId, ...otherOffers],
  };
}

function applyEffect(state: GameState, effect: Effect) {
  return {
    ...state,
    overall: clamp(state.overall + (effect.ovr ?? 0), 40, 99),
    potential: clamp(state.potential + (effect.potential ?? 0), state.overall + 1, 99),
    morale: clamp(state.morale + (effect.morale ?? 0)),
    fitness: clamp(state.fitness + (effect.fitness ?? 0)),
    reputation: clamp(state.reputation + (effect.reputation ?? 0), 0, 100),
    leadership: clamp(state.leadership + (effect.leadership ?? 0), 0, 100),
    money: Math.max(0, state.money + (effect.money ?? 0)),
    nationalLevel: clamp(state.nationalLevel + (effect.nationalBoost ?? 0), 0, 100),
  };
}

function simulateSeason(state: GameState, event: GameEvent, effect: Effect, resultText: string): GameState {
  const affected = applyEffect(state, effect);
  const club = clubById(affected.currentClubId);
  const position = positionByKey(affected.position);
  const requirement = 55 + club.reputation * 5;
  const roleScore = affected.overall - requirement + (effect.minutes ?? 0);
  const baseApps = roleScore >= 5 ? 32 : roleScore >= 0 ? 25 : roleScore >= -5 ? 17 : 9;
  const appearances = clamp(Math.round(baseApps + seeded(state.seed, state.season * 3) * 8), 3, 38);
  const quality = clamp((affected.overall - 48) / 35, 0.45, 1.5);
  const isKeeper = position.key === "GOL";
  const goals = isKeeper ? (seeded(state.seed, state.season * 5) > 0.992 ? 1 : 0) : Math.max(0, Math.round(appearances * position.goals * quality * (0.65 + seeded(state.seed, state.season * 7) * 0.8)));
  const assists = isKeeper ? Math.round(seeded(state.seed, state.season * 11) * 2) : Math.max(0, Math.round(appearances * position.assists * quality * (0.65 + seeded(state.seed, state.season * 13) * 0.8)));
  const cleanSheets = isKeeper ? Math.round(appearances * (0.18 + club.reputation * 0.035 + affected.overall / 500)) : 0;
  const goalsConceded = isKeeper ? Math.max(4, Math.round(appearances * (1.55 - club.reputation * 0.1 - affected.overall / 180))) : 0;
  const seasonStats = { appearances, goals, assists, cleanSheets, goalsConceded };
  const titleChance = clamp(3 + club.reputation * 5 + Math.max(0, affected.overall - 70) * 0.65 + (effect.titleBoost ?? 0), 1, 58);
  const title = seeded(state.seed, state.season * 17) * 100 < titleChance;
  let development = 0;
  if (affected.age <= 20) development = 2 + Math.floor(seeded(state.seed, state.season * 19) * 3);
  else if (affected.age <= 24) development = 1 + Math.floor(seeded(state.seed, state.season * 19) * 3);
  else if (affected.age <= 28) development = Math.floor(seeded(state.seed, state.season * 19) * 2);
  else if (affected.age <= 31) development = seeded(state.seed, state.season * 19) > 0.62 ? 1 : 0;
  else development = -(1 + Math.floor(seeded(state.seed, state.season * 19) * Math.max(1, (affected.age - 29) / 3)));
  if (affected.overall >= affected.potential && development > 0) development = 0;
  if ((effect.injuryRisk ?? 0) + (100 - affected.fitness) > seeded(state.seed, state.season * 23) * 180) {
    development -= 1;
  }
  const nextOverall = clamp(affected.overall + development, 42, affected.potential);
  const nextAge = affected.age + 1;
  const calledUp = affected.nationalLevel >= 25 || (nextOverall >= 80 && seeded(state.seed, state.season * 31) > 0.42);
  const record: SeasonRecord = {
    ...seasonStats,
    age: affected.age,
    season: affected.season,
    clubId: club.id,
    overall: nextOverall,
    title,
    eventTitle: event.title,
  };
  const result: SeasonResult = {
    ...record,
    resultText,
    development,
    marketValue: marketValue(nextOverall, nextAge),
    calledUp,
  };
  const seenEvents = event.oneTime || event.id === FIRST_MATCH_EVENT.id
    ? Array.from(new Set([...affected.seenEvents, event.id]))
    : affected.seenEvents;
  const nextBase: GameState = {
    ...affected,
    phase: "season-result",
    age: nextAge,
    season: affected.season + 1,
    overall: nextOverall,
    fitness: clamp(affected.fitness + 18 - Math.max(0, appearances - 30)),
    morale: clamp(affected.morale + (title ? 12 : 1)),
    reputation: clamp(affected.reputation + Math.round(appearances / 12) + (title ? 8 : 0)),
    nationalLevel: clamp(calledUp ? Math.max(affected.nationalLevel, 32) : affected.nationalLevel),
    stats: addStats(affected.stats, seasonStats),
    trophies: affected.trophies + (title ? 1 : 0),
    history: [...affected.history, record],
    lastResult: result,
    seenEvents,
    nextEventId: "",
  };
  const nextEventId = selectNextEvent(nextBase, affected.season * 37);
  const transferOffers = effect.transfer ? selectOffers(nextBase, 3, affected.season * 43) : [];
  return {
    ...nextBase,
    nextEventId,
    transferOffers,
    phase: effect.retire || nextAge >= 40 ? "summary" : "season-result",
  };
}

function ClubBadge({ club, size = "md" }: { club: Club; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      className={`club-badge club-badge-${size}`}
      style={{ "--club-primary": club.primary, "--club-secondary": club.secondary } as CSSProperties}
      aria-hidden="true"
    >
      <span>{club.abbr}</span>
    </span>
  );
}

function Metric({ label, value, tone = "default" }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className={`metric metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Progress({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="progress-stat">
      <div className="progress-label"><span>{label}</span><strong>{Math.round(value)}</strong></div>
      <div className="progress-track"><span style={{ width: `${clamp(value)}%`, background: color }} /></div>
    </div>
  );
}

export default function Home() {
  const [game, setGame] = useState<GameState>(() => initialState());
  const [hasSave, setHasSave] = useState(false);
  const [youthStep, setYouthStep] = useState(0);
  const [activeTab, setActiveTab] = useState<"event" | "history" | "profile">("event");
  const [toast, setToast] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as GameState;
        if (parsed.version === 1) {
          queueMicrotask(() => setHasSave(parsed.phase !== "welcome"));
        }
      }
    } catch {
      localStorage.removeItem(SAVE_KEY);
    }
  }, []);

  useEffect(() => {
    if (game.phase === "welcome") return;
    localStorage.setItem(SAVE_KEY, JSON.stringify(game));
  }, [game]);

  useEffect(() => {
    if (game.phase !== "youth") return;
    const timers = game.youthYears.map((_, index) =>
      window.setTimeout(() => setYouthStep(index + 1), 350 + index * 340),
    );
    const finish = window.setTimeout(
      () => setGame((current) => ({ ...current, phase: "revelation" })),
      900 + game.youthYears.length * 340,
    );
    return () => {
      timers.forEach(window.clearTimeout);
      window.clearTimeout(finish);
    };
  }, [game.phase, game.youthYears]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const currentClub = useMemo(() => clubById(game.currentClubId || game.academyClubId), [game.currentClubId, game.academyClubId]);
  const position = useMemo(() => positionByKey(game.position), [game.position]);
  const currentEvent = useMemo(() => {
    if (game.currentEventId === FIRST_MATCH_EVENT.id) return FIRST_MATCH_EVENT;
    return PRO_EVENTS.find((event) => event.id === game.currentEventId) ?? PRO_EVENTS[0];
  }, [game.currentEventId]);

  function vibrate() {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(18);
  }

  function startNew() {
    localStorage.removeItem(SAVE_KEY);
    setGame({ ...initialState(), phase: "identity", seed: Date.now() % 2147483647 });
    setHasSave(true);
    setActiveTab("event");
    vibrate();
  }

  function continueSave() {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved) setGame(JSON.parse(saved) as GameState);
    } catch {
      startNew();
    }
  }

  function selectFormation(formationId: string) {
    const journey = createYouthJourney(game, formationId);
    setYouthStep(0);
    setGame((current) => ({
      ...current,
      phase: "youth",
      formationId,
      archetype: journey.formation.archetype,
      revealAge: journey.revealAge,
      youthScore: journey.score,
      youthYears: journey.youthYears,
      proOffers: journey.offers,
      age: journey.revealAge,
      season: current.season + journey.revealAge - 12,
      overall: journey.overall,
      potential: journey.potential,
      morale: clamp(68 + Math.round(journey.score / 4)),
      fitness: 94,
    }));
    vibrate();
  }

  function signProfessional(clubId: string) {
    setGame((current) => ({
      ...current,
      phase: "career",
      currentClubId: clubId,
      currentEventId: FIRST_MATCH_EVENT.id,
      nextEventId: "",
      reputation: clubId === current.academyClubId ? 8 : 4,
      money: 1,
    }));
    setActiveTab("event");
    vibrate();
  }

  function chooseEvent(choiceIndex: number) {
    const choice = currentEvent.choices[choiceIndex];
    if (!choice) return;
    setGame((current) => simulateSeason(current, currentEvent, choice.effect, choice.result));
    vibrate();
  }

  function continueAfterResult() {
    if (game.transferOffers.length) {
      setGame((current) => ({ ...current, phase: "transfer" }));
    } else {
      setGame((current) => ({
        ...current,
        phase: "career",
        currentEventId: current.nextEventId || "extra-training",
        lastResult: null,
      }));
    }
    setActiveTab("event");
    vibrate();
  }

  function chooseTransfer(clubId: string | null) {
    setGame((current) => ({
      ...current,
      phase: "career",
      currentClubId: clubId ?? current.currentClubId,
      currentEventId: current.nextEventId || "extra-training",
      lastResult: null,
      transferOffers: [],
      morale: clamp(current.morale + (clubId ? 5 : 2)),
    }));
    setActiveTab("event");
    vibrate();
  }

  async function shareCareer() {
    const text = `Minha carreira no Futbobo: ${game.name}, ${position.name}, ${game.stats.appearances} jogos, ${game.stats.goals} gols, ${game.trophies} título(s) e pico de ${Math.max(game.overall, ...game.history.map((item) => item.overall), 0)} OVR. Você faria melhor?`;
    try {
      if (navigator.share) await navigator.share({ title: "Minha carreira no Futbobo", text, url: window.location.href });
      else await navigator.clipboard.writeText(`${text} ${window.location.href}`);
      setToast("Carreira pronta para compartilhar");
    } catch {
      setToast("Compartilhamento cancelado");
    }
  }

  const shellClass = game.phase === "welcome" ? "app-shell app-shell-welcome" : "app-shell";

  return (
    <main className={shellClass}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      {toast && <div className="toast" role="status">{toast}</div>}

      {game.phase === "welcome" && (
        <section className="welcome-screen screen-enter">
          <div className="brand-lockup" aria-label="Futbobo">
            <span className="brand-ball">F</span>
            <span>FUTBOBO</span>
            <small>CARREIRA</small>
          </div>
          <div className="hero-pitch" aria-hidden="true">
            <div className="pitch-line pitch-center" />
            <div className="pitch-circle" />
            <div className="hero-player-card">
              <span>12</span>
              <div><strong>anos</strong><small>o começo de tudo</small></div>
            </div>
          </div>
          <div className="welcome-copy">
            <span className="eyebrow">SUA HISTÓRIA. SUAS ESCOLHAS.</span>
            <h1>Da base ao topo do Brasil.</h1>
            <p>Comece aos 12, conquiste seu espaço e construa uma carreira inteira no Brasileirão.</p>
          </div>
          <div className="welcome-actions">
            <button className="primary-button" onClick={startNew}>Começar nova carreira <span>→</span></button>
            {hasSave && <button className="secondary-button" onClick={continueSave}>Continuar carreira salva</button>}
          </div>
          <div className="welcome-features">
            <span>◉ 20 clubes</span><span>✦ 12 posições</span><span>↻ carreira salva</span>
          </div>
        </section>
      )}

      {game.phase === "identity" && (
        <section className="setup-screen screen-enter">
          <header className="step-header">
            <button className="icon-button" onClick={() => setGame((current) => ({ ...current, phase: "welcome" }))} aria-label="Voltar">←</button>
            <div><span>PASSO 1 DE 4</span><strong>Quem vai vestir a camisa?</strong></div>
            <div className="step-count">01</div>
          </header>
          <div className="setup-content">
            <div className="identity-card">
              <div className="academy-avatar"><span>{game.number}</span><small>{game.position}</small></div>
              <div><span>IDADE INICIAL</span><strong>12 ANOS</strong><small>O sonho começa agora</small></div>
            </div>
            <label className="field-label">Nome do jogador
              <input className="text-input" value={game.name} maxLength={18} placeholder="Como a torcida vai te chamar?" onChange={(event) => setGame((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <div className="two-fields">
              <label className="field-label">Camisa
                <input className="text-input" type="number" inputMode="numeric" min={1} max={99} value={game.number} onChange={(event) => setGame((current) => ({ ...current, number: clamp(Number(event.target.value) || 1, 1, 99) }))} />
              </label>
              <fieldset className="field-label foot-field"><legend>Pé dominante</legend>
                <div className="segmented">
                  {(["Esquerda", "Direita"] as const).map((foot) => <button key={foot} type="button" className={game.foot === foot ? "selected" : ""} onClick={() => setGame((current) => ({ ...current, foot }))}>{foot}</button>)}
                </div>
              </fieldset>
            </div>
            <div className="section-heading"><div><span>POSIÇÃO</span><h2>Onde você quer fazer história?</h2></div><span className="selected-pill">{position.key}</span></div>
            <div className="position-grid">
              {POSITIONS.map((item) => (
                <button key={item.key} type="button" className={`position-button ${game.position === item.key ? "selected" : ""}`} onClick={() => setGame((current) => ({ ...current, position: item.key }))} style={{ "--position-color": item.color } as CSSProperties}>
                  <span>{item.icon}</span><strong>{item.key}</strong><small>{item.name}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="sticky-action"><button className="primary-button" disabled={!game.name.trim()} onClick={() => setGame((current) => ({ ...current, name: current.name.trim(), phase: "academy" }))}>Escolher clube de base <span>→</span></button></div>
        </section>
      )}

      {game.phase === "academy" && (
        <section className="setup-screen screen-enter">
          <header className="step-header">
            <button className="icon-button" onClick={() => setGame((current) => ({ ...current, phase: "identity" }))} aria-label="Voltar">←</button>
            <div><span>PASSO 2 DE 4</span><strong>Escolha sua base</strong></div>
            <div className="step-count">02</div>
          </header>
          <div className="setup-content">
            <div className="intro-card"><span className="intro-icon">⌂</span><div><strong>20 portas. Uma primeira camisa.</strong><p>A estrutura da base acelera seu desenvolvimento, mas toda escolha pode virar uma grande história.</p></div></div>
            <div className="club-grid">
              {CLUBS.map((club) => (
                <button key={club.id} className={`club-choice ${game.academyClubId === club.id ? "selected" : ""}`} onClick={() => setGame((current) => ({ ...current, academyClubId: club.id }))}>
                  <ClubBadge club={club} size="md" />
                  <span><strong>{club.shortName}</strong><small>{club.city} · {club.state}</small></span>
                  <span className="academy-stars">{"★".repeat(club.academy)}{"☆".repeat(5 - club.academy)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="sticky-action"><button className="primary-button" disabled={!game.academyClubId} onClick={() => setGame((current) => ({ ...current, phase: "formation" }))}>Definir sua formação <span>→</span></button></div>
        </section>
      )}

      {game.phase === "formation" && (
        <section className="setup-screen screen-enter">
          <header className="step-header">
            <button className="icon-button" onClick={() => setGame((current) => ({ ...current, phase: "academy" }))} aria-label="Voltar">←</button>
            <div><span>PASSO 3 DE 4</span><strong>Que jogador você será?</strong></div>
            <div className="step-count">03</div>
          </header>
          <div className="setup-content">
            <div className="section-heading"><div><span>PRIMEIRA DECISÃO</span><h2>Seu foco até virar profissional</h2></div></div>
            <p className="setup-lead">Essa escolha muda sua curva de evolução, a idade da revelação e os eventos que encontrarão você.</p>
            <div className="formation-list">
              {FORMATIONS.map((formation) => (
                <button key={formation.id} className="formation-card" onClick={() => selectFormation(formation.id)}>
                  <span className="formation-icon">{formation.icon}</span>
                  <span className="formation-copy"><small>{formation.subtitle}</small><strong>{formation.title}</strong><p>{formation.description}</p></span>
                  <span className="formation-arrow">→</span>
                </button>
              ))}
            </div>
          </div>
          <div className="setup-note">A base será simulada rapidamente dos 12 até os 16–18 anos.</div>
        </section>
      )}

      {game.phase === "youth" && (
        <section className="youth-screen screen-enter">
          <div className="brand-mini"><span className="brand-ball">F</span> FUTBOBO</div>
          <div className="youth-club"><ClubBadge club={clubById(game.academyClubId)} size="lg" /><span>Formando em</span><strong>{clubById(game.academyClubId).shortName}</strong></div>
          <div className="age-counter"><small>SUA IDADE</small><strong>{game.youthYears[Math.max(0, youthStep - 1)]?.age ?? 12}</strong><span>ANOS</span></div>
          <div className="youth-progress"><span style={{ width: `${(youthStep / Math.max(1, game.youthYears.length)) * 100}%` }} /></div>
          <div className="youth-feed">
            {game.youthYears.slice(0, youthStep).map((year, index) => (
              <article className="youth-feed-item" key={`${year.age}-${year.title}`} style={{ animationDelay: `${index * 20}ms` }}>
                <span>{year.age}</span><div><strong>{year.title}</strong><p>{year.text}</p></div><em>+{year.delta}</em>
              </article>
            ))}
          </div>
          <p className="simulating-label"><span /> Simulando sua formação...</p>
        </section>
      )}

      {game.phase === "revelation" && (
        <section className="revelation-screen screen-enter">
          <div className="reveal-rays" aria-hidden="true" />
          <div className="reveal-top"><span>JOGADOR REVELADO</span><small>{game.season}</small></div>
          <div className="reveal-card">
            <ClubBadge club={clubById(game.academyClubId)} size="lg" />
            <div className="reveal-overall"><span>OVR</span><strong>{game.overall}</strong></div>
            <div className="reveal-name"><small>{game.archetype}</small><h1>{game.name}</h1><span>#{game.number} · {position.name} · {game.foot}</span></div>
            <div className="reveal-stats"><Metric label="Revelado aos" value={`${game.revealAge} anos`} /><Metric label="Potencial" value={game.potential} tone="gold" /><Metric label="Estilo" value={position.style} /></div>
          </div>
          <div className="contract-section"><div className="section-heading"><div><span>PRIMEIRO CONTRATO</span><h2>Quem aposta em você?</h2></div></div>
            <div className="offer-list">
              {game.proOffers.map((clubId, index) => {
                const club = clubById(clubId);
                return <button className="offer-card" key={clubId} onClick={() => signProfessional(clubId)}><ClubBadge club={club} /><span><small>{index === 0 ? "PROMOÇÃO DA BASE" : "PROPOSTA PROFISSIONAL"}</small><strong>{club.shortName}</strong><em>{index === 0 ? "Projeto conhecido" : index === 1 ? "Mais minutos" : "Maior vitrine"}</em></span><b>→</b></button>;
              })}
            </div>
          </div>
        </section>
      )}

      {(game.phase === "career" || game.phase === "season-result" || game.phase === "transfer") && (
        <section className="career-shell screen-enter">
          <header className="career-header">
            <div className="club-identity"><ClubBadge club={currentClub} size="sm" /><span><small>{game.season}</small><strong>{currentClub.shortName}</strong></span></div>
            <div className="career-age"><strong>{game.age}</strong><span>ANOS</span></div>
            <div className="player-identity"><span><small>OVR</small><strong>{game.overall}</strong></span><div className="mini-avatar">{game.position}</div></div>
          </header>
          <div className="career-bars">
            <Progress label="Moral" value={game.morale} color="#2ca8ff" />
            <Progress label="Físico" value={game.fitness} color={game.fitness < 55 ? "#ff5a4e" : "#63e36b"} />
            <Progress label="Prestígio" value={game.reputation} color="#ffc72c" />
          </div>

          {game.phase === "career" && activeTab === "event" && (
            <div className="event-stage">
              <div className="event-art" data-icon={currentEvent.icon}><span className="event-tag">{currentEvent.tag}</span><div className="event-watermark">{currentEvent.icon}</div></div>
              <article className="event-card">
                <div className="event-heading"><span>{game.currentEventId === "debut" ? "PRIMEIRO CAPÍTULO" : `TEMPORADA ${game.season}`}</span><h1>{currentEvent.title}</h1><p>{currentEvent.description}</p></div>
                <div className="choice-list">
                  {currentEvent.choices.map((choice, index) => <button key={choice.label} className="decision-button" onClick={() => chooseEvent(index)}><span><strong>{choice.label}</strong><small>{choice.hint}</small></span><b>→</b></button>)}
                </div>
              </article>
            </div>
          )}

          {game.phase === "season-result" && game.lastResult && (
            <div className="result-stage screen-enter">
              <span className="result-kicker">TEMPORADA {game.lastResult.season}</span>
              <div className={`result-symbol ${game.lastResult.title ? "winner" : ""}`}>{game.lastResult.title ? "🏆" : game.lastResult.development >= 0 ? "↗" : "↘"}</div>
              <h1>{game.lastResult.title ? "Campeão brasileiro!" : game.lastResult.development > 0 ? "Você subiu de nível" : game.lastResult.development < 0 ? "Uma temporada dura" : "Mais um ano de estrada"}</h1>
              <p>{game.lastResult.resultText}</p>
              <div className="season-stat-grid">
                <Metric label="Jogos" value={game.lastResult.appearances} />
                <Metric label={game.position === "GOL" ? "Sem sofrer" : "Gols"} value={game.position === "GOL" ? game.lastResult.cleanSheets : game.lastResult.goals} tone="green" />
                <Metric label={game.position === "GOL" ? "Sofridos" : "Assistências"} value={game.position === "GOL" ? game.lastResult.goalsConceded : game.lastResult.assists} />
                <Metric label="Novo OVR" value={game.overall} tone={game.lastResult.development >= 0 ? "gold" : "danger"} />
              </div>
              <div className="result-details"><span>Valor de mercado <strong>{formatMoney(game.lastResult.marketValue)}</strong></span>{game.lastResult.calledUp && <span className="callup-badge">★ No radar da Seleção</span>}</div>
              <button className="primary-button" onClick={continueAfterResult}>{game.transferOffers.length ? "Abrir janela de transferências" : "Próxima temporada"} <span>→</span></button>
            </div>
          )}

          {game.phase === "transfer" && (
            <div className="transfer-stage screen-enter">
              <span className="eyebrow">JANELA DE TRANSFERÊNCIAS</span><h1>Seu próximo passo</h1><p>Três clubes chegaram com projetos diferentes. Você também pode ficar e construir seu nome aqui.</p>
              <div className="offer-list transfer-offers">
                {game.transferOffers.map((clubId, index) => { const club = clubById(clubId); return <button className="offer-card" key={clubId} onClick={() => chooseTransfer(clubId)}><ClubBadge club={club} /><span><small>{index === 0 ? "MAIS PRESTÍGIO" : index === 1 ? "PROJETO DE TITULAR" : "NOVOS ARES"}</small><strong>{club.shortName}</strong><em>{club.city} · reputação {club.reputation}/5</em></span><b>→</b></button>; })}
                <button className="offer-card stay-card" onClick={() => chooseTransfer(null)}><ClubBadge club={currentClub} /><span><small>CONTINUAR O PROJETO</small><strong>Ficar no {currentClub.shortName}</strong><em>Manter seu espaço e sua história</em></span><b>✓</b></button>
              </div>
            </div>
          )}

          {activeTab === "history" && game.phase === "career" && (
            <div className="panel-screen screen-enter">
              <div className="section-heading"><div><span>LINHA DO TEMPO</span><h2>Sua carreira até aqui</h2></div></div>
              <div className="timeline-list">
                {game.history.length === 0 && <div className="empty-panel">Sua estreia será o primeiro capítulo desta história.</div>}
                {[...game.history].reverse().map((record) => { const club = clubById(record.clubId); return <article className="timeline-row" key={`${record.season}-${record.clubId}`}><span className="timeline-year">{record.season}</span><ClubBadge club={club} size="sm" /><div><strong>{club.shortName}</strong><small>{record.appearances}J · {game.position === "GOL" ? `${record.cleanSheets}SG` : `${record.goals}G · ${record.assists}A`}</small></div><span className="timeline-ovr">{record.overall}</span>{record.title && <span className="timeline-trophy">🏆</span>}</article>; })}
              </div>
            </div>
          )}

          {activeTab === "profile" && game.phase === "career" && (
            <div className="panel-screen screen-enter">
              <div className="profile-hero"><div className="academy-avatar"><span>{game.number}</span><small>{game.position}</small></div><div><span>{game.archetype}</span><h2>{game.name}</h2><p>{position.style} · {game.foot}</p></div></div>
              <div className="profile-metrics"><Metric label="OVR" value={game.overall} tone="gold" /><Metric label="Potencial" value={game.potential} /><Metric label="Valor" value={formatMoney(marketValue(game.overall, game.age))} /></div>
              <div className="attribute-card"><Progress label="Moral" value={game.morale} color="#2ca8ff" /><Progress label="Condição" value={game.fitness} color="#63e36b" /><Progress label="Prestígio" value={game.reputation} color="#ffc72c" /><Progress label="Liderança" value={game.leadership} color="#a675ff" /><Progress label="Seleção" value={game.nationalLevel} color="#f5f7f2" /></div>
              <div className="career-total-card"><span>TOTAIS DA CARREIRA</span><div><Metric label="Jogos" value={game.stats.appearances} /><Metric label={game.position === "GOL" ? "Sem sofrer" : "Gols"} value={game.position === "GOL" ? game.stats.cleanSheets : game.stats.goals} /><Metric label={game.position === "GOL" ? "Sofridos" : "Assistências"} value={game.position === "GOL" ? game.stats.goalsConceded : game.stats.assists} /><Metric label="Títulos" value={game.trophies} tone="gold" /></div></div>
            </div>
          )}

          {game.phase === "career" && (
            <nav className="bottom-nav" aria-label="Navegação da carreira">
              <button className={activeTab === "event" ? "selected" : ""} onClick={() => setActiveTab("event")}><span>◆</span>Carreira</button>
              <button className={activeTab === "history" ? "selected" : ""} onClick={() => setActiveTab("history")}><span>≡</span>Histórico</button>
              <button className={activeTab === "profile" ? "selected" : ""} onClick={() => setActiveTab("profile")}><span>●</span>Jogador</button>
            </nav>
          )}
        </section>
      )}

      {game.phase === "summary" && (
        <section className="summary-screen screen-enter">
          <div className="summary-confetti" aria-hidden="true">✦ · ★ · ✦ · ★ · ✦</div>
          <span className="eyebrow">CARREIRA FINALIZADA</span>
          <h1>Uma história que só você viveu.</h1>
          <div className="share-card">
            <div className="share-brand"><span className="brand-ball">F</span><strong>FUTBOBO</strong><small>MINHA CARREIRA</small></div>
            <div className="share-player"><ClubBadge club={currentClub} size="lg" /><div><span>{game.archetype}</span><h2>{game.name}</h2><p>#{game.number} · {position.name}</p></div><strong>{Math.max(game.overall, ...game.history.map((item) => item.overall), 0)}<small>PICO OVR</small></strong></div>
            <div className="share-numbers"><Metric label="Jogos" value={game.stats.appearances} /><Metric label={game.position === "GOL" ? "Sem sofrer" : "Gols"} value={game.position === "GOL" ? game.stats.cleanSheets : game.stats.goals} /><Metric label={game.position === "GOL" ? "Sofridos" : "Assistências"} value={game.position === "GOL" ? game.stats.goalsConceded : game.stats.assists} /><Metric label="Brasileirões" value={game.trophies} tone="gold" /></div>
            <div className="share-path"><span>12</span><div />{Array.from(new Set(game.history.map((item) => item.clubId))).map((clubId) => <ClubBadge key={clubId} club={clubById(clubId)} size="sm" />)}<div /><span>{game.age}</span></div>
            <small className="share-url">erereck.github.io/futbobo</small>
          </div>
          <div className="summary-actions"><button className="primary-button" onClick={shareCareer}>Compartilhar carreira <span>↗</span></button><button className="secondary-button" onClick={startNew}>Jogar novamente</button></div>
        </section>
      )}
    </main>
  );
}
