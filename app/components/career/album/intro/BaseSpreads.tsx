"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { leagueById } from "../../../../game-data";
import type { GameState } from "../../../../career/model";
import { createContract } from "../../../../career-systems";
import { clubById } from "../../../../career/shared";
import { webglAvailable } from "../../../../botao/view-mode";
import FutboboIcon from "../../../FutboboIcon";
import { ClubBadge } from "../../CareerPrimitives";
import AlbumShell, { AlbumPage } from "../AlbumShell";
import { Stamp } from "../primitives";
import { nameFit, offerInks } from "../SideSpreads";
import sideStyles from "../sideSpreads.module.css";
import { AthleteFicha, introKit, type FichaStep } from "./IntroParts";
import styles from "./intro.module.css";

const DONE_STEPS: FichaStep[] = Array.from({ length: 5 }, () => ({ done: true }));

/** A casca da base: ficha completa à esquerda (agora na camisa do clube) e a etapa à direita. */
function BaseAlbum({ game, label, overall, head, strip = false, children }: { game: GameState; label: string; overall: number | null; head?: ReactNode; strip?: boolean; children: ReactNode }) {
  const kit = introKit(game);
  return (
    <AlbumShell club={kit} tab={null} onTab={() => undefined} showTabs={false} centered label={label}>
      <AlbumPage side="left" label="Ficha do atleta" className={styles.fichaPage}>
        <AthleteFicha game={game} kit={kit} steps={DONE_STEPS} stepIndex={5} overall={overall} />
      </AlbumPage>
      <AlbumPage side="right" label={label} className={styles.stepPage}>
        {head}
        {/* No celular a figurinha pequena só entra na escolha da base: a simulação e o contrato cabem na tela sem rolar. */}
        {strip && <AthleteFicha game={game} kit={kit} steps={DONE_STEPS} stepIndex={5} overall={overall} compact />}
        {children}
      </AlbumPage>
    </AlbumShell>
  );
}

/** Antes da base: Simular (a animação de sempre) ou Jogar (um minigame do Scorebobo por ano). */
export function YouthChoiceSpread({ game, onChoose }: { game: GameState; onChoose: (mode: "simulate" | "play") => void }) {
  // Lido uma vez, só quando a escolha aparece: cada leitura custa um contexto de WebGL.
  const [webgl] = useState(webglAvailable);
  const club = clubById(game.academyClubId);
  const lastAge = game.youthYears.at(-1)?.age ?? game.revealAge;
  return (
    <BaseAlbum game={game} label="Categorias de base" overall={null} strip>
      <div className={styles.centerBlock}>
      <header className={styles.baseHead}>
        <p className={styles.kicker}>Categorias de base do {club.shortName}</p>
        <h1 className={styles.question}>Dos 12 aos {lastAge}.</h1>
        <p className={styles.lead}>Como você quer passar pela base?</p>
      </header>
      <div className={styles.modeChoices}>
        <button type="button" className={styles.modeSticker} data-ink="blue" onClick={() => onChoose("simulate")}>
          <span className={styles.modeBand} aria-hidden="true"><FutboboIcon name="hourglass" /></span>
          <span className={styles.modeBody}>
            <small>Em segundos</small>
            <strong>Simular</strong>
            <span>A formação passa em segundos, como sempre.</span>
          </span>
        </button>
        <button type="button" className={styles.modeSticker} data-ink="green" disabled={!webgl} onClick={() => onChoose("play")}>
          <span className={styles.modeBand} aria-hidden="true"><FutboboIcon name="ball" /></span>
          <span className={styles.modeBody}>
            <small>Scorebobo · 3D</small>
            <strong>Jogar a base</strong>
            <span>{game.youthYears.length} minigames do Scorebobo com o seu jogador. 3 chances por ano. Jogue bem e ganhe até +3 de potencial máximo.</span>
            {!webgl && <em>Precisa de 3D (WebGL), e este aparelho não liberou.</em>}
          </span>
        </button>
      </div>
      </div>
    </BaseAlbum>
  );
}

/** A base simulada: cada ano cola uma figurinha na página, até a revelação. */
export function YouthSimSpread({ game, youthStep, finished, onContinue }: { game: GameState; youthStep: number; finished: boolean; onContinue: () => void }) {
  const club = clubById(game.academyClubId);
  const years = game.youthYears;
  const shown = years.slice(0, youthStep);
  const current = shown.at(-1);
  const age = current?.age ?? 12;
  const overall = current?.overall ?? null;
  return (
    <BaseAlbum game={game} label="Formação na base" overall={finished ? game.overall : overall}>
      <header className={styles.baseHead}>
        <p className={styles.kicker}>Formando no {club.shortName}</p>
        <div className={styles.ageRow}>
          <h1 className={styles.age}><b className={styles.num}>{age}</b> anos</h1>
          <div className={styles.yearSlots} role="img" aria-label={`Ano ${Math.min(youthStep, years.length)} de ${years.length}`}>
            {years.map((year, index) => <i key={`${year.age}-${index}`} data-on={index < youthStep ? "" : undefined} />)}
          </div>
        </div>
      </header>
      <ol className={styles.years} aria-live="polite">
        {shown.map((year, index) => (
          <li key={`${year.age}-${year.title}`} className={styles.year} style={{ "--r": `${index % 2 ? .6 : -.7}deg` } as CSSProperties}>
            <span className={styles.yearAge}><b className={styles.num}>{year.age}</b><small>anos</small></span>
            <span className={styles.yearCopy}><strong>{year.title}</strong><span>{year.text}</span></span>
            <em className={styles.num}>{year.overall ? <>OVR <b>{year.overall}</b></> : <>+{year.delta}</>}</em>
          </li>
        ))}
      </ol>
      {!finished
        ? <p className={styles.note} role="status">Simulando a formação…</p>
        : (
          <>
            <div className={styles.dock}><Stamp variant="primary" onClick={onContinue}>Continuar</Stamp></div>
            <div className={styles.dockSpacer} aria-hidden="true" />
          </>
        )}
    </BaseAlbum>
  );
}

const OFFER_LINES = ["O caminho conhecido continua aberto.", "Uma porta diferente para buscar minutos.", "Outro projeto quer apostar no seu começo."];

/** Primeiro contrato profissional: as propostas como figurinhas de clube, iguais às da janela de transferências. */
export function FirstContractSpread({ game, onBack, onSign }: { game: GameState; onBack: () => void; onSign: (clubId: string) => void }) {
  const offers = game.proOffers.slice(0, 3);
  return (
    <BaseAlbum
      game={game}
      label="Primeiro contrato"
      overall={game.overall}
      head={<header className={styles.stepHead}><button type="button" className={styles.back} onClick={onBack}><FutboboIcon name="arrow-left" /> Voltar</button></header>}
    >
      <header className={styles.baseHead}>
        <p className={styles.kicker}>Chegou a hora</p>
        <h1 className={styles.question}>Quem aposta em você?</h1>
        <p className={styles.lead}>Escolha a primeira camisa profissional.</p>
      </header>
      <div className={sideStyles.offers}>
        {offers.map((clubId, index) => {
          const club = clubById(clubId);
          const { years } = createContract(game.overall, game.age, club, game.seed);
          return (
            <article className={sideStyles.offer} key={clubId} data-stay={index === 0 ? "" : undefined}>
              <button type="button" className={sideStyles.offerSticker} style={offerInks(club)} onClick={() => onSign(clubId)}>
                <span className={sideStyles.offerBand} aria-hidden="true"><span className={sideStyles.offerCrest}><ClubBadge club={club} /></span></span>
                <span className={sideStyles.offerBody}>
                  <small>{index === 0 ? "Continuar na sua base" : "Nova proposta"}</small>
                  <strong style={nameFit(club.shortName)}>{club.shortName}</strong>
                  <em>{leagueById(club.leagueId).name}</em>
                </span>
                <span className={sideStyles.offerTerms}>
                  <span><b>{years}</b> {years === 1 ? "ano" : "anos"}<span className={sideStyles.wide}> de contrato</span></span>
                </span>
              </button>
              <p className={sideStyles.reason}>{OFFER_LINES[index] ?? OFFER_LINES[2]}</p>
            </article>
          );
        })}
      </div>
    </BaseAlbum>
  );
}
