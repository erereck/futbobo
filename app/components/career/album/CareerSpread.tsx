"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Club, GameEvent } from "../../../game-data";
import type { ChoiceConsequence, GameState } from "../../../career/model";
import type { PlayerAppearance } from "../../../player-appearance";
import { ROLE_LABELS } from "../../../career-systems";
import { buildWorldSnapshot, worldPulseForState } from "../../../career/world-memory";
import { isNegativeConsequence } from "../../../career/simulation";
import { seasonAverageRating } from "../../../career/performance";
import { ClubBadge, NationBadge } from "../CareerPrimitives";
import FutboboIcon from "../../FutboboIcon";
import { AlbumPage } from "./AlbumShell";
import { BlockTitle, ClubBand, Ficha, Meters, PlayerSticker, Seal, SpecialSlot, Stamp } from "./primitives";
import type { MeterSpec } from "./primitives";
import { Pictogram, pictogramsForChoices } from "./Pictogram";
import type { PictogramName } from "./Pictogram";
import { crestForHeadline } from "./newsCrest";
import styles from "./careerSpread.module.css";

type Choice = GameEvent["choices"][number];

export type CareerSpreadProps = {
  mode: "decision" | "consequence";
  game: GameState;
  club: Club;
  event: GameEvent;
  season: number;
  age: number;
  positionName: string;
  leagueName: string;
  nationName: string;
  supporter: { label: string; color: string };
  appearance: PlayerAppearance | null;
  consequence: ChoiceConsequence | null;
  market: {
    loanChance: number;
    loanDisabled: boolean;
    transferDisabled: boolean;
    cooldown: boolean;
    onLoan: () => void;
    onTransfer: () => void;
  };
  continueLabel: string;
  onChoose: (index: number) => void;
  onContinue: () => void;
  onRetire: () => void;
  onOpenWorld: () => void;
};

const LETTERS = ["A", "B", "C", "D", "E"];
/** Etiqueta redonda do capítulo (Estreia, Visual novo…). Escondida a pedido; troque para true para ela voltar. */
const SHOW_CHAPTER_SEAL = false;
const CHANGE_TO_METER: Record<string, string> = { moral: "Moral", "físico": "Físico", "prestígio": "Prestígio", torcida: "Torcida" };

/** "+10 moral" / "−5 físico" → deltas por medidor, para a página mostrar o que a escolha mexeu. */
function meterDeltas(changes: string[]) {
  const deltas: Record<string, number> = {};
  for (const change of changes) {
    const match = /^([+\-−])\s?(\d+)\s+(.+)$/u.exec(change.trim());
    if (!match) continue;
    const meter = CHANGE_TO_METER[match[3].toLocaleLowerCase("pt-BR").trim()];
    if (!meter) continue;
    deltas[meter] = (deltas[meter] ?? 0) + (match[1] === "+" ? 1 : -1) * Number(match[2]);
  }
  return deltas;
}

function usePrefersReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduce;
}

function ChoiceFace({ choice, index, pictogram, withPeel = true }: { choice: Choice; index: number; pictogram: PictogramName; withPeel?: boolean }) {
  return (
    <span className={styles.face}>
      <span className={styles.chBand} data-ink={index % 4} aria-hidden="true">
        <Pictogram name={pictogram} />
        <b className={styles.chLetter}>{LETTERS[index] ?? index + 1}</b>
      </span>
      <span className={styles.chBody}>
        <strong>{choice.label}</strong>
        <small>{choice.hint}</small>
      </span>
      <span className={styles.gloss} aria-hidden="true" />
      {withPeel && <span className={styles.peel} aria-hidden="true" />}
    </span>
  );
}

export default function CareerSpread(props: CareerSpreadProps) {
  const { mode, game, club, event, season, age, consequence, market } = props;
  const reduce = usePrefersReducedMotion();
  // A escolha pertence ao capítulo: um capítulo novo devolve as figurinhas à página.
  const chapterKey = `${event.id}:${game.season}`;
  const [pickState, setPickState] = useState<{ key: string; index: number; mode: "peeled" | "stuck" } | null>(null);
  const pick = pickState?.key === chapterKey ? pickState.index : null;
  const pickMode = pickState?.mode ?? "stuck";
  const sourceRect = useRef<DOMRect | null>(null);
  const placedRef = useRef<HTMLDivElement>(null);
  const pickTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(pickTimer.current), []);

  const consequenceIndex = consequence ? event.choices.findIndex((choice) => choice.label === consequence.choice) : -1;
  const chosen = mode === "consequence" ? (consequenceIndex >= 0 ? consequenceIndex : pick) : pick;

  // A figurinha voa do pacote até o espaço do capítulo (FLIP com Web Animations).
  useLayoutEffect(() => {
    const placed = placedRef.current;
    const from = sourceRect.current;
    if (!placed || !from || reduce) return;
    sourceRect.current = null;
    const to = placed.getBoundingClientRect();
    if (!to.width) return;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const sx = from.width / to.width;
    placed.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}) rotate(-2deg)` },
      { transform: `translate(${dx * .35}px, ${dy * .35 - 26}px) scale(1.07) rotate(6deg)`, offset: .45 },
      { transform: "translate(0, 0) scale(1) rotate(0deg)" },
    ], { duration: 640, easing: "cubic-bezier(.16, 1, .3, 1)" });
  }, [chosen, reduce]);

  function choose(index: number, button: HTMLButtonElement) {
    if (pick !== null || mode !== "decision") return;
    const desktop = window.matchMedia("(min-width: 1024px)").matches;
    sourceRect.current = desktop ? (button.querySelector(`.${styles.face}`) as HTMLElement | null)?.getBoundingClientRect() ?? null : null;
    setPickState({ key: chapterKey, index, mode: desktop ? "peeled" : "stuck" });
    const wait = reduce ? 90 : desktop ? 660 : 430;
    pickTimer.current = window.setTimeout(() => props.onChoose(index), wait);
  }

  const deltas = useMemo(() => (mode === "consequence" && consequence ? meterDeltas(consequence.changes) : {}), [mode, consequence]);
  const meters: MeterSpec[] = [
    { label: "Moral", value: game.morale, color: "var(--blue)", delta: deltas.Moral },
    { label: "Físico", value: game.fitness, color: game.fitness < 55 ? "var(--red)" : "var(--green)", delta: deltas["Físico"] },
    { label: "Prestígio", value: game.reputation, color: "var(--yellow-deep)", delta: deltas["Prestígio"] },
    { label: "Torcida", note: props.supporter.label.toLocaleLowerCase("pt-BR"), value: game.fanSupport, color: "var(--red)", delta: deltas.Torcida },
  ];

  const lastSeason = game.history.at(-1);
  const previousOverall = game.history.length > 1 ? game.history.at(-2)?.overall : undefined;
  const ovrGain = lastSeason && previousOverall !== undefined ? game.overall - previousOverall : lastSeason?.development ?? 0;
  const contractText = game.isFreeAgent
    ? "Sem clube"
    : game.loanParentClubId
      ? `Emprestado até ${game.activeLoan?.endSeason ?? game.loanEndSeason}`
      : game.contractYears
        ? `${game.contractYears} ano${game.contractYears > 1 ? "s" : ""}`
        : "Encerrado";

  const headlines = useMemo(() => {
    const news = buildWorldSnapshot(game).news.slice(0, 4).map((item) => ({ id: item.id, title: item.title }));
    if (news.length) return news;
    const pulse = worldPulseForState(game);
    return pulse ? [{ id: `pulse-${game.season}`, title: pulse.title }] : [];
  }, [game]);

  const pictograms = useMemo(() => pictogramsForChoices(event.choices), [event.choices]);
  const objective = game.currentObjective;
  const isConsequence = mode === "consequence" && consequence;
  const choiceState = (index: number) => {
    if (chosen === null || chosen === undefined) return undefined;
    return index === chosen ? pickMode : "dim";
  };

  return (
    <>
      {/* ───────────── página do jogador ───────────── */}
      <AlbumPage side="left" label="Página do jogador">
        <div className={styles["o-band"]}>
          <ClubBand club={club} subtitle={`${club.city}, ${props.leagueName}`} page={age} />
        </div>

        <div className={styles.playerRow}>
          <PlayerSticker
            className={`${styles.playerSticker} ${styles["o-sticker"]} ${styles.drop}`}
            style={{ "--d": ".06s" } as CSSProperties}
            name={game.name}
            number={game.number}
            overall={game.overall}
            subtitle={`${props.positionName}, camisa ${game.number}`}
            club={club}
            appearance={props.appearance}
            size="lg"
          />
          <section className={`${styles.fichaBlock} ${styles["o-ficha"]}`} aria-labelledby="ficha-titulo">
            <BlockTitle id="ficha-titulo">Ficha técnica</BlockTitle>
            <Ficha
              rows={[
                { label: "Idade", value: `${age} anos` },
                { label: "Posição", value: `${props.positionName} (${game.position})` },
                { label: "Pé", value: game.foot },
                { label: "País", value: props.nationName },
                { label: "OVR", value: game.overall, note: lastSeason && ovrGain ? `${ovrGain > 0 ? "+" : "−"}${Math.abs(ovrGain)} em ${lastSeason.season}` : undefined, tone: ovrGain < 0 ? "down" : "up" },
                { label: "No elenco", value: `${ROLE_LABELS[game.squadRole]}${game.clubCaptain ? ", capitão" : ""}` },
                { label: "Confiança do treinador", value: `${Math.round(game.managerTrust)}%` },
                { label: "Contrato", value: contractText },
              ]}
            />
            {mode === "decision" && (
              <button type="button" className={`${styles.retire} ${styles["o-retire"]}`} onClick={props.onRetire}>
                <FutboboIcon name="hourglass" />
                Aposentar
              </button>
            )}
          </section>
        </div>

        <div className={`${styles.metersCol} ${styles["o-meters"]}`}>
          <Meters items={meters} />
        </div>

        {lastSeason && mode === "decision" && (
          <section className={`${styles.prev} ${styles["o-prev"]}`} aria-labelledby="prev-titulo">
            <BlockTitle id="prev-titulo">Na página anterior, {lastSeason.season}</BlockTitle>
            <ul>
              <li><b className={styles.num}>{lastSeason.appearances}</b> jogos</li>
              {lastSeason.position === "GOL"
                ? <li><b className={styles.num}>{lastSeason.cleanSheets}</b> sem sofrer</li>
                : <><li><b className={styles.num}>{lastSeason.goals}</b> {lastSeason.goals === 1 ? "gol" : "gols"}</li><li><b className={styles.num}>{lastSeason.assists}</b> {lastSeason.assists === 1 ? "assistência" : "assistências"}</li></>}
              <li><b className={styles.num}>{(lastSeason.averageRating ?? seasonAverageRating(lastSeason.performanceScore ?? 0, game.seed, lastSeason.season)).toFixed(1)}</b> de nota</li>
            </ul>
            {lastSeason.competitions.length > 0 && (
              <p>{lastSeason.competitions.slice(0, 4).map((competition) => `${competition.name}: ${competition.champion ? "campeão" : competition.stage.toLocaleLowerCase("pt-BR")}`).join(", ")}.</p>
            )}
          </section>
        )}

        <div className={styles.bottomRow}>
          {objective && (
            <div className={styles["o-meta"]}>
              {/* celular: a meta numa linha, sem o espaço de figurinha */}
              <p className={`${styles.metaStrip} ${styles.mobileOnly}`}>
                <span><b>Meta:</b> {objective.description.charAt(0).toLocaleLowerCase("pt-BR")}{objective.description.slice(1)}</span>
                <span className={styles.metaScore}>
                  <b className={styles.num}>0/{objective.target}</b>
                  <small className={styles.num}><i data-tone="up">+{objective.reward}</i> <i data-tone="down">−{objective.penalty}</i></small>
                </span>
              </p>
              <div className={styles.desktopOnly}>
              <SpecialSlot
                labelledBy="meta-titulo"
                title={objective.label}
                description={`Meta do treinador: ${objective.description.charAt(0).toLocaleLowerCase("pt-BR")}${objective.description.slice(1)}`}
                target={objective.target}
                reward={objective.reward}
                penalty={objective.penalty}
              />
              </div>
            </div>
          )}
          {mode === "decision" && (
            <section className={`${styles.market} ${styles["o-market"]}`} aria-labelledby="mercado-titulo">
              <BlockTitle id="mercado-titulo">Quer mudar de camisa?</BlockTitle>
              {market.cooldown && <p>Pedido já feito nesta temporada.</p>}
              <div className={styles.marketActions}>
                <Stamp pill={`${market.loanChance}%`} disabled={market.loanDisabled} onClick={market.onLoan}>Empréstimo</Stamp>
                <Stamp disabled={market.transferDisabled} onClick={market.onTransfer}><span className={styles.desktopOnly}>Pedir transferência</span><span className={styles.mobileOnly}>Transferência</span></Stamp>
                {/* no celular o Aposentar divide a linha com o mercado, sem a ficha técnica em volta */}
                <button type="button" className={`${styles.retire} ${styles.mobileOnly}`} onClick={props.onRetire}>
                  <FutboboIcon name="hourglass" />
                  Aposentar
                </button>
              </div>
            </section>
          )}
        </div>
      </AlbumPage>

      {/* ───────────── página do ano ───────────── */}
      <AlbumPage side="right" label={`Ano ${season}`} className={isConsequence ? styles.consequenceMode : undefined}>
        <div className={styles.chapWrap}>
          <header className={`${styles.chapHead} ${styles["o-chapHead"]}`}>
            <div className={styles.kicker}><span>Ano</span><b className={styles.num}>{season}</b></div>
            {SHOW_CHAPTER_SEAL && <Seal text={event.tag.toLocaleLowerCase("pt-BR")} />}
          </header>

          <div className={styles.chapGrid}>
            <div className={`${styles.chapCopy} ${styles["o-chapCopy"]}`}>
              <h1>{event.title}</h1>
              <p>{event.description}</p>
            </div>

            <div className={styles.slot} data-filled={chosen !== null && chosen !== undefined ? "" : undefined} aria-hidden="true">
              <span className={`${styles.slotNo} ${styles.num}`}>{age + 1}</span>
              <span className={styles.slotHint}>Cole aqui a figurinha da sua escolha</span>
              {chosen !== null && chosen !== undefined && event.choices[chosen] && (
                <div ref={placedRef} className={styles.placed}>
                  <ChoiceFace choice={event.choices[chosen]} index={chosen} pictogram={pictograms[chosen]} withPeel={false} />
                </div>
              )}
            </div>

            {isConsequence ? (
              <>
                {chosen !== null && chosen !== undefined && event.choices[chosen] && (
                  <div className={`${styles.choice} ${styles["o-choice"]} ${styles.mobileOnly}`} data-state="stuck">
                    <ChoiceFace choice={event.choices[chosen]} index={chosen} pictogram={pictograms[chosen]} />
                    <span className={styles.stuckStamp} aria-hidden="true">Colada</span>
                  </div>
                )}
                <section className={`${styles.result} ${styles["o-result"]}`} aria-label="Consequência da escolha">
                  {consequence.luckOutcome && (
                    <span className={styles.luck}><Seal text={consequence.luckOutcome === "success" ? "deu certo" : "deu errado"} tone={consequence.luckOutcome === "success" ? "green" : "ink"} /></span>
                  )}
                  <p>{consequence.resultText}</p>
                  {consequence.changes.length > 0 && (
                    <div className={styles.changes}>
                      {consequence.changes.map((change) => <span key={change} className={styles.change} data-tone={isNegativeConsequence(change) ? "down" : "up"}>{change}</span>)}
                    </div>
                  )}
                  <p className={styles.headline}>{consequence.headline}</p>
                </section>
                <div className={`${styles.continueDock} ${styles["o-dock"]}`}>
                  <Stamp variant="primary" onClick={props.onContinue}>{props.continueLabel}</Stamp>
                  <span className={styles.autoplay} aria-live="polite">
                    <span>Avançando sozinho em 5 segundos</span>
                    <i />
                  </span>
                </div>
              </>
            ) : (
              <div className={styles.choices} style={{ "--cols": Math.min(3, event.choices.length) } as CSSProperties} role="group" aria-label="Escolhas do capítulo">
                {event.choices.map((choice, index) => {
                  const state = choiceState(index);
                  return (
                    <button
                      key={choice.label}
                      type="button"
                      className={`${styles.choice} ${styles["o-choice"]} ${styles.drop}`}
                      style={{ "--d": `${0.36 + index * 0.1}s` } as CSSProperties}
                      data-state={state}
                      aria-pressed={index === chosen}
                      disabled={chosen !== null && chosen !== undefined}
                      onClick={(clickEvent) => choose(index, clickEvent.currentTarget)}
                    >
                      <span className={styles.liner} aria-hidden="true">Esta figurinha já está no capítulo.</span>
                      <ChoiceFace choice={choice} index={index} pictogram={pictograms[index]} />
                      <span className={styles.stuckStamp} aria-hidden="true">Colada</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {headlines.length > 0 && (
          <footer className={`${styles.news} ${styles["o-news"]}`} aria-labelledby="noticias-titulo">
            <div className={styles.newsHead}>
              <BlockTitle id="noticias-titulo">Notícias da rodada</BlockTitle>
              <button type="button" onClick={props.onOpenWorld}>Abrir o Mundo</button>
            </div>
            <ul>
              {headlines.map((headline) => {
                const crest = crestForHeadline(headline.title);
                return (
                  <li key={headline.id}>
                    <span className={styles.newsCrest} aria-hidden="true">
                      {crest.club ? <ClubBadge club={crest.club} size="sm" /> : crest.country ? <NationBadge country={crest.country} size="sm" /> : <FutboboIcon name="news" />}
                    </span>
                    {headline.title}
                  </li>
                );
              })}
            </ul>
          </footer>
        )}
      </AlbumPage>
    </>
  );
}
