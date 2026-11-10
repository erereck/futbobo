"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { FUTBOBO_VERSION, FUTBOBO_VERSION_NAME } from "../../version";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ComponentType } from "react";
import { CLUBS, COUNTRIES, FIRST_MATCH_EVENT, FORMATIONS, LEAGUES, POSITIONS, countryById, leagueById } from "../../game-data";
import type { GameEvent, PositionKey } from "../../game-data";
import { ROLE_LABELS, calculateSquadRole, createContract, createSeasonObjective } from "../../career-systems";
import { legacyBreakdownForState, legacyTierV2 } from "../../career/legacy-prestige";
import { ACHIEVEMENTS, NEWS_TEMPLATES, fillNewsTemplate, findRivalry } from "../../mega-expansion";
import BotaoMatch from "../../botao/BotaoMatch";
import { BOTAO3D_ENABLED_EVENT, BOTAO3D_PERFORMANCE_EVENT, rememberBotao3dPerformance, rememberBotao3dPreference, resolveBotao3dPerformance, resolveBotao3dPreference } from "../../botao/view-mode";
import AndroidInstallDialog from "../../AndroidInstallDialog";
import PlayerAppearanceEditor from "../../PlayerAppearanceEditor";
import { drawPlayerBust, teamKitPattern, visualRosterForMatch } from "../../player-appearance";
import { VERIFIED_CLUB_ASSET_IDS } from "../../verified-club-assets";
import { renderStickerPortrait, sticker3dEnabled } from "../../botao/three/sticker-portrait";
import { checkForAndroidUpdate, isAndroidDevice, isNativeAndroid, openAndroidDownload } from "../../android-app";
import type { AndroidRelease } from "../../android-app";
import { buildFinalSetup, buildNationalMatchSetup, describeFinal, finalOutcome, nationalMatchRole, pickClubWorldOpponent, pickNationalOpponent, ratingsFromAttributes, walkoverBotaoResult } from "../../botao/adapter";
import { simulateBotaoMatch } from "../../botao/simulate";
import type { BotaoMatchResult, BotaoMatchSetup } from "../../botao/types";
import { PLAYER_STORIES, playerStoryById } from "../../player-stories";
import type { PlayerStoryId } from "../../player-stories";
import type { AppSettings, AwardNomination, CareerHallEntry, ChallengeResult, CompetitionId, CompetitionResult, CustomClubDefinition, GameState, InstallPromptEvent, MonteCarloReport, PendingBotaoMatch, Phase, SeasonRecord, SeasonResult, SocialPost, TransferOffer } from "../../career/model";
import { BALLON_DOR_EXCLUDED_TROPHIES, BOTAO_IN_PROGRESS_KEY, CHALLENGE_RESULTS_KEY, CHALLENGE_SAVE_KEY, HALL_OF_FAME_KEY, ORIGINAL_CLUB_PRESENTATION, SAVE_KEY, SETTINGS_KEY, applyCustomClubDefinitions, archivedCareerState, awardFinalists, awardTierWeight, careerHallEntry, createCareerRivals, createPlayerAttributes, dailyChallenge, fictionalAwardWinner, initialState, normalizeSave, randomPlayerName, selectCareerTraits, shiftPlayerAttributes } from "../../career/state";
import { clamp, clubById, pick, seeded } from "../../career/shared";
import { eventForState, runMonteCarloCareers, simulateSeason } from "../../career/simulation";
import { PLAYABLE_ACADEMY_COUNTRIES, academyRouteCopy, continentalNationalTournament, continentalSlotAfterSeason, defaultAcademyCountry, hasLocalAcademyRoute, initialContinentalSlot, isEuropeanClub, positionByKey, randomAcademyClubs, sortedCountries } from "../../career/academy";
import { POSITION_FIELD_SPOTS, fanMood, formatFollowers, mergeEffects, publicImageProfile, simulatedWorldCupStats, worldCupStatsForSeason } from "../../career/performance";
import { BrandMark, ClubBadge, Metric, NationBadge, TROPHY_PRESENTATIONS } from "./CareerPrimitives";
import { applyEffect, applyStoryOrigin, createYouthJourney, selectNextEvent, storyClubCandidate } from "../../career/events";
import { buildFormerClubConference, buildPressConference, buildTransferPresentation } from "../../career/press-conferences";
import { isCycleShopDue, purchaseCycleShopItem } from "../../career/cycle-shop";
import type { CycleShopItemId } from "../../career/cycle-shop";
import { applyAcceptedTransfer, buildRenewalOffer, completeLoanReturn, generateTransferOffers, loanClubPermanentOffer, materializeTransferOffers, requestPlayerLoan, resolveTransferRequest, settleSeasonScouting, stayAfterYouthLoanRecommendation } from "../../career/transfer-market";
import { WORLD_CUP_ASSIST_LEADER } from "../../career/attention";
import { exportCareerStorageSnapshot, importCareerStorageSnapshot } from "../../career/save-system";
import { compactBotaoMatchResult, compactGameForPersistence } from "../../career/save-compaction";
import { applyNationalBotaoProduction } from "../../career/botao-production";
import CreationSpread from "./album/intro/CreationSpread";
import SummarySpread from "./album/SummarySpread";
import { FirstContractSpread, YouthChoiceSpread, YouthSimSpread } from "./album/intro/BaseSpreads";
import PressConferenceDialog from "./PressConferenceDialog";
import CycleShopDialog from "./CycleShopDialog";
import type { YouthPlayPanelProps } from "./YouthPlayPanel";
import type { SpecialTrainingPanelProps } from "./SpecialTrainingPanel";
import { worldFinalOpponentForSeason } from "../../career/world-club-competitions";
import FutboboIcon from "../FutboboIcon";
import AlbumShell, { albumHostClass } from "./album/AlbumShell";
import albumStyles from "./album/album.module.css";
import { clubInks } from "./album/inks";
import type { AlbumTabId } from "./album/AlbumShell";
import CareerSpread from "./album/CareerSpread";
import careerSpreadStyles from "./album/careerSpread.module.css";
import SeasonResultSpread from "./album/SeasonResultSpread";
import { RetirementSpread, TransferDeniedSpread, TransferSpread } from "./album/SideSpreads";
import LuckOverlay from "./album/LuckOverlay";
import { BotaoLobbySpread, BotaoResultSpread } from "./album/BotaoSpreads";
import AlbumSheet, { sheetStyles } from "./album/sheets/AlbumSheet";
import StoryDecisionSheet from "./album/sheets/StoryDecisionSheet";
import { Stamp } from "./album/primitives";
import PlayerTab from "./album/tabs/PlayerTab";
import TeamTab from "./album/tabs/TeamTab";
import HistoryTab from "./album/tabs/HistoryTab";
import StatsTab from "./album/tabs/StatsTab";
import WorldTab from "./album/tabs/WorldTab";

/** Sem rede (ou um deploy novo trocou os arquivos): a base jogada não abre; o save guarda tudo para depois. */
function YouthPlayUnavailable() {
  return (
    <section className={`${albumStyles.tokens} ${albumStyles.waitPage} albumMounted screen-enter`}>
      <div>
        <p>A base jogada não abriu. Confira a conexão e recarregue: o que você já jogou está salvo.</p>
        <Stamp variant="primary" onClick={() => window.location.reload()}>Recarregar</Stamp>
      </div>
    </section>
  );
}

/** Mesmo motivo: o treino fica "em andamento" na loja e a QUADRA avisa. */
function SpecialTrainingUnavailable({ onClose }: SpecialTrainingPanelProps) {
  useEffect(() => {
    onClose("O Treino especial não abriu. Recarregue a página para tentar de novo.");
  }, [onClose]);
  return null;
}

// A lista dos anos e o treino (e, a partir deles, o Scorebobo e o three.js) só baixam quando abrem.
const YouthPlayPanel = dynamic(() => import("./YouthPlayPanel").catch(() => ({ default: YouthPlayUnavailable as ComponentType<YouthPlayPanelProps> })), {
  ssr: false,
  loading: () => <section className={`${albumStyles.tokens} ${albumStyles.waitPage} albumMounted`} aria-busy="true"><div><p>Abrindo a base…</p></div></section>,
});
const SpecialTrainingPanel = dynamic(() => import("./SpecialTrainingPanel").catch(() => ({ default: SpecialTrainingUnavailable })), { ssr: false });

type CareerGameProps = {
  initialHallEntry?: CareerHallEntry | null;
  onCloseHallPreview?: () => void;
};

function isFormerClubOpponent(state: GameState, clubId: string) {
  if (!clubId || clubId === state.currentClubId) return false;
  return (
    state.history.some((record) => record.clubId === clubId) ||
    state.transferHistory.some((record) => record.fromClubId === clubId || record.toClubId === clubId)
  );
}

// Fases da carreira que vivem no álbum.
const ALBUM_PHASES = new Set<Phase>(["career", "consequence", "season-result", "transfer", "transfer-denied", "retirement-confirm", "botao-final", "botao-result"]);
// A introdução da carreira no álbum: ficha do atleta, base e primeiro contrato.
const INTRO_PHASES = new Set<Phase>(["identity", "appearance", "nationality", "academy", "formation", "story", "youth", "revelation"]);

export default function CareerGame({ initialHallEntry = null, onCloseHallPreview }: CareerGameProps = {}) {
  const [game, setGame] = useState<GameState>(() => initialState());
  const nameRollRef = useRef(0);
  const shirtRollRef = useRef(0);
  const [hasSave, setHasSave] = useState(false);
  const [hasChallengeSave, setHasChallengeSave] = useState(false);
  const [challengeResults, setChallengeResults] = useState<ChallengeResult[]>([]);
  const [youthStep, setYouthStep] = useState(0);
  const [youthFinished, setYouthFinished] = useState(false);
  const [activeTab, setActiveTab] = useState<"event" | "history" | "profile" | "life" | "stats" | "team" | "world" | "legacy">("event");
  const [toast, setToast] = useState("");
  const [luckSpin, setLuckSpin] = useState<{ event: GameEvent; choiceIndex: number; succeeded: boolean } | null>(null);
  const [positionChangeOpen, setPositionChangeOpen] = useState(false);
  const [appearanceEditorOpen, setAppearanceEditorOpen] = useState(false);
  const [positionChangeTarget, setPositionChangeTarget] = useState<PositionKey | null>(null);
  const [positionChangeFeedback, setPositionChangeFeedback] = useState<{ success: boolean; headline: string; text: string } | null>(null);
  const [nationalitySearch, setNationalitySearch] = useState("");
  const [monteCarloReport, setMonteCarloReport] = useState<MonteCarloReport | null>(null);
  const [hallOfFame, setHallOfFame] = useState<CareerHallEntry[]>([]);
  const [hallPreview, setHallPreview] = useState<GameState | null>(() => initialHallEntry ? archivedCareerState(initialHallEntry).state : null);
  const [hallPreviewLegacy, setHallPreviewLegacy] = useState(() => initialHallEntry ? archivedCareerState(initialHallEntry).legacyArchive : false);
  const [updateNoticeOpen, setUpdateNoticeOpen] = useState(false);
  const [updateNoticePage, setUpdateNoticePage] = useState<"current" | "previous">("current");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>({
    customCharacters: [],
    customClubs: [],
    finalMatchMode: "play-key-matches",
    botaoGoalLimit: 3,
    botaoHalfSeconds: 120,
    botaoExtraSeconds: 45,
    botaoPenaltyRounds: 5,
    characterButtonsEnabled: true,
    botao3d: false,
    botao3dPerformance: false,
    botao3dPerformanceUserOff: false,
  });
  const [characterName, setCharacterName] = useState("");
  const [characterPosition, setCharacterPosition] = useState<PositionKey>("MEI");
  const [customClubReplacement, setCustomClubReplacement] = useState(CLUBS[0].id);
  const [customClubName, setCustomClubName] = useState("");
  const [customClubShortName, setCustomClubShortName] = useState("");
  const [customClubAbbr, setCustomClubAbbr] = useState("");
  const [customClubPrimary, setCustomClubPrimary] = useState("#0b6b45");
  const [customClubSecondary, setCustomClubSecondary] = useState("#f4c542");
  const [customClubBadge, setCustomClubBadge] = useState("");
  const [shirtNumberInput, setShirtNumberInput] = useState("10");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installHelp, setInstallHelp] = useState(false);
  const [androidInstallOpen, setAndroidInstallOpen] = useState(false);
  const [androidRelease, setAndroidRelease] = useState<AndroidRelease | null>(null);
  const [androidPhone, setAndroidPhone] = useState(false);
  const [nativeAndroid, setNativeAndroid] = useState(false);
  const [selectedAchievementId, setSelectedAchievementId] = useState("");
  const [botaoMatchStarted, setBotaoMatchStarted] = useState(false);
  const [botaoSimulating, setBotaoSimulating] = useState(false);
  const [activeGoalReplay, setActiveGoalReplay] = useState<number | null>(null);
  const [pressConferenceOpen, setPressConferenceOpen] = useState(false);
  const [cycleShopDismissedSeason, setCycleShopDismissedSeason] = useState(0);
  const [cycleShopFeedback, setCycleShopFeedback] = useState("");
  const [specialTrainingOpen, setSpecialTrainingOpen] = useState(false);
  // "Jogar a base" tocado: o painel (sob demanda) grava a escolha ao abrir.
  const [youthPlayRequested, setYouthPlayRequested] = useState(false);
  const [summaryClubId, setSummaryClubId] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const saveImportRef = useRef<HTMLInputElement>(null);
  // Sem esta trava o primeiro render gravava os padrões por cima das
  // configurações salvas, e quem lesse o storage nesse intervalo via o padrão.
  const settingsLoadedRef = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { version?: number; phase?: Phase };
        if (parsed.version && parsed.version >= 1 && parsed.version <= 7) {
          queueMicrotask(() => setHasSave(parsed.phase !== "welcome"));
        }
      }
      const challengeSave = localStorage.getItem(CHALLENGE_SAVE_KEY);
      if (challengeSave) {
        const parsed = JSON.parse(challengeSave) as { version?: number; phase?: Phase; challengeId?: string };
        if (parsed.version && parsed.version >= 1 && parsed.version <= 7 && parsed.challengeId) {
          queueMicrotask(() => setHasChallengeSave(parsed.phase !== "welcome" && parsed.phase !== "summary"));
        }
      }
      const storedChallengeResults = JSON.parse(localStorage.getItem(CHALLENGE_RESULTS_KEY) ?? "[]") as unknown;
      if (Array.isArray(storedChallengeResults)) {
        queueMicrotask(() => setChallengeResults((storedChallengeResults as ChallengeResult[]).slice(0, 40)));
      }
      const storedHall = JSON.parse(localStorage.getItem(HALL_OF_FAME_KEY) ?? "[]") as unknown;
      if (Array.isArray(storedHall)) {
        queueMicrotask(() => setHallOfFame(
          (storedHall as CareerHallEntry[])
            .filter((entry) => entry && typeof entry.legacyPoints === "number" && typeof entry.name === "string")
            .sort((a, b) => b.legacyPoints - a.legacyPoints || b.peakOverall - a.peakOverall)
            .slice(0, 10),
        ));
      }
      const storedSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<AppSettings>;
      const sanitizedSettings: AppSettings = {
        customCharacters: Array.isArray(storedSettings.customCharacters)
          ? storedSettings.customCharacters
              .filter((character) => character && typeof character.name === "string" && POSITIONS.some((position) => position.key === character.position))
              .slice(0, 12)
          : [],
        customClubs: Array.isArray(storedSettings.customClubs)
          ? storedSettings.customClubs
              .filter((club) => club && CLUBS.some((candidate) => candidate.id === club.replacedClubId) && typeof club.name === "string")
              .slice(0, 8)
          : [],
        finalMatchMode: storedSettings.finalMatchMode ?? "play-key-matches",
        botaoGoalLimit: [0, 3, 5].includes(storedSettings.botaoGoalLimit ?? 3) ? storedSettings.botaoGoalLimit ?? 3 : 3,
        botaoHalfSeconds: [90, 120, 180].includes(storedSettings.botaoHalfSeconds ?? 120) ? storedSettings.botaoHalfSeconds ?? 120 : 120,
        botaoExtraSeconds: [30, 45, 60].includes(storedSettings.botaoExtraSeconds ?? 45) ? storedSettings.botaoExtraSeconds ?? 45 : 45,
        botaoPenaltyRounds: storedSettings.botaoPenaltyRounds === 3 ? 3 : 5,
        characterButtonsEnabled: storedSettings.characterButtonsEnabled !== false,
        // Sem o campo salvo, vale o que o convite da home ligou (só no espelho).
        botao3d: resolveBotao3dPreference(storedSettings),
        // O que uma partida fora do app ligou sozinha (só no espelho) também vale.
        botao3dPerformance: resolveBotao3dPerformance(storedSettings).enabled,
        botao3dPerformanceUserOff: resolveBotao3dPerformance(storedSettings).userOff,
      };
      applyCustomClubDefinitions(sanitizedSettings.customClubs ?? []);
      queueMicrotask(() => setAppSettings(sanitizedSettings));
    } catch {
      localStorage.removeItem(SAVE_KEY);
    }
    // Liberado depois do setAppSettings acima (mesma fila de microtasks).
    queueMicrotask(() => {
      settingsLoadedRef.current = true;
    });
  }, []);

  useEffect(() => {
    if (!settingsLoadedRef.current) return;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
    rememberBotao3dPreference(appSettings.botao3d === true);
    rememberBotao3dPerformance({ enabled: appSettings.botao3dPerformance === true, userOff: appSettings.botao3dPerformanceUserOff === true });
  }, [appSettings]);

  // A partida liga o modo desempenho sozinha quando o aparelho engasga: sem
  // isto, o próximo save das configurações gravaria o valor velho por cima.
  useEffect(() => {
    // Já ligado (ou desligado na mão): sem render novo da carreira no meio da partida.
    const onAutoPerformance = () => setAppSettings((current) => (current.botao3dPerformanceUserOff === true || current.botao3dPerformance === true ? current : { ...current, botao3dPerformance: true }));
    // Mesmo motivo para o convite da home, que liga o 3D fora daqui.
    const onBotao3dEnabled = () => setAppSettings((current) => (current.botao3d === true ? current : { ...current, botao3d: true }));
    window.addEventListener(BOTAO3D_PERFORMANCE_EVENT, onAutoPerformance);
    window.addEventListener(BOTAO3D_ENABLED_EVENT, onBotao3dEnabled);
    return () => {
      window.removeEventListener(BOTAO3D_PERFORMANCE_EVENT, onAutoPerformance);
      window.removeEventListener(BOTAO3D_ENABLED_EVENT, onBotao3dEnabled);
    };
  }, []);

  useEffect(() => {
    if (appSettings.characterButtonsEnabled === false && game.phase === "appearance") {
      queueMicrotask(() => setGame((current) => current.phase === "appearance" ? { ...current, phase: "nationality" } : current));
    }
  }, [appSettings.characterButtonsEnabled, game.phase]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [game.phase, activeTab]);


  useEffect(() => {
    window.__FUTBOBO_MONTE_CARLO__ = runMonteCarloCareers;
    const params = new URLSearchParams(window.location.search);
    const requestedRuns = Number(params.get("montecarlo") ?? 0);
    if (requestedRuns > 0) {
      const requestedSeed = Number(params.get("seed") ?? 20260723);
      queueMicrotask(() => setMonteCarloReport(runMonteCarloCareers(requestedRuns, requestedSeed)));
    }
    return () => {
      delete window.__FUTBOBO_MONTE_CARLO__;
    };
  }, []);

  useEffect(() => {
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
  }, []);

  useEffect(() => {
    const native = isNativeAndroid();
    queueMicrotask(() => {
      setNativeAndroid(native);
      setAndroidPhone(isAndroidDevice());
    });
    if (!native) return;
    void checkForAndroidUpdate().then((release) => {
      if (!release) return;
      setAndroidRelease(release);
      setAndroidInstallOpen(true);
    });
  }, []);

  useEffect(() => {
    if (game.phase === "welcome") return;
    const key = game.challengeId ? CHALLENGE_SAVE_KEY : SAVE_KEY;
    const compact = compactGameForPersistence(game);
    try {
      localStorage.setItem(key, JSON.stringify(compact));
      if (game.challengeId) queueMicrotask(() => setHasChallengeSave(game.phase !== "summary"));
    } catch (error) {
      console.error("[Futbobo] Falha ao persistir a carreira.", error);
      // Nunca deixe uma cota de armazenamento cheia derrubar a partida inteira.
      // A segunda tentativa remove também o resultado pós-jogo efêmero; histórico
      // e estatísticas permanecem intactos.
      try {
        localStorage.setItem(key, JSON.stringify({ ...compact, lastBotaoResult: null }));
        queueMicrotask(() => setToast("Save compactado automaticamente para liberar espaço"));
      } catch (retryError) {
        console.error("[Futbobo] O save continuou acima da cota após compactação.", retryError);
        queueMicrotask(() => setToast("Não foi possível salvar: armazenamento do navegador cheio"));
      }
    }
  }, [game]);

  useEffect(() => {
    if (game.phase !== "summary" || !game.challengeId || game.history.length === 0) return;
    const result: ChallengeResult = {
      id: `${game.challengeId}-${game.seed}-${game.name}-${game.history.length}`,
      challengeId: game.challengeId,
      date: game.challengeDate,
      name: game.name,
      position: game.position,
      nationality: game.nationality,
      score: game.legacyPoints,
      peakOverall: Math.max(game.overall, ...game.history.map((record) => record.overall)),
      trophies: game.trophies + game.nationalTrophies,
      ballonDor: game.awardCabinet["Bola de Ouro"] ?? 0,
      finishedAt: Date.now(),
    };
    queueMicrotask(() => setChallengeResults((current) => {
      const next = [result, ...current.filter((item) => item.id !== result.id)]
        .sort((a, b) => b.score - a.score || b.peakOverall - a.peakOverall)
        .slice(0, 40);
      localStorage.setItem(CHALLENGE_RESULTS_KEY, JSON.stringify(next));
      return next;
    }));
    localStorage.removeItem(CHALLENGE_SAVE_KEY);
    queueMicrotask(() => setHasChallengeSave(false));
  }, [game]);

  useEffect(() => {
    if (game.phase !== "summary" || game.history.length === 0 || game.challengeId) return;
    const entry = careerHallEntry(game);
    queueMicrotask(() => {
      setHallOfFame((current) => {
        const next = [entry, ...current.filter((item) => item.id !== entry.id)]
          .sort((a, b) => b.legacyPoints - a.legacyPoints || b.peakOverall - a.peakOverall || b.finishedAt - a.finishedAt)
          .slice(0, 10);
        localStorage.setItem(HALL_OF_FAME_KEY, JSON.stringify(next));
        return next;
      });
    });
  }, [game]);

  // O álbum rola como página: cada fase nova começa do topo, sem travar a viewport.
  useEffect(() => {
    if (ALBUM_PHASES.has(game.phase) || INTRO_PHASES.has(game.phase)) window.scrollTo(0, 0);
  }, [game.phase]);

  // Só a base simulada anima: a escolha e a base jogada não têm relógio.
  // No desafio a base é sempre simulada (um save de antes da escolha também).
  const youthMode = game.youthPlay?.mode ?? (game.challengeId ? "simulate" : null);
  useEffect(() => {
    if (game.phase !== "youth" || youthMode !== "simulate") return;
    const timers = game.youthYears.map((_, index) =>
      window.setTimeout(() => setYouthStep(index + 1), 350 + index * 340),
    );
    const finish = window.setTimeout(
      () => setYouthFinished(true),
      900 + game.youthYears.length * 340,
    );
    return () => {
      timers.forEach(window.clearTimeout);
      window.clearTimeout(finish);
    };
  }, [game.phase, game.youthYears, youthMode]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (game.phase !== "consequence") return;
    const timeout = window.setTimeout(() => {
      setGame((current) =>
        current.phase === "consequence"
          ? { ...current, phase: current.pendingBotaoMatches.length ? "botao-final" : "season-result" }
          : current,
      );
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [game.phase]);

  const displayGame = hallPreview ?? game;
  const presentationOpen = game.pendingPressConference?.kind === "presentation" && game.phase === "career";
  const cycleShopOpen = !pressConferenceOpen
    && !game.pendingPressConference
    && cycleShopDismissedSeason !== game.season
    && isCycleShopDue(game);
  const todayChallenge = dailyChallenge();
  const todayChallengeResults = challengeResults
    .filter((result) => result.challengeId === todayChallenge.id)
    .sort((a, b) => b.score - a.score);
  const todayChallengeBest = todayChallengeResults[0] ?? null;
  const currentClub = useMemo(() => clubById(displayGame.currentClubId || displayGame.academyClubId), [displayGame.currentClubId, displayGame.academyClubId]);
  const currentBotaoMatch = game.pendingBotaoMatches[0] ?? null;
  function setupForPendingBotaoMatch(state: GameState, match: PendingBotaoMatch): BotaoMatchSetup {
    const ratings = ratingsFromAttributes(state.attributes, state.overall);
    const rules = {
      goalLimit: appSettings.botaoGoalLimit ?? 3,
      halfSeconds: appSettings.botaoHalfSeconds ?? 120,
      extraSeconds: appSettings.botaoExtraSeconds ?? 45,
      penaltyRounds: appSettings.botaoPenaltyRounds ?? 5,
    };
    const matchVisuals = (userTeamId: string, cpuTeamId: string, national = false) => visualRosterForMatch({
      enabled: appSettings.characterButtonsEnabled !== false,
      seed: state.seed,
      season: match.season,
      userTeamId,
      cpuTeamId,
      player: state.playerAppearance,
      careerStartSeason: state.history[0]?.season ?? state.season,
      userNationalCountryId: national ? userTeamId : undefined,
      cpuNationalCountryId: national ? cpuTeamId : undefined,
    });
    if (match.source === "national") {
      const country = countryById(state.nationality);
      const opponent = countryById(match.opponentId);
      return buildNationalMatchSetup({
        seed: state.seed,
        season: match.season,
        competitionId: match.competitionId,
        competitionName: match.competitionName,
        stageName: match.stageName,
        country,
        opponent,
        playerName: state.name,
        playerNumber: state.number,
        position: state.position,
        overall: state.overall,
        playerRole: nationalMatchRole(
          state.overall,
          country,
          match.nationalTier ?? state.nationalCategory,
          state.nationalCaptain,
        ),
        ratings,
        rules,
        visuals: matchVisuals(country.id, opponent.id, true),
      });
    }
    const club = clubById(state.currentClubId);
    const opponent = clubById(match.opponentId);
    const formerClub = match.source === "club" && isFormerClubOpponent(state, opponent.id);
    return buildFinalSetup({
      seed: state.seed,
      season: match.season,
      competitionId: match.competitionId,
      competitionName: match.competitionName,
      stageName: match.stageName,
      formerClub,
      club,
      opponent,
      playerName: state.name,
      playerNumber: state.number,
      position: state.position,
      overall: state.overall,
      ratings,
      rules,
      visuals: matchVisuals(club.id, opponent.id),
    });
  }
  const currentBotaoSetup = currentBotaoMatch
    ? setupForPendingBotaoMatch(game, currentBotaoMatch)
    : null;
  const academyClubs = useMemo(() => randomAcademyClubs(game.seed, game.academyCountryId), [game.seed, game.academyCountryId]);
  const academyRoute = useMemo(
    () => academyRouteCopy(game.academyCountryId, game.nationality),
    [game.academyCountryId, game.nationality],
  );
  const filteredCountries = useMemo(() => {
    const query = nationalitySearch.trim().toLocaleLowerCase("pt-BR");
    const pool = sortedCountries(COUNTRIES);
    if (!query) return pool;
    return pool.filter((country) =>
      `${country.name} ${country.demonym} ${country.abbr}`.toLocaleLowerCase("pt-BR").includes(query),
    );
  }, [nationalitySearch]);
  const nationCountry = useMemo(() => countryById(displayGame.nationality), [displayGame.nationality]);
  const position = useMemo(() => positionByKey(displayGame.position), [displayGame.position]);
  const supporterMood = useMemo(() => fanMood(game.fanSupport), [game.fanSupport]);
  const publicImage = useMemo(() => publicImageProfile(displayGame), [displayGame]);
  const legacyStanding = useMemo(() => legacyTierV2(displayGame.legacyPoints), [displayGame.legacyPoints]);
  const marketOffers = useMemo(() => {
    const offers = new Map(game.transferMarketOffers.map((offer) => [offer.clubId, offer]));
    const missingIds = game.transferOffers.filter((id) => !offers.has(id));
    for (const offer of materializeTransferOffers(game, missingIds, game.season * 43, {
      includeForeign: true,
      mode: game.pendingTransferMode === "loan" ? "loan" : game.isFreeAgent ? "free-agent" : "permanent",
    })) offers.set(offer.clubId, offer);
    return game.transferOffers.flatMap((id) => {
      const offer = offers.get(id);
      return offer ? [offer] : [];
    });
  }, [game]);
  const renewalOffer = useMemo(() => game.contractYears === 0 ? buildRenewalOffer(game) : null, [game]);
  const awardEntries = useMemo(
    () => Object.entries(displayGame.awardCabinet).sort((a, b) =>
      awardTierWeight(b[0]) - awardTierWeight(a[0]) ||
      b[1] - a[1] ||
      a[0].localeCompare(b[0], "pt-BR"),
    ),
    [displayGame.awardCabinet],
  );
  const totalIndividualAwards = useMemo(
    () => awardEntries.reduce((total, [, count]) => total + count, 0),
    [awardEntries],
  );
  const clubCareerSummary = useMemo(() => {
    const byClub = new Map<string, {
      clubId: string;
      seasons: number;
      appearances: number;
      goals: number;
      assists: number;
      cleanSheets: number;
      trophies: number;
      awards: number;
      firstSeason: number;
      lastSeason: number;
      peakOverall: number;
      entryOverall: number;
      exitOverall: number;
      records: SeasonRecord[];
    }>();
    for (const record of displayGame.history) {
      const current = byClub.get(record.clubId) ?? {
        clubId: record.clubId,
        seasons: 0,
        appearances: 0,
        goals: 0,
        assists: 0,
        cleanSheets: 0,
        trophies: 0,
        awards: 0,
        firstSeason: record.season,
        lastSeason: record.season,
        peakOverall: record.overall,
        entryOverall: record.overall,
        exitOverall: record.overall,
        records: [],
      };
      current.seasons += 1;
      current.appearances += record.appearances;
      current.goals += record.goals;
      current.assists += record.assists;
      current.cleanSheets += record.cleanSheets;
      current.trophies += record.competitions.filter((competition) => competition.champion).length;
      current.awards += record.awards.length;
      current.firstSeason = Math.min(current.firstSeason, record.season);
      current.lastSeason = Math.max(current.lastSeason, record.season);
      current.peakOverall = Math.max(current.peakOverall, record.overall);
      if (record.season <= current.firstSeason) current.entryOverall = record.overall;
      if (record.season >= current.lastSeason) current.exitOverall = record.overall;
      current.records.push(record);
      byClub.set(record.clubId, current);
    }
    return [...byClub.values()].sort((a, b) => b.appearances - a.appearances || b.trophies - a.trophies);
  }, [displayGame.history]);
  const selectedClubCareer = useMemo(
    () => clubCareerSummary.find((entry) => entry.clubId === summaryClubId) ?? clubCareerSummary[0] ?? null,
    [clubCareerSummary, summaryClubId],
  );
  const shareTitleHighlights = useMemo(() => {
    const clubTitles = TROPHY_PRESENTATIONS
      .map((presentation) => ({ label: presentation.label, shortLabel: presentation.shortLabel, count: displayGame.trophyCabinet[presentation.id] }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count);
    if (displayGame.nationalTrophies > 0) clubTitles.push({ label: "Títulos pela Seleção", shortLabel: "SEL", count: displayGame.nationalTrophies });
    return clubTitles.slice(0, 5);
  }, [displayGame.trophyCabinet, displayGame.nationalTrophies]);
  const currentEvent = eventForState(game);
  const albumTab: AlbumTabId = activeTab === "life" || activeTab === "legacy" ? "event" : activeTab;
  // A figurinha do jogador usa o boneco da mesa, na camisa do clube atual (ou o número, se os bonecos estiverem desligados).
  const albumAppearance = useMemo(
    () => appSettings.characterButtonsEnabled !== false ? { ...game.playerAppearance, kitPattern: teamKitPattern(game.seed, currentClub.id) } : null,
    [appSettings.characterButtonsEnabled, game.playerAppearance, game.seed, currentClub.id],
  );

  useEffect(() => {
    if (!luckSpin) return;
    const timeout = window.setTimeout(() => {
      setGame((current) => {
        const choice = luckSpin.event.choices[luckSpin.choiceIndex];
        if (!choice?.luck || current.currentEventId !== luckSpin.event.id) return current;
        const luckEffect = luckSpin.succeeded ? choice.luck.successEffect : choice.luck.failureEffect;
        return simulateSeason(
          current,
          luckSpin.event,
          mergeEffects(choice.effect, luckEffect),
          choice.label,
          luckSpin.succeeded ? choice.luck.successText : choice.luck.failureText,
          luckSpin.succeeded ? "success" : "failure",
          appSettings.finalMatchMode ?? "play-key-matches",
        );
      });
      setLuckSpin(null);
      if ("vibrate" in navigator) navigator.vibrate([24, 30, 24]);
    }, 1650);
    return () => window.clearTimeout(timeout);
  }, [luckSpin, appSettings.finalMatchMode]);
  const headerSeason = game.phase === "consequence" || game.phase === "season-result" ? game.lastResult?.season ?? game.season : game.season;
  const headerAge = game.phase === "consequence" || game.phase === "season-result" ? game.lastResult?.age ?? game.age : game.age;

  function vibrate() {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(18);
  }

  function changeTab(tab: "event" | "history" | "profile" | "life" | "stats" | "team" | "world" | "legacy") {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: "smooth" });
    vibrate();
  }

  function rollPlayerName() {
    nameRollRef.current += 1;
    setGame((current) => {
      let nextName = randomPlayerName(current.seed, current.season * 997 + nameRollRef.current * 131);
      if (nextName === current.name) {
        nameRollRef.current += 1;
        nextName = randomPlayerName(current.seed, current.season * 997 + nameRollRef.current * 131);
      }
      return { ...current, name: nextName };
    });
    vibrate();
  }

  function rollShirtNumber() {
    shirtRollRef.current += 1;
    const popularNumbers = [7, 9, 10, 11, 8, 6, 5, 4, 3, 2, 1, 12, 14, 17, 18, 19, 20, 21, 22, 23, 27, 30, 33, 37, 42, 66, 77, 80, 88, 99];
    const nextNumber = pick(popularNumbers, game.seed, game.season * 149 + shirtRollRef.current * 67);
    setShirtNumberInput(String(nextNumber));
    setGame((current) => ({ ...current, number: nextNumber }));
    vibrate();
  }

  function restoreSavedGame(state: GameState, saveKey: string) {
    setGame(state);
    setYouthPlayRequested(false);
    const pendingMatch = state.pendingBotaoMatches[0];
    if (!pendingMatch || state.phase !== "botao-final") return;
    try {
      const marker = JSON.parse(localStorage.getItem(BOTAO_IN_PROGRESS_KEY) ?? "null") as {
        saveKey?: string;
        matchId?: string;
      } | null;
      const setup = setupForPendingBotaoMatch(state, pendingMatch);
      if (marker?.saveKey === saveKey && marker.matchId === setup.matchId) {
        applyBotaoMatchResult(walkoverBotaoResult(setup), setup, pendingMatch.id);
      } else if (marker?.saveKey === saveKey) {
        localStorage.removeItem(BOTAO_IN_PROGRESS_KEY);
      }
    } catch {
      localStorage.removeItem(BOTAO_IN_PROGRESS_KEY);
    }
  }

  function startNew() {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(BOTAO_IN_PROGRESS_KEY);
    setHallPreview(null);
    setHallPreviewLegacy(false);
    nameRollRef.current = 0;
    setGame({ ...initialState(), phase: "identity", seed: Date.now() % 2147483647 });
    setShirtNumberInput("10");
    setHasSave(true);
    setActiveTab("event");
    vibrate();
  }

  function continueSave() {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved) {
        setHallPreview(null);
        setHallPreviewLegacy(false);
        const normalized = normalizeSave(JSON.parse(saved));
        restoreSavedGame(normalized, SAVE_KEY);
        setShirtNumberInput(String(normalized.number || 10));
      }
    } catch {
      startNew();
    }
  }

  function startChallenge() {
    const challenge = dailyChallenge();
    localStorage.removeItem(CHALLENGE_SAVE_KEY);
    localStorage.removeItem(BOTAO_IN_PROGRESS_KEY);
    setHallPreview(null);
    setHallPreviewLegacy(false);
    nameRollRef.current = 0;
    setGame({
      ...initialState(challenge.seed),
      phase: "identity",
      seed: challenge.seed,
      challengeId: challenge.id,
      challengeDate: challenge.date,
    });
    setShirtNumberInput("10");
    setHasChallengeSave(true);
    setActiveTab("event");
    vibrate();
  }

  function continueChallenge() {
    try {
      const saved = localStorage.getItem(CHALLENGE_SAVE_KEY);
      if (!saved) return startChallenge();
      const normalized = normalizeSave(JSON.parse(saved));
      setHallPreview(null);
      setHallPreviewLegacy(false);
      restoreSavedGame(normalized, CHALLENGE_SAVE_KEY);
      setShirtNumberInput(String(normalized.number || 10));
      setActiveTab("event");
      vibrate();
    } catch {
      startChallenge();
    }
  }

  function openHallCareer(entry: CareerHallEntry) {
    const archive = archivedCareerState(entry);
    setHallPreview(archive.state);
    setHallPreviewLegacy(archive.legacyArchive);
    window.scrollTo({ top: 0, behavior: "smooth" });
    vibrate();
  }

  function closeHallCareer() {
    if (onCloseHallPreview) {
      onCloseHallPreview();
      return;
    }
    setHallPreview(null);
    setHallPreviewLegacy(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
    vibrate();
  }

  function addCustomCharacter() {
    const name = characterName.trim().replace(/\s+/g, " ");
    if (name.length < 2 || appSettings.customCharacters.length >= 12) return;
    setAppSettings((current) => ({
      ...current,
      customCharacters: [
        ...current.customCharacters,
        { id: `${Date.now()}-${name.toLocaleLowerCase("pt-BR")}`, name: name.slice(0, 28), position: characterPosition },
      ],
    }));
    setCharacterName("");
    setToast(`${name} entrou no universo do jogo`);
    vibrate();
  }
  function removeCustomCharacter(id: string) {
    setAppSettings((current) => ({
      ...current,
      customCharacters: current.customCharacters.filter((character) => character.id !== id),
    }));
    vibrate();
  }

  function saveCustomClub() {
    const name = customClubName.trim().replace(/\s+/g, " ");
    const shortName = (customClubShortName.trim() || name).replace(/\s+/g, " ");
    const abbr = customClubAbbr.trim().toLocaleUpperCase("pt-BR").replace(/[^A-Z0-9]/g, "").slice(0, 4);
    if (name.length < 2 || shortName.length < 2 || abbr.length < 2) return;
    const badge = customClubBadge.trim();
    const safeBadge = badge.startsWith("data:image/") || /^https:\/\//i.test(badge) ? badge : "";
    const definition: CustomClubDefinition = {
      replacedClubId: customClubReplacement,
      name: name.slice(0, 42),
      shortName: shortName.slice(0, 24),
      abbr,
      primary: customClubPrimary,
      secondary: customClubSecondary,
      badge: safeBadge,
    };
    setAppSettings((current) => {
      const customClubs = [
        ...(current.customClubs ?? []).filter((club) => club.replacedClubId !== definition.replacedClubId),
        definition,
      ].slice(-8);
      applyCustomClubDefinitions(customClubs);
      return { ...current, customClubs };
    });
    setToast(`${definition.shortName} substituiu o ${ORIGINAL_CLUB_PRESENTATION.get(definition.replacedClubId)?.shortName ?? "clube escolhido"}`);
    vibrate();
  }

  function removeCustomClub(replacedClubId: string) {
    setAppSettings((current) => {
      const customClubs = (current.customClubs ?? []).filter((club) => club.replacedClubId !== replacedClubId);
      applyCustomClubDefinitions(customClubs);
      return { ...current, customClubs };
    });
    vibrate();
  }

  function readCustomClubBadge(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 1_000_000) {
      setToast("Use uma imagem de até 1 MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCustomClubBadge(reader.result);
        setToast("Escudo carregado");
      }
    };
    reader.readAsDataURL(file);
  }

  function exportSavedData() {
    const payload = {
      format: "futbobo-backup",
      version: 2,
      exportedAt: new Date().toISOString(),
      careerStorage: exportCareerStorageSnapshot(),
      save: JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null"),
      challengeSave: JSON.parse(localStorage.getItem(CHALLENGE_SAVE_KEY) ?? "null"),
      challengeResults: JSON.parse(localStorage.getItem(CHALLENGE_RESULTS_KEY) ?? "[]"),
      hallOfFame: JSON.parse(localStorage.getItem(HALL_OF_FAME_KEY) ?? "[]"),
      settings: appSettings,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `futbobo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setToast("Dados exportados");
  }

  async function importSavedData(file: File | undefined) {
    if (!file) return;
    try {
      localStorage.removeItem(BOTAO_IN_PROGRESS_KEY);
      const payload = JSON.parse(await file.text()) as {
        format?: string;
        save?: unknown;
        careerStorage?: unknown;
        challengeSave?: unknown;
        challengeResults?: unknown;
        hallOfFame?: unknown;
        settings?: Partial<AppSettings>;
      };
      if (payload.format !== "futbobo-backup") throw new Error("Formato inválido");
      const multiCareerImport = payload.careerStorage === undefined
        ? { imported: false, activeState: null }
        : importCareerStorageSnapshot(payload.careerStorage);
      if (payload.careerStorage !== undefined && !multiCareerImport.imported) throw new Error("Backup de carreiras inválido");
      const importedSettings: AppSettings = {
        customCharacters: Array.isArray(payload.settings?.customCharacters) ? payload.settings.customCharacters.slice(0, 12) : [],
        customClubs: Array.isArray(payload.settings?.customClubs) ? payload.settings.customClubs.slice(0, 8) : [],
        finalMatchMode: payload.settings?.finalMatchMode ?? "play-key-matches",
        botaoGoalLimit: payload.settings?.botaoGoalLimit ?? 3,
        botaoHalfSeconds: payload.settings?.botaoHalfSeconds ?? 120,
        botaoExtraSeconds: payload.settings?.botaoExtraSeconds ?? 45,
        botaoPenaltyRounds: payload.settings?.botaoPenaltyRounds ?? 5,
        characterButtonsEnabled: payload.settings?.characterButtonsEnabled !== false,
        botao3d: payload.settings?.botao3d === true,
        botao3dPerformance: payload.settings?.botao3dPerformance === true,
        botao3dPerformanceUserOff: payload.settings?.botao3dPerformanceUserOff === true,
      };
      const importedHall = Array.isArray(payload.hallOfFame)
        ? (payload.hallOfFame as CareerHallEntry[])
            .filter((entry) => entry && typeof entry.name === "string" && typeof entry.legacyPoints === "number")
            .sort((a, b) => b.legacyPoints - a.legacyPoints)
            .slice(0, 10)
        : [];
      applyCustomClubDefinitions(importedSettings.customClubs ?? []);
      setAppSettings(importedSettings);
      setHallOfFame(importedHall);
      localStorage.setItem(HALL_OF_FAME_KEY, JSON.stringify(importedHall));
      const importedChallengeResults = Array.isArray(payload.challengeResults)
        ? (payload.challengeResults as ChallengeResult[])
            .filter((result) => result && typeof result.challengeId === "string" && typeof result.score === "number")
            .slice(0, 40)
        : [];
      setChallengeResults(importedChallengeResults);
      localStorage.setItem(CHALLENGE_RESULTS_KEY, JSON.stringify(importedChallengeResults));
      if (payload.challengeSave) {
        const importedChallenge = normalizeSave(payload.challengeSave);
        if (importedChallenge.challengeId) {
          localStorage.setItem(CHALLENGE_SAVE_KEY, JSON.stringify(importedChallenge));
          setHasChallengeSave(importedChallenge.phase !== "summary");
        }
      } else {
        localStorage.removeItem(CHALLENGE_SAVE_KEY);
        setHasChallengeSave(false);
      }
      if (payload.save) {
        const importedGame = normalizeSave(payload.save);
        setGame(importedGame);
        setHasSave(importedGame.phase !== "welcome");
        localStorage.setItem(SAVE_KEY, JSON.stringify(importedGame));
      } else if (multiCareerImport.activeState && !("mode" in multiCareerImport.activeState)) {
        setGame(multiCareerImport.activeState);
        setHasSave(multiCareerImport.activeState.phase !== "welcome");
      } else {
        localStorage.removeItem(SAVE_KEY);
        setHasSave(false);
      }
      setToast("Dados importados com sucesso");
      setSettingsOpen(false);
    } catch {
      setToast("Arquivo de backup inválido");
    } finally {
      if (saveImportRef.current) saveImportRef.current.value = "";
    }
  }

  function selectFormation(formationId: string) {
    setGame((current) => ({
      ...current,
      phase: "story",
      formationId,
      archetype: FORMATIONS.find((formation) => formation.id === formationId)?.archetype ?? current.archetype,
    }));
    vibrate();
  }

  function selectPlayerStory(storyId: PlayerStoryId) {
    setYouthStep(0);
    setYouthFinished(false);
    setYouthPlayRequested(false);
    setGame((current) => {
      const journey = createYouthJourney(current, current.formationId);
      const revealAge = storyId === "late-bloomer"
        ? Math.max(17, journey.revealAge)
        : storyId === "academy-destroyer"
          ? Math.min(17, journey.revealAge)
          : journey.revealAge;
      const baseAfterYouth: GameState = {
        ...current,
        phase: "youth",
        archetype: journey.formation.archetype,
        revealAge,
        youthScore: journey.score + (storyId === "academy-destroyer" ? 7 : storyId === "late-bloomer" ? -4 : 0),
        youthYears: journey.youthYears,
        proOffers: journey.offers,
        age: revealAge,
        // A base é uma introdução sem calendário rígido; toda carreira nova entra no profissional em 2027.
        season: 2027,
        overall: journey.overall,
        potential: journey.potential,
        attributes: createPlayerAttributes(current.position, journey.overall, current.seed),
        traits: selectCareerTraits(current.position, current.seed),
        morale: clamp(68 + Math.round(journey.score / 4)),
        fitness: 94,
      };
      const originated = applyStoryOrigin(baseAfterYouth, storyId);
      const finalOverall = clamp(
        originated.overall + (storyId === "academy-destroyer" ? 2 : storyId === "late-bloomer" ? -1 : 0),
        42,
        76,
      );
      return {
        ...originated,
        overall: finalOverall,
        potential: clamp(originated.potential + (storyId === "late-bloomer" ? 2 : storyId === "disillusioned" ? 1 : 0), 58, 97),
        attributes: shiftPlayerAttributes(originated.attributes, finalOverall - originated.overall, current.position, current.seed + 1777),
        rivals: createCareerRivals(current.seed, revealAge, finalOverall, appSettings.customCharacters),
        storyFlags: storyId === "academy-reject"
          ? [`dispensado-por:${storyClubCandidate(originated, 1901, "reject").id}`]
          : [],
        // No desafio a base é sempre simulada (sem a escolha); fora dele, a escolha aparece na fase "youth".
        youthPlay: current.challengeId ? { mode: "simulate", years: [], current: 0, bonus: null } : null,
      };
    });
    vibrate();
  }

  // A escolha vale uma vez (youth-play.ts, chooseYouthMode). "Jogar" chega com o painel, sob demanda:
  // o clique já baixa a lista dos anos, que grava a escolha ao abrir e pré-aquece a cena do Scorebobo.
  function pickYouthMode(mode: "simulate" | "play") {
    vibrate();
    if (mode === "play") {
      setYouthPlayRequested(true);
      return;
    }
    setYouthStep(0);
    setYouthFinished(false);
    setGame((current) => current.youthPlay ? current : { ...current, youthPlay: { mode: "simulate", years: [], current: 0, bonus: null } });
  }

  function selectRandomPlayerStory() {
    const story = PLAYER_STORIES[Math.floor(Math.random() * PLAYER_STORIES.length)] ?? PLAYER_STORIES[0];
    selectPlayerStory(story.id);
  }

  function signProfessional(clubId: string) {
    setGame((current) => {
      const club = clubById(clubId);
      const league = leagueById(club.leagueId);
      const managerTrust = clubId === current.academyClubId ? 58 : 44;
      const squadRole = calculateSquadRole(current.overall, club, league.prestige, managerTrust, current.age);
      const contract = createContract(current.overall, current.age, club, current.seed);
      return {
        ...current,
        phase: "career",
        currentClubId: clubId,
        currentLeagueId: club.leagueId,
        currentEventId: FIRST_MATCH_EVENT.id,
        nextEventId: "",
        reputation: clubId === current.academyClubId ? 8 : 4,
        fanSupport: clubId === current.academyClubId ? 68 : 50,
        continentalSlot: initialContinentalSlot(club),
        money: 0,
        managerTrust,
        squadRole,
        contractYears: contract.years,
        annualSalary: contract.annualSalary,
        currentObjective: createSeasonObjective(positionByKey(current.position), squadRole, current.season, current.seed),
        followers: 1_200 + club.reputation * 900,
        socialFeed: [{
          id: `${current.seed}-${current.season}-first-contract`,
          season: current.season,
          source: "press",
          author: "Central do Futebol",
          text: `${current.name} assinou o primeiro contrato profissional com o ${club.shortName}.`,
          likes: 340 + club.reputation * 120,
          tone: "positive",
        }],
        newsFeed: [`${current.season}: primeiro contrato assinado com o ${club.shortName}.`],
      };
    });
    setActiveTab("event");
    vibrate();
  }

  function chooseEvent(choiceIndex: number) {
    const choice = currentEvent.choices[choiceIndex];
    if (!choice) return;
    if (choice.luck) {
      const succeeded = seeded(game.seed, game.season * 127 + choiceIndex * 17 + game.history.length) < choice.luck.chance / 100;
      setLuckSpin({ event: currentEvent, choiceIndex, succeeded });
      vibrate();
      return;
    }
    setGame((current) => simulateSeason(
      current,
      currentEvent,
      choice.effect,
      choice.label,
      choice.result,
      null,
      appSettings.finalMatchMode ?? "play-key-matches",
    ));
    vibrate();
  }

  function attemptPositionChange() {
    if (!positionChangeTarget || game.positionChangeCooldownSeason >= game.season || positionChangeTarget === game.position) return;
    const fromPosition = positionByKey(game.position);
    const toPosition = positionByKey(positionChangeTarget);
    const sameZone = fromPosition.zone === toPosition.zone;
    const goalkeeperSwitch = fromPosition.zone === "gol" || toPosition.zone === "gol";
    const zonePenalty = goalkeeperSwitch ? 38 : sameZone ? 0 : 14;
    const agePenalty = Math.max(0, game.age - 22) * 2.15;
    const chance = clamp(
      Math.round(78 + game.managerTrust * 0.08 + game.morale * 0.04 + (game.traits.includes("versatile") ? 15 : 0) - zonePenalty - agePenalty),
      16,
      88,
    );
    const succeeded = seeded(
      game.seed,
      game.season * 353 + POSITIONS.findIndex((item) => item.key === positionChangeTarget) * 29 + game.history.length,
    ) * 100 < chance;
    setGame((current) => ({
      ...current,
      position: succeeded ? positionChangeTarget : current.position,
      positionChangeCooldownSeason: current.season,
      morale: clamp(current.morale + (succeeded ? 5 : -4)),
      managerTrust: clamp(current.managerTrust + (succeeded ? -3 : -6)),
      currentObjective: succeeded
        ? createSeasonObjective(toPosition, current.squadRole, current.season, current.seed + current.history.length * 41)
        : current.currentObjective,
    }));
    setPositionChangeFeedback({
      success: succeeded,
      headline: succeeded ? `Agora você é ${toPosition.name}` : "O treinador recusou a mudança",
      text: succeeded
        ? `A adaptação começou. Sua confiança caiu um pouco enquanto você aprende a nova função, mas a carreira ganhou outro caminho.`
        : `A comissão acredita que a troca para ${toPosition.name} prejudicaria o time agora. Você poderá tentar outra vez na próxima temporada.`,
    });
    setPositionChangeOpen(false);
    setPositionChangeTarget(null);
    vibrate();
  }

  function applyBotaoMatchResult(matchResult: BotaoMatchResult, setupOverride?: BotaoMatchSetup | null, pendingMatchId = currentBotaoMatch?.id) {
    const resolvedSetup = setupOverride ?? currentBotaoSetup;
    localStorage.removeItem(BOTAO_IN_PROGRESS_KEY);
    setGame((current) => {
      const match = current.pendingBotaoMatches[0];
      if (!match || match.id !== pendingMatchId || matchResult.matchId !== resolvedSetup?.matchId) return current;
      // Replay só existe para a tela imediatamente após o apito. Arquivar os
      // frames em cada temporada multiplicava o tamanho do save a cada partida.
      const archivedMatchResult = compactBotaoMatchResult(matchResult);

      const formerClub = match.source === "club" && isFormerClubOpponent(current, match.opponentId)
        ? clubById(match.opponentId)
        : null;
      const interviewEligible = !matchResult.simulated && !matchResult.walkover && Boolean(resolvedSetup);

      let remainingMatches = current.pendingBotaoMatches.slice(1);
      let nextState: GameState = {
        ...current,
        phase: "botao-result",
        pendingBotaoMatches: remainingMatches,
        lastBotaoResult: { match, result: matchResult },
        pendingPressConference: interviewEligible && formerClub
          ? buildFormerClubConference(current, match, matchResult, formerClub)
          : interviewEligible && (matchResult.manOfTheMatch || matchResult.playerGoals >= 3) && resolvedSetup
            ? buildPressConference(current, match, matchResult, resolvedSetup.cpuTeam.shortName)
            : null,
      };

      if (match.source === "club") {
        const competitionId = match.competitionId as CompetitionId;
        const outcome = finalOutcome(matchResult);
        const worldStages = ["Playoff Mundial", "Quartas de final", "Semifinal", "Final"];
        const worldStageIndex = worldStages.indexOf(match.stageName);
        const worldRoundWon = match.worldCampaign && matchResult.champion;
        const worldFinalWon = Boolean(worldRoundWon && match.stageName === "Final");
        const resolvedChampion = match.worldCampaign ? worldFinalWon : outcome.champion;
        const nextWorldStage = match.worldCampaign && worldRoundWon && match.stageName !== "Final"
          ? worldStages[worldStageIndex + 1]
          : "";
        const resolvedStage = match.worldCampaign
          ? worldFinalWon
            ? "CAMPEÃO"
            : nextWorldStage
              ? `Classificado — ${nextWorldStage}`
              : match.stageName === "Final"
                ? "Vice"
                : `Eliminado — ${match.stageName}`
          : outcome.stage;
        const titleResolved = !match.worldCampaign || !nextWorldStage;
        const titleDelta = titleResolved ? Number(resolvedChampion) - Number(match.rngChampion) : 0;
        const updateCompetitions = (competitions: CompetitionResult[]) =>
          competitions.map((competition) =>
            competition.id === competitionId
              ? { ...competition, champion: resolvedChampion, stage: resolvedStage }
              : competition,
          );
        const updatedLastCompetitions = updateCompetitions(current.lastResult?.competitions ?? []);
        const updatedHistory = current.history.map((record) => {
          if (record.season !== match.season || record.clubId !== current.currentClubId) return record;
          const recordCompetitions = updateCompetitions(record.competitions);
          return {
            ...record,
            goals: record.goals + matchResult.playerGoals,
            assists: record.assists + matchResult.playerAssists,
            competitions: recordCompetitions,
            title: recordCompetitions.some((competition) => competition.champion),
            botaoResults: [...(record.botaoResults ?? []), { match, result: archivedMatchResult }],
          };
        });
        const updatedCabinet = {
          ...current.trophyCabinet,
          [competitionId]: Math.max(0, current.trophyCabinet[competitionId] + titleDelta),
        };
        const updatedLastResult = current.lastResult
          ? {
              ...current.lastResult,
              goals: current.lastResult.goals + matchResult.playerGoals,
              assists: current.lastResult.assists + matchResult.playerAssists,
              competitions: updatedLastCompetitions,
              title: updatedLastCompetitions.some((competition) => competition.champion),
              botaoResults: [...(current.lastResult.botaoResults ?? []), { match, result: archivedMatchResult }],
            }
          : null;
        const qualificationClub = clubById(current.currentClubId);
        const qualificationLeague = leagueById(current.lastResult?.leagueId ?? qualificationClub.leagueId);
        const finalGoalContributions = matchResult.playerGoals + matchResult.playerAssists;
        const relevantFinalForManagerTrust =
          !matchResult.simulated &&
          !matchResult.walkover &&
          match.stageName === "Final" &&
          !["domesticSuperCup", "uefaSuperCup", "recopaSudamericana"].includes(competitionId);
        const finalManagerTrustBoost = relevantFinalForManagerTrust
          ? finalGoalContributions >= 3
            ? 50
            : finalGoalContributions === 2
              ? 30
              : 0
          : 0;
        const boostedManagerTrust = clamp(current.managerTrust + finalManagerTrustBoost);
        const boostedSquadRole = finalManagerTrustBoost > 0
          ? calculateSquadRole(
              current.overall,
              qualificationClub,
              qualificationLeague.prestige,
              boostedManagerTrust,
              current.age,
            )
          : current.squadRole;
        const resolvedLeagueResult = updatedLastCompetitions.find((competition) => competition.id === "domesticLeague");
        const resolvedLeaguePosition = resolvedLeagueResult?.champion
          ? 1
          : Number.parseInt(resolvedLeagueResult?.stage ?? "", 10) || Number.MAX_SAFE_INTEGER;
        const resolvedContinentalSlot = competitionId === "domesticCup"
          ? continentalSlotAfterSeason(
              qualificationClub,
              qualificationLeague,
              Boolean(resolvedLeagueResult?.champion),
              resolvedChampion,
              resolvedLeaguePosition,
            )
          : current.continentalSlot;
        if (nextWorldStage) {
          const excludedClubIds = Array.from(new Set([...(match.previousOpponentIds ?? []), match.opponentId]));
          const archivedOpponentId = nextWorldStage === "Final"
            ? worldFinalOpponentForSeason(current, current.currentClubId, match.season)
            : "";
          const opponent = archivedOpponentId && !excludedClubIds.includes(archivedOpponentId)
            ? clubById(archivedOpponentId)
            : pickClubWorldOpponent({
            clubId: current.currentClubId,
            seed: current.seed,
            season: match.season,
            stageName: nextWorldStage,
            excludedClubIds,
            });
          remainingMatches = [{
            ...match,
            id: `club-mundial-${nextWorldStage}-${match.season}`,
            stageName: nextWorldStage,
            opponentId: opponent.id,
            previousOpponentIds: excludedClubIds,
          }, ...remainingMatches];
        }
        const continentalFinal = ["libertadores", "championsLeague", "concacafChampions", "afcChampions", "cafChampions"].includes(competitionId);
        const qualifiesForWorld = continentalFinal && resolvedChampion;
        const lostWorldTicket =
          continentalFinal &&
          match.rngChampion &&
          !resolvedChampion &&
          current.worldQualifiedSeason === match.season + 1 &&
          current.worldQualifiedClubId === current.currentClubId;
        nextState = {
          ...nextState,
          pendingBotaoMatches: remainingMatches,
          history: updatedHistory,
          lastResult: updatedLastResult,
          stats: {
            ...current.stats,
            goals: current.stats.goals + matchResult.playerGoals,
            assists: current.stats.assists + matchResult.playerAssists,
          },
          trophies: Math.max(0, current.trophies + titleDelta),
          trophyCabinet: updatedCabinet,
          continentalSlot: resolvedContinentalSlot,
          reputation: clamp(current.reputation + (resolvedChampion ? 3 : nextWorldStage ? 1 : -1)),
          fanSupport: clamp(current.fanSupport + (resolvedChampion ? 6 : nextWorldStage ? 2 : -3)),
          morale: clamp(current.morale + (resolvedChampion ? 4 : nextWorldStage ? 2 : -2)),
          managerTrust: boostedManagerTrust,
          squadRole: boostedSquadRole,
          currentObjective: finalManagerTrustBoost > 0
            ? createSeasonObjective(
                positionByKey(current.position),
                boostedSquadRole,
                current.season,
                current.seed + current.history.length * 31,
              )
            : current.currentObjective,
          worldQualifiedSeason: qualifiesForWorld
            ? match.season + 1
            : lostWorldTicket
              ? 0
              : current.worldQualifiedSeason,
          worldQualifiedClubId: qualifiesForWorld
            ? current.currentClubId
            : lostWorldTicket
              ? ""
              : current.worldQualifiedClubId,
          newsFeed: [
            match.worldCampaign
              ? `${match.competitionName} · ${match.stageName}: ${matchResult.champion ? (nextWorldStage ? `classificado para ${nextWorldStage}` : "campeão do mundo") : "eliminado"} contra ${clubById(match.opponentId).shortName}.`
              : resolvedSetup
              ? describeFinal(resolvedSetup, matchResult)
              : `${match.competitionName}: ${resolvedChampion ? "campeão" : "vice"}.`,
            ...(finalManagerTrustBoost > 0
              ? [
                  `Confiança do treinador +${finalManagerTrustBoost}% após ${finalGoalContributions} participações em gol na final${boostedSquadRole !== current.squadRole ? ` · novo status: ${ROLE_LABELS[boostedSquadRole]}` : ""}.`,
                ]
              : []),
            ...current.newsFeed,
          ].slice(0, 16),
        };
      } else {
        const stageOrder = ["16 avos de final", "Oitavas de final", "Quartas de final", "Semifinal", "Final"];
        const currentStageIndex = Math.max(0, stageOrder.indexOf(match.stageName));
        const wonRound = matchResult.champion;
        const wonTournament = wonRound && currentStageIndex === stageOrder.length - 1;
        const nextStageName = wonRound && !wonTournament ? stageOrder[currentStageIndex + 1] : "";
        const stageAfterMatch = wonTournament
          ? "CAMPEÃO"
          : wonRound
            ? `Classificado — ${nextStageName}`
            : match.stageName === "Final"
              ? "Vice"
              : match.stageName.replace(" de final", "");
        const nationalTitleDelta = wonTournament
          ? Number(!match.rngChampion)
          : wonRound
            ? 0
            : -Number(match.rngChampion);
        const updatedNationalHistory = current.nationalHistory.map((record) => {
          if (record.season !== match.season || record.name !== match.competitionName) return record;
          const baseTournamentStats = record.name === "Copa do Mundo"
            ? record.tournamentStats ?? simulatedWorldCupStats(current, match.stageName === "Final" ? 7 : 3, 1009)
            : null;
          const tournamentStats = baseTournamentStats
            ? {
                ...baseTournamentStats,
                appearances: baseTournamentStats.appearances + 1,
                goals: baseTournamentStats.goals + matchResult.playerGoals,
                assists: baseTournamentStats.assists + matchResult.playerAssists,
                knockoutAppearances: baseTournamentStats.knockoutAppearances + 1,
                knockoutGoals: baseTournamentStats.knockoutGoals + matchResult.playerGoals,
                knockoutAssists: baseTournamentStats.knockoutAssists + matchResult.playerAssists,
              }
            : record.tournamentStats;
          return { ...record, stage: stageAfterMatch, champion: wonTournament, tournamentStats };
        });
        const updatedWorldCupStats = updatedNationalHistory.find((record) =>
          record.season === match.season && record.name === "Copa do Mundo"
        )?.tournamentStats;
        const storedNationalResult = { match, result: archivedMatchResult };

        if (nextStageName) {
          const previouslyPlayedOpponents = (current.lastResult?.botaoResults ?? [])
            .filter(({ match: playedMatch }) =>
              playedMatch.source === "national" &&
              playedMatch.season === match.season &&
              playedMatch.competitionId === match.competitionId,
            )
            .map(({ match: playedMatch }) => playedMatch.opponentId);
          const excludedCountryIds = Array.from(new Set([
            ...(match.previousOpponentIds ?? []),
            ...previouslyPlayedOpponents,
            match.opponentId,
          ]));
          const opponent = pickNationalOpponent({
            countryId: current.nationality,
            seed: current.seed,
            season: match.season,
            competitionId: match.competitionId,
            stageName: nextStageName,
            excludedCountryIds,
          });
          const nextRound: PendingBotaoMatch = {
            ...match,
            id: `national-${match.competitionId}-${nextStageName}-${match.season}`,
            stageName: nextStageName,
            opponentId: opponent.id,
            previousOpponentIds: excludedCountryIds,
          };
          remainingMatches = [nextRound, ...remainingMatches];
        }

        nextState = {
          ...nextState,
          pendingBotaoMatches: remainingMatches,
          nationalHistory: updatedNationalHistory,
          nationalCaps: current.nationalCaps + 1,
          nationalGoals: current.nationalGoals + matchResult.playerGoals,
          nationalAssists: current.nationalAssists + matchResult.playerAssists,
          nationalTrophies: Math.max(0, current.nationalTrophies + nationalTitleDelta),
          reputation: clamp(current.reputation + (wonTournament ? 5 : wonRound ? 2 : -1)),
          fanSupport: clamp(current.fanSupport + (wonTournament ? 8 : wonRound ? 3 : -2)),
          morale: clamp(current.morale + (wonTournament ? 6 : wonRound ? 2 : -3)),
          lastResult: current.lastResult
            ? applyNationalBotaoProduction({
                ...current.lastResult,
                nationalNote: `${match.competitionName}: ${stageAfterMatch}${
                  updatedWorldCupStats
                    ? ` · ${updatedWorldCupStats.appearances}J, ${updatedWorldCupStats.goals}G, ${updatedWorldCupStats.assists}A`
                    : ""
                }`,
              }, storedNationalResult)
            : null,
          history: current.history.map((record) =>
            record.season === match.season
              ? applyNationalBotaoProduction(record, storedNationalResult)
              : record,
          ),
          newsFeed: [
            `${match.competitionName} · ${match.stageName}: ${countryById(current.nationality).name} ${
              wonRound ? "avançou" : "foi eliminado"
            } contra ${countryById(match.opponentId).name}.`,
            ...current.newsFeed,
          ].slice(0, 16),
        };
      }

      const latestClubCompetitions = nextState.lastResult?.competitions ?? [];
      const hasMajorClubTitle = latestClubCompetitions.some((competition) =>
        competition.champion &&
        !BALLON_DOR_EXCLUDED_TROPHIES.has(competition.id),
      );
      const hasMajorNationalTitle = nextState.nationalHistory.some((record) =>
        record.season === match.season &&
        record.champion &&
        ["Copa do Mundo", "Eurocopa", "Copa América", "Copa Ouro", "Copa da Ásia", "Copa Africana de Nações", "Copa das Nações da OFC"].includes(record.name),
      );
      if (
        !nextState.pendingBotaoMatches.some((pending) => pending.season === match.season) &&
        !hasMajorClubTitle &&
        !hasMajorNationalTitle &&
        nextState.lastResult?.awards.includes("Bola de Ouro")
      ) {
        const updatedAwardCabinet = { ...nextState.awardCabinet };
        updatedAwardCabinet["Bola de Ouro"] = Math.max(0, (updatedAwardCabinet["Bola de Ouro"] ?? 1) - 1);
        const demotedNominations = nextState.lastResult.awardNominations.map((nomination) =>
          nomination.award === "Bola de Ouro" && nomination.won
            ? {
                ...nomination,
                won: false,
                winner: fictionalAwardWinner(current.name, "Bola de Ouro", current.seed, match.season, current.rivals),
              }
            : nomination,
        );
        const updatedLastResult = {
          ...nextState.lastResult,
          awards: nextState.lastResult.awards.filter((award) => award !== "Bola de Ouro"),
          awardNominations: demotedNominations,
        };
        nextState = {
          ...nextState,
          awards: Math.max(0, nextState.awards - 1),
          awardCabinet: updatedAwardCabinet,
          lastResult: updatedLastResult,
          history: nextState.history.map((record) =>
            record.season === match.season
              ? {
                  ...record,
                  awards: record.awards.filter((award) => award !== "Bola de Ouro"),
                  awardNominations: demotedNominations,
                }
              : record,
          ),
        };
      }

      const seasonResolved = !nextState.pendingBotaoMatches.some((pending) => pending.season === match.season);
      nextState = settleSeasonScouting(nextState);
      const resolvedResult = nextState.lastResult;
      const playsInEurope = isEuropeanClub(clubById(nextState.currentClubId));
      const resolvedWorldCupStats = worldCupStatsForSeason(nextState, match.season);
      const alreadyHasBallon = Boolean(resolvedResult?.awards.includes("Bola de Ouro"));
      const hasProductionAward = Boolean(resolvedResult?.awards.some((award) =>
        award.includes("Artilheiro") ||
        award.includes("Chuteira de Ouro") ||
        award.includes("Rei das Assistências") ||
        award === WORLD_CUP_ASSIST_LEADER,
      ));
      const worldCupBallonSurge = Boolean((resolvedWorldCupStats?.goals ?? 0) >= 8);
      const manualBallonEligible = Boolean(
        seasonResolved &&
        resolvedResult &&
        !alreadyHasBallon &&
        hasProductionAward &&
        (hasMajorClubTitle || hasMajorNationalTitle) &&
        (
          (worldCupBallonSurge && nextState.overall >= 80 && resolvedResult.performanceScore >= 70) ||
          (playsInEurope && nextState.overall >= 84 && resolvedResult.performanceScore >= 80) ||
          (!playsInEurope && nextState.overall >= 89 && resolvedResult.performanceScore >= 87)
        ),
      );
      if (manualBallonEligible && resolvedResult) {
        const chance = clamp(
          10 +
          Math.max(0, resolvedResult.performanceScore - 80) * 1.45 +
          Math.max(0, nextState.overall - 84) * 1.2 +
          (worldCupBallonSurge ? 68 + Math.min(10, ((resolvedWorldCupStats?.goals ?? 8) - 8) * 2) : 0),
          10,
          worldCupBallonSurge ? 96 : 46,
        );
        const wonAfterFinal = seeded(nextState.seed, match.season * 109) * 100 < chance;
        const hasWorldXi = resolvedResult.awards.includes("FIFPRO World XI");
        const addedAwards = wonAfterFinal
          ? [...(!hasWorldXi ? ["FIFPRO World XI"] : []), "Bola de Ouro"]
          : [];
        const existingBallonNomination = resolvedResult.awardNominations.some((nomination) => nomination.award === "Bola de Ouro");
        const ballot: AwardNomination | null = wonAfterFinal
          ? {
              award: "Bola de Ouro",
              won: true,
              winner: nextState.name,
              finalists: awardFinalists(nextState.name, "Bola de Ouro", nextState.seed, match.season, nextState.rivals),
            }
          : !existingBallonNomination && seeded(nextState.seed, match.season * 313) < 0.68
            ? {
                award: "Bola de Ouro",
                won: false,
                winner: fictionalAwardWinner(nextState.name, "Bola de Ouro", nextState.seed, match.season, nextState.rivals),
                finalists: awardFinalists(nextState.name, "Bola de Ouro", nextState.seed, match.season, nextState.rivals),
              }
            : null;
        if (addedAwards.length > 0 || ballot) {
          const updatedAwardCabinet = { ...nextState.awardCabinet };
          addedAwards.forEach((award) => {
            updatedAwardCabinet[award] = (updatedAwardCabinet[award] ?? 0) + 1;
          });
          const updateResolvedAwards = (record: SeasonRecord | SeasonResult) => ({
            ...record,
            awards: [...record.awards, ...addedAwards],
            awardNominations: ballot
              ? [
                  ...record.awardNominations.filter((nomination) => nomination.award !== "Bola de Ouro"),
                  ballot,
                ].sort((a, b) => awardTierWeight(b.award) - awardTierWeight(a.award))
              : record.awardNominations,
          });
          nextState = {
            ...nextState,
            awards: nextState.awards + addedAwards.length,
            awardCabinet: updatedAwardCabinet,
            lastResult: updateResolvedAwards(resolvedResult) as SeasonResult,
            history: nextState.history.map((record) =>
              record.season === match.season ? updateResolvedAwards(record) : record,
            ),
          };
        }
      }

      return {
        ...nextState,
        legacyPoints: legacyBreakdownForState(nextState).total,
      };
    });
    setBotaoMatchStarted(false);
    setBotaoSimulating(false);
    vibrate();
  }

  function simulateCurrentBotaoMatch() {
    if (!currentBotaoSetup || botaoSimulating) return;
    localStorage.removeItem(BOTAO_IN_PROGRESS_KEY);
    setBotaoSimulating(true);
    window.setTimeout(() => applyBotaoMatchResult(simulateBotaoMatch(currentBotaoSetup)), 30);
  }

  function startCurrentBotaoMatch() {
    if (!currentBotaoSetup) return;
    const saveKey = game.challengeId ? CHALLENGE_SAVE_KEY : SAVE_KEY;
    // Persiste a decisão antes de abrir o campo: fechar, recarregar ou travar
    // depois deste ponto precisa contar como abandono, mesmo antes do próximo efeito.
    localStorage.setItem(saveKey, JSON.stringify(game));
    localStorage.setItem(BOTAO_IN_PROGRESS_KEY, JSON.stringify({
      saveKey,
      matchId: currentBotaoSetup.matchId,
      startedAt: Date.now(),
    }));
    setBotaoMatchStarted(true);
    vibrate();
  }

  function continueAfterBotaoResult() {
    if (game.pendingPressConference) {
      setPressConferenceOpen(true);
      return;
    }
    setGame((current) => ({
      ...current,
      phase: current.pendingBotaoMatches.length ? "botao-final" : "season-result",
    }));
    setBotaoMatchStarted(false);
    setActiveGoalReplay(null);
    vibrate();
  }

  function answerPressConference(answerIndex: number) {
    const visibleConference = game.pendingPressConference;
    const finished = Boolean(
      visibleConference &&
      visibleConference.questionIndex + 1 >= visibleConference.questions.length,
    );
    setGame((current) => {
      const conference = current.pendingPressConference;
      const question = conference?.questions[conference.questionIndex];
      const answer = question?.answers[answerIndex];
      if (!conference || !question || !answer) return current;
      const affected = applyEffect(current, answer.effect);
      const nextIndex = conference.questionIndex + 1;
      const completed = nextIndex >= conference.questions.length;
      const pressSource = conference.kind === "presentation" ? "Sala de Imprensa" : "Zona Mista";
      const pressMoment = conference.kind === "presentation"
        ? `na apresentação pelo ${conference.opponentName}`
        : conference.kind === "former-club"
          ? `depois do reencontro com o ${conference.opponentName}`
          : `após ${conference.competitionName}`;
      const post: SocialPost = {
        id: `${current.seed}-${conference.matchId}-press-${conference.questionIndex}`,
        season: current.lastResult?.season ?? current.season - 1,
        source: "press",
        author: pressSource,
        text: `“${answer.label}” — ${current.name}, ${pressMoment}.`,
        likes: Math.max(500, Math.round((current.followers + 10_000) * (0.02 + seeded(current.seed, conference.questionIndex + current.season) * 0.04))),
        tone: answer.tone === "bold" ? "positive" : "neutral",
      };
      return {
        ...affected,
        pendingPressConference: completed ? null : { ...conference, questionIndex: nextIndex },
        socialFeed: [post, ...affected.socialFeed].slice(0, 24),
        newsFeed: [`Coletiva: ${answer.result}`, ...affected.newsFeed].slice(0, 16),
      };
    });
    if (finished) setPressConferenceOpen(false);
    vibrate();
  }

  function continueAfterConsequence() {
    setGame((current) => ({
      ...current,
      phase: current.pendingBotaoMatches.length ? "botao-final" : "season-result",
    }));
    vibrate();
  }

  function resolveStoryDecision(choiceIndex: number) {
    setGame((current) => {
      const decision = current.pendingStoryDecision;
      const choice = decision?.choices[choiceIndex];
      if (!decision || !choice) return current;
      const affected = applyEffect(current, choice.effect);
      const transferOffers = choice.transferClubId
        ? [choice.transferClubId, ...affected.transferOffers.filter((clubId) => clubId !== choice.transferClubId)].slice(0, 10)
        : affected.transferOffers;
      return {
        ...affected,
        pendingStoryDecision: null,
        storyFlags: Array.from(new Set([...affected.storyFlags, choice.flag])),
        storyLog: [
          ...affected.storyLog,
          {
            season: affected.lastResult?.season ?? affected.season - 1,
            chapter: decision.chapter,
            decisionId: decision.id,
            title: decision.title,
            choice: choice.label,
            result: choice.result,
          },
        ],
        transferOffers,
        newsFeed: [
          `${affected.lastResult?.season ?? affected.season - 1}: ${choice.result}`,
          ...affected.newsFeed,
        ].slice(0, 16),
      };
    });
    vibrate();
  }

  function continueAfterResult() {
    if (game.pendingStoryDecision) return;
    if (game.retireAfterSeason) {
      setGame((current) => ({ ...current, phase: "summary", lastConsequence: null }));
      setActiveTab("event");
      vibrate();
      return;
    }
    if ((game.activeLoan || game.loanParentClubId) && game.season >= (game.activeLoan?.endSeason ?? game.loanEndSeason)) {
      setGame((current) => {
        const loanBuyout = loanClubPermanentOffer(current);
        const returned = completeLoanReturn(current);
        const parentClub = clubById(returned.currentClubId);
        const loanClub = loanBuyout ? clubById(loanBuyout.offer.clubId) : null;
        const league = leagueById(parentClub.leagueId);
        const managerTrust = 48;
        const squadRole = calculateSquadRole(returned.overall, parentClub, league.prestige, managerTrust, returned.age);
        const transferMarketOffers = loanBuyout
          ? [
              loanBuyout.offer,
              ...returned.transferMarketOffers.filter((offer) => offer.clubId !== loanBuyout.offer.clubId),
            ].slice(0, 10)
          : returned.transferMarketOffers;
        const transferOffers = loanBuyout
          ? Array.from(new Set([loanBuyout.offer.clubId, ...returned.transferOffers])).slice(0, 10)
          : returned.transferOffers;
        return {
          ...returned,
          phase: transferOffers.length ? "transfer" : "career",
          transferOffers,
          transferMarketOffers,
          currentEventId: returned.nextEventId || "extra-training",
          lastResult: transferOffers.length ? returned.lastResult : null,
          lastConsequence: null,
          managerTrust,
          squadRole,
          transferStatus: loanBuyout && loanClub
            ? {
                success: true,
                chance: 100,
                headline: `${loanClub.shortName} quer ficar com você`,
                text: `Sua média ${loanBuyout.averageRating.toFixed(1)} durante o empréstimo convenceu o clube a tentar uma contratação definitiva. A proposta aparece primeiro no mercado.`,
              }
            : returned.transferStatus,
          currentObjective: createSeasonObjective(positionByKey(returned.position), squadRole, returned.season, returned.seed + 701),
          newsFeed: [
            loanBuyout && loanClub
              ? `${returned.season}: após média ${loanBuyout.averageRating.toFixed(1)}, o ${loanClub.shortName} apresentou proposta para comprar ${returned.name} em definitivo.`
              : `${returned.season}: retorno ao ${parentClub.shortName} após o fim do empréstimo.`,
            ...returned.newsFeed,
          ].slice(0, 16),
        };
      });
      setActiveTab("event");
      vibrate();
      return;
    }
    if (game.transferOffers.length) {
      setGame((current) => ({ ...current, phase: "transfer", lastConsequence: null }));
    } else {
      setGame((current) => ({
        ...current,
        phase: "career",
        currentEventId: current.nextEventId || "extra-training",
        lastResult: null,
        lastConsequence: null,
        transferRequested: false,
        renewalDenied: false,
        forcedAlternativeTransfer: false,
        isFreeAgent: false,
      }));
    }
    setActiveTab("event");
    vibrate();
  }

  function chooseTransfer(offer: TransferOffer | null) {
    setGame((current) => {
      if (!offer && current.pendingTransferMode === "loan" && current.transferStatus?.headline === "Empréstimo autorizado") {
        return { ...current, phase: "career", transferOffers: [], transferMarketOffers: [], transferRequested: false, transferStatus: null, pendingTransferMode: "permanent" };
      }
      if (!offer && current.youthLoanDecision) {
        const stayed = stayAfterYouthLoanRecommendation(current);
        return {
          ...stayed,
          phase: "career",
          currentEventId: current.nextEventId || selectNextEvent(stayed, current.season * 47),
          nextEventId: "",
          lastResult: null,
          lastConsequence: null,
          managerTrust: clamp(current.managerTrust + 5),
          morale: clamp(current.morale + 2),
        };
      }
      if (!offer && (current.transferRequested || current.renewalDenied || current.forcedClubExit || current.forcedAlternativeTransfer)) return current;
      if (!offer && (current.isFreeAgent || current.pendingTransferMode === "loan")) return current;
      const acceptedOffer = offer ?? (current.contractYears === 0 ? buildRenewalOffer(current) : null);
      const newClub = acceptedOffer && acceptedOffer.type !== "renewal" ? clubById(acceptedOffer.clubId) : null;
      const oldClub = clubById(current.currentClubId);
      const targetClub = newClub ?? oldClub;
      const targetLeague = leagueById(targetClub.leagueId);
      const rivalry = newClub ? findRivalry(oldClub.id, newClub.id) : undefined;
      const pendingCareerEventId = current.nextEventId;
      const offerIndex = Math.max(0, current.transferOffers.indexOf(acceptedOffer?.clubId ?? ""));
      const transferNewsPool = NEWS_TEMPLATES.filter((item) => item.category === (newClub ? "transfer" : "contract"));
      const genericTransferNews = fillNewsTemplate(
        pick(transferNewsPool, current.seed, current.season + offerIndex)?.template ?? "{player} define o futuro no {club}",
        {
          player: current.name,
          club: targetClub.shortName,
          season: String(current.season),
          rival: rivalry?.nickname ?? "o rival",
          competition: targetLeague.name,
        },
      );
      const transferHeadline = acceptedOffer?.type === "loan"
        ? `${current.name} deixa o ${oldClub.shortName} por empréstimo e vai jogar no ${targetClub.shortName}.`
        : rivalry
        ? pick(rivalry.headlines, current.seed, current.season)
        : genericTransferNews;
      const moved = acceptedOffer ? applyAcceptedTransfer(current, acceptedOffer) : current;
      const managerTrust = acceptedOffer ? moved.managerTrust : clamp(current.managerTrust + 5);
      const squadRole = acceptedOffer ? moved.squadRole : calculateSquadRole(current.overall, targetClub, targetLeague.prestige, managerTrust, current.age);
      const transferred: GameState = {
        ...moved,
        phase: "career",
        currentEventId: "",
        nextEventId: "",
        lastResult: null,
        lastConsequence: null,
        transferOffers: [],
        transferMarketOffers: [],
        morale: clamp(current.morale + (newClub ? 5 : 2)),
        forcedAlternativeTransfer: false,
        forcedFreeAgentUntilSeason: 0,
        managerTrust,
        squadRole,
        clubCaptain: newClub ? false : current.clubCaptain,
        currentObjective: createSeasonObjective(positionByKey(current.position), squadRole, current.season, current.seed + current.season),
        newsFeed: [
          transferHeadline,
          ...current.newsFeed,
        ].slice(0, 12),
      };
      const presentation = transferred.pendingPressConference ?? (acceptedOffer && newClub && current.overall > 80
        ? buildTransferPresentation(transferred, oldClub, newClub, acceptedOffer)
        : null);
      return {
        ...transferred,
        pendingPressConference: presentation,
        currentEventId: newClub ? selectNextEvent(transferred, current.season * 47) : (pendingCareerEventId || selectNextEvent(transferred, current.season * 47)),
      };
    });
    setActiveTab("event");
    vibrate();
  }

  function becomeFreeAgent() {
    setGame((current) => {
      if (current.contractYears > 0 || current.pendingTransferMode === "loan") return current;
      const prepared = { ...current, isFreeAgent: true, transferRequested: true };
      const richOffers = generateTransferOffers(prepared, current.season * 509, { includeForeign: true, mode: "free-agent", trigger: "contract-expired", count: 10 });
      const offers = richOffers.map((offer) => offer.clubId);
      return {
        ...current,
        phase: "transfer",
        transferOffers: offers,
        transferMarketOffers: richOffers,
        transferRequested: true,
        isFreeAgent: true,
        freeAgentSinceSeason: current.season,
        transferStatus: {
          success: true,
          chance: 100,
          headline: "Você entrou no mercado sem clube",
          text: `Sem taxa de transferência, seu empresário encontrou ${offers.length} projetos. Agora não existe opção de voltar atrás.`,
        },
        newsFeed: [`${current.season}: ${current.name} recusou a renovação e virou agente livre.`, ...current.newsFeed].slice(0, 16),
      };
    });
    vibrate();
  }

  function waitAsFreeAgent() {
    setGame((current) => {
      if (!current.isFreeAgent || (current.age >= 42 && current.forcedFreeAgentUntilSeason <= current.season)) return current;
      const nextSeason = current.season + 1;
      const stillBanned = current.forcedFreeAgentUntilSeason > nextSeason;
      const banJustEnded = current.forcedFreeAgentUntilSeason > 0 && !stillBanned;
      const waited: GameState = {
        ...current,
        age: current.age + 1,
        season: nextSeason,
        morale: clamp(current.morale - 5),
        fitness: clamp(Math.round(current.fitness * 0.7 + 82 * 0.3), 45, 94),
        money: Math.max(0, current.money - 180_000),
        spendableMoney: Math.max(0, current.spendableMoney - 180_000),
        freeAgentSinceSeason: current.freeAgentSinceSeason || current.season,
        forcedFreeAgentUntilSeason: banJustEnded ? 0 : current.forcedFreeAgentUntilSeason,
        transferStatus: {
          success: !stillBanned,
          chance: 100,
          headline: stillBanned ? "A punição ainda está valendo" : banJustEnded ? "O banimento terminou" : "Um ano passou sem clube",
          text: stillBanned
            ? `Nenhum clube pode registrar você. Faltam ${current.forcedFreeAgentUntilSeason - nextSeason} ano(s) para o mercado reabrir.`
            : banJustEnded
              ? "Depois de anos fora, seu nome voltou ao mercado e uma nova rodada de propostas chegou."
              : "Você preservou a liberdade, mas perdeu ritmo e pagou seus custos sem salário. Uma nova rodada de propostas chegou.",
        },
        newsFeed: [`${current.season}: ${current.name} passou a temporada como agente livre.`, ...current.newsFeed].slice(0, 16),
      };
      const richOffers = stillBanned ? [] : generateTransferOffers(waited, waited.season * 521, {
        includeForeign: true,
        mode: "free-agent",
        trigger: "free-agent-wait",
        count: 10,
      });
      return {
        ...waited,
        transferOffers: richOffers.map((offer) => offer.clubId),
        transferMarketOffers: richOffers,
      };
    });
    setToast(game.forcedFreeAgentUntilSeason > game.season + 1 ? "Mais um ano cumprido longe dos clubes" : "Nova temporada, novas propostas — sem jogos registrados");
    vibrate();
  }

  function buyCycleShopItem(itemId: CycleShopItemId, countryId?: string) {
    // O Treino especial não se compra: abre (ou retoma) o treino por cima da loja.
    if (itemId === "special-training") {
      openSpecialTraining();
      return;
    }
    const purchase = purchaseCycleShopItem(game, itemId, countryId);
    if (purchase.state === game) return;
    setGame(purchase.forcedClose
      ? { ...purchase.state, lastCycleShopSeason: game.season }
      : purchase.state);
    setCycleShopFeedback(purchase.feedback);
    setToast(purchase.toast);
    if (purchase.forcedClose) setCycleShopDismissedSeason(game.season);
    vibrate();
  }

  function closeCycleShop() {
    setGame((current) => ({ ...current, lastCycleShopSeason: current.season }));
    setCycleShopDismissedSeason(game.season);
    setCycleShopFeedback("");
    setSpecialTrainingOpen(false);
    vibrate();
  }

  /** O painel grava a chave da QUADRA e o par de fases ao abrir, antes da primeira jogada (recarregar não troca nem refaz). */
  function openSpecialTraining() {
    setCycleShopFeedback("");
    setSpecialTrainingOpen(true);
    vibrate();
  }

  function closeSpecialTraining(feedback?: string) {
    setSpecialTrainingOpen(false);
    if (feedback) setCycleShopFeedback(feedback);
  }

  function requestLoan() {
    setGame(requestPlayerLoan);
    vibrate();
  }

  function requestTransfer() {
    setGame((current) => {
      if (current.transferCooldownSeason >= current.season) return current;
      const decision = resolveTransferRequest(current, current.season * 97 + current.transferRequests * 13);
      if (decision.accepted) {
        return {
          ...current,
          phase: "transfer",
          transferOffers: decision.offers.map((offer) => offer.clubId),
          transferMarketOffers: decision.offers,
          transferRequests: current.transferRequests + 1,
          transferCooldownSeason: current.season,
          transferRequested: true,
          morale: clamp(current.morale + decision.moraleDelta),
          fanSupport: clamp(current.fanSupport + decision.fanSupportDelta),
          managerTrust: clamp(current.managerTrust + decision.managerTrustDelta),
          transferStatus: { success: true, chance: decision.chance, headline: decision.headline, text: decision.text },
        };
      }
      return {
        ...current,
        phase: "transfer-denied",
        transferRequests: current.transferRequests + 1,
        transferCooldownSeason: current.season,
        transferRequested: true,
        morale: clamp(current.morale + decision.moraleDelta),
        fanSupport: clamp(current.fanSupport + decision.fanSupportDelta),
        managerTrust: clamp(current.managerTrust + decision.managerTrustDelta),
        transferStatus: { success: false, chance: decision.chance, headline: decision.headline, text: decision.text },
      };
    });
    vibrate();
  }

  function requestRetirement() {
    setGame((current) => ({
      ...current,
      retirementReturnPhase: current.phase,
      phase: "retirement-confirm",
    }));
    vibrate();
  }

  function cancelRetirement() {
    setGame((current) => ({
      ...current,
      phase: current.retirementReturnPhase === "retirement-confirm" ? "career" : current.retirementReturnPhase,
    }));
    vibrate();
  }

  function confirmRetirement() {
    setGame((current) => ({
      ...current,
      phase: "summary",
      retireAfterSeason: true,
      newsFeed: [`${current.season}: ${current.name} anunciou a aposentadoria aos ${current.age} anos.`, ...current.newsFeed].slice(0, 16),
    }));
    vibrate();
  }

  function continueAfterDeniedTransfer() {
    setGame((current) => ({ ...current, phase: "career", transferStatus: null, transferRequested: false }));
    setActiveTab("event");
    vibrate();
  }

  async function installWebShortcut() {
    if (!installPrompt) {
      setAndroidInstallOpen(false);
      setInstallHelp(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setToast(choice.outcome === "accepted" ? "Futbobo instalado no aparelho" : "Instalação cancelada");
  }

  function installWebApp() {
    setAndroidInstallOpen(true);
  }

  async function shareCareer() {
    if (shareBusy) return;
    setShareBusy(true);
    setToast("Montando o pôster da carreira...");
    const peakOverall = Math.max(displayGame.overall, ...displayGame.history.map((item) => item.overall), 0);
    const ballonDor = displayGame.awardCabinet["Bola de Ouro"] ?? 0;
    const worldXi = displayGame.awardCabinet["FIFPRO World XI"] ?? 0;
    const totalTitles = displayGame.trophies + displayGame.nationalTrophies;
    const titleLine = shareTitleHighlights.length
      ? shareTitleHighlights.map((entry) => `${entry.count}× ${entry.label}`).join(" · ")
      : "Uma carreira construída além das taças";
    const clubLine = Array.from(new Set(displayGame.history.map((item) => clubById(item.clubId).shortName))).join(" → ");
    const productionLine = displayGame.position === "GOL"
      ? `${displayGame.stats.cleanSheets} jogos sem sofrer · ${displayGame.stats.goalsConceded} gols sofridos`
      : `${displayGame.stats.goals} gols · ${displayGame.stats.assists} assistências`;
    const text = [
      `⚽ ${displayGame.name} encerrou a carreira no FUTBOBO`,
      `${position.name} · ${nationCountry.name} · pico de ${peakOverall} OVR`,
      `${displayGame.stats.appearances} jogos · ${productionLine}`,
      `🏆 ${totalTitles} títulos — ${titleLine}`,
      `🥇 ${ballonDor}× Bola de Ouro · ${worldXi}× World XI · ${totalIndividualAwards} prêmios individuais`,
      `🏟️ ${clubLine || currentClub.shortName}`,
      `⭐ ${legacyStanding.label} · ${displayGame.legacyPoints} pontos de legado`,
      "Você faria melhor?",
    ].join("\n");

    const makePoster = async () => {
      await document.fonts?.ready;
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1350;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível");
      // O pôster é uma página do álbum: capa amarela, papel pontilhado, a faixa do clube,
      // a figurinha do jogador, a ficha da carreira e as taças em carimbos.
      const tokens = getComputedStyle(document.querySelector(".albumMounted") ?? document.body);
      const displayFont = tokens.getPropertyValue("--font-display").trim() || '"Arial Narrow", sans-serif';
      const textFont = tokens.getPropertyValue("--font-text").trim() || "Arial, sans-serif";
      const INK = "#161616";
      const INK_2 = "#45453f";
      const INK_3 = "#66665e";
      const PAPER = "#fbfbf7";
      const YELLOW = "#f6c431";
      const inks = clubInks(currentClub.primary || "#0b5cad", currentClub.secondary || "#ffffff") as Record<string, string>;
      const setFont = (kind: "display" | "text", weight: number, size: number) => {
        ctx.font = `${weight} ${kind === "display" ? "condensed " : ""}${size}px ${kind === "display" ? displayFont : textFont}`;
        if ("fontStretch" in ctx) (ctx as CanvasRenderingContext2D & { fontStretch: string }).fontStretch = kind === "display" ? "condensed" : "normal";
      };
      const fit = (value: string, maxWidth: number, startSize: number, minSize: number, kind: "display" | "text", weight: number) => {
        let size = startSize;
        setFont(kind, weight, size);
        while (size > minSize && ctx.measureText(value).width > maxWidth) {
          size -= 2;
          setFont(kind, weight, size);
        }
        return size;
      };
      const roundRect = (x: number, y: number, width: number, height: number, radius: number) => {
        const r = Math.min(radius, width / 2, height / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + width, y, x + width, y + height, r);
        ctx.arcTo(x + width, y + height, x, y + height, r);
        ctx.arcTo(x, y + height, x, y, r);
        ctx.arcTo(x, y, x + width, y, r);
        ctx.closePath();
      };
      const dots = (x: number, y: number, width: number, height: number, color: string, step: number) => {
        ctx.fillStyle = color;
        for (let dy = y + step / 2; dy < y + height; dy += step) {
          for (let dx = x + step / 2; dx < x + width; dx += step) ctx.fillRect(dx - 1, dy - 1, 2, 2);
        }
      };
      const loadImage = (src: string) => new Promise<HTMLImageElement | null>((resolve) => {
        const image = document.createElement("img");
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = src;
      });
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      // Só escudos do próprio site: imagem de outro domínio sujaria o canvas e o pôster não sairia.
      const badgePath = currentClub.customBadge || (VERIFIED_CLUB_ASSET_IDS.has(currentClub.id) ? `/assets/clubs/${currentClub.id}.png` : "");
      const [badge, logo] = await Promise.all([
        badgePath.startsWith("/") || badgePath.startsWith("data:") ? loadImage(badgePath.startsWith("/") ? `${basePath}${badgePath}` : badgePath) : Promise.resolve(null),
        loadImage(`${basePath}/favicon.svg`),
      ]);

      // capa e papel
      ctx.fillStyle = YELLOW;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.shadowColor = "rgba(60, 50, 0, .28)";
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 6;
      roundRect(28, 28, 1024, 1294, 20);
      ctx.fillStyle = PAPER;
      ctx.fill();
      ctx.restore();
      ctx.save();
      roundRect(28, 28, 1024, 1294, 20);
      ctx.clip();
      dots(28, 28, 1024, 1294, "rgba(150, 145, 130, .16)", 12);
      ctx.restore();

      // faixa do clube
      ctx.save();
      roundRect(72, 72, 936, 196, 10);
      ctx.clip();
      ctx.fillStyle = inks["--club"];
      ctx.fillRect(72, 72, 936, 196);
      dots(72, 72, 936, 196, inks["--club-ink"] === "#ffffff" ? "rgba(255, 255, 255, .09)" : "rgba(0, 0, 0, .07)", 9);
      ctx.fillStyle = inks["--club-2"];
      ctx.beginPath();
      ctx.moveTo(742, 72);
      ctx.lineTo(812, 72);
      ctx.lineTo(742, 268);
      ctx.lineTo(672, 268);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(168, 170, 66, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 0, 0, .14)";
      ctx.lineWidth = 3;
      ctx.stroke();
      if (badge) {
        const scale = Math.min(98 / badge.width, 98 / badge.height);
        ctx.drawImage(badge, 168 - (badge.width * scale) / 2, 170 - (badge.height * scale) / 2, badge.width * scale, badge.height * scale);
      } else {
        ctx.fillStyle = inks["--club"];
        ctx.textAlign = "center";
        fit(currentClub.abbr, 100, 40, 22, "display", 800);
        ctx.fillText(currentClub.abbr, 168, 184);
        ctx.textAlign = "left";
      }
      ctx.fillStyle = inks["--club-ink"];
      ctx.globalAlpha = .86;
      setFont("text", 600, 24);
      ctx.fillText("Fim de carreira", 262, 128);
      ctx.globalAlpha = 1;
      fit(displayGame.name, 470, 86, 44, "display", 800);
      ctx.fillText(displayGame.name, 260, 206);
      setFont("text", 600, 24);
      ctx.globalAlpha = .9;
      ctx.fillText(`${position.name} · ${nationCountry.name}`, 262, 244);
      ctx.globalAlpha = 1;
      // selo do pico de OVR
      ctx.fillStyle = YELLOW;
      ctx.beginPath();
      ctx.arc(920, 170, 64, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.textAlign = "center";
      setFont("text", 600, 17);
      ctx.fillText("pico", 920, 138);
      setFont("display", 800, 58);
      ctx.fillText(String(peakOverall), 920, 192);
      setFont("text", 700, 17);
      ctx.fillText("OVR", 920, 214);
      ctx.textAlign = "left";

      // figurinha
      const appearance = appSettings.characterButtonsEnabled !== false ? { ...displayGame.playerAppearance, kitPattern: teamKitPattern(displayGame.seed, currentClub.id) } : null;
      ctx.save();
      ctx.translate(270, 566);
      ctx.rotate((-2.4 * Math.PI) / 180);
      ctx.translate(-270, -566);
      ctx.save();
      ctx.shadowColor = "rgba(30, 30, 20, .28)";
      ctx.shadowBlur = 22;
      ctx.shadowOffsetY = 8;
      roundRect(80, 316, 380, 500, 14);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.restore();
      ctx.save();
      roundRect(94, 330, 352, 380, 8);
      ctx.clip();
      ctx.fillStyle = inks["--club"];
      ctx.fillRect(94, 330, 352, 380);
      dots(94, 330, 352, 380, "rgba(0, 0, 0, .1)", 9);
      ctx.fillStyle = inks["--club-2"];
      ctx.globalAlpha = .9;
      ctx.beginPath();
      ctx.moveTo(94, 560);
      ctx.lineTo(446, 470);
      ctx.lineTo(446, 520);
      ctx.lineTo(94, 610);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      if (appearance) {
        // No Modo 3D (sem o modo desempenho) o pôster usa o mesmo boneco 3D das figurinhas.
        const portrait = sticker3dEnabled()
          ? await renderStickerPortrait(appearance, currentClub.primary, currentClub.secondary, { number: displayGame.number, size: 352 })
          : null;
        if (portrait) {
          ctx.drawImage(portrait, 270 - 176, 330 + 380 * .5 - 352 * .47, 352, 352);
        } else {
          ctx.save();
          ctx.translate(270, 330 + 380 * .5);
          drawPlayerBust(ctx, appearance, currentClub.primary, currentClub.secondary, 352 * .43, 0, { cutout: true });
          ctx.restore();
        }
      }
      ctx.restore();
      setFont("display", 800, appearance ? 64 : 150);
      ctx.lineJoin = "round";
      ctx.lineWidth = 6;
      ctx.strokeStyle = INK;
      ctx.fillStyle = "#ffffff";
      if (appearance) {
        ctx.strokeText(String(displayGame.number), 110, 394);
        ctx.fillText(String(displayGame.number), 110, 394);
      } else {
        ctx.textAlign = "center";
        ctx.strokeText(String(displayGame.number), 270, 572);
        ctx.fillText(String(displayGame.number), 270, 572);
        ctx.textAlign = "left";
      }
      ctx.fillStyle = YELLOW;
      ctx.beginPath();
      ctx.arc(404, 374, 38, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.textAlign = "center";
      setFont("display", 800, 36);
      ctx.fillText(String(peakOverall), 404, 384);
      setFont("text", 700, 12);
      ctx.fillText("OVR", 404, 400);
      ctx.textAlign = "left";
      fit(displayGame.name, 340, 40, 24, "display", 800);
      ctx.fillText(displayGame.name, 100, 760);
      setFont("text", 500, 20);
      ctx.fillStyle = INK_3;
      ctx.fillText(`${position.name}, camisa ${displayGame.number}`, 100, 792);
      ctx.restore();

      // ficha da carreira
      ctx.fillStyle = INK;
      setFont("display", 800, 36);
      ctx.fillText("Ficha da carreira", 504, 346);
      ctx.fillRect(504, 362, 504, 3);
      const clubsPlayed = new Set(displayGame.history.map((item) => item.clubId)).size || 1;
      const ficha: Array<[string, number]> = [
        ["Temporadas", displayGame.history.length],
        ["Clubes", clubsPlayed],
        ["Jogos", displayGame.stats.appearances],
        displayGame.position === "GOL" ? ["Jogos sem sofrer", displayGame.stats.cleanSheets] : ["Gols", displayGame.stats.goals],
        ["Assistências", displayGame.stats.assists],
        ["Taças", totalTitles],
        ["Bolas de Ouro", ballonDor],
        ["Prêmios individuais", totalIndividualAwards],
      ];
      ficha.forEach(([label, value], index) => {
        const y = 412 + index * 50;
        setFont("text", 500, 23);
        ctx.fillStyle = INK_2;
        ctx.fillText(label, 504, y);
        const labelEnd = 504 + ctx.measureText(label).width;
        setFont("display", 800, 34);
        ctx.fillStyle = INK;
        ctx.textAlign = "right";
        ctx.fillText(String(value), 1008, y + 2);
        const valueStart = 1008 - ctx.measureText(String(value)).width;
        ctx.textAlign = "left";
        ctx.save();
        ctx.strokeStyle = "rgba(22, 22, 22, .3)";
        ctx.lineWidth = 2;
        ctx.setLineDash([2, 7]);
        ctx.beginPath();
        ctx.moveTo(labelEnd + 12, y - 6);
        ctx.lineTo(valueStart - 12, y - 6);
        ctx.stroke();
        ctx.restore();
      });

      // taças em carimbos
      ctx.fillStyle = INK;
      setFont("display", 800, 36);
      ctx.fillText("Principais taças", 72, 878);
      ctx.fillRect(72, 894, 936, 3);
      const posterHonours = shareTitleHighlights.slice(0, 4);
      if (posterHonours.length) {
        posterHonours.forEach((entry, index) => {
          const x = 72 + (index % 2) * 484;
          const y = 920 + Math.floor(index / 2) * 94;
          ctx.fillStyle = INK;
          roundRect(x + 4, y + 4, 452, 74, 8);
          ctx.fill();
          roundRect(x, y, 452, 74, 8);
          ctx.fillStyle = index === 0 ? YELLOW : "#ffffff";
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = INK;
          ctx.stroke();
          ctx.fillStyle = INK;
          setFont("display", 800, 40);
          const count = `${entry.count}×`;
          ctx.fillText(count, x + 20, y + 51);
          const countWidth = ctx.measureText(count).width;
          fit(entry.label, 452 - 52 - countWidth, 25, 16, "text", 650);
          ctx.fillText(entry.label, x + 34 + countWidth, y + 46);
        });
      } else {
        ctx.fillStyle = INK_2;
        setFont("text", 500, 26);
        ctx.fillText("Uma história construída além das taças.", 72, 948);
      }

      // caminho
      const pathLine = Array.from(new Set(displayGame.history.map((item) => clubById(item.clubId).shortName))).join(" · ") || currentClub.shortName;
      ctx.fillStyle = INK_3;
      setFont("text", 600, 22);
      ctx.fillText("Caminho", 72, 1132);
      ctx.fillStyle = INK;
      fit(pathLine, 936, 34, 18, "display", 750);
      ctx.fillText(pathLine, 72, 1172);

      // legado, conquistas e a marca
      const legacyLabel = legacyStanding.label;
      const legacySize = fit(legacyLabel, 760, 56, 34, "display", 800);
      const legacyWidth = ctx.measureText(legacyLabel).width;
      ctx.fillStyle = "rgba(246, 196, 49, .9)";
      ctx.fillRect(66, 1264 - legacySize * .62, legacyWidth + 14, legacySize * .5);
      ctx.fillStyle = INK;
      ctx.fillText(legacyLabel, 72, 1262);
      ctx.fillStyle = INK_2;
      setFont("text", 500, 22);
      ctx.fillText(`${displayGame.legacyPoints} pontos de legado · ${displayGame.unlockedAchievements.length}/${ACHIEVEMENTS.length} conquistas`, 72, 1298);
      if (logo) ctx.drawImage(logo, 912, 1196, 96, 96);
      ctx.fillStyle = INK_2;
      setFont("text", 600, 19);
      ctx.textAlign = "right";
      ctx.fillText("futbobo.top", logo ? 896 : 1008, 1298);
      ctx.textAlign = "left";

      return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Falha ao criar pôster")), "image/png"));
    };

    try {
      const blob = await makePoster();
      const safeName = displayGame.name.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "carreira";
      const file = new File([blob], `futbobo-${safeName}.png`, { type: "image/png" });
      const shareData = { title: `A carreira de ${displayGame.name} no Futbobo`, text, url: window.location.href, files: [file] };
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share(shareData);
        setToast("Pôster da carreira compartilhado");
        return;
      }
      const imageUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = imageUrl;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(imageUrl);
      try {
        await navigator.clipboard.writeText(`${text}\n${window.location.href}`);
        setToast("Pôster salvo e resumo copiado");
      } catch {
        setToast("Pôster salvo no aparelho");
      }
    } catch (error) {
      setToast(error instanceof DOMException && error.name === "AbortError" ? "Compartilhamento cancelado" : "Não foi possível criar o pôster");
    } finally {
      setShareBusy(false);
    }
  }

  const shellPhase = hallPreview ? "summary" : game.phase;
  // A carreira (decisão, abas, consequência, fim de temporada e mercado) é o álbum: página que rola, sem a casca antiga.
  // A introdução (criação, base e primeiro contrato) também; o minigame do Scorebobo abre por cima, na tela dele.
  const albumHost = Boolean(hallPreview) || game.phase === "summary" || ALBUM_PHASES.has(game.phase) || INTRO_PHASES.has(game.phase);
  const shellClass = `app-shell app-shell-${shellPhase}${shellPhase === "welcome" ? " app-shell-welcome" : ""}${albumHost ? ` ${albumHostClass}` : ""}`;

  if (monteCarloReport) {
    return (
      <main className="app-shell monte-carlo-shell" data-testid="monte-carlo-report" data-report={JSON.stringify(monteCarloReport)}>
        <section>
          <span className="eyebrow">LABORATÓRIO DE BALANCEAMENTO</span>
          <h1>{monteCarloReport.runs} carreiras simuladas</h1>
          <div className="monte-carlo-grid">
            <Metric label="Bolas de Ouro" value={monteCarloReport.totalBallonDor} tone="gold" />
            <Metric label="World XI" value={monteCarloReport.totalWorldXi} tone="green" />
            <Metric label="World XI sem Bola de Ouro" value={monteCarloReport.worldXiWithoutBallonDor} />
            <Metric label="Bola de Ouro sem prêmio de produção" value={monteCarloReport.ballonDorWithoutProductionAward} />
            <Metric label="Bola de Ouro sem World XI" value={monteCarloReport.ballonDorWithoutWorldXi} />
            <Metric label="Carreiras vencedoras" value={monteCarloReport.careersWithBallonDor} tone="green" />
            <Metric label="Chance por carreira" value={`${monteCarloReport.careerChancePercent}%`} />
            <Metric label="Prêmios por carreira" value={monteCarloReport.averageIndividualAwards} />
            <Metric label="Pico OVR médio" value={monteCarloReport.averagePeakOverall} />
            <Metric label="Títulos por carreira" value={monteCarloReport.averageTrophies} />
            <Metric label="Sem títulos" value={monteCarloReport.careersWithoutTrophies} />
            <Metric label="5+ Bolas de Ouro" value={monteCarloReport.careersWithFiveBallonDor} />
            <Metric label="Temporadas processadas" value={monteCarloReport.totalSeasons} />
          </div>
          <article className="monte-carlo-best">
            <span>MELHOR CARREIRA DO LOTE</span>
            <strong>{monteCarloReport.bestCareer.name} · {monteCarloReport.bestCareer.position}</strong>
            <p>{monteCarloReport.bestCareer.peakOverall} OVR de pico · {monteCarloReport.bestCareer.trophies} títulos · {monteCarloReport.bestCareer.goals} gols · {monteCarloReport.bestCareer.ballonDor} Bola(s) de Ouro</p>
          </article>
          {monteCarloReport.winners.length > 0 ? (
            <div className="monte-carlo-winners">
              {monteCarloReport.winners.map((winner) => <span key={winner.career}>#{winner.career} · {winner.position} · {winner.peakOverall} OVR · {winner.ballonDor}×</span>)}
            </div>
          ) : (
            <p className="monte-carlo-empty">Nenhuma carreira conquistou a Bola de Ouro neste lote.</p>
          )}
        </section>
      </main>
    );
  }

  if (game.phase === "botao-final" && currentBotaoMatch && currentBotaoSetup) {
    if (botaoMatchStarted) {
      return (
        <BotaoMatch
          key={currentBotaoSetup.matchId}
          setup={currentBotaoSetup}
          onFinish={applyBotaoMatchResult}
        />
      );
    }
    return (
      <main className={shellClass}>
        <AlbumShell club={currentBotaoSetup.userTeam} tab={null} onTab={changeTab} showTabs={false} label={`${currentBotaoMatch.stageName} · ${currentBotaoMatch.competitionName}`}>
          <BotaoLobbySpread
            match={currentBotaoMatch}
            setup={currentBotaoSetup}
            player={{ name: game.name, number: game.number, overall: game.overall, positionName: positionByKey(game.position).name, appearance: albumAppearance }}
            club={currentClub}
            simulating={botaoSimulating}
            onPlay={startCurrentBotaoMatch}
            onSimulate={simulateCurrentBotaoMatch}
          />
        </AlbumShell>
      </main>
    );
  }

  if (game.phase === "botao-result" && game.lastBotaoResult) {
    const { match, result } = game.lastBotaoResult;
    const setup = setupForPendingBotaoMatch(game, match);
    return (
      <main className={shellClass}>
        <AlbumShell club={setup.userTeam} tab={null} onTab={changeTab} showTabs={false} label={`Resultado · ${match.stageName}`}>
          <BotaoResultSpread
            match={match}
            result={result}
            setup={setup}
            continueLabel={game.pendingPressConference
              ? "Ir para a coletiva de imprensa"
              : game.pendingBotaoMatches.length
                ? "Próxima decisão"
                : "Ver resumo da temporada"}
            onContinue={continueAfterBotaoResult}
            activeReplay={activeGoalReplay}
            onToggleReplay={setActiveGoalReplay}
          />
        </AlbumShell>
        {pressConferenceOpen && game.pendingPressConference && <PressConferenceDialog conference={game.pendingPressConference} club={setup.userTeam} onAnswer={answerPressConference} />}
      </main>
    );
  }

  return (
    <main className={shellClass}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      {toast && <div className="toast" role="status">{toast}</div>}
      {(pressConferenceOpen || presentationOpen) && game.pendingPressConference && <PressConferenceDialog conference={game.pendingPressConference} club={currentClub} onAnswer={answerPressConference} />}
      {cycleShopOpen && <CycleShopDialog game={game} club={currentClub} feedback={cycleShopFeedback} onBuy={buyCycleShopItem} onClose={closeCycleShop} />}
      {cycleShopOpen && specialTrainingOpen && <SpecialTrainingPanel game={game} setGame={setGame} club={game.isFreeAgent || !game.currentClubId ? null : clubById(game.currentClubId)} performance={appSettings.botao3dPerformance === true} onClose={closeSpecialTraining} />}
      {androidInstallOpen && (
        <AndroidInstallDialog
          native={nativeAndroid}
          release={androidRelease}
          onClose={() => setAndroidInstallOpen(false)}
          onDownload={() => {
            void openAndroidDownload(androidRelease?.url);
          }}
          onWebInstall={nativeAndroid ? undefined : () => {
            void installWebShortcut();
          }}
        />
      )}
      {game.phase === "season-result" && game.pendingStoryDecision && (
        <StoryDecisionSheet
          decision={game.pendingStoryDecision}
          story={playerStoryById(game.playerStoryId)}
          playerName={game.name}
          club={currentClub}
          onChoose={resolveStoryDecision}
        />
      )}
      {updateNoticeOpen && (
        <div className="modal-backdrop update-backdrop" role="presentation">
          <section className={`update-notice update-page-${updateNoticePage}`} role="dialog" aria-modal="true" aria-labelledby="update-title">
            {updateNoticePage === "current" ? (
              <>
                <header className="update-mega-hero">
                  <div className="update-symbol">GK</div>
                  <div>
                    <span className="update-version">v92 · DONO DA ÁREA</span>
                    <h1 id="update-title">Goleiro agora vive outra carreira.</h1>
                  </div>
                </header>
                <p>Da primeira luva à disputa pela camisa 1 da Seleção, a posição ganhou capítulos, riscos, metas e prêmios que não aparecem para jogadores de linha.</p>
                <div className="update-mega-stats" aria-label="Resumo do update">
                  <span><b>20</b> capítulos profissionais</span>
                  <span><b>12</b> momentos da base</span>
                  <span><b>4</b> novas honrarias</span>
                </div>
                <span className="update-section-label">O GRANDE DESTAQUE</span>
                <div className="update-grid update-mega-grid">
                  <article className="update-featured"><b>1</b><span><strong>A camisa tem peso</strong><small>Concorrência no gol, falhas, pênaltis, chuva, jogo com os pés e liderança mudam o rumo da temporada.</small></span></article>
                  <article><b>0</b><span><strong>Metas de goleiro</strong><small>Jogos sem sofrer e limite de gols sofridos agora decidem confiança, espaço e evolução.</small></span></article>
                  <article><b>◆</b><span><strong>Prêmios próprios</strong><small>Melhor Goleiro, Muralha, Luvas continentais, Yashin e World XI valorizam temporadas históricas.</small></span></article>
                  <article><b>⌛</b><span><strong>Uma carreira inteira</strong><small>A história acompanha o goleiro da base à chegada do sucessor e à reinvenção depois dos 32.</small></span></article>
                </div>
                <button className="previous-update-button" onClick={() => setUpdateNoticePage("previous")}><span>UPDATE ANTERIOR</span><strong>Duelo Local</strong><b>→</b></button>
              </>
            ) : (
              <>
                <span className="update-version previous">v91 · DUELO LOCAL</span>
                <div className="update-symbol previous">1×1</div>
                <h1 id="update-title">A resenha cabe na mesma mesa.</h1>
                <p>Dois jogadores usam o mesmo mouse ou aparelho, alternam um toque por vez e resolvem a rivalidade sem CPU.</p>
                <div className="update-grid previous-grid">
                  <article><b>2</b><span><strong>Jogadores locais</strong><small>Escolha os clubes, o ritmo da partida e passe o controle depois de cada toque.</small></span></article>
                  <article><b>4</b><span><strong>Presets rápidos</strong><small>Minhas regras, Relâmpago, Clássico e Maratona sem alterar a carreira.</small></span></article>
                </div>
                <button className="previous-update-button back" onClick={() => setUpdateNoticePage("current")}><span>UPDATE ATUAL</span><strong>Voltar para Dono da Área</strong><b>←</b></button>
              </>
            )}
            <button className="primary-button" onClick={() => setUpdateNoticeOpen(false)}>Entrar no jogo <span>→</span></button>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop settings-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <section className="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><span>CONFIGURAÇÕES DO UNIVERSO</span><h2 id="settings-title">Universo e partidas</h2></div>
              <button className="icon-button" aria-label="Fechar configurações" onClick={() => setSettingsOpen(false)}>×</button>
            </header>
            <p>Crie pessoas do seu universo. Em novas carreiras, elas podem aparecer aleatoriamente como rivais, candidatos a prêmios e protagonistas de eventos. Nem toda carreira terá um rival.</p>
            <section className="final-mode-settings">
              <span>PARTIDAS DECISIVAS</span>
              <strong>Como você quer viver as partidas que valem taça?</strong>
              <div>
                {[
                  { id: "simulate" as const, label: "Sempre simular", text: "Mantém o ritmo atual do simulador." },
                  { id: "finals-only" as const, label: "Jogar finais", text: "Botão manual apenas nas decisões." },
                  { id: "play-key-matches" as const, label: "Finais + Copa", text: "Também inclui o mata-mata da Copa do Mundo." },
                ].map((mode) => (
                  <button className={(appSettings.finalMatchMode ?? "play-key-matches") === mode.id ? "selected" : ""} key={mode.id} onClick={() => setAppSettings((current) => ({ ...current, finalMatchMode: mode.id }))}>
                    <b>{(appSettings.finalMatchMode ?? "play-key-matches") === mode.id ? "✓" : "○"}</b><span><strong>{mode.label}</strong><small>{mode.text}</small></span>
                  </button>
                ))}
              </div>
              <small>A escolha vale imediatamente para a próxima temporada simulada e fica salva neste aparelho.</small>
              <div className="botao-rule-settings">
                <label>Fim antecipado
                  <select value={appSettings.botaoGoalLimit ?? 3} onChange={(event) => setAppSettings((current) => ({ ...current, botaoGoalLimit: Number(event.target.value) as 0 | 3 | 5 }))}>
                    <option value={3}>Terminar aos 3 gols</option>
                    <option value={5}>Terminar aos 5 gols</option>
                    <option value={0}>Desativado</option>
                  </select>
                </label>
                <label>Duração
                  <select value={appSettings.botaoHalfSeconds ?? 120} onChange={(event) => setAppSettings((current) => ({ ...current, botaoHalfSeconds: Number(event.target.value) as 90 | 120 | 180 }))}>
                    <option value={90}>1min30</option>
                    <option value={120}>2 minutos</option>
                    <option value={180}>3 minutos</option>
                  </select>
                </label>
                <label>Prorrogação
                  <select value={appSettings.botaoExtraSeconds ?? 45} onChange={(event) => setAppSettings((current) => ({ ...current, botaoExtraSeconds: Number(event.target.value) as 30 | 45 | 60 }))}>
                    <option value={30}>30 segundos</option>
                    <option value={45}>45 segundos</option>
                    <option value={60}>1 minuto</option>
                  </select>
                </label>
                <label>Série de pênaltis
                  <select value={appSettings.botaoPenaltyRounds ?? 5} onChange={(event) => setAppSettings((current) => ({ ...current, botaoPenaltyRounds: Number(event.target.value) as 3 | 5 }))}>
                    <option value={3}>3 cobranças</option>
                    <option value={5}>5 cobranças</option>
                  </select>
                </label>
              </div>
            </section>
            <section className="character-button-settings">
              <div className="settings-section-heading"><span>JOGADORES NA MESA</span><strong>Bonecos ou números clássicos</strong></div>
              <button
                type="button"
                className={appSettings.characterButtonsEnabled !== false ? "selected" : ""}
                aria-pressed={appSettings.characterButtonsEnabled !== false}
                onClick={() => setAppSettings((current) => ({ ...current, characterButtonsEnabled: current.characterButtonsEnabled === false }))}
              >
                <b>{appSettings.characterButtonsEnabled !== false ? "●" : "10"}</b>
                <span><strong>{appSettings.characterButtonsEnabled !== false ? "Personagens ativados" : "Números clássicos"}</strong><small>{appSettings.characterButtonsEnabled !== false ? "Ativa o criador e coloca os elencos dentro dos botões." : "Remove o criador e restaura integralmente a visualização antiga."}</small></span>
              </button>
            </section>
            <section className="character-button-settings">
              <div className="settings-section-heading"><span>MODO 3D</span><strong>Bonecos 3D no lugar dos botões</strong></div>
              <button
                type="button"
                className={appSettings.botao3d ? "selected" : ""}
                aria-pressed={appSettings.botao3d === true}
                onClick={() => setAppSettings((current) => ({ ...current, botao3d: current.botao3d !== true }))}
              >
                <b>{appSettings.botao3d ? "3D" : "2D"}</b>
                <span><strong>{appSettings.botao3d ? "Modo 3D ativado" : "Mesa clássica"}</strong><small>{appSettings.botao3d ? "Mesma partida e mesmas regras, com jogadores 3D animados. Botão direito gira o campo." : "Ative para trocar a mesa de botões por um estádio 3D com bonecos animados."}</small></span>
              </button>
              <button
                type="button"
                className={appSettings.botao3d && appSettings.botao3dPerformance ? "selected" : ""}
                aria-pressed={appSettings.botao3d === true && appSettings.botao3dPerformance === true}
                disabled={appSettings.botao3d !== true}
                onClick={() => setAppSettings((current) => (current.botao3dPerformance === true
                  ? { ...current, botao3dPerformance: false, botao3dPerformanceUserOff: true }
                  : { ...current, botao3dPerformance: true, botao3dPerformanceUserOff: false }))}
              >
                <b>{appSettings.botao3d && appSettings.botao3dPerformance ? "FPS" : "HD"}</b>
                <span><strong>{appSettings.botao3d && appSettings.botao3dPerformance ? "Modo desempenho 3D ativado" : "Modo desempenho 3D"}</strong><small>{appSettings.botao3d ? "3D mais leve para PC ou celular fraco: sem torcida nem sombras projetadas, com resolução que se ajusta sozinha. Liga sozinho se a partida engasgar." : "Disponível com o Modo 3D ligado."}</small></span>
              </button>
            </section>
            <div className="settings-section-heading"><span>PERSONAGENS</span><strong>Rivais e nomes do seu universo</strong></div>
            <div className="character-creator">
              <label>Nome do personagem<input value={characterName} maxLength={28} placeholder="Ex.: Gabriel Souza" onChange={(event) => setCharacterName(event.target.value)} /></label>
              <label>Posição<select value={characterPosition} onChange={(event) => setCharacterPosition(event.target.value as PositionKey)}>{POSITIONS.map((item) => <option key={item.key} value={item.key}>{item.key} · {item.name}</option>)}</select></label>
              <button className="primary-button" disabled={characterName.trim().length < 2 || appSettings.customCharacters.length >= 12} onClick={addCustomCharacter}>Criar personagem <span>+</span></button>
            </div>
            <div className="custom-character-list">
              <div><span>SEU ELENCO</span><strong>{appSettings.customCharacters.length}/12</strong></div>
              {appSettings.customCharacters.length === 0 ? (
                <p className="empty-character-list">Você ainda não criou ninguém. Os rivais fictícios do jogo continuam podendo aparecer normalmente.</p>
              ) : appSettings.customCharacters.map((character) => (
                <article key={character.id}>
                  <span>{positionByKey(character.position).icon}</span>
                  <div><strong>{character.name}</strong><small>{character.position} · {positionByKey(character.position).name}</small></div>
                  <button aria-label={`Remover ${character.name}`} onClick={() => removeCustomCharacter(character.id)}>Remover</button>
                </article>
              ))}
            </div>
            <section className="custom-club-settings">
              <div className="settings-section-heading"><span>TIME PERSONALIZADO</span><strong>Substitua um clube sem alterar a liga</strong></div>
              <p>O time customizado herda cidade, liga, força e reputação do clube substituído. Nome, cores e escudo passam a ser seus.</p>
              <label>Clube que será substituído
                <select value={customClubReplacement} onChange={(event) => setCustomClubReplacement(event.target.value)}>
                  {[...ORIGINAL_CLUB_PRESENTATION.entries()]
                    .sort((a, b) => a[1].shortName.localeCompare(b[1].shortName, "pt-BR"))
                    .map(([id, club]) => <option key={id} value={id}>{club.shortName} · {leagueById(CLUBS.find((candidate) => candidate.id === id)?.leagueId ?? CLUBS[0].leagueId).name}</option>)}
                </select>
              </label>
              <div className="custom-club-grid">
                <label>Nome completo<input maxLength={42} value={customClubName} onChange={(event) => setCustomClubName(event.target.value)} placeholder="Ex.: Futbobo FC" /></label>
                <label>Nome curto<input maxLength={24} value={customClubShortName} onChange={(event) => setCustomClubShortName(event.target.value)} placeholder="Ex.: Futbobo" /></label>
                <label>Sigla<input maxLength={4} value={customClubAbbr} onChange={(event) => setCustomClubAbbr(event.target.value)} placeholder="FTB" /></label>
                <label>Cor principal<input type="color" value={customClubPrimary} onChange={(event) => setCustomClubPrimary(event.target.value)} /></label>
                <label>Cor secundária<input type="color" value={customClubSecondary} onChange={(event) => setCustomClubSecondary(event.target.value)} /></label>
              </div>
              <label>Escudo por link HTTPS<input value={customClubBadge.startsWith("data:") ? "" : customClubBadge} onChange={(event) => setCustomClubBadge(event.target.value)} placeholder="https://.../escudo.png" /></label>
              <label className="custom-club-file">Ou envie um arquivo de até 1 MB<input type="file" accept="image/*" onChange={(event) => readCustomClubBadge(event.target.files?.[0])} /></label>
              {customClubBadge && <small className="custom-club-badge-ready">✓ Escudo personalizado pronto</small>}
              <button className="primary-button" disabled={customClubName.trim().length < 2 || customClubAbbr.trim().length < 2} onClick={saveCustomClub}>Salvar time personalizado <span>+</span></button>
              {(appSettings.customClubs ?? []).length > 0 && (
                <div className="custom-character-list">
                  <div><span>TIMES CRIADOS</span><strong>{(appSettings.customClubs ?? []).length}/8</strong></div>
                  {(appSettings.customClubs ?? []).map((club) => (
                    <article key={club.replacedClubId}>
                      <ClubBadge club={clubById(club.replacedClubId)} size="sm" />
                      <div><strong>{club.shortName}</strong><small>Substitui {ORIGINAL_CLUB_PRESENTATION.get(club.replacedClubId)?.shortName}</small></div>
                      <button onClick={() => removeCustomClub(club.replacedClubId)}>Remover</button>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <section className="save-data-settings">
              <div className="settings-section-heading"><span>DADOS SALVOS</span><strong>Leve suas carreiras para outro aparelho</strong></div>
              <p>O backup inclui todas as carreiras, conquistas globais, Hall da Fama, personagens, times personalizados e configurações.</p>
              <div>
                <button className="secondary-button" onClick={exportSavedData}>Exportar dados</button>
                <button className="secondary-button" onClick={() => saveImportRef.current?.click()}>Importar dados</button>
                <input ref={saveImportRef} type="file" accept="application/json,.json" hidden onChange={(event) => importSavedData(event.target.files?.[0])} />
              </div>
            </section>
            <small className="settings-note">As alterações valem para carreiras novas e ficam salvas neste aparelho.</small>
          </section>
        </div>
      )}

      {appearanceEditorOpen && appSettings.characterButtonsEnabled !== false && game.phase === "career" && (
        <AlbumSheet
          ink="blue"
          club={currentClub}
          size="wide"
          titleId="appearance-editor-title"
          kicker="Vestiário"
          title="Personalizar jogador"
          onDismiss={() => setAppearanceEditorOpen(false)}
          footer={<Stamp variant="primary" onClick={() => setAppearanceEditorOpen(false)}>Salvar visual</Stamp>}
        >
          <p className={sheetStyles.lead}>Altere quando quiser. A nova aparência entra em campo já na próxima partida.</p>
          <div className={sheetStyles.editorScope}>
            <PlayerAppearanceEditor
              compact
              value={game.playerAppearance}
              onChange={(playerAppearance) => setGame((current) => ({ ...current, playerAppearance }))}
              playerName={game.name}
              number={game.number}
              primary={currentClub.primary}
              secondary={currentClub.secondary}
              kitPattern={teamKitPattern(game.seed, currentClub.id)}
            />
          </div>
        </AlbumSheet>
      )}

      {selectedAchievementId && (() => {
        const achievement = ACHIEVEMENTS.find((item) => item.id === selectedAchievementId);
        if (!achievement) return null;
        const unlocked = game.unlockedAchievements.includes(achievement.id);
        const legendarySecret = achievement.rarity === "lendário" && !unlocked;
        return (
          <div className="modal-backdrop achievement-backdrop" role="presentation" onMouseDown={() => setSelectedAchievementId("")}>
            <section className={`achievement-detail rarity-${achievement.rarity}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
              <button className="icon-button" aria-label="Fechar conquista" onClick={() => setSelectedAchievementId("")}>×</button>
              <b>{unlocked ? achievement.icon : "?"}</b>
              <span>{achievement.rarity.toLocaleUpperCase("pt-BR")}</span>
              <h2>{legendarySecret ? "Conquista lendária secreta" : achievement.title}</h2>
              <p>{legendarySecret ? "Este requisito continuará oculto até alguém desbloqueá-lo neste aparelho." : achievement.description}</p>
              <strong>{unlocked ? "✓ DESBLOQUEADA" : legendarySecret ? "REQUISITO OCULTO" : "COMO DESBLOQUEAR"}</strong>
              {!unlocked && !legendarySecret && <small>{achievement.description}</small>}
            </section>
          </div>
        );
      })()}

      {game.phase === "welcome" && !hallPreview && (
        <section className="welcome-screen screen-enter">
          <header className="welcome-command-bar">
            <div className="brand-lockup" aria-label="Futbobo">
              <BrandMark />
              <span>FUTBOBO</span>
              <small>CENTRAL DE JOGO</small>
            </div>
            <nav className="welcome-utilities" aria-label="Ferramentas">
              <button type="button" onClick={() => setSettingsOpen(true)}><b><FutboboIcon name="settings" /></b><span>Configurações</span></button>
              <button type="button" onClick={installWebApp}><b><FutboboIcon name="download" /></b><span>{nativeAndroid ? "Atualizar" : androidPhone ? "Baixar APK" : "Instalar"}</span></button>
              <button type="button" aria-label="Ver novidades do jogo" onClick={() => { setUpdateNoticePage("current"); setUpdateNoticeOpen(true); }}><b><FutboboIcon name="news" /></b><span>Novidades</span></button>
            </nav>
          </header>
          <main className="welcome-mode-menu">
            <header className="mode-menu-heading">
              <div>
                <span>CENTRAL DE JOGO</span>
                <h1>Onde a bola vai rolar?</h1>
              </div>
              <p>Continue uma história ou escolha uma partida rápida.</p>
            </header>

            <div className="mode-menu-grid">
              <section className="mode-group career-mode-group" aria-labelledby="career-mode-title">
                <header className="mode-group-heading">
                  <span>01</span>
                  <div><small>SUA HISTÓRIA</small><strong id="career-mode-title">Modo carreira</strong></div>
                </header>
                <div className="career-mode-choices">
                  <button
                    type="button"
                    className={`game-mode-tile career-load-tile ${hasSave ? "is-primary" : "is-unavailable"}`}
                    onClick={continueSave}
                    disabled={!hasSave}
                  >
                    <span className="mode-tile-art" aria-hidden="true">
                      <Image
                        src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/assets/futbobo-hero-v6-background.webp`}
                        alt=""
                        fill
                        priority
                        sizes="(max-width: 640px) 35vw, 360px"
                        unoptimized
                      />
                      <BrandMark size="hero" />
                    </span>
                    <span className="mode-tile-copy">
                      <small>{hasSave ? "CARREIRA EM ANDAMENTO" : "ESPAÇO DE SAVE"}</small>
                      <strong>{hasSave ? "Voltar ao vestiário" : "Nenhuma carreira salva"}</strong>
                      <em>{hasSave ? "Continue exatamente do último capítulo." : "Comece uma nova história para liberar este espaço."}</em>
                    </span>
                    <span className="mode-tile-action">{hasSave ? "Carregar carreira" : "Indisponível"}<b>{hasSave ? "→" : "—"}</b></span>
                  </button>

                  <button type="button" className={`game-mode-tile career-new-tile ${hasSave ? "" : "is-primary"}`} onClick={startNew}>
                    <span className="mode-tile-symbol" aria-hidden="true">＋</span>
                    <span className="mode-tile-copy">
                      <small>NOVO SAVE</small>
                      <strong>Começar do zero</strong>
                      <em>Crie jogador, origem e a carreira inteira.</em>
                    </span>
                    <span className="mode-tile-action">Nova carreira <b>→</b></span>
                  </button>
                </div>
              </section>

              <section className="mode-group instant-mode-group" aria-labelledby="instant-mode-title">
                <header className="mode-group-heading">
                  <span>02</span>
                  <div><small>SEM COMPROMISSO</small><strong id="instant-mode-title">Jogar agora</strong></div>
                </header>
                <div className="instant-mode-choices">
                  <article className="game-mode-tile challenge-mode-tile">
                    <span className="mode-tile-symbol" aria-hidden="true">24H</span>
                    <span className="mode-tile-copy">
                      <small>DESAFIO FUTBOBO · {todayChallenge.id}</small>
                      <strong>Todos começam iguais.</strong>
                      <em>Uma promessa por dia. Seu recorde: {todayChallengeBest?.score ?? "—"}.</em>
                    </span>
                    <div className="challenge-mode-actions">
                      <button type="button" onClick={hasChallengeSave ? continueChallenge : startChallenge}>{hasChallengeSave ? "Continuar desafio" : "Jogar desafio"}<b>→</b></button>
                      {hasChallengeSave && <button type="button" onClick={startChallenge} aria-label="Recomeçar desafio">↻</button>}
                    </div>
                  </article>

                  <Link className="game-mode-tile cup-mode-tile" href="/copa" aria-label="Jogar uma Copa do Mundo">
                    <span className="mode-tile-symbol" aria-hidden="true"><FutboboIcon name="globe" /></span>
                    <span className="mode-tile-copy"><small>MODO COPA</small><strong>Buscar o mundo</strong><em>Da fase de grupos até a final.</em></span>
                    <span className="mode-tile-action">Jogar Copa <b>→</b></span>
                  </Link>

                  <Link className="game-mode-tile local-mode-tile" href="/x1">
                    <span className="mode-tile-symbol" aria-hidden="true">1×1</span>
                    <span className="mode-tile-copy"><small>DUELO LOCAL</small><strong>Resolver no sofá</strong><em>Dois jogadores alternando o mouse.</em></span>
                    <span className="mode-tile-action">Abrir X1 <b>→</b></span>
                  </Link>
                </div>
              </section>
            </div>
          </main>
          {hallOfFame.length > 0 && (
            <div className="welcome-hall welcome-hall-rail">
              <div><span>HALL DA FAMA LOCAL</span><strong>Suas melhores carreiras</strong></div>
              {hallOfFame.slice(0, 3).map((entry, index) => (
                <button type="button" className="hall-career-link" key={entry.id} aria-label={`Ver carreira completa de ${entry.name}`} onClick={() => openHallCareer(entry)}>
                  <b>#{index + 1}</b><ClubBadge club={clubById(entry.finalClubId)} size="sm" />
                  <div className="welcome-hall-copy"><strong>{entry.name}</strong><small>{entry.legacyLabel} · {entry.peakOverall} OVR</small></div><em>{entry.legacyPoints}</em>
                </button>
              ))}
            </div>
          )}
          {installHelp && <div className="install-help">Use o menu do navegador e toque em <strong>Adicionar à tela inicial</strong> ou <strong>Instalar aplicativo</strong>.</div>}
          <footer className="welcome-meta-footer">
            <div className="welcome-features"><span><FutboboIcon name="career" /> {CLUBS.length} clubes</span><span><FutboboIcon name="player" /> 12 posições</span><span><FutboboIcon name="trophy" /> {LEAGUES.length} ligas</span><span><FutboboIcon name="globe" /> {COUNTRIES.length} seleções</span></div>
            <div className="welcome-version"><span>FUTBOBO</span><b>{FUTBOBO_VERSION} · {FUTBOBO_VERSION_NAME}</b></div>
          </footer>
        </section>
      )}

      {(["identity", "appearance", "nationality", "academy", "formation", "story"] as Phase[]).includes(game.phase) && (
        <CreationSpread
          game={game}
          setGame={setGame}
          shirtNumberInput={shirtNumberInput}
          setShirtNumberInput={setShirtNumberInput}
          rollPlayerName={rollPlayerName}
          selectPlayerStory={selectPlayerStory}
          appearanceEnabled={appSettings.characterButtonsEnabled !== false}
        />
      )}

      {false && game.phase === "identity" && (
        <section className="setup-screen screen-enter">
          <header className="step-header">
            <button className="icon-button" onClick={() => setGame((current) => ({ ...current, phase: "welcome" }))} aria-label="Voltar">←</button>
            <div><span>PASSO 1 DE {appSettings.characterButtonsEnabled !== false ? 6 : 5}</span><strong>Quem vai vestir a camisa?</strong></div>
            <div className="step-count">01</div>
          </header>
          <div className="setup-content">
            <div className="identity-card">
              <div className="academy-avatar"><span>{game.number}</span><small>{game.position}</small></div>
              <div><span>IDADE INICIAL</span><strong>12 ANOS</strong><small>O sonho começa agora</small></div>
            </div>
            <div className="field-label">
              <label htmlFor="player-name">Nome do jogador</label>
              <div className="input-action-wrap name-input-wrap">
                <input id="player-name" className="text-input" value={game.name} maxLength={18} placeholder="Como a torcida vai te chamar?" onChange={(event) => setGame((current) => ({ ...current, name: event.target.value }))} />
                <button className="input-random-die random-name-die" type="button" aria-label="Sortear outro nome" title="Sortear outro nome" onClick={rollPlayerName}>⚄</button>
              </div>
            </div>
            <div className="two-fields">
              <label className="field-label">Camisa
                <span className="input-action-wrap shirt-input-wrap">
                  <input className="text-input" type="number" inputMode="numeric" min={1} max={99} value={shirtNumberInput} onChange={(event) => {
                    const nextValue = event.target.value;
                    setShirtNumberInput(nextValue);
                    if (!nextValue) return;
                    setGame((current) => ({ ...current, number: clamp(Number(nextValue) || 10, 1, 99) }));
                  }} />
                  <button className="input-random-die" type="button" aria-label="Sortear número da camisa" title="Sortear número da camisa" onClick={rollShirtNumber}>⚄</button>
                </span>
              </label>
              <fieldset className="field-label foot-field"><legend>Pé dominante</legend>
                <div className="segmented">
                  {(["Esquerda", "Direita"] as const).map((foot) => <button key={foot} type="button" aria-pressed={game.foot === foot} className={game.foot === foot ? "selected" : ""} onClick={() => setGame((current) => ({ ...current, foot }))}>{foot}</button>)}
                </div>
              </fieldset>
            </div>
            <div className="section-heading position-heading"><div><span>POSIÇÃO</span><h2>Onde você quer fazer história?</h2></div><span className="position-selection-summary"><b>{position.key}</b><small>{position.name}</small></span></div>
            <div className="position-grid">
              {POSITIONS.map((item) => (
                <button key={item.key} type="button" aria-pressed={game.position === item.key} className={`position-button ${game.position === item.key ? "selected" : ""}`} onClick={() => setGame((current) => ({ ...current, position: item.key }))} style={{ "--position-color": item.color, ...POSITION_FIELD_SPOTS[item.key] } as CSSProperties}>
                  <span>{item.icon}</span><strong>{item.key}</strong><small>{item.name}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="sticky-action"><button className="primary-button" disabled={!game.name.trim()} onClick={() => setGame((current) => ({ ...current, name: current.name.trim(), number: clamp(Number(shirtNumberInput) || 10, 1, 99), phase: appSettings.characterButtonsEnabled !== false ? "appearance" : "nationality" }))}>{appSettings.characterButtonsEnabled !== false ? "Criar meu jogador" : "Escolher nacionalidade"} <span>→</span></button></div>
        </section>
      )}

      {false && game.phase === "appearance" && appSettings.characterButtonsEnabled !== false && (
        <section className="setup-screen appearance-setup-screen screen-enter">
          <header className="step-header">
            <button className="icon-button" onClick={() => setGame((current) => ({ ...current, phase: "identity" }))} aria-label="Voltar">←</button>
            <div><span>PASSO 2 DE 6</span><strong>Como você aparece dentro da mesa?</strong></div>
            <div className="step-count">02</div>
          </header>
          <div className="setup-content">
            <div className="appearance-setup-heading"><span>SEU PERSONAGEM</span><h2>Crie um rosto que você reconheça no primeiro toque.</h2><p>O uniforme começa neutro. Assim que você escolher um clube, ele assume automaticamente as cores da nova camisa.</p></div>
            <PlayerAppearanceEditor
              value={game.playerAppearance}
              onChange={(playerAppearance) => setGame((current) => ({ ...current, playerAppearance }))}
              playerName={game.name}
              number={game.number}
            />
          </div>
          <div className="sticky-action"><button className="primary-button" onClick={() => setGame((current) => ({ ...current, phase: "nationality" }))}>Escolher nacionalidade <span>→</span></button></div>
        </section>
      )}

      {false && game.phase === "nationality" && (
        <section className="setup-screen screen-enter">
          <header className="step-header">
            <button className="icon-button" onClick={() => setGame((current) => ({ ...current, phase: appSettings.characterButtonsEnabled !== false ? "appearance" : "identity" }))} aria-label="Voltar">←</button>
            <div><span>PASSO {appSettings.characterButtonsEnabled !== false ? 3 : 2} DE {appSettings.characterButtonsEnabled !== false ? 6 : 5}</span><strong>Por qual país você vai jogar?</strong></div>
            <div className="step-count">{appSettings.characterButtonsEnabled !== false ? "03" : "02"}</div>
          </header>
          <div className="setup-content">
            <div className="intro-card"><span className="intro-icon">◇</span><div><strong>Sua Seleção vai te acompanhar a carreira toda.</strong><p>A nacionalidade define sua rota de base, as categorias Sub-17, Sub-20 e Olímpica, além da Copa do Mundo e do torneio continental da sua região.</p></div></div>
            <label className="nation-search">
              <span>BUSCAR ENTRE {COUNTRIES.length} SELEÇÕES</span>
              <input value={nationalitySearch} onChange={(event) => setNationalitySearch(event.target.value)} placeholder="Ex.: Uzbequistão, Canadá, França..." />
            </label>
            <div className="nation-grid">
              {filteredCountries.map((country) => (
                <button key={country.id} aria-pressed={game.nationality === country.id} className={`nation-choice ${game.nationality === country.id ? "selected" : ""}`} onClick={() => setGame((current) => ({ ...current, nationality: country.id, academyCountryId: defaultAcademyCountry(country.id), academyClubId: "" }))}>
                  <NationBadge country={country} size="md" />
                  <span><strong>{country.name}</strong><small>{continentalNationalTournament(country)}</small></span>
                </button>
              ))}
            </div>
          </div>
          <div className="sticky-action"><button className="primary-button" onClick={() => setGame((current) => ({ ...current, phase: "academy" }))}>Escolher clube de base <span>→</span></button></div>
        </section>
      )}

      {false && game.phase === "academy" && (
        <section className="setup-screen screen-enter">
          <header className="step-header">
            <button className="icon-button" onClick={() => setGame((current) => ({ ...current, phase: "nationality" }))} aria-label="Voltar">←</button>
            <div><span>PASSO {appSettings.characterButtonsEnabled !== false ? 4 : 3} DE {appSettings.characterButtonsEnabled !== false ? 6 : 5}</span><strong>Escolha sua base</strong></div>
            <div className="step-count">{appSettings.characterButtonsEnabled !== false ? "04" : "03"}</div>
          </header>
          <div className="setup-content">
            <div className={`intro-card academy-route-card ${hasLocalAcademyRoute(game.academyCountryId) ? "local" : "international"}`}><NationBadge country={countryById(game.academyCountryId)} size="sm" /><div><small>{academyRoute.label}</small><strong>{academyRoute.title}</strong><p>{academyRoute.text}</p></div></div>
            <div className="section-heading"><div><span>PAÍS DA BASE</span><h2>Onde você vai se formar?</h2></div><button className="secondary-button" type="button" onClick={() => setGame((current) => ({ ...current, academyCountryId: pick(COUNTRIES.filter((country) => PLAYABLE_ACADEMY_COUNTRIES.includes(country.id)), current.seed, current.season + current.history.length).id, academyClubId: "" }))}>Aleatório</button></div>
            <div className="nation-grid academy-country-grid">
              {sortedCountries(COUNTRIES.filter((country) => PLAYABLE_ACADEMY_COUNTRIES.includes(country.id))).map((country) => (
                <button key={country.id} aria-pressed={game.academyCountryId === country.id} className={`nation-choice ${game.academyCountryId === country.id ? "selected" : ""}`} onClick={() => setGame((current) => ({ ...current, academyCountryId: country.id, academyClubId: "" }))}>
                  <NationBadge country={country} size="md" />
                  <span><strong>{country.name}</strong><small>{country.id === game.nationality ? "mesmo país da seleção" : country.id === defaultAcademyCountry(game.nationality) ? "rota recomendada" : "liga jogável"}</small></span>
                </button>
              ))}
            </div>
            <div className="club-grid">
              <button className="club-choice random-academy-choice" onClick={() => setGame((current) => ({ ...current, academyClubId: pick(academyClubs, current.seed, current.season + current.history.length).id }))}>
                <span className="free-agent-symbol">?</span>
                <span><strong>Escolha aleatória</strong><small>Deixa o destino decidir uma das quatro bases</small></span>
                <span className="academy-stars">★★★★★</span>
              </button>
              {academyClubs.map((club) => (
                <button key={club.id} className={`club-choice ${game.academyClubId === club.id ? "selected" : ""}`} onClick={() => setGame((current) => ({ ...current, academyClubId: club.id }))}>
                  <ClubBadge club={club} size="md" />
                  <span><strong>{club.shortName}</strong><small>{club.city} · {countryById(club.countryId).name}</small></span>
                  <span className="academy-stars">{"★".repeat(Math.max(1, club.academy ?? Math.max(1, Math.min(5, Math.round((club.reputation + club.strength / 22) / 2)))))}{"☆".repeat(5 - Math.max(1, club.academy ?? Math.max(1, Math.min(5, Math.round((club.reputation + club.strength / 22) / 2)))))}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="sticky-action"><button className="primary-button" disabled={!game.academyClubId} onClick={() => setGame((current) => ({ ...current, phase: "formation" }))}>Definir sua formação <span>→</span></button></div>
        </section>
      )}

      {false && game.phase === "formation" && (
        <section className="setup-screen screen-enter">
          <header className="step-header">
            <button className="icon-button" onClick={() => setGame((current) => ({ ...current, phase: "academy" }))} aria-label="Voltar">←</button>
            <div><span>PASSO {appSettings.characterButtonsEnabled !== false ? 5 : 4} DE {appSettings.characterButtonsEnabled !== false ? 6 : 5}</span><strong>Que jogador você será?</strong></div>
            <div className="step-count">{appSettings.characterButtonsEnabled !== false ? "05" : "04"}</div>
          </header>
          <div className="setup-content">
            <div className="section-heading"><div><span>PRIMEIRA DECISÃO</span><h2>Seu foco até virar profissional</h2></div></div>
            <p className="setup-lead">Essa escolha muda sua curva de evolução, a idade da revelação e os eventos que encontrarão você.</p>
            <div className="formation-list">
              {FORMATIONS.map((formation) => (
                <button key={formation.id} className="formation-card" onClick={() => selectFormation(formation.id)}>
                  <span className="formation-icon">{formation.icon}</span>
                  <span className="formation-copy"><small>{formation.subtitle}</small><strong>{formation.title}</strong><p>{formation.description}</p></span>
                  <span className="formation-arrow">→</span>
                </button>
              ))}
            </div>
          </div>
          <div className="setup-note">A base será simulada rapidamente dos 12 até os 16–18 anos.</div>
        </section>
      )}

      {false && game.phase === "story" && (
        <section className="setup-screen story-setup-screen screen-enter">
          <header className="step-header">
            <button className="icon-button" onClick={() => setGame((current) => ({ ...current, phase: "formation" }))} aria-label="Voltar">←</button>
            <div><span>PASSO {appSettings.characterButtonsEnabled !== false ? 6 : 5} DE {appSettings.characterButtonsEnabled !== false ? 6 : 5}</span><strong>Qual história trouxe você até aqui?</strong></div>
            <div className="step-count">{appSettings.characterButtonsEnabled !== false ? "06" : "05"}</div>
          </header>
          <div className="setup-content">
            <div className="story-intro">
              <span>ORIGEM DO JOGADOR</span>
              <h2>Uma carreira começa antes da estreia.</h2>
              <p>Sua origem altera o começo, muda eventos da carreira e abre capítulos exclusivos durante os anos. Não existe opção perfeita.</p>
              <button type="button" className="secondary-button story-random-button" onClick={selectRandomPlayerStory}>⚄ Escolher história aleatória</button>
            </div>
            <div className="player-story-grid">
              {PLAYER_STORIES.map((story) => (
                <button
                  type="button"
                  key={story.id}
                  className={`player-story-card story-${story.tone}`}
                  onClick={() => selectPlayerStory(story.id)}
                >
                  <span className="player-story-icon">{story.icon}</span>
                  <span className="player-story-copy">
                    <small>{story.tagline}</small>
                    <strong>{story.title}</strong>
                    <p>{story.description}</p>
                    <em>{story.promise}</em>
                  </span>
                  <b>→</b>
                </button>
              ))}
            </div>
          </div>
          <div className="setup-note">A origem não revela seu potencial. Ela muda o tipo de história que a carreira pode contar.</div>
        </section>
      )}

      {game.phase === "youth" && !youthMode && !youthPlayRequested && <YouthChoiceSpread game={game} onChoose={pickYouthMode} />}

      {game.phase === "youth" && (youthMode === "play" || (!youthMode && youthPlayRequested)) && (
        <YouthPlayPanel
          game={game}
          setGame={setGame}
          club={clubById(game.academyClubId)}
          badge={<ClubBadge club={clubById(game.academyClubId)} size="md" />}
          brand={<div className="brand-mini"><BrandMark size="sm" /> FUTBOBO</div>}
          performance={appSettings.botao3dPerformance === true}
          onContinue={() => setGame((current) => ({ ...current, phase: "revelation" }))}
        />
      )}

      {game.phase === "youth" && youthMode === "simulate" && (
        <YouthSimSpread game={game} youthStep={youthStep} finished={youthFinished} onContinue={() => setGame((current) => ({ ...current, phase: "revelation" }))} />
      )}

      {false && game.phase === "youth-complete" && (
        <section className="youth-complete-screen screen-enter">
          <div className="brand-mini"><BrandMark size="sm" /> FUTBOBO</div>
          <div className="youth-finish-icon">✓</div>
          <span className="eyebrow">FIM DAS CATEGORIAS DE BASE</span>
          <h1>Você está pronto para o profissional.</h1>
          <p>Dos 12 aos {game.revealAge}, cada treino empurrou você até esta porta. Respire: seu primeiro contrato está do outro lado.</p>
          <div className="youth-recap">
            <Metric label="Idade" value={`${game.revealAge} anos`} />
            <Metric label="OVR" value={game.overall} tone="gold" />
            <Metric label="Perfil" value={position.style} tone="green" />
          </div>
          <div className="last-youth-note"><span>{game.youthYears.at(-1)?.age}</span><div><strong>{game.youthYears.at(-1)?.title}</strong><p>{game.youthYears.at(-1)?.text}</p></div></div>
          <button className="primary-button" onClick={() => setGame((current) => ({ ...current, phase: "revelation" }))}>Ver propostas profissionais <span>→</span></button>
        </section>
      )}

      {game.phase === "revelation" && <FirstContractSpread game={game} onBack={() => setGame((current) => ({ ...current, phase: "youth" }))} onSign={signProfessional} />}

      {false && game.phase === "revelation" && (
        <section className="revelation-screen screen-enter">
          <div className="reveal-rays" aria-hidden="true" />
          <div className="reveal-top"><span>JOGADOR REVELADO</span><small>{game.season}</small></div>
          <div className="reveal-card">
            <ClubBadge club={clubById(game.academyClubId)} size="lg" />
            <div className="reveal-overall"><span>OVR</span><strong>{game.overall}</strong></div>
            <div className="reveal-name"><small>{game.archetype}</small><h1>{game.name}</h1><span>#{game.number} · {position.name} · {game.foot}</span><span className="reveal-nation"><NationBadge country={nationCountry} size="sm" />{nationCountry.name}</span></div>
            <div className="reveal-stats"><Metric label="Revelado aos" value={`${game.revealAge} anos`} /><Metric label="Momento" value="Em avaliação" tone="gold" /><Metric label="Estilo" value={position.style} /></div>
          </div>
          <div className="contract-section"><div className="section-heading"><div><span>PRIMEIRO CONTRATO</span><h2>Quem aposta em você?</h2></div></div>
            <div className="offer-list">
              {game.proOffers.map((clubId, index) => {
                const club = clubById(clubId);
                return <button className="offer-card" key={clubId} onClick={() => signProfessional(clubId)}><ClubBadge club={club} /><span><small>{index === 0 ? "PROMOÇÃO DA BASE" : "PROPOSTA PROFISSIONAL"}</small><strong>{club.shortName}</strong><em>{index === 0 ? "Projeto conhecido" : index === 1 ? "Mais minutos" : "Maior vitrine"}</em></span><b>→</b></button>;
              })}
            </div>
          </div>
        </section>
      )}

      {(game.phase === "career" || game.phase === "consequence" || game.phase === "season-result" || game.phase === "transfer" || game.phase === "transfer-denied" || game.phase === "retirement-confirm") && (
        <AlbumShell
          club={currentClub}
          tab={game.phase === "career" ? albumTab : null}
          onTab={changeTab}
          showTabs={game.phase === "career"}
          label={`Álbum da carreira de ${game.name}, temporada ${headerSeason}`}
          spreadClassName={(game.phase === "career" && albumTab === "event") || game.phase === "consequence" ? careerSpreadStyles.flowSpread : undefined}
        >
        {luckSpin && <LuckOverlay choiceLabel={luckSpin.event.choices[luckSpin.choiceIndex]?.label ?? ""} chance={luckSpin.event.choices[luckSpin.choiceIndex]?.luck?.chance ?? 50} />}

          {((game.phase === "career" && albumTab === "event") || (game.phase === "consequence" && game.lastConsequence)) && (
            <CareerSpread
              mode={game.phase === "consequence" ? "consequence" : "decision"}
              game={game}
              club={currentClub}
              event={currentEvent}
              season={headerSeason}
              age={headerAge}
              positionName={position.name}
              leagueName={leagueById(game.currentLeagueId || currentClub.leagueId).name}
              nationName={nationCountry.name}
              supporter={supporterMood}
              appearance={albumAppearance}
              consequence={game.phase === "consequence" ? game.lastConsequence : null}
              market={{
                loanChance: game.squadRole === "titular" || game.squadRole === "estrela" ? 35 : 100,
                loanDisabled: game.transferCooldownSeason >= game.season || game.isFreeAgent || game.contractYears <= 0 || Boolean(game.activeLoan || game.loanParentClubId),
                transferDisabled: game.transferCooldownSeason >= game.season,
                cooldown: game.transferCooldownSeason >= game.season,
                onLoan: requestLoan,
                onTransfer: requestTransfer,
              }}
              continueLabel={game.retireAfterSeason ? "Ver resultado da última temporada" : "Ver resultado da temporada"}
              onChoose={chooseEvent}
              onContinue={continueAfterConsequence}
              onRetire={requestRetirement}
              onOpenWorld={() => changeTab("world")}
            />
          )}

          {game.phase === "season-result" && game.lastResult && (
            <SeasonResultSpread
              game={game}
              club={currentClub}
              continueLabel={game.retireAfterSeason ? "Concluir carreira" : game.transferMarketOffers.some((offer) => offer.reason === "scouted") ? "Ver propostas recebidas" : game.transferOffers.length ? "Abrir janela de transferências" : "Próxima temporada"}
              onContinue={continueAfterResult}
            />
          )}

          {game.phase === "transfer" && (
            <TransferSpread
              game={game}
              club={currentClub}
              appearance={albumAppearance}
              offers={marketOffers}
              renewalOffer={renewalOffer}
              onChoose={chooseTransfer}
              onStay={() => chooseTransfer(null)}
              onBecomeFreeAgent={becomeFreeAgent}
              onWait={waitAsFreeAgent}
            />
          )}

          {game.phase === "transfer-denied" && game.transferStatus && (
            <TransferDeniedSpread game={game} club={currentClub} appearance={albumAppearance} supporter={supporterMood} onContinue={continueAfterDeniedTransfer} />
          )}

          {game.phase === "retirement-confirm" && (
            <RetirementSpread game={game} club={currentClub} appearance={albumAppearance} onConfirm={confirmRetirement} onCancel={cancelRetirement} />
          )}

          {game.phase === "career" && albumTab === "profile" && (
            <PlayerTab
              game={game}
              club={currentClub}
              showAppearance={appSettings.characterButtonsEnabled !== false}
              onEditAppearance={() => setAppearanceEditorOpen(true)}
              positionChange={{
                open: positionChangeOpen,
                setOpen: setPositionChangeOpen,
                target: positionChangeTarget,
                setTarget: setPositionChangeTarget,
                feedback: positionChangeFeedback,
                setFeedback: setPositionChangeFeedback,
                attempt: attemptPositionChange,
              }}
            />
          )}
          {game.phase === "career" && albumTab === "team" && <TeamTab game={game} club={currentClub} />}
          {game.phase === "career" && albumTab === "history" && <HistoryTab game={game} club={currentClub} />}
          {game.phase === "career" && albumTab === "stats" && <StatsTab game={game} club={currentClub} />}
          {game.phase === "career" && albumTab === "world" && <WorldTab game={game} club={currentClub} />}
        </AlbumShell>
      )}

      {(game.phase === "summary" || hallPreview) && (
        <AlbumShell club={currentClub} tab={null} onTab={changeTab} showTabs={false} label="Fim de carreira">
          <SummarySpread
            game={displayGame}
            club={currentClub}
            appearance={appSettings.characterButtonsEnabled !== false ? { ...displayGame.playerAppearance, kitPattern: teamKitPattern(displayGame.seed, currentClub.id) } : null}
            positionName={position.name}
            nation={nationCountry}
            legacyLabel={legacyStanding.label}
            publicImageLabel={publicImage.label}
            followers={formatFollowers(displayGame.followers)}
            sponsorCount={displayGame.sponsorHistory.length + (displayGame.activeSponsor ? 1 : 0)}
            titles={shareTitleHighlights}
            awards={awardEntries}
            totalAwards={totalIndividualAwards}
            achievements={`${displayGame.unlockedAchievements.length}/${ACHIEVEMENTS.length}`}
            story={playerStoryById(displayGame.playerStoryId)}
            clubCareers={clubCareerSummary}
            selectedClub={selectedClubCareer}
            onSelectClub={setSummaryClubId}
            hall={hallOfFame}
            currentHallId={`${displayGame.seed}-${displayGame.name}-${displayGame.history.length}`}
            onOpenHall={openHallCareer}
            hallPreview={Boolean(hallPreview)}
            legacyWarning={Boolean(hallPreviewLegacy)}
            onCloseHall={closeHallCareer}
            shareBusy={shareBusy}
            onShare={shareCareer}
            onPlayAgain={displayGame.challengeId ? startChallenge : startNew}
          />
        </AlbumShell>
      )}
    </main>
  );
}
