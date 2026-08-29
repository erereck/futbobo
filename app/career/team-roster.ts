import { COUNTRIES, POSITIONS } from "../game-data";
import type { PositionKey } from "../game-data";
import type { GameState, NationalTier } from "./model";
import type { WorldPlayer } from "./world-player-model";
import { positionByKey } from "./academy";
import { clamp, seeded } from "./shared";
import { ensureClubSquadPlayers, worldPlayersAtClub } from "./world-players";
import { worldPlayerNameForNationality } from "./world-player-name-pools";

export type TeamSquadMember = {
  id: string;
  name: string;
  position: PositionKey;
  overall: number;
  age: number;
  nationality: string;
  isProtagonist: boolean;
  worldPlayerId?: string;
};

export type TeamPitchLine = {
  id: "attack" | "midfield" | "defense" | "keeper";
  members: TeamSquadMember[];
};

export type TeamSquadView = {
  starters: TeamSquadMember[];
  lines: TeamPitchLine[];
  bench: TeamSquadMember[];
  reserveCapacity: 3;
  averageOverall: number;
  formation: string;
};

const STARTER_TEMPLATE: PositionKey[] = ["GOL", "LD", "ZAG", "ZAG", "LE", "VOL", "MC", "MEI", "PD", "CA", "PE"];
const NATIONAL_TIER_LABELS: Record<NationalTier, string> = {
  none: "",
  sub17: "SUB-17",
  sub20: "SUB-20",
  olympic: "OLÍMPICA",
  main: "PRINCIPAL",
};

function protagonist(state: GameState): TeamSquadMember {
  return {
    id: "protagonist",
    name: state.name || "Você",
    position: state.position,
    overall: state.overall,
    age: state.age,
    nationality: state.nationality,
    isProtagonist: true,
  };
}

function fromWorldPlayer(player: WorldPlayer, season: number): TeamSquadMember {
  return {
    id: player.id,
    worldPlayerId: player.id,
    name: player.name,
    position: player.position,
    overall: player.overall,
    age: Math.max(16, season - player.birthSeason),
    nationality: player.nationality,
    isProtagonist: false,
  };
}

function fitScore(member: TeamSquadMember, desired: PositionKey) {
  if (member.position === desired) return 0;
  const source = positionByKey(member.position);
  const target = positionByKey(desired);
  if (source.zone === target.zone) return 8 - member.overall / 100;
  if ((source.zone === "meio" && target.zone === "ataque") || (source.zone === "ataque" && target.zone === "meio")) return 17;
  if ((source.zone === "defesa" && target.zone === "meio") || (source.zone === "meio" && target.zone === "defesa")) return 18;
  return 32;
}

function chooseLineup(pool: TeamSquadMember[], forcedStarter?: TeamSquadMember) {
  const remaining = pool.filter((member) => !forcedStarter || member.id !== forcedStarter.id);
  const starters: TeamSquadMember[] = [];
  let forcedUsed = false;
  for (const desired of STARTER_TEMPLATE) {
    if (forcedStarter && !forcedUsed) {
      const exact = forcedStarter.position === desired;
      const sameZone = positionByKey(forcedStarter.position).zone === positionByKey(desired).zone;
      if (exact || sameZone || STARTER_TEMPLATE.filter((slot) => slot === forcedStarter.position).length === 0) {
        starters.push(forcedStarter);
        forcedUsed = true;
        continue;
      }
    }
    const candidate = [...remaining]
      .filter((member) => !starters.some((starter) => starter.id === member.id))
      .sort((a, b) => fitScore(a, desired) - fitScore(b, desired) || b.overall - a.overall || a.id.localeCompare(b.id))[0];
    if (candidate) starters.push(candidate);
  }
  if (forcedStarter && !forcedUsed && starters.length) {
    const replaceIndex = starters
      .map((member, index) => ({ member, index, score: fitScore(member, forcedStarter.position) }))
      .sort((a, b) => a.score - b.score || a.member.overall - b.member.overall)[0]?.index ?? starters.length - 1;
    starters[replaceIndex] = forcedStarter;
  }
  return starters.slice(0, 11);
}

function buildLines(starters: TeamSquadMember[]): TeamPitchLine[] {
  const take = (zone: ReturnType<typeof positionByKey>["zone"]) => starters.filter((member) => positionByKey(member.position).zone === zone);
  const keeper = take("gol");
  const defense = take("defesa");
  const midfield = take("meio");
  const attack = take("ataque");
  return [
    { id: "attack", members: attack },
    { id: "midfield", members: midfield },
    { id: "defense", members: defense },
    { id: "keeper", members: keeper },
  ];
}

function finishView(state: GameState, available: TeamSquadMember[], forceUserStarter: boolean, benchSeed: number): TeamSquadView {
  const user = protagonist(state);
  const starterPool = forceUserStarter ? [...available, user] : available;
  const starters = chooseLineup(starterPool, forceUserStarter ? user : undefined);
  const used = new Set(starters.map((member) => member.id));
  const benchWanted = 1 + Math.floor(seeded(state.seed, benchSeed) * 3);
  let benchPool = available.filter((member) => !used.has(member.id)).sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
  if (!forceUserStarter) benchPool = [user, ...benchPool.filter((member) => member.id !== user.id)];
  const bench = benchPool.slice(0, benchWanted);
  return {
    starters,
    lines: buildLines(starters),
    bench,
    reserveCapacity: 3,
    averageOverall: Math.round(starters.reduce((sum, member) => sum + member.overall, 0) / Math.max(1, starters.length)),
    formation: "4-3-3",
  };
}

export function buildClubSquad(state: GameState): TeamSquadView {
  const universe = ensureClubSquadPlayers(state.worldPlayers, state.currentClubId, state.season, 14);
  const available = worldPlayersAtClub(universe, state.currentClubId)
    .map((player) => fromWorldPlayer(player, state.season))
    .sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
  const forceStarter = state.squadRole === "estrela" || state.squadRole === "titular" || (state.squadRole === "rotacao" && state.overall >= (available[7]?.overall ?? 70));
  return finishView(state, available, forceStarter, state.season * 2801 + state.currentClubId.length * 19);
}

function nationalPool(state: GameState) {
  const tier = state.nationalCategory;
  const country = COUNTRIES.find((candidate) => candidate.id === state.nationality) ?? COUNTRIES[0];
  const ageRange = tier === "sub17" ? [16, 17] : tier === "sub20" ? [18, 20] : tier === "olympic" ? [19, 23] : [20, 34];
  const known = Object.values(state.worldPlayers.players)
    .filter((player) => player.status !== "retired" && player.nationality === state.nationality)
    .filter((player) => {
      const age = state.season - player.birthSeason;
      return age >= ageRange[0] && age <= ageRange[1];
    })
    .map((player) => fromWorldPlayer(player, state.season));
  const result = [...known];
  const usedNames = new Set(result.map((member) => member.name.toLocaleLowerCase("pt-BR")));
  for (let slot = result.length; slot < 15; slot += 1) {
    const salt = state.season * 2903 + slot * 73 + state.nationality.length * 211;
    const position = STARTER_TEMPLATE[slot % STARTER_TEMPLATE.length] ?? POSITIONS[slot % POSITIONS.length].key;
    const age = ageRange[0] + Math.floor(seeded(state.seed, salt + 3) * (ageRange[1] - ageRange[0] + 1));
    const level = tier === "main" ? 66 + country.strength * 3.8 : 59 + country.strength * 3.2;
    const overall = clamp(Math.round(level - 6 + seeded(state.seed, salt + 7) * 13), 55, tier === "main" ? 94 : 88);
    const base = worldPlayerNameForNationality(state.nationality, state.seed, salt + 11);
    let name = base;
    let suffix = 2;
    while (usedNames.has(name.toLocaleLowerCase("pt-BR"))) name = `${base} ${suffix++}`;
    usedNames.add(name.toLocaleLowerCase("pt-BR"));
    result.push({ id: `national-${state.nationality}-${tier}-${slot}`, name, position, overall, age, nationality: state.nationality, isProtagonist: false });
  }
  return result.sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id));
}

export function buildNationalSquad(state: GameState) {
  if (state.nationalCategory === "none") return null;
  const available = nationalPool(state);
  const userStarter = state.overall >= (available[10]?.overall ?? 72) || state.nationalCaptain;
  return {
    label: NATIONAL_TIER_LABELS[state.nationalCategory],
    country: COUNTRIES.find((candidate) => candidate.id === state.nationality) ?? COUNTRIES[0],
    squad: finishView(state, available, userStarter, state.season * 2917 + state.nationality.length * 31),
  };
}
