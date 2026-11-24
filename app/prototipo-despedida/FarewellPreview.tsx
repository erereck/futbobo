"use client";

// Painel da rota /prototipo-despedida: escolhe clube, visual e jogador e abre a
// mesma despedida que a carreira abre quando a lenda sai do clube.

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { CLUBS } from "../game-data";
import { DEFAULT_PLAYER_APPEARANCE, careerSquadAppearance, randomPlayerAppearance, teamKitPattern, type PlayerAppearance } from "../player-appearance";
import { VERIFIED_CLUB_ASSET_IDS } from "../verified-club-assets";
import { primeFarewellAudio } from "../farewell/farewell-audio";
import type { FarewellInput } from "../farewell/farewell-script";
import styles from "../prototipo-apresentacao/preview.module.css";

const FarewellCutscene = dynamic(() => import("../farewell/FarewellCutscene"), {
  ssr: false,
  loading: () => <div className={styles.veil} />,
});

const PRESETS = ["flamengo", "palmeiras", "corinthians", "real-madrid", "liverpool", "boca-juniors"] as const;
const PREVIEW_SEED = 20261124;

export default function FarewellPreview() {
  const [clubId, setClubId] = useState<string>(PRESETS[0]);
  const [kind, setKind] = useState<FarewellInput["kind"]>("transfer");
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const [lite, setLite] = useState(false);
  const [name, setName] = useState("Rafael Moura");
  const [number, setNumber] = useState(10);
  const [appearance, setAppearance] = useState<PlayerAppearance>(DEFAULT_PLAYER_APPEARANCE);
  const [playing, setPlaying] = useState<FarewellInput | null>(null);
  const [finishes, setFinishes] = useState(0);

  const clubs = useMemo(() => PRESETS.map((id) => CLUBS.find((club) => club.id === id)).filter((club) => club !== undefined), []);
  const club = clubs.find((item) => item.id === clubId) ?? clubs[0];

  const play = useCallback(() => {
    if (!club) return;
    primeFarewellAudio();
    const info = (source: (typeof CLUBS)[number]) => ({
      id: source.id,
      name: source.name,
      shortName: source.shortName,
      abbr: source.abbr,
      primary: source.primary,
      secondary: source.secondary,
      badge: VERIFIED_CLUB_ASSET_IDS.has(source.id) ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/clubs/${source.id}.png` : undefined,
      city: source.city,
      kitPattern: teamKitPattern(PREVIEW_SEED, source.id),
    });
    const destination = CLUBS.find((item) => item.id === "inter-miami") ?? CLUBS.find((item) => item.id !== club.id);
    const trimmed = name.trim() || "Seu Jogador";
    setPlaying({
      player: { name: trimmed, shortName: trimmed.split(/\s+/).at(-1) ?? trimmed, number: Math.max(1, Math.min(99, Math.round(number) || 10)), appearance },
      club: info(club),
      destination: kind === "transfer" && destination ? info(destination) : null,
      stats: { seasons: 9, from: 2027, to: 2035, appearances: 412, goals: 198, assists: 97, cleanSheets: 0, titles: 7, titleLines: ["3× Brasileirão", "2× Libertadores", "Copa do Brasil", "Mundial de Clubes"], keeper: false, captain: true },
      teammates: Array.from({ length: 10 }, (_, index) => ({
        appearance: careerSquadAppearance({ seed: PREVIEW_SEED, memberId: `preview-${index}`, teamId: club.id, nationality: club.countryId }),
        number: [1, 4, 5, 7, 8, 9, 11, 14, 17, 21][index],
      })),
      kind,
    });
  }, [appearance, club, kind, name, number]);

  const finish = useCallback(() => {
    setPlaying(null);
    setFinishes((count) => count + 1);
  }, []);

  return (
    <main className={styles.page}>
      <section className={styles.sheet}>
        <header className={styles.band} style={{ "--club-a": club?.primary ?? "#0057a8", "--club-b": club?.secondary ?? "#fff" } as CSSProperties}>
          <small>Laboratório</small>
          <h1>Despedida da lenda</h1>
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
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Saída</legend>
            <div className={styles.segmented}>
              <button type="button" aria-pressed={kind === "transfer"} onClick={() => setKind("transfer")}>Transferência</button>
              <button type="button" aria-pressed={kind === "retirement"} onClick={() => setKind("retirement")}>Aposentadoria</button>
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
              Modo desempenho (sem sombra, sem torcida de bonecos)
            </label>
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Jogador</legend>
            <div className={styles.fields}>
              <label>Nome<input value={name} onChange={(event) => setName(event.target.value)} maxLength={28} /></label>
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

      {playing && <FarewellCutscene input={playing} mode={mode} performance={lite} onFinish={finish} />}
    </main>
  );
}
