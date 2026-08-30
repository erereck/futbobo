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
import ManagerGame from "../manager/ManagerGame";
import HallCareerViewer from "../career/HallCareerViewer";
import { BrandMark, ClubBadge } from "../career/CareerPrimitives";
import styles from "./FutboboShell.module.css";
import { InstallScreen, NewsScreen, SettingsScreen } from "./ShellUtilityScreens";
import FutboboIcon from "../FutboboIcon";
import { FUTBOBO_VERSION, FUTBOBO_VERSION_NAME } from "../../version";

type ShellScreen = "home" | "modes" | "saves" | "manager-saves" | "achievements" | "hall" | "hall-career" | "hall-card" | "settings" | "install" | "news" | "career" | "manager" | "legacy-tool";
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
          <small>{club?.shortName ?? "Categorias de base"} · {meta.position} · {meta.season}</small>
          <em>{(manager ? "Confiança " : "OVR ") + meta.overall} · {formatLastPlayed(meta.lastPlayedAt)}</em>
        </span>
        <span className={styles.saveArrow}><FutboboIcon name="arrow-right" /></span>
      </button>
      <button className={styles.deleteSave} type="button" aria-label={`Excluir carreira de ${meta.name}`} onClick={onDelete}>×</button>
    </article>
  );
}

export default function FutboboShell() {
  const [screen, setScreen] = useState<ShellScreen>("home");
  const [bootAction, setBootAction] = useState<BootAction>(null);
  const [saves, setSaves] = useState<CareerSaveMeta[]>([]);
  const [managerSaves, setManagerSaves] = useState<CareerSaveMeta[]>([]);
  const [unlocks, setUnlocks] = useState<GlobalAchievementUnlock[]>([]);
  const [hall, setHall] = useState<CareerHallEntry[]>([]);
  const [selectedHallEntry, setSelectedHallEntry] = useState<CareerHallEntry | null>(null);
  const [selectedAchievementId, setSelectedAchievementId] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const launchedCareerRef = useRef(false);
  const toolClickedRef = useRef(false);

  const refreshLibrary = () => {
    setSaves(listCareerSaves("player"));
    setManagerSaves(listCareerSaves("manager"));
    setUnlocks(listGlobalAchievementUnlocks());
    setHall(safeHall());
  };

  useEffect(() => {
    bootstrapCareerStorage();
    queueMicrotask(refreshLibrary);
  }, []);

  useEffect(() => {
    if (screen !== "career" && screen !== "manager") return;
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

  const playableSaves = useMemo(() => saves.filter((meta) => meta.phase !== "summary"), [saves]);
  const continueMeta = playableSaves[0] ?? null;
  const playableManagerSaves = useMemo(() => managerSaves.filter((meta) => meta.phase !== "summary"), [managerSaves]);
  const continueManagerMeta = playableManagerSaves[0] ?? null;
  const achievementMap = useMemo(() => new Map(unlocks.map((item) => [item.achievementId, item])), [unlocks]);
  const selectedAchievement = ACHIEVEMENTS.find((item) => item.id === selectedAchievementId) ?? null;
  const selectedUnlock = selectedAchievement ? achievementMap.get(selectedAchievement.id) : undefined;
  const hallRows = useMemo(() => hall
    .map((entry) => ({ entry, legacy: legacySummaryForHallEntry(entry) }))
    .sort((a, b) => b.legacy.score - a.legacy.score || b.entry.finishedAt - a.entry.finishedAt), [hall]);

  const launchExisting = (id: string) => {
    if (!activateCareerSlot(id)) return;
    launchedCareerRef.current = true;
    setBootAction("continue");
    setScreen("career");
  };

  const launchNew = () => {
    const slot = createCareerSlot("player");
    if (!slot) return;
    launchedCareerRef.current = true;
    setBootAction("new");
    setScreen("career");
    refreshLibrary();
  };

  const launchManagerExisting = (id: string) => {
    if (!activateCareerSlot(id)) return;
    setScreen("manager");
  };

  const launchManagerNew = () => {
    const slot = createCareerSlot("manager");
    if (!slot) return;
    setScreen("manager");
    refreshLibrary();
  };

  if (screen === "career") {
    return <div ref={hostRef} className={styles.careerHost}><CareerGame /></div>;
  }

  if (screen === "manager") {
    return <ManagerGame onExit={() => { syncActiveCareerSlot(); setScreen("home"); refreshLibrary(); }} />;
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
        {screen !== "home" && <button type="button" onClick={() => setScreen(screen === "saves" || screen === "manager-saves" ? "modes" : "home")}><FutboboIcon name="arrow-left" /> Voltar</button>}
      </header>

      {screen === "home" && (
        <section className={styles.home}>
          <div className={styles.heroLogo}><BrandMark size="hero" /><h1>FUTBOBO</h1><span>FAÇA SUA HISTÓRIA</span></div>
          <nav className={styles.mainActions} aria-label="Menu principal">
            <button type="button" className={styles.playButton} onClick={() => setScreen("modes")}><span><FutboboIcon name="play" /></span><strong>JOGAR</strong><b><FutboboIcon name="arrow-right" /></b></button>
            <button type="button" onClick={() => setScreen("settings")}><span><FutboboIcon name="settings" /></span>Configurações</button>
            <button type="button" onClick={() => setScreen("hall")}><span><FutboboIcon name="hall" /></span>Hall da Fama</button>
            <button type="button" onClick={() => setScreen("achievements")}><span><FutboboIcon name="medal" /></span>Conquistas</button>
            <button type="button" onClick={() => setScreen("install")}><span><FutboboIcon name="download" /></span>Instalar</button>
            <button type="button" onClick={() => setScreen("news")}><span><FutboboIcon name="news" /></span>Novidades</button>
          </nav>
        </section>
      )}

      {screen === "settings" && <SettingsScreen />}
      {screen === "install" && <InstallScreen />}
      {screen === "news" && <NewsScreen />}

      {screen === "modes" && (
        <section className={styles.panelScreen}>
          <header className={styles.panelHeading}><span>JOGAR</span><h2>Escolher seu futbobo.</h2><p>Carreira longa, copa rápida ou o sofá contra alguém.</p></header>
          <div className={styles.modeList}>
            <button type="button" className={styles.modeCard} onClick={() => setScreen("saves")}>
              <span className={styles.modeIndex}>01</span><div><small>MODO PRINCIPAL</small><strong>Rumo ao Estrelato</strong><p>Crie seu jogador do zero, ganhe títulos e prêmios individuais.</p></div><b><FutboboIcon name="arrow-right" /></b>
            </button>
            <button type="button" className={styles.modeCard} onClick={() => setScreen("manager-saves")}>
              <span className={styles.modeIndex}>02</span><div><small>MODO TÉCNICO</small><strong>Carreira de Técnico</strong><p>Escolha um clube, monte os cinco da mesa e decida quando trocar.</p></div><b><FutboboIcon name="arrow-right" /></b>
            </button>
            <Link className={styles.modeCard} href="/copa"><span className={styles.modeIndex}>03</span><div><small>PARTIDA RÁPIDA</small><strong>Copa do Mundo</strong><p>Jogue uma Copa do Mundo rápida com qualquer seleção.</p></div><b><FutboboIcon name="arrow-right" /></b></Link>
            <Link className={styles.modeCard} href="/x1"><span className={styles.modeIndex}>04</span><div><small>DOIS JOGADORES</small><strong>1x1 Local</strong><p>Jogue uma partida de futebol de botão contra o seu amigo.</p></div><b><FutboboIcon name="arrow-right" /></b></Link>
          </div>
        </section>
      )}

      {screen === "saves" && (
        <section className={styles.panelScreen}>
          <header className={styles.panelHeading}><span>RUMO AO ESTRELATO</span><h2>Suas carreiras.</h2><p>Até 10 histórias em andamento. Carreiras encerradas ficam guardadas no Hall da Fama.</p></header>
          <div className={styles.saveActions}>
            <button type="button" className={styles.continueButton} disabled={!continueMeta} onClick={() => continueMeta && launchExisting(continueMeta.id)}>
              <small>ÚLTIMA CARREIRA</small><strong>{continueMeta ? "Continuar carreira" : "Nenhuma carreira ainda"}</strong><span>{continueMeta ? `${continueMeta.name} · ${formatLastPlayed(continueMeta.lastPlayedAt)}` : "Crie seu primeiro jogador"}</span><b><FutboboIcon name="arrow-right" /></b>
            </button>
            <button type="button" className={styles.newButton} disabled={playableSaves.length >= 10} onClick={launchNew}><span>＋</span><strong>Nova carreira</strong><small>{playableSaves.length}/10 slots usados</small></button>
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

      {screen === "manager-saves" && (
        <section className={styles.panelScreen}>
          <header className={styles.panelHeading}><span>CARREIRA DE TÉCNICO</span><h2>Suas pranchetas.</h2><p>Até 10 projetos. Cada um guarda elenco, formação, confiança e os jogos que você comandou.</p></header>
          <div className={styles.saveActions}>
            <button type="button" className={styles.continueButton} disabled={!continueManagerMeta} onClick={() => continueManagerMeta && launchManagerExisting(continueManagerMeta.id)}>
              <small>ÚLTIMA PRANCHETA</small><strong>{continueManagerMeta ? "Continuar carreira" : "Nenhum projeto ainda"}</strong><span>{continueManagerMeta ? continueManagerMeta.name + " · " + formatLastPlayed(continueManagerMeta.lastPlayedAt) : "Escolha um clube e assine seu primeiro contrato"}</span><b><FutboboIcon name="arrow-right" /></b>
            </button>
            <button type="button" className={styles.newButton} disabled={playableManagerSaves.length >= 10} onClick={launchManagerNew}><span>＋</span><strong>Nova carreira</strong><small>{playableManagerSaves.length}/10 slots usados</small></button>
          </div>
          <div className={styles.saveGrid}>
            {playableManagerSaves.map((meta) => <SaveCard key={meta.id} meta={meta} onPlay={() => launchManagerExisting(meta.id)} onDelete={() => setConfirmDeleteId(meta.id)} />)}
          </div>
          {confirmDeleteId && (
            <div className={styles.confirmOverlay} role="dialog" aria-modal="true">
              <div><span>EXCLUIR PRANCHETA</span><strong>Esse projeto vai desaparecer do aparelho.</strong><p>O modo jogador e as conquistas globais não são afetados.</p><footer><button type="button" onClick={() => setConfirmDeleteId("")}>Cancelar</button><button type="button" className={styles.danger} onClick={() => { deleteCareerSlot(confirmDeleteId); setConfirmDeleteId(""); refreshLibrary(); }}>Excluir</button></footer></div>
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

      <footer className={styles.footer}>
        <div><span><FutboboIcon name="career" /> {CLUBS.length} clubes</span><span><FutboboIcon name="player" /> 12 posições</span><span><FutboboIcon name="trophy" /> {LEAGUES.length} ligas</span><span><FutboboIcon name="globe" /> {COUNTRIES.length} seleções</span></div>
        <strong>{FUTBOBO_VERSION} · {FUTBOBO_VERSION_NAME}</strong>
      </footer>
    </main>
  );
}
