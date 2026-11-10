"use client";

import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Club, Country } from "../../../../game-data";
import { COUNTRIES } from "../../../../game-data";
import type { GameState } from "../../../../career/model";
import type { TeamSquadMember } from "../../../../career/team-roster";
import { buildClubSquad, buildNationalSquad } from "../../../../career/team-roster";
import { careerSquadAppearance, teamKitPattern } from "../../../../player-appearance";
import { ClubBadge, NationBadge } from "../../CareerPrimitives";
import { AlbumPage } from "../AlbumShell";
import { BlockTitle, Ficha, InkBand, StickerBust } from "../primitives";
import { clubInks } from "../inks";
import styles from "./teamTab.module.css";

type TeamMode = "club" | "national";

/** Mesmo retrato da mesa: o protagonista com o próprio visual, os companheiros gerados pelo universo. */
function appearanceFor(member: TeamSquadMember, game: GameState, teamId: string) {
  const kitPattern = teamKitPattern(game.seed, teamId);
  if (member.isProtagonist) return { ...game.playerAppearance, kitPattern };
  return careerSquadAppearance({ seed: game.seed, memberId: member.id, teamId, nationality: member.nationality });
}

const sentence = (label: string) => label ? label.charAt(0) + label.slice(1).toLocaleLowerCase("pt-BR") : label;

const TILTS = ["-2.2deg", "1.6deg", "-1.2deg", "2deg", "-1.6deg"];

/** Figurinha de um jogador do time (campo ou banco), nas cores do time escolhido. */
function TeamSticker({
  member,
  game,
  teamId,
  primary,
  secondary,
  badge,
  variant,
  tilt,
  style,
  className,
}: {
  member: TeamSquadMember;
  game: GameState;
  teamId: string;
  primary: string;
  secondary: string;
  badge: ReactNode;
  variant: "pitch" | "bench";
  tilt: string;
  style?: CSSProperties;
  className?: string;
}) {
  const appearance = useMemo(() => appearanceFor(member, game, teamId), [member, game, teamId]);
  return (
    <figure
      className={`${styles.sticker} ${className ?? ""}`}
      data-variant={variant}
      data-you={member.isProtagonist ? "" : undefined}
      style={{ "--tilt": tilt, ...style } as CSSProperties}
      aria-label={`${member.isProtagonist ? "Você, " : ""}${member.name}, ${member.position}, ${member.age} anos, OVR ${member.overall}`}
    >
      <div className={styles.face}>
        <div className={styles.art}>
          <StickerBust className={styles.bust} appearance={appearance} primary={primary} secondary={secondary} />
          <span className={styles.pos} aria-hidden="true">{member.position}</span>
          <span className={styles.ovr} aria-hidden="true"><b>{member.overall}</b></span>
          <span className={styles.badge} aria-hidden="true">{badge}</span>
        </div>
        <figcaption className={styles.caption}>
          <strong>{member.name}</strong>
          {variant === "bench" && <span>{member.position}, {member.age} anos</span>}
        </figcaption>
        <span className={styles.gloss} aria-hidden="true" />
      </div>
      {member.isProtagonist && <span className={styles.youTag} aria-hidden="true">Você</span>}
    </figure>
  );
}

function TeamCover({ active, disabled, badge, kicker, label, overall, onClick }: { active: boolean; disabled?: boolean; badge: ReactNode; kicker: string; label: string; overall?: number; onClick: () => void }) {
  return (
    <button type="button" className={styles.cover} aria-pressed={active} disabled={disabled} onClick={onClick}>
      <span className={styles.coverBadge} aria-hidden="true">{badge}</span>
      <span className={styles.coverCopy}><small>{kicker}</small><strong>{label}</strong></span>
      <span className={styles.coverOvr}><b>{overall ?? "—"}</b><small>OVR</small></span>
    </button>
  );
}

/** Aba Time: a página do time no álbum — os cinco no campo, os três do banco, clube ou seleção. */
export default function TeamTab({ game, club }: { game: GameState; club: Club }) {
  const [mode, setMode] = useState<TeamMode>("club");
  const clubSquad = useMemo(() => buildClubSquad(game), [game]);
  const national = useMemo(() => buildNationalSquad(game), [game]);
  const homeCountry: Country = COUNTRIES.find((candidate) => candidate.id === game.nationality) ?? COUNTRIES[0];
  const nationalActive = mode === "national" && Boolean(national);

  const squad = nationalActive && national ? national.squad : clubSquad;
  const teamId = nationalActive && national ? `national-${national.country.id}` : club.id;
  const primary = nationalActive && national ? national.country.primary : club.primary;
  const secondary = nationalActive && national ? national.country.secondary : club.secondary;
  const inks = clubInks(primary, secondary);
  const badge = nationalActive && national
    ? <NationBadge country={national.country} size="sm" />
    : <ClubBadge club={club} size="sm" />;
  const benchAverage = squad.bench.length ? Math.round(squad.bench.reduce((sum, member) => sum + member.overall, 0) / squad.bench.length) : 0;
  const youStart = squad.starters.some((member) => member.isProtagonist);
  const teamName = nationalActive && national ? national.country.name : club.shortName;
  const tierLabel = national ? sentence(national.label) : "";

  return (
    <>
      {/* ───────────── página do campo ───────────── */}
      <AlbumPage side="left" label={`Time: ${teamName}`}>
        <div className={styles.inner} style={inks}>
          <InkBand
            ink="red"
            title={teamName}
            subtitle={nationalActive && national ? tierLabel : `${club.city}, os cinco da mesa`}
            crest={nationalActive && national ? { country: national.country } : { club }}
            aside={<span className={styles.avg} aria-label={`Média dos titulares ${squad.averageOverall}`}><b>{squad.averageOverall}</b><small>OVR 5</small></span>}
          />

          <nav className={styles.covers} aria-label="Clube ou seleção">
            <TeamCover
              active={!nationalActive}
              badge={<ClubBadge club={club} size="sm" />}
              kicker="Clube"
              label={club.shortName}
              overall={clubSquad.averageOverall}
              onClick={() => setMode("club")}
            />
            <TeamCover
              active={nationalActive}
              disabled={!national}
              badge={<NationBadge country={national?.country ?? homeCountry} size="sm" />}
              kicker={national ? tierLabel : "Sem convocação"}
              label={national?.country.name ?? homeCountry.name}
              overall={national?.squad.averageOverall}
              onClick={() => setMode("national")}
            />
          </nav>

          <section className={styles.pitch} aria-label={`Escalação em diamante, ${squad.formation}`}>
            <span className={styles.lines} aria-hidden="true">
              <i className={styles.mid} /><i className={styles.circle} /><i className={styles.boxTop} /><i className={styles.boxBottom} />
            </span>
            {squad.starters.map((member, index) => (
              <TeamSticker
                key={member.id}
                className={styles.onPitch}
                member={member}
                game={game}
                teamId={teamId}
                primary={primary}
                secondary={secondary}
                badge={badge}
                variant="pitch"
                tilt={TILTS[index % TILTS.length]}
                style={{ "--slot": index } as CSSProperties}
              />
            ))}
            <p className={styles.formation}>Diamante, {squad.formation}</p>
          </section>
        </div>
      </AlbumPage>

      {/* ───────────── página do banco ───────────── */}
      <AlbumPage side="right" label="Banco de reservas">
        <div className={styles.inner} style={inks}>
          <header className={styles.benchHead}>
            <h2>Banco de reservas</h2>
          </header>

          <div className={styles.bench}>
            {squad.bench.map((member, index) => (
              <TeamSticker
                key={member.id}
                member={member}
                game={game}
                teamId={teamId}
                primary={primary}
                secondary={secondary}
                badge={badge}
                variant="bench"
                tilt={TILTS[(index + 2) % TILTS.length]}
              />
            ))}
            {Array.from({ length: Math.max(0, 3 - squad.bench.length) }, (_, index) => (
              <span key={`vazio-${index}`} className={styles.emptySlot} aria-hidden="true"><b>{squad.bench.length + index + 1}</b></span>
            ))}
          </div>

          <section className={styles.roster} aria-labelledby="time-campo">
            <BlockTitle id="time-campo">Em campo</BlockTitle>
            <ol>
              {squad.starters.map((member) => (
                <li key={member.id} data-you={member.isProtagonist ? "" : undefined}>
                  <b>{member.position}</b>
                  <strong>{member.name}{member.isProtagonist && <em>você</em>}</strong>
                  <span>{member.age} anos</span>
                  <i>{member.overall}</i>
                </li>
              ))}
            </ol>
          </section>

          <section className={styles.summary} aria-labelledby="time-ficha">
            <BlockTitle id="time-ficha">Ficha do time</BlockTitle>
            <Ficha
              rows={[
                { label: "Formação", value: `Diamante (${squad.formation})` },
                { label: "Média dos titulares", value: squad.averageOverall },
                { label: "Média do banco", value: benchAverage || "—" },
                { label: "Você", value: youStart ? "Entre os cinco" : "No banco" },
                ...(nationalActive && national ? [{ label: "Convocação", value: tierLabel }] : []),
              ]}
            />
            <p className={styles.note}>{youStart ? "Sua função no elenco garante a vaga entre os cinco." : "Você entra entre os cinco quando a função no elenco garante a vaga."}</p>
          </section>
        </div>
      </AlbumPage>
    </>
  );
}
