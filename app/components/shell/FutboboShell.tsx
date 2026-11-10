"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { legacySummaryForHallEntry } from "../../career/legacy-prestige";
import CareerGame from "../career/CareerGame";
import CareerAccessDialog from "./CareerAccessDialog";
import HallCareerViewer from "../career/HallCareerViewer";
import styles from "./FutboboShell.module.css";
import { InstallScreen, NewsScreen, SettingsScreen } from "./ShellUtilityScreens";
import FutboboIcon from "../FutboboIcon";
import HomeSpread, { type MenuScreen } from "../career/album/menu/HomeSpread";
import { AchievementsSpread, DeleteCareerSheet, HallSpread, OtherGames, PaperScreen } from "../career/album/menu/MenuSpreads";
import { enableBotao3dPreference, markBotao3dOfferSeen, shouldOfferBotao3d } from "../../botao/view-mode";

type ShellScreen = "home" | MenuScreen | "hall-career" | "hall-card" | "career" | "legacy-tool";
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
      <span className={styles.offerTag}>Novo · 3D</span>
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
          <span>Futebol de botão</span>
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
  const botao3dOfferReady = screen === "home" && accessDialog === null && confirmDeleteId === "";

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

  // Carreiras aposentadas já estão no Hall da Fama: o menu só guarda as que seguem.
  useEffect(() => {
    if (screen !== "home") return;
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
  const achievementMap = useMemo(() => new Map(unlocks.map((item) => [item.achievementId, item])), [unlocks]);
  const unlockedCount = useMemo(() => ACHIEVEMENTS.filter((item) => achievementMap.has(item.id)).length, [achievementMap]);
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

  const deleteMeta = saves.find((meta) => meta.id === confirmDeleteId) ?? null;
  const sheets = (
    <>
      {accessDialog && <CareerAccessDialog creating={accessDialog === "new"} name={accessDialog === "new" ? undefined : accessDialog.name} onClose={() => setAccessDialog(null)} onSubmit={(pin) => accessDialog === "new" ? launchNew(pin) : openCareer(accessDialog.id, pin)} />}
      {deleteMeta && <DeleteCareerSheet name={deleteMeta.name} onCancel={() => setConfirmDeleteId("")} onConfirm={() => { deleteCareerSlot(deleteMeta.id); setConfirmDeleteId(""); refreshLibrary(); }} />}
      {botao3dOfferOpen && botao3dOfferReady && <Botao3dOfferDialog onAnswer={answerBotao3dOffer} />}
      {botao3dEnabledToast && screen === "home" && (
        <div className={styles.offerToast} role="status"><b><FutboboIcon name="check" /></b><span><strong>Modo 3D ativado</strong><small>Troque quando quiser em Configurações.</small></span></div>
      )}
    </>
  );
  const home = () => setScreen("home");

  if (screen === "hall") {
    return <HallSpread rows={hallRows} onBack={home} onOpen={(entry) => { setSelectedHallEntry(entry); setScreen("hall-career"); }} />;
  }

  if (screen === "achievements") return <AchievementsSpread unlocks={unlocks} onBack={home} />;

  if (screen === "settings" || screen === "install" || screen === "news" || screen === "other-games") {
    const labels = { settings: "Configurações", install: "Instalar", news: "Novidades", "other-games": "Outros jogos" } as const;
    return (
      <PaperScreen label={labels[screen]} onBack={home}>
        {screen === "settings" && <SettingsScreen />}
        {screen === "install" && <InstallScreen />}
        {screen === "news" && <NewsScreen />}
        {screen === "other-games" && <OtherGames />}
      </PaperScreen>
    );
  }

  return (
    <HomeSpread
      saves={playableSaves}
      unlocked={unlockedCount}
      totalAchievements={ACHIEVEMENTS.length}
      bobonlineRoom={bobonlineRoom}
      onOpen={launchExisting}
      onNew={() => setAccessDialog("new")}
      onDelete={setConfirmDeleteId}
      onScreen={setScreen}
    >
      {sheets}
    </HomeSpread>
  );
}
