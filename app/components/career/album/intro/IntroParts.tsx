"use client";

import { CLUBS, COUNTRIES, POSITIONS } from "../../../../game-data";
import type { Club, Country } from "../../../../game-data";
import type { GameState } from "../../../../career/model";
import type { PlayerStoryPreset } from "../../../../player-stories";
import { PLAYER_STORIES } from "../../../../player-stories";
import { NationBadge } from "../../CareerPrimitives";
import { InkBand, PlayerSticker } from "../primitives";
import styles from "./intro.module.css";

const CREATION_PHASES = new Set(["identity", "appearance", "nationality", "academy", "formation"]);

export type IntroKit = { primary: string; secondary: string; club?: Club; country: Country };

/**
 * Cores da figurinha durante a introdução: a seleção do jogador até ele entrar num clube,
 * depois a camisa da base.
 */
export function introKit(game: GameState): IntroKit {
  const country = COUNTRIES.find((item) => item.id === game.nationality) ?? COUNTRIES[0];
  const club = !CREATION_PHASES.has(game.phase) && game.academyClubId ? CLUBS.find((item) => item.id === game.academyClubId) : undefined;
  return club ? { primary: club.primary, secondary: club.secondary, club, country } : { primary: country.primary, secondary: country.secondary, country };
}

export const footLabel = (foot: GameState["foot"]) => foot === "Esquerda" ? "Canhoto" : "Destro";

export const storyTitle = (story: Pick<PlayerStoryPreset, "id" | "title">) => story.id === "open-book" ? "Sem história definida" : story.title;

export type FichaStep = { done: boolean; onEdit?: () => void };

type Row = { label: string; value: string | null; edit?: () => void };

/**
 * A ficha do atleta: figurinha montada até aqui e o formulário preenchido.
 * `compact` é a tira do celular (figurinha pequena e o essencial ao lado).
 */
export function AthleteFicha({ game, kit, steps, stepIndex, compact = false, overall = null, showFace = true }: {
  game: GameState;
  kit: IntroKit;
  steps: FichaStep[];
  stepIndex: number;
  compact?: boolean;
  overall?: number | null;
  showFace?: boolean;
}) {
  const position = POSITIONS.find((item) => item.key === game.position) ?? POSITIONS[0];
  const story = PLAYER_STORIES.find((item) => item.id === game.playerStoryId) ?? PLAYER_STORIES[0];
  const name = game.name.trim();
  const crest = kit.club ? undefined : <NationBadge country={kit.country} size="sm" />;
  const rows: Row[] = [
    { label: "Nome", value: name || null, edit: steps[0]?.onEdit },
    { label: "Posição", value: stepIndex > 1 ? position.name : null, edit: steps[1]?.onEdit },
    { label: "Camisa", value: stepIndex >= 2 ? String(game.number) : null, edit: steps[2]?.onEdit },
    { label: "Pé", value: stepIndex >= 2 ? footLabel(game.foot) : null, edit: steps[2]?.onEdit },
    { label: "País", value: stepIndex >= 3 ? kit.country.name : null, edit: steps[3]?.onEdit },
    { label: "História", value: stepIndex >= 3 ? storyTitle(story) : null, edit: steps[3]?.onEdit },
    { label: "Base", value: kit.club && stepIndex > 4 ? kit.club.shortName : null, edit: steps[4]?.onEdit },
  ];

  const sticker = (
    <PlayerSticker
      className={styles.sticker}
      name={name || "Seu nome"}
      number={game.number}
      overall={overall}
      subtitle={stepIndex > 1 ? position.name : undefined}
      club={kit.club}
      kit={kit}
      crest={crest}
      appearance={showFace ? game.playerAppearance : null}
      size={compact ? "sm" : "lg"}
      tilt={compact ? "-3deg" : "-2.4deg"}
    />
  );

  if (compact) {
    const facts = [stepIndex > 1 ? position.key : null, stepIndex >= 2 ? `camisa ${game.number}` : null, stepIndex >= 2 ? footLabel(game.foot).toLowerCase() : null].filter(Boolean);
    return (
      <div className={styles.strip}>
        {sticker}
        <div className={styles.stripCopy}>
          <strong>{name || "Seu jogador"}</strong>
          {facts.length > 0 && <span>{facts.join(" · ")}</span>}
          {stepIndex >= 3 && <span className={styles.stripFlag}><NationBadge country={kit.country} size="sm" /> {kit.country.name}</span>}
          {kit.club && <span>Base: {kit.club.shortName}</span>}
        </div>
      </div>
    );
  }

  return (
    <>
      <InkBand
        ink="club"
        title={<>Ficha do<br />atleta</>}
        subtitle="Rumo ao Estrelato"
        crest={kit.club ? { club: kit.club } : { country: kit.country }}
      />
      <div className={styles.fichaBody}>
        {sticker}
        <dl className={styles.form}>
          {rows.map((row) => (
            <div className={styles.formRow} key={row.label} data-empty={row.value === null ? "" : undefined}>
              <dt>{row.label}</dt>
              <dd>
                {row.value === null
                  ? <span className={styles.blank} aria-label="em branco" />
                  : row.edit
                    ? <button type="button" onClick={row.edit} title={`Alterar ${row.label.toLowerCase()}`}>{row.value}</button>
                    : row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}

/** Dado de sortear, no traço dos ícones do jogo. */
export function Dice() {
  return (
    <svg className={styles.diceIcon} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <circle cx="9" cy="9" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="9" cy="15" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
