"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import PlayerAppearancePortrait from "../../PlayerAppearanceEditor";
import { PlayerAppearancePortrait as Portrait } from "../../PlayerAppearanceEditor";
import { DEFAULT_PLAYER_APPEARANCE, normalizePlayerAppearance, randomPlayerAppearance, type PlayerAppearance } from "../../player-appearance";
import type { GameState } from "../../career/model";
import { SAVE_KEY } from "../../career/state";
import { clubById } from "../../career/shared";
import styles from "./CinematicEventPrototype.module.css";

type Scene = "interview" | "golden-boot" | "finalists" | "presenter" | "winner";

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
  { label: "A equipe fez o trabalho", tone: "CALMO", reaction: "Boa. O jogador respira, olha pro repórter e responde sem pressa." },
  { label: "Eu sabia que ia decidir", tone: "CONFIANTE", reaction: "O personagem inclina o corpo pra frente e a câmera aproxima um pouco." },
  { label: "Prefiro falar no próximo jogo", tone: "FRIO", reaction: "Silêncio de um segundo, flash das câmeras e corte rápido para a próxima pergunta." },
] as const;

const FINALIST_NAMES = ["Mateo Rivas", "Noah Bennett", "Luka Vasic", "Yanis Morel"];
const FINALIST_COLORS = [
  ["#d11f2f", "#111827"],
  ["#2563eb", "#f8fafc"],
  ["#111827", "#f59e0b"],
  ["#7c3aed", "#f5f3ff"],
] as const;

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
          <b>{String(index + 1).padStart(2, "0")}</b>
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}

function PlayerStage({
  appearance,
  primary,
  secondary,
  name,
  compact = false,
}: {
  appearance: PlayerAppearance;
  primary: string;
  secondary: string;
  name: string;
  compact?: boolean;
}) {
  return (
    <div className={`${styles.playerStage} ${compact ? styles.playerStageCompact : ""}`}>
      <div className={styles.playerGlow} />
      <Portrait appearance={appearance} primary={primary} secondary={secondary} size={compact ? 150 : 260} label={name} />
      <span>{name}</span>
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
    setPlayer(readPlayerFromSave());
  }, []);

  useEffect(() => {
    if (!autoplay) return;
    const order: Scene[] = goldenBootEnabled
      ? ["interview", "golden-boot", "finalists", "presenter", "winner"]
      : ["interview", "finalists", "presenter", "winner"];
    const index = order.indexOf(scene);
    const delay = scene === "presenter" ? 4200 : scene === "interview" ? 5200 : 3400;
    const timer = window.setTimeout(() => {
      if (scene === "presenter" && !nameRevealed) {
        setNameRevealed(true);
        return;
      }
      if (index >= 0 && index < order.length - 1) setScene(order[index + 1]);
      else setAutoplay(false);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [autoplay, goldenBootEnabled, nameRevealed, scene]);

  useEffect(() => {
    if (scene !== "presenter") setNameRevealed(false);
  }, [scene]);

  const club = clubById(player.currentClubId || player.academyClubId);
  const appearance = normalizePlayerAppearance(player.playerAppearance);
  const finalistAppearances = useMemo(
    () => FINALIST_NAMES.map((_, index) => randomPlayerAppearance(player.seed + 911 * (index + 1))),
    [player.seed],
  );
  const seasonLabel = Math.max(2026, player.season);

  const goNext = () => {
    if (scene === "interview") return setScene(goldenBootEnabled ? "golden-boot" : "finalists");
    if (scene === "golden-boot") return setScene("finalists");
    if (scene === "finalists") return setScene("presenter");
    if (scene === "presenter") {
      if (!nameRevealed) return setNameRevealed(true);
      return setScene("winner");
    }
    setScene("interview");
  };

  return (
    <main className={styles.prototypeShell} style={{ "--club-primary": club.primary, "--club-secondary": club.secondary } as CSSProperties}>
      <header className={styles.labHeader}>
        <div>
          <small>FUTBOBO CINEMATIC LAB</small>
          <h1>Eventos com o jogador em cena</h1>
          <p>Protótipo isolado: lê o save local quando existe, não altera a carreira e serve só para testar linguagem visual, cortes e ordem das cerimônias.</p>
        </div>
        <div className={styles.labControls}>
          <label>
            <input checked={goldenBootEnabled} onChange={(event) => setGoldenBootEnabled(event.target.checked)} type="checkbox" />
            <span>Chuteira antes da Bola de Ouro</span>
          </label>
          <button className={autoplay ? styles.autoplayOn : ""} onClick={() => setAutoplay((value) => !value)} type="button">
            {autoplay ? "■ Parar sequência" : "▶ Rodar sequência"}
          </button>
        </div>
      </header>

      <SceneRail scene={scene} onScene={setScene} />

      <section className={styles.viewport}>
        {scene === "interview" && (
          <div className={`${styles.scene} ${styles.interviewScene}`}>
            <div className={styles.stadiumBackdrop}>
              <div className={styles.stadiumLights} />
              <div className={styles.stands} />
              <div className={styles.pitchGlow} />
            </div>
            <div className={styles.cameraFlashOne} />
            <div className={styles.cameraFlashTwo} />
            <aside className={styles.interviewVisual}>
              <div className={styles.broadcastBug}>AO VIVO · PÓS-JOGO</div>
              <PlayerStage appearance={appearance} primary={club.primary} secondary={club.secondary} name={player.name} />
              <div className={styles.micCluster}><i /><i /><i /></div>
              <div className={styles.lowerThird}>
                <b>{player.name}</b>
                <span>#{player.number} · {club.shortName}</span>
              </div>
            </aside>
            <div className={styles.interviewPanel}>
              <div className={styles.questionMeta}><span>ZONA MISTA</span><b>1 / 3</b></div>
              <h2>Você chamou a responsabilidade no fim. O que passou pela sua cabeça?</h2>
              <div className={styles.answerGrid}>
                {INTERVIEW_ANSWERS.map((answer, index) => (
                  <button className={interviewAnswer === index ? styles.answerSelected : ""} key={answer.label} onClick={() => setInterviewAnswer(index)} type="button">
                    <small>{answer.tone}</small>
                    <strong>{answer.label}</strong>
                  </button>
                ))}
              </div>
              <div className={styles.reactionStrip}>
                <span>ANIMAÇÃO</span>
                <p>{interviewAnswer === null ? "Escolha uma resposta: o boneco continua respirando, mudando o peso do corpo e olhando entre repórteres." : INTERVIEW_ANSWERS[interviewAnswer].reaction}</p>
              </div>
            </div>
          </div>
        )}

        {scene === "golden-boot" && (
          <div className={`${styles.scene} ${styles.bootScene}`}>
            <div className={styles.awardCurtain} />
            <div className={styles.awardSpotlight} />
            <div className={styles.bootTrophy} aria-hidden="true">
              <span>✦</span>
              <div className={styles.bootShape}>◢</div>
              <b>GOLDEN BOOT</b>
            </div>
            <div className={styles.bootPlayer}>
              <PlayerStage appearance={appearance} primary={club.primary} secondary={club.secondary} name={player.name} />
              <div>
                <small>PRIMEIRO PRÊMIO DA NOITE</small>
                <h2>Chuteira de Ouro</h2>
                <p>O jogador entra, recebe o prêmio, foto rápida e a transmissão já prepara o corte para a cerimônia principal.</p>
              </div>
            </div>
          </div>
        )}

        {scene === "finalists" && (
          <div className={`${styles.scene} ${styles.finalistsScene}`}>
            <div className={styles.galaBackdrop} />
            <div className={styles.galaTitle}>
              <small>BALLON D&apos;OR · {seasonLabel}</small>
              <h2>Os cinco finalistas</h2>
              <p>Em vez de uma lista, a câmera passeia pelos jogadores sentados antes do anúncio.</p>
            </div>
            <div className={styles.finalistLineup}>
              {FINALIST_NAMES.slice(0, 2).map((name, index) => (
                <article key={name}>
                  <PlayerStage compact appearance={finalistAppearances[index]} primary={FINALIST_COLORS[index][0]} secondary={FINALIST_COLORS[index][1]} name={name} />
                  <b>0{index + 1}</b>
                </article>
              ))}
              <article className={styles.userFinalist}>
                <PlayerStage appearance={appearance} primary={club.primary} secondary={club.secondary} name={player.name} />
                <b>VOCÊ</b>
              </article>
              {FINALIST_NAMES.slice(2).map((name, offset) => {
                const index = offset + 2;
                return (
                  <article key={name}>
                    <PlayerStage compact appearance={finalistAppearances[index]} primary={FINALIST_COLORS[index][0]} secondary={FINALIST_COLORS[index][1]} name={name} />
                    <b>0{index + 2}</b>
                  </article>
                );
              })}
            </div>
            <div className={styles.cameraMove}><span /></div>
          </div>
        )}

        {scene === "presenter" && (
          <div className={`${styles.scene} ${styles.presenterScene} ${nameRevealed ? styles.presenterRevealed : ""}`}>
            <div className={styles.stageScreen}>
              <small>BALLON D&apos;OR · {seasonLabel}</small>
              <strong>{nameRevealed ? player.name : "AND THE WINNER IS..."}</strong>
              <span>{nameRevealed ? "MELHOR JOGADOR DO MUNDO" : ""}</span>
            </div>
            <div className={styles.presenter}>
              <div className={styles.presenterHead}><i /><span /></div>
              <div className={styles.presenterBody} />
              <div className={styles.podium}>
                <span>◉</span>
                <b>BALLON D&apos;OR</b>
              </div>
            </div>
            <div className={styles.presenterCaption}>
              <small>{nameRevealed ? "TELÃO ACENDE" : "ENVELOPE ABERTO"}</small>
              <p>{nameRevealed ? "O nome aparece primeiro no telão; meio segundo depois entra o áudio, flash e corte para o jogador." : "Um apresentador simples, careca, no centro do palco. A tensão vem do silêncio e do telão atrás dele."}</p>
            </div>
          </div>
        )}

        {scene === "winner" && (
          <div className={`${styles.scene} ${styles.winnerScene}`}>
            <div className={styles.confettiField} aria-hidden="true">
              {Array.from({ length: 22 }).map((_, index) => <i key={index} style={{ "--i": index } as CSSProperties} />)}
            </div>
            <div className={styles.winnerScreen}>{player.name}</div>
            <div className={styles.winnerPlayer}>
              <PlayerStage appearance={{ ...appearance, face: 2 }} primary={club.primary} secondary={club.secondary} name={player.name} />
              <div className={styles.ballonTrophy}><span>◉</span><i /><b>BALLON D&apos;OR</b></div>
            </div>
            <div className={styles.winnerCopy}>
              <small>FIM DA SEQUÊNCIA</small>
              <h2>Agora o prêmio parece um evento.</h2>
              <p>A ideia é que prêmios menores usem a mesma máquina de cenas: muda cenário, câmera, elenco e duração; o jogador continua sendo o centro.</p>
            </div>
          </div>
        )}
      </section>

      <footer className={styles.prototypeFooter}>
        <div>
          <span>{club.shortName}</span>
          <b>{player.name}</b>
          <small>save local {player.name === FALLBACK_PLAYER.name ? "não encontrado — usando personagem de demonstração" : "carregado"}</small>
        </div>
        <button onClick={goNext} type="button">{scene === "presenter" && !nameRevealed ? "Revelar nome" : scene === "winner" ? "Recomeçar" : "Próxima cena"} →</button>
      </footer>
    </main>
  );
}
