"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CareerHallEntry } from "../../career/model";
import { HALL_OF_FAME_KEY } from "../../career/storage-keys";
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
import { ACHIEVEMENTS } from "../../achievements";
import { legacySummaryForHallEntry } from "../../career/legacy-prestige";
import CareerAccessDialog from "./CareerAccessDialog";
import styles from "./FutboboShell.module.css";
import FutboboIcon from "../FutboboIcon";
import { albumStyles } from "../career/album/AlbumShell";
import HomeSpread, { type MenuScreen } from "../career/album/menu/HomeSpread";
import { AchievementsSpread, DeleteCareerSheet, HallSpread, OtherGames, PaperScreen } from "../career/album/menu/MenuSpreads";

/*
 * O menu inicial não carrega a carreira. Antes o pacote da home trazia o CareerGame inteiro
 * (simulação, eventos, partida de botão, abas do álbum): ~2 MB de JavaScript para o celular
 * analisar antes de mostrar o menu. Agora a carreira, a prévia do Hall e as telas de
 * Configurações/Instalar/Novidades baixam quando abrem; tocar na área da carreira já começa a baixar.
 */
const loadCareerGame = () => import("../career/CareerGame");

function CareerLoading() {
  return (
    <section className={`${albumStyles.tokens} ${albumStyles.waitPage} albumMounted`} aria-busy="true" data-career-loading="">
      <div><p>Abrindo o álbum…</p></div>
    </section>
  );
}

function PaperLoading() {
  return <p className={styles.paperLoading} aria-busy="true">Carregando…</p>;
}

const CareerGame = dynamic(loadCareerGame, { ssr: false, loading: CareerLoading });
const HallCareerViewer = dynamic(() => import("../career/HallCareerViewer"), { ssr: false, loading: CareerLoading });
const SettingsScreen = dynamic(() => import("./ShellUtilityScreens").then((screens) => screens.SettingsScreen), { ssr: false, loading: PaperLoading });
const InstallScreen = dynamic(() => import("./ShellUtilityScreens").then((screens) => screens.InstallScreen), { ssr: false, loading: PaperLoading });
const NewsScreen = dynamic(() => import("./ShellUtilityScreens").then((screens) => screens.NewsScreen), { ssr: false, loading: PaperLoading });

let careerPreload: Promise<unknown> | null = null;
/** Começa a baixar a carreira antes do toque terminar (o pacote fica em cache para o dynamic). */
function preloadCareer() {
  careerPreload ??= loadCareerGame().catch(() => {
    careerPreload = null;
  });
}

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

export default function FutboboShell() {
  const [screen, setScreen] = useState<ShellScreen>("home");
  const [bootAction, setBootAction] = useState<BootAction>(null);
  const [saves, setSaves] = useState<CareerSaveMeta[]>([]);
  const [unlocks, setUnlocks] = useState<GlobalAchievementUnlock[]>([]);
  const [hall, setHall] = useState<CareerHallEntry[]>([]);
  const [selectedHallEntry, setSelectedHallEntry] = useState<CareerHallEntry | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [accessDialog, setAccessDialog] = useState<"new" | CareerSaveMeta | null>(null);
  const [bobonlineRoom, setBobonlineRoom] = useState<{ code: string } | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const launchedCareerRef = useRef(false);
  const toolClickedRef = useRef(false);

  const refreshLibrary = () => {
    setSaves(listCareerSaves("player"));
    setUnlocks(listGlobalAchievementUnlocks());
    setHall(safeHall());
  };

  useEffect(() => {
    bootstrapCareerStorage();
    queueMicrotask(refreshLibrary);
  }, []);

  // Durante a carreira só copia o save para o slot. A biblioteca do menu (saves, conquistas, Hall)
  // é relida ao sair: antes ela era relida e posta no estado a cada 850 ms, e cada vez o shell
  // renderizava a carreira inteira de novo (o engasgo periódico com o álbum parado).
  useEffect(() => {
    if (screen !== "career") return;
    const sync = () => syncActiveCareerSlot();
    const interval = window.setInterval(sync, 850);
    const onVisibility = () => { if (document.visibilityState === "hidden") sync(); };
    window.addEventListener("beforeunload", sync);
    window.addEventListener("pagehide", sync);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", sync);
      window.removeEventListener("pagehide", sync);
      document.removeEventListener("visibilitychange", onVisibility);
      sync();
      refreshLibrary();
    };
  }, [screen]);

  // Tocar na área da carreira (continuar, figurinha, nova carreira) já começa a baixar o álbum.
  useEffect(() => {
    if (screen !== "home") return;
    const warm = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-career-intent]")) preloadCareer();
    };
    document.addEventListener("pointerdown", warm, { capture: true, passive: true });
    document.addEventListener("keydown", warm, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", warm, { capture: true });
      document.removeEventListener("keydown", warm, { capture: true });
    };
  }, [screen]);

  useEffect(() => {
    if (accessDialog) preloadCareer();
  }, [accessDialog]);

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
      // O pacote da carreira ainda está baixando: nada para olhar (e a ação pedida continua de pé).
      if (host.querySelector("[data-career-loading]")) return;
      const welcome = host.querySelector<HTMLElement>(".welcome-screen");
      if (!welcome) {
        if (screen === "career" && bootAction !== null) setBootAction(null);
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

    // Só o que muda a resposta: nós entrando/saindo, a classe (tela de boas-vindas) e o "disabled"
    // do botão de continuar. Antes qualquer atributo (estilos inline das animações) disparava a busca.
    const observer = new MutationObserver(inspect);
    observer.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "disabled"] });
    inspect();
    return () => observer.disconnect();
  }, [bootAction, screen]);

  // Sala do Bobonline ainda válida (fechou o app no meio): um toque leva de volta (§1.10).
  useEffect(() => {
    if (screen !== "home") return;
    // A espiada vem num pedaço próprio: a home não paga o storage do Bobonline no pacote de cara.
    void import("../../bobonline/net/session-peek").then((peek) => setBobonlineRoom(peek.peekBobonlineSession()), () => undefined);
  }, [screen]);

  // O mesmo elemento entre renders do shell: o React não re-renderiza a carreira por causa dele.
  const careerElement = useMemo(() => <CareerGame />, []);
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
    return <div ref={hostRef} className={styles.careerHost}>{careerElement}</div>;
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
