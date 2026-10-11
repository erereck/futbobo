// Modelo de dados do personagem. O desenho vive em app/character/; aqui ficam
// as opções, a migração de saves antigos e as aparências determinísticas dos
// elencos gerados pelo jogo.

export type PlayerAppearance = {
  version?: 2 | 3;
  skin: number;
  hairColor: number;
  eyeColor: number;
  hairStyle: number;
  /** Expressão facial. */
  face: number;
  beard: number;
  brow: number;
  kitPattern: number;
  customSkinColor?: string;
  customHairColor?: string;
  customEyeColor?: string;
  faceShape: number;
  eyeShape: number;
  nose: number;
  ears: number;
  marks: number;
  /** 0 = sem mechas; demais valores apontam para HAIR_TIP_COLORS[valor - 1]. */
  hairTip: number;
  build: number;
  height: number;
  pose: number;
  headwear: number;
  glasses: number;
  earrings: number;
  wristband: number;
  tattoo: number;
  gloves: number;
  socks: number;
  boots: number;
  accessoryColor: number;
};

export type BotaoVisualRoster = {
  enabled: boolean;
  player: PlayerAppearance;
  user: PlayerAppearance[];
  cpu: PlayerAppearance[];
};

export const SKIN_COLORS = ["#f6d9c0", "#edbf9d", "#e5aa84", "#d99b73", "#cc8965", "#bd7b58", "#985d43", "#714633", "#4b3027", "#321f1a"];
export const HAIR_COLORS = [
  "#12110f", "#28201b", "#473023", "#69422a", "#925d36", "#bd8654", "#d3b17d", "#ded8cc", "#8c2525", "#23426b",
  "#8d4aa3", "#f1eee5", "#e7c79b", "#cf6f38", "#6f1738", "#e05a9d", "#2a9db0", "#3e8050", "#ed8b28", "#9aa8c4",
];
const NATURAL_HAIR_COLOR_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 11, 12, 13];
const COLORED_HAIR_COLOR_INDICES = [8, 9, 10, 14, 15, 16, 17, 18, 19];
export const EYE_COLORS = ["#111816", "#35251d", "#31505b", "#49633c", "#765139", "#7c8f98", "#5c3f76", "#1f6a74", "#9a742d", "#9eb4cf"];
export const HAIR_TIP_COLORS = ["#f4efe2", "#e9c66f", "#d8642e", "#f07ab4", "#3f8fe0", "#4fc27a", "#9b5ce0", "#f59a2b"];
export const HAIR_TIP_NAMES = ["Platinado", "Loiro", "Ruivo", "Rosa", "Azul", "Verde", "Roxo", "Laranja"];

export const HAIR_STYLE_NAMES = [
  "Careca", "Raspado", "Militar", "Clássico", "Franja", "Pixie", "Entradas", "Coroa", "Risca dupla",
  "Social", "Topete", "Pra trás", "Undercut", "Espetado", "Tigelinha", "Franja longa", "Surfista", "Mullet", "Chanel",
  "Moicano", "Crista", "Faux hawk", "Cascão 2002", "Flat top",
  "Cacheado", "Cachos volumosos", "Mini afro", "Black power", "Twists", "Tranças nagô", "Dreads",
  "Dreads longos", "Tranças box", "Longo liso", "Longo ondulado", "Juba",
  "Coque", "Coque alto", "Coque baixo", "Rabo de cavalo", "Rabo alto", "Duas tranças",
];
export const HAIR_STYLE_GROUPS: Array<{ id: string; label: string; styles: number[] }> = [
  { id: "curtos", label: "Curtos", styles: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
  { id: "medios", label: "Médios", styles: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18] },
  { id: "ousados", label: "Ousados", styles: [19, 20, 21, 22, 23, 8, 17] },
  { id: "crespos", label: "Crespos", styles: [24, 25, 26, 27, 28, 29, 30] },
  { id: "longos", label: "Longos", styles: [31, 32, 33, 34, 35, 16] },
  { id: "presos", label: "Presos", styles: [36, 37, 38, 39, 40, 41] },
];
export const HAIR_STYLE_BALD = 0;

export const FACE_NAMES = [
  "Sério", "Confiante", "Sorriso", "Sorrisão", "Gargalhada", "Focado", "Raçudo", "Grito de gol", "Surpreso",
  "Piscadinha", "Tranquilo", "Marrento", "Zoeiro", "Tímido", "Preocupado", "Frio", "Emocionado", "Beijinho",
];
export const BEARD_NAMES = [
  "Sem barba", "Por fazer", "Bigode", "Bigode fino", "Bigodão", "Cavanhaque", "Barbicha", "Bigode e cavanhaque",
  "Barba desenhada", "Costeletas", "Barba curta", "Barba cheia", "Lenhador",
];
export const BROW_NAMES = ["Fina", "Suave", "Reta", "Grossa", "Arqueada", "Com risco"];
export const FACE_SHAPE_NAMES = ["Oval", "Redondo", "Quadrado", "Fino", "Coração", "Largo"];
export const EYE_SHAPE_NAMES = ["Redondos", "Amendoados", "Puxados", "Expressivos", "Pequenos", "Serenos"];
export const NOSE_NAMES = ["Botão", "Reto", "Arredondado", "Largo", "Fino", "Arrebitado"];
export const EAR_NAMES = ["Normais", "Pequenas", "De abano"];
export const MARK_NAMES = ["Nenhuma", "Sardas", "Pinta", "Cicatriz", "Bochechas rosadas", "Olheiras", "Eye black", "Curativo", "Pintura de torcida"];
export const BUILD_NAMES = ["Magro", "Atlético", "Forte", "Parrudo"];
export const HEIGHT_NAMES = ["Baixo", "Médio", "Alto"];
export const POSE_NAMES = ["Relaxado", "Mãos na cintura", "Braços cruzados", "Comemorando", "Joinha", "Apontando pro céu"];
export const HEADWEAR_NAMES = ["Nenhum", "Faixa", "Faixa fina", "Bandana"];
export const GLASSES_NAMES = ["Nenhum", "Óculos esportivo", "Óculos de proteção"];
export const EARRING_NAMES = ["Nenhum", "Brilhante", "Dois brilhantes", "Argolas"];
export const WRISTBAND_NAMES = ["Nenhuma", "Uma", "Duas"];
export const TATTOO_NAMES = ["Nenhuma", "Tribal", "Braço fechado", "Escrita", "Estrelas"];
export const GLOVE_NAMES = ["Sem luvas", "Luvas de goleiro"];
export const SOCK_NAMES = ["Meião alto", "Abaixado", "Com fita"];
export const BOOT_COLORS = ["#16171a", "#f3f4ef", "#e8b923", "#b7f23a", "#ff6a2b", "#ff5fa8", "#2f7df6", "#e23b3b", "#b9c2cc", "#8a4dff"];
export const BOOT_NAMES = ["Preta", "Branca", "Dourada", "Verde-limão", "Laranja neon", "Rosa", "Azul", "Vermelha", "Prata", "Roxa"];
export const ACCESSORY_COLORS = ["#f5f5f0", "#17181b", "#e23b3b", "#f4c430", "#2f6fe0", "#2fae5f", "#ff6fb1", "#ff8a2b", "#8a4dff", "#29c7d8", "#8c949c", "#b7f23a"];
export const KIT_PATTERN_NAMES = ["Faixa central", "Liso", "Listras", "Metade a metade", "Faixa diagonal", "Chevrons", "Ombros", "Pinstripes", "Faixa horizontal", "Quadriculado", "Degradê", "Mangas contrastantes"];

/** Tamanho de cada lista de opções, usado para normalizar e sortear. */
export const APPEARANCE_OPTION_COUNTS = {
  skin: SKIN_COLORS.length,
  hairColor: HAIR_COLORS.length,
  eyeColor: EYE_COLORS.length,
  hairStyle: HAIR_STYLE_NAMES.length,
  face: FACE_NAMES.length,
  beard: BEARD_NAMES.length,
  brow: BROW_NAMES.length,
  kitPattern: KIT_PATTERN_NAMES.length,
  faceShape: FACE_SHAPE_NAMES.length,
  eyeShape: EYE_SHAPE_NAMES.length,
  nose: NOSE_NAMES.length,
  ears: EAR_NAMES.length,
  marks: MARK_NAMES.length,
  hairTip: HAIR_TIP_COLORS.length + 1,
  build: BUILD_NAMES.length,
  height: HEIGHT_NAMES.length,
  pose: POSE_NAMES.length,
  headwear: HEADWEAR_NAMES.length,
  glasses: GLASSES_NAMES.length,
  earrings: EARRING_NAMES.length,
  wristband: WRISTBAND_NAMES.length,
  tattoo: TATTOO_NAMES.length,
  gloves: GLOVE_NAMES.length,
  socks: SOCK_NAMES.length,
  boots: BOOT_COLORS.length,
  accessoryColor: ACCESSORY_COLORS.length,
} as const;

export type AppearanceOptionKey = keyof typeof APPEARANCE_OPTION_COUNTS;

export const DEFAULT_PLAYER_APPEARANCE: PlayerAppearance = {
  version: 3,
  skin: 2,
  hairColor: 1,
  eyeColor: 1,
  hairStyle: 3,
  face: 1,
  beard: 0,
  brow: 2,
  kitPattern: 1,
  faceShape: 0,
  eyeShape: 0,
  nose: 0,
  ears: 0,
  marks: 0,
  hairTip: 0,
  build: 1,
  height: 1,
  pose: 0,
  headwear: 0,
  glasses: 0,
  earrings: 0,
  wristband: 0,
  tattoo: 0,
  gloves: 0,
  socks: 0,
  boots: 0,
  accessoryColor: 0,
};

function clampIndex(value: unknown, length: number) {
  const number = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(length - 1, Math.round(number)));
}

function safeHex(value?: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;
}

// v1 -> v2 (o primeiro editor tinha listas com outra ordem).
const V1_HAIR_TO_V2 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 2, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 2, 19, 20, 21];
const V1_SKIN_TO_V2 = [0, 1, 3, 5, 6, 7, 8, 9];
const V1_FACE_TO_V2 = [0, 1, 2, 3, 3, 4, 5, 6, 7, 8];
// v2 -> v3 (modelo novo com corpo inteiro).
const V2_HAIR_TO_V3 = [3, 4, 24, 19, 27, 1, 29, 9, 10, 30, 36, 1, 0, 17, 14, 21, 28, 15, 12, 39, 8, 26];
const V2_FACE_TO_V3 = [0, 1, 2, 5, 10, 8, 3, 17, 11];
const V2_BEARD_TO_V3 = [0, 5, 11, 2, 10, 8, 3, 1];
const V2_BROW_TO_V3 = [1, 2, 3];
const V2_BLEACHED_HAIR = 11;

const normalizedCache = new WeakMap<object, PlayerAppearance>();

export function normalizePlayerAppearance(value?: Partial<PlayerAppearance> | null): PlayerAppearance {
  if (value && typeof value === "object") {
    const cached = normalizedCache.get(value);
    if (cached) return cached;
  }
  const source: Partial<PlayerAppearance> = value ?? {};
  const fromV3 = source.version === 3;
  const fromV2 = source.version === 2;
  const legacy = !fromV3 && !fromV2 && value != null;
  const pick = <K extends AppearanceOptionKey>(key: K) =>
    clampIndex(source[key] ?? DEFAULT_PLAYER_APPEARANCE[key], APPEARANCE_OPTION_COUNTS[key]);

  let hairStyle = pick("hairStyle");
  let face = pick("face");
  let beard = pick("beard");
  let brow = pick("brow");
  let skin = pick("skin");
  let hairTip = pick("hairTip");

  if (!fromV3 && value != null) {
    const v2Hair = legacy ? V1_HAIR_TO_V2[source.hairStyle ?? 0] ?? 0 : clampIndex(source.hairStyle, V2_HAIR_TO_V3.length);
    const v2Face = legacy ? V1_FACE_TO_V2[source.face ?? 0] ?? 0 : clampIndex(source.face, V2_FACE_TO_V3.length);
    hairStyle = V2_HAIR_TO_V3[v2Hair] ?? 3;
    face = V2_FACE_TO_V3[v2Face] ?? 1;
    beard = V2_BEARD_TO_V3[clampIndex(source.beard, V2_BEARD_TO_V3.length)] ?? 0;
    brow = V2_BROW_TO_V3[clampIndex(source.brow ?? 1, V2_BROW_TO_V3.length)] ?? 2;
    if (v2Hair === V2_BLEACHED_HAIR) hairTip = 1;
    if (legacy) skin = clampIndex(V1_SKIN_TO_V2[source.skin ?? 2] ?? 3, SKIN_COLORS.length);
  }

  const normalized: PlayerAppearance = {
    version: 3,
    skin,
    hairColor: pick("hairColor"),
    eyeColor: pick("eyeColor"),
    hairStyle,
    face,
    beard,
    brow,
    kitPattern: pick("kitPattern"),
    customSkinColor: safeHex(source.customSkinColor),
    customHairColor: safeHex(source.customHairColor),
    customEyeColor: safeHex(source.customEyeColor),
    faceShape: pick("faceShape"),
    eyeShape: pick("eyeShape"),
    nose: pick("nose"),
    ears: pick("ears"),
    marks: pick("marks"),
    hairTip,
    build: pick("build"),
    height: pick("height"),
    pose: pick("pose"),
    headwear: pick("headwear"),
    glasses: pick("glasses"),
    earrings: pick("earrings"),
    wristband: pick("wristband"),
    tattoo: pick("tattoo"),
    gloves: pick("gloves"),
    socks: pick("socks"),
    boots: pick("boots"),
    accessoryColor: pick("accessoryColor"),
  };
  if (value && typeof value === "object") normalizedCache.set(value, normalized);
  normalizedCache.set(normalized, normalized);
  return normalized;
}

function hashParts(...parts: Array<string | number>) {
  let hash = 2166136261;
  for (const part of parts) {
    const text = String(part);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

function randomFromSeed(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function weighted<T>(random: () => number, entries: Array<[T, number]>): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

// Elencos parecem elencos: cortes curtos dominam, visuais extravagantes aparecem às vezes.
const SQUAD_HAIR_WEIGHTS: Array<[number, number]> = [
  [0, 4], [1, 9], [2, 8], [3, 9], [4, 4], [5, 1], [6, 3], [7, 2], [8, 3],
  [9, 6], [10, 5], [11, 4], [12, 7], [13, 4], [14, 2], [15, 2], [16, 3], [17, 2], [18, 0.6],
  [19, 2], [20, 1], [21, 4], [22, 0.5], [23, 1.5],
  [24, 5], [25, 3], [26, 4], [27, 1.5], [28, 2.5], [29, 2.5], [30, 2.5],
  [31, 1], [32, 0.8], [33, 1.2], [34, 1.2], [35, 0.6],
  [36, 2.5], [37, 1.2], [38, 1], [39, 1], [40, 0.6], [41, 0.4],
];
const SQUAD_FACE_WEIGHTS: Array<[number, number]> = [
  [0, 9], [1, 9], [2, 7], [3, 4], [4, 1.5], [5, 7], [6, 2], [7, 1], [8, 1], [9, 1.5],
  [10, 5], [11, 4], [12, 1], [13, 1.5], [14, 1], [15, 4], [16, 0.6], [17, 0.6],
];

export function randomPlayerAppearance(seed = Math.floor(Math.random() * 2147483647)): PlayerAppearance {
  const random = randomFromSeed(hashParts("futbobo-player", seed));
  const hairColorPool = random() < 0.03 ? COLORED_HAIR_COLOR_INDICES : NATURAL_HAIR_COLOR_INDICES;
  const pickIndex = (length: number) => Math.floor(random() * length);
  return {
    version: 3,
    skin: pickIndex(SKIN_COLORS.length),
    hairColor: hairColorPool[pickIndex(hairColorPool.length)],
    eyeColor: pickIndex(EYE_COLORS.length),
    hairStyle: weighted(random, SQUAD_HAIR_WEIGHTS),
    face: weighted(random, SQUAD_FACE_WEIGHTS),
    beard: random() < 0.55 ? 0 : 1 + pickIndex(BEARD_NAMES.length - 1),
    brow: pickIndex(BROW_NAMES.length - 1),
    kitPattern: 1,
    faceShape: pickIndex(FACE_SHAPE_NAMES.length),
    eyeShape: pickIndex(EYE_SHAPE_NAMES.length),
    nose: pickIndex(NOSE_NAMES.length),
    ears: random() < 0.86 ? 0 : 1 + pickIndex(2),
    marks: random() < 0.78 ? 0 : weighted(random, [[1, 4], [2, 3], [3, 1.5], [4, 2], [5, 1], [6, 1], [7, 0.8], [8, 0.4]]),
    hairTip: random() < 0.94 ? 0 : 1 + pickIndex(HAIR_TIP_COLORS.length),
    build: weighted(random, [[0, 3], [1, 6], [2, 3], [3, 1]]),
    height: weighted(random, [[0, 2], [1, 5], [2, 3]]),
    pose: pickIndex(POSE_NAMES.length),
    headwear: random() < 0.9 ? 0 : 1 + pickIndex(HEADWEAR_NAMES.length - 1),
    glasses: random() < 0.985 ? 0 : 1 + pickIndex(GLASSES_NAMES.length - 1),
    earrings: random() < 0.82 ? 0 : 1 + pickIndex(EARRING_NAMES.length - 1),
    wristband: random() < 0.75 ? 0 : 1 + pickIndex(2),
    tattoo: random() < 0.72 ? 0 : 1 + pickIndex(TATTOO_NAMES.length - 1),
    gloves: 0,
    socks: weighted(random, [[0, 7], [1, 2], [2, 2]]),
    boots: pickIndex(BOOT_COLORS.length),
    accessoryColor: pickIndex(ACCESSORY_COLORS.length),
  };
}

/** Sorteio do estúdio: mais ousado que o dos elencos, preservando a pose escolhida. */
export function randomStudioAppearance(current: PlayerAppearance, seed = Math.floor(Math.random() * 2147483647)): PlayerAppearance {
  const random = randomFromSeed(hashParts("futbobo-studio", seed));
  const base = randomPlayerAppearance(seed);
  return {
    ...base,
    hairStyle: Math.floor(random() * HAIR_STYLE_NAMES.length),
    face: Math.floor(random() * FACE_NAMES.length),
    hairColor: random() < 0.12 ? COLORED_HAIR_COLOR_INDICES[Math.floor(random() * COLORED_HAIR_COLOR_INDICES.length)] : base.hairColor,
    hairTip: random() < 0.82 ? 0 : 1 + Math.floor(random() * HAIR_TIP_COLORS.length),
    headwear: random() < 0.78 ? 0 : 1 + Math.floor(random() * (HEADWEAR_NAMES.length - 1)),
    glasses: random() < 0.94 ? 0 : 1 + Math.floor(random() * (GLASSES_NAMES.length - 1)),
    kitPattern: current.kitPattern,
    pose: current.pose,
    gloves: current.gloves,
  };
}

const SUB_SAHARAN_COUNTRIES = new Set(["senegal", "nigeria", "gana", "costa-do-marfim", "africa-do-sul", "camaroes", "mali", "angola", "burkina-faso", "cabo-verde", "congo-rd", "gabao", "guine", "zambia", "zimbabue", "mocambique"]);
const NORTH_AFRICAN_COUNTRIES = new Set(["marrocos", "egito", "argelia", "tunisia"]);
const EAST_ASIAN_COUNTRIES = new Set(["japao", "coreia-do-sul", "china"]);

function appearanceForNationalTeam(seed: number, countryId?: string) {
  const appearance = randomPlayerAppearance(seed);
  if (!countryId) return appearance;
  const random = randomFromSeed(hashParts(seed, countryId, "national-identity"));
  if (SUB_SAHARAN_COUNTRIES.has(countryId)) {
    const weightedSkin = [5, 6, 6, 7, 7, 7, 8, 8, 9, 9];
    const textured = [24, 26, 1, 27, 28, 29, 30, 8, 2, 23, 0, 25];
    appearance.skin = weightedSkin[Math.floor(random() * weightedSkin.length)];
    appearance.hairColor = random() < 0.92 ? 0 : 1;
    appearance.hairStyle = textured[Math.floor(random() * textured.length)];
  } else if (NORTH_AFRICAN_COUNTRIES.has(countryId)) {
    appearance.skin = [3, 3, 4, 4, 5, 5, 6][Math.floor(random() * 7)];
    appearance.hairColor = [0, 0, 1, 1, 2][Math.floor(random() * 5)];
  } else if (EAST_ASIAN_COUNTRIES.has(countryId)) {
    appearance.skin = [0, 1, 1, 2, 3][Math.floor(random() * 5)];
    appearance.hairColor = random() < 0.9 ? 0 : 1;
  }
  return appearance;
}

export function visualRosterForMatch(args: {
  enabled: boolean;
  seed: number;
  season: number;
  userTeamId: string;
  cpuTeamId: string;
  player: PlayerAppearance;
  careerStartSeason?: number;
  userNationalCountryId?: string;
  cpuNationalCountryId?: string;
}): BotaoVisualRoster {
  const start = Math.min(args.season, args.careerStartSeason ?? args.season);
  const user = Array.from({ length: 5 }, (_, slot) => {
    let revision = start;
    for (let season = start + 1; season <= args.season; season += 1) {
      const roll = randomFromSeed(hashParts(args.seed, args.userTeamId, slot, season, "transfer"))();
      if (roll < 0.34) revision = season;
    }
    return appearanceForNationalTeam(hashParts(args.seed, args.userTeamId, slot, revision, "persistent"), args.userNationalCountryId);
  });
  const cpu = Array.from({ length: 5 }, (_, slot) =>
    appearanceForNationalTeam(hashParts(args.seed, args.cpuTeamId, args.season, slot, "season-squad"), args.cpuNationalCountryId),
  );
  const normalizedPlayer = normalizePlayerAppearance(args.player);
  const userPattern = teamKitPattern(args.seed, args.userTeamId);
  const cpuPattern = teamKitPattern(args.seed, args.cpuTeamId);
  return {
    enabled: args.enabled,
    player: { ...normalizedPlayer, kitPattern: userPattern },
    user: user.map((appearance) => ({ ...appearance, kitPattern: userPattern })),
    cpu: cpu.map((appearance) => ({ ...appearance, kitPattern: cpuPattern })),
  };
}

export function teamKitPattern(seed: number, teamId: string) {
  return hashParts(seed, teamId, "persistent-kit") % KIT_PATTERN_NAMES.length;
}

export function careerSquadAppearance(args: {
  seed: number;
  memberId: string;
  teamId: string;
  nationality: string;
}): PlayerAppearance {
  const appearance = appearanceForNationalTeam(
    hashParts(args.seed, args.teamId, args.memberId, "career-team-portrait"),
    args.nationality,
  );
  return { ...appearance, kitPattern: teamKitPattern(args.seed, args.teamId) };
}

export function appearanceColors(appearance: PlayerAppearance) {
  return {
    skin: appearance.customSkinColor ?? SKIN_COLORS[appearance.skin] ?? SKIN_COLORS[2],
    hair: appearance.customHairColor ?? HAIR_COLORS[appearance.hairColor] ?? HAIR_COLORS[0],
    eyes: appearance.customEyeColor ?? EYE_COLORS[appearance.eyeColor] ?? EYE_COLORS[0],
    hairTip: appearance.hairTip > 0 ? HAIR_TIP_COLORS[appearance.hairTip - 1] : undefined,
    accessory: ACCESSORY_COLORS[appearance.accessoryColor] ?? ACCESSORY_COLORS[0],
    boots: BOOT_COLORS[appearance.boots] ?? BOOT_COLORS[0],
  };
}
