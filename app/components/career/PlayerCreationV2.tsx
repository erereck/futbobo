"use client";

import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { CLUBS, COUNTRIES, FORMATIONS, POSITIONS } from "../../game-data";
import type { PositionKey } from "../../game-data";
import type { GameState } from "../../career/model";
import { defaultAcademyCountry } from "../../career/academy";
import { POSITION_FIELD_SPOTS } from "../../career/performance";
import { clubById } from "../../career/shared";
import { setActiveCareerAchievementsEligible } from "../../career/save-system";
import PlayerAppearanceEditor from "../../PlayerAppearanceEditor";
import { PLAYER_STORIES, type PlayerStoryId } from "../../player-stories";
import { ClubBadge, NationBadge } from "./CareerPrimitives";
import styles from "./PlayerCreationV2.module.css";

const DEFAULT_NUMBER: Record<PositionKey, number> = {
  GOL: 1,
  LD: 2,
  ZAG: 4,
  LE: 3,
  VOL: 5,
  MC: 10,
  MEI: 10,
  MD: 7,
  ME: 11,
  PD: 7,
  PE: 11,
  CA: 9,
};

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

function SetupHeader({ step, title, onBack }: { step: string; title: string; onBack?: () => void }) {
  return (
    <header className={styles.setupHeader}>
      {onBack ? <button type="button" onClick={onBack} aria-label="Voltar">←</button> : <span />}
      <div><small>{step}</small><strong>{title}</strong></div>
      <b>FUTBOBO</b>
    </header>
  );
}

function displayStoryTitle(id: PlayerStoryId, title: string) {
  return id === "open-book" ? "Sem história definida" : title;
}

export default function PlayerCreationV2({ game, setGame, shirtNumberInput, setShirtNumberInput, rollPlayerName, selectPlayerStory, appearanceEnabled }: Props) {
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState("");
  const [storyPickerOpen, setStoryPickerOpen] = useState(false);
  const [clubCountryPickerOpen, setClubCountryPickerOpen] = useState(false);
  const [allClubsOpen, setAllClubsOpen] = useState(false);
  const [clubSearch, setClubSearch] = useState("");
  const launchedStoryRef = useRef(false);

  useEffect(() => {
    if (game.phase !== "story" || launchedStoryRef.current) return;
    launchedStoryRef.current = true;
    selectPlayerStory(game.playerStoryId);
  }, [game.phase, game.playerStoryId, selectPlayerStory]);

  useEffect(() => {
    if (game.phase !== "story") launchedStoryRef.current = false;
  }, [game.phase]);

  const selectedCountry = COUNTRIES.find((country) => country.id === game.nationality) ?? COUNTRIES.find((country) => country.id === "brasil") ?? COUNTRIES[0];
  const selectedStory = PLAYER_STORIES.find((story) => story.id === game.playerStoryId) ?? PLAYER_STORIES[0];
  const playableCountryIds = useMemo(() => new Set(CLUBS.map((club) => club.countryId)), []);
  const academyCountry = COUNTRIES.find((country) => country.id === game.academyCountryId && playableCountryIds.has(country.id))
    ?? COUNTRIES.find((country) => country.id === defaultAcademyCountry(game.nationality))
    ?? COUNTRIES.find((country) => playableCountryIds.has(country.id))
    ?? COUNTRIES[0];
  const academyClubs = useMemo(() => CLUBS
    .filter((club) => club.countryId === academyCountry.id)
    .sort((a, b) => a.reputation - b.reputation || a.strength - b.strength)
    .slice(0, 12), [academyCountry.id]);
  const filteredCountries = useMemo(() => {
    const needle = countrySearch.trim().toLocaleLowerCase("pt-BR");
    return COUNTRIES
      .filter((country) => !needle || country.name.toLocaleLowerCase("pt-BR").includes(needle))
      .sort((a, b) => a.id === "brasil" ? -1 : b.id === "brasil" ? 1 : a.name.localeCompare(b.name, "pt-BR"));
  }, [countrySearch]);
  const filteredClubCountries = useMemo(() => COUNTRIES
    .filter((country) => playableCountryIds.has(country.id))
    .sort((a, b) => a.id === academyCountry.id ? -1 : b.id === academyCountry.id ? 1 : a.name.localeCompare(b.name, "pt-BR")), [academyCountry.id, playableCountryIds]);
  const allClubResults = useMemo(() => {
    const needle = clubSearch.trim().toLocaleLowerCase("pt-BR");
    return CLUBS
      .filter((club) => !needle || club.name.toLocaleLowerCase("pt-BR").includes(needle) || club.shortName.toLocaleLowerCase("pt-BR").includes(needle))
      .sort((a, b) => b.reputation - a.reputation || b.strength - a.strength)
      .slice(0, 80);
  }, [clubSearch]);

  if (!SETUP_PHASES.has(game.phase)) return null;

  const goPosition = () => setGame((current) => ({ ...current, phase: "appearance" }));
  const goShirt = () => setGame((current) => ({ ...current, phase: "nationality" }));
  const goIdentityMix = () => setGame((current) => ({ ...current, phase: "academy" }));
  const goClub = () => setGame((current) => ({ ...current, phase: "formation" }));

  const choosePosition = (position: PositionKey) => {
    const number = DEFAULT_NUMBER[position];
    setShirtNumberInput(String(number));
    setGame((current) => ({ ...current, position, number, phase: "nationality" }));
  };

  const chooseCountry = (countryId: string) => {
    setGame((current) => ({
      ...current,
      nationality: countryId,
      academyCountryId: defaultAcademyCountry(countryId),
      academyClubId: "",
    }));
    setCountryPickerOpen(false);
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
    setAllClubsOpen(false);
  };

  const randomClub = () => {
    const countries = [...playableCountryIds];
    const countryId = countries[Math.floor(Math.random() * countries.length)] ?? "brasil";
    const pool = CLUBS.filter((club) => club.countryId === countryId);
    const club = pool[Math.floor(Math.random() * pool.length)] ?? CLUBS[Math.floor(Math.random() * CLUBS.length)];
    if (club) chooseClub(club.id, false);
  };

  if (game.phase === "identity") {
    return (
      <section className={styles.page}>
        <SetupHeader step="1 · NOME" title="Como a torcida vai te chamar?" onBack={() => setGame((current) => ({ ...current, phase: "welcome" }))} />
        <div className={`${styles.centerStage} ${styles.nameStage}`}>
          <span className={styles.kicker}>RUMO AO ESTRELATO</span>
          <h1>Comece pelo nome.</h1>
          <div className={styles.nameInput}>
            <input autoFocus value={game.name} maxLength={18} placeholder="Nome do jogador" onChange={(event) => setGame((current) => ({ ...current, name: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter" && game.name.trim()) goPosition(); }} />
            <button type="button" onClick={rollPlayerName} aria-label="Sortear nome">⚄</button>
          </div>
          <button className={styles.primary} type="button" disabled={!game.name.trim()} onClick={() => { setGame((current) => ({ ...current, name: current.name.trim() })); goPosition(); }}>Continuar <b>→</b></button>
        </div>
      </section>
    );
  }

  if (game.phase === "appearance") {
    return (
      <section className={styles.page}>
        <SetupHeader step="2 · POSIÇÃO" title="Onde você quer jogar?" onBack={() => setGame((current) => ({ ...current, phase: "identity" }))} />
        <div className={styles.fieldStage}>
          <div className={styles.pitch}>
            <div className={styles.pitchLines} aria-hidden="true" />
            {POSITIONS.map((item) => (
              <button
                type="button"
                key={item.key}
                className={`${styles.position} ${game.position === item.key ? styles.positionSelected : ""}`}
                style={POSITION_FIELD_SPOTS[item.key]}
                onClick={() => choosePosition(item.key)}
              >
                <span>{item.key}</span><small>{item.name}</small>
              </button>
            ))}
          </div>
          <p>Clique numa posição. A camisa sugerida entra automaticamente e você pode mudar no próximo passo.</p>
        </div>
      </section>
    );
  }

  if (game.phase === "nationality") {
    return (
      <section className={styles.page}>
        <SetupHeader step="3 · CAMISA" title="Seu número e seu pé." onBack={() => setGame((current) => ({ ...current, phase: "appearance" }))} />
        <div className={`${styles.centerStage} ${styles.shirtStage}`}>
          <div className={styles.shirtNumber}><small>CAMISA</small><input type="number" min={1} max={99} inputMode="numeric" value={shirtNumberInput} onChange={(event) => { const value = event.target.value; setShirtNumberInput(value); if (value) setGame((current) => ({ ...current, number: Math.max(1, Math.min(99, Number(value) || DEFAULT_NUMBER[current.position])) })); }} /></div>
          <fieldset className={styles.footChoice}><legend>PÉ DOMINANTE</legend>{(["Esquerda", "Direita"] as const).map((foot) => <button type="button" key={foot} className={game.foot === foot ? styles.selectedChoice : ""} onClick={() => setGame((current) => ({ ...current, foot }))}>{foot}</button>)}</fieldset>
          <button className={styles.primary} type="button" onClick={() => { const number = Math.max(1, Math.min(99, Number(shirtNumberInput) || DEFAULT_NUMBER[game.position])); setGame((current) => ({ ...current, number, phase: "academy" })); setShirtNumberInput(String(number)); }}>Confirmar <b>→</b></button>
        </div>
      </section>
    );
  }

  if (game.phase === "academy") {
    return (
      <section className={styles.page}>
        <SetupHeader step="4 · IDENTIDADE" title="Monte seu jogador." onBack={() => setGame((current) => ({ ...current, phase: "nationality" }))} />
        <div className={styles.identityStage}>
          {appearanceEnabled ? (
            <div className={styles.appearanceWrap}><PlayerAppearanceEditor compact value={game.playerAppearance} onChange={(playerAppearance) => setGame((current) => ({ ...current, playerAppearance }))} playerName={game.name} number={game.number} /></div>
          ) : <div className={styles.appearanceDisabled}><b>#{game.number}</b><strong>{game.name}</strong><small>Personagens personalizados estão desativados nas configurações.</small></div>}
          <aside className={styles.identityOptions}>
            <button type="button" className={styles.optionCard} onClick={() => setCountryPickerOpen(true)}><NationBadge country={selectedCountry} size="md" /><span><small>PAÍS</small><strong>{selectedCountry.name}</strong></span><b>›</b></button>
            <button type="button" className={`${styles.optionCard} ${styles.storyOption}`} onClick={() => setStoryPickerOpen(true)}><span className={styles.storyIcon}>{selectedStory.icon}</span><span><small>{selectedStory.tagline}</small><strong>{displayStoryTitle(selectedStory.id, selectedStory.title)}</strong></span><b>›</b></button>
            <button className={styles.primary} type="button" onClick={goClub}>Escolher primeiro clube <b>→</b></button>
          </aside>
        </div>
        {countryPickerOpen && <Picker title="Escolha seu país" onClose={() => setCountryPickerOpen(false)}><input className={styles.search} autoFocus placeholder="Pesquisar país" value={countrySearch} onChange={(event) => setCountrySearch(event.target.value)} /><div className={styles.pickerGrid}>{filteredCountries.map((country) => <button type="button" key={country.id} onClick={() => chooseCountry(country.id)}><NationBadge country={country} size="sm" /><strong>{country.name}</strong></button>)}</div></Picker>}
        {storyPickerOpen && <Picker title="Escolha sua história" onClose={() => setStoryPickerOpen(false)}><div className={styles.storyList}>{PLAYER_STORIES.map((story) => <button type="button" key={story.id} className={game.playerStoryId === story.id ? styles.activeStory : ""} onClick={() => { setGame((current) => ({ ...current, playerStoryId: story.id })); setStoryPickerOpen(false); }}><b>{story.icon}</b><span><small>{story.tagline}</small><strong>{displayStoryTitle(story.id, story.title)}</strong></span></button>)}</div></Picker>}
      </section>
    );
  }

  if (game.phase === "formation") {
    return (
      <section className={styles.page}>
        <SetupHeader step="5 · PRIMEIRO CLUBE" title="Onde tudo começa?" onBack={() => setGame((current) => ({ ...current, phase: "academy" }))} />
        <div className={styles.clubStage}>
          <header className={styles.clubToolbar}>
            <button type="button" onClick={() => setClubCountryPickerOpen(true)}><NationBadge country={academyCountry} size="sm" /><span><small>PAÍS DA BASE</small><strong>{academyCountry.name}</strong></span><b>⌄</b></button>
            <button type="button" onClick={randomClub}>⚄ Aleatório</button>
            <button type="button" className={styles.freeChoice} onClick={() => setAllClubsOpen(true)}>Escolher qualquer time</button>
          </header>
          <div className={styles.clubCards}>
            {academyClubs.map((club) => <button type="button" key={club.id} onClick={() => chooseClub(club.id)}><ClubBadge club={club} size="md" /><span><strong>{club.shortName}</strong><small>{club.city}</small></span><b>→</b></button>)}
          </div>
          <p className={styles.clubNote}>Ao escolher um clube, a sua formação de base é sorteada automaticamente e a simulação começa.</p>
        </div>
        {clubCountryPickerOpen && <Picker title="País da base" onClose={() => setClubCountryPickerOpen(false)}><div className={styles.pickerGrid}>{filteredClubCountries.map((country) => <button type="button" key={country.id} onClick={() => { setGame((current) => ({ ...current, academyCountryId: country.id, academyClubId: "" })); setClubCountryPickerOpen(false); }}><NationBadge country={country} size="sm" /><strong>{country.name}</strong></button>)}</div></Picker>}
        {allClubsOpen && <Picker title="Carreira personalizada" onClose={() => setAllClubsOpen(false)}><div className={styles.warning}><b>!</b><span><strong>Escolher qualquer clube desativa conquistas nesta carreira.</strong><small>A carreira continua normal; apenas achievements globais não serão concedidos.</small></span></div><input className={styles.search} autoFocus placeholder="Pesquisar clube" value={clubSearch} onChange={(event) => setClubSearch(event.target.value)} /><div className={styles.allClubs}>{allClubResults.map((club) => <button type="button" key={club.id} onClick={() => chooseClub(club.id, true)}><ClubBadge club={club} size="sm" /><span><strong>{club.shortName}</strong><small>{COUNTRIES.find((country) => country.id === club.countryId)?.name}</small></span></button>)}</div></Picker>}
      </section>
    );
  }

  return <section className={styles.page}><div className={styles.loading}>Preparando categorias de base…</div></section>;
}

function Picker({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className={styles.pickerOverlay} role="dialog" aria-modal="true" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className={styles.picker}><header><strong>{title}</strong><button type="button" onClick={onClose}>×</button></header>{children}</section></div>;
}

export function FirstContractV2({ game, onBack, onSign }: { game: GameState; onBack: () => void; onSign: (clubId: string) => void }) {
  const offers = game.proOffers.slice(0, 3);
  return (
    <section className={styles.page}>
      <SetupHeader step="PRIMEIRO CONTRATO" title="Quem aposta em você?" onBack={onBack} />
      <div className={styles.contractStage}>
        <span className={styles.kicker}>CHEGOU A HORA</span>
        <h1>Escolha a primeira camisa profissional.</h1>
        <div className={styles.contractOffers}>
          {offers.map((clubId, index) => {
            const club = clubById(clubId);
            return <button type="button" key={clubId} className={index === 0 ? styles.academyOffer : ""} onClick={() => onSign(clubId)}><ClubBadge club={club} size="lg" /><span><small>{index === 0 ? "CONTINUAR NA SUA BASE" : "NOVA PROPOSTA"}</small><strong>{club.name}</strong><em>{index === 0 ? "O caminho conhecido continua aberto." : index === 1 ? "Uma porta diferente para buscar minutos." : "Outro projeto quer apostar no seu começo."}</em></span><b>→</b></button>;
          })}
        </div>
      </div>
    </section>
  );
}
