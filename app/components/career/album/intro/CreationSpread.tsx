"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { CLUBS, COUNTRIES, FORMATIONS, POSITIONS, leagueById } from "../../../../game-data";
import type { PositionKey } from "../../../../game-data";
import type { GameState } from "../../../../career/model";
import { academyClubOptions, defaultAcademyCountry } from "../../../../career/academy";
import { clubPickerGroups } from "../../../../career/club-picker";
import { POSITION_FIELD_SPOTS } from "../../../../career/performance";
import { clubById } from "../../../../career/shared";
import { setActiveCareerAchievementsEligible } from "../../../../career/save-system";
import PlayerAppearanceEditor from "../../../../PlayerAppearanceEditor";
import { randomPlayerAppearance } from "../../../../player-appearance";
import { PLAYER_STORIES, type PlayerStoryId } from "../../../../player-stories";
import FutboboIcon from "../../../FutboboIcon";
import { ClubBadge, NationBadge } from "../../CareerPrimitives";
import AlbumShell, { AlbumPage } from "../AlbumShell";
import { luminance } from "../inks";
import { Stamp } from "../primitives";
import { offerInks } from "../SideSpreads";
import AlbumSheet, { sheetStyles } from "../sheets/AlbumSheet";
import { AthleteFicha, Dice, footLabel, introKit, storyTitle, type FichaStep } from "./IntroParts";
import styles from "./intro.module.css";

const DEFAULT_NUMBER: Record<PositionKey, number> = {
  GOL: 1, LD: 2, ZAG: 4, LE: 3, VOL: 5, MC: 10, MEI: 10, MD: 7, ME: 11, PD: 7, PE: 11, CA: 9,
};

/** Os cinco passos da ficha, na ordem das fases do jogo. */
const STEPS = [
  { phase: "identity", title: "Como a torcida vai te chamar?" },
  { phase: "appearance", title: "Onde você quer jogar?" },
  { phase: "nationality", title: "Seu número e seu pé." },
  { phase: "academy", title: "Monte seu jogador." },
  { phase: "formation", title: "Onde tudo começa?" },
] as const;

const SETUP_PHASES = new Set(["identity", "appearance", "nationality", "academy", "formation", "story"]);

type Props = {
  game: GameState;
  setGame: Dispatch<SetStateAction<GameState>>;
  shirtNumberInput: string;
  setShirtNumberInput: Dispatch<SetStateAction<string>>;
  rollPlayerName: () => void;
  selectPlayerStory: (storyId: PlayerStoryId) => void;
  appearanceEnabled: boolean;
};

/**
 * Criação do jogador como a ficha do atleta: a página da esquerda monta a figurinha e a ficha
 * enquanto a da direita faz uma pergunta por vez. No celular, uma página com a figurinha pequena no alto.
 */
export default function CreationSpread({ game, setGame, shirtNumberInput, setShirtNumberInput, rollPlayerName, selectPlayerStory, appearanceEnabled }: Props) {
  const [picker, setPicker] = useState<"country" | "story" | "base-country" | "all-clubs" | null>(null);
  const [countrySearch, setCountrySearch] = useState("");
  const [clubSearch, setClubSearch] = useState("");
  const launchedStoryRef = useRef(false);

  // "story" é só a passagem para a base: aplica a história escolhida uma vez.
  useEffect(() => {
    if (game.phase !== "story" || launchedStoryRef.current) return;
    launchedStoryRef.current = true;
    selectPlayerStory(game.playerStoryId);
  }, [game.phase, game.playerStoryId, selectPlayerStory]);

  useEffect(() => {
    if (game.phase !== "story") launchedStoryRef.current = false;
  }, [game.phase]);

  const playableCountryIds = useMemo(() => new Set(CLUBS.map((club) => club.countryId)), []);
  const academyCountry = COUNTRIES.find((country) => country.id === game.academyCountryId && playableCountryIds.has(country.id))
    ?? COUNTRIES.find((country) => country.id === defaultAcademyCountry(game.nationality))
    ?? COUNTRIES.find((country) => playableCountryIds.has(country.id))
    ?? COUNTRIES[0];
  const academyClubs = useMemo(() => academyClubOptions(academyCountry.id, game.seed), [academyCountry.id, game.seed]);
  const filteredCountries = useMemo(() => {
    const needle = countrySearch.trim().toLocaleLowerCase("pt-BR");
    return COUNTRIES
      .filter((country) => !needle || country.name.toLocaleLowerCase("pt-BR").includes(needle))
      .sort((a, b) => a.id === "brasil" ? -1 : b.id === "brasil" ? 1 : a.name.localeCompare(b.name, "pt-BR"));
  }, [countrySearch]);
  const clubCountries = useMemo(() => COUNTRIES
    .filter((country) => playableCountryIds.has(country.id))
    .sort((a, b) => a.id === academyCountry.id ? -1 : b.id === academyCountry.id ? 1 : a.name.localeCompare(b.name, "pt-BR")), [academyCountry.id, playableCountryIds]);
  const clubGroups = useMemo(() => clubPickerGroups(clubSearch, academyCountry.id), [clubSearch, academyCountry.id]);

  if (!SETUP_PHASES.has(game.phase)) return null;

  const stepIndex = Math.max(0, STEPS.findIndex((step) => step.phase === game.phase));
  const step = game.phase === "story" ? STEPS[4] : STEPS[stepIndex];
  const kit = introKit(game);
  const goTo = (phase: GameState["phase"]) => setGame((current) => ({ ...current, phase }));
  const back = () => goTo(stepIndex === 0 ? "welcome" : STEPS[stepIndex - 1].phase);

  const updateShirtNumber = (raw: string | number) => {
    const number = Math.max(1, Math.min(99, Number(raw) || DEFAULT_NUMBER[game.position]));
    setShirtNumberInput(String(number));
    setGame((current) => ({ ...current, number }));
  };
  const adjustShirtNumber = (delta: number) => {
    const current = Math.max(1, Math.min(99, Number(shirtNumberInput) || DEFAULT_NUMBER[game.position]));
    updateShirtNumber(current + delta);
  };

  const rollVisual = () => setGame((current) => ({ ...current, playerAppearance: { ...randomPlayerAppearance(), boots: current.playerAppearance.boots, celebration: current.playerAppearance.celebration } }));

  const confirmName = () => {
    if (!game.name.trim()) return;
    setGame((current) => ({ ...current, name: current.name.trim(), phase: "appearance" }));
  };
  const choosePosition = (position: PositionKey) => {
    const number = DEFAULT_NUMBER[position];
    setShirtNumberInput(String(number));
    setGame((current) => ({ ...current, position, number, phase: "nationality" }));
  };
  const confirmShirt = () => {
    const number = Math.max(1, Math.min(99, Number(shirtNumberInput) || DEFAULT_NUMBER[game.position]));
    setShirtNumberInput(String(number));
    setGame((current) => ({ ...current, number, phase: "academy" }));
  };
  const chooseCountry = (countryId: string) => {
    setGame((current) => ({ ...current, nationality: countryId, academyCountryId: defaultAcademyCountry(countryId), academyClubId: "" }));
    setPicker(null);
    setCountrySearch("");
  };
  const chooseClub = (clubId: string, unrestricted = false) => {
    const club = clubById(clubId);
    const formation = FORMATIONS[Math.floor(Math.random() * FORMATIONS.length)] ?? FORMATIONS[0];
    setActiveCareerAchievementsEligible(!unrestricted);
    setGame((current) => ({
      ...current,
      academyClubId: club.id,
      academyCountryId: club.countryId,
      formationId: formation.id,
      archetype: formation.archetype,
      phase: "story",
    }));
    setPicker(null);
  };
  const randomClub = () => {
    const countries = [...playableCountryIds];
    const countryId = countries[Math.floor(Math.random() * countries.length)] ?? "brasil";
    const pool = CLUBS.filter((club) => club.countryId === countryId);
    const club = pool[Math.floor(Math.random() * pool.length)] ?? CLUBS[Math.floor(Math.random() * CLUBS.length)];
    if (club) chooseClub(club.id, false);
  };

  const fichaSteps: FichaStep[] = STEPS.map((item, index) => ({
    done: index < stepIndex,
    onEdit: index < stepIndex ? () => goTo(item.phase) : undefined,
  }));

  let content: ReactNode = null;
  let primary: ReactNode = null;

  if (game.phase === "identity") {
    content = (
      <div className={styles.nameField}>
        <label className={styles.vh} htmlFor="intro-player-name">Nome do jogador</label>
        <input
          id="intro-player-name"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={game.name}
          maxLength={18}
          placeholder="Seu nome"
          onChange={(event) => setGame((current) => ({ ...current, name: event.target.value }))}
          onKeyDown={(event) => { if (event.key === "Enter") confirmName(); }}
        />
        <button type="button" className={styles.dice} onClick={rollPlayerName} aria-label="Sortear nome"><Dice /></button>
      </div>
    );
    primary = <Stamp variant="primary" disabled={!game.name.trim()} onClick={confirmName}>Continuar</Stamp>;
  } else if (game.phase === "appearance") {
    content = (
      <div className={styles.pitch}>
        <svg className={styles.pitchLines} viewBox="0 0 100 120" preserveAspectRatio="none" aria-hidden="true">
          <rect x="3" y="3" width="94" height="114" />
          <path d="M3 60h94M30 117V99h40v18M40 117v-7h20v7M30 3v18h40V3" />
          <circle cx="50" cy="60" r="11" />
        </svg>
        {POSITIONS.map((item) => (
          <button
            type="button"
            key={item.key}
            className={styles.spot}
            style={POSITION_FIELD_SPOTS[item.key] as CSSProperties}
            aria-pressed={stepIndex > 1 && game.position === item.key ? true : undefined}
            aria-label={item.name}
            onClick={() => choosePosition(item.key)}
          >
            <b>{item.key}</b>
            <small>{item.name}</small>
          </button>
        ))}
      </div>
    );
  } else if (game.phase === "nationality") {
    const darkShirt = luminance(kit.primary) < .55;
    content = (
      <div className={styles.shirtStage}>
        <div className={styles.shirtRow}>
          <Stamp className={styles.stepper} onClick={() => adjustShirtNumber(-1)} aria-label="Diminuir número da camisa"><svg className={styles.stepIcon} viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg></Stamp>
          <div className={styles.shirt} style={{ "--shirt": kit.primary, "--shirt-2": kit.secondary, "--shirt-ink": darkShirt ? "#fff" : "var(--ink)" } as CSSProperties}>
            <svg viewBox="0 0 220 210" aria-hidden="true">
              <path className={styles.shirtBody} d="M74 16 L96 8 Q110 26 124 8 L146 16 L200 50 L176 96 L154 84 L154 202 L66 202 L66 84 L44 96 L20 50 Z" />
              <path className={styles.shirtTrim} d="M96 8 Q110 26 124 8 M22 54 L44 92 M198 54 L176 92" />
            </svg>
            <label className={styles.vh} htmlFor="intro-shirt-number">Número da camisa</label>
            <input
              id="intro-shirt-number"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={shirtNumberInput}
              onChange={(event) => {
                const clean = event.target.value.replace(/\D/g, "").slice(0, 2);
                setShirtNumberInput(clean);
                if (clean) setGame((current) => ({ ...current, number: Math.max(1, Math.min(99, Number(clean) || DEFAULT_NUMBER[current.position])) }));
              }}
              onBlur={() => updateShirtNumber(shirtNumberInput)}
            />
          </div>
          <Stamp className={styles.stepper} onClick={() => adjustShirtNumber(1)} aria-label="Aumentar número da camisa"><svg className={styles.stepIcon} viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg></Stamp>
        </div>
        <fieldset className={styles.foot}>
          <legend>Pé preferido</legend>
          {(["Esquerda", "Direita"] as const).map((foot) => (
            <Stamp key={foot} aria-pressed={game.foot === foot} onClick={() => setGame((current) => ({ ...current, foot }))}>{footLabel(foot)}</Stamp>
          ))}
        </fieldset>
      </div>
    );
    primary = <Stamp variant="primary" onClick={confirmShirt}>Confirmar</Stamp>;
  } else if (game.phase === "academy") {
    const country = COUNTRIES.find((item) => item.id === game.nationality) ?? COUNTRIES[0];
    const story = PLAYER_STORIES.find((item) => item.id === game.playerStoryId) ?? PLAYER_STORIES[0];
    content = (
      <>
        <div className={styles.choiceRow}>
          <button type="button" className={styles.choice} onClick={() => setPicker("country")}>
            <span className={styles.choiceArt}><NationBadge country={country} size="sm" /></span>
            <span><small>País</small><strong>{country.name}</strong></span>
            <em>Trocar</em>
          </button>
          <button type="button" className={styles.choice} onClick={() => setPicker("story")}>
            <span><small>História</small><strong>{storyTitle(story)}</strong></span>
            <em>Trocar</em>
          </button>
        </div>
        {appearanceEnabled ? (
          <div className={`${sheetStyles.editorScope} ${styles.editor}`}>
            <div className={styles.editorHead}>
              <h2>Visual</h2>
              <Stamp onClick={rollVisual}>
                <Dice /> Sortear visual
              </Stamp>
            </div>
            <PlayerAppearanceEditor
              compact
              value={game.playerAppearance}
              onChange={(playerAppearance) => setGame((current) => ({ ...current, playerAppearance }))}
              playerName={game.name}
              number={game.number}
              primary={kit.primary}
              secondary={kit.secondary}
            />
          </div>
        ) : (
          <p className={styles.note}>Os personagens personalizados estão desligados nas Configurações.</p>
        )}
      </>
    );
    primary = <Stamp variant="primary" onClick={() => goTo("formation")}>Escolher o clube da base</Stamp>;
  } else if (game.phase === "formation") {
    content = (
      <>
        <div className={styles.baseTools}>
          <button type="button" className={styles.choice} onClick={() => setPicker("base-country")}>
            <span className={styles.choiceArt}><NationBadge country={academyCountry} size="sm" /></span>
            <span><small>País da base</small><strong>{academyCountry.name}</strong></span>
            <em>Trocar</em>
          </button>
          <Stamp onClick={randomClub} aria-label="Sortear clube"><Dice /><span className={styles.wideOnly}>Sortear</span></Stamp>
          <Stamp onClick={() => setPicker("all-clubs")}>Qualquer time</Stamp>
        </div>
        <ul className={styles.clubGrid}>
          {academyClubs.map((club, index) => (
            <li key={club.id}>
              <button type="button" className={styles.clubSticker} style={{ ...offerInks(club), "--r": `${index % 3 === 0 ? -.8 : index % 3 === 1 ? .5 : -.3}deg` } as CSSProperties} onClick={() => chooseClub(club.id)}>
                <span className={styles.clubBand}><span className={styles.clubCrest}><ClubBadge club={club} size="md" /></span></span>
                <strong>{club.shortName}</strong>
                <small><span className={styles.wideOnly}>{club.city} · </span>{leagueById(club.leagueId).name}</small>
              </button>
            </li>
          ))}
        </ul>
        <p className={styles.note}>Você fica na base até a revelação, entre 16 e 18 anos.</p>
      </>
    );
  } else {
    content = <p className={styles.note} role="status">Abrindo as categorias de base…</p>;
  }

  return (
    <AlbumShell club={kit} tab={null} onTab={() => undefined} showTabs={false} centered label="Criação do jogador">
      <AlbumPage side="left" label="Ficha do atleta" className={styles.fichaPage}>
        <AthleteFicha game={game} kit={kit} steps={fichaSteps} stepIndex={stepIndex} />
      </AlbumPage>
      <AlbumPage side="right" label={step.title} className={styles.stepPage}>
        <header className={styles.stepHead}>
          <button type="button" className={styles.back} onClick={back}><FutboboIcon name="arrow-left" /> Voltar</button>
          <span className={styles.stepCount}>Passo <b>{Math.min(stepIndex + 1, 5)}</b> de 5</span>
        </header>
        {/* No celular a figurinha só aparece onde ela é a prévia (nome e visual): as outras perguntas cabem na tela sem rolar. */}
        {(game.phase === "identity" || game.phase === "academy") && (
          <AthleteFicha
            game={game}
            kit={kit}
            steps={fichaSteps}
            stepIndex={stepIndex}
            compact
            action={game.phase === "academy" && appearanceEnabled ? <button type="button" className={styles.dice} onClick={rollVisual} aria-label="Sortear visual"><Dice /></button> : undefined}
          />
        )}
        <h1 className={styles.question}>{step.title}</h1>
        <div className={styles.stepBody} data-step={game.phase}>{content}</div>
        {primary && <div className={styles.dock}>{primary}</div>}
        {primary && <div className={styles.dockSpacer} aria-hidden="true" />}
      </AlbumPage>

      {picker === "country" && (
        <AlbumSheet ink="blue" club={kit} titleId="intro-country-title" title="Seu país" onDismiss={() => setPicker(null)}>
          <input className={styles.search} autoFocus placeholder="Pesquisar país" aria-label="Pesquisar país" value={countrySearch} onChange={(event) => setCountrySearch(event.target.value)} />
          <ul className={styles.pickGrid}>
            {filteredCountries.map((country) => (
              <li key={country.id}><button type="button" aria-pressed={country.id === game.nationality} onClick={() => chooseCountry(country.id)}><NationBadge country={country} size="sm" /><strong>{country.name}</strong></button></li>
            ))}
          </ul>
        </AlbumSheet>
      )}
      {picker === "story" && (
        <AlbumSheet ink="red" club={kit} titleId="intro-story-title" title="Sua história" onDismiss={() => setPicker(null)}>
          <ul className={styles.storyList}>
            {PLAYER_STORIES.map((story) => (
              <li key={story.id}>
                <button type="button" aria-pressed={game.playerStoryId === story.id} onClick={() => { setGame((current) => ({ ...current, playerStoryId: story.id })); setPicker(null); }}>
                  <strong>{storyTitle(story)}</strong>
                  <span>{story.tagline}</span>
                </button>
              </li>
            ))}
          </ul>
        </AlbumSheet>
      )}
      {picker === "base-country" && (
        <AlbumSheet ink="green" club={kit} titleId="intro-base-country-title" title="País da base" onDismiss={() => setPicker(null)}>
          <ul className={styles.pickGrid}>
            {clubCountries.map((country) => (
              <li key={country.id}><button type="button" aria-pressed={country.id === academyCountry.id} onClick={() => { setGame((current) => ({ ...current, academyCountryId: country.id, academyClubId: "" })); setPicker(null); }}><NationBadge country={country} size="sm" /><strong>{country.name}</strong></button></li>
            ))}
          </ul>
        </AlbumSheet>
      )}
      {picker === "all-clubs" && (
        <AlbumSheet ink="ink" club={kit} titleId="intro-all-clubs-title" title="Qualquer time" size="wide" onDismiss={() => setPicker(null)}>
          <p className={styles.warning}>Escolher qualquer clube desativa as conquistas desta carreira. O resto do jogo continua igual.</p>
          <input className={styles.search} autoFocus aria-label="Pesquisar clube, liga ou país" placeholder="Pesquisar clube, liga ou país" value={clubSearch} onChange={(event) => setClubSearch(event.target.value)} />
          <div className={styles.directory}>
            {clubGroups.length === 0 ? <p className={styles.note}>Nenhum clube ou liga encontrado. Tente outra busca.</p> : clubGroups.map(({ country, leagues }) => (
              <section className={styles.dirCountry} key={country.id}>
                <h3><NationBadge country={country} size="sm" /> {country.name}</h3>
                {leagues.map(({ league, division, clubs }) => (
                  <details className={styles.dirLeague} key={`${league.id}:${clubSearch}`} open={Boolean(clubSearch.trim()) || undefined}>
                    <summary><span>{league.name}</span><small>{division}ª divisão · {clubs.length} {clubs.length === 1 ? "clube" : "clubes"}</small></summary>
                    <ul>
                      {clubs.map((club) => (
                        <li key={club.id}><button type="button" onClick={() => chooseClub(club.id, true)}><ClubBadge club={club} size="sm" /><strong>{club.shortName}</strong><small>{club.city}</small></button></li>
                      ))}
                    </ul>
                  </details>
                ))}
              </section>
            ))}
          </div>
        </AlbumSheet>
      )}
    </AlbumShell>
  );
}
