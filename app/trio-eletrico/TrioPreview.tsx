"use client";

// Painel da rota /trio-eletrico: escolhe país, cidade, hora, variação, visual e
// personagem e abre a mesma festa do título da carreira, quantas vezes quiser.
//
// A rota roda fora do shell do jogo, onde a ponte do IndexedDB não está
// instalada: o save é lido direto (só leitura) e, sem save, vale um jogador
// sorteado. O cartão-postal no topo é o próprio palco 2D rodando em miniatura.

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties } from "react";
import { COUNTRIES } from "../game-data";
import { normalizePlayerAppearance, randomPlayerAppearance, type PlayerAppearance } from "../player-appearance";
import { readBotao3dPerformance, readBotao3dPreference, webglAvailable } from "../botao/view-mode";
import { buildParadeInput, buildParadeTimeline, paradeCitiesFor, type ParadeInput, type ParadeTimeOfDay } from "../parade/parade-script";
import { Parade2DStage } from "../parade/ParadeCutscene2D";
import { paradeBeatPulse, primeParadeAudio } from "../parade/parade-audio";
import { careerWorldCupTitles, paradeStars } from "../parade/parade-stars";
import styles from "./TrioPreview.module.css";

const ParadeCutscene = dynamic(() => import("../parade/ParadeCutscene"), {
  ssr: false,
  loading: () => <div className={styles.veil} />,
});

type VisualChoice = "3d" | "2d";
type CharacterChoice = "save" | "random";

type SavedPlayer = {
  name: string;
  appearance: PlayerAppearance;
  number: number;
  nationality: string;
  seed: number;
  season: number;
  worldCups: number;
};

// Mesmas chaves de `career/state.ts` e `career/indexed-storage.ts`.
const SAVE_KEY = "futbobo:career:v1";
const STORAGE_DB = "futbobo-storage";
const STORAGE_STORE = "large-local-storage";

/**
 * Lê o save sem instalar a ponte: o localStorage físico (saves antigos, ou a
 * ponte já instalada nesta aba) e depois o IndexedDB, só leitura. Se o banco
 * não existe, a abertura é abortada para não criar nada.
 */
async function readSaveRaw(): Promise<string | null> {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (raw) return raw;
  } catch {
    // Storage bloqueado: tenta o IndexedDB.
  }
  if (typeof indexedDB === "undefined") return null;
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(STORAGE_DB);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
    request.onsuccess = () => {
      const database = request.result;
      const done = (value: string | null) => {
        database.close();
        resolve(value);
      };
      try {
        if (!database.objectStoreNames.contains(STORAGE_STORE)) {
          done(null);
          return;
        }
        const read = database.transaction(STORAGE_STORE, "readonly").objectStore(STORAGE_STORE).get(SAVE_KEY);
        read.onsuccess = () => done(typeof read.result === "string" ? read.result : null);
        read.onerror = () => done(null);
      } catch {
        done(null);
      }
    };
  });
}

function parseSave(raw: string): SavedPlayer | null {
  try {
    const save = JSON.parse(raw) as Record<string, unknown>;
    const name = typeof save.name === "string" ? save.name.trim() : "";
    if (!name) return null;
    const nationality = typeof save.nationality === "string" && COUNTRIES.some((country) => country.id === save.nationality) ? save.nationality : "brasil";
    const lastResult = save.lastResult && typeof save.lastResult === "object" ? (save.lastResult as Record<string, unknown>) : null;
    const season = Math.max(1990, Math.min(2100, Math.round(Number(lastResult?.season) || Number(save.season) || 2026)));
    const history = (Array.isArray(save.nationalHistory) ? save.nationalHistory : [])
      .filter((record): record is Record<string, unknown> => Boolean(record) && typeof record === "object")
      .map((record) => ({
        season: Number(record.season) || 0,
        name: String(record.name ?? ""),
        champion: record.champion === true,
        countryId: typeof record.countryId === "string" ? record.countryId : undefined,
      }));
    return {
      name,
      appearance: normalizePlayerAppearance(save.playerAppearance as Partial<PlayerAppearance> | undefined),
      number: Number(save.number) || 10,
      nationality,
      seed: Number(save.seed) || 1,
      season,
      worldCups: careerWorldCupTitles(history, nationality, 9999, nationality),
    };
  } catch {
    return null;
  }
}

const RANDOM_NAMES = ["Rafael Nunes", "Caio Ribeiro", "Davi Monteiro", "Lucas Amaral", "Thiago Prates", "João Vitor Lima", "Matheus Areias", "Enzo Carvalho", "Gabriel Sato", "Pedro Albuquerque"];
const TIMES: ReadonlyArray<{ value: ParadeTimeOfDay; label: string }> = [
  { value: "day", label: "Dia" },
  { value: "sunset", label: "Pôr do sol" },
  { value: "night", label: "Noite" },
];
const STYLE_LABELS: Record<string, string> = {
  beach: "Orla",
  metropolis: "Metrópole",
  modernist: "Esplanada",
  colonial: "Casario",
  european: "Bulevar",
};

// WebGL e preferências só existem no navegador: o servidor desenha o 2D e o hidrato corrige.
const noopSubscribe = () => () => undefined;
let webglCache: boolean | null = null;
const readWebgl = () => (webglCache ??= webglAvailable());
const read3dPreference = () => readBotao3dPreference();
const readPerformance = () => readBotao3dPerformance().enabled;
const serverFalse = () => false;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const readReduced = () => window.matchMedia(REDUCED_MOTION).matches;

function Segmented<T extends string | number>({ label, value, options, onChange }: {
  label: string;
  value: T | null;
  options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={option.disabled}
          className={value === option.value ? styles.segmentActive : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Cartão-postal: o palco 2D em miniatura, em loop do deck até os fogos. */
function Postcard({ input, paused, reducedMotion }: { input: ParadeInput; paused: boolean; reducedMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const timeline = buildParadeTimeline(input);
    let stage: Parade2DStage;
    try {
      stage = new Parade2DStage(canvas, timeline, { performance: true, reducedMotion });
    } catch {
      return;
    }
    const from = timeline.beats.find((beat) => beat.id === "deck")?.start ?? 17;
    const to = timeline.duration;
    const still = timeline.burstAt + 1.4;
    let frame = 0;
    let start = 0;
    const draw = (time: number) => {
      stage.setBeat(paradeBeatPulse(time));
      stage.render(time, 0);
    };
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (document.hidden) return;
      if (!start) start = now;
      draw(from + (((now - start) / 1000) % (to - from)));
    };
    let cancelled = false;
    void stage.prepare().then(() => {
      // Desmontou antes de ficar pronto: nada de laço órfão desenhando num palco descartado.
      if (cancelled) return;
      if (paused || reducedMotion) draw(still);
      else frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stage.dispose();
    };
  }, [input, paused, reducedMotion]);
  return <canvas ref={canvasRef} className={styles.postcardCanvas} aria-hidden="true" />;
}

export default function TrioPreview() {
  const hasWebgl = useSyncExternalStore(noopSubscribe, readWebgl, serverFalse);
  const prefers3d = useSyncExternalStore(noopSubscribe, read3dPreference, serverFalse);
  const prefersPerformance = useSyncExternalStore(noopSubscribe, readPerformance, serverFalse);
  const reducedMotion = useSyncExternalStore(subscribeReduced, readReduced, serverFalse);

  const [countryId, setCountryId] = useState("brasil");
  const [cityChoice, setCityChoice] = useState<string | null>(null);
  const [timeOfDay, setTimeOfDay] = useState<ParadeTimeOfDay>("sunset");
  const [variant, setVariant] = useState(0);
  const [visualChoice, setVisualChoice] = useState<VisualChoice | null>(null);
  const [performanceChoice, setPerformanceChoice] = useState<boolean | null>(null);
  const [characterChoice, setCharacterChoice] = useState<CharacterChoice | null>(null);
  const [starsChoice, setStarsChoice] = useState<number | null>(null);
  const [randomSeed, setRandomSeed] = useState(20260);
  const [save, setSave] = useState<SavedPlayer | null>(null);
  const [saveStatus, setSaveStatus] = useState<"loading" | "ready">("loading");
  const [session, setSession] = useState<{ key: number; input: ParadeInput; mode: VisualChoice; performance: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    readSaveRaw()
      .then((raw) => {
        if (!alive) return;
        setSave(raw ? parseSave(raw) : null);
        setSaveStatus("ready");
      })
      .catch(() => {
        if (alive) setSaveStatus("ready");
      });
    return () => {
      alive = false;
    };
  }, []);

  const cities = useMemo(() => paradeCitiesFor(countryId), [countryId]);
  const city = cities.find((item) => item.id === cityChoice) ?? cities[0];
  const visual: VisualChoice = hasWebgl ? visualChoice ?? (prefers3d ? "3d" : "2d") : "2d";
  const performanceMode = performanceChoice ?? prefersPerformance;
  const character: CharacterChoice | null = characterChoice ?? (saveStatus === "loading" ? null : save ? "save" : "random");
  const fromSave = character === "save" && save !== null;
  const careerTitles = fromSave && save && save.nationality === countryId ? save.worldCups : 0;
  const stars = starsChoice ?? paradeStars(countryId, careerTitles);
  const country = COUNTRIES.find((item) => item.id === countryId) ?? COUNTRIES[0];

  const randomAppearance = useMemo(() => randomPlayerAppearance(randomSeed), [randomSeed]);

  const input = useMemo<ParadeInput | null>(() => {
    if (!character) return null;
    const player = fromSave && save
      ? { name: save.name, appearance: save.appearance, number: save.number }
      : { name: RANDOM_NAMES[randomSeed % RANDOM_NAMES.length], appearance: randomAppearance, number: [7, 9, 10, 11][randomSeed % 4] };
    return buildParadeInput({
      seed: fromSave && save ? save.seed : randomSeed,
      season: fromSave && save ? save.season : 2026,
      countryId,
      player,
      stars,
      cityId: city.id,
      timeOfDay,
      variant,
    });
  }, [character, fromSave, save, randomSeed, randomAppearance, countryId, stars, city.id, timeOfDay, variant]);

  const watch = useCallback(() => {
    if (!input) return;
    // O clique é o gesto que libera o som; a cutscene ainda vai baixar.
    primeParadeAudio();
    setSession((current) => ({ key: (current?.key ?? 0) + 1, input, mode: visual, performance: performanceMode }));
  }, [input, visual, performanceMode]);

  const closeParade = useCallback(() => setSession(null), []);

  const pickCountry = (id: string) => {
    setCountryId(id);
    setCityChoice(null);
    setStarsChoice(null);
  };

  const saveNote = saveStatus === "loading"
    ? "Procurando o seu save…"
    : save
      ? `${save.name} · camisa ${save.number}`
      : "Nenhuma carreira salva neste navegador.";

  const pageStyle = { "--c1": country.primary, "--c2": country.secondary } as CSSProperties;

  return (
    <main className={styles.page} style={pageStyle}>
      <div className={styles.backdrop} aria-hidden="true" />
      <section className={styles.panel} aria-labelledby="trio-preview-title">
        <div className={styles.postcard}>
          {input && <Postcard input={input} paused={session !== null} reducedMotion={reducedMotion} />}
          <div className={styles.postcardShade} aria-hidden="true" />
          <header className={styles.header}>
            <span className={styles.kicker}>A FESTA DOS CAMPEÕES DO MUNDO</span>
            <h1 id="trio-preview-title">Trio elétrico</h1>
            <p>{city.name} · {city.avenue}</p>
          </header>
        </div>

        <div className={styles.controls}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>País</span>
            <select className={styles.select} value={countryId} onChange={(event) => pickCountry(event.target.value)}>
              {COUNTRIES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Cidade</span>
            <select className={styles.select} value={city.id} onChange={(event) => setCityChoice(event.target.value)} disabled={cities.length < 2}>
              {cities.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.avenue}</option>)}
            </select>
            <small className={styles.fieldNote}>{STYLE_LABELS[city.style] ?? city.style} · {cities.length} {cities.length === 1 ? "cidade" : "cidades"} para {country.name}</small>
          </label>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Hora</span>
            <Segmented label="Hora" value={timeOfDay} onChange={setTimeOfDay} options={TIMES} />
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Variação</span>
            <Segmented label="Variação" value={variant} onChange={setVariant} options={[{ value: 0, label: "1" }, { value: 1, label: "2" }, { value: 2, label: "3" }]} />
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Visual</span>
            <Segmented
              label="Visual"
              value={visual}
              onChange={setVisualChoice}
              options={[{ value: "3d", label: "3D", disabled: !hasWebgl }, { value: "2d", label: "2D" }]}
            />
            <small className={styles.fieldNote}>{hasWebgl ? "3D com os bonecos da partida; 2D leve para qualquer aparelho." : "Sem WebGL neste aparelho: só o 2D."}</small>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Modo desempenho</span>
            <button
              type="button"
              role="switch"
              aria-checked={performanceMode}
              className={`${styles.toggle} ${performanceMode ? styles.toggleOn : ""}`}
              onClick={() => setPerformanceChoice(!performanceMode)}
            >
              <span className={styles.toggleTrack} aria-hidden="true"><i /></span>
              {performanceMode ? "Ligado" : "Desligado"}
            </button>
            <small className={styles.fieldNote}>Menos gente, partículas e resolução, para aparelhos mais fracos.</small>
          </div>

          <div className={`${styles.field} ${styles.fieldWide}`}>
            <span className={styles.fieldLabel}>Personagem</span>
            <div className={styles.characterRow}>
              <Segmented
                label="Personagem"
                value={character}
                onChange={setCharacterChoice}
                options={[{ value: "save", label: "Do meu save", disabled: !save }, { value: "random", label: "Aleatório" }]}
              />
              <button
                type="button"
                className={styles.shuffle}
                disabled={character !== "random"}
                onClick={() => setRandomSeed(Math.floor(Math.random() * 2147483000))}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 6h3.5c3 0 4 8 7 8H17m0 0l-2.5-2.5M17 14l-2.5 2.5M3 14h3.5c1.2 0 2-1.2 2.7-2.6M11 8.6c.7-1.4 1.5-2.6 2.5-2.6H17m0 0l-2.5-2.5M17 6l-2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Sortear
              </button>
            </div>
            <small className={styles.fieldNote}>{fromSave ? saveNote : input ? `${input.player.name} · camisa ${input.player.number}` : saveNote}</small>
          </div>

          <div className={`${styles.field} ${styles.fieldWide}`}>
            <span className={styles.fieldLabel}>Estrelas</span>
            <div className={styles.starsRow}>
              <div className={styles.stepper}>
                <button type="button" aria-label="Uma estrela a menos" onClick={() => setStarsChoice(Math.max(1, stars - 1))}>−</button>
                <output aria-live="polite">{stars}</output>
                <button type="button" aria-label="Uma estrela a mais" onClick={() => setStarsChoice(Math.min(9, stars + 1))}>+</button>
              </div>
              <span className={styles.starsPreview} aria-hidden="true">{"★".repeat(stars)}</span>
            </div>
          </div>
        </div>

        <button type="button" className={styles.watch} onClick={watch} disabled={!input}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>
          Assistir à festa
        </button>
        <Link href="/" className={styles.back}>Voltar ao Futbobo</Link>
      </section>

      {session && (
        <ParadeCutscene
          key={session.key}
          input={session.input}
          mode={session.mode}
          performance={session.performance}
          onFinish={closeParade}
          onClose={closeParade}
        />
      )}
    </main>
  );
}
