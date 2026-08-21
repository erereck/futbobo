import type { PositionKey } from "../game-data";
export type WorldPlayerMoveType = "permanent" | "loan" | "free-agent" | "renewal";

export type WorldPlayerStatus = "active" | "loaned" | "free-agent" | "retired";
export type WorldPlayerSource = "generated" | "rival" | "award";

export type WorldPlayerCareerStats = {
  seasons: number;
  appearances: number;
  goals: number;
  assists: number;
  tackles: number;
  cleanSheets: number;
};

export type WorldPlayerClubSpell = {
  clubId: string;
  joinedSeason: number;
  leftSeason: number | null;
  moveType: WorldPlayerMoveType | "generated" | "loan-return";
  transferFee: number;
};

export type WorldPlayerHonor = {
  id: string;
  season: number;
  kind: "award" | "trophy";
  name: string;
  clubId: string;
  competitionId?: string;
};

export type WorldPlayer = {
  id: string;
  source: WorldPlayerSource;
  name: string;
  nationality: string;
  position: PositionKey;
  birthSeason: number;
  generatedSeason: number;
  overall: number;
  potential: number;
  reputation: number;
  status: WorldPlayerStatus;
  currentClubId: string;
  parentClubId: string;
  loanEndSeason: number;
  contractUntilSeason: number;
  retiredSeason: number | null;
  careerStats: WorldPlayerCareerStats;
  clubHistory: WorldPlayerClubSpell[];
  honors: WorldPlayerHonor[];
};

/** A maioria do mundo existe apenas como coortes baratas. Entidades completas são promovidas quando se tornam relevantes. */
export type WorldPopulationBucket = {
  id: string;
  confederation: string;
  ageBand: "u21" | "prime" | "veteran";
  level: "local" | "continental" | "elite";
  count: number;
};

export type WorldPlayerUniverse = {
  schemaVersion: 1;
  seed: number;
  initializedSeason: number;
  lastAdvancedSeason: number;
  nextSerial: number;
  population: WorldPopulationBucket[];
  players: Record<string, WorldPlayer>;
  rivalLinks: Record<string, string>;
  aliases: Record<string, string>;
};

export type WorldPlayerAdvanceContext = {
  season: number;
  rivals?: Array<{
    id: string; name: string; nationality: string; position: PositionKey; age: number; overall: number;
    currentClubId: string; appearances: number; goals: number; assists: number; awards: number; active: boolean;
  }>;
  awardNominations?: Array<{ award: string; winner: string }>;
  protagonistName?: string;
};
