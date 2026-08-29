"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { PlayerAppearancePortrait as Portrait } from "../../PlayerAppearanceEditor";
import { DEFAULT_PLAYER_APPEARANCE, normalizePlayerAppearance, randomPlayerAppearance, type PlayerAppearance } from "../../player-appearance";
import type { GameState } from "../../career/model";
import { SAVE_KEY } from "../../career/state";
import { clubById } from "../../career/shared";
import styles from "./CinematicEventPrototype.module.css";

type Scene = "interview" | "golden-boot" | "finalists" | "presenter" | "winner";
type Outfit = "kit" | "suit";
type SuitVariant = 0 | 1 | 2;

type PrototypePlayer = Pick<GameState, "name" | "number" | "playerAppearance" | "currentClubId" | "academyClubId" | "seed" | "season">;

const FALLBACK_PLAYER: PrototypePlayer = {
  name: "Seu Jogador",
  number: 10,
  playerAppearance: DEFAULT_PLAYER_APPEARANCE,
  currentClubId: "",
  academyClubId: "",
  seed: 20260822,
  season: 2030,
};

const INTERVIEW_ANSWERS = [
  { label: "A equipe fez o trabalho", tone: "CALMO", reaction: "Respira, olha para o repórter e responde sem pressa." },
  { label: "Eu sabia que ia decidir", tone: "CONFIANTE", reaction: "Inclina o corpo para a frente e encara a câmera por um instante." },
  { label: "Prefiro falar no próximo jogo", tone: "FRIO", reaction: "Silêncio curto, dois flashes e o olhar sai do repórter para o túnel." },
] as const;

const FINALIST_NAMES = ["Mateo Rivas", "Noah Bennett", "Luka Vasic", "Yanis Morel"];
const FINALIST_COLORS = [
  ["#d11f2f", "#111827"],
  ["#2563eb", "#f8fafc"],
  ["#111827", "#f59e0b"],
  ["#7c3aed", "#f5f3ff"],
] as const;

const SUITS: Array<{ jacket: string; pants: string; shirt: string; tie: string }> = [
  { jacket: "#17191e", pants: "#111318", shirt: "#f3f0e9", tie: "#23262d" },
  { jacket: "#152338", pants: "#111b2a", shirt: "#f5f0df", tie: "#b79a4b" },
  { jacket: "#202025", pants: "#16161a", shirt: "#dce7ee", tie: "#6d2130" },
];

function readPlayerFromSave(): PrototypePlayer {
  if (typeof window === "undefined") return FALLBACK_PLAYER;
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return FALLBACK_PLAYER;
    const parsed = JSON.parse(raw) as Partial<GameState>;
    return {
      name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name : FALLBACK_PLAYER.name,
      number: typeof parsed.number === "number" ? parsed.number : FALLBACK_PLAYER.number,
      playerAppearance: normalizePlayerAppearance(parsed.playerAppearance),
      currentClubId: typeof parsed.currentClubId === "string" ? parsed.currentClubId : "",
      academyClubId: typeof parsed.academyClubId === "string" ? parsed.academyClubId : "",
      seed: typeof parsed.seed === "number" ? parsed.seed : FALLBACK_PLAYER.seed,
      season: typeof parsed.season === "number" ? parsed.season : FALLBACK_PLAYER.season,
    };
  } catch {
    return FALLBACK_PLAYER;
  }
}

function SceneRail({ scene, onScene }: { scene: Scene; onScene: (scene: Scene) => void }) {
  const scenes: Array<[Scene, string]> = [
    ["interview", "Entrevista"],
    ["golden-boot", "Chuteira"],
    ["finalists", "Finalistas"],
    ["presenter", "Palco"],
    ["winner", "Vencedor"],
  ];
  return (
    <div className={styles.sceneRail}>
      {scenes.map(([id, label], index) => (
        <button className={scene === id ? styles.activeScene : ""} key={id} onClick={() => onScene(id)} type="button">
          <b>{String(index + 1).padStart(2, "0")}</b><span>{label}</span>
        </button>
      ))}
    </div>
  );
}

function FullBodyPlayer({
  appearance,
  primary,
  secondary,
  name,
  number = 10,
  outfit,
  suitVariant = 0,
  scale = 1,
  holdingTrophy = false,
  presenter = false,
}: {
  appearance: PlayerAppearance;
  primary: string;
  secondary: string;
  name: string;
  number?: number;
  outfit: Outfit;
  suitVariant?: SuitVariant;
  scale?: number;
  holdingTrophy?: boolean;
  presenter?: boolean;
}) {
  const suit = SUITS[suitVariant];
  const fullAppearance = presenter ? { ...appearance, hairStyle: 12, beard: 0, face: 1 } : appearance;
  const vars = {
    "--avatar-scale": scale,
    "--kit-primary": primary,
    "--kit-secondary": secondary,
    "--suit-jacket": suit.jacket,
    "--suit-pants": suit.pants,
    "--suit-shirt": suit.shirt,
    "--suit-tie": suit.tie,
  } as CSSProperties;

  return (
    <div className={`${styles.fullBodyWrap} ${styles[outfit]} ${holdingTrophy ? styles.holdingTrophy : ""}`} style={vars}>
      <div className={styles.avatarShadow} />
      <div className={styles.avatarBody}>
        <div className={styles.headCrop}>
          <Portrait appearance={fullAppearance} primary={outfit === "kit" ? primary : suit.shirt} secondary={outfit === "kit" ? secondary : suit.jacket} size={160} label={name} />
        </div>
        <div className={styles.neck} />
        <div className={styles.torso}>
          {outfit === "kit" ? <b className={styles.shirtNumber}>{number}</b> : <><i className={styles.lapelLeft} /><i className={styles.lapelRight} /><i className={styles.tie} /></>}
        </div>
        <div className={`${styles.arm} ${styles.armLeft}`}><i /></div>
        <div className={`${styles.arm} ${styles.armRight}`}><i /></div>
        <div className={`${styles.leg} ${styles.legLeft}`}><i /></div>
        <div className={`${styles.leg} ${styles.legRight}`}><i /></div>
        {holdingTrophy && (
          <div className={styles.heldBallon} aria-label="Bola de Ouro nas mãos">
            <span>◉</span><i /><b>BALLON D&apos;OR</b>
          </div>
        )}
      </div>
      <span className={styles.avatarName}>{name}</span>
    </div>
  );
}

export default function CinematicEventPrototype() {
  const [player, setPlayer] = useState<PrototypePlayer>(FALLBACK_PLAYER);
  const [scene, setScene] = useState<Scene>("interview");
  const [interviewAnswer, setInterviewAnswer] = useState<number | null>(null);
  const [goldenBootEnabled, setGoldenBootEnabled] = useState(true);
  const [nameRevealed, setNameRevealed] = useState(false);
  const [autoplay, setAutoplay] = useState(false);

  useEffect(() => {
    queueMicrotask(() => setPlayer(readPlayerFromSave()));
  }, []);

  const transitionTo = useCallback((nextScene: Scene) => {
    setScene(nextScene);
    if (nextScene !== "presenter") setNameRevealed(false);
  }, []);

  useEffect(() => {
    if (!autoplay) return;
    const order: Scene[] = goldenBootEnabled
      ? ["interview", "golden-boot", "finalists", "presenter", "winner"]
      : ["interview", "finalists", "presenter", "winner"];
    const index = order.indexOf(scene);
    const delay = scene === "presenter" ? 4200 : scene === "interview" ? 5200 : 3600;
    const timer = window.setTimeout(() => {
      if (scene === "presenter" && !nameRevealed) return setNameRevealed(true);
      if (index >= 0 && index < order.length - 1) transitionTo(order[index + 1]);
      else setAutoplay(false);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [autoplay, goldenBootEnabled, nameRevealed, scene, transitionTo]);

  const club = clubById(player.currentClubId || player.academyClubId);
  const appearance = normalizePlayerAppearance(player.playerAppearance);
  const finalistAppearances = useMemo(
    () => FINALIST_NAMES.map((_, index) => randomPlayerAppearance(player.seed + 911 * (index + 1))),
    [player.seed],
  );
  const presenterAppearance = useMemo(() => ({ ...randomPlayerAppearance(player.seed + 7721), hairStyle: 12, beard: 0, face: 1 }), [player.seed]);
  const seasonLabel = Math.max(2026, player.season);

  const goNext = () => {
    if (scene === "interview") return transitionTo(goldenBootEnabled ? "golden-boot" : "finalists");
    if (scene === "golden-boot") return transitionTo("finalists");
    if (scene === "finalists") return transitionTo("presenter");
    if (scene === "presenter") {
      if (!nameRevealed) return setNameRevealed(true);
      return transitionTo("winner");
    }
    transitionTo("interview");
  };

  return (
    <main className={styles.prototypeShell} style={{ "--club-primary": club.primary, "--club-secondary": club.secondary } as CSSProperties}>
      <header className={styles.labHeader}>
        <div>
          <small>FUTBOBO CINEMATIC LAB · FULL BODY PASS</small>
          <h1>O jogador agora existe fora do botão.</h1>
          <p>Segundo passe do protótipo: corpo inteiro, roupa contextual, elenco em cena e o mesmo modelo-base sendo usado também pelo apresentador.</p>
        </div>
        <div className={styles.labControls}>
          <label><input checked={goldenBootEnabled} onChange={(event) => setGoldenBootEnabled(event.target.checked)} type="checkbox" /><span>Chuteira antes da Bola de Ouro</span></label>
          <button className={autoplay ? styles.autoplayOn : ""} onClick={() => setAutoplay((value) => !value)} type="button">{autoplay ? "■ Parar sequência" : "▶ Rodar sequência"}</button>
        </div>
      </header>

      <SceneRail scene={scene} onScene={transitionTo} />

      <section className={styles.viewport}>
        {scene === "interview" && (
          <div className={`${styles.scene} ${styles.interviewScene}`}>
            <div className={styles.stadiumBackdrop}><div className={styles.stadiumLights} /><div className={styles.stands} /><div className={styles.pitchGlow} /></div>
            <div className={styles.cameraFlashOne} /><div className={styles.cameraFlashTwo} />
            <aside className={styles.interviewVisual}>
              <div className={styles.broadcastBug}>AO VIVO · PÓS-JOGO</div>
              <FullBodyPlayer appearance={appearance} primary={club.primary} secondary={club.secondary} name={player.name} number={player.number} outfit="kit" scale={1.08} />
              <div className={styles.micCluster}><i /><i /><i /></div>
              <div className={styles.lowerThird}><b>{player.name}</b><span>#{player.number} · {club.shortName}</span></div>
            </aside>
            <div className={styles.interviewPanel}>
              <div className={styles.questionMeta}><span>ZONA MISTA</span><b>1 / 3</b></div>
              <h2>Você chamou a responsabilidade no fim. O que passou pela sua cabeça?</h2>
              <div className={styles.answerGrid}>
                {INTERVIEW_ANSWERS.map((answer, index) => (
                  <button className={interviewAnswer === index ? styles.answerSelected : ""} key={answer.label} onClick={() => setInterviewAnswer(index)} type="button">
                    <small>{answer.tone}</small><strong>{answer.label}</strong>
                  </button>
                ))}
              </div>
              <div className={styles.reactionStrip}><span>ANIMAÇÃO</span><p>{interviewAnswer === null ? "O corpo inteiro fica vivo: respiração, troca de apoio, mãos e cabeça em movimento leve." : INTERVIEW_ANSWERS[interviewAnswer].reaction}</p></div>
            </div>
          </div>
        )}

        {scene === "golden-boot" && (
          <div className={`${styles.scene} ${styles.bootScene}`}>
            <div className={styles.awardCurtain} /><div className={styles.awardSpotlight} />
            <div className={styles.bootTrophy} aria-hidden="true"><span>✦</span><div className={styles.bootShape}>◢</div><b>GOLDEN BOOT</b></div>
            <div className={styles.bootPlayer}>
              <FullBodyPlayer appearance={{ ...appearance, face: 2 }} primary={club.primary} secondary={club.secondary} name={player.name} outfit="suit" suitVariant={1} scale={1.02} />
              <div><small>PRIMEIRO PRÊMIO DA NOITE</small><h2>Chuteira de Ouro</h2><p>Ele recebe o prêmio já vestido para a gala. Foto rápida, aperto de mão e corte direto para a categoria principal.</p></div>
            </div>
          </div>
        )}

        {scene === "finalists" && (
          <div className={`${styles.scene} ${styles.finalistsScene}`}>
            <div className={styles.galaBackdrop} />
            <div className={styles.galaTitle}><small>BALLON D&apos;OR · {seasonLabel}</small><h2>Os cinco finalistas</h2><p>Todos de corpo inteiro e de terno; três variações leves mantêm a gala coerente sem virar uniforme.</p></div>
            <div className={styles.finalistLineup}>
              {FINALIST_NAMES.slice(0, 2).map((name, index) => (
                <article key={name}><FullBodyPlayer appearance={finalistAppearances[index]} primary={FINALIST_COLORS[index][0]} secondary={FINALIST_COLORS[index][1]} name={name} outfit="suit" suitVariant={(index % 3) as SuitVariant} scale={0.78} /><b>0{index + 1}</b></article>
              ))}
              <article className={styles.userFinalist}><FullBodyPlayer appearance={appearance} primary={club.primary} secondary={club.secondary} name={player.name} outfit="suit" suitVariant={2} scale={0.96} /><b>VOCÊ</b></article>
              {FINALIST_NAMES.slice(2).map((name, offset) => {
                const index = offset + 2;
                return <article key={name}><FullBodyPlayer appearance={finalistAppearances[index]} primary={FINALIST_COLORS[index][0]} secondary={FINALIST_COLORS[index][1]} name={name} outfit="suit" suitVariant={(index % 3) as SuitVariant} scale={0.78} /><b>0{index + 2}</b></article>;
              })}
            </div>
            <div className={styles.cameraMove}><span /></div>
          </div>
        )}

        {scene === "presenter" && (
          <div className={`${styles.scene} ${styles.presenterScene} ${nameRevealed ? styles.presenterRevealed : ""}`}>
            <div className={styles.stageScreen}><small>BALLON D&apos;OR · {seasonLabel}</small><strong>{nameRevealed ? player.name : "AND THE WINNER IS..."}</strong><span>{nameRevealed ? "MELHOR JOGADOR DO MUNDO" : ""}</span></div>
            <div className={styles.presenterModel}>
              <FullBodyPlayer appearance={presenterAppearance} primary="#232323" secondary="#e8e3d7" name="APRESENTADOR" outfit="suit" suitVariant={0} scale={0.96} presenter />
              <div className={styles.podium}><span>◉</span><b>BALLON D&apos;OR</b></div>
            </div>
            <div className={styles.presenterCaption}><small>{nameRevealed ? "TELÃO ACENDE" : "ENVELOPE ABERTO"}</small><p>{nameRevealed ? "O nome toma o telão; o apresentador olha para o lado do palco e espera a entrada do vencedor." : "Agora o careca também é um personagem do mesmo sistema, só com aparência, terno e pose próprios."}</p></div>
          </div>
        )}

        {scene === "winner" && (
          <div className={`${styles.scene} ${styles.winnerScene}`}>
            <div className={styles.confettiField} aria-hidden="true">{Array.from({ length: 28 }).map((_, index) => <i key={index} style={{ "--i": index } as CSSProperties} />)}</div>
            <div className={styles.winnerScreen}>{player.name}</div>
            <div className={styles.winnerStageCast}>
              <div className={styles.winnerPresenter}><FullBodyPlayer appearance={presenterAppearance} primary="#232323" secondary="#e8e3d7" name="APRESENTADOR" outfit="suit" suitVariant={0} scale={0.88} presenter /></div>
              <div className={styles.winnerPlayer}><FullBodyPlayer appearance={{ ...appearance, face: 2 }} primary={club.primary} secondary={club.secondary} name={player.name} outfit="suit" suitVariant={2} scale={1.08} holdingTrophy /></div>
            </div>
            <div className={styles.winnerCopy}><small>FOTO OFICIAL</small><h2>Vencedor e apresentador no mesmo palco.</h2><p>O troféu está literalmente nas mãos do personagem. A cena agora pode evoluir para caminhada, aperto de mão, entrega e pose para foto sem trocar de linguagem visual.</p></div>
          </div>
        )}
      </section>

      <footer className={styles.prototypeFooter}>
        <div><span>{club.shortName}</span><b>{player.name}</b><small>save local {player.name === FALLBACK_PLAYER.name ? "não encontrado — usando personagem de demonstração" : "carregado"}</small></div>
        <button onClick={goNext} type="button">Próximo corte <span>→</span></button>
      </footer>
    </main>
  );
}
