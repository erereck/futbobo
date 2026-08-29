"use client";

import type { GameState } from "../../career/model";
import type { TeamSquadMember, TeamSquadView } from "../../career/team-roster";
import { buildClubSquad, buildNationalSquad } from "../../career/team-roster";
import { clubById } from "../../career/shared";
import { ROLE_LABELS } from "../../career-systems";
import { ClubBadge, NationBadge } from "./CareerPrimitives";
import styles from "./CareerTeam.module.css";

function PlayerChip({ member }: { member: TeamSquadMember }) {
  return (
    <article className={styles.playerChip} data-you={member.isProtagonist || undefined}>
      <div className={styles.playerTopline}>
        <span className={styles.position}>{member.position}</span>
        <b className={styles.overall}>{member.overall}</b>
      </div>
      <div className={styles.playerIdentity}>
        <strong>{member.name}</strong>
        <small>{member.age} anos</small>
      </div>
      {member.isProtagonist ? <em>VOCÊ</em> : null}
    </article>
  );
}

function Pitch({ squad, label = "TIME TITULAR" }: { squad: TeamSquadView; label?: string }) {
  return (
    <div className={styles.pitchWrap}>
      <div className={styles.pitchHeader}>
        <span>{label}</span>
        <div><b>{squad.formation}</b><small>FORMAÇÃO</small></div>
      </div>
      <div className={styles.pitch}>
        <div className={styles.midCircle} aria-hidden="true" />
        <div className={styles.centerSpot} aria-hidden="true" />
        <div className={styles.boxTop} aria-hidden="true" />
        <div className={styles.boxBottom} aria-hidden="true" />
        {squad.lines.map((line) => (
          <div className={styles.pitchLine} data-line={line.id} key={line.id}>
            {line.members.map((member) => <PlayerChip key={member.id} member={member} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function Bench({ squad }: { squad: TeamSquadView }) {
  const free = Math.max(0, squad.reserveCapacity - squad.bench.length);
  return (
    <section className={styles.benchSection}>
      <header>
        <div><span>BANCO</span><strong>Opções para mudar o jogo</strong></div>
        <b>{squad.bench.length}<small>/{squad.reserveCapacity}</small></b>
      </header>
      <div className={styles.benchGrid}>
        {squad.bench.map((member) => <PlayerChip key={member.id} member={member} />)}
        {Array.from({ length: free }, (_, index) => (
          <div className={styles.emptySlot} key={index}>
            <b>＋</b><span>VAGA LIVRE</span><small>espaço disponível</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function SquadSummary({ squad, role, protagonist }: { squad: TeamSquadView; role: string; protagonist: TeamSquadMember | undefined }) {
  return (
    <section className={styles.summaryStrip} aria-label="Resumo do elenco">
      <div><small>OVR XI</small><strong>{squad.averageOverall}</strong><span>nível do time</span></div>
      <div><small>FORMAÇÃO</small><strong>{squad.formation}</strong><span>estrutura base</span></div>
      <div><small>SEU PAPEL</small><strong>{role}</strong><span>{protagonist ? `${protagonist.position} · ${protagonist.overall} OVR` : "fora do XI"}</span></div>
    </section>
  );
}

export default function CareerTeam({ state }: { state: GameState }) {
  const club = clubById(state.currentClubId || state.academyClubId);
  const clubSquad = buildClubSquad(state);
  const national = buildNationalSquad(state);
  const protagonist = [...clubSquad.starters, ...clubSquad.bench].find((member) => member.isProtagonist);
  const role = ROLE_LABELS[state.squadRole];

  return (
    <div className={`${styles.screen} screen-enter`}>
      <header className={styles.hero}>
        <div className={styles.heroGlow} aria-hidden="true" />
        <div className={styles.identity}>
          <div className={styles.crest}><ClubBadge club={club} size="lg" /></div>
          <div className={styles.identityCopy}>
            <span>VESTIÁRIO · {state.season}</span>
            <h2>{club.shortName}</h2>
            <p>{clubSquad.formation} · {role} · {clubSquad.starters.length} titulares</p>
          </div>
        </div>
        <div className={styles.heroMetric}>
          <small>FORÇA DO XI</small>
          <strong>{clubSquad.averageOverall}</strong>
          <span>OVR</span>
        </div>
      </header>

      <SquadSummary squad={clubSquad} role={role} protagonist={protagonist} />

      <section className={styles.sectionHeading}>
        <div><span>ONZE INICIAL</span><h3>Seu time em campo</h3></div>
        <small>O elenco evolui, envelhece e muda de clube junto com o resto do universo da carreira.</small>
      </section>
      <Pitch squad={clubSquad} />
      <Bench squad={clubSquad} />

      {national ? (
        <section className={styles.nationalBlock}>
          <header className={styles.nationalHero}>
            <div className={styles.nationIdentity}>
              <div className={styles.nationBadge}><NationBadge country={national.country} size="lg" /></div>
              <div><span>SELEÇÃO · {national.label}</span><h3>{national.country.name}</h3><p>{state.nationalCaps} jogos · {state.nationalGoals} gols · {state.nationalAssists} assistências</p></div>
            </div>
            <strong>{national.squad.averageOverall}<small>OVR XI</small></strong>
          </header>
          <Pitch squad={national.squad} label={`XI · ${national.country.name.toUpperCase()}`} />
          <Bench squad={national.squad} />
        </section>
      ) : (
        <section className={styles.callupEmpty}>
          <div className={styles.callupIcon}>◎</div>
          <div><span>SELEÇÃO</span><strong>A convocação ainda não chegou.</strong><p>Quando seu nome entrar em uma lista, a equipe nacional passa a aparecer aqui ao lado do clube.</p></div>
        </section>
      )}
    </div>
  );
}
