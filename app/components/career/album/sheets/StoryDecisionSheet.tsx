"use client";

import { useMemo } from "react";
import type { StoryDecision } from "../../../../career/model";
import type { PlayerStoryPreset } from "../../../../player-stories";
import { Pictogram, pictogramsForChoices } from "../Pictogram";
import AlbumSheet, { sheetStyles as styles } from "./AlbumSheet";
import type { SheetInk } from "./AlbumSheet";

const STORY_INK: Record<PlayerStoryPreset["tone"], SheetInk> = {
  gold: "mustard",
  green: "green",
  blue: "blue",
  violet: "ink",
  red: "red",
};

const CHAPTERS = 8;

/**
 * Capítulo da história de origem no fim da temporada: a folha na cor da origem,
 * os oito capítulos como espaços de figurinha e cada escolha com o desenho do efeito que mais pesa.
 */
export default function StoryDecisionSheet({
  decision,
  story,
  playerName,
  club,
  onChoose,
}: {
  decision: StoryDecision;
  story: PlayerStoryPreset;
  playerName: string;
  club: { primary: string; secondary: string };
  onChoose: (index: number) => void;
}) {
  const pictograms = useMemo(() => {
    const names = pictogramsForChoices(decision.choices);
    return decision.choices.map((choice, index) => (choice.transferClubId ? "suitcase" : names[index]));
  }, [decision.choices]);

  return (
    <AlbumSheet
      ink={STORY_INK[story.tone]}
      club={club}
      titleId="story-decision-chapter"
      labelledBy="story-decision-chapter story-decision-title"
      kicker={`Capítulo ${decision.chapter} de ${CHAPTERS}`}
      title={story.title}
      aside={(
        <span className={styles.track} role="img" aria-label={`Capítulo ${decision.chapter} de ${CHAPTERS} da sua história`}>
          {Array.from({ length: CHAPTERS }, (_, index) => (
            <i key={index} data-state={index < decision.chapter - 1 ? "done" : index === decision.chapter - 1 ? "now" : undefined} />
          ))}
        </span>
      )}
    >
      <h3 className={styles.storyTitle} id="story-decision-title">{decision.title}</h3>
      <p className={styles.lead}>{decision.description}</p>
      <ul className={styles.storyChoices}>
        {decision.choices.map((choice, index) => (
          <li key={choice.label}>
            <button type="button" className={styles.storyChoice} onClick={() => onChoose(index)}>
              <span className={styles.picto} aria-hidden="true"><Pictogram name={pictograms[index]} /></span>
              <span><strong>{choice.label}</strong><small>{choice.hint}</small></span>
            </button>
          </li>
        ))}
      </ul>
      <p className={styles.storyNote}>Esta decisão vira parte permanente da história de {playerName}.</p>
    </AlbumSheet>
  );
}
