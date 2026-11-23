"use client";

// Painel da rota /prototipo-apresentacao: escolhe clube, origem, visual e
// jogador e abre a mesma apresentação que a carreira abre, quantas vezes quiser.

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { CLUBS } from "../game-data";
import { DEFAULT_PLAYER_APPEARANCE, randomPlayerAppearance, teamKitPattern, type PlayerAppearance } from "../player-appearance";
import { VERIFIED_CLUB_ASSET_IDS } from "../verified-club-assets";
import { primePresentationAudio } from "../presentation/presentation-audio";
import type { SigningPresentationInput } from "../presentation/presentation-script";
import styles from "./preview.module.css";

const SigningPresentation = dynamic(() => import("../presentation/SigningPresentation"), {
  ssr: false,
  loading: () => <div className={styles.veil} />,
});

/** Clubes de amostra: cores bem diferentes, "ao" e "à", escudo branco e escudo ausente. */
const PRESETS = ["flamengo", "palmeiras", "ponte-preta", "mirassol", "real-madrid", "chapecoense"] as const;
/** Mesma semente fixa para a estampa da camisa (na carreira vem do save). */
const PREVIEW_SEED = 20260822;

export default function PresentationPreview() {
  const [clubId, setClubId] = useState<string>(PRESETS[0]);
  const [origin, setOrigin] = useState<"peneira" | "transfer">("peneira");
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const [lite, setLite] = useState(false);
  const [noBadge, setNoBadge] = useState(false);
  const [name, setName] = useState("Pedro Henrique");
  const [shortName, setShortName] = useState("P. Henrique");
  const [number, setNumber] = useState(19);
  const [appearance, setAppearance] = useState<PlayerAppearance>(DEFAULT_PLAYER_APPEARANCE);
  const [playing, setPlaying] = useState<SigningPresentationInput | null>(null);
  const [finishes, setFinishes] = useState(0);

  const clubs = useMemo(() => PRESETS.map((id) => CLUBS.find((club) => club.id === id)).filter((club) => club !== undefined), []);
  const club = clubs.find((item) => item.id === clubId) ?? clubs[0];

  const play = useCallback(() => {
    if (!club) return;
    primePresentationAudio();
    const badge = !noBadge && VERIFIED_CLUB_ASSET_IDS.has(club.id) ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/clubs/${club.id}.png` : undefined;
    setPlaying({
      player: { name: name.trim() || "Seu Jogador", shortName: shortName.trim() || name.trim(), number: Math.max(1, Math.min(99, Math.round(number) || 10)), appearance },
      club: {
        id: club.id,
        name: club.name,
        shortName: club.shortName,
        abbr: club.abbr,
        primary: club.primary,
        secondary: club.secondary,
        badge,
        city: club.city,
        kitPattern: teamKitPattern(PREVIEW_SEED, club.id),
      },
      origin,
    });
  }, [appearance, club, name, noBadge, number, origin, shortName]);

  const finish = useCallback(() => {
    setPlaying(null);
    setFinishes((count) => count + 1);
  }, []);

  return (
    <main className={styles.page}>
      <section className={styles.sheet}>
        <header className={styles.band} style={{ "--club-a": club?.primary ?? "#0057a8", "--club-b": club?.secondary ?? "#fff" } as CSSProperties}>
          <small>Laboratório</small>
          <h1>Apresentação do reforço</h1>
        </header>

        <div className={styles.body}>
          <fieldset className={styles.group}>
            <legend>Clube</legend>
            <div className={styles.chips}>
              {clubs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === clubId ? styles.chipOn : styles.chip}
                  style={{ "--a": item.primary, "--b": item.secondary } as CSSProperties}
                  onClick={() => setClubId(item.id)}
                  aria-pressed={item.id === clubId}
                >
                  <i aria-hidden="true" />
                  {item.shortName}
                </button>
              ))}
            </div>
            <label className={styles.check}>
              <input type="checkbox" checked={noBadge} onChange={(event) => setNoBadge(event.target.checked)} />
              Sem escudo (usa a sigla)
            </label>
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Como chegou</legend>
            <div className={styles.segmented}>
              <button type="button" aria-pressed={origin === "peneira"} onClick={() => setOrigin("peneira")}>Peneira</button>
              <button type="button" aria-pressed={origin === "transfer"} onClick={() => setOrigin("transfer")}>Contratação</button>
            </div>
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Visual</legend>
            <div className={styles.segmented}>
              <button type="button" aria-pressed={mode === "3d"} onClick={() => setMode("3d")}>3D</button>
              <button type="button" aria-pressed={mode === "2d"} onClick={() => setMode("2d")}>2D</button>
            </div>
            <label className={styles.check}>
              <input type="checkbox" checked={lite} onChange={(event) => setLite(event.target.checked)} disabled={mode === "2d"} />
              Modo desempenho (sem sombra, menos flashes)
            </label>
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Jogador</legend>
            <div className={styles.fields}>
              <label>Nome<input value={name} onChange={(event) => setName(event.target.value)} maxLength={28} /></label>
              <label>Nas costas<input value={shortName} onChange={(event) => setShortName(event.target.value)} maxLength={16} /></label>
              <label>Camisa<input type="number" min={1} max={99} value={number} onChange={(event) => setNumber(Number(event.target.value))} /></label>
            </div>
            <button type="button" className={styles.ghost} onClick={() => setAppearance(randomPlayerAppearance())}>Sortear visual</button>
          </fieldset>
        </div>

        <footer className={styles.actions}>
          <button type="button" className={styles.watch} onClick={play}>Assistir</button>
          {finishes > 0 && <span className={styles.note}>onFinish chamado {finishes}×</span>}
        </footer>
      </section>

      {playing && <SigningPresentation input={playing} mode={mode} performance={lite} onFinish={finish} />}
    </main>
  );
}
