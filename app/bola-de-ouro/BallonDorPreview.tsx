"use client";

// Painel da rota /bola-de-ouro: escolhe resultado, visual e personagem e abre a
// mesma cerimônia da carreira, quantas vezes quiser.
//
// A rota roda fora do shell do jogo, onde a ponte do IndexedDB não está
// instalada: o save é lido direto (só leitura) e, sem save, vale um jogador
// sorteado.

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CLUBS } from "../game-data";
import { normalizePlayerAppearance, randomPlayerAppearance, type PlayerAppearance } from "../player-appearance";
import { readBotao3dPerformance, readBotao3dPreference, webglAvailable } from "../botao/view-mode";
import { buildBallonDorCeremony, type CeremonyInput, type CeremonyPlace } from "../ceremony/ballon-dor-script";
import { BustCanvas } from "../ceremony/BallonDorCeremony2D";
import { primeCeremonyAudio } from "../ceremony/ceremony-audio";
import styles from "./BallonDorPreview.module.css";

const BallonDorCeremony = dynamic(() => import("../ceremony/BallonDorCeremony"), {
  ssr: false,
  loading: () => <div className={styles.veil} />,
});

type ResultChoice = "win" | "second" | "third";
type VisualChoice = "3d" | "2d";
type CharacterChoice = "save" | "random";

type SavedPlayer = {
  name: string;
  appearance: PlayerAppearance;
  number: number;
  clubId: string;
  nationality?: string;
  seed: number;
  season: number;
  rivals: Array<{ name: string; currentClubId?: string; nationality?: string }>;
  /** Finalistas da Bola de Ouro mais recente do save, quando houve uma. */
  finalists: string[] | null;
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

type RawNomination = { award?: unknown; finalists?: unknown };

function ballonFinalists(nominations: unknown): string[] | null {
  if (!Array.isArray(nominations)) return null;
  const nomination = (nominations as RawNomination[]).find((item) => item?.award === "Bola de Ouro");
  if (!nomination || !Array.isArray(nomination.finalists)) return null;
  const names = nomination.finalists.filter((name): name is string => typeof name === "string" && name.length > 0);
  return names.length === 3 ? names : null;
}

function parseSave(raw: string): SavedPlayer | null {
  try {
    const save = JSON.parse(raw) as Record<string, unknown>;
    const name = typeof save.name === "string" ? save.name.trim() : "";
    const clubId = typeof save.currentClubId === "string" ? save.currentClubId : "";
    if (!name || !clubId) return null;
    const rivals = (Array.isArray(save.rivals) ? save.rivals : [])
      .filter((rival): rival is Record<string, unknown> => Boolean(rival) && typeof rival === "object" && typeof (rival as { name?: unknown }).name === "string")
      .filter((rival) => rival.active !== false)
      .sort((a, b) => (Number(b.overall) || 0) - (Number(a.overall) || 0))
      .map((rival) => ({
        name: String(rival.name),
        currentClubId: typeof rival.currentClubId === "string" ? rival.currentClubId : undefined,
        nationality: typeof rival.nationality === "string" ? rival.nationality : undefined,
      }));
    const lastResult = save.lastResult && typeof save.lastResult === "object" ? (save.lastResult as Record<string, unknown>) : null;
    const history = Array.isArray(save.history) ? (save.history as Array<Record<string, unknown>>) : [];
    // A Bola de Ouro mais recente: a da temporada que acabou ou a última do histórico.
    let finalists = ballonFinalists(lastResult?.awardNominations);
    for (let index = history.length - 1; !finalists && index >= 0; index -= 1) finalists = ballonFinalists(history[index]?.awardNominations);
    const currentSeason = Number(save.season) || 2026;
    const lastSeason = Number(lastResult?.season) || currentSeason;
    return {
      name,
      appearance: normalizePlayerAppearance(save.playerAppearance as Partial<PlayerAppearance> | undefined),
      number: Number(save.number) || 10,
      clubId,
      nationality: typeof save.nationality === "string" ? save.nationality : undefined,
      seed: Number(save.seed) || 1,
      season: Math.max(1990, Math.min(2100, Math.round(lastSeason))),
      rivals,
      finalists: finalists && finalists.includes(name) ? finalists : null,
    };
  } catch {
    return null;
  }
}

const RANDOM_NAMES = ["Rafael Nunes", "Caio Ribeiro", "Davi Monteiro", "Lucas Amaral", "Thiago Prates", "João Vitor Lima", "Matheus Areias", "Enzo Carvalho", "Gabriel Sato", "Pedro Albuquerque"];
const ELITE_CLUBS = CLUBS.filter((club) => club.reputation >= 5);

// WebGL e preferências só existem no navegador: o servidor desenha o 2D e o hidrato corrige.
const noopSubscribe = () => () => undefined;
let webglCache: boolean | null = null;
const readWebgl = () => (webglCache ??= webglAvailable());
const read3dPreference = () => readBotao3dPreference();
const readPerformance = () => readBotao3dPerformance().enabled;
const serverFalse = () => false;

function Segmented<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T | null;
  options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
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

export default function BallonDorPreview() {
  const hasWebgl = useSyncExternalStore(noopSubscribe, readWebgl, serverFalse);
  const prefers3d = useSyncExternalStore(noopSubscribe, read3dPreference, serverFalse);
  const prefersPerformance = useSyncExternalStore(noopSubscribe, readPerformance, serverFalse);

  const [result, setResult] = useState<ResultChoice>("win");
  const [visualChoice, setVisualChoice] = useState<VisualChoice | null>(null);
  const [performanceChoice, setPerformanceChoice] = useState<boolean | null>(null);
  const [characterChoice, setCharacterChoice] = useState<CharacterChoice | null>(null);
  const [seasonChoice, setSeasonChoice] = useState<number | null>(null);
  const [randomSeed, setRandomSeed] = useState(20260);
  const [save, setSave] = useState<SavedPlayer | null>(null);
  const [saveStatus, setSaveStatus] = useState<"loading" | "ready">("loading");
  const [session, setSession] = useState<{ key: number; input: CeremonyInput; mode: VisualChoice; performance: boolean } | null>(null);

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

  const visual: VisualChoice = hasWebgl ? visualChoice ?? (prefers3d ? "3d" : "2d") : "2d";
  const performanceMode = performanceChoice ?? prefersPerformance;
  const character: CharacterChoice | null = characterChoice ?? (saveStatus === "loading" ? null : save ? "save" : "random");
  const fromSave = character === "save" && save !== null;
  const season = seasonChoice ?? (save?.season ?? 2026);

  const randomAppearance = useMemo(() => randomPlayerAppearance(randomSeed), [randomSeed]);

  const input = useMemo<CeremonyInput | null>(() => {
    if (!character) return null;
    const place: CeremonyPlace = result === "win" ? 1 : result === "second" ? 2 : 3;
    if (fromSave && save) {
      const finalists = save.finalists ?? [save.name, ...save.rivals.slice(0, 2).map((rival) => rival.name)];
      const rivalNames = finalists.filter((name) => name !== save.name);
      return buildBallonDorCeremony({
        seed: save.seed,
        season,
        player: { name: save.name, appearance: save.appearance, number: save.number, clubId: save.clubId, nationality: save.nationality },
        finalists,
        won: place === 1,
        winner: rivalNames[0] ?? "",
        rivals: save.rivals,
        userPlace: place,
      });
    }
    const name = RANDOM_NAMES[randomSeed % RANDOM_NAMES.length];
    const club = ELITE_CLUBS.length ? ELITE_CLUBS[randomSeed % ELITE_CLUBS.length] : CLUBS[0];
    return buildBallonDorCeremony({
      seed: randomSeed,
      season,
      player: { name, appearance: randomAppearance, number: [7, 9, 10, 11][randomSeed % 4], clubId: club.id },
      finalists: [name],
      won: place === 1,
      winner: "",
      userPlace: place,
    });
  }, [character, fromSave, save, season, result, randomSeed, randomAppearance]);

  const watch = useCallback(() => {
    if (!input) return;
    // O clique é o gesto que libera o som; a cerimônia ainda vai baixar.
    primeCeremonyAudio();
    setSession((current) => ({ key: (current?.key ?? 0) + 1, input, mode: visual, performance: performanceMode }));
  }, [input, visual, performanceMode]);

  const closeCeremony = useCallback(() => setSession(null), []);

  const saveNote = saveStatus === "loading"
    ? "Procurando o seu save…"
    : save
      ? `${save.name} · camisa ${save.number}`
      : "Nenhuma carreira salva neste navegador.";

  return (
    <main className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true" />
      <section className={styles.panel} aria-labelledby="bdo-preview-title">
        <header className={styles.header}>
          <span className={styles.kicker}>LABORATÓRIO DA GALA</span>
          <h1 id="bdo-preview-title">Bola de Ouro</h1>
          <p>Monte a noite do jeito que quiser e assista à cerimônia do top 3 quantas vezes precisar.</p>
        </header>

        <div className={styles.lineup} aria-label="Finalistas">
          {[0, 1, 2].map((slot) => {
            const finalist = input?.finalists[slot];
            return (
              <div key={slot} className={`${styles.finalist} ${finalist?.isUser ? styles.finalistYou : ""}`}>
                <span className={styles.finalistMedal}>
                  {finalist && (
                    <BustCanvas
                      className={styles.finalistBust}
                      appearance={finalist.appearance}
                      primary={finalist.club.primary}
                      secondary={finalist.club.secondary}
                      size={88}
                      fluid
                      label={finalist.name}
                    />
                  )}
                </span>
                <strong>{finalist?.name ?? " "}</strong>
                <small>{finalist ? (finalist.isUser ? "VOCÊ" : finalist.club.shortName) : " "}</small>
              </div>
            );
          })}
        </div>

        <div className={styles.controls}>
          <div className={styles.field}>
            <span className={styles.fieldLabel}>Resultado</span>
            <Segmented
              label="Resultado"
              value={result}
              onChange={setResult}
              options={[{ value: "win", label: "Vencer" }, { value: "second", label: "2º lugar" }, { value: "third", label: "3º lugar" }]}
            />
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Visual</span>
            <Segmented
              label="Visual"
              value={visual}
              onChange={setVisualChoice}
              options={[{ value: "3d", label: "3D", disabled: !hasWebgl }, { value: "2d", label: "2D" }]}
            />
            <small className={styles.fieldNote}>{hasWebgl ? "Palco 3D com os bonecos da partida." : "Sem WebGL neste aparelho: só o 2D."}</small>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Modo desempenho</span>
            <button
              type="button"
              role="switch"
              aria-checked={performanceMode}
              disabled={visual !== "3d"}
              className={`${styles.toggle} ${performanceMode ? styles.toggleOn : ""}`}
              onClick={() => setPerformanceChoice(!performanceMode)}
            >
              <span className={styles.toggleTrack} aria-hidden="true"><i /></span>
              {performanceMode ? "Ligado" : "Desligado"}
            </button>
            <small className={styles.fieldNote}>Menos sombra e resolução no 3D, para aparelhos mais fracos.</small>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>Temporada</span>
            <div className={styles.stepper}>
              <button type="button" aria-label="Temporada anterior" onClick={() => setSeasonChoice(Math.max(1990, season - 1))}>−</button>
              <output aria-live="polite">{season}</output>
              <button type="button" aria-label="Próxima temporada" onClick={() => setSeasonChoice(Math.min(2100, season + 1))}>+</button>
            </div>
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
            <small className={styles.fieldNote}>{saveNote}</small>
          </div>
        </div>

        <button type="button" className={styles.watch} onClick={watch} disabled={!input}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4l10 6-10 6z" fill="currentColor" /></svg>
          Assistir
        </button>
        <Link href="/" className={styles.back}>Voltar ao Futbobo</Link>
      </section>

      {session && (
        <BallonDorCeremony
          key={session.key}
          input={session.input}
          mode={session.mode}
          performance={session.performance}
          onFinish={closeCeremony}
          onClose={closeCeremony}
        />
      )}
    </main>
  );
}
