"use client";

import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { COUNTRIES } from "../../game-data";
import type { GameState } from "../../career/model";
import type { TeamSquadMember, TeamSquadView } from "../../career/team-roster";
import { buildClubSquad, buildNationalSquad } from "../../career/team-roster";
import { clubById } from "../../career/shared";
import { careerSquadAppearance, teamKitPattern } from "../../player-appearance";
import { PlayerAppearancePortrait } from "../../PlayerAppearanceEditor";
import FutboboIcon from "../FutboboIcon";
import { ClubBadge, NationBadge } from "./CareerPrimitives";
import styles from "./CareerTeam.module.css";

type TeamMode = "club" | "national";

function portraitFor(member: TeamSquadMember, state: GameState, teamId: string) {
  const kitPattern = teamKitPattern(state.seed, teamId);
  if (member.isProtagonist) return { ...state.playerAppearance, kitPattern };
  return careerSquadAppearance({
    seed: state.seed,
    memberId: member.id,
    teamId,
    nationality: member.nationality,
  });
}

function PlayerPortrait({
  member,
  state,
  teamId,
  primary,
  secondary,
  size,
}: {
  member: TeamSquadMember;
  state: GameState;
  teamId: string;
  primary: string;
  secondary: string;
  size: number;
}) {
  const appearance = useMemo(
    () => portraitFor(member, state, teamId),
    [member, state, teamId],
  );

  return (
    <PlayerAppearancePortrait
      appearance={appearance}
      primary={primary}
      secondary={secondary}
      size={size}
      label={`Retrato de ${member.name}`}
    />
  );
}

function PlayerPiece({
  member,
  index,
  state,
  teamId,
  primary,
  secondary,
}: {
  member: TeamSquadMember;
  index: number;
  state: GameState;
  teamId: string;
  primary: string;
  secondary: string;
}) {
  return (
    <article className={styles.playerPiece} data-slot={index} data-you={member.isProtagonist || undefined}>
      <div className={styles.piecePortrait}>
        <PlayerPortrait member={member} state={state} teamId={teamId} primary={primary} secondary={secondary} size={74} />
        <span className={styles.positionBadge}>{member.position}</span>
        <b className={styles.overallBadge}>{member.overall}</b>
      </div>
      <div className={styles.pieceName}>
        <strong>{member.isProtagonist ? "VOCÊ" : member.name}</strong>
        <small>{member.isProtagonist ? member.name : `${member.age} anos`}</small>
      </div>
    </article>
  );
}

function Pitch({
  squad,
  state,
  teamId,
  primary,
  secondary,
}: {
  squad: TeamSquadView;
  state: GameState;
  teamId: string;
  primary: string;
  secondary: string;
}) {
  return (
    <section className={styles.pitch} aria-label={`Formação de cinco jogadores, ${squad.formation}`}>
      <div className={styles.pitchOutline} aria-hidden="true" />
      <div className={styles.midLine} aria-hidden="true" />
      <div className={styles.midCircle} aria-hidden="true" />
      <div className={styles.goalAreaTop} aria-hidden="true" />
      <div className={styles.goalAreaBottom} aria-hidden="true" />
      <div className={styles.pieceFormation}>
        {squad.starters.map((member, index) => (
          <PlayerPiece
            key={member.id}
            member={member}
            index={index}
            state={state}
            teamId={teamId}
            primary={primary}
            secondary={secondary}
          />
        ))}
      </div>
      <footer className={styles.pitchFooter}>
        <span><FutboboIcon name="team" /> 5 EM CAMPO</span>
        <strong>DIAMANTE · {squad.formation}</strong>
      </footer>
    </section>
  );
}

function Bench({
  squad,
  state,
  teamId,
  primary,
  secondary,
}: {
  squad: TeamSquadView;
  state: GameState;
  teamId: string;
  primary: string;
  secondary: string;
}) {
  return (
    <aside className={styles.benchSection}>
      <header>
        <div><span>BANCO</span><strong>Três opções para mudar a partida</strong></div>
        <b>{squad.bench.length}/3</b>
      </header>
      <div className={styles.benchList}>
        {squad.bench.map((member, index) => (
          <article className={styles.benchPlayer} data-you={member.isProtagonist || undefined} key={member.id}>
            <span className={styles.benchNumber}>0{index + 1}</span>
            <div className={styles.benchPortrait}>
              <PlayerPortrait member={member} state={state} teamId={teamId} primary={primary} secondary={secondary} size={54} />
            </div>
            <div className={styles.benchIdentity}>
              <small>{member.position} · {member.age} ANOS</small>
              <strong>{member.isProtagonist ? "VOCÊ" : member.name}</strong>
              {member.isProtagonist ? <span>{member.name}</span> : null}
            </div>
            <b className={styles.benchOverall}>{member.overall}<small>OVR</small></b>
          </article>
        ))}
      </div>
      <p><FutboboIcon name="history" /> O banco acompanha transferências, evolução e idade do universo da carreira.</p>
    </aside>
  );
}

function TeamOption({
  active,
  disabled,
  badge,
  eyebrow,
  label,
  overall,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  badge: ReactNode;
  eyebrow: string;
  label: string;
  overall?: number;
  onClick: () => void;
}) {
  return (
    <button type="button" className={active ? styles.activeOption : ""} aria-pressed={active} disabled={disabled} onClick={onClick}>
      {badge}
      <span className={styles.optionCopy}><small>{eyebrow}</small><strong>{label}</strong></span>
      <span className={styles.optionOverall}><small>OVR 5</small><b>{overall ?? "—"}</b></span>
    </button>
  );
}

export default function CareerTeam({ state }: { state: GameState }) {
  const [mode, setMode] = useState<TeamMode>("club");
  const club = clubById(state.currentClubId || state.academyClubId);
  const clubSquad = useMemo(() => buildClubSquad(state), [state]);
  const national = useMemo(() => buildNationalSquad(state), [state]);
  const country = COUNTRIES.find((candidate) => candidate.id === state.nationality) ?? COUNTRIES[0];
  const nationalActive = mode === "national" && Boolean(national);

  const squad = nationalActive ? national!.squad : clubSquad;
  const teamId = nationalActive ? `national-${national!.country.id}` : club.id;
  const primary = nationalActive ? national!.country.primary : club.primary;
  const secondary = nationalActive ? national!.country.secondary : club.secondary;

  const teamStyle = {
    "--team-primary": primary,
    "--team-secondary": secondary,
  } as CSSProperties;

  return (
    <div className={`${styles.screen} screen-enter`} style={teamStyle}>
      <header className={styles.screenIntro}>
        <div><span>ESQUADRÃO</span><h2>Sua equipe na mesa</h2><p>Cinco titulares. Três reservas. Os mesmos nomes que crescem com a sua carreira.</p></div>
        <strong><b>5</b><small>BOTÕES</small></strong>
      </header>

      <nav className={styles.teamSwitcher} aria-label="Alternar entre clube e seleção">
        <TeamOption
          active={!nationalActive}
          badge={<ClubBadge club={club} size="sm" />}
          eyebrow="CLUBE"
          label={club.shortName}
          overall={clubSquad.averageOverall}
          onClick={() => setMode("club")}
        />
        <TeamOption
          active={nationalActive}
          disabled={!national}
          badge={<NationBadge country={national?.country ?? country} size="sm" />}
          eyebrow={national ? "SELEÇÃO" : "SEM CONVOCAÇÃO"}
          label={national?.country.name ?? country.name}
          overall={national?.squad.averageOverall}
          onClick={() => setMode("national")}
        />
      </nav>

      <section className={styles.squadLayout} aria-label="Escalação e banco de reservas">
        <div className={styles.pitchColumn}>
          <header className={styles.sectionHeading}>
            <div><span>ESCALAÇÃO</span><h3>Os cinco da partida</h3></div>
            <small>Seu jogador aparece entre os titulares quando a função no elenco garante a vaga.</small>
          </header>
          <Pitch squad={squad} state={state} teamId={teamId} primary={primary} secondary={secondary} />
        </div>
        <Bench squad={squad} state={state} teamId={teamId} primary={primary} secondary={secondary} />
      </section>
    </div>
  );
}
