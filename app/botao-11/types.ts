export type Side = "user" | "cpu";
export type Phase = "aim" | "resolving" | "goal" | "finished";

export type Vec2 = { x: number; y: number };

export type TeamPreset = {
  id: string;
  name: string;
  abbr: string;
  primary: string;
  secondary: string;
  strength: number;
};

export type DiscRole = "GK" | "RB" | "CB" | "LB" | "DM" | "CM" | "AM" | "RW" | "LW" | "ST";

export type FormationSlot = {
  role: DiscRole;
  lane: number;
  depth: number;
};

export type Formation = {
  id: string;
  name: string;
  shape: string;
  slots: FormationSlot[];
};

export type BodyKind = "disc" | "ball" | "post";

export type Body = {
  id: string;
  kind: BodyKind;
  side: Side | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  mass: number;
  friction: number;
  number: number;
  role?: DiscRole;
  power: number;
  control: number;
};

export type MatchEvent =
  | { type: "goal"; side: Side; scorer: string }
  | { type: "turn"; side: Side }
  | { type: "settled" }
  | { type: "match-end" };

export type MatchSetup = {
  seed: number;
  userTeam: TeamPreset;
  cpuTeam: TeamPreset;
  userFormationId: string;
  cpuFormationId: string;
  matchSeconds: number;
};

export type MatchState = {
  setup: MatchSetup;
  phase: Phase;
  turn: Side;
  bodies: Body[];
  score: Record<Side, number>;
  clock: number;
  turns: number;
  resolveElapsed: number;
  events: MatchEvent[];
  lastTouch: { side: Side; bodyId: string } | null;
  version: number;
};

export type Shot = {
  bodyId: string;
  vx: number;
  vy: number;
};
