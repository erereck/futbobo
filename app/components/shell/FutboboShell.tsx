"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CLUBS, COUNTRIES, LEAGUES } from "../../game-data";
import type { CareerHallEntry } from "../../career/model";
import { HALL_OF_FAME_KEY } from "../../career/state";
import {
  activateCareerSlot,
  bootstrapCareerStorage,
  createCareerSlot,
  deleteCareerSlot,
  listCareerSaves,
  listGlobalAchievementUnlocks,
  syncActiveCareerSlot,
  type CareerSaveMeta,
  type GlobalAchievementUnlock,
} from "../../career/save-system";
import { ACHIEVEMENTS } from "../../mega-expansion";
import { clubById } from "../../career/shared";
import { legacySummaryForHallEntry } from "../../career/legacy-prestige";
import CareerGame from "../career/CareerGame";
import CareerAccessDialog from "./CareerAccessDialog";
import HallCareerViewer from "../career/HallCareerViewer";
import { BrandMark, ClubBadge } from "../career/CareerPrimitives";
import styles from "./FutboboShell.module.css";
import { InstallScreen, NewsScreen, SettingsScreen } from "./ShellUtilityScreens";
import FutboboIcon from "../FutboboIcon";
import { FUTBOBO_VERSION, FUTBOBO_VERSION_NAME } from "../../version";
import { enableBotao3dPreference, markBotao3dOfferSeen, shouldOfferBotao3d } from "../../botao/view-mode";

type ShellScreen = "home" | "modes" | "saves" | "achievements" | "hall" | "hall-career" | "hall-card" | "settings" | "install" | "news" | "other-games" | "career" | "legacy-tool";
type BootAction = "new" | "continue" | "settings" | "install" | "news" | null;

function safeHall() {
  if (typeof window === "undefined") return [] as CareerHallEntry[];
  try {
    const value = JSON.parse(localStorage.getItem(HALL_OF_FAME_KEY) ?? "[]") as unknown;
    return Array.isArray(value)
      ? (value as CareerHallEntry[]).filter((item) => item && typeof item.name === "string").slice(0, 10)
      : [];
  } catch {
    return [];
  }
}

function formatLastPlayed(timestamp: number) {
  const diff = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ontem";
  if (days < 7) return `há ${days} dias`;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(timestamp);
}

function SaveCard({ meta, onPlay, onDelete }: { meta: CareerSaveMeta; onPlay: () => void; onDelete: () => void }) {
  const club = CLUBS.find((item) => item.id === meta.clubId);
  const manager = meta.mode === "manager";
  return (
    <article className={styles.saveCard}>
      <button className={styles.saveMain} type="button" onClick={onPlay}>
        <span className={styles.saveBadge}>{club ? <ClubBadge club={club} size="md" /> : <b>+</b>}</span>
        <span className={styles.saveCopy}>
          <strong>{meta.name || "Nova carreira"}</strong>
          {meta.pin && <small>Protegida por senha</small>}
          <small>{club?.shortName ?? "Categorias de base"} · {meta.position} · {meta.season}</small>
          <em>{(manager ? "Confiança " : "OVR ") + meta.overall} · {formatLastPlayed(meta.lastPlayedAt)}</em>
        </span>
        <span className={styles.saveArrow}><FutboboIcon name="arrow-right" /></span>
      </button>
      <button className={styles.deleteSave} type="button" aria-label={`Excluir carreira de ${meta.name}`} onClick={onDelete}>×</button>
    </article>
  );
}

// ------------------------------------------------------- convite do Modo 3D
// Ilustração só em CSS/SVG: a home não pode carregar o three.js por causa de um convite.

type OfferKit = { shirt: string; shorts: string; socks: string; skin: string; hair: string };

const OFFER_HOME_KIT = { shirt: "#f4c430", shorts: "#1f4fbf", socks: "#f5f5ef" };
const OFFER_AWAY_KIT = { shirt: "#d8392f", shorts: "#f5f5ef", socks: "#d8392f" };

/** Caixa com frente, lateral escura e tampa clara: o mesmo bloco dos bonecos do 3D. */
function OfferBlock({ x, y, w, h, fill, lid }: { x: number; y: number; w: number; h: number; fill: string; lid?: string }) {
  const side = `${x + w},${y} ${x + w + 3},${y - 2} ${x + w + 3},${y + h - 2} ${x + w},${y + h}`;
  const top = `${x},${y} ${x + 3},${y - 2} ${x + w + 3},${y - 2} ${x + w},${y}`;
  return (
    <>
      <polygon points={side} fill={fill} />
      <polygon points={side} fill="#000" fillOpacity={0.34} />
      <polygon points={top} fill={lid ?? fill} />
      <polygon points={top} fill="#fff" fillOpacity={0.18} />
      <rect x={x} y={y} width={w} height={h} fill={fill} />
    </>
  );
}

function OfferFigure({ kit, kick }: { kit: OfferKit; kick?: "pass" | "return" }) {
  return (
    <svg viewBox="-12 -56 28 57" width="28" height="57">
      <g className={kick === "return" ? styles.offerKickReturn : undefined}>
        <OfferBlock x={-6} y={-15} w={5} h={15} fill={kit.socks} />
        <rect x={-6} y={-2.6} width={5} height={2.6} fill="#121512" />
      </g>
      <g className={kick === "pass" ? styles.offerKickPass : undefined}>
        <OfferBlock x={1} y={-15} w={5} h={15} fill={kit.socks} />
        <rect x={1} y={-2.6} width={5} height={2.6} fill="#121512" />
      </g>
      <OfferBlock x={-7} y={-22} w={14} h={8} fill={kit.shorts} />
      <OfferBlock x={-11} y={-37} w={4} h={14} fill={kit.skin} />
      <rect x={-11} y={-37} width={4} height={5} fill={kit.shirt} />
      <OfferBlock x={-7} y={-38} w={14} h={17} fill={kit.shirt} />
      <OfferBlock x={7} y={-37} w={4} h={14} fill={kit.skin} />
      <rect x={7} y={-37} width={4} height={5} fill={kit.shirt} />
      <OfferBlock x={-6} y={-52} w={12} h={12} fill={kit.skin} lid={kit.hair} />
      <rect x={-6} y={-52} width={12} height={3.4} fill={kit.hair} />
      <rect x={-3.6} y={-46.6} width={2} height={2.4} fill="#111" />
      <rect x={1.6} y={-46.6} width={2} height={2.4} fill="#111" />
    </svg>
  );
}

const OFFER_PLAYERS: Array<{ left: string; top: string; kit: OfferKit; kick?: "pass" | "return" }> = [
  { left: "30%", top: "64%", kit: { ...OFFER_HOME_KIT, skin: "#c68a5c", hair: "#1c130d" }, kick: "pass" },
  { left: "56%", top: "36%", kit: { ...OFFER_HOME_KIT, skin: "#8a5a3a", hair: "#0f0b08" }, kick: "return" },
  { left: "72%", top: "66%", kit: { ...OFFER_AWAY_KIT, skin: "#e0b48f", hair: "#6b3d1d" } },
];

function OfferArt() {
  return (
    <div className={styles.offerArt} aria-hidden="true">
      <div className={styles.offerPitch}>
        <i className={styles.offerStand} />
        <svg className={styles.offerLines} viewBox="0 0 260 160" preserveAspectRatio="none">
          <rect x="8" y="8" width="244" height="144" />
          <path d="M130 8v144M8 44h36v72H8M252 44h-36v72h36M8 62h14v36H8M252 62h-14v36h14" />
          <circle cx="130" cy="80" r="22" />
          <rect className={styles.offerNet} x="2" y="68" width="6" height="24" />
          <rect className={styles.offerNet} x="252" y="68" width="6" height="24" />
        </svg>
        {OFFER_PLAYERS.map((player) => <i key={`shadow-${player.left}`} className={styles.offerShadow} style={{ left: player.left, top: player.top }} />)}
        {OFFER_PLAYERS.map((player) => (
          <span key={player.left} className={styles.offerFace} style={{ left: player.left, top: player.top }}>
            <span className={styles.offerBob}><OfferFigure kit={player.kit} kick={player.kick} /></span>
          </span>
        ))}
        <span className={styles.offerBallPath}>
          <i className={styles.offerShadow} />
          <span className={styles.offerFace}><i className={styles.offerBall} /></span>
        </span>
      </div>
      <span className={styles.offerTag}>NOVO · 3D</span>
    </div>
  );
}

function OfferGlyph({ name }: { name: "rotate" | "bolt" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {name === "rotate" ? <><path d="M20 12a8 8 0 1 1-2.4-5.7" /><path d="M20 4v4.5h-4.5" /></> : <path d="M13 3 5 14h6l-1 7 8-11h-6l1-7Z" />}
    </svg>
  );
}

function Botao3dOfferDialog({ onAnswer }: { onAnswer: (enable: boolean) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const enableRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    enableRef.current?.focus();
    return () => dialog.close();
  }, []);

  return (
    // Esc (e o voltar do Android) contam como "Agora não"; clicar fora não, para o convite não sumir sem querer.
    <dialog ref={dialogRef} className={styles.offerDialog} aria-modal="true" aria-labelledby="botao3d-offer-title" aria-describedby="botao3d-offer-lead" onCancel={(event) => { event.preventDefault(); onAnswer(false); }}>
      <OfferArt />
      <div className={styles.offerBody}>
        <header>
          <span>FUTEBOL DE BOTÃO</span>
          <h2 id="botao3d-offer-title">Novidade: Modo 3D</h2>
          <p id="botao3d-offer-lead">Troque a mesa clássica por um estádio 3D com jogadores animados. Quer ativar agora?</p>
        </header>
        <ul className={styles.offerFeatures}>
          <li><b><FutboboIcon name="ball" /></b><span><strong>Mesma partida</strong><small>Mesmas regras, física e resultado. Só muda o visual.</small></span></li>
          <li><b><FutboboIcon name="player" /></b><span><strong>Bonecos animados</strong><small>Jogadores 3D que correm, chutam e comemoram os gols em close.</small></span></li>
          <li><b><OfferGlyph name="rotate" /></b><span><strong>Gire o campo</strong><small>Gire com dois dedos na tela ou arraste com o botão direito do mouse.</small></span></li>
          <li><b><OfferGlyph name="bolt" /></b><span><strong>Modo desempenho 3D</strong><small>Celular ou PC mais fraco? Versão leve em Configurações, que liga sozinha se a partida engasgar.</small></span></li>
        </ul>
        <p className={styles.offerNote}>Dá para trocar a qualquer momento em Configurações.</p>
        <footer>
          <button type="button" onClick={() => onAnswer(false)}>Agora não</button>
          <button ref={enableRef} type="button" className={styles.offerEnable} onClick={() => onAnswer(true)}>Ativar Modo 3D</button>
        </footer>
      </div>
    </dialog>
  );
}

export default function FutboboShell() {
  const [screen, setScreen] = useState<ShellScreen>("home");
  const [bootAction, setBootAction] = useState<BootAction>(null);
  const [saves, setSaves] = useState<CareerSaveMeta[]>([]);
  const [unlocks, setUnlocks] = useState<GlobalAchievementUnlock[]>([]);
  const [hall, setHall] = useState<CareerHallEntry[]>([]);
  const [selectedHallEntry, setSelectedHallEntry] = useState<CareerHallEntry | null>(null);
  const [selectedAchievementId, setSelectedAchievementId] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [accessDialog, setAccessDialog] = useState<"new" | CareerSaveMeta | null>(null);
  const [botao3dOfferOpen, setBotao3dOfferOpen] = useState(false);
  const [botao3dEnabledToast, setBotao3dEnabledToast] = useState(false);
  const [bobonlineRoom, setBobonlineRoom] = useState<{ code: string } | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const launchedCareerRef = useRef(false);
  const toolClickedRef = useRef(false);
  const botao3dOfferCheckedRef = useRef(false);
  // O convite só entra na home e nunca por cima de outro diálogo do shell.
  const botao3dOfferReady = screen === "home" && accessDialog === null && confirmDeleteId === "" && selectedAchievementId === "";

  const refreshLibrary = () => {
    setSaves(listCareerSaves("player"));
    setUnlocks(listGlobalAchievementUnlocks());
    setHall(safeHall());
  };

  useEffect(() => {
    bootstrapCareerStorage();
    queueMicrotask(refreshLibrary);
  }, []);

  useEffect(() => {
    if (screen !== "career") return;
    const sync = () => {
      syncActiveCareerSlot();
      refreshLibrary();
    };
    const interval = window.setInterval(sync, 850);
    const onVisibility = () => { if (document.visibilityState === "hidden") sync(); };
    window.addEventListener("beforeunload", sync);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", sync);
      document.removeEventListener("visibilitychange", onVisibility);
      sync();
    };
  }, [screen]);

  useEffect(() => {
    if (screen !== "saves") return;
    const retired = listCareerSaves("player").filter((meta) => meta.phase === "summary");
    if (!retired.length) return;
    retired.forEach((meta) => deleteCareerSlot(meta.id));
    queueMicrotask(refreshLibrary);
  }, [screen]);

  useEffect(() => {
    if (screen !== "career" && screen !== "legacy-tool") return;
    const host = hostRef.current;
    if (!host) return;

    const inspect = () => {
      const welcome = host.querySelector<HTMLElement>(".welcome-screen");
      if (!welcome) {
        if (screen === "career") setBootAction(null);
        return;
      }

      if (bootAction === "new") {
        const button = welcome.querySelector<HTMLButtonElement>(".career-new-tile");
        if (button) {
          button.click();
          setBootAction(null);
        }
        return;
      }

      if (bootAction === "continue") {
        const button = welcome.querySelector<HTMLButtonElement>(".career-load-tile:not(:disabled)");
        if (button) {
          button.click();
          setBootAction(null);
        }
        return;
      }

      if (screen === "legacy-tool" && bootAction && !toolClickedRef.current) {
        const utilityButtons = [...welcome.querySelectorAll<HTMLButtonElement>(".welcome-utilities button")];
        const wanted = bootAction === "settings" ? "Configura" : bootAction === "install" ? "Instal" : "Novidades";
        const button = utilityButtons.find((item) => item.textContent?.includes(wanted));
        if (button) {
          toolClickedRef.current = true;
          button.click();
        }
        return;
      }

      if (screen === "career" && !bootAction && launchedCareerRef.current) {
        syncActiveCareerSlot();
        launchedCareerRef.current = false;
        setScreen("home");
        refreshLibrary();
      }
    };

    const observer = new MutationObserver(inspect);
    observer.observe(host, { childList: true, subtree: true, attributes: true });
    inspect();
    return () => observer.disconnect();
  }, [bootAction, screen]);

  useEffect(() => {
    if (!botao3dOfferReady || botao3dOfferCheckedRef.current) return;
    // Espera a home assentar; a checagem é feita na hora de mostrar, porque o
    // jogador pode ter ligado o 3D nas Configurações antes de voltar para cá.
    const timer = window.setTimeout(() => {
      botao3dOfferCheckedRef.current = true;
      if (shouldOfferBotao3d()) setBotao3dOfferOpen(true);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [botao3dOfferReady]);

  // Sala do Bobonline ainda válida (fechou o app no meio): um toque leva de volta (§1.10).
  useEffect(() => {
    if (screen !== "home") return;
    // A espiada vem num pedaço próprio: a home não paga o storage do Bobonline no pacote de cara.
    void import("../../bobonline/net/session-peek").then((peek) => setBobonlineRoom(peek.peekBobonlineSession()), () => undefined);
  }, [screen]);

  useEffect(() => {
    if (!botao3dEnabledToast) return;
    const timer = window.setTimeout(() => setBotao3dEnabledToast(false), 3800);
    return () => window.clearTimeout(timer);
  }, [botao3dEnabledToast]);

  const answerBotao3dOffer = (enable: boolean) => {
    markBotao3dOfferSeen(enable ? "on" : "later");
    if (enable) enableBotao3dPreference();
    setBotao3dOfferOpen(false);
    setBotao3dEnabledToast(enable);
  };

  const playableSaves = useMemo(() => saves.filter((meta) => meta.phase !== "summary"), [saves]);
  const continueMeta = playableSaves[0] ?? null;
  const achievementMap = useMemo(() => new Map(unlocks.map((item) => [item.achievementId, item])), [unlocks]);
  const selectedAchievement = ACHIEVEMENTS.find((item) => item.id === selectedAchievementId) ?? null;
  const selectedUnlock = selectedAchievement ? achievementMap.get(selectedAchievement.id) : undefined;
  const hallRows = useMemo(() => hall
    .map((entry) => ({ entry, legacy: legacySummaryForHallEntry(entry) }))
    .sort((a, b) => b.legacy.score - a.legacy.score || b.entry.finishedAt - a.entry.finishedAt), [hall]);

  const openCareer = async (id: string, pin = "") => {
    if (!await activateCareerSlot(id, pin)) return false;
    setAccessDialog(null);
    launchedCareerRef.current = true;
    setBootAction("continue");
    setScreen("career");
    return true;
  };

  const launchExisting = (id: string) => {
    const meta = saves.find((item) => item.id === id);
    if (meta?.pin) setAccessDialog(meta);
    else void openCareer(id);
  };

  const launchNew = async (pin: string) => {
    const slot = await createCareerSlot("player", pin);
    if (!slot) return false;
    setAccessDialog(null);
    launchedCareerRef.current = true;
    setBootAction("new");
    setScreen("career");
    refreshLibrary();
    return true;
  };

  if (screen === "career") {
    return <div ref={hostRef} className={styles.careerHost}><CareerGame /></div>;
  }

  if (screen === "hall-career" && selectedHallEntry) {
    return (
      <div className={styles.careerHost}>
        <HallCareerViewer
          entry={selectedHallEntry}
          onBack={() => { setSelectedHallEntry(null); setScreen("hall"); }}
          onGenerateCard={() => setScreen("hall-card")}
        />
      </div>
    );
  }

  if (screen === "hall-card" && selectedHallEntry) {
    return (
      <div className={styles.careerHost}>
        <CareerGame
          initialHallEntry={selectedHallEntry}
          onCloseHallPreview={() => setScreen("hall-career")}
        />
      </div>
    );
  }

  if (screen === "legacy-tool") {
    return (
      <div className={styles.toolHost}>
        <div ref={hostRef} className={styles.legacyToolMount}><CareerGame /></div>
        <button type="button" className={styles.toolBack} onClick={() => { setScreen("home"); setBootAction(null); toolClickedRef.current = false; }}><FutboboIcon name="arrow-left" /> Menu principal</button>
      </div>
    );
  }

  return (
    <main className={styles.shell} data-screen={screen}>
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.vignette} aria-hidden="true" />

      <header className={styles.topline}>
        <div className={styles.wordmark}><BrandMark /><strong>FUTBOBO</strong></div>
        {screen !== "home" && <button type="button" onClick={() => setScreen(screen === "saves" ? "modes" : "home")}><FutboboIcon name="arrow-left" /> Voltar</button>}
      </header>

      {screen === "home" && (
        <section className={styles.home}>
          <div className={styles.heroLogo}><BrandMark size="hero" /><h1>FUTBOBO</h1><span>FAÇA SUA HISTÓRIA</span></div>
          <nav className={styles.mainActions} aria-label="Menu principal">
            <button type="button" className={styles.playButton} onClick={() => setScreen("modes")}><span><FutboboIcon name="play" /></span><strong>JOGAR</strong><b><FutboboIcon name="arrow-right" /></b></button>
            {bobonlineRoom && <Link className={styles.resumeRoom} href="/bobonline/?voltar=1"><span><FutboboIcon name="play" /></span><strong>Voltar para a sala {bobonlineRoom.code.slice(0, 3)}·{bobonlineRoom.code.slice(3)}</strong><b><FutboboIcon name="arrow-right" /></b></Link>}
            <button type="button" onClick={() => setScreen("settings")}><span><FutboboIcon name="settings" /></span>Configurações</button>
            <button type="button" onClick={() => setScreen("hall")}><span><FutboboIcon name="hall" /></span>Hall da Fama</button>
            <button type="button" onClick={() => setScreen("achievements")}><span><FutboboIcon name="medal" /></span>Conquistas</button>
            <button type="button" onClick={() => setScreen("install")}><span><FutboboIcon name="download" /></span>Instalar</button>
            <button type="button" onClick={() => setScreen("news")}><span><FutboboIcon name="news" /></span>Novidades</button>
            <button type="button" onClick={() => setScreen("other-games")}><span><FutboboIcon name="globe" /></span>Outros jogos</button>
          </nav>
        </section>
      )}

      {screen === "settings" && <SettingsScreen />}
      {screen === "install" && <InstallScreen />}
      {screen === "news" && <NewsScreen />}

      {screen === "other-games" && (
        <section className={styles.panelScreen}>
          <header className={styles.panelHeading}><span>ERILAB</span><h2>Outros jogos.</h2><p>Mais projetos para abrir e jogar direto no navegador.</p></header>
          <div className={styles.modeList}>
            <a className={styles.modeCard} href="https://erereck.github.io/gamebobo" target="_blank" rel="noreferrer">
              <span className={styles.modeIndex}>01</span><div><small>SIMULADOR</small><strong>Gamebobo</strong><p>Crie jogos, evolua seu estúdio e tente dominar gerações inteiras.</p></div><b><FutboboIcon name="arrow-right" /></b>
            </a>
            <a className={styles.modeCard} href="https://erereck.github.io/pokebobo" target="_blank" rel="noreferrer">
              <span className={styles.modeIndex}>02</span><div><small>POKÉMON</small><strong>Pokebobo</strong><p>Monte sua carreira de treinador e avance cidade por cidade.</p></div><b><FutboboIcon name="arrow-right" /></b>
            </a>
            <a className={styles.modeCard} href="https://mmmweb.vercel.app" target="_blank" rel="noreferrer">
              <span className={styles.modeIndex}>03</span><div><small>MINIMALISTA</small><strong>Muito, Muito Minimalista</strong><p>Abra o MMM Web e jogue direto pelo navegador.</p></div><b><FutboboIcon name="arrow-right" /></b>
            </a>
          </div>
        </section>
      )}

      {screen === "modes" && (
        <section className={styles.panelScreen}>
          <header className={styles.panelHeading}><span>JOGAR</span><h2>Escolher seu futbobo.</h2><p>Carreira longa, copa rápida, o sofá ou online com a galera.</p></header>
          <div className={styles.modeList}>
            <button type="button" className={styles.modeCard} onClick={() => setScreen("saves")}>
              <span className={styles.modeIndex}>01</span><div><small>MODO PRINCIPAL</small><strong>Rumo ao Estrelato</strong><p>Crie seu jogador do zero, ganhe títulos e prêmios individuais.</p></div><b><FutboboIcon name="arrow-right" /></b>
            </button>
            <button type="button" className={`${styles.modeCard} ${styles.disabledMode}`} disabled>
              <span className={styles.modeIndex}>02</span><div><small>MODO TÉCNICO</small><strong className={styles.modeTitle}>Carreira de Técnico <em className={styles.betaTag}>BLOQUEADO</em></strong><p>Modo temporariamente indisponível.</p></div><b><FutboboIcon name="arrow-right" /></b>
            </button>
            <Link className={styles.modeCard} href="/copa"><span className={styles.modeIndex}>03</span><div><small>PARTIDA RÁPIDA</small><strong>Copa do Mundo</strong><p>Jogue uma Copa do Mundo rápida com qualquer seleção.</p></div><b><FutboboIcon name="arrow-right" /></b></Link>
            <Link className={styles.modeCard} href="/x1"><span className={styles.modeIndex}>04</span><div><small>DOIS JOGADORES</small><strong>1x1 Local</strong><p>Jogue uma partida de futebol de botão contra o seu amigo.</p></div><b><FutboboIcon name="arrow-right" /></b></Link>
            <Link className={styles.modeCard} href="/bobonline"><span className={styles.modeIndex}>05</span><div><small>ONLINE</small><strong>Bobonline</strong><p>Monte seu time e jogue online com os amigos.</p></div><b><FutboboIcon name="arrow-right" /></b></Link>
          </div>
        </section>
      )}

      {screen === "saves" && (
        <section className={styles.panelScreen}>
          <header className={styles.panelHeading}><span>RUMO AO ESTRELATO</span><h2>Suas carreiras.</h2><p>Crie quantas histórias quiser. Carreiras encerradas ficam guardadas no Hall da Fama.</p></header>
          <div className={styles.saveActions}>
            <button type="button" className={styles.continueButton} disabled={!continueMeta} onClick={() => continueMeta && launchExisting(continueMeta.id)}>
              <small>ÚLTIMA CARREIRA</small><strong>{continueMeta ? "Continuar carreira" : "Nenhuma carreira ainda"}</strong><span>{continueMeta ? `${continueMeta.name} · ${formatLastPlayed(continueMeta.lastPlayedAt)}` : "Crie seu primeiro jogador"}</span><b><FutboboIcon name="arrow-right" /></b>
            </button>
            <button type="button" className={styles.newButton} onClick={() => setAccessDialog("new")}><span>＋</span><strong>Nova carreira</strong><small>{playableSaves.length} carreira{playableSaves.length === 1 ? "" : "s"} salva{playableSaves.length === 1 ? "" : "s"}</small></button>
          </div>
          <div className={styles.saveGrid}>
            {playableSaves.map((meta) => <SaveCard key={meta.id} meta={meta} onPlay={() => launchExisting(meta.id)} onDelete={() => setConfirmDeleteId(meta.id)} />)}
          </div>
          {confirmDeleteId && (
            <div className={styles.confirmOverlay} role="dialog" aria-modal="true">
              <div><span>EXCLUIR CARREIRA</span><strong>Essa história vai desaparecer do aparelho.</strong><p>Conquistas globais que já foram desbloqueadas continuam na sua coleção.</p><footer><button type="button" onClick={() => setConfirmDeleteId("")}>Cancelar</button><button type="button" className={styles.danger} onClick={() => { deleteCareerSlot(confirmDeleteId); setConfirmDeleteId(""); refreshLibrary(); }}>Excluir</button></footer></div>
            </div>
          )}
        </section>
      )}

      {screen === "achievements" && (
        <section className={`${styles.panelScreen} ${styles.collectionScreen}`}>
          <header className={styles.panelHeading}><span>CONQUISTAS GLOBAIS</span><h2>{unlocks.length}/{ACHIEVEMENTS.length} desbloqueadas.</h2><p>Uma vez conquistada, fica no Futbobo mesmo se a carreira original for apagada.</p></header>
          <div className={styles.achievementGrid}>
            {ACHIEVEMENTS.map((achievement) => {
              const unlocked = achievementMap.has(achievement.id);
              const secret = achievement.rarity === "lendário" && !unlocked;
              return <button type="button" key={achievement.id} className={`${styles.achievementCard} ${unlocked ? styles.unlocked : ""}`} onClick={() => setSelectedAchievementId(achievement.id)}><b>{unlocked ? achievement.icon : "?"}</b><span><small>{achievement.rarity}</small><strong>{secret ? "Conquista secreta" : achievement.title}</strong><em>{unlocked ? "Desbloqueada" : "Bloqueada"}</em></span></button>;
            })}
          </div>
          {selectedAchievement && (
            <div className={styles.confirmOverlay} role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.currentTarget === event.target) setSelectedAchievementId(""); }}>
              <div className={styles.achievementDialog}><button type="button" className={styles.dialogClose} onClick={() => setSelectedAchievementId("")}>×</button><b className={styles.bigAchievementIcon}>{selectedUnlock ? selectedAchievement.icon : "?"}</b><small>{selectedAchievement.rarity.toLocaleUpperCase("pt-BR")}</small><strong>{selectedUnlock || selectedAchievement.rarity !== "lendário" ? selectedAchievement.title : "Conquista secreta"}</strong><p>{selectedUnlock || selectedAchievement.rarity !== "lendário" ? selectedAchievement.description : "Continue jogando para descobrir."}</p>{selectedUnlock && <div className={styles.unlockContext}>{selectedUnlock.clubId && CLUBS.some((club) => club.id === selectedUnlock.clubId) ? <ClubBadge club={clubById(selectedUnlock.clubId)} size="sm" /> : null}<span><small>DESBLOQUEADA {selectedUnlock.unlockedAt ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(selectedUnlock.unlockedAt) : "ANTES DESTA ATUALIZAÇÃO"}</small><strong>{selectedUnlock.playerName}</strong><em>{selectedUnlock.position}</em></span></div>}</div>
            </div>
          )}
        </section>
      )}

      {screen === "hall" && (
        <section className={`${styles.panelScreen} ${styles.collectionScreen}`}>
          <header className={styles.panelHeading}><span>HALL DA FAMA</span><h2>Carreiras que chegaram ao fim.</h2><p>Prêmios e títulos grandes pesam de verdade. Quantidade sozinha não ganha da história.</p></header>
          <div className={styles.hallList}>
            {hallRows.length === 0 ? <div className={styles.emptyCollection}><b><FutboboIcon name="hall" /></b><strong>Nenhuma carreira aposentada.</strong><span>Quando uma história terminar, ela aparece aqui.</span></div> : hallRows.map(({ entry, legacy }, index) => {
              const club = CLUBS.find((item) => item.id === entry.finalClubId);
              return <button type="button" className={styles.hallCareerCard} key={entry.id} onClick={() => { setSelectedHallEntry(entry); setScreen("hall-career"); }} aria-label={`Abrir carreira completa de ${entry.name}`}><b>#{index + 1}</b>{club ? <ClubBadge club={club} size="md" /> : <span /> }<span><strong>{entry.name}</strong><small>{entry.position} · {entry.seasons} temporadas · pico {entry.peakOverall}</small><em>{legacy.signature}</em></span><strong className={styles.legacyScore} style={{ color: legacy.color }}>{legacy.score}<small>{legacy.label} · abrir carreira →</small></strong></button>;
            })}
          </div>
        </section>
      )}

      {accessDialog && <CareerAccessDialog creating={accessDialog === "new"} name={accessDialog === "new" ? undefined : accessDialog.name} onClose={() => setAccessDialog(null)} onSubmit={(pin) => accessDialog === "new" ? launchNew(pin) : openCareer(accessDialog.id, pin)} />}

      {botao3dOfferOpen && botao3dOfferReady && <Botao3dOfferDialog onAnswer={answerBotao3dOffer} />}
      {botao3dEnabledToast && screen === "home" && (
        <div className={styles.offerToast} role="status"><b><FutboboIcon name="check" /></b><span><strong>Modo 3D ativado</strong><small>Troque quando quiser em Configurações.</small></span></div>
      )}

      <footer className={styles.footer}>
        <div><span><FutboboIcon name="career" /> {CLUBS.length} clubes</span><span><FutboboIcon name="player" /> 12 posições</span><span><FutboboIcon name="trophy" /> {LEAGUES.length} ligas</span><span><FutboboIcon name="globe" /> {COUNTRIES.length} seleções</span></div>
        <strong>{FUTBOBO_VERSION} · {FUTBOBO_VERSION_NAME}</strong>
      </footer>
    </main>
  );
}
