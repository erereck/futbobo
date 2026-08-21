"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { Club, Country } from "../../game-data";
import { VERIFIED_CLUB_ASSET_IDS } from "../../verified-club-assets";
import type { CompetitionResult, GameState, TrophyCabinet } from "../../career/model";
import { awardFinalists, awardPresentation } from "../../career/state";
import { clamp, clubById } from "../../career/shared";
import FutboboIcon from "../FutboboIcon";

export function LocalBadgeImage({
  path,
  kind,
  onAvailabilityChange,
}: {
  path: string;
  kind: "club" | "flag" | "competition";
  onAvailabilityChange?: (available: boolean) => void;
}) {
  const [failedSource, setFailedSource] = useState("");
  const source = path.startsWith("data:") || /^https:\/\//i.test(path)
    ? path
    : `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;

  if (failedSource === source) return null;

  return (
    <Image
      className={`badge-image badge-image-${kind}`}
      src={source}
      alt=""
      fill
      sizes={kind === "club" ? "85px" : kind === "flag" ? "68px" : "34px"}
      unoptimized
      draggable={false}
      onLoad={() => onAvailabilityChange?.(true)}
      onError={() => {
        setFailedSource(source);
        onAvailabilityChange?.(false);
      }}
    />
  );
}

export function ClubBadge({ club, size = "md" }: { club: Club; size?: "sm" | "md" | "lg" }) {
  const [loadedClubId, setLoadedClubId] = useState("");
  const hasImage = loadedClubId === club.id;
  return (
    <span
      className={`club-badge club-badge-${size} ${hasImage ? "has-image" : "is-fallback"}`}
      style={{ "--club-primary": club.primary, "--club-secondary": club.secondary } as CSSProperties}
      aria-hidden="true"
    >
      <span className="badge-fallback">{club.abbr}</span>
      {(club.customBadge || VERIFIED_CLUB_ASSET_IDS.has(club.id)) && (
        <LocalBadgeImage
          path={club.customBadge || `/assets/clubs/${club.id}.png`}
          kind="club"
          onAvailabilityChange={(available) => setLoadedClubId(available ? club.id : "")}
        />
      )}
    </span>
  );
}

export function BrandMark({ size = "md" }: { size?: "sm" | "md" | "hero" }) {
  const pixels = size === "hero" ? 92 : size === "sm" ? 27 : 34;
  const source = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/favicon.svg`;
  return (
    <span className={`brand-mark brand-mark-${size}`} aria-hidden="true">
      <Image src={source} alt="" width={pixels} height={pixels} loading="eager" unoptimized draggable={false} />
    </span>
  );
}

export function NationBadge({ country, size = "md" }: { country: Country; size?: "sm" | "md" | "lg" }) {
  const [loadedCountryId, setLoadedCountryId] = useState("");
  const hasImage = loadedCountryId === country.id;
  return (
    <span
      className={`nation-badge nation-badge-${size} ${hasImage ? "has-image" : "is-fallback"}`}
      style={{ "--nation-primary": country.primary, "--nation-secondary": country.secondary } as CSSProperties}
      aria-hidden="true"
    >
      <span className="badge-fallback">{country.abbr}</span>
      <LocalBadgeImage path={`/assets/flags/${country.id}.png`} kind="flag" onAvailabilityChange={(available) => setLoadedCountryId(available ? country.id : "")} />
    </span>
  );
}

export function CompetitionBadge({ competition, leagueId }: { competition: CompetitionResult; leagueId: string }) {
  const [imageAvailable, setImageAvailable] = useState(false);
  const path = competition.id === "domesticLeague"
    ? `/assets/competitions/leagues/${leagueId}.png`
    : competition.id === "domesticCup"
      ? `/assets/competitions/cups/${leagueId}.png`
      : competition.id === "domesticSuperCup"
        ? `/assets/competitions/supercups/${leagueId}.png`
      : competition.id === "cafChampions"
        ? "/assets/competitions/cafChampions.svg"
      : `/assets/competitions/${competition.id}.png`;

  return (
    <span className={`competition-emblem ${imageAvailable ? "has-image" : "is-fallback"}`} aria-hidden="true">
      <b><FutboboIcon name="trophy" /></b>
      <LocalBadgeImage path={path} kind="competition" onAvailabilityChange={setImageAvailable} />
    </span>
  );
}

export const TROPHY_PRESENTATIONS: {
  id: keyof TrophyCabinet;
  label: string;
  shortLabel: string;
  group: "NACIONAIS" | "CONTINENTAIS" | "MUNDIAIS";
  imagePath?: string;
}[] = [
  { id: "domesticLeague", label: "Ligas nacionais", shortLabel: "LIGAS", group: "NACIONAIS" },
  { id: "domesticCup", label: "Copas nacionais", shortLabel: "COPAS", group: "NACIONAIS" },
  { id: "domesticSuperCup", label: "Supercopas nacionais", shortLabel: "SUP.", group: "NACIONAIS" },
  { id: "libertadores", label: "CONMEBOL Libertadores", shortLabel: "LIB", group: "CONTINENTAIS", imagePath: "/assets/competitions/libertadores.png" },
  { id: "sudamericana", label: "CONMEBOL Sudamericana", shortLabel: "SULA", group: "CONTINENTAIS" },
  { id: "recopaSudamericana", label: "Recopa Sul-Americana", shortLabel: "REC", group: "CONTINENTAIS", imagePath: "/assets/competitions/recopaSudamericana.png" },
  { id: "championsLeague", label: "Champions League", shortLabel: "UCL", group: "CONTINENTAIS", imagePath: "/assets/competitions/championsLeague.png" },
  { id: "uefaSuperCup", label: "Supercopa da UEFA", shortLabel: "USC", group: "CONTINENTAIS", imagePath: "/assets/competitions/uefaSuperCup.png" },
  { id: "europaLeague", label: "Europa League", shortLabel: "UEL", group: "CONTINENTAIS", imagePath: "/assets/competitions/europaLeague.png" },
  { id: "conferenceLeague", label: "Conference League", shortLabel: "UECL", group: "CONTINENTAIS", imagePath: "/assets/competitions/conferenceLeague.png" },
  { id: "concacafChampions", label: "Copa dos Campeões Concacaf", shortLabel: "CCC", group: "CONTINENTAIS", imagePath: "/assets/competitions/concacafChampions.png" },
  { id: "afcChampions", label: "AFC Champions League Elite", shortLabel: "ACL", group: "CONTINENTAIS", imagePath: "/assets/competitions/afcChampions.png" },
  { id: "cafChampions", label: "CAF Champions League", shortLabel: "CAF", group: "CONTINENTAIS", imagePath: "/assets/competitions/cafChampions.svg" },
  { id: "campeonesCup", label: "Campeones Cup", shortLabel: "CAM", group: "CONTINENTAIS", imagePath: "/assets/competitions/campeonesCup.png" },
  { id: "mundial", label: "Mundial de Clubes", shortLabel: "MUN", group: "MUNDIAIS", imagePath: "/assets/competitions/mundial.png" },
];

export function TrophyGallery({ state, final = false }: { state: GameState; final?: boolean }) {
  const totalClubTitles = Object.values(state.trophyCabinet).reduce((total, count) => total + count, 0);
  const recentTitles = state.history
    .flatMap((record) => record.competitions
      .filter((competition) => competition.champion)
      .map((competition) => ({ record, competition })))
    .reverse()
    .slice(0, final ? 12 : 6);

  return (
    <section className={`trophy-gallery ${final ? "trophy-gallery-final" : ""}`}>
      <header className="trophy-gallery-hero">
        <div>
          <span>{final ? "GALERIA DE TÍTULOS" : "SALA DE TROFÉUS"}</span>
          <strong>{totalClubTitles + state.nationalTrophies}</strong>
          <small>taças levantadas</small>
        </div>
        <b aria-hidden="true"><FutboboIcon name="trophy" /></b>
      </header>
      <div className="trophy-groups">
        {(["NACIONAIS", "CONTINENTAIS", "MUNDIAIS"] as const).map((group) => {
          const entries = TROPHY_PRESENTATIONS.filter((presentation) => presentation.group === group);
          const groupTotal = entries.reduce((total, presentation) => total + state.trophyCabinet[presentation.id], 0);
          return (
            <section className={groupTotal > 0 ? "has-titles" : ""} key={group}>
              <header><span>{group}</span><b>{groupTotal}</b></header>
              <div>
                {entries.map((presentation) => {
                  const count = state.trophyCabinet[presentation.id];
                  return (
                    <article className={count > 0 ? "won" : "empty"} key={presentation.id}>
                      <span className="trophy-medallion" aria-hidden="true">
                        <b><FutboboIcon name="trophy" /></b>
                        {presentation.imagePath && <LocalBadgeImage path={presentation.imagePath} kind="competition" />}
                      </span>
                      <div><strong>{presentation.label}</strong><small>{count > 0 ? `${count} conquista${count > 1 ? "s" : ""}` : "Ainda não conquistada"}</small></div>
                      <b>{count}</b>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
        <section className={state.nationalTrophies > 0 ? "has-titles national-trophy-group" : "national-trophy-group"}>
          <header><span>SELEÇÃO</span><b>{state.nationalTrophies}</b></header>
          <div>
            <article className={state.nationalTrophies > 0 ? "won" : "empty"}>
              <span className="trophy-medallion national" aria-hidden="true"><FutboboIcon name="medal" /></span>
              <div><strong>Títulos pela Seleção</strong><small>{state.nationalTrophies > 0 ? `${state.nationalTrophies} conquista${state.nationalTrophies > 1 ? "s" : ""}` : "O país ainda espera sua taça"}</small></div>
              <b>{state.nationalTrophies}</b>
            </article>
            {state.nationalHistory.filter((record) => record.champion).slice().reverse().map((record) => (
              <article className="won national-title-detail" key={`${record.season}-${record.name}`}>
                <span className="trophy-medallion national" aria-hidden="true">{record.icon}</span>
                <div><strong>{record.name}</strong><small>{record.season} · {record.tier === "main" ? "Seleção principal" : record.tier === "olympic" ? "Seleção olímpica" : record.tier === "sub20" ? "Seleção Sub-20" : "Seleção Sub-17"}</small></div>
                <b><FutboboIcon name="trophy" /></b>
              </article>
            ))}
          </div>
        </section>
      </div>
      {!final && recentTitles.length > 0 && (
        <div className="recent-titles">
          <header><span>ÚLTIMAS VOLTAS OLÍMPICAS</span><small>{recentTitles.length} mais recentes</small></header>
          <div>
            {recentTitles.map(({ record, competition }, index) => {
              const titleClub = clubById(record.clubId);
              return (
                <article key={`${record.season}-${record.clubId}-${competition.id}-${index}`}>
                  <CompetitionBadge competition={competition} leagueId={titleClub.leagueId} />
                  <div><strong>{competition.name}</strong><small>{record.season} · {titleClub.shortName}</small></div>
                  <b>CAMPEÃO</b>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export function Metric({ label, value, tone = "default" }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className={`metric metric-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function AwardReveal({ award }: { award: string }) {
  const presentation = awardPresentation(award);
  return (
    <article className={`award-reveal-card award-${presentation.tier}`}>
      <span className="award-reveal-icon">{presentation.icon}</span>
      <div>
        <small>{presentation.kicker}</small>
        <strong>{award}</strong>
        <p>{presentation.description}</p>
      </div>
      <b>{presentation.tier === "legendary" ? "MELHOR DO MUNDO" : "CONQUISTADO"}</b>
    </article>
  );
}

export function AwardCeremony({
  award,
  playerName,
  seed,
  season,
  won,
  winner,
  finalists: providedFinalists,
}: {
  award: string;
  playerName: string;
  seed: number;
  season: number;
  won: boolean;
  winner: string;
  finalists?: string[];
}) {
  const [revealed, setRevealed] = useState(false);
  const presentation = awardPresentation(award);
  const finalists = useMemo(
    () => providedFinalists?.length === 3 ? providedFinalists : awardFinalists(playerName, award, seed, season),
    [providedFinalists, playerName, award, seed, season],
  );
  const revealedWinner = won ? playerName : winner;

  return (
    <article className={`award-ceremony award-${presentation.tier} ${revealed ? "revealed" : ""}`}>
      <div className="award-ceremony-top">
        <span>{presentation.icon}</span>
        <div><small>OS TRÊS FINALISTAS</small><strong>{award}</strong></div>
      </div>
      {!revealed ? (
        <>
          <div className="award-finalists">
            {finalists.map((name, index) => (
              <div className={name === playerName ? "is-player" : ""} key={name}>
                <b>0{index + 1}</b><span>{name}</span>{name === playerName && <small>VOCÊ</small>}
              </div>
            ))}
          </div>
          <p>O envelope está nas mãos do apresentador.</p>
          <button type="button" onClick={() => setRevealed(true)}>Revelar vencedor <span>→</span></button>
        </>
      ) : (
        <div className="award-winner-reveal">
          <small>O VENCEDOR É...</small>
          <strong>{revealedWinner}</strong>
          {won ? (
            <AwardReveal award={award} />
          ) : (
            <div className="award-near-miss">
              <span>TOP 3 DO MUNDO</span>
              <strong>Você chegou à final</strong>
              <p>Seu nome esteve no envelope até o último instante. Desta vez, {revealedWinner} levou o prêmio.</p>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export function Progress({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="progress-stat">
      <div className="progress-label"><span>{label}</span><strong>{Math.round(value)}</strong></div>
      <div className="progress-track"><span style={{ width: `${clamp(value)}%`, background: color }} /></div>
    </div>
  );
}
