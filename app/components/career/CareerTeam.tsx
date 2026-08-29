"use client";

import type { GameState } from "../../career/model";
import type { TeamSquadMember, TeamSquadView } from "../../career/team-roster";
import { buildClubSquad, buildNationalSquad } from "../../career/team-roster";
import { clubById } from "../../career/shared";
import { ROLE_LABELS } from "../../career-systems";
import { teamKitPattern } from "../../player-appearance";
import { PlayerAppearancePortrait } from "../../PlayerAppearanceEditor";
import { ClubBadge, NationBadge } from "./CareerPrimitives";
import styles from "./CareerTeam.module.css";

function PlayerChip({ member }: { member: TeamSquadMember }) {
  return (
    <article className={styles.playerChip} data-you={member.isProtagonist || undefined}>
      <span className={styles.position}>{member.position}</span>
      <strong>{member.name}</strong>
      <small>{member.age} anos</small>
      <b>{member.overall}</b>
      {member.isProtagonist ? <em>VOCÊ</em> : null}
    </article>
  );
}

function Pitch({ squad }: { squad: TeamSquadView }) {
  return (
    <div className={styles.pitch}>
      <div className={styles.midCircle} aria-hidden="true" />
      <div className={styles.boxTop} aria-hidden="true" />
      <div className={styles.boxBottom} aria-hidden="true" />
      {squad.lines.map((line) => (
        <div className={styles.pitchLine} data-line={line.id} key={line.id}>
          {line.members.map((member) => <PlayerChip key={member.id} member={member} />)}
        </div>
      ))}
    </div>
  );
}

function Bench({ squad }: { squad: TeamSquadView }) {
  const free = Math.max(0, squad.reserveCapacity - squad.bench.length);
  return (
    <section className={styles.benchSection}>
      <header><span>BANCO</span><strong>{squad.bench.length}/{squad.reserveCapacity} VAGAS USADAS</strong></header>
      <div className={styles.benchGrid}>
        {squad.bench.map((member) => <PlayerChip key={member.id} member={member} />)}
        {Array.from({ length: free }, (_, index) => <div className={styles.emptySlot} key={index}><b>＋</b><span>VAGA LIVRE</span><small>espaço para contratação</small></div>)}
      </div>
    </section>
  );
}

export default function CareerTeam({ state }: { state: GameState }) {
  const club = clubById(state.currentClubId || state.academyClubId);
  const clubSquad = buildClubSquad(state);
  const national = buildNationalSquad(state);
  const role = ROLE_LABELS[state.squadRole];

  return (
    <div className={`${styles.screen} screen-enter`}>
      <header className={styles.hero}>
        <div className={styles.portraitFrame}>
          <PlayerAppearancePortrait
            appearance={{ ...state.playerAppearance, kitPattern: teamKitPattern(state.seed, club.id) }}
            primary={club.primary}
            secondary={club.secondary}
            size={84}
            label={`Visual de ${state.name}`}
          />
          <span>VOCÊ · #{state.number}</span>
        </div>

        <div className={styles.identity}>
          <span className={styles.heroKicker}>TIME ATUAL</span>
          <div className={styles.clubLine}>
            <ClubBadge club={club} size="md" />
            <div>
              <h2>{club.shortName}</h2>
              <p>{state.season} · {clubSquad.formation}</p>
            </div>
          </div>
          <div className={styles.roleLine}><b>{role}</b><span>{state.position} · {state.overall} OVR</span></div>
        </div>

        <div className={styles.heroMetric}><small>OVR XI</small><strong>{clubSquad.averageOverall}</strong></div>
      </header>

      <section className={styles.sectionHeading}><div><span>ONZE INICIAL</span><h3>Quem entra em campo com você</h3></div><small>Os companheiros pertencem ao universo da carreira: evoluem, envelhecem e podem trocar de clube.</small></section>
      <Pitch squad={clubSquad} />
      <Bench squad={clubSquad} />

      {national ? (
        <section className={styles.nationalBlock}>
          <header className={styles.nationalHero}>
            <NationBadge country={national.country} size="lg" />
            <div><span>SELEÇÃO · {national.label}</span><h3>{national.country.name}</h3><p>{state.nationalCaps} jogos · {state.nationalGoals} gols · {state.nationalAssists} assistências</p></div>
            <strong>{national.squad.averageOverall}<small>OVR XI</small></strong>
          </header>
          <Pitch squad={national.squad} />
          <Bench squad={national.squad} />
        </section>
      ) : (
        <section className={styles.callupEmpty}><span>SELEÇÃO</span><strong>Seu nome ainda não está numa convocação ativa.</strong><p>Quando você entrar em uma lista, a equipe nacional aparece aqui junto do seu clube.</p></section>
      )}
    </div>
  );
}
