"use client";

// Bobonline: botão online entre aparelhos (P2P). Uma página só, com uma máquina de telas.
//
// Fora da sala a tela é escolha da pessoa (início, criar, entrar, Meus times, editor).
// Dentro da sala a tela sai do estado da sala: a minha partida manda em tudo, depois
// quem assiste, depois o resultado da última partida que joguei, e por fim lobby,
// chave ou campeão pelo estágio. Toda troca de tela vira uma entrada no histórico, e
// o voltar do Android (que é o history.back do WebView) cai no voltar da tela atual.

import Link from "next/link";
import { Component, Suspense, lazy, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { BotaoMatchResult } from "../botao/types";
import { BOB_PROTOCOL } from "./protocol";
import { extractLinkHost, extractRoomCode } from "./net/codes";
import { clearSession, cryptoAvailable, loadSession, type SavedSession } from "./net/identity";
import { loadNetConfig, type NetConfig } from "./net/net-config";
import { acquireTabLock, type TabLock } from "./net/tab-lock";
import { devProfile } from "./storage";
import TeamsScreen from "./teams/TeamsScreen";
import TeamEditor from "./teams/TeamEditor";
import { ConfirmSheet, TeamsToastHost } from "./teams/TeamCodeSheet";
import { getBobStoreSnapshot, markHint, setNickname, useBobProfile, useBobTeams } from "./teams/team-storage";
import { nextMatchFor } from "./tournament/bracket";
import type { RoomClientState } from "./room/room-api";
import {
  ROOM_SCREENS,
  historyDepth,
  leaveBobonlineHistory,
  listenBack,
  markBaseEntry,
  pushScreen,
  replaceScreen,
  replaceUrl,
  runScreenBack,
  type BackEvent,
  type Screen,
} from "./screen-history";
import {
  autoResumeAllowed,
  bracketMatchOf,
  cancelAttempt,
  closeRoom,
  createRoom,
  deadClientNotice,
  getRoomView,
  joinErrorText,
  joinRoom,
  leaveRoom,
  opponentLabel,
  resumeRoom,
  roomClient,
  roundKeyOf,
  useRoomView,
  type RoomView,
} from "./use-room";
import { effectiveView, prefetch3d, prefetchDriver, useViewPref, useWebglAvailable, writeViewPref } from "./view-pref";
import { isNativeAndroid, keepAwake } from "./wake-lock";
import BracketScreen from "./screens/BracketScreen";
import ChampionScreen from "./screens/ChampionScreen";
import CreateRoomScreen, { DEFAULT_CREATE_DRAFT, type CreateDraft } from "./screens/CreateRoomScreen";
import HomeScreen from "./screens/HomeScreen";
import JoinRoomScreen, { EMPTY_JOIN_DRAFT, type JoinDraft } from "./screens/JoinRoomScreen";
import LobbyScreen from "./screens/LobbyScreen";
import NextMatchBanner, { RoomToasts } from "./screens/NextMatchBanner";
import OtherTabScreen from "./screens/OtherTabScreen";
import "./bobonline.css";

// A mesa (BotaoMatch, motor, desenho) só baixa quando a sala existe: a home do Bobonline fica leve no celular.
const loadMatchScreen = () => import("./screens/MatchScreen");
const loadResultScreen = () => import("./screens/ResultScreen");
const MatchScreen = lazy(loadMatchScreen);
const ResultScreen = lazy(loadResultScreen);

type LocalScreen = "home" | "create" | "join" | "teams" | "editor";
type Nav = {
  screen: LocalScreen;
  teamsMode: "manage" | "pick";
  /** Para onde Meus times volta ("room": aberto do lobby, por cima da sala). */
  teamsBack: "home" | "create" | "join" | "room";
  editorId: string | null;
};
type TabState = "pending" | "ok" | "blocked" | "lost";
type Confirm = "leave" | "forfeit" | null;

const HOME: Nav = { screen: "home", teamsMode: "manage", teamsBack: "home", editorId: null };
/** Resultado na sala sem o onFinish da partida (partida travada): mostra o resultado mesmo assim. */
const RESULT_FALLBACK_MS = 8000;
const STAGE_NOTICE = "As mudanças valem para a próxima sala. O torneio usa o time como estava no início.";
const URL_PARAMS = ["sala", "p", "h", "voltar"];

const subscribeNothing = () => () => {};
const serverTrue = () => true;

function inRoomOf(room: RoomView): room is RoomView & { state: RoomClientState } {
  return room.state?.phase === "in-room" && room.state.snapshot !== null;
}

/** O endereço sem ?sala=, ?p=, ?h= e ?voltar= (lidos uma vez); os parâmetros de teste ficam. */
function cleanedUrl(): string | undefined {
  const url = new URL(window.location.href);
  if (!URL_PARAMS.some((key) => url.searchParams.has(key))) return undefined;
  for (const key of URL_PARAMS) url.searchParams.delete(key);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** O campo em foco grava no blur (o apelido de Meus times): solta o foco antes de a tela sumir. */
function blurFocused() {
  const focused = document.activeElement;
  if (focused instanceof HTMLElement) focused.blur();
}

/**
 * No lobby, manda de novo para a sala o time em uso (e o apelido, se mudou). Fora do lobby
 * não faz nada: o torneio usa o time como estava no início (§1.2).
 */
function publishTeam(sentNickname: { current: string | null }) {
  const client = roomClient();
  if (!client || getRoomView().state?.snapshot?.stage !== "lobby") return;
  const store = getBobStoreSnapshot();
  client.setTeam(store.active);
  if (store.profile.nickname !== sentNickname.current) {
    client.setNickname(store.profile.nickname);
    sentNickname.current = store.profile.nickname;
  }
}

/**
 * O APK mais novo: o mesmo endereço de ANDROID_APK_URL em ../android-app (o teste de rota confere),
 * repetido para o Bobonline não dividir aquele módulo com o menu. É o arquivo que o
 * checkForAndroidUpdate acharia: a última versão publicada.
 */
const ANDROID_APK_URL = "https://github.com/erereck/futbobo/releases/latest/download/futbobo.apk";

async function updateApp() {
  if (isNativeAndroid()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: ANDROID_APK_URL });
    return;
  }
  window.location.reload();
}

/**
 * Rede de segurança das telas: um erro de desenho (um quadro estranho da sala, por exemplo) não derruba a
 * página inteira na tela de exceção do Next. A sala vive fora da página (use-room.ts): "Tentar de novo"
 * redesenha as telas e volta para onde estava. Aqui e não num error.tsx: um arquivo de rota a mais
 * reparte os pedaços que o "/" divide com o Bobonline (e o "/" passava do orçamento do §11.6).
 */
class ScreensBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[bobonline] tela", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="bob-shell" data-screen="error">
        <header className="bob-brand">
          <Link href="/">FUTBOBO</Link>
          <span>BOBONLINE</span>
        </header>
        <section className="bob-other-tab" aria-labelledby="bob-error-title" data-testid="bob-error">
          <span className="bob-eyebrow">ALGO DEU ERRADO</span>
          <h1 id="bob-error-title">A tela do Bobonline travou.</h1>
          <p className="bob-hint">Se você estava numa sala, ela continua aberta: tente de novo para voltar a ela.</p>
          <div className="bob-cta">
            <button type="button" className="primary-button" onClick={() => this.setState({ failed: false })}>Tentar de novo</button>
            <Link className="secondary-button bob-link-button" href="/">Voltar ao início</Link>
          </div>
        </section>
      </main>
    );
  }
}

export default function BobonlinePage() {
  return (
    <ScreensBoundary>
      <BobonlineScreens />
    </ScreensBoundary>
  );
}

function BobonlineScreens() {
  const { active, ready } = useBobTeams();
  const { profile } = useBobProfile();
  const room = useRoomView();
  const storedView = useViewPref();
  const webgl = useWebglAvailable();
  const cryptoOk = useSyncExternalStore(subscribeNothing, cryptoAvailable, serverTrue);

  const [nav, setNav] = useState<Nav>(HOME);
  const [tab, setTab] = useState<TabState>("pending");
  const [stealing, setStealing] = useState(false);
  const [saved, setSaved] = useState<SavedSession | null>(null);
  const [netConfig, setNetConfig] = useState<NetConfig | null>(null);
  const [linkProtocol, setLinkProtocol] = useState(0);
  const [createDraft, setCreateDraft] = useState<CreateDraft>(DEFAULT_CREATE_DRAFT);
  const [joinDraft, setJoinDraft] = useState<JoinDraft>(EMPTY_JOIN_DRAFT);
  const [finished, setFinished] = useState<Record<string, BotaoMatchResult>>({});
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [forced, setForced] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [homeNotice, setHomeNotice] = useState<string | null>(null);
  /** A rodada (sala + sorteio) a que `finished`, `dismissed` e `forced` pertencem. */
  const [seenRound, setSeenRound] = useState<string | null>(null);

  const lockRef = useRef<TabLock | null>(null);
  const resumeWantedRef = useRef(false);
  /** Código do ?sala= aberto (link de um amigo): a volta automática não passa por cima dele. */
  const linkCodeRef = useRef<string | null>(null);
  /** O anfitrião que o link trouxe (&h=): a busca dessa sala só aceita a resposta dele no começo. */
  const linkHostRef = useRef<string | null>(null);
  const sentNicknameRef = useRef<string | null>(null);
  const lastScreenRef = useRef<Screen | null>(null);
  const fromPopRef = useRef(false);
  const backRef = useRef<(event: BackEvent) => void>(() => {});
  const wasInRoomRef = useRef(false);
  const devRef = useRef<Record<string, unknown>>({});

  const state = room.state;
  const inRoom = inRoomOf(room);
  const snapshot = inRoom ? room.state.snapshot : null;
  const duel = inRoom ? room.state.duel : null;
  const connecting = room.loading || state?.phase === "connecting";
  const roomError = room.failure ?? (state?.phase === "error" ? state.error : null);
  const view = effectiveView(storedView);

  // ——— Torneio novo na mesma sala (ou outra sala): as partidas repetem o id da chave, então os
  // resultados e as dispensas da rodada anterior saem antes de a tela ser escolhida ———
  const round = roundKeyOf(snapshot);
  if (round !== null && round !== seenRound) {
    setSeenRound(round);
    if (seenRound !== null) {
      setFinished({});
      setDismissed([]);
      setForced([]);
    }
  }

  // ——— A partida que acabou e a tela de resultado ———
  const played = inRoom ? room.lastPlayed : null;
  const playedMatch = played ? bracketMatchOf(state, played.bracketId) : null;
  const playedResult = played && playedMatch?.status === "done" && playedMatch.result?.matchId === played.matchId ? playedMatch.result : null;
  const showResult = Boolean(
    played && !dismissed.includes(played.matchId) && (
      finished[played.matchId] !== undefined ||
      (playedResult && (duel?.matchId !== played.matchId || playedResult.decision === "walkover" || forced.includes(played.matchId)))
    ),
  );
  const myMatchOpen = Boolean(duel && duel.role !== "spectator" && !dismissed.includes(duel.matchId) && finished[duel.matchId] === undefined && !(showResult && played?.matchId === duel.matchId));

  // ——— Qual tela ———
  let screen: Screen;
  if (tab === "blocked" || tab === "lost" || state?.phase === "superseded") screen = "other-tab";
  else if (inRoom && snapshot) {
    if (myMatchOpen) screen = "match";
    else if (duel?.role === "spectator") screen = "spectate";
    else if (showResult) screen = "result";
    else if (nav.teamsBack === "room" && (nav.screen === "teams" || nav.screen === "editor")) screen = nav.screen;
    else if (snapshot.stage === "lobby") screen = "lobby";
    else if (snapshot.stage === "done" && snapshot.settings.format !== "x1") screen = "champion";
    else screen = "bracket";
  } else screen = nav.screen;

  // ——— Ações ———
  function startSavedSession() {
    const session = loadSession();
    setSaved(session);
    if (!session) return;
    const current = getRoomView();
    // Voltou pelo menu com a sala ainda viva nesta página: nada a refazer.
    if (current.loading || current.state?.phase === "in-room") return;
    // Link de outra sala: fica na tela de entrar; o aviso da sessão salva oferece "Voltar para a sala".
    if (autoResumeAllowed(session, { wanted: resumeWantedRef.current, linkCode: linkCodeRef.current })) beginResume(session);
  }

  function beginResume(session: SavedSession) {
    const store = getBobStoreSnapshot();
    sentNicknameRef.current = store.profile.nickname;
    setHomeNotice(null);
    void resumeRoom(session, { team: store.active, nickname: store.profile.nickname });
  }

  function goHome() {
    if (!inRoom && room.attempt?.kind !== "resume") void closeRoom();
    setNav(HOME);
  }

  function closeTeamsOverlay() {
    publishTeam(sentNicknameRef);
    setNav(HOME);
  }

  function teamsBackTarget(back: Nav["teamsBack"]) {
    if (back === "room") closeTeamsOverlay();
    else setNav({ ...HOME, screen: back });
  }

  function submitCreate(nickname: string) {
    const name = setNickname(nickname);
    sentNicknameRef.current = name;
    setCreateDraft((draft) => ({ ...draft, nickname: null }));
    const store = getBobStoreSnapshot();
    void createRoom({
      team: store.active,
      nickname: name,
      settings: {
        format: createDraft.format,
        rules: createDraft.rules,
        cpuLevel: createDraft.cpuLevel,
        fillWithCpu: createDraft.fillWithCpu,
        allowSpectators: createDraft.allowSpectators,
        locked: createDraft.password !== "",
      },
      password: createDraft.password || undefined,
    });
  }

  function submitJoin(code: string, nickname: string, asSpectator = false, pastedHost: string | null = null) {
    const name = setNickname(nickname);
    sentNicknameRef.current = name;
    setJoinDraft((draft) => ({ ...draft, code, nickname: null }));
    const store = getBobStoreSnapshot();
    // O id do anfitrião só vale para a sala do link (colado agora, ou o ?sala= aberto).
    const hostId = pastedHost ?? (code === linkCodeRef.current ? linkHostRef.current : null);
    void joinRoom({
      code, team: store.active, nickname: name, password: joinDraft.password || undefined,
      ...(asSpectator ? { asSpectator: true } : {}), ...(hostId ? { hostId } : {}),
    });
  }

  async function confirmLeave() {
    setConfirm(null);
    await leaveRoom();
    setSaved(null);
    setNav(HOME);
    setDismissed([]);
    setFinished({});
  }

  function takeOverTab() {
    const lock = lockRef.current;
    if (!lock) return;
    setStealing(true);
    lock.steal().then((granted) => {
      setStealing(false);
      if (!granted) return;
      setTab("ok");
      startSavedSession();
    });
  }

  // ——— Ao montar: parâmetros do link, trava de aba, net.json ———
  useEffect(() => {
    // O cliente da sala vive fora da página: se morreu com ela fechada (removido, outra aba tomou a
    // sessão, erro), ou se a última tentativa falhou, larga tudo e avisa no início, sem erro velho nas telas.
    const leftover = getRoomView();
    const leftoverNotice = leftover.loading ? undefined : deadClientNotice(leftover.state);
    if (leftoverNotice !== undefined || (!leftover.loading && leftover.failure)) {
      void closeRoom();
      if (leftoverNotice) queueMicrotask(() => setHomeNotice(leftoverNotice));
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get("sala");
    const protocol = Number(params.get("p") ?? 0);
    const wantsResume = params.get("voltar") === "1";
    linkCodeRef.current = code ? extractRoomCode(code) ?? code.toUpperCase() : null;
    linkHostRef.current = code ? extractLinkHost(window.location.search) : null;
    if (code) {
      queueMicrotask(() => {
        setJoinDraft((draft) => ({ ...draft, code: code.toUpperCase() }));
        setLinkProtocol(Number.isFinite(protocol) ? protocol : 0);
        setNav({ ...HOME, screen: "join" });
      });
    }
    resumeWantedRef.current = wantsResume;

    let disposed = false;
    let lock: TabLock | null = null;
    acquireTabLock().then((acquired) => {
      if (disposed) {
        acquired.release();
        return;
      }
      lock = acquired;
      lockRef.current = acquired;
      acquired.onLost = () => {
        void closeRoom();
        setTab("lost");
      };
      if (!acquired.granted) {
        setTab("blocked");
        return;
      }
      setTab("ok");
      startSavedSession();
    });
    loadNetConfig().then((config) => {
      if (!disposed) setNetConfig(config);
    }).catch(() => {});
    return () => {
      disposed = true;
      lock?.release();
      lockRef.current = null;
    };
    // startSavedSession só lê módulos (sessão salva, times, sala): roda uma vez, na montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ——— Histórico: base na primeira tela, uma entrada por troca ———
  useEffect(() => {
    if (lastScreenRef.current === screen) return;
    if (lastScreenRef.current === null) {
      lastScreenRef.current = screen;
      markBaseEntry(screen);
      const url = cleanedUrl();
      if (url !== undefined) setTimeout(() => replaceUrl(url), 0);
      return;
    }
    const previous = lastScreenRef.current;
    lastScreenRef.current = screen;
    // O editor fechou (Voltar dele ou voltar do aparelho): no lobby o time em uso vai de novo para a
    // sala (§1.2). Daqui, e não do onBack, porque o desmonte do editor grava o rascunho pendente
    // antes dos efeitos da página.
    if (previous === "editor") publishTeam(sentNicknameRef);
    if (fromPopRef.current) {
      fromPopRef.current = false;
      replaceScreen(screen);
      return;
    }
    pushScreen(screen);
    queueMicrotask(() => {
      // Tela nova: nenhuma confirmação da anterior fica aberta por cima.
      setConfirm(null);
      // A partida começou com Meus times/editor abertos por cima da sala: fecham de vez
      // (senão voltariam a aparecer no lugar da chave depois do resultado).
      if (screen === "match") setNav((value) => (value.teamsBack === "room" ? HOME : value));
    });
  }, [screen]);

  useEffect(() => listenBack((event) => backRef.current(event)), []);

  // ——— Sala: tela acesa, downloads adiantados, saída por fora ———
  useEffect(() => {
    keepAwake(inRoom);
    if (inRoom) {
      void loadMatchScreen().catch(() => {});
      void loadResultScreen().catch(() => {});
      prefetchDriver();
      if (view === "3d") prefetch3d();
    }
  }, [inRoom, view]);

  useEffect(() => () => keepAwake(false), []);

  useEffect(() => {
    const was = wasInRoomRef.current;
    wasInRoomRef.current = inRoom;
    if (!was || inRoom) return;
    const phase = state?.phase;
    // "superseded" fica na tela de outra aba (§1); ao voltar para a página, a montagem larga o cliente.
    if (phase !== "left" && phase !== "error") return;
    // Removido, sala encerrada ou erro sem volta: o cliente morreu; volta para o início.
    const notice = state?.error === "removido" ? joinErrorText("removido") : null;
    queueMicrotask(() => {
      setNav(HOME);
      setSaved(null);
      setHomeNotice(notice);
    });
    void closeRoom();
  }, [inRoom, state?.phase, state?.error]);

  // Resultado já na sala e a partida não terminou aqui (travou, ou o W.O. veio de fora): não prende na partida.
  const stuckMatchId = duel && playedResult && duel.matchId === playedResult.matchId && finished[duel.matchId] === undefined ? duel.matchId : null;
  useEffect(() => {
    if (!stuckMatchId) return;
    const timer = setTimeout(() => setForced((list) => (list.includes(stuckMatchId) ? list : [...list, stuckMatchId])), RESULT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [stuckMatchId]);

  // O voltar do aparelho, sempre com a versão mais nova do estado (o ouvinte é registrado uma vez).
  useEffect(() => {
    backRef.current = (event: BackEvent) => {
      const current = lastScreenRef.current ?? "home";
      if (current === "spectate") {
        fromPopRef.current = true;
        roomClient()?.stopSpectating();
        return;
      }
      if (ROOM_SCREENS.has(current)) {
        // Dentro da sala o voltar não sai: devolve a entrada e pergunta.
        pushScreen(current);
        setConfirm((open) => (open ? null : current === "match" ? "forfeit" : "leave"));
        return;
      }
      if (current === "home" || current === "other-tab") {
        leaveBobonlineHistory(event.depth);
        return;
      }
      if (current === "editor" || current === "teams") {
        // A tela usa o voltar primeiro (fecha uma folha aberta, pergunta antes de largar uma mudança
        // inválida): aí a entrada volta e a tela fica.
        if (runScreenBack()) {
          pushScreen(current);
          return;
        }
        blurFocused();
      }
      fromPopRef.current = true;
      if (current === "editor") setNav((value) => ({ ...value, screen: "teams" }));
      else if (current === "teams") teamsBackTarget(nav.teamsBack);
      else {
        if (connecting && !inRoom) void cancelAttempt();
        goHome();
      }
    };
  });

  // Ganchos de teste (só com ?perfil num endereço local com porta): window.__bobonline.
  useEffect(() => {
    devRef.current = { screen, tab, nav, confirm, view };
  });
  useEffect(() => {
    if (devProfile() === null) return;
    const target = window as unknown as { __bobonline?: unknown };
    // Só dados (o CDP devolve por valor): o duelo vai resumido, sem o link e o driver, que têm ciclos.
    const duelInfo = () => {
      const handle = roomClient()?.getState().duel;
      if (!handle) return null;
      const { launch } = handle;
      const team = (side: "userTeam" | "cpuTeam") => ({ shortName: launch.setup[side].shortName, primary: launch.setup[side].primary, secondary: launch.setup[side].secondary });
      return {
        bracketId: handle.bracketId, matchId: handle.matchId, role: handle.role, perspective: launch.perspective,
        controls: launch.controls, names: launch.names, teams: { user: team("userTeam"), cpu: team("cpuTeam") },
      };
    };
    const roomInfo = () => {
      const current = roomClient()?.getState();
      return current ? { ...current, duel: duelInfo() } : null;
    };
    target.__bobonline = {
      state: () => ({ ...devRef.current, depth: historyDepth() }),
      room: roomInfo,
      duel: duelInfo,
      view: () => {
        const current = getRoomView();
        return { ...current, state: current.state ? roomInfo() : null };
      },
      simulateBackground: (ms: number) => roomClient()?.simulateBackground?.(ms),
    };
    return () => {
      delete target.__bobonline;
    };
  }, []);

  // ——— Desenho ———
  const confirmSheet = renderConfirm();

  if ((screen === "match" || screen === "spectate") && duel && state) {
    return (
      <>
        <Suspense fallback={<main className="bob-match-loading" aria-busy="true"><p><span className="bob-spinner" aria-hidden="true" />Preparando a partida…</p></main>}>
          <MatchScreen
            key={duel.matchId}
            duel={duel}
            view={view}
            leaveHint={!profile.hints.leaveApp}
            onFinish={(result) => setFinished((map) => ({ ...map, [duel.matchId]: result }))}
            onForfeit={() => roomClient()?.forfeit(duel.bracketId)}
            onLeave={() => roomClient()?.stopSpectating()}
            onHintSeen={() => markHint("leaveApp")}
          />
        </Suspense>
        {duel.role === "spectator" && (
          // Assistindo: o "pronto?" da minha próxima partida aparece por cima da mesa (§1: toda tela menos a partida).
          <div className="bob-match-banner"><NextMatchBanner state={state} /></div>
        )}
        <RoomToasts toasts={state.toasts} matchOpen />
        {confirmSheet}
      </>
    );
  }

  return (
    <main className="bob-shell" data-screen={screen}>
      <header className="bob-brand">
        <Link href="/">FUTBOBO</Link>
        <span>BOBONLINE</span>
      </header>
      {inRoom && (
        // A faixa da próxima partida gruda no topo; os avisos da sala saem logo abaixo dela (ou da marca).
        <div className="bob-top-stack">
          <NextMatchBanner state={room.state} />
          <RoomToasts toasts={room.state.toasts} matchOpen={false} />
        </div>
      )}
      {renderScreen()}
      {screen !== "teams" && screen !== "editor" && <TeamsToastHost />}
      {confirmSheet}
    </main>
  );

  function renderScreen() {
    switch (screen) {
      case "other-tab":
        return <OtherTabScreen mode={tab === "blocked" ? "blocked" : "lost"} busy={stealing} onUseHere={takeOverTab} />;
      case "teams":
        return (
          <TeamsScreen
            mode={nav.teamsMode}
            stageNotice={snapshot && snapshot.stage !== "lobby" ? STAGE_NOTICE : undefined}
            onBack={() => teamsBackTarget(nav.teamsBack)}
            onPicked={() => teamsBackTarget(nav.teamsBack)}
            onEdit={(teamId) => setNav((value) => ({ ...value, screen: "editor", editorId: teamId }))}
          />
        );
      case "editor":
        return (
          <TeamEditor
            key={nav.editorId ?? "time"}
            teamId={nav.editorId ?? active.id}
            stageNotice={snapshot && snapshot.stage !== "lobby" ? STAGE_NOTICE : undefined}
            onBack={() => setNav((value) => ({ ...value, screen: "teams" }))}
          />
        );
      case "create":
        return (
          <CreateRoomScreen
            team={active}
            profileNickname={profile.nickname}
            draft={createDraft}
            busy={connecting && room.attempt?.kind === "create"}
            error={room.attempt?.kind === "create" ? roomError : null}
            onDraft={(patch) => setCreateDraft((draft) => ({ ...draft, ...patch }))}
            onPickTeam={() => setNav({ ...HOME, screen: "teams", teamsMode: "pick", teamsBack: "create" })}
            onBack={goHome}
            onSubmit={submitCreate}
          />
        );
      case "join": {
        const joining = room.attempt?.kind === "join";
        const error = joining ? roomError : null;
        const newer = (netConfig?.latestProtocol ?? 0) > BOB_PROTOCOL;
        const shownError = error === "nao-encontrada" && newer ? "versao-nova" : error;
        return (
          <JoinRoomScreen
            team={active}
            profileNickname={profile.nickname}
            draft={joinDraft}
            searching={connecting && joining}
            startedAt={room.startedAt}
            joinStage={joining && state ? state.joinStage : 0}
            error={shownError}
            errorFormat={state?.snapshot?.settings.format ?? null}
            canSpectate={state?.snapshot?.settings.allowSpectators ?? true}
            incompatible={joining ? state?.incompatible ?? null : null}
            linkTooNew={linkProtocol > BOB_PROTOCOL}
            passwordAsked={joinDraft.password !== ""}
            onDraft={(patch) => setJoinDraft((draft) => ({ ...draft, ...patch }))}
            onSubmit={(code, nickname, hostId) => submitJoin(code, nickname, false, hostId)}
            onSpectate={(code, nickname, hostId) => submitJoin(code, nickname, true, hostId)}
            onCancel={() => void cancelAttempt()}
            onPickTeam={() => setNav({ ...HOME, screen: "teams", teamsMode: "pick", teamsBack: "join" })}
            onBack={() => {
              if (connecting) void cancelAttempt();
              goHome();
            }}
            onUpdate={() => void updateApp()}
          />
        );
      }
      case "lobby":
        return room.state ? (
          <LobbyScreen
            state={room.state}
            onTeams={() => setNav({ ...HOME, screen: "teams", teamsMode: "pick", teamsBack: "room" })}
            onLeave={() => setConfirm("leave")}
          />
        ) : null;
      case "bracket":
        return room.state ? <BracketScreen state={room.state} onLeave={() => setConfirm("leave")} /> : null;
      case "result":
        return room.state && played ? (
          <Suspense fallback={<p className="bob-hint"><span className="bob-spinner" aria-hidden="true" />Fechando o placar…</p>}>
            <ResultScreen
            state={room.state}
            played={played}
            local={finished[played.matchId] ?? null}
            onSeeBracket={() => {
              roomClient()?.leftResultScreen(played.bracketId);
              setDismissed((list) => [...list, played.matchId]);
            }}
            onBackToLobby={() => setDismissed((list) => [...list, played.matchId])}
            />
          </Suspense>
        ) : null;
      case "champion":
        return room.state ? <ChampionScreen state={room.state} onHome={() => void confirmLeave()} /> : null;
      default: {
        const resumeAttempt = room.attempt?.kind === "resume";
        return (
          <HomeScreen
            team={active}
            nickname={profile.nickname}
            ready={ready}
            cryptoOk={cryptoOk}
            notice={homeNotice ?? netConfig?.notice ?? null}
            saved={saved ? {
              code: saved.code,
              resuming: resumeAttempt && connecting,
              error: resumeAttempt && roomError ? joinErrorText(roomError) : null,
            } : null}
            view={view}
            webgl={webgl}
            onTeams={() => setNav({ ...HOME, screen: "teams", teamsMode: "manage", teamsBack: "home" })}
            onCreate={() => setNav({ ...HOME, screen: "create" })}
            onJoin={() => setNav({ ...HOME, screen: "join" })}
            onResume={() => saved && beginResume(saved)}
            onDiscard={() => {
              clearSession();
              setSaved(null);
              if (resumeAttempt) void closeRoom();
            }}
            onCancelResume={() => void closeRoom()}
            onView={writeViewPref}
          />
        );
      }
    }
  }

  function renderConfirm() {
    if (!confirm || !inRoom || !room.state) return null;
    const current = room.state;
    if (confirm === "forfeit" && duel && duel.role !== "spectator") {
      const match = bracketMatchOf(current, duel.bracketId);
      const other = match ? (match.home?.entrantId === current.me ? match.away : match.home) : null;
      const opponent = other ? opponentLabel(current, other.entrantId) : "O adversário";
      const opponentTitle = opponent === "a CPU" ? "A CPU" : opponent;
      return (
        <ConfirmSheet
          title="Desistir da partida?"
          detail={`${opponentTitle} vence por W.O.`}
          confirmLabel="Desistir"
          cancelLabel="Continuar jogando"
          danger
          onConfirm={() => {
            setConfirm(null);
            roomClient()?.forfeit(duel.bracketId);
          }}
          onCancel={() => setConfirm(null)}
        />
      );
    }
    const bracket = current.snapshot?.bracket ?? null;
    const running = current.snapshot?.stage === "running" && bracket !== null && current.snapshot.settings.format !== "x1";
    const entrant = running && bracket.entrants.some((item) => item.id === current.me);
    const pending = entrant && nextMatchFor(bracket, current.me) !== null;
    return (
      <ConfirmSheet
        title={pending ? "Sair do torneio?" : "Sair da sala?"}
        detail={pending ? "Suas próximas partidas viram W.O." : entrant ? "Você deixa de acompanhar o torneio." : undefined}
        confirmLabel="Sair"
        cancelLabel="Ficar"
        danger={pending}
        onConfirm={() => void confirmLeave()}
        onCancel={() => setConfirm(null)}
      />
    );
  }
}
