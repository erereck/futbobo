"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { CLUBS, COUNTRIES, FIRST_MATCH_EVENT, FORMATIONS, LEAGUES, POSITIONS, countryById, leagueById } from "../../game-data";
import type { GameEvent, PositionKey } from "../../game-data";
import { ROLE_LABELS, calculateSquadRole, createContract, createSeasonObjective } from "../../career-systems";
import { legacyBreakdownForState, legacyTierV2 } from "../../career/legacy-prestige";
import { ACHIEVEMENTS, NEWS_TEMPLATES, fillNewsTemplate, findRivalry } from "../../mega-expansion";
import BotaoMatch from "../../botao/BotaoMatch";
import GoalReplay from "../../botao/GoalReplay";
import TeamCrest from "../../botao/TeamCrest";
import AndroidInstallDialog from "../../AndroidInstallDialog";
import PlayerAppearanceEditor, { PlayerAppearancePortrait } from "../../PlayerAppearanceEditor";
import { teamKitPattern, visualRosterForMatch } from "../../player-appearance";
import { checkForAndroidUpdate, isAndroidDevice, isNativeAndroid, openAndroidDownload } from "../../android-app";
import type { AndroidRelease } from "../../android-app";
import { buildFinalSetup, buildNationalMatchSetup, describeFinal, finalOutcome, formatGoalMinute, isMatchGoal, nationalMatchRole, pickClubWorldOpponent, pickNationalOpponent, ratingsFromAttributes, walkoverBotaoResult } from "../../botao/adapter";
import { simulateBotaoMatch } from "../../botao/simulate";
import type { BotaoMatchResult, BotaoMatchSetup } from "../../botao/types";
import { PLAYER_STORIES, playerStoryById } from "../../player-stories";
import type { PlayerStoryId } from "../../player-stories";
import type { AppSettings, AwardNomination, CareerHallEntry, ChallengeResult, CompetitionId, CompetitionResult, CustomClubDefinition, GameState, InstallPromptEvent, MonteCarloReport, NationalTier, PendingBotaoMatch, Phase, SeasonRecord, SeasonResult, SocialPost, TransferOffer } from "../../career/model";
import { ATTRIBUTE_GROUPS, ATTRIBUTE_LABELS, BALLON_DOR_EXCLUDED_TROPHIES, BOTAO_IN_PROGRESS_KEY, CHALLENGE_RESULTS_KEY, CHALLENGE_SAVE_KEY, HALL_OF_FAME_KEY, ORIGINAL_CLUB_PRESENTATION, POSITION_PRIMARY_ATTRIBUTES, SAVE_KEY, SETTINGS_KEY, SPECIAL_TRAITS, applyCustomClubDefinitions, archivedCareerState, attributeAverage, attributeTone, awardFinalists, awardPresentation, awardTierWeight, careerHallEntry, createCareerRivals, createPlayerAttributes, dailyChallenge, fictionalAwardWinner, initialState, normalizeSave, randomPlayerName, selectCareerTraits, shiftPlayerAttributes } from "../../career/state";
import { clamp, clubById, pick, seeded } from "../../career/shared";
import { eventForState, isNegativeConsequence, runMonteCarloCareers, simulateSeason } from "../../career/simulation";
import { PLAYABLE_ACADEMY_COUNTRIES, academyRouteCopy, continentalNationalTournament, continentalSlotAfterSeason, defaultAcademyCountry, hasLocalAcademyRoute, initialContinentalSlot, isEuropeanClub, isOutsideAcademyHome, positionByKey, randomAcademyClubs, sortedCountries } from "../../career/academy";
import { POSITION_FIELD_SPOTS, careerTrend, fanMood, formatFollowers, formatMoney, marketValue, mergeEffects, publicImageProfile, seasonAverageRating, simulatedWorldCupStats, worldCupStatsForSeason } from "../../career/performance";
import { AwardCeremony, AwardReveal, BrandMark, ClubBadge, CompetitionBadge, Metric, NationBadge, Progress, TROPHY_PRESENTATIONS, TrophyGallery } from "./CareerPrimitives";
import { applyEffect, applyStoryOrigin, createYouthJourney, selectNextEvent, storyClubCandidate } from "../../career/events";
import { buildFormerClubConference, buildPressConference, buildTransferPresentation } from "../../career/press-conferences";
import { isCycleShopDue, purchaseCycleShopItem } from "../../career/cycle-shop";
import type { CycleShopItemId } from "../../career/cycle-shop";
import { applyAcceptedTransfer, buildRenewalOffer, completeLoanReturn, generateTransferOffers, loanClubPermanentOffer, materializeTransferOffers, resolveTransferRequest, stayAfterYouthLoanRecommendation } from "../../career/transfer-market";
import { exportCareerStorageSnapshot, importCareerStorageSnapshot } from "../../career/save-system";
import { compactBotaoMatchResult, compactGameForPersistence } from "../../career/save-compaction";
import { applyNationalBotaoProduction } from "../../career/botao-production";
import PlayerCreationV2, { FirstContractV2 } from "./PlayerCreationV2";
import { CareerStatisticsArchive, PlayerReworkPanels } from "./CareerReworkPanels";
import CareerExtraStats from "./CareerExtraStats";
import CareerTimeline from "./CareerTimeline";
import CareerWorld, { WorldPulseButton } from "./CareerWorld";
import CareerTeam from "./CareerTeam";
import TransferMarketScreen from "./TransferMarketScreen";
import PressConferenceDialog from "./PressConferenceDialog";
import CycleShopDialog from "./CycleShopDialog";
import { worldFinalOpponentForSeason } from "../../career/world-club-competitions";
import FutboboIcon from "../FutboboIcon";

type CareerGameProps = {
  initialHallEntry?: CareerHallEntry | null;
  onCloseHallPreview?: () => void;
};

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
  const [economyFeedback, setEconomyFeedback] = useState("");
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
  const [summaryClubId, setSummaryClubId] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const saveImportRef = useRef<HTMLInputElement>(null);

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
      };
      applyCustomClubDefinitions(sanitizedSettings.customClubs ?? []);
      queueMicrotask(() => setAppSettings(sanitizedSettings));
    } catch {
      localStorage.removeItem(SAVE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(appSettings));
  }, [appSettings]);

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

  useEffect(() => {
    const locksViewport =
      game.phase === "career" ||
      game.phase === "consequence" ||
      game.phase === "transfer" ||
      game.phase === "transfer-denied" ||
      game.phase === "retirement-confirm";
    if (!locksViewport) return;

    document.documentElement.classList.add("futbobo-viewport-locked");
    document.body.classList.add("futbobo-viewport-locked");
    window.scrollTo(0, 0);
    return () => {
      document.documentElement.classList.remove("futbobo-viewport-locked");
      document.body.classList.remove("futbobo-viewport-locked");
    };
  }, [game.phase]);

  useEffect(() => {
    if (game.phase !== "youth") return;
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
  }, [game.phase, game.youthYears]);

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
  const seasonClubTitles = game.lastResult?.competitions.filter((competition) => competition.champion) ?? [];
  const seasonNationalTitles = game.lastResult
    ? game.nationalHistory.filter((record) => record.season === game.lastResult?.season && record.champion)
    : [];
  const seasonWorldCupRecord = game.lastResult
    ? game.nationalHistory.find((record) => record.season === game.lastResult?.season && record.name === "Copa do Mundo")
    : null;
  const seasonTitleCount = seasonClubTitles.length + seasonNationalTitles.length;
  const seasonBotaoResults = game.lastResult?.botaoResults ?? [];
  const seasonBotaoWins = seasonBotaoResults.filter(({ result }) => result.champion).length;
  const seasonBotaoLosses = seasonBotaoResults.length - seasonBotaoWins;
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
    return buildFinalSetup({
      seed: state.seed,
      season: match.season,
      competitionId: match.competitionId,
      competitionName: match.competitionName,
      stageName: match.stageName,
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
  const sponsorCareerValue = useMemo(
    () => [
      ...game.sponsorHistory,
      ...(game.activeSponsor ? [game.activeSponsor] : []),
    ].reduce((total, deal) => {
      const elapsedSeasons = deal.status === "active"
        ? Math.max(1, game.season - deal.startSeason)
        : Math.max(1, deal.endSeason - deal.startSeason);
      return total + deal.annualValue * elapsedSeasons;
    }, 0),
    [game.sponsorHistory, game.activeSponsor, game.season],
  );
  const legacyStanding = useMemo(() => legacyTierV2(displayGame.legacyPoints), [displayGame.legacyPoints]);
  const marketOffers = useMemo(() => {
    const validIds = new Set(game.transferOffers);
    const rich = game.transferMarketOffers.filter((offer) => validIds.size === 0 || validIds.has(offer.clubId));
    return rich.length === game.transferOffers.length
      ? rich
      : materializeTransferOffers(game, game.transferOffers, game.season * 43, {
          includeForeign: true,
          mode: game.pendingTransferMode === "loan" ? "loan" : game.isFreeAgent ? "free-agent" : "permanent",
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
  const seasonCeremonyNomination = useMemo(
    () => [...(game.lastResult?.awardNominations ?? [])]
      .sort((a, b) => awardTierWeight(b.award) - awardTierWeight(a.award) || Number(b.won) - Number(a.won))[0] ?? null,
    [game.lastResult],
  );
  const totalAwardNominations = useMemo(
    () => game.history.reduce((total, record) => total + record.awardNominations.length, 0),
    [game.history],
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
  const statistics = useMemo(() => {
    const history = game.history;
    const by = <K extends keyof SeasonRecord>(key: K) => [...history].sort((a, b) => Number(b[key] ?? 0) - Number(a[key] ?? 0))[0] ?? null;
    const bestSeason = [...history].sort((a, b) =>
      (b.averageRating ?? seasonAverageRating(b.performanceScore ?? 0, game.seed, b.season)) -
      (a.averageRating ?? seasonAverageRating(a.performanceScore ?? 0, game.seed, a.season)) ||
      b.goals + b.assists - a.goals - a.assists,
    )[0] ?? null;
    return {
      recent: history.slice(-10),
      bestSeason,
      mostGoals: by("goals"),
      mostAssists: by("assists"),
      mostAppearances: by("appearances"),
      highestOverall: by("overall"),
      highestValue: [...history].sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))[0] ?? null,
      goalRate: game.stats.appearances ? game.stats.goals / game.stats.appearances : 0,
      contributionRate: game.stats.appearances ? (game.stats.goals + game.stats.assists) / game.stats.appearances : 0,
      careerRating: history.length
        ? history.reduce((total, record) => total + (record.averageRating ?? seasonAverageRating(record.performanceScore ?? 0, game.seed, record.season)), 0) / history.length
        : 0,
      manOfTheMatchAwards: history.reduce((total, record) => total + (record.manOfTheMatchAwards ?? 0), 0),
    };
  }, [game.history, game.seed, game.stats.appearances, game.stats.goals, game.stats.assists]);
  const currentEvent = eventForState(game);

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
  const nationalTierLabel: Record<NationalTier, string> = { none: "Fora dos planos", sub17: "Seleção Sub-17", sub20: "Seleção Sub-20", olympic: "Seleção Olímpica", main: "Seleção Principal" };

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
    const pendingMatch = state.pendingBotaoMatches[0];
    if (!pendingMatch || state.phase !== "botao-final") return;
    try {
      const marker = JSON.parse(localStorage.getItem(BOTAO_IN_PROGRESS_KEY) ?? "null") as {
        saveKey?: string;
        matchId?: string;
      } | null;
      const setup = setupForPendingBotaoMatch(state, pendingMatch);
      if (marker?.saveKey === saveKey && marker.matchId === setup.matchId) {
        applyBotaoMatchResult(walkoverBotaoResult(setup), setup);
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
      } else if (multiCareerImport.activeState) {
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
      };
    });
    vibrate();
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

  function applyBotaoMatchResult(matchResult: BotaoMatchResult, setupOverride?: BotaoMatchSetup | null) {
    const resolvedSetup = setupOverride ?? currentBotaoSetup;
    localStorage.removeItem(BOTAO_IN_PROGRESS_KEY);
    setGame((current) => {
      const match = current.pendingBotaoMatches[0];
      if (!match || matchResult.matchId !== resolvedSetup?.matchId) return current;
      // Replay só existe para a tela imediatamente após o apito. Arquivar os
      // frames em cada temporada multiplicava o tamanho do save a cada partida.
      const archivedMatchResult = compactBotaoMatchResult(matchResult);

      const formerClub = match.source === "club" && current.history.some((record) => record.clubId === match.opponentId)
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
          : interviewEligible && matchResult.manOfTheMatch && resolvedSetup
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
      let resolvedResult = nextState.lastResult;
      const playsInEurope = isEuropeanClub(clubById(nextState.currentClubId));
      const resolvedWorldCupStats = worldCupStatsForSeason(nextState, match.season);
      const earnedWorldCupGoldenBoot = Boolean(
        seasonResolved &&
        resolvedResult &&
        resolvedWorldCupStats &&
        resolvedWorldCupStats.goals >= 6 &&
        !resolvedResult.awards.includes("Artilheiro da Copa do Mundo"),
      );
      if (earnedWorldCupGoldenBoot && resolvedResult) {
        const goldenBootAward = "Artilheiro da Copa do Mundo";
        const updatedAwardCabinet = {
          ...nextState.awardCabinet,
          [goldenBootAward]: (nextState.awardCabinet[goldenBootAward] ?? 0) + 1,
        };
        const addGoldenBoot = <T extends SeasonRecord | SeasonResult>(record: T): T => ({
          ...record,
          awards: [...record.awards, goldenBootAward],
        });
        resolvedResult = addGoldenBoot(resolvedResult);
        nextState = {
          ...nextState,
          awards: nextState.awards + 1,
          awardCabinet: updatedAwardCabinet,
          lastResult: resolvedResult,
          history: nextState.history.map((record) =>
            record.season === match.season ? addGoldenBoot(record) : record,
          ),
        };
      }
      const alreadyHasBallon = Boolean(resolvedResult?.awards.includes("Bola de Ouro"));
      const hasProductionAward = Boolean(resolvedResult?.awards.some((award) =>
        award.includes("Artilheiro") ||
        award.includes("Chuteira de Ouro") ||
        award.includes("Rei das Assistências"),
      ));
      const worldCupBallonSurge = Boolean(playsInEurope && (resolvedWorldCupStats?.goals ?? 0) >= 8);
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
        currentEventId: pendingCareerEventId || selectNextEvent(transferred, current.season * 47),
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

  function buyCareerItem(item: "recovery" | "media" | "coach" | "potential" | "corruption") {
    const prices = { recovery: 350_000, media: 600_000, coach: 1_200_000, potential: 2_500_000, corruption: 2_000_000 };
    const price = prices[item];
    const purchaseKey = `${game.season}:${item}`;
    if (game.spendableMoney < price || game.economyPurchases.includes(purchaseKey)) return;
    const corruptionSucceeded = item === "corruption" && seeded(game.seed, game.season * 1877 + game.economyPurchases.length * 31) < 0.5;
    const corruptionBanYears = 5;
    setGame((current) => {
      const next = {
        ...current,
        money: current.money - price,
        spendableMoney: current.spendableMoney - price,
        economyPurchases: [...current.economyPurchases, purchaseKey],
      };
      if (item === "recovery") {
        next.fitness = clamp(current.fitness + 12);
        next.morale = clamp(current.morale + 7);
      } else if (item === "media") {
        next.mediaRelation = clamp(current.mediaRelation + 10);
        next.lifeBalance = clamp(current.lifeBalance + 5);
        next.followers = current.followers + Math.max(25_000, Math.round(current.followers * 0.04));
      } else if (item === "coach") {
        next.attributes = shiftPlayerAttributes(current.attributes, 1, current.position, current.seed + current.season * 613);
      } else if (item === "potential") {
        next.potential = clamp(current.potential < 80 ? current.potential + 2 : current.potential - 2, current.overall, 99);
      } else if (corruptionSucceeded) {
        next.corruptionGuaranteedSeason = current.season;
        next.discipline = clamp(current.discipline - 18);
        next.mediaRelation = clamp(current.mediaRelation - 8);
      } else {
        next.phase = "transfer" as Phase;
        next.isFreeAgent = true;
        next.freeAgentSinceSeason = current.season;
        next.forcedFreeAgentUntilSeason = current.season + corruptionBanYears;
        next.transferOffers = [];
        next.contractYears = 0;
        next.annualSalary = 0;
        next.activeSponsor = null;
        next.managerTrust = 0;
        next.fanSupport = clamp(current.fanSupport - 30);
        next.reputation = clamp(current.reputation - 35);
        next.discipline = clamp(current.discipline - 45);
        next.transferRequested = true;
        next.transferStatus = {
          success: false,
          chance: 50,
          headline: "O esquema foi descoberto",
          text: `A investigação expulsou você do mercado por ${corruptionBanYears} anos. Nenhum clube poderá contratar você antes de ${current.season + corruptionBanYears}.`,
        };
        next.newsFeed = [
          `${current.season}: tentativa de corrupção descoberta; ${current.name} foi afastado do futebol por ${corruptionBanYears} anos.`,
          ...current.newsFeed,
        ].slice(0, 16);
      }
      return next;
    });
    setEconomyFeedback(
      item === "corruption"
        ? corruptionSucceeded
          ? "O acordo ficou escondido. O título nacional desta temporada está garantido — mas sua disciplina e sua imagem já carregam a escolha."
          : `O pagamento deixou rastros. Você foi banido do mercado por ${corruptionBanYears} anos e terá de atravessar esse período como agente livre.`
        : item === "potential"
        ? "A recalibração foi concluída. O relatório continua confidencial: você só descobrirá o efeito acompanhando sua evolução."
        : item === "coach"
          ? "O trabalho individual acrescentou um pequeno ganho técnico aos seus atributos."
          : item === "media"
            ? "A nova equipe reorganizou sua imagem, sua agenda e seu alcance."
            : "A estrutura de recuperação devolveu energia e tranquilidade.",
    );
    setToast(item === "corruption" ? (corruptionSucceeded ? "Esquema fechado — título garantido" : "Esquema descoberto") : `${formatMoney(price)} investidos na carreira`);
    vibrate();
  }

  function buyCycleShopItem(itemId: CycleShopItemId, countryId?: string) {
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
      const fitText = (value: string, maxWidth: number, startSize: number, minSize: number, weight = 900) => {
        let size = startSize;
        do {
          ctx.font = `${weight} ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
          if (ctx.measureText(value).width <= maxWidth) break;
          size -= 2;
        } while (size > minSize);
        return size;
      };
      const card = (x: number, y: number, width: number, height: number, fill = "#0d2118") => {
        roundRect(x, y, width, height, 22);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,.12)";
        ctx.lineWidth = 2;
        ctx.stroke();
      };

      ctx.fillStyle = "#06130d";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "rgba(244,196,48,.035)";
      for (let x = -300; x < 1300; x += 180) {
        ctx.save();
        ctx.translate(x, 0);
        ctx.transform(1, 0, -.35, 1, 0, 0);
        ctx.fillRect(0, 0, 82, 1350);
        ctx.restore();
      }
      ctx.fillStyle = "#f4c430";
      ctx.fillRect(0, 0, 1080, 14);

      ctx.fillStyle = "#f4c430";
      ctx.font = '900 42px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.fillText("F⚽ FUTBOBO", 64, 86);
      ctx.fillStyle = "#91a79c";
      ctx.font = '800 22px Manrope, Arial, sans-serif';
      ctx.textAlign = "right";
      ctx.fillText("ARQUIVO DE CARREIRA", 1016, 80);
      ctx.textAlign = "left";

      card(64, 124, 952, 320, "#0b1d15");
      ctx.fillStyle = currentClub.primary || "#1a5e42";
      ctx.beginPath();
      ctx.arc(172, 268, 76, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = currentClub.secondary || "#f4c430";
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.font = '900 38px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.fillText(currentClub.abbr.slice(0, 4), 172, 281);
      ctx.textAlign = "left";

      ctx.fillStyle = "#f4c430";
      ctx.font = '900 20px Manrope, Arial, sans-serif';
      ctx.fillText(displayGame.archetype.toLocaleUpperCase("pt-BR"), 280, 193);
      const nameSize = fitText(displayGame.name.toLocaleUpperCase("pt-BR"), 570, 76, 42);
      ctx.fillStyle = "#f3f6f4";
      ctx.font = `900 ${nameSize}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      ctx.fillText(displayGame.name.toLocaleUpperCase("pt-BR"), 280, 265);
      ctx.fillStyle = "#91a79c";
      ctx.font = '700 24px Manrope, Arial, sans-serif';
      ctx.fillText(`#${displayGame.number} · ${position.name} · ${nationCountry.name}`, 280, 307);
      ctx.fillText(`${displayGame.history.length} temporadas · aposentou aos ${displayGame.age}`, 280, 346);
      ctx.fillStyle = "#f4c430";
      ctx.font = '900 76px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.textAlign = "right";
      ctx.fillText(String(peakOverall), 960, 379);
      ctx.fillStyle = "#91a79c";
      ctx.font = '800 17px Manrope, Arial, sans-serif';
      ctx.fillText("PICO OVR", 960, 407);
      ctx.textAlign = "left";

      const metrics = [
        ["JOGOS", displayGame.stats.appearances],
        [displayGame.position === "GOL" ? "SEM SOFRER" : "GOLS", displayGame.position === "GOL" ? displayGame.stats.cleanSheets : displayGame.stats.goals],
        ["ASSISTÊNCIAS", displayGame.stats.assists],
        ["TAÇAS", totalTitles],
      ] as const;
      metrics.forEach(([label, value], index) => {
        const x = 64 + index * 242;
        card(x, 468, 226, 132);
        ctx.fillStyle = "#91a79c";
        ctx.font = '800 17px Manrope, Arial, sans-serif';
        ctx.fillText(label, x + 22, 508);
        ctx.fillStyle = index === 3 ? "#f4c430" : "#f3f6f4";
        ctx.font = '900 50px "Barlow Condensed", "Arial Narrow", sans-serif';
        ctx.fillText(String(value), x + 22, 568);
      });

      card(64, 624, 952, 226, "#102218");
      ctx.fillStyle = "#f4c430";
      ctx.font = '900 20px Manrope, Arial, sans-serif';
      ctx.fillText("PRINCIPAIS CONQUISTAS", 88, 664);
      const posterHonours = shareTitleHighlights.slice(0, 4);
      if (posterHonours.length) {
        posterHonours.forEach((entry, index) => {
          const col = index % 2;
          const row = Math.floor(index / 2);
          const x = 88 + col * 452;
          const y = 714 + row * 66;
          ctx.fillStyle = "#f4c430";
          ctx.font = '900 34px "Barlow Condensed", "Arial Narrow", sans-serif';
          ctx.fillText(`${entry.count}×`, x, y);
          ctx.fillStyle = "#f3f6f4";
          ctx.font = '800 20px Manrope, Arial, sans-serif';
          ctx.fillText(entry.label, x + 58, y - 2);
        });
      } else {
        ctx.fillStyle = "#91a79c";
        ctx.font = '700 24px Manrope, Arial, sans-serif';
        ctx.fillText("Uma história construída além das taças.", 88, 732);
      }

      card(64, 874, 952, 174, "#151f18");
      ctx.fillStyle = "#cdb9ff";
      ctx.font = '900 19px Manrope, Arial, sans-serif';
      ctx.fillText("PRÊMIOS INDIVIDUAIS", 88, 916);
      const awards = [
        ["BOLAS DE OURO", ballonDor],
        ["WORLD XI", worldXi],
        ["TOTAL", totalIndividualAwards],
      ] as const;
      awards.forEach(([label, value], index) => {
        const x = 88 + index * 300;
        ctx.fillStyle = value > 0 ? "#f3f6f4" : "#617269";
        ctx.font = '900 44px "Barlow Condensed", "Arial Narrow", sans-serif';
        ctx.fillText(String(value), x, 982);
        ctx.fillStyle = "#91a79c";
        ctx.font = '800 15px Manrope, Arial, sans-serif';
        ctx.fillText(label, x + 50, 979);
      });

      ctx.fillStyle = "#91a79c";
      ctx.font = '800 17px Manrope, Arial, sans-serif';
      ctx.fillText("CAMINHO", 64, 1096);
      ctx.fillStyle = "#f3f6f4";
      const pathSize = fitText(clubLine || currentClub.shortName, 952, 30, 19, 800);
      ctx.font = `800 ${pathSize}px "Barlow Condensed", "Arial Narrow", sans-serif`;
      ctx.fillText(clubLine || currentClub.shortName, 64, 1140);

      ctx.fillStyle = "#f4c430";
      ctx.font = '900 48px "Barlow Condensed", "Arial Narrow", sans-serif';
      ctx.fillText(legacyStanding.label.toLocaleUpperCase("pt-BR"), 64, 1222);
      ctx.fillStyle = "#91a79c";
      ctx.font = '800 19px Manrope, Arial, sans-serif';
      ctx.fillText(`${displayGame.legacyPoints} pontos de legado · ${displayGame.unlockedAchievements.length}/${ACHIEVEMENTS.length} conquistas`, 64, 1260);
      ctx.textAlign = "right";
      ctx.fillText("futbobo.top", 1016, 1300);

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
  const shellClass = `app-shell app-shell-${shellPhase}${shellPhase === "welcome" ? " app-shell-welcome" : ""}`;

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
      <main className="botao-lobby botao-career-lobby screen-enter">
        <span className="botao-lobby-kicker">
          {currentBotaoMatch.source === "national" ? "SELEÇÃO EM CAMPO" : "PARTIDA DECISIVA"}
        </span>
        <h1>{currentBotaoMatch.stageName}</h1>
        <p className="botao-lobby-lead">
          {currentBotaoMatch.competitionName} · Agora a taça depende da mesa.
        </p>
        <div className="botao-card botao-final-versus">
          <div className="botao-team">
            <TeamCrest team={currentBotaoSetup.userTeam} size={58} />
            <strong>{currentBotaoSetup.userTeam.shortName}</strong>
          </div>
          <div className="botao-versus-mark"><small>DECISÃO</small><b>×</b></div>
          <div className="botao-team botao-team-cpu">
            <strong>{currentBotaoSetup.cpuTeam.shortName}</strong>
            <TeamCrest team={currentBotaoSetup.cpuTeam} size={58} />
          </div>
        </div>
        <div className="botao-card botao-career-player">
          <span>{currentBotaoSetup.entry ? "VOCÊ COMEÇA NO BANCO" : "SEU BOTÃO"}</span>
          <strong>#{game.number} · {positionByKey(game.position).name} · {game.overall} OVR</strong>
          {currentBotaoSetup.entry && (
            <div className="botao-reserve-entry">
              <b>ENTRA AOS 45&apos;</b>
              <p>
                Seu OVR ainda está abaixo do nível de titularidade desta seleção. Você assume o botão
                na metade final da partida{currentBotaoSetup.entry.score.user + currentBotaoSetup.entry.score.cpu > 0
                  ? ` com o placar em ${currentBotaoSetup.entry.score.user} × ${currentBotaoSetup.entry.score.cpu}.`
                  : " com o jogo ainda empatado."}
              </p>
            </div>
          )}
        </div>
        <div className="botao-actions">
          <button type="button" className="botao-primary" onClick={startCurrentBotaoMatch}>
            Jogar no futebol de botão
          </button>
          <button type="button" className="botao-ghost" onClick={simulateCurrentBotaoMatch} disabled={botaoSimulating}>
            {botaoSimulating ? "Simulando…" : "Simular esta partida"}
          </button>
        </div>
      </main>
    );
  }

  if (game.phase === "botao-result" && game.lastBotaoResult) {
    const { match, result } = game.lastBotaoResult;
    const setup = setupForPendingBotaoMatch(game, match);
    return (
      <main className="botao-lobby botao-career-result screen-enter">
        <p className="botao-lobby-lead">
          {match.competitionName} · {match.stageName}
          {result.walkover ? " · W.O. por abandono" : result.simulated ? " · simulada" : ""}
        </p>
        <div className={`botao-headline ${result.champion ? "botao-headline-win" : "botao-headline-loss"}`}>
          {result.walkover ? "DERROTA POR W.O." : result.champion ? (match.stageName === "Final" ? "CAMPEÃO" : "CLASSIFICADO") : match.stageName === "Final" ? "VICE" : "ELIMINADO"}
        </div>
        {result.walkover && (
          <div className="botao-card botao-walkover-notice">
            <span>W.O. REGISTRADO</span>
            <strong>A partida foi abandonada</strong>
            <p>Atualizar ou fechar a página depois de entrar em campo confirma derrota administrativa por 3 × 0.</p>
          </div>
        )}
        <div className="botao-card">
          <div className="botao-scoreboard">
            <div className="botao-team"><TeamCrest team={setup.userTeam} /><strong>{setup.userTeam.shortName}</strong></div>
            <div className="botao-score"><b>{result.goalsFor}</b><span>×</span><b>{result.goalsAgainst}</b></div>
            <div className="botao-team botao-team-cpu"><strong>{setup.cpuTeam.shortName}</strong><TeamCrest team={setup.cpuTeam} /></div>
          </div>
          <div className="botao-formation-row">
            {result.decision === "penalties" && <span className="botao-chip">Pênaltis {result.penaltyFor} × {result.penaltyAgainst}</span>}
            <span className="botao-chip botao-chip-you">Você: {result.playerGoals}G · {result.playerAssists}A</span>
            {result.manOfTheMatch && <span className="botao-chip botao-chip-stat">Melhor em campo</span>}
          </div>
        </div>
        <div className="botao-card">
          <span className="botao-card-title">Gols da partida</span>
          {result.timeline.some(isMatchGoal) ? (
            <div className="botao-result-lines">
              {result.timeline.map((entry, timelineIndex) => ({ entry, timelineIndex })).filter(({ entry }) => isMatchGoal(entry)).map(({ entry, timelineIndex }) => {
                const replayIndex = result.replays?.findIndex((replay) => replay.timelineIndex === timelineIndex) ?? -1;
                return (
                  <div key={`${entry.clock}-${timelineIndex}`} className={`botao-result-line ${entry.byUser ? "botao-result-line-you" : ""} ${entry.beforePlayerEntry ? "botao-result-line-before-entry" : ""}`}>
                    <span className="botao-result-goal-copy"><b>{entry.text}</b><span>{entry.side === "user" ? setup.userTeam.abbr : setup.cpuTeam.abbr} · {formatGoalMinute(entry, setup.rules)}{entry.beforePlayerEntry ? " · antes da sua entrada" : ""}</span></span>
                    {replayIndex >= 0 && <button type="button" onClick={() => setActiveGoalReplay(activeGoalReplay === replayIndex ? null : replayIndex)}>{activeGoalReplay === replayIndex ? "Fechar replay" : "Ver replay"}</button>}
                  </div>
                );
              })}
            </div>
          ) : <p className="botao-result-empty">{result.walkover ? "Partida encerrada por abandono. Placar administrativo de 3 × 0." : "Nenhum gol antes da disputa por pênaltis."}</p>}
          {activeGoalReplay !== null && result.replays?.[activeGoalReplay] && (
            <GoalReplay
              replay={result.replays[activeGoalReplay]}
              setup={setup}
              label={result.timeline[result.replays[activeGoalReplay].timelineIndex]?.text ?? "Gol da partida"}
            />
          )}
        </div>
        <div className="botao-actions">
          <button type="button" className="botao-primary" onClick={continueAfterBotaoResult}>
            {game.pendingPressConference
              ? "Ir para a coletiva de imprensa"
              : game.pendingBotaoMatches.length
                ? "Próxima decisão"
                : "Ver resumo da temporada"}
          </button>
        </div>
        {pressConferenceOpen && game.pendingPressConference && <PressConferenceDialog conference={game.pendingPressConference} onAnswer={answerPressConference} />}
      </main>
    );
  }

  return (
    <main className={shellClass}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      {toast && <div className="toast" role="status">{toast}</div>}
      {(pressConferenceOpen || presentationOpen) && game.pendingPressConference && <PressConferenceDialog conference={game.pendingPressConference} onAnswer={answerPressConference} />}
      {cycleShopOpen && <CycleShopDialog game={game} feedback={cycleShopFeedback} onBuy={buyCycleShopItem} onClose={closeCycleShop} />}
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
        <div className="modal-backdrop story-decision-backdrop" role="presentation">
          <section className={`story-decision-modal story-${playerStoryById(game.playerStoryId).tone}`} role="dialog" aria-modal="true" aria-labelledby="story-decision-title">
            <div className="story-decision-chapter-track" aria-hidden="true">
              {Array.from({ length: 8 }, (_, index) => <i key={index} className={index < game.storyLog.length + 1 ? "active" : ""} />)}
            </div>
            <header>
              <span className="story-decision-icon">{game.pendingStoryDecision.icon}</span>
              <div>
                <small>{game.pendingStoryDecision.kicker}</small>
                <h2 id="story-decision-title">{game.pendingStoryDecision.title}</h2>
              </div>
            </header>
            <p>{game.pendingStoryDecision.description}</p>
            <div className="story-decision-choices">
              {game.pendingStoryDecision.choices.map((choice, index) => (
                <button type="button" key={choice.label} onClick={() => resolveStoryDecision(index)}>
                  <em>{String(index + 1).padStart(2, "0")}</em>
                  <span><strong>{choice.label}</strong><small>{choice.hint}</small></span><b>→</b>
                </button>
              ))}
            </div>
            <footer><b>◆</b><span>Esta decisão vira parte permanente da história de {game.name}.</span></footer>
          </section>
        </div>
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
        <div className="modal-backdrop appearance-editor-backdrop" role="presentation" onMouseDown={() => setAppearanceEditorOpen(false)}>
          <section className="appearance-editor-sheet" role="dialog" aria-modal="true" aria-labelledby="appearance-editor-title" onMouseDown={(event) => event.stopPropagation()}>
            <header><div><span>VESTIÁRIO</span><h2 id="appearance-editor-title">Personalizar jogador</h2></div><button type="button" className="icon-button" aria-label="Fechar editor" onClick={() => setAppearanceEditorOpen(false)}>×</button></header>
            <p>Altere quando quiser. A nova aparência entra em campo já na próxima partida.</p>
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
            <button type="button" className="primary-button" onClick={() => setAppearanceEditorOpen(false)}>Salvar visual <span>✓</span></button>
          </section>
        </div>
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
            <div className="welcome-version"><span>FUTBOBO</span><b>v92 · DONO DA ÁREA</b></div>
          </footer>
        </section>
      )}

      {(["identity", "appearance", "nationality", "academy", "formation", "story"] as Phase[]).includes(game.phase) && (
        <PlayerCreationV2
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

      {game.phase === "youth" && (
        <section className="youth-screen screen-enter">
          <div className="brand-mini"><BrandMark size="sm" /> FUTBOBO</div>
          <div className="youth-club"><ClubBadge club={clubById(game.academyClubId)} size="lg" /><span>Formando em</span><strong>{clubById(game.academyClubId).shortName}</strong></div>
          <div className="age-counter"><small>SUA IDADE</small><strong>{game.youthYears[Math.max(0, youthStep - 1)]?.age ?? 12}</strong><span>ANOS</span></div>
          <div className="youth-progress"><span style={{ width: `${(youthStep / Math.max(1, game.youthYears.length)) * 100}%` }} /></div>
          <div className="youth-feed">
            {game.youthYears.slice(0, youthStep).map((year, index) => (
              <article className="youth-feed-item" key={`${year.age}-${year.title}`} style={{ animationDelay: `${index * 20}ms` }}>
                <span>{year.age}</span><div><strong>{year.title}</strong><p>{year.text}</p></div><em>{year.overall ? `OVR ${year.overall}` : `+${year.delta}`}</em>
              </article>
            ))}
          </div>
          {!youthFinished ? (
            <p className="simulating-label"><span /> Simulando sua formação...</p>
          ) : (
            <div className="youth-continue">
              <button className="primary-button" onClick={() => setGame((current) => ({ ...current, phase: "revelation" }))}>Continuar <b>→</b></button>
            </div>
          )}
        </section>
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

      {game.phase === "revelation" && <FirstContractV2 game={game} onBack={() => setGame((current) => ({ ...current, phase: "youth" }))} onSign={signProfessional} />}

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
        <section className={`career-shell career-phase-${game.phase} career-tab-${activeTab} screen-enter`}>
          <header className="career-header">
            <div className="club-identity"><ClubBadge club={currentClub} size="sm" /><span><small>{headerSeason}</small><strong>{currentClub.shortName}</strong></span></div>
            <div className="career-age"><strong>{headerAge}</strong><span>ANOS</span></div>
            <div className="player-identity"><span><small>OVR</small><strong>{game.overall}</strong></span><div className="mini-avatar">{game.position}</div></div>
          </header>
          <div className="career-bars career-bars-four">
            <Progress label="Moral" value={game.morale} color="#2ca8ff" />
            <Progress label="Físico" value={game.fitness} color={game.fitness < 55 ? "#ff5a4e" : "#63e36b"} />
            <Progress label="Prestígio" value={game.reputation} color="#ffc72c" />
            <Progress label={supporterMood.label} value={game.fanSupport} color={supporterMood.color} />
          </div>
          <div className={`career-status-strip ${game.phase === "retirement-confirm" ? "retirement-open" : ""}`}>
            <span><small>STATUS</small><strong>{ROLE_LABELS[game.squadRole]}</strong></span>
            <span><small>TREINADOR</small><strong>{Math.round(game.managerTrust)}%</strong></span>
            <span><small>CONTRATO</small><strong>{game.contractYears ? `${game.contractYears} ano${game.contractYears > 1 ? "s" : ""}` : "Expirado"}</strong></span>
            {game.phase !== "retirement-confirm" && <button className="retirement-trigger" onClick={requestRetirement}><small>CARREIRA</small><strong><FutboboIcon name="hourglass" /> Aposentar</strong></button>}
          </div>

          {luckSpin && (
            <div className="luck-roulette-overlay" role="status" aria-live="assertive">
              <div className="luck-roulette-card">
                <span className="result-kicker">ESCOLHA DE SORTE</span>
                <div className="roulette-wheel"><i /><b>◆</b></div>
                <h2>A sorte está girando...</h2>
                <p>O resultado da sua aposta será revelado em instantes.</p>
              </div>
            </div>
          )}

          {game.phase === "career" && activeTab === "event" && (
            <div className="event-stage">
              <div className="market-strip"><span><small>MERCADO</small><strong>{game.transferCooldownSeason >= game.season ? "Pedido já feito nesta temporada" : "Quer mudar de camisa?"}</strong></span><button onClick={requestTransfer} disabled={game.transferCooldownSeason >= game.season}>⇄ Pedir transferência</button></div>
              {game.currentObjective && <div className="objective-card">
                <span>META DO TREINADOR</span>
                <strong>{game.currentObjective.label}</strong>
                <p>{game.currentObjective.description}</p>
                <small>Recompensa: +{game.currentObjective.reward} confiança · Falha: −{game.currentObjective.penalty}</small>
                <WorldPulseButton state={game} onOpen={() => changeTab("world")} />
              </div>}
              <div className="event-art" data-icon={currentEvent.icon}><span className="event-tag">{currentEvent.tag}</span><div className="event-watermark">{currentEvent.icon}</div></div>
              <article className="event-card">
                <div className="event-heading"><span>{game.currentEventId === "debut" ? "PRIMEIRO CAPÍTULO" : `TEMPORADA ${game.season}`}</span><h1>{currentEvent.title}</h1><p>{currentEvent.description}</p></div>
                <div className="choice-list" data-choice-count={currentEvent.choices.length}>
                  {currentEvent.choices.map((choice, index) => <button key={choice.label} className="decision-button" onClick={() => chooseEvent(index)}><span><strong>{choice.label}</strong><small>{choice.hint}</small></span><b>→</b></button>)}
                </div>
              </article>
            </div>
          )}

          {game.phase === "consequence" && game.lastConsequence && (
            <div className={`consequence-stage screen-enter ${game.lastConsequence.luckOutcome ? `luck-${game.lastConsequence.luckOutcome}` : ""}`}>
              <span className="result-kicker">CONSEQUÊNCIAS DA ESCOLHA</span>
              <div className="consequence-symbol">↯</div>
              <small>VOCÊ ESCOLHEU</small>
              <h1>{game.lastConsequence.choice}</h1>
              <p>{game.lastConsequence.resultText}</p>
              <div className="consequence-list">
                {game.lastConsequence.changes.map((change) => <span key={change} className={isNegativeConsequence(change) ? "negative" : "positive"}>{change}</span>)}
              </div>
              <div className="consequence-note"><strong>{game.lastConsequence.headline}</strong><span>Agora veja como essa decisão atravessou a temporada.</span></div>
              <div className="mobile-action-dock consequence-action-dock">
                <button className="primary-button" onClick={continueAfterConsequence}>{game.retireAfterSeason ? "Ver resultado da última temporada" : "Ver resultado da temporada"} <span>→</span></button>
                <div className="consequence-autoplay" aria-live="polite">
                  <span>Avançando automaticamente em 5 segundos</span>
                  <div><i /></div>
                </div>
              </div>
            </div>
          )}

          {game.phase === "season-result" && game.lastResult && (
            <div className="result-stage screen-enter">
              <span className="result-kicker">TEMPORADA {game.lastResult.season}</span>
              <div className={`result-symbol ${game.lastResult.title ? "winner" : game.lastResult.breakoutBonus > 0 ? "breakout" : ""}`}><FutboboIcon name={game.lastResult.title ? "trophy" : game.lastResult.development < 0 ? "trend-down" : "trend-up"} /></div>
              <h1>{game.lastResult.title ? "Temporada de campeão!" : game.lastResult.breakoutBonus > 0 ? "Você explodiu de vez!" : game.lastResult.development > 0 ? "Você subiu de nível" : game.lastResult.development < 0 ? "Uma temporada dura" : "Mais um ano de estrada"}</h1>
              <p>{game.lastResult.title ? "Seu nome agora está gravado em uma taça." : game.lastResult.breakoutBonus > 0 ? "Uma temporada absurda acelerou sua carreira como poucas vezes acontece." : "A temporada terminou e a carreira ganhou mais um capítulo."}</p>
              <div className="season-stat-grid">
                <Metric label="Jogos" value={game.lastResult.appearances} />
                <Metric label={game.position === "GOL" ? "Sem sofrer" : "Gols"} value={game.position === "GOL" ? game.lastResult.cleanSheets : game.lastResult.goals} tone="green" />
                <Metric label={game.position === "GOL" ? "Sofridos" : "Assistências"} value={game.position === "GOL" ? game.lastResult.goalsConceded : game.lastResult.assists} />
                <Metric label="Novo OVR" value={game.overall} tone={game.lastResult.development > 0 ? "gold" : game.lastResult.development < 0 ? "danger" : "default"} />
              </div>
              <div className={`season-rating-card rating-${(game.lastResult.averageRating ?? 6) >= 8 ? "elite" : (game.lastResult.averageRating ?? 6) >= 7 ? "good" : "regular"}`}>
                <div><span>AVALIAÇÃO MÉDIA</span><strong>{(game.lastResult.averageRating ?? seasonAverageRating(game.lastResult.performanceScore, game.seed, game.lastResult.season)).toFixed(1)}</strong></div>
                <p>{(game.lastResult.averageRating ?? 6) >= 8.5 ? "Uma temporada de nível mundial." : (game.lastResult.averageRating ?? 6) >= 7.5 ? "Você foi decisivo e constante." : (game.lastResult.averageRating ?? 6) >= 6.7 ? "Um ano sólido, com espaço para crescer." : "O rendimento ficou abaixo da cobrança."}</p>
                <b>{game.lastResult.manOfTheMatchAwards ?? 0}<small>MELHOR EM CAMPO</small></b>
              </div>
              <section className="season-result-section">
                <header className="season-result-section-heading"><span>DESEMPENHO</span><small>Como seu ano mudou o jogador</small></header>
                <div className={`season-development ${game.lastResult.development > 0 ? "up" : game.lastResult.development < 0 ? "down" : ""}`}>
                  <span>EVOLUÇÃO NA TEMPORADA</span>
                  <strong>{game.lastResult.development > 0 ? "+" : ""}{game.lastResult.development} OVR</strong>
                  <small>{game.lastResult.development > 2 ? "Você está alcançando o nível profissional rapidamente." : game.lastResult.development > 0 ? "Mais um passo na direção da elite." : game.lastResult.development === 0 ? "Seu nível se manteve." : "A carreira também cobra seus anos difíceis."}</small>
                </div>
                {game.lastResult.breakoutBonus > 0 && (
                  <div className="breakout-result">
                    <div><span>⚡ EXPLOSÃO DE TALENTO</span><strong>Temporada fora da curva</strong><p>Você jogou tão bem que rompeu a evolução normal da carreira.</p></div>
                    <b>+{game.lastResult.breakoutBonus}<small>OVR EXTRA</small></b>
                  </div>
                )}
                {game.lastResult.europeanSpotlight > 0 && (
                  <div className="european-spotlight">
                    <span>VITRINE EUROPEIA</span>
                    <strong>+{game.lastResult.europeanSpotlight} prestígio</strong>
                    <p>Seu desempenho ganhou alcance internacional{game.lastResult.europeanDevelopmentBonus > 0 ? ` e acelerou sua evolução em +${game.lastResult.europeanDevelopmentBonus} OVR` : ""}.</p>
                  </div>
                )}
                <div className="season-compact-grid">
                  <div className="discipline-result"><span>DISCIPLINA</span><strong>{game.lastResult.yellowCards} amarelos · {game.lastResult.redCards} vermelhos</strong></div>
                  {positionByKey(game.position).zone !== "gol" && (
                    <div className="defensive-season-result">
                      <span>TRABALHO SEM A BOLA</span>
                      <strong>{game.lastResult.tackles} desarmes</strong>
                    </div>
                  )}
                </div>
              </section>
              <section className="season-result-section">
                <header className="season-result-section-heading"><span>BASTIDORES</span><small>Dinheiro, meta e contrato</small></header>
                <section className="season-finance-card legacy-ui-hidden">
                  <header><span>PATRIMÔNIO ATUAL</span><strong>{formatMoney(game.lastResult.balanceAfter ?? game.money)}</strong></header>
                  <div>
                    <span><small>Salário</small><b>+{formatMoney(game.lastResult.salaryIncome ?? 0)}</b></span>
                    <span><small>Patrocínios</small><b>+{formatMoney(game.lastResult.sponsorIncome ?? 0)}</b></span>
                    <span className="expense"><small>Custos</small><b>−{formatMoney(game.lastResult.livingCost ?? 0)}</b></span>
                  </div>
                  <p>Saldo anterior: {formatMoney(game.lastResult.balanceBefore ?? 0)} · +{formatMoney(game.lastResult.spendableIncome ?? 0)} liberados para compras · caixa livre atual: {formatMoney(game.lastResult.spendableAfter ?? game.spendableMoney)}.</p>
                </section>
                {game.lastResult.objectiveResult && <div className={`objective-result ${game.lastResult.objectiveResult.completed ? "completed" : "failed"}`}><span>{game.lastResult.objectiveResult.completed ? "META CUMPRIDA" : "META PERDIDA"}</span><strong>{game.lastResult.objectiveResult.label}</strong><p>{game.lastResult.objectiveResult.text}</p></div>}
                {game.lastResult.promotion && <div className="objective-result completed"><span>ACESSO CONQUISTADO</span><strong>O clube subiu de divisão</strong><p>{game.lastResult.promotion}</p></div>}
                {game.youthLoanDecision && <div className="contract-expired"><span>PLANO DE DESENVOLVIMENTO</span><strong>O clube recomenda um empréstimo</strong><p>Você poderá buscar mais minutos em outro projeto ou continuar disputando espaço no elenco atual.</p></div>}
                {game.forcedClubExit && <div className="contract-expired"><span>VENDA OBRIGATÓRIA</span><strong>O clube colocou você no mercado</strong><p>Seu overall e seu rendimento ficaram muito abaixo da exigência do elenco. Sem status de ídolo, você terá de escolher outro destino.</p></div>}
                {game.contractYears === 0 && (
                  <div className="contract-expired">
                    <span>CONTRATO ENCERRADO</span>
                    <strong>{game.renewalDenied ? "O clube optou por não renovar" : "Seu futuro está aberto"}</strong>
                    <p>{game.renewalDenied ? "Depois de uma temporada difícil, a diretoria decidiu não seguir com você. Na próxima tela você precisa escolher um novo clube." : "Na próxima tela você poderá renovar ou escolher um novo clube."}</p>
                  </div>
                )}
              </section>
              {(seasonTitleCount > 0 || seasonBotaoResults.length > 0) && (
                <section className="season-title-parade">
                  <header>
                    <span>TAÇAS DA TEMPORADA</span>
                    <strong>{seasonTitleCount > 0 ? `${seasonTitleCount} volta${seasonTitleCount > 1 ? "s" : ""} olímpica${seasonTitleCount > 1 ? "s" : ""}` : "Nenhuma taça levantada"}</strong>
                  </header>
                  {seasonTitleCount > 0 && (
                    <div className="season-title-list">
                      {seasonClubTitles.map((competition) => (
                        <article key={`title-${competition.id}`}>
                          <CompetitionBadge competition={competition} leagueId={game.lastResult?.leagueId || game.currentLeagueId || currentClub.leagueId} />
                          <div><small>CAMPEÃO</small><strong>{competition.name}</strong></div>
                          <b><FutboboIcon name="trophy" /></b>
                        </article>
                      ))}
                      {seasonNationalTitles.map((record) => (
                        <article key={`national-title-${record.season}-${record.name}`} className="national-season-title">
                          <NationBadge country={nationCountry} size="sm" />
                          <div><small>CAMPEÃO PELA SELEÇÃO</small><strong>{record.name}</strong></div>
                          <b><FutboboIcon name="trophy" /></b>
                        </article>
                      ))}
                    </div>
                  )}
                  {seasonBotaoResults.length > 0 && (
                    <div className="played-finals-summary">
                      <header>
                        <span>DECIDIDO NO FUTEBOL DE BOTÃO</span>
                        <small>Finais e mata-matas da temporada</small>
                      </header>
                      <div>
                        <b><strong>{seasonBotaoResults.length}</strong><small>DISPUTADAS</small></b>
                        <b className="won"><strong>{seasonBotaoWins}</strong><small>GANHAS</small></b>
                        <b className="lost"><strong>{seasonBotaoLosses}</strong><small>PERDIDAS</small></b>
                      </div>
                    </div>
                  )}
                </section>
              )}
              {game.lastResult.competitions.some((competition) => !competition.champion) && (
                <section className="season-result-section season-campaigns">
                  <header className="season-result-section-heading"><span>OUTRAS CAMPANHAS</span><small>Onde a caminhada terminou</small></header>
                  <div className="competition-grid">
                    {game.lastResult.competitions.filter((competition) => !competition.champion).map((competition) => <article key={competition.id} className="competition-card"><CompetitionBadge competition={competition} leagueId={game.lastResult?.leagueId || game.currentLeagueId || currentClub.leagueId} /><div><strong>{competition.name}</strong><small>{competition.stage}</small></div></article>)}
                  </div>
                </section>
              )}
              {game.lastResult.medicalRecord && (
                <section className={`season-medical-card severity-${game.lastResult.medicalRecord.severity}`}>
                  <header><span>DEPARTAMENTO MÉDICO</span><b>{game.lastResult.medicalRecord.severity.toLocaleUpperCase("pt-BR")}</b></header>
                  <strong>{game.lastResult.medicalRecord.name}</strong>
                  <div><span><b>{game.lastResult.medicalRecord.recoveryMonths}</b><small>MESES</small></span><span><b>{game.lastResult.medicalRecord.matchesMissed}</b><small>JOGOS FORA</small></span><span><b>{game.lastResult.medicalRecord.recurring ? "SIM" : "NÃO"}</b><small>RECORRENTE</small></span></div>
                </section>
              )}
              {game.lastResult.twist && <div className={`season-twist ${game.lastResult.twist.includes("improvável") ? "positive" : "negative"}`}><span>O IMPREVISTO DA TEMPORADA</span><p>{game.lastResult.twist}</p></div>}
              {game.lastResult.nationalNote && <div className="season-national-note"><NationBadge country={nationCountry} size="sm" /><p>{game.lastResult.nationalNote}</p></div>}
              {seasonWorldCupRecord?.tournamentStats && (
                <section className={`world-cup-stat-report ${seasonWorldCupRecord.champion ? "champion" : ""}`}>
                  <header>
                    <div><span>RELATÓRIO DA COPA DO MUNDO</span><strong>{seasonWorldCupRecord.stage}</strong></div>
                    <NationBadge country={nationCountry} size="sm" />
                  </header>
                  <div className="world-cup-stat-totals">
                    <Metric label="Jogos" value={seasonWorldCupRecord.tournamentStats.appearances} />
                    <Metric label="Gols" value={seasonWorldCupRecord.tournamentStats.goals} tone="gold" />
                    <Metric label="Assistências" value={seasonWorldCupRecord.tournamentStats.assists} tone="green" />
                    <Metric label="G+A" value={seasonWorldCupRecord.tournamentStats.goals + seasonWorldCupRecord.tournamentStats.assists} />
                  </div>
                  <div className="world-cup-stat-split">
                    <span><small>FASE DE GRUPOS · SIMULADA</small><strong>{seasonWorldCupRecord.tournamentStats.groupAppearances}J · {seasonWorldCupRecord.tournamentStats.groupGoals}G · {seasonWorldCupRecord.tournamentStats.groupAssists}A</strong></span>
                    <span><small>MATA-MATA</small><strong>{seasonWorldCupRecord.tournamentStats.knockoutAppearances}J · {seasonWorldCupRecord.tournamentStats.knockoutGoals}G · {seasonWorldCupRecord.tournamentStats.knockoutAssists}A</strong></span>
                  </div>
                  {isEuropeanClub(currentClub) && seasonWorldCupRecord.tournamentStats.goals >= 8 && (
                    <div className="world-cup-ballon-surge"><b>◉</b><span><strong>A eleição mudou de figura</strong><small>Oito ou mais gols na Copa, jogando na Europa, colocaram seu nome no centro da disputa pela Bola de Ouro.</small></span></div>
                  )}
                </section>
              )}
              {(game.lastResult.awards.length > 0 || game.lastResult.awardNominations.length > 0) && (
                <section className={`season-awards-showcase ${game.lastResult.awardNominations.some((nomination) => nomination.award === "Bola de Ouro") ? "has-ballon-dor" : ""}`}>
                  <div className="season-awards-heading">
                    <span>NOITE DE PREMIAÇÃO</span>
                    <strong>{game.lastResult.awards.length > 1 ? `${game.lastResult.awards.length} prêmios na mesma temporada` : seasonCeremonyNomination?.won ? "Seu nome foi chamado" : "Você está entre os finalistas"}</strong>
                    <p>O resultado só aparece quando o envelope for aberto.</p>
                  </div>
                  <div className="season-awards-list">
                    {seasonCeremonyNomination && (
                      <AwardCeremony
                        key={`${seasonCeremonyNomination.award}-${game.lastResult.season}`}
                        award={seasonCeremonyNomination.award}
                        playerName={game.name}
                        seed={game.seed}
                        season={game.lastResult.season}
                        won={seasonCeremonyNomination.won}
                        winner={seasonCeremonyNomination.winner}
                        finalists={seasonCeremonyNomination.finalists}
                      />
                    )}
                    {[...game.lastResult.awards]
                      .sort((a, b) => awardTierWeight(b) - awardTierWeight(a))
                      .filter((award) => award !== seasonCeremonyNomination?.award)
                      .map((award) => <AwardReveal key={award} award={award} />)}
                  </div>
                </section>
              )}
              <div className="result-details"><span>Valor de mercado <strong>{formatMoney(game.lastResult.marketValue)}</strong></span>{game.lastResult.calledUp && <span className="callup-badge"><FutboboIcon name="globe" /> Convocado pela Seleção</span>}</div>
              <div className="mobile-action-dock">
                <button className="primary-button" onClick={continueAfterResult}>{game.retireAfterSeason ? "Concluir carreira" : game.transferOffers.length ? "Abrir janela de transferências" : "Próxima temporada"} <span>→</span></button>
              </div>
            </div>
          )}

          {game.phase === "transfer" && (
            <TransferMarketScreen
              state={game}
              currentClub={currentClub}
              offers={marketOffers}
              renewalOffer={renewalOffer}
              onChoose={chooseTransfer}
              onStay={() => chooseTransfer(null)}
              onBecomeFreeAgent={becomeFreeAgent}
              onWait={waitAsFreeAgent}
            />
          )}

          {game.phase === "transfer-denied" && game.transferStatus && (
            <div className="transfer-denied-stage screen-enter">
              <span className="result-kicker">PEDIDO DE TRANSFERÊNCIA</span>
              <div className="denied-symbol">×</div>
              <h1>{game.transferStatus.headline}</h1>
              <p>{game.transferStatus.text}</p>
              <div className="fan-backlash"><span>REAÇÃO DA TORCIDA</span><strong>{supporterMood.label}</strong><div><i style={{ width: `${game.fanSupport}%` }} /></div><small>Torcida e comissão perderam confiança</small></div>
              <div className="mobile-action-dock">
                <button className="primary-button" onClick={continueAfterDeniedTransfer}>Encarar a temporada <span>→</span></button>
              </div>
            </div>
          )}

          {game.phase === "retirement-confirm" && (
            <div className="retirement-stage screen-enter">
              <span className="result-kicker">DECISÃO DE CARREIRA</span>
              <div className="retirement-symbol"><FutboboIcon name="hourglass" /></div>
              <h1>Pendurar as chuteiras agora?</h1>
              <p>Você pode encerrar a carreira em qualquer idade. O legado será fechado exatamente como está — esta decisão é definitiva.</p>
              <div className="retirement-recap">
                <Metric label="Idade" value={`${game.age} anos`} />
                <Metric label="Temporadas" value={game.history.length} />
                <Metric label="OVR atual" value={game.overall} tone="gold" />
                <Metric label="Legado" value={game.legacyPoints} tone="green" />
              </div>
              <div className="retirement-actions mobile-action-dock">
                <button className="danger-button" onClick={confirmRetirement}>Confirmar aposentadoria <span>→</span></button>
                <button className="secondary-button" onClick={cancelRetirement}>Ainda não</button>
              </div>
            </div>
          )}

          {activeTab === "history" && game.phase === "career" && (
            <CareerTimeline state={game} />
          )}
          {activeTab === "profile" && game.phase === "career" && (
            <div className="panel-screen screen-enter">
              <div className="profile-hero"><div className="academy-avatar"><span>{game.number}</span><small>{game.position}</small></div><div><span>{game.archetype}</span><h2>{game.name}</h2><p>{position.style} · {game.foot}</p></div></div>
              {appSettings.characterButtonsEnabled !== false && (
                <section className="player-appearance-profile">
                  <PlayerAppearancePortrait appearance={{ ...game.playerAppearance, kitPattern: teamKitPattern(game.seed, currentClub.id) }} primary={currentClub.primary} secondary={currentClub.secondary} size={112} label={`Visual de ${game.name}`} />
                  <div><span>IDENTIDADE VISUAL</span><strong>Seu rosto dentro da mesa</strong><p>O personagem permanece; o uniforme muda com cada transferência.</p></div>
                  <button type="button" className="secondary-button" onClick={() => setAppearanceEditorOpen(true)}>Personalizar</button>
                </section>
              )}
              <PlayerReworkPanels state={game} />
              <section className={`player-story-profile legacy-ui-hidden story-${playerStoryById(game.playerStoryId).tone}`}>
                <header><b>{playerStoryById(game.playerStoryId).icon}</b><div><span>HISTÓRIA DO JOGADOR</span><strong>{playerStoryById(game.playerStoryId).title}</strong></div><em>{game.storyLog.length} capítulo{game.storyLog.length === 1 ? "" : "s"}</em></header>
                <p>{playerStoryById(game.playerStoryId).description}</p>
                {game.storyLog.length > 0 && (
                  <div className="player-story-log">
                    {[...game.storyLog].reverse().slice(0, 4).map((entry) => (
                      <article key={`${entry.season}-${entry.chapter}`}>
                        <span>{entry.season}</span><div><strong>{entry.title}</strong><small>{entry.choice}</small><p>{entry.result}</p></div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
              <div className="position-change-card">
                <div><span>FUNÇÃO EM CAMPO</span><strong>{position.name}</strong><p>Você pode pedir ao treinador uma mudança. Quanto mais velho e mais distante da sua função atual, maior o risco de recusa.</p></div>
                <button
                  className="secondary-button"
                  disabled={game.positionChangeCooldownSeason >= game.season}
                  onClick={() => {
                    setPositionChangeOpen((open) => !open);
                    setPositionChangeFeedback(null);
                  }}
                >
                  {game.positionChangeCooldownSeason >= game.season ? "Tentativa usada nesta temporada" : "Tentar mudar de posição"}
                </button>
                {positionChangeOpen && (
                  <div className="position-change-picker">
                    {POSITIONS.filter((item) => item.key !== game.position).map((item) => (
                      <button
                        key={item.key}
                        className={positionChangeTarget === item.key ? "selected" : ""}
                        onClick={() => setPositionChangeTarget(item.key)}
                      >
                        <span style={{ color: item.color }}>{item.icon}</span><strong>{item.key}</strong><small>{item.name}</small>
                      </button>
                    ))}
                    <button className="primary-button position-change-confirm" disabled={!positionChangeTarget} onClick={attemptPositionChange}>Pedir a mudança <span>→</span></button>
                  </div>
                )}
                {positionChangeFeedback && (
                  <div className={`position-change-feedback ${positionChangeFeedback.success ? "success" : "failure"}`}>
                    <strong>{positionChangeFeedback.headline}</strong>
                    <p>{positionChangeFeedback.text}</p>
                  </div>
                )}
              </div>
              <div className="profile-metrics legacy-ui-hidden"><Metric label="OVR" value={game.overall} tone="gold" /><Metric label="Momento" value={careerTrend(game.history)} /><Metric label="Valor" value={formatMoney(marketValue(game.overall, game.age, currentClub, game.reputation, game.history.at(-1)))} /></div>
              <section className="medical-department">
                <header><div><span>DEPARTAMENTO MÉDICO</span><strong>Prontuário da carreira</strong></div><b className={game.medicalHistory.length ? "has-history" : ""}><FutboboIcon name="medical" /></b></header>
                <div className="medical-overview">
                  <Metric label="Lesões sérias" value={game.medicalHistory.length} tone={game.medicalHistory.length ? "danger" : "green"} />
                  <Metric label="Jogos perdidos" value={game.matchesMissedInjuries} />
                  <Metric label="Sequência saudável" value={`${game.injuryFreeSeasons} ano${game.injuryFreeSeasons === 1 ? "" : "s"}`} tone="green" />
                </div>
                {game.medicalHistory.length ? (
                  <div className="medical-history-list">
                    {game.medicalHistory.slice(0, 5).map((record) => (
                      <article key={record.id}><b>{record.season}</b><div><strong>{record.name}</strong><small>{record.recoveryMonths} meses · {record.matchesMissed} jogos fora{record.recurring ? " · recorrência" : ""}</small></div><span>{record.severity}</span></article>
                    ))}
                  </div>
                ) : <p>Nenhuma lesão séria registrada. O histórico começa a ser construído temporada por temporada.</p>}
              </section>
              <section className="trait-card legacy-ui-hidden">
                <div><span>CARACTERÍSTICAS ESPECIAIS</span><strong>O que torna seu jogo diferente</strong></div>
                <section>
                  {game.traits.map((traitId) => {
                    const trait = SPECIAL_TRAITS[traitId];
                    return <article className={`trait-${trait.tone}`} key={traitId}><b>{trait.icon}</b><div><strong>{trait.name}</strong><small>{trait.description}</small></div></article>;
                  })}
                </section>
                {game.traits.length === 0 && <p>Este save começou antes do sistema de características. Uma nova carreira já nasce com identidade própria.</p>}
              </section>
              <div className="market-context legacy-ui-hidden"><span>{currentClub.countryId === "brasil" ? "MERCADO BRASILEIRO" : "MERCADO INTERNACIONAL"}</span><p>{currentClub.countryId === "brasil" ? "O mesmo jogador costuma valer menos no Brasil. Uma ida à Europa pode multiplicar sua cotação — e também a cobrança." : `${leagueById(game.currentLeagueId || currentClub.leagueId).name} amplia sua vitrine e o valor do seu passe.`}</p></div>
              <section className="career-economy legacy-ui-hidden">
                <header>
                  <div><span>VIDA FINANCEIRA</span><strong>Patrimônio: {formatMoney(game.money)}</strong></div>
                  <small>Caixa livre: {formatMoney(game.spendableMoney)}</small>
                </header>
                <p>Salário e patrocínios formam seu patrimônio, mas só 18% da renda líquida vira caixa livre para decisões pessoais. O restante fica preso em impostos, contratos, reservas e gestão da carreira.</p>
                <div className="career-shop">
                  {[
                    { id: "recovery" as const, icon: "✚", name: "Centro de recuperação", description: "+12 físico e +7 moral", price: 350_000 },
                    { id: "media" as const, icon: "@", name: "Equipe de imagem", description: "Imprensa, equilíbrio e seguidores", price: 600_000 },
                    { id: "coach" as const, icon: "↗", name: "Treinador particular", description: "Pequeno ganho nos atributos", price: 1_200_000 },
                    { id: "potential" as const, icon: "?", name: "Recalibração experimental", description: "Uso cego: em tetos abaixo de 80, abre +1 de margem. Em tetos já altos, a interferência pode reduzir 1. Seu potencial nunca é revelado.", price: 2_500_000 },
                    { id: "corruption" as const, icon: "⚖", name: "Comprar os árbitros", description: "50/50: garante o título nacional deste ano ou causa banimento de 3 a 5 anos sem clube.", price: 2_000_000 },
                  ].map((item) => {
                    const purchased = game.economyPurchases.includes(`${game.season}:${item.id}`);
                    return (
                      <article className={item.id === "potential" || item.id === "corruption" ? "risky" : ""} key={item.id}>
                        <b>{item.icon}</b>
                        <div><strong>{item.name}</strong><small>{item.description}</small></div>
                        <button disabled={purchased || game.spendableMoney < item.price} onClick={() => buyCareerItem(item.id)}>
                          {purchased ? "Usado neste ano" : formatMoney(item.price)}
                        </button>
                      </article>
                    );
                  })}
                </div>
                {economyFeedback && <div className="economy-feedback">{economyFeedback}</div>}
              </section>
              <section className="football-attributes-card legacy-ui-hidden">
                <div className="football-attributes-heading">
                  <div><span>ATRIBUTOS DE CAMPO</span><strong>Seu estilo em números</strong></div>
                  <b>{Math.round(attributeAverage(game.attributes, POSITION_PRIMARY_ATTRIBUTES[game.position]))}<small>MÉDIA-CHAVE</small></b>
                </div>
                <p>Os atributos mudam a simulação: finalização gera gols, passe e visão criam assistências, fôlego aumenta seus jogos e qualidades defensivas ou de goleiro decidem o rendimento.</p>
                <div className="football-attribute-groups">
                  {ATTRIBUTE_GROUPS.map((group) => (
                    <article key={group.label}>
                      <span>{group.label}</span>
                      <div>
                        {group.keys.map((key) => (
                          <div className={POSITION_PRIMARY_ATTRIBUTES[game.position].includes(key) ? "is-key" : ""} key={key}>
                            <label>{ATTRIBUTE_LABELS[key]}</label>
                            <i><em style={{ width: `${game.attributes[key]}%`, background: attributeTone(game.attributes[key]) }} /></i>
                            <strong style={{ color: attributeTone(game.attributes[key]) }}>{game.attributes[key]}</strong>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
                <small>◆ atributo-chave para {position.name}</small>
              </section>
              <div className="contract-card legacy-ui-hidden"><span>CONTRATO E ELENCO</span><div><strong>{ROLE_LABELS[game.squadRole]}{game.clubCaptain ? " · Capitão" : ""}</strong><small>{game.isFreeAgent ? "Agente livre" : game.loanParentClubId ? `Emprestado pelo ${clubById(game.loanParentClubId).shortName}` : game.contractYears ? `${game.contractYears} ano(s) restantes` : "Contrato encerrado"} · {formatMoney(game.annualSalary)}/ano</small></div><Progress label="Confiança do treinador" value={game.managerTrust} color="#a675ff" /></div>
              <div className="supporter-card legacy-ui-hidden"><span>RELAÇÃO COM A TORCIDA</span><strong style={{ color: supporterMood.color }}>{supporterMood.label}</strong><p>{game.fanSupport < 38 ? "Cada toque pode virar vaia. Títulos e entrega reconquistam a arquibancada." : game.fanSupport >= 82 ? "Seu nome já faz parte da identidade do clube." : "A arquibancada ainda está decidindo que história contará sobre você."}</p></div>
              <div className="attribute-card legacy-ui-hidden">
                <Progress label="Moral" value={game.morale} color="#2ca8ff" />
                <Progress label="Condição" value={game.fitness} color="#63e36b" />
                <Progress label="Prestígio" value={game.reputation} color="#ffc72c" />
                <Progress label="Liderança" value={game.leadership} color="#a675ff" />
                <Progress label="Seleção" value={game.nationalLevel} color="#f5f7f2" />
                <Progress label="Torcida" value={game.fanSupport} color={supporterMood.color} />
                <Progress label="Disciplina" value={game.discipline} color={game.discipline < 45 ? "#ff5a4e" : "#63e36b"} />
                {isOutsideAcademyHome(game, currentClub) && <Progress label="Adaptação" value={game.adaptation} color="#2ca8ff" />}
              </div>
              <div className="career-total-card legacy-ui-hidden"><span>TOTAIS DA CARREIRA</span><div><Metric label="Jogos" value={game.stats.appearances} /><Metric label={game.position === "GOL" ? "Sem sofrer" : "Gols"} value={game.position === "GOL" ? game.stats.cleanSheets : game.stats.goals} /><Metric label={game.position === "GOL" ? "Sofridos" : "Assistências"} value={game.position === "GOL" ? game.stats.goalsConceded : game.stats.assists} /><Metric label={game.position === "GOL" ? "Defesas" : "Desarmes"} value={game.position === "GOL" ? game.stats.cleanSheets * 3 : game.stats.tackles} /><Metric label="Taças" value={game.trophies + game.nationalTrophies} tone="gold" /></div></div>
              <div className="legacy-ui-hidden"><TrophyGallery state={game} /></div>
              <div className="national-team-card legacy-ui-hidden">
                <span>CENTRAL DA SELEÇÃO</span>
                <div className="national-team-head">
                  <NationBadge country={nationCountry} size="md" />
                  <div><strong>{nationCountry.name}</strong><small>{nationalTierLabel[game.nationalCategory]}{game.nationalCaptain ? " · Capitão" : ""}</small></div>
                </div>
                <div className="national-team-metrics">
                  <Metric label="Jogos" value={game.nationalCaps} />
                  <Metric label="Gols" value={game.nationalGoals} />
                  <Metric label="Assistências" value={game.nationalAssists} />
                  <Metric label="Taças" value={game.nationalTrophies} tone="gold" />
                </div>
                {game.nationalHistory.length === 0 ? (
                  <p>Ainda sem convocações. Bons números no clube abrem a porta da Seleção.</p>
                ) : (
                  <div className="national-history-list">
                    {[...game.nationalHistory].reverse().map((entry) => (
                      <article key={`${entry.season}-${entry.name}`}><span>{entry.season}</span><div><strong>{entry.name}</strong><small>{entry.stage}</small></div>{entry.champion && <b><FutboboIcon name="trophy" /></b>}</article>
                    ))}
                  </div>
                )}
              </div>
              <div className="career-fortune legacy-ui-hidden"><span>TRAJETÓRIA</span><div><Metric label="Baques" value={game.setbacks} tone="danger" /><Metric label="Viradas de sorte" value={game.luckyBreaks} tone="green" /></div></div>
              <div className="discipline-card legacy-ui-hidden"><span>HISTÓRICO DISCIPLINAR</span><div><Metric label="Amarelos" value={game.stats.yellowCards} /><Metric label="Vermelhos" value={game.stats.redCards} tone="danger" /><Metric label="Suspensão" value={`${game.suspensionMatches}J`} tone={game.suspensionMatches ? "danger" : "default"} /><Metric label="Metas" value={`${game.objectivesCompleted}/${game.objectivesCompleted + game.objectivesFailed}`} tone="green" /></div></div>
              <div className="award-cabinet legacy-ui-hidden">
                <div className="award-cabinet-title">
                  <div><span>PRÊMIOS INDIVIDUAIS</span><strong>Sua galeria pessoal</strong></div>
                  <b>{totalIndividualAwards}<small>{totalAwardNominations} INDICAÇÕES</small></b>
                </div>
                {awardEntries.length === 0 ? (
                  <p>O primeiro prêmio ainda está por vir. Grandes temporadas, números decisivos e títulos colocam seu nome entre os candidatos.</p>
                ) : (
                  <>
                    <div className={`award-cabinet-feature award-${awardPresentation(awardEntries[0][0]).tier}`}>
                      <span>{awardPresentation(awardEntries[0][0]).icon}</span>
                      <div><small>MAIOR HONRARIA</small><strong>{awardEntries[0][0]}</strong><p>{awardPresentation(awardEntries[0][0]).description}</p></div>
                      <b>{awardEntries[0][1]}×</b>
                    </div>
                    <div className="award-cabinet-list">
                      {awardEntries.map(([award, count]) => {
                        const presentation = awardPresentation(award);
                        const seasonsWon = game.history.filter((record) => record.awards.includes(award)).map((record) => record.season);
                        return (
                          <article className={`award-${presentation.tier}`} key={award}>
                            <span>{presentation.icon}</span>
                            <div><strong>{award}</strong><small>{presentation.kicker}{seasonsWon.length ? ` · ${seasonsWon.slice(-3).join(", ")}` : ""}</small></div>
                            <b>{count}×</b>
                          </article>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === "life" && game.phase === "career" && (
            <div className="panel-screen life-screen screen-enter">
              <header className="life-hero">
                <div className="life-network-icon">@</div>
                <div><span>VIDA FORA DO CAMPO</span><strong>{formatFollowers(game.followers)}</strong><small>SEGUIDORES</small></div>
                <aside><small>IMAGEM PÚBLICA</small><strong style={{ color: publicImage.color }}>{publicImage.label}</strong></aside>
                <p>{publicImage.description}</p>
              </header>

              <section className="public-life-dashboard">
                <Progress label="Humor das redes" value={game.socialSentiment} color={game.socialSentiment < 40 ? "#ff5a4e" : "#63e36b"} />
                <Progress label="Relação com a imprensa" value={game.mediaRelation} color="#2ca8ff" />
                <Progress label="Equilíbrio pessoal" value={game.lifeBalance} color={game.lifeBalance < 40 ? "#ff8c5a" : "#a675ff"} />
                <Progress label="Impacto social" value={game.charityReputation} color="#ffc72c" />
              </section>

              {game.history.some((record) => (record.followers ?? 0) > 0) && (
                <section className="audience-growth-card">
                  <div><span>CRESCIMENTO DE AUDIÊNCIA</span><strong>Seu alcance por temporada</strong></div>
                  <div className="audience-bars">
                    {game.history.slice(-10).map((record) => {
                      const recentRecords = game.history.slice(-10);
                      const highestReach = Math.max(...recentRecords.map((item) => item.followers ?? 0), 1);
                      return (
                        <article key={`audience-${record.season}`}>
                          <b>{formatFollowers(record.followers ?? 0)}</b>
                          <i><em style={{ height: `${clamp(((record.followers ?? 0) / highestReach) * 100, 7, 100)}%` }} /></i>
                          <small>{String(record.season).slice(-2)}</small>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}

              <section className={`sponsor-hub ${game.activeSponsor ? "has-deal" : "no-deal"}`}>
                <div className="sponsor-heading"><div><span>PATROCINADOR PESSOAL</span><strong>{game.activeSponsor ? "Contrato ativo" : "Sua chuteira ainda está livre"}</strong></div><b><FutboboIcon name="tag" /></b></div>
                {game.activeSponsor ? (
                  <>
                    <article className="active-sponsor-card">
                      <div className="sponsor-wordmark">{game.activeSponsor.brand}</div>
                      <div><small>PARCERIA PERSISTENTE</small><strong>{formatMoney(game.activeSponsor.annualValue)}<em>/ano</em></strong><p>{Math.max(0, game.activeSponsor.endSeason - game.season)} temporada(s) restante(s) · acompanha qualquer transferência</p></div>
                    </article>
                    <div className="sponsor-contract-progress"><span><i style={{ width: `${clamp(((game.season - game.activeSponsor.startSeason) / Math.max(1, game.activeSponsor.endSeason - game.activeSponsor.startSeason)) * 100)}%` }} /></span><small>{game.activeSponsor.startSeason}</small><small>{game.activeSponsor.endSeason}</small></div>
                  </>
                ) : (
                  <div className="sponsor-empty"><strong>Grandes temporadas atraem grandes marcas.</strong><p>Prestígio, seguidores, boa imagem e impacto social aumentam o nível e o valor das propostas.</p></div>
                )}
                <footer><span>VALOR GERADO NA CARREIRA</span><strong>{formatMoney(sponsorCareerValue)}</strong><small>Simulação fictícia, sem vínculo com as marcas citadas.</small></footer>
              </section>

              {game.sponsorHistory.length > 0 && (
                <section className="sponsor-history-card">
                  <div><span>HISTÓRICO COMERCIAL</span><strong>Marcas que passaram pela carreira</strong></div>
                  <section>
                    {game.sponsorHistory.map((deal) => (
                      <article key={deal.id}><div className="sponsor-wordmark small">{deal.brand}</div><div><strong>{deal.startSeason}–{deal.endSeason}</strong><small>{formatMoney(deal.annualValue)}/ano · contrato concluído</small></div><b>✓</b></article>
                    ))}
                  </section>
                </section>
              )}

              <section className="social-feed-card">
                <div className="social-feed-heading"><div><span>LINHA DO TEMPO</span><strong>O que estão falando</strong></div><b>AO VIVO</b></div>
                {game.socialFeed.length === 0 ? (
                  <div className="social-empty"><span>@</span><strong>O primeiro post ainda está por vir</strong><p>Assine seu contrato profissional e comece a construir uma audiência.</p></div>
                ) : (
                  <section className="social-post-list">
                    {game.socialFeed.map((post) => (
                      <article className={`post-${post.tone}`} key={post.id}>
                        <div className={`social-avatar source-${post.source}`}>{post.source === "player" ? game.number : post.source === "sponsor" ? "◇" : post.source === "fans" ? "♥" : "●"}</div>
                        <div><strong>{post.author}</strong><small>{post.source === "player" ? "JOGADOR" : post.source === "sponsor" ? "PUBLICIDADE" : post.source === "fans" ? "TORCIDA" : "IMPRENSA"} · {post.season}</small><p>{post.text}</p><footer><span>♥ {formatFollowers(post.likes)}</span><span>↗ compartilhar</span></footer></div>
                      </article>
                    ))}
                  </section>
                )}
              </section>

              <section className="life-advisor-card">
                <div><span>TERMÔMETRO PESSOAL</span><strong>O que merece atenção</strong></div>
                <section>
                  <article className={game.lifeBalance < 45 ? "warning" : "good"}><b>{game.lifeBalance < 45 ? "!" : "✓"}</b><div><strong>{game.lifeBalance < 45 ? "A carreira está ocupando tudo" : "Rotina sob controle"}</strong><small>{game.lifeBalance < 45 ? "Baixo equilíbrio reduz rendimento e aumenta o risco físico." : "Descanso e vida pessoal ajudam sua consistência em campo."}</small></div></article>
                  <article className={game.socialSentiment < 40 ? "warning" : "good"}><b>{game.socialSentiment < 40 ? "!" : "✓"}</b><div><strong>{game.socialSentiment < 40 ? "As redes viraram contra você" : "Comunidade saudável"}</strong><small>{game.socialSentiment < 40 ? "Uma resposta ruim pode afastar público e patrocinadores." : "Seu alcance cresce com uma base de torcedores favorável."}</small></div></article>
                  <article className={game.mediaRelation < 38 ? "warning" : "good"}><b>{game.mediaRelation < 38 ? "!" : "✓"}</b><div><strong>{game.mediaRelation < 38 ? "Relação hostil com a imprensa" : "Narrativa bem administrada"}</strong><small>{game.mediaRelation < 38 ? "Entrevistas e manchetes terão menos boa vontade." : "Sua versão dos fatos encontra espaço nas manchetes."}</small></div></article>
                </section>
              </section>

              {game.offFieldMilestones.length > 0 && <div className="life-milestones"><span>MARCOS DIGITAIS</span>{[...game.offFieldMilestones].reverse().slice(0, 6).map((milestone) => <strong key={milestone}>✦ {milestone}</strong>)}</div>}
            </div>
          )}

          {activeTab === "stats" && game.phase === "career" && (
            <div className="panel-screen statistics-screen screen-enter">
              <header className="statistics-hero">
                <span>CENTRAL ESTATÍSTICA</span>
                <h2>Sua carreira em números</h2>
                <p>Cada temporada registrada, comparada e transformada em recordes.</p>
                <div>
                  <Metric label="Temporadas" value={game.history.length} />
                  <Metric label="G+A" value={game.stats.goals + game.stats.assists} tone="gold" />
                  <Metric label="Nota média" value={statistics.careerRating.toFixed(1)} tone="green" />
                  <Metric label="Melhor em campo" value={statistics.manOfTheMatchAwards} />
                </div>
              </header>

              {statistics.recent.length > 0 ? (
                <>
                  <section className="season-chart-card">
                    <div><span>EVOLUÇÃO RECENTE</span><strong>Nota de temporada</strong></div>
                    <div className="season-bars" role="img" aria-label="Notas das últimas temporadas">
                      {statistics.recent.map((record) => {
                        const score = record.averageRating ?? seasonAverageRating(record.performanceScore ?? 0, game.seed, record.season);
                        return (
                          <article key={`score-${record.season}`}>
                            <b>{score.toFixed(1)}</b>
                            <i><em style={{ height: `${clamp((score - 5) * 20, 8, 100)}%` }} /></i>
                            <small>{String(record.season).slice(-2)}</small>
                          </article>
                        );
                      })}
                    </div>
                  </section>

                  <section className="production-chart-card">
                    <div><span>PRODUÇÃO OFENSIVA</span><strong>Gols e assistências por ano</strong></div>
                    <div className="production-list">
                      {statistics.recent.map((record) => {
                        const total = Math.max(1, record.goals + record.assists);
                        return (
                          <article key={`production-${record.season}`}>
                            <small>{record.season}</small>
                            <div><i className="goals" style={{ width: `${record.goals / total * 100}%` }} /><i className="assists" style={{ width: `${record.assists / total * 100}%` }} /></div>
                            <strong>{record.goals}G · {record.assists}A</strong>
                          </article>
                        );
                      })}
                    </div>
                    <footer><span><i className="goals" /> Gols</span><span><i className="assists" /> Assistências</span></footer>
                  </section>

                  {statistics.bestSeason && (
                    <section className="best-season-card">
                      <span>MELHOR TEMPORADA</span>
                      <div><strong>{statistics.bestSeason.season}</strong><small>{clubById(statistics.bestSeason.clubId).shortName} · {statistics.bestSeason.age} anos</small></div>
                      <section>
                        <Metric label="Nota" value={(statistics.bestSeason.averageRating ?? seasonAverageRating(statistics.bestSeason.performanceScore ?? 0, game.seed, statistics.bestSeason.season)).toFixed(1)} tone="gold" />
                        <Metric label="Jogos" value={statistics.bestSeason.appearances} />
                        <Metric label="Gols" value={statistics.bestSeason.goals} />
                        <Metric label="Assist." value={statistics.bestSeason.assists} />
                      </section>
                    </section>
                  )}

                  <section className="record-book">
                    <div><span>LIVRO DE RECORDES</span><strong>Seus picos</strong></div>
                    <section>
                      <article><span><FutboboIcon name="ball" /></span><div><small>MAIS GOLS</small><strong>{statistics.mostGoals?.goals ?? 0}</strong><em>{statistics.mostGoals?.season}</em></div></article>
                      <article><span><FutboboIcon name="stats" /></span><div><small>MAIS ASSISTÊNCIAS</small><strong>{statistics.mostAssists?.assists ?? 0}</strong><em>{statistics.mostAssists?.season}</em></div></article>
                      <article><span>▶</span><div><small>MAIS JOGOS</small><strong>{statistics.mostAppearances?.appearances ?? 0}</strong><em>{statistics.mostAppearances?.season}</em></div></article>
                      <article><span>↑</span><div><small>MAIOR OVR</small><strong>{statistics.highestOverall?.overall ?? game.overall}</strong><em>{statistics.highestOverall?.season}</em></div></article>
                      <article className="value-record"><span>€</span><div><small>MAIOR VALOR</small><strong>{formatMoney(statistics.highestValue?.marketValue ?? 0)}</strong><em>{statistics.highestValue?.season}</em></div></article>
                    </section>
                  </section>
                </>
              ) : <div className="statistics-empty"><span><FutboboIcon name="stats" /></span><strong>A central abre depois da estreia</strong><p>Complete a primeira temporada para começar seu arquivo estatístico.</p></div>}

              <CareerStatisticsArchive state={game} />
              <CareerExtraStats state={game} />
              {/* Rivais continuam no GameState e na simulação para alimentar memória/notícias em updates futuros; somente a UI está oculta. */}
              <section className="rival-center legacy-ui-hidden">
                <div><span>RIVAIS DE GERAÇÃO</span><strong>{game.rivals.length ? "Eles também estão construindo uma carreira" : "Esta carreira não ganhou um rival"}</strong></div>
                {game.rivals.length === 0 ? <p>Nem toda história precisa de um antagonista. Em outra carreira — ou com seus Personagens — alguém pode aparecer.</p> : (
                  <section>
                    {game.rivals.map((rival) => {
                      const rivalClub = clubById(rival.currentClubId);
                      const relationship = rival.relationship >= 68 ? "Respeito mútuo" : rival.relationship <= 34 ? "Rivalidade quente" : "Competição aberta";
                      return (
                        <article className={!rival.active ? "retired" : ""} key={rival.id}>
                          <ClubBadge club={rivalClub} size="sm" />
                          <div><strong>{rival.name}{rival.custom ? " ✦" : ""}</strong><small>{rival.position} · {rival.age} anos · {rivalClub.shortName}</small><em>{relationship}</em></div>
                          <span><b>{rival.overall}</b><small>OVR</small></span>
                          <footer>{rival.appearances}J · {rival.goals}G · {rival.assists}A · {rival.awards} prêmio(s)</footer>
                        </article>
                      );
                    })}
                  </section>
                )}
              </section>
            </div>
          )}

          {activeTab === "team" && game.phase === "career" && (
            <CareerTeam state={game} />
          )}
          {activeTab === "world" && game.phase === "career" && (
            <CareerWorld state={game} />
          )}
          {activeTab === "legacy" && game.phase === "career" && (
            <div className="panel-screen legacy-screen screen-enter">
              <div className="legacy-hero">
                <span>ÍNDICE DE LEGADO</span>
                <strong style={{ color: legacyStanding.color }}>{game.legacyPoints}</strong>
                <h2>{legacyStanding.label}</h2>
                <p>Títulos importam, mas longevidade, seleção, prêmios, números e até as voltas por cima também constroem uma carreira.</p>
              </div>
              <div className="legacy-grid">
                <Metric label="Temporadas" value={game.history.length} />
                <Metric label="Clubes" value={new Set(game.history.map((item) => item.clubId)).size || 1} />
                <Metric label="Pico OVR" value={Math.max(game.overall, ...game.history.map((item) => item.overall), 0)} tone="gold" />
                <Metric label="Patrimônio" value={formatMoney(game.money)} tone="green" />
              </div>
              <div className="news-card">
                <span>ÚLTIMAS MANCHETES</span>
                {game.newsFeed.length ? game.newsFeed.map((headline, index) => <article key={`${headline}-${index}`}><small>{index === 0 ? "AGORA" : "ARQUIVO"}</small><strong>{headline}</strong></article>) : <p>A imprensa ainda espera o primeiro grande capítulo.</p>}
              </div>
              <div className="legacy-checklist">
                <span>MARCOS DA CARREIRA</span>
                <article className={game.stats.appearances >= 100 ? "done" : ""}><b>{game.stats.appearances >= 100 ? "✓" : "○"}</b><div><strong>Centenário</strong><small>100 jogos profissionais</small></div></article>
                <article className={game.trophies + game.nationalTrophies >= 5 ? "done" : ""}><b>{game.trophies + game.nationalTrophies >= 5 ? "✓" : "○"}</b><div><strong>Colecionador</strong><small>5 títulos na carreira</small></div></article>
                <article className={game.nationalCaps >= 50 ? "done" : ""}><b>{game.nationalCaps >= 50 ? "✓" : "○"}</b><div><strong>Camisa da pátria</strong><small>50 jogos pela Seleção</small></div></article>
                <article className={(game.awardCabinet["Bola de Ouro"] ?? 0) > 0 ? "done legendary" : ""}><b>{(game.awardCabinet["Bola de Ouro"] ?? 0) > 0 ? "★" : "○"}</b><div><strong>Bola de Ouro</strong><small>O marco quase impossível</small></div></article>
              </div>
              <div className="achievement-gallery">
                <div><span>CONQUISTAS</span><strong>{game.unlockedAchievements.length}/{ACHIEVEMENTS.length}</strong></div>
                <section>
                  {ACHIEVEMENTS.map((achievement) => {
                    const unlocked = game.unlockedAchievements.includes(achievement.id);
                    const legendarySecret = achievement.rarity === "lendário" && !unlocked;
                    return <button type="button" className={`achievement-card ${unlocked ? "unlocked" : ""} rarity-${achievement.rarity}`} key={achievement.id} onClick={() => setSelectedAchievementId(achievement.id)}><b>{unlocked ? achievement.icon : "?"}</b><div><strong>{legendarySecret ? "Conquista secreta" : achievement.title}</strong><small>{unlocked ? achievement.description : legendarySecret ? "Lendária · requisito oculto" : achievement.description}</small></div></button>;
                  })}
                </section>
              </div>
            </div>
          )}

          {game.phase === "career" && (
            <nav className="bottom-nav" aria-label="Navegação da carreira">
              <div className="desktop-career-nav-brand" aria-hidden="true">
                <BrandMark size="sm" />
                <span><small>CENTRAL DO JOGADOR</small><strong>{game.name}</strong><em>{position.name} · {leagueById(game.currentLeagueId || currentClub.leagueId).name}</em></span>
              </div>
              <button aria-pressed={activeTab === "event"} className={activeTab === "event" ? "selected" : ""} onClick={() => changeTab("event")}><span><FutboboIcon name="career" /></span>Carreira</button>
              <button aria-pressed={activeTab === "profile"} className={activeTab === "profile" ? "selected" : ""} onClick={() => changeTab("profile")}><span><FutboboIcon name="player" /></span>Jogador</button>
              <button aria-pressed={activeTab === "team"} className={activeTab === "team" ? "selected" : ""} onClick={() => changeTab("team")}><span><FutboboIcon name="team" /></span>Time</button>
              <button aria-pressed={activeTab === "history"} className={activeTab === "history" ? "selected" : ""} onClick={() => changeTab("history")}><span><FutboboIcon name="history" /></span>Histórico</button>
              <button aria-pressed={activeTab === "stats"} className={activeTab === "stats" ? "selected" : ""} onClick={() => changeTab("stats")}><span><FutboboIcon name="stats" /></span>Estatísticas</button>
              <button aria-pressed={activeTab === "world"} className={activeTab === "world" ? "selected" : ""} onClick={() => changeTab("world")}><span><FutboboIcon name="globe" /></span>Mundo</button>
            </nav>
          )}
        </section>
      )}

      {(game.phase === "summary" || hallPreview) && (
        <section className="summary-screen screen-enter">
          {hallPreview && (
            <div className="summary-preview-bar">
              <button type="button" onClick={closeHallCareer}>← Voltar ao ranking</button>
              <div><small>CARREIRA ARQUIVADA</small><strong>Você está revendo a história de {displayGame.name}</strong></div>
            </div>
          )}
          {hallPreviewLegacy && (
            <div className="summary-legacy-warning">
              Este registro é anterior ao arquivo completo. Números gerais foram recuperados, mas alguns detalhes de prêmios e clubes não existiam no save antigo.
            </div>
          )}
          {displayGame.challengeId && (
            <section className="challenge-summary-banner">
              <div><span>DESAFIO FUTBOBO CONCLUÍDO</span><strong>{displayGame.challengeId}</strong><small>Mesmo ponto de partida. Este foi o seu caminho.</small></div>
              <b>{displayGame.legacyPoints}<small>PONTOS</small></b>
            </section>
          )}
          <div className="summary-confetti" aria-hidden="true">✦ · ★ · ✦ · ★ · ✦</div>
          <span className="eyebrow">CARREIRA FINALIZADA</span>
          <h1>Uma história que só você viveu.</h1>
          <div className="share-card">
            <div className="share-brand"><BrandMark size="sm" /><strong>FUTBOBO</strong><small>MINHA CARREIRA</small></div>
            <div className="share-player"><ClubBadge club={currentClub} size="lg" /><div><span>{displayGame.archetype}</span><h2>{displayGame.name}</h2><p>#{displayGame.number} · {position.name} · {nationCountry.abbr}</p></div><strong>{Math.max(displayGame.overall, ...displayGame.history.map((item) => item.overall), 0)}<small>PICO OVR</small></strong></div>
            <div className="share-numbers"><Metric label="Jogos" value={displayGame.stats.appearances} /><Metric label={displayGame.position === "GOL" ? "Sem sofrer" : "Gols"} value={displayGame.position === "GOL" ? displayGame.stats.cleanSheets : displayGame.stats.goals} /><Metric label={displayGame.position === "GOL" ? "Sofridos" : "Assistências"} value={displayGame.position === "GOL" ? displayGame.stats.goalsConceded : displayGame.stats.assists} /><Metric label="Taças" value={displayGame.trophies + displayGame.nationalTrophies} tone="gold" /></div>
            <div className="share-legacy-line"><span>LEGADO {displayGame.legacyPoints}</span><strong>{legacyStanding.label}</strong><span>{displayGame.unlockedAchievements.length}/{ACHIEVEMENTS.length} CONQUISTAS</span></div>
            <div className="share-honours">
              <article><span><FutboboIcon name="medal" /></span><div><small>BOLA DE OURO</small><strong>{displayGame.awardCabinet["Bola de Ouro"] ?? 0}</strong></div></article>
              <article><span><FutboboIcon name="player" /></span><div><small>WORLD XI</small><strong>{displayGame.awardCabinet["FIFPRO World XI"] ?? 0}</strong></div></article>
              <article><span><FutboboIcon name="trophy" /></span><div><small>PRÊMIOS</small><strong>{totalIndividualAwards}</strong></div></article>
            </div>
            <div className="share-trophies">
              {shareTitleHighlights.map((entry) => (
                <span key={entry.shortLabel}>{entry.shortLabel} {entry.count}</span>
              ))}
              {displayGame.trophies + displayGame.nationalTrophies === 0 && <span>EM BUSCA DA PRIMEIRA TAÇA</span>}
            </div>
            <div className="share-path"><span>12</span><div />{Array.from(new Set(displayGame.history.map((item) => item.clubId))).map((clubId) => <ClubBadge key={clubId} club={clubById(clubId)} size="sm" />)}<div /><span>{displayGame.age}</span></div>
            <small className="share-url">futbobo.top</small>
          </div>
          <TrophyGallery state={displayGame} final />
          <section className={`final-player-story story-${playerStoryById(displayGame.playerStoryId).tone}`}>
            <header><b>{playerStoryById(displayGame.playerStoryId).icon}</b><div><span>A HISTÓRIA POR TRÁS DA CARREIRA</span><strong>{playerStoryById(displayGame.playerStoryId).title}</strong></div><em>{displayGame.storyLog.length} capítulo{displayGame.storyLog.length === 1 ? "" : "s"} vivido{displayGame.storyLog.length === 1 ? "" : "s"}</em></header>
            <p>{playerStoryById(displayGame.playerStoryId).description}</p>
            {displayGame.storyLog.length > 0 && (
              <div>
                {displayGame.storyLog.map((entry) => (
                  <article key={`${entry.season}-${entry.chapter}`}><span>{entry.season}</span><div><small>CAPÍTULO {entry.chapter}</small><strong>{entry.title}</strong><p>{entry.choice} — {entry.result}</p></div></article>
                ))}
              </div>
            )}
          </section>
          <section className="final-public-life">
            <div className="summary-section-heading"><span>FORA DAS QUATRO LINHAS</span><strong>A marca que você deixou no mundo</strong></div>
            <div className="final-public-grid">
              <Metric label="Seguidores" value={formatFollowers(displayGame.followers)} tone="gold" />
              <Metric label="Imagem" value={publicImage.label} tone="green" />
              <Metric label="Patrocínios" value={displayGame.sponsorHistory.length + (displayGame.activeSponsor ? 1 : 0)} />
              <Metric label="Impacto social" value={displayGame.charityReputation} />
            </div>
            {displayGame.activeSponsor && <article><div className="sponsor-wordmark small">{displayGame.activeSponsor.brand}</div><div><small>PARCERIA NA APOSENTADORIA</small><strong>{formatMoney(displayGame.activeSponsor.annualValue)}/ano</strong></div></article>}
          </section>
          <section className="final-individual-awards">
            <div className="summary-section-heading final-awards-heading">
              <div><span>PRÊMIOS INDIVIDUAIS</span><strong>Sua galeria de glórias</strong></div>
              <b>{totalIndividualAwards}<small>PRÊMIOS</small></b>
            </div>
            {awardEntries.length > 0 ? (
              <div className="final-awards-list">
                {awardEntries.map(([award, count]) => {
                  const presentation = awardPresentation(award);
                  return (
                    <article className={`award-${presentation.tier}`} key={award}>
                      <span>{presentation.icon}</span>
                      <div><small>{presentation.kicker}</small><strong>{award}</strong><p>{presentation.description}</p></div>
                      <b>{count}<small>×</small></b>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="final-awards-empty"><span><FutboboIcon name="medal" /></span><strong>Uma carreira sem prêmio não é uma carreira sem história.</strong><p>Seu legado foi construído de outras formas.</p></div>
            )}
          </section>
          <section className="career-club-summary">
            <div className="summary-section-heading club-archive-heading"><div><span>ARQUIVO POR CLUBE</span><strong>Reviva cada camisa da carreira</strong></div><b>{clubCareerSummary.length}<small>CLUBES</small></b></div>
            {selectedClubCareer ? (
              <div className="club-archive-layout">
                <nav className="club-archive-tabs" aria-label="Escolher clube da carreira">
                  {clubCareerSummary.map((entry) => {
                    const club = clubById(entry.clubId);
                    const selected = entry.clubId === selectedClubCareer.clubId;
                    return (
                      <button type="button" className={selected ? "selected" : ""} aria-pressed={selected} onClick={() => setSummaryClubId(entry.clubId)} key={entry.clubId}>
                        <ClubBadge club={club} size="sm" />
                        <span><strong>{club.shortName}</strong><small>{entry.firstSeason === entry.lastSeason ? entry.firstSeason : `${entry.firstSeason}–${entry.lastSeason}`} · {entry.seasons} temp.</small></span>
                        <b>{entry.trophies}<small>TAÇAS</small></b>
                      </button>
                    );
                  })}
                </nav>
                <article className="club-archive-dossier">
                  {(() => {
                    const club = clubById(selectedClubCareer.clubId);
                    const selectedTitles = selectedClubCareer.records.flatMap((record) => record.competitions.filter((competition) => competition.champion).map((competition) => ({ ...competition, season: record.season, leagueId: record.leagueId || club.leagueId })));
                    const selectedAwards = selectedClubCareer.records.flatMap((record) => record.awards.map((award) => ({ award, season: record.season })));
                    return <>
                      <header>
                        <ClubBadge club={club} size="lg" />
                        <div><span>{leagueById(club.leagueId).name}</span><h3>{club.name}</h3><p>{selectedClubCareer.firstSeason === selectedClubCareer.lastSeason ? selectedClubCareer.firstSeason : `${selectedClubCareer.firstSeason}–${selectedClubCareer.lastSeason}`} · {selectedClubCareer.seasons} temporada{selectedClubCareer.seasons > 1 ? "s" : ""}</p></div>
                        <b>{selectedClubCareer.peakOverall}<small>PICO OVR</small></b>
                      </header>
                      <div className="club-archive-metrics">
                        <Metric label="Jogos" value={selectedClubCareer.appearances} />
                        <Metric label={displayGame.position === "GOL" ? "Sem sofrer" : "Gols"} value={displayGame.position === "GOL" ? selectedClubCareer.cleanSheets : selectedClubCareer.goals} tone="green" />
                        <Metric label="Assistências" value={selectedClubCareer.assists} />
                        <Metric label="Taças" value={selectedClubCareer.trophies} tone="gold" />
                        <Metric label="Prêmios" value={selectedClubCareer.awards} />
                        <Metric label="Evolução" value={`${selectedClubCareer.entryOverall}→${selectedClubCareer.exitOverall}`} />
                      </div>
                      {(selectedTitles.length > 0 || selectedAwards.length > 0) && <div className="club-archive-honours">
                        {selectedTitles.map((title) => <span key={`${title.season}-${title.id}`}><CompetitionBadge competition={title} leagueId={title.leagueId} /><b>{title.name}</b><small>{title.season}</small></span>)}
                        {selectedAwards.slice(0, 8).map((entry, index) => <span className="individual" key={`${entry.season}-${entry.award}-${index}`}><i>{awardPresentation(entry.award).icon}</i><b>{entry.award}</b><small>{entry.season}</small></span>)}
                      </div>}
                      <section className="club-season-ledger">
                        <header><span>TEMPORADA POR TEMPORADA</span><small>O arquivo completo desta passagem</small></header>
                        <div>
                          {[...selectedClubCareer.records].reverse().map((record) => {
                            const titles = record.competitions.filter((competition) => competition.champion);
                            return <article key={`${record.season}-${record.clubId}`}>
                              <time>{record.season}<small>{record.age} ANOS</small></time>
                              <div><strong>{record.appearances} jogos · {record.position === "GOL" ? `${record.cleanSheets} sem sofrer` : `${record.goals} gols · ${record.assists} assist.`}</strong><small>{ROLE_LABELS[record.squadRole]} · nota {(record.averageRating ?? seasonAverageRating(record.performanceScore ?? 0, displayGame.seed, record.season)).toFixed(1)}</small>{record.eventTitle && <p>{record.eventTitle}</p>}</div>
                              <span className="club-season-ovr">{record.overall}<small>OVR</small></span>
                              {(titles.length > 0 || record.awards.length > 0) && <footer>{titles.map((title) => <CompetitionBadge key={title.id} competition={title} leagueId={record.leagueId || club.leagueId} />)}{record.awards.slice(0, 3).map((award, index) => <em key={`${award}-${index}`} title={award}>{awardPresentation(award).icon}</em>)}</footer>}
                            </article>;
                          })}
                        </div>
                      </section>
                    </>;
                  })()}
                </article>
              </div>
            ) : <div className="empty-panel">Nenhuma temporada profissional foi registrada.</div>}
          </section>
          <section className="final-hall-of-fame">
            <div className="summary-section-heading"><span>HALL DA FAMA</span><strong>As maiores carreiras deste aparelho</strong></div>
            <div className="hall-ranking">
              {hallOfFame.slice(0, 10).map((entry, index) => (
                <button
                  type="button"
                  className={`${entry.id === `${displayGame.seed}-${displayGame.name}-${displayGame.history.length}` ? "current-career " : ""}hall-career-link`}
                  key={entry.id}
                  aria-label={`Ver carreira completa de ${entry.name}`}
                  onClick={() => openHallCareer(entry)}
                >
                  <b>#{index + 1}</b>
                  <ClubBadge club={clubById(entry.finalClubId)} size="sm" />
                  <div><strong>{entry.name}</strong><small>{entry.legacyLabel} · {entry.trophies} taças · {entry.ballonDor}× Bola de Ouro</small></div>
                  <span className="hall-score">{entry.legacyPoints}<small>PTS</small></span>
                </button>
              ))}
            </div>
            {hallOfFame.length === 0 && <div className="empty-panel"><strong>O primeiro nome ainda será gravado aqui.</strong><span>Conclua uma carreira para inaugurar o Hall da Fama deste aparelho.</span></div>}
          </section>
          <div className="summary-actions"><button className="primary-button" disabled={shareBusy} aria-busy={shareBusy} onClick={shareCareer}>{shareBusy ? "Criando seu pôster..." : "Compartilhar pôster da carreira"} <span>{shareBusy ? "●" : "↗"}</span></button><button className="secondary-button" onClick={displayGame.challengeId ? startChallenge : startNew}>{displayGame.challengeId ? "Tentar o mesmo desafio novamente" : "Jogar novamente"}</button></div>
        </section>
      )}
    </main>
  );
}
