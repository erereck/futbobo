"use client";

// A peneira inteira numa folha do álbum: os três jogos como ingressos colados
// (rua, quadra, campo), a prancheta do olheiro somando as notas e, no fim, os
// clubes que chamaram. A mesa de botão e a apresentação no clube abrem por
// cima, em tela cheia. Carregada sob demanda: nada disso pesa no início de "/".

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from "react";
import BotaoMatch from "../../../../botao/BotaoMatch";
import { clubBadgePath } from "../../../../botao/adapter";
import { simulateBotaoMatch } from "../../../../botao/simulate";
import type { BotaoMatchResult, BotaoMatchSetup, BotaoRules } from "../../../../botao/types";
import { readBotao3dPerformance, readBotao3dPreference, webglAvailable } from "../../../../botao/view-mode";
import { hashSeed } from "../../../../botao/rng";
import { COUNTRIES, FORMATIONS, leagueById } from "../../../../game-data";
import type { GameState, Peneira, PeneiraMatch } from "../../../../career/model";
import {
  PENEIRA_STAGE_INFO,
  PENEIRA_THRESHOLDS,
  createPeneira,
  peneiraCurrentIndex,
  peneiraOfferCount,
  peneiraOfferTag,
  peneiraScoutNote,
  peneiraTotal,
  recordPeneiraResult,
} from "../../../../career/peneira";
import { peneiraMatchSetup, peneiraOpponentBadge, peneiraUserTeam } from "../../../../career/peneira-match";
import { clubById } from "../../../../career/shared";
import FutboboIcon from "../../../FutboboIcon";
import { ClubBadge, NationBadge } from "../../CareerPrimitives";
import AlbumShell, { AlbumPage } from "../AlbumShell";
import { Stamp } from "../primitives";
import { nameFit, offerInks } from "../SideSpreads";
import sideStyles from "../sideSpreads.module.css";
import { AthleteFicha, introKit, type FichaStep } from "./IntroParts";
import introStyles from "./intro.module.css";
import styles from "./peneira.module.css";
import type { SigningPresentationInput, SigningPresentationProps } from "../../../../presentation/SigningPresentation";
import { teamKitPattern } from "../../../../player-appearance";

/** A apresentação no clube (three.js) só baixa quando o jogador escolhe a proposta. */
const SigningPresentation = dynamic(
  () => import("../../../../presentation/SigningPresentation").catch(() => ({ default: PresentationUnavailable as ComponentType<SigningPresentationProps> })),
  { ssr: false },
);

/** Sem a apresentação (pedaço não chegou): segue para a base sem travar a carreira. */
function PresentationUnavailable({ onFinish }: SigningPresentationProps) {
  useEffect(() => {
    onFinish();
  }, [onFinish]);
  return null;
}

/** 3D (com a preferência do Modo 3D e WebGL) ou 2D, e o modo desempenho, para a apresentação. */
function readPresentationMode(): { mode: "3d" | "2d"; performance: boolean } {
  try {
    return { mode: readBotao3dPreference() && webglAvailable() ? "3d" : "2d", performance: readBotao3dPerformance().enabled };
  } catch {
    return { mode: "2d", performance: true };
  }
}

const FICHA_STEPS: FichaStep[] = Array.from({ length: 5 }, (_, index) => ({ done: index < 4 }));
const MAX_TOTAL = 30;

const rating1 = (value: number) => value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Escudo pequeno de um adversário (clube de verdade ou o desenhado na hora). */
function OpponentCrest({ match }: { match: PeneiraMatch }) {
  const badge = peneiraOpponentBadge(match.opponent);
  return (
    <span className={styles.crest} style={{ "--c1": match.opponent.primary, "--c2": match.opponent.secondary } as CSSProperties}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {badge ? <img src={badge} alt="" loading="lazy" decoding="async" /> : <b>{match.opponent.abbr}</b>}
    </span>
  );
}

/** Miniatura do lugar do jogo, desenhada em CSS (a mesma tinta da figurinha da peneira). */
function VenueArt({ match }: { match: PeneiraMatch }) {
  const tone = match.stage === "futsal" ? (match.fieldTheme === "futsal-orange" ? "orange" : "blue") : match.stage === "street" ? `street-${match.streetVariant ?? 0}` : "grass";
  return <span className={styles.venue} data-venue={tone} aria-hidden="true"><i /></span>;
}

/** A prancheta do olheiro: a soma das notas e as faixas de 1, 2 e 3 clubes. */
function ScoutMeter({ peneira, highlight }: { peneira: Peneira; highlight?: boolean }) {
  const total = peneiraTotal(peneira);
  const played = peneira.matches.filter((match) => match.result).length;
  const pct = (value: number) => `${(value / MAX_TOTAL) * 100}%`;
  return (
    <div className={styles.meter} data-highlight={highlight ? "" : undefined} role="img" aria-label={`Nota da peneira: ${rating1(total)} de ${MAX_TOTAL}, ${played} de 3 jogos`}>
      <div className={styles.meterHead}>
        <span>Prancheta do olheiro</span>
        <b className={styles.num}>{rating1(total)}<small> / {MAX_TOTAL}</small></b>
      </div>
      <div className={styles.meterTrack}>
        <i className={styles.meterFill} style={{ width: pct(total) }} />
        <i className={styles.meterMark} style={{ left: pct(PENEIRA_THRESHOLDS.two) }} />
        <i className={styles.meterMark} style={{ left: pct(PENEIRA_THRESHOLDS.three) }} />
      </div>
      <div className={styles.meterLegend}>
        <span style={{ left: pct(PENEIRA_THRESHOLDS.two / 2) }}>1 clube</span>
        <span style={{ left: pct((PENEIRA_THRESHOLDS.two + PENEIRA_THRESHOLDS.three) / 2) }}>2 clubes</span>
        <span style={{ left: pct((PENEIRA_THRESHOLDS.three + MAX_TOTAL) / 2) }} data-gold="">3 + gigante</span>
      </div>
    </div>
  );
}

type Props = {
  game: GameState;
  setGame: Dispatch<SetStateAction<GameState>>;
  rules: Partial<BotaoRules>;
  visualsEnabled: boolean;
};

type View = { kind: "board" } | { kind: "playing"; index: number; setup: BotaoMatchSetup } | { kind: "result"; index: number } | { kind: "presentation" };

export default function PeneiraSpread({ game, setGame, rules, visualsEnabled }: Props) {
  const peneira = game.peneira;
  const [view, setView] = useState<View>(() => (game.peneira?.chosenClubId ? { kind: "presentation" } : { kind: "board" }));
  const [simulating, setSimulating] = useState(false);
  // 3D e modo desempenho lidos uma vez, no clique da proposta (cada leitura de WebGL custa um contexto);
  // voltando com a escolha já feita (recarregou na apresentação), lidos ao abrir.
  const [presentationMode, setPresentationMode] = useState<{ mode: "3d" | "2d"; performance: boolean } | null>(() => (game.peneira?.chosenClubId ? readPresentationMode() : null));
  const finishedRef = useRef(false);

  // Primeira vez aqui: os três jogos saem sorteados da seed da carreira, no país da base.
  useEffect(() => {
    if (game.peneira) return;
    const countryId = game.academyCountryId || "brasil";
    setGame((current) => (current.peneira ? current : { ...current, peneira: createPeneira(countryId, hashSeed(current.seed, "peneira", countryId)) }));
  }, [game.peneira, game.academyCountryId, setGame]);

  const kit = introKit(game);
  const country = COUNTRIES.find((item) => item.id === (peneira?.countryId ?? game.academyCountryId)) ?? COUNTRIES[0];
  const current = peneira ? peneiraCurrentIndex(peneira) : 0;
  const total = peneira ? peneiraTotal(peneira) : 0;
  const started = Boolean(peneira?.matches.some((match) => match.started || match.result));

  const setupFor = useCallback((state: GameState, index: number) => {
    if (!state.peneira) return null;
    return peneiraMatchSetup({
      peneira: state.peneira,
      index,
      player: { name: state.name, number: state.number, position: state.position, appearance: state.playerAppearance },
      rules,
      visualsEnabled,
    });
  }, [rules, visualsEnabled]);

  const record = useCallback((index: number, result: BotaoMatchResult, simulated: boolean) => {
    setGame((state) => {
      if (!state.peneira) return state;
      return {
        ...state,
        peneira: recordPeneiraResult(state.peneira, index, {
          outcome: result.outcome,
          goalsFor: result.goalsFor,
          goalsAgainst: result.goalsAgainst,
          playerGoals: result.playerGoals,
          playerAssists: result.playerAssists,
          manOfTheMatch: result.manOfTheMatch,
          simulated,
          ...(result.walkover ? { walkover: true } : {}),
        }),
      };
    });
    setView({ kind: "result", index });
  }, [setGame]);

  const play = () => {
    if (!peneira || current >= 3) return;
    // A mesa nasce aqui e fica parada até o apito final (nada do resto da tela mexe nela no meio do jogo).
    const matchSetup = setupFor(game, current);
    if (!matchSetup) return;
    // Começou de verdade: fechar a página agora vale W.O. (o save guarda o "started").
    setGame((state) => state.peneira ? { ...state, peneira: { ...state.peneira, matches: state.peneira.matches.map((match, at) => at === current ? { ...match, started: true } : match) } } : state);
    setView({ kind: "playing", index: current, setup: matchSetup });
  };

  const simulate = () => {
    if (!peneira || current >= 3 || simulating) return;
    const matchSetup = setupFor(game, current);
    if (!matchSetup) return;
    setSimulating(true);
    // A física de um jogo inteiro leva algumas centenas de ms: deixa a tela pintar o "Simulando…".
    window.setTimeout(() => {
      record(current, simulateBotaoMatch(matchSetup), true);
      setSimulating(false);
    }, 40);
  };

  const leave = () => {
    if (started) return;
    setGame((state) => ({ ...state, peneira: null, phase: "formation" }));
  };

  const choose = (clubId: string) => {
    const club = clubById(clubId);
    // Esquema do time da base sorteado pela seed (a mesma escolha dá o mesmo esquema).
    const formation = FORMATIONS[hashSeed(game.seed, "peneira", "esquema", clubId) % FORMATIONS.length] ?? FORMATIONS[0];
    setPresentationMode(readPresentationMode());
    finishedRef.current = false;
    setGame((state) => ({
      ...state,
      academyClubId: club.id,
      academyCountryId: club.countryId,
      formationId: formation.id,
      archetype: formation.archetype,
      peneiraClubId: club.id,
      peneira: state.peneira ? { ...state.peneira, chosenClubId: club.id } : state.peneira,
    }));
    setView({ kind: "presentation" });
  };

  // A apresentação refaz o palco 3D quando a entrada muda de identidade: memorizada, nenhum render do resto da tela a reinicia.
  const chosenClubId = peneira?.chosenClubId ?? null;
  const presentationInput = useMemo<SigningPresentationInput | null>(() => {
    if (!chosenClubId) return null;
    const club = clubById(chosenClubId);
    // Nas costas vai o sobrenome (o último nome), como nas camisas de verdade.
    const shortName = game.name.trim().split(/\s+/).at(-1) || game.name || "Você";
    return {
      player: { name: game.name, shortName, number: game.number, appearance: game.playerAppearance },
      club: {
        id: club.id,
        name: club.name,
        shortName: club.shortName,
        abbr: club.abbr,
        primary: club.primary,
        secondary: club.secondary,
        badge: clubBadgePath(club),
        city: club.city,
        // A camisa erguida com a mesma estampa que o clube usa na mesa de botão.
        kitPattern: teamKitPattern(game.seed, club.id),
      },
      origin: "peneira",
    };
  }, [chosenClubId, game.name, game.number, game.playerAppearance, game.seed]);

  // Fim da apresentação: a peneira vira história e a base começa no clube escolhido.
  const finishPresentation = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setGame((state) => ({ ...state, phase: "story" }));
  }, [setGame]);

  // ------------------------------------------------------------ tela cheia

  if (view.kind === "playing") {
    return <BotaoMatch key={view.setup.matchId} setup={view.setup} onFinish={(result) => record(view.index, result, false)} />;
  }

  if (view.kind === "presentation" && presentationInput) {
    const mode = presentationMode ?? { mode: "2d" as const, performance: true };
    return (
      <SigningPresentation
        input={presentationInput}
        mode={mode.mode}
        performance={mode.performance}
        onFinish={finishPresentation}
      />
    );
  }

  // ------------------------------------------------------------ folha

  const shell = (children: ReactNode, dock?: ReactNode) => (
    <AlbumShell club={kit} tab={null} onTab={() => undefined} showTabs={false} centered label="Peneira">
      <AlbumPage side="left" label="Ficha do atleta" className={introStyles.fichaPage}>
        <AthleteFicha game={game} kit={kit} steps={FICHA_STEPS} stepIndex={4} />
      </AlbumPage>
      <AlbumPage side="right" label="Peneira" className={`${introStyles.stepPage} ${styles.page}`}>
        <header className={introStyles.stepHead}>
          {!started ? (
            <button type="button" className={introStyles.back} onClick={leave}><FutboboIcon name="arrow-left" /> Voltar</button>
          ) : <span />}
          <span className={introStyles.stepCount}><NationBadge country={country} size="sm" /> Peneira · {country.name}</span>
        </header>
        {children}
        {dock && <div className={introStyles.dock}>{dock}</div>}
        {dock && <div className={introStyles.dockSpacer} aria-hidden="true" />}
      </AlbumPage>
    </AlbumShell>
  );

  if (!peneira) return shell(<p className={introStyles.note} role="status">Montando a peneira…</p>);

  // Resultado de um jogo: a nota carimbada na prancheta.
  if (view.kind === "result") {
    const match = peneira.matches[view.index];
    const result = match.result;
    if (result) {
      const last = view.index >= 2;
      return shell(
        <div className={styles.resultBlock}>
          <header className={introStyles.baseHead}>
            <p className={introStyles.kicker}>Jogo {view.index + 1} de 3 · {PENEIRA_STAGE_INFO[match.stage].venue}</p>
            <h1 className={introStyles.question}>{result.walkover ? "W.O." : result.outcome === "win" ? "Vitória." : result.outcome === "draw" ? "Empate." : "Derrota."}</h1>
          </header>
          <div className={styles.scoreLine}>
            {/* O time da peneira na cor do colete daquele jogo (a mesma da mesa). */}
            <span className={styles.scoreTeam}><span className={styles.crest} style={{ "--c1": peneiraUserTeam(match.stage).primary, "--c2": peneiraUserTeam(match.stage).secondary } as CSSProperties}><b>PEN</b></span><small>Peneira</small></span>
            <b className={`${styles.score} ${styles.num}`}>{result.goalsFor}<i>×</i>{result.goalsAgainst}</b>
            <span className={styles.scoreTeam}><OpponentCrest match={match} /><small>{match.opponent.shortName}</small></span>
          </div>
          <div className={styles.ratingCard}>
            <div className={styles.ratingStamp} data-tier={result.rating >= 8 ? "gold" : result.rating >= 6.5 ? "good" : "low"}>
              <small>Nota</small>
              <b className={styles.num}>{rating1(result.rating)}</b>
            </div>
            <div className={styles.ratingFacts}>
              <ul className={styles.chips}>
                <li data-on={result.playerGoals > 0 ? "" : undefined}><b className={styles.num}>{result.playerGoals}</b> {result.playerGoals === 1 ? "gol" : "gols"}</li>
                <li data-on={result.playerAssists > 0 ? "" : undefined}><b className={styles.num}>{result.playerAssists}</b> {result.playerAssists === 1 ? "assistência" : "assistências"}</li>
                {result.manOfTheMatch && <li data-on="" data-gold="">Craque do jogo</li>}
                {result.simulated && <li>Simulado</li>}
              </ul>
              <blockquote className={styles.quote}>“{peneiraScoutNote(result, match.stage)}”</blockquote>
            </div>
          </div>
          <ScoutMeter peneira={peneira} highlight />
        </div>,
        <Stamp variant="primary" onClick={() => setView({ kind: "board" })}>{last ? "Ver o veredito" : `Próximo: ${PENEIRA_STAGE_INFO[peneira.matches[view.index + 1].stage].label}`}</Stamp>,
      );
    }
  }

  // Veredito: os clubes que chamaram, um por figurinha.
  if (current >= 3 && peneira.offers) {
    const count = peneiraOfferCount(total);
    return shell(
      <div className={styles.verdict}>
        <header className={introStyles.baseHead}>
          <p className={introStyles.kicker}>Veredito da peneira · nota {rating1(total)} de {MAX_TOTAL}</p>
          <h1 className={introStyles.question}>{count === 3 ? "Três clubes querem você." : count === 2 ? "Dois clubes querem você." : "Um clube quer você."}</h1>
          <p className={introStyles.lead}>{count === 3 ? "Inclusive um gigante de fora. Escolha onde você vai começar." : count === 2 ? "Os olheiros gostaram. Escolha a sua base." : "Não foi a peneira dos sonhos, mas uma porta abriu."}</p>
        </header>
        <ScoutMeter peneira={peneira} />
        <div className={`${sideStyles.offers} ${styles.offers}`}>
          {peneira.offers.map((clubId, index) => {
            const club = clubById(clubId);
            const tag = peneiraOfferTag(peneira, clubId);
            return (
              <article className={`${sideStyles.offer} ${styles.offer}`} key={clubId} style={{ "--delay": `${200 + index * 260}ms` } as CSSProperties} data-tag={tag ?? undefined}>
                {tag === "giant" && <span className={styles.ribbon}>Gigante de fora</span>}
                <button type="button" className={sideStyles.offerSticker} style={offerInks(club)} onClick={() => choose(clubId)}>
                  <span className={sideStyles.offerBand} aria-hidden="true"><span className={sideStyles.offerCrest}><ClubBadge club={club} /></span></span>
                  <span className={sideStyles.offerBody}>
                    <small>{tag === "giant" ? COUNTRIES.find((item) => item.id === club.countryId)?.name ?? "Fora" : tag === "rival" ? "Você jogou contra eles" : "Base"}</small>
                    <strong style={nameFit(club.shortName)}>{club.shortName}</strong>
                    <em>{leagueById(club.leagueId).name}</em>
                  </span>
                </button>
              </article>
            );
          })}
        </div>
      </div>,
    );
  }

  // Quadro dos jogos: o próximo em destaque, os jogados com a nota.
  return shell(
    <div className={styles.board}>
      <header className={introStyles.baseHead}>
        <p className={introStyles.kicker}>{current === 0 ? "Três jogos, os olheiros na beira do campo" : `Jogo ${current + 1} de 3`}</p>
        <h1 className={introStyles.question}>{current === 0 ? "Mostre seu futebol." : current === 1 ? "Agora na quadra." : "Último jogo: o campo."}</h1>
        <p className={introStyles.lead}>A nota é do <b>seu</b> botão: gol e assistência pesam, vencer ajuda. Somando os três jogos, de um a três clubes chamam você.</p>
      </header>
      <ol className={styles.fixtures}>
        {peneira.matches.map((match, index) => {
          const info = PENEIRA_STAGE_INFO[match.stage];
          const state = match.result ? "done" : index === current ? "next" : "later";
          return (
            <li key={match.stage} className={styles.fixture} data-state={state} style={{ "--r": `${index % 2 ? .5 : -.6}deg` } as CSSProperties}>
              <VenueArt match={match} />
              <span className={styles.fixtureBody}>
                <small>Jogo {index + 1} · {info.venue}</small>
                <strong><span className={styles.vs}>vs</span> {match.opponent.shortName}</strong>
                <span>{!match.result ? info.blurb : match.result.walkover ? "W.O.: saiu no meio do jogo" : `${match.result.goalsFor} × ${match.result.goalsAgainst} · ${match.result.playerGoals} ${match.result.playerGoals === 1 ? "gol" : "gols"} · ${match.result.playerAssists} assist.`}</span>
              </span>
              <span className={styles.fixtureSide}>
                {match.result
                  ? <b className={`${styles.miniRating} ${styles.num}`} data-tier={match.result.rating >= 8 ? "gold" : match.result.rating >= 6.5 ? "good" : "low"}>{rating1(match.result.rating)}</b>
                  : <OpponentCrest match={match} />}
              </span>
            </li>
          );
        })}
      </ol>
      <ScoutMeter peneira={peneira} />
    </div>,
    current < 3 ? (
      <div className={styles.dockRow}>
        <Stamp variant="primary" onClick={play} disabled={simulating}>Jogar · {PENEIRA_STAGE_INFO[peneira.matches[current].stage].label}</Stamp>
        <Stamp onClick={simulate} disabled={simulating}>{simulating ? "Simulando…" : "Simular"}</Stamp>
      </div>
    ) : (
      <Stamp variant="primary" onClick={() => setView({ kind: "board" })}>Ver o veredito</Stamp>
    ),
  );
}
