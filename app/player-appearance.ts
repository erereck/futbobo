export type PlayerAppearance = {
  version?: 2;
  skin: number;
  hairColor: number;
  eyeColor: number;
  hairStyle: number;
  face: number;
  beard: number;
  brow: number;
  kitPattern: number;
  /** Faixa, tiara, bandana ou boné (HEADWEAR_NAMES). Saves antigos não têm: 0. */
  headwear?: number;
  /** Óculos ou máscara (EYEWEAR_NAMES). */
  eyewear?: number;
  /** Brincos (EARRING_NAMES). */
  earrings?: number;
  /** Sardas, pinta, cicatriz, graxa, pintura (FACE_MARK_NAMES). */
  faceMark?: number;
  /** Cor da faixa/bandana/boné, da armação e da pintura (ACCESSORY_COLORS). */
  accessoryColor?: number;
  /** Chuteira dos bonecos 3D (BOOT_OPTIONS); 0 = sorteada pela camisa, como sempre foi. */
  boots?: number;
  /** Comemoração de gol do seu jogador no Modo 3D (CELEBRATION_OPTIONS); 0 = variada. */
  celebration?: number;
  customSkinColor?: string;
  customHairColor?: string;
  customEyeColor?: string;
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
export const HAIR_STYLE_NAMES = [
  "Clássico", "Franja", "Cacheado", "Moicano", "Black power", "Raspado", "Tranças", "Lateral", "Topete", "Dreads", "Coque", "Descolorido", "Careca",
  "Mullet", "Corte tigelinha", "Faux hawk", "Twists", "Franja longa", "Undercut", "Rabo de cavalo", "Risca dupla", "Mini afro",
  "Cascão 2002", "Longo solto", "Arrepiado", "Repartido", "Hi-top", "Nagô", "Dois coques", "Pra trás", "Moicano espetado", "Afro gigante", "Chanel", "Trança longa",
];
/** Cortes que existiam antes da leva nova: o sorteio base continua neles (rostos gerados não mudam). */
const LEGACY_HAIR_STYLE_COUNT = 22;
const NEW_HAIR_STYLES = [22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33];
export const BEARD_NAMES = ["Sem barba", "Cavanhaque", "Barba cheia", "Bigode", "Barba curta", "Barba desenhada", "Bigode fino", "Barba por fazer", "Barba longa", "Costeletas", "Ferradura", "Contorno"];
const LEGACY_BEARD_COUNT = 8;
export const FACE_NAMES = ["Sério", "Confiante", "Sorriso", "Concentrado", "Tranquilo", "Surpreso", "Dentes à mostra", "Bico", "Sorriso torto", "Sorrisão", "Desconfiado"];
const LEGACY_FACE_COUNT = 9;
/** Antes eram três; o índice também descia a altura da sobrancelha no 2D (os novos ficam na altura da "Reta"). */
export const BROW_NAMES = ["Suave", "Reta", "Intensa", "Com risco", "Grossa"];
const LEGACY_BROW_COUNT = 3;
export const KIT_PATTERN_NAMES = ["Faixa central", "Liso", "Listras", "Metade a metade", "Faixa diagonal", "Chevrons", "Ombros", "Pinstripes", "Faixa horizontal", "Quadriculado", "Degradê", "Mangas contrastantes"];

// Acessórios: aparecem no busto 2D, nos bonecos 3D e na cerimônia.
export const HEADWEAR_NAMES = ["Nenhum", "Faixa esportiva", "Tiara", "Bandana", "Boné"];
export const EYEWEAR_NAMES = ["Nenhum", "Óculos esportivo", "Máscara protetora", "Óculos escuros"];
export const EARRING_NAMES = ["Nenhum", "Brinco", "Par de brincos", "Argolas"];
export const FACE_MARK_NAMES = ["Nenhuma", "Sardas", "Pinta", "Cicatriz", "Graxa nos olhos", "Pintura de guerra"];
/** Branco, preto, vermelho, azul, amarelo, verde, rosa, laranja, roxo, dourado. */
export const ACCESSORY_COLORS = ["#f4f4f2", "#151515", "#d7263d", "#1f5fd1", "#ffd23f", "#1f9e5a", "#ff6fb5", "#ff7a1a", "#7b3fd1", "#c9a227"];

/** Só os bonecos 3D mostram a chuteira. `color: null` = sorteada pela camisa (o padrão de sempre). */
export const BOOT_OPTIONS: ReadonlyArray<{ name: string; color: string | null }> = [
  { name: "Automática", color: null },
  { name: "Preta", color: "#141414" },
  { name: "Branca", color: "#f4f4f2" },
  { name: "Laranja", color: "#ff5a36" },
  { name: "Azul", color: "#2f7bff" },
  { name: "Amarela", color: "#ffd23f" },
  { name: "Verde", color: "#2fd38a" },
  { name: "Rosa", color: "#ff4fa3" },
  { name: "Vermelha", color: "#d7263d" },
  { name: "Roxa", color: "#7b3fd1" },
  { name: "Dourada", color: "#d4a72c" },
  { name: "Prata", color: "#c8ccd2" },
];

/**
 * Comemoração do SEU jogador quando ele marca no Modo 3D. `id` é o mesmo nome
 * da coreografia (`GoalCelebration` em botao/three/choreography.ts); "auto"
 * mantém o sorteio de sempre.
 */
export const CELEBRATION_OPTIONS = [
  { id: "auto", name: "Variada" },
  { id: "kneeSlide", name: "Carrinho de joelho" },
  { id: "siuu", name: "Siuuu" },
  { id: "cornerFlag", name: "Bandeirinha" },
  { id: "backflip", name: "Mortal" },
  { id: "airplane", name: "Aviãozinho" },
  { id: "crest", name: "Beijo no escudo" },
  { id: "heart", name: "Coração" },
  { id: "shush", name: "Silêncio" },
  { id: "armsCrossed", name: "Braços cruzados" },
  { id: "cradle", name: "Embala neném" },
  { id: "robot", name: "Robô" },
  { id: "dance", name: "Dancinha" },
  // Só se acrescenta no fim: o save guarda o índice.
  { id: "kamehameha", name: "Kamehameha" },      // 13
  { id: "superSaiyan", name: "Super Saiyajin" }, // 14
  { id: "meditate", name: "Meditação" },         // 15
  { id: "cupEar", name: "Não tô ouvindo" },      // 16
  { id: "fingerGuns", name: "Pistoleiro" },      // 17
] as const;
export type CelebrationId = (typeof CELEBRATION_OPTIONS)[number]["id"];

export function celebrationIdOf(appearance: Pick<PlayerAppearance, "celebration"> | null | undefined): CelebrationId {
  return CELEBRATION_OPTIONS[appearance?.celebration ?? 0]?.id ?? "auto";
}

export function accessoryColorOf(appearance: Pick<PlayerAppearance, "accessoryColor">) {
  return ACCESSORY_COLORS[appearance.accessoryColor ?? 0] ?? ACCESSORY_COLORS[0];
}

export const DEFAULT_PLAYER_APPEARANCE: PlayerAppearance = {
  version: 2,
  skin: 2,
  hairColor: 0,
  eyeColor: 0,
  hairStyle: 1,
  face: 1,
  beard: 0,
  brow: 1,
  kitPattern: 1,
  headwear: 0,
  eyewear: 0,
  earrings: 0,
  faceMark: 0,
  accessoryColor: 0,
  boots: 0,
  celebration: 0,
};

function clampIndex(value: number, length: number) {
  return Math.max(0, Math.min(length - 1, Math.round(Number.isFinite(value) ? value : 0)));
}

function safeHex(value?: string) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;
}

export function normalizePlayerAppearance(value?: Partial<PlayerAppearance> | null): PlayerAppearance {
  const legacy = value?.version !== 2;
  const legacyHairMap = [0, 1, 2, 3, 4, 5, 6, 7, 8, 2, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 2, 19, 20, 21];
  const legacySkinMap = [0, 1, 3, 5, 6, 7, 8, 9];
  const legacyFaceMap = [0, 1, 2, 3, 3, 4, 5, 6, 7, 8];
  return {
    version: 2,
    skin: clampIndex(legacy ? legacySkinMap[value?.skin ?? DEFAULT_PLAYER_APPEARANCE.skin] ?? 3 : value?.skin ?? DEFAULT_PLAYER_APPEARANCE.skin, SKIN_COLORS.length),
    hairColor: clampIndex(value?.hairColor ?? DEFAULT_PLAYER_APPEARANCE.hairColor, HAIR_COLORS.length),
    eyeColor: clampIndex(value?.eyeColor ?? DEFAULT_PLAYER_APPEARANCE.eyeColor, EYE_COLORS.length),
    hairStyle: clampIndex(legacy ? legacyHairMap[value?.hairStyle ?? DEFAULT_PLAYER_APPEARANCE.hairStyle] ?? 0 : value?.hairStyle ?? DEFAULT_PLAYER_APPEARANCE.hairStyle, HAIR_STYLE_NAMES.length),
    face: clampIndex(legacy ? legacyFaceMap[value?.face ?? DEFAULT_PLAYER_APPEARANCE.face] ?? 0 : value?.face ?? DEFAULT_PLAYER_APPEARANCE.face, FACE_NAMES.length),
    beard: clampIndex(value?.beard ?? DEFAULT_PLAYER_APPEARANCE.beard, legacy ? LEGACY_BEARD_COUNT : BEARD_NAMES.length),
    brow: clampIndex(value?.brow ?? DEFAULT_PLAYER_APPEARANCE.brow, legacy ? LEGACY_BROW_COUNT : BROW_NAMES.length),
    kitPattern: clampIndex(value?.kitPattern ?? DEFAULT_PLAYER_APPEARANCE.kitPattern, KIT_PATTERN_NAMES.length),
    headwear: clampIndex(value?.headwear ?? 0, HEADWEAR_NAMES.length),
    eyewear: clampIndex(value?.eyewear ?? 0, EYEWEAR_NAMES.length),
    earrings: clampIndex(value?.earrings ?? 0, EARRING_NAMES.length),
    faceMark: clampIndex(value?.faceMark ?? 0, FACE_MARK_NAMES.length),
    accessoryColor: clampIndex(value?.accessoryColor ?? 0, ACCESSORY_COLORS.length),
    boots: clampIndex(value?.boots ?? 0, BOOT_OPTIONS.length),
    celebration: clampIndex(value?.celebration ?? 0, CELEBRATION_OPTIONS.length),
    customSkinColor: safeHex(value?.customSkinColor),
    customHairColor: safeHex(value?.customHairColor),
    customEyeColor: safeHex(value?.customEyeColor),
  };
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

export function randomPlayerAppearance(seed = Math.floor(Math.random() * 2147483647)): PlayerAppearance {
  const random = randomFromSeed(hashParts("futbobo-player", seed));
  const hairColorPool = random() < 0.03 ? COLORED_HAIR_COLOR_INDICES : NATURAL_HAIR_COLOR_INDICES;
  // Sorteio base com as listas antigas, na mesma ordem: num rosto gerado por
  // semente (elenco, rival, seleção) pele, cabelo e olhos não mudam com a leva
  // nova, que só mexe no que sorteia depois daqui.
  const appearance: PlayerAppearance = {
    version: 2,
    skin: Math.floor(random() * SKIN_COLORS.length),
    hairColor: hairColorPool[Math.floor(random() * hairColorPool.length)],
    eyeColor: Math.floor(random() * EYE_COLORS.length),
    hairStyle: Math.floor(random() * LEGACY_HAIR_STYLE_COUNT),
    face: Math.floor(random() * LEGACY_FACE_COUNT),
    beard: random() < 0.58 ? 0 : 1 + Math.floor(random() * (LEGACY_BEARD_COUNT - 1)),
    brow: Math.floor(random() * LEGACY_BROW_COUNT),
    kitPattern: 1,
  };
  // Leva nova: só uma parte dos rostos troca, e os acessórios são raros (time de verdade).
  if (random() < 0.3) appearance.hairStyle = NEW_HAIR_STYLES[Math.floor(random() * NEW_HAIR_STYLES.length)];
  if (appearance.beard > 0 && random() < 0.22) appearance.beard = LEGACY_BEARD_COUNT + Math.floor(random() * (BEARD_NAMES.length - LEGACY_BEARD_COUNT));
  if (random() < 0.06) appearance.face = LEGACY_FACE_COUNT + Math.floor(random() * (FACE_NAMES.length - LEGACY_FACE_COUNT));
  if (random() < 0.08) appearance.brow = LEGACY_BROW_COUNT + Math.floor(random() * (BROW_NAMES.length - LEGACY_BROW_COUNT));
  const roll = random();
  appearance.headwear = roll < 0.07 ? 1 : roll < 0.1 ? 2 : roll < 0.12 ? 3 : 0;
  const eyes = random();
  appearance.eyewear = eyes < 0.012 ? 2 : eyes < 0.03 ? 1 : 0;
  const ears = random();
  appearance.earrings = ears < 0.08 ? 1 : ears < 0.14 ? 2 : ears < 0.16 ? 3 : 0;
  const marks = random();
  appearance.faceMark = marks < 0.05 ? 1 : marks < 0.09 ? 2 : marks < 0.11 ? 3 : marks < 0.13 ? 4 : 0;
  appearance.accessoryColor = Math.floor(random() * ACCESSORY_COLORS.length);
  appearance.boots = 0;
  appearance.celebration = 0;
  return appearance;
}

const SUB_SAHARAN_COUNTRIES = new Set(["senegal", "nigeria", "gana", "costa-do-marfim", "africa-do-sul", "camaroes", "mali", "angola", "burkina-faso", "cabo-verde", "congo-rd", "gabao", "guine", "zambia", "zimbabue", "mocambique"]);
const NORTH_AFRICAN_COUNTRIES = new Set(["marrocos", "egito", "argelia", "tunisia"]);
const EAST_ASIAN_COUNTRIES = new Set(["japao", "coreia-do-sul", "china"]);

function appearanceForNationalTeam(seed: number, countryId?: string) {
  const appearance = randomPlayerAppearance(seed);
  if (!countryId) return appearance;
  const random = randomFromSeed(hashParts(seed, countryId, "national-identity"));
  if (SUB_SAHARAN_COUNTRIES.has(countryId)) {
    const weighted = [5, 6, 6, 7, 7, 7, 8, 8, 9, 9];
    appearance.skin = weighted[Math.floor(random() * weighted.length)];
    appearance.hairColor = random() < 0.92 ? 0 : 1;
    appearance.hairStyle = [2, 4, 5, 6, 9, 16, 20, 21][Math.floor(random() * 8)];
    // Leva nova (hi-top, nagô, afro gigante) num sorteio à parte: os rostos de antes continuam.
    if (random() < 0.28) appearance.hairStyle = [26, 27, 31][Math.floor(random() * 3)];
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

function shade(hex: string, amount: number) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean, 16);
  const red = Math.max(0, Math.min(255, (value >> 16) + amount));
  const green = Math.max(0, Math.min(255, ((value >> 8) & 255) + amount));
  const blue = Math.max(0, Math.min(255, (value & 255) + amount));
  return `rgb(${red},${green},${blue})`;
}

/** Mistura duas cores hex (#rrggbb): `amount` 0 = `from`, 1 = `to`. */
function mix(from: string, to: string, amount: number) {
  const a = Number.parseInt(from.slice(1), 16);
  const b = Number.parseInt(to.slice(1), 16);
  const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount);
  return `rgb(${channel(16)},${channel(8)},${channel(0)})`;
}

function lightness(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return ((value >> 16) * 299 + ((value >> 8) & 255) * 587 + (value & 255) * 114) / 1000;
}

/** Traço de textura (trança, pente, coque): clareia cabelo escuro e escurece o claro, senão some. */
function hairDetail(hex: string) {
  return shade(hex, lightness(hex) < 70 ? 34 : -30);
}

function drawHairBack(ctx: CanvasRenderingContext2D, style: number, hex: string, scale: number) {
  const color = shade(hex, -7);
  ctx.fillStyle = color;
  if (style === 23) {
    // Longo solto: as laterais descem por trás do rosto e caem nos ombros.
    ctx.beginPath();
    for (let side = -1; side <= 1; side += 2) {
      ctx.moveTo(side * 13 * scale, -18 * scale); ctx.lineTo(side * 17.4 * scale, -12 * scale); ctx.lineTo(side * 18.8 * scale, 13 * scale);
      ctx.quadraticCurveTo(side * 15.4 * scale, 15.6 * scale, side * 10.6 * scale, 14.2 * scale); ctx.lineTo(side * 10.6 * scale, -10 * scale); ctx.closePath();
    }
    ctx.fill();
  } else if (style === 31) {
    // Afro gigante: o volume fica atrás do rosto e passa bem do black power para os lados.
    ctx.beginPath(); ctx.ellipse(0, -12 * scale, 22.5 * scale, 18 * scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();
    for (let index = 0; index < 13; index += 1) {
      const angle = Math.PI * (.9 + index * 1.2 / 12);
      const x = Math.cos(angle) * 21.5 * scale;
      const y = -12 * scale + Math.sin(angle) * 17 * scale;
      ctx.moveTo(x + 5.4 * scale, y); ctx.arc(x, y, 5.4 * scale, 0, Math.PI * 2);
    }
    ctx.fill();
  } else if (style === 33) {
    // Trança longa: sai de trás da orelha e desce pelo ombro em gomos.
    ctx.beginPath(); ctx.moveTo(-11 * scale, -16 * scale); ctx.lineTo(-17.4 * scale, -10 * scale); ctx.lineTo(-18 * scale, -1 * scale); ctx.lineTo(-12.4 * scale, -1 * scale); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = shade(hex, -34); ctx.lineWidth = .7 * scale;
    for (let index = 0; index < 6; index += 1) {
      ctx.beginPath();
      ctx.ellipse((-15.6 + index * .55) * scale, (-.5 + index * 3.8) * scale, 3.2 * scale, 2.5 * scale, index % 2 ? .45 : -.45, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = shade(hex, -40); ctx.fillRect(-14.6 * scale, 20.2 * scale, 3.4 * scale, 1.4 * scale);
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-14.8 * scale, 21.4 * scale); ctx.lineTo(-11 * scale, 21.4 * scale); ctx.lineTo(-12.2 * scale, 25 * scale); ctx.lineTo(-14 * scale, 24.4 * scale); ctx.closePath(); ctx.fill();
  }
  if ([6, 9, 13, 17, 19].includes(style)) {
    const leftLength = style === 17 ? 23 : style === 19 ? 19 : 16;
    ctx.fillRect(-16 * scale, -15 * scale, 5 * scale, leftLength * scale);
    ctx.fillRect(11 * scale, -15 * scale, 5 * scale, leftLength * scale);
  }
  if (style === 13) ctx.fillRect(-11 * scale, 0, 22 * scale, 9 * scale);
  if (style === 19) {
    ctx.fillRect(12 * scale, -11 * scale, 8 * scale, 17 * scale);
    ctx.beginPath(); ctx.arc(19 * scale, 4 * scale, 5 * scale, 0, Math.PI * 2); ctx.fill();
  }
}

function drawHair(ctx: CanvasRenderingContext2D, style: number, color: string, scale: number, skin: string) {
  const top = -19 * scale;
  const left = -14 * scale;
  const width = 28 * scale;
  ctx.fillStyle = color;
  const scalpCap = (capColor = color, depth = 8) => {
    ctx.fillStyle = capColor;
    ctx.beginPath(); ctx.roundRect(left, top, width, depth * scale, 3 * scale); ctx.fill();
    ctx.fillRect(left, top + 4 * scale, 3 * scale, Math.max(2, depth - 3) * scale);
    ctx.fillRect(11 * scale, top + 4 * scale, 3 * scale, Math.max(2, depth - 3) * scale);
    ctx.fillStyle = color;
  };
  if (style === 12) return;
  if (style === 0) {
    scalpCap(color, 8);
    ctx.fillRect(left, top + 5 * scale, 4 * scale, 5 * scale);
    ctx.fillRect(10 * scale, top + 5 * scale, 4 * scale, 5 * scale);
  } else if (style === 1) {
    scalpCap(color, 8);
    ctx.beginPath(); ctx.moveTo(left, top + 6 * scale); ctx.lineTo(14 * scale, top + 6 * scale); ctx.lineTo(9 * scale, top + 11 * scale);
    ctx.lineTo(2 * scale, top + 7 * scale); ctx.lineTo(-4 * scale, top + 12 * scale); ctx.lineTo(-9 * scale, top + 7 * scale); ctx.closePath(); ctx.fill();
  } else if ([2, 21].includes(style)) {
    const curlRadius = style === 21 ? 4.8 : 4;
    const count = style === 21 ? 9 : 8;
    for (let index = 0; index < count; index += 1) {
      const x = left + (index + 0.5) * width / count;
      const y = top + (index % 2) * 2 * scale - (style === 21 ? 2 * scale : 0);
      ctx.beginPath(); ctx.arc(x, y, curlRadius * scale, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillRect(left, top + 1 * scale, width, 6 * scale);
  } else if (style === 3 || style === 15) {
    const crestHalf = (style === 3 ? 4.5 : 7) * scale;
    const crestTop = style === 3 ? top - 11 * scale : top - 7 * scale;
    const hairline = top + 9 * scale;
    ctx.beginPath();
    ctx.moveTo(-crestHalf, hairline);
    ctx.lineTo(-crestHalf, top + 1 * scale);
    ctx.quadraticCurveTo(-3 * scale, crestTop + 2 * scale, -1 * scale, crestTop);
    ctx.quadraticCurveTo(1 * scale, crestTop - 1 * scale, 3 * scale, crestTop + 2 * scale);
    ctx.lineTo(crestHalf, top + 1 * scale);
    ctx.lineTo(crestHalf, hairline);
    ctx.closePath();
    ctx.fill();
  } else if (style === 4) {
    ctx.beginPath(); ctx.arc(0, -15 * scale, 17 * scale, Math.PI, Math.PI * 2); ctx.fill();
    for (let index = 0; index < 9; index += 1) {
      const angle = Math.PI + Math.PI * index / 8;
      ctx.beginPath(); ctx.arc(Math.cos(angle) * 14 * scale, -14 * scale + Math.sin(angle) * 10 * scale, 5 * scale, 0, Math.PI * 2); ctx.fill();
    }
  } else if (style === 5 || style === 20) {
    scalpCap(shade(color, style === 20 ? 34 : 22), 6);
    if (style === 20) { ctx.fillStyle = color; ctx.fillRect(-10 * scale, top, 2 * scale, 8 * scale); ctx.fillRect(-5 * scale, top, 2 * scale, 8 * scale); }
  } else if (style === 6 || style === 9 || style === 16) {
    scalpCap(color, 6);
    const count = style === 9 ? 7 : style === 16 ? 8 : 5;
    for (let index = 0; index < count; index += 1) {
      const length = style === 9 ? 13 : style === 16 ? 8 + (index % 2) * 3 : 8 + (index % 2) * 4;
      ctx.fillRect((left + 1 * scale) + index * (width - 2 * scale) / count, top + 5 * scale, 2.2 * scale, length * scale);
    }
  } else if (style === 7 || style === 18) {
    scalpCap(shade(color, style === 18 ? 24 : 8), 7);
    ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(left, top + 7 * scale); ctx.lineTo(left + 4 * scale, top - 2 * scale); ctx.lineTo(left + width, top);
    ctx.lineTo(left + width, top + 7 * scale); ctx.lineTo(style === 18 ? 2 * scale : left + width, top + 7 * scale); ctx.closePath(); ctx.fill();
    if (style === 18) ctx.fillRect(9 * scale, top + 4 * scale, 5 * scale, 11 * scale);
  } else if (style === 8) {
    scalpCap(color, 7); ctx.beginPath(); ctx.moveTo(left, top + 7 * scale); ctx.lineTo(-8 * scale, top - 7 * scale); ctx.lineTo(9 * scale, top - 4 * scale); ctx.lineTo(14 * scale, top + 7 * scale); ctx.closePath(); ctx.fill();
  } else if (style === 10 || style === 19) {
    scalpCap(color, 9); ctx.beginPath(); ctx.arc((style === 19 ? 10 : 7) * scale, top - 4 * scale, 7 * scale, 0, Math.PI * 2); ctx.fill();
  } else if (style === 11) {
    scalpCap("#eee5c9", 8); ctx.fillStyle = color; ctx.fillRect(left, top + 5 * scale, 6 * scale, 5 * scale);
  } else if (style === 13) {
    scalpCap(color, 7); ctx.fillRect(-14 * scale, top + 5 * scale, 7 * scale, 19 * scale);
  } else if (style === 14) {
    ctx.beginPath(); ctx.arc(0, top + 5 * scale, 15 * scale, Math.PI, Math.PI * 2); ctx.fill(); ctx.fillRect(left, top + 3 * scale, width, 7 * scale);
  } else if (style === 17) {
    scalpCap(color, 7);
    ctx.beginPath(); ctx.moveTo(-2 * scale, top + 5 * scale); ctx.lineTo(14 * scale, top + 7 * scale); ctx.lineTo(10 * scale, 1 * scale); ctx.lineTo(2 * scale, -2 * scale); ctx.closePath(); ctx.fill();
  } else if (style === 22) {
    // Cascão 2002: tudo raspado menos o triângulo na frente. Raspado da leva
    // nova = cabelo misturado à pele (como barba por fazer), não só mais claro.
    scalpCap(mix(skin, color, .42), 6);
    ctx.beginPath(); ctx.moveTo(-4.8 * scale, -12.2 * scale); ctx.quadraticCurveTo(-1 * scale, -19.4 * scale, 0, -20 * scale);
    ctx.quadraticCurveTo(1 * scale, -19.4 * scale, 4.8 * scale, -12.2 * scale); ctx.closePath(); ctx.fill();
  } else if (style === 23) {
    ctx.beginPath(); ctx.roundRect(-15 * scale, -20 * scale, 30 * scale, 8.6 * scale, 4.5 * scale); ctx.fill();
    // Mechas da frente cobrem as orelhas e emolduram o rosto.
    ctx.beginPath();
    for (let side = -1; side <= 1; side += 2) {
      ctx.moveTo(side * 15 * scale, -16 * scale); ctx.lineTo(side * 11.4 * scale, -14 * scale); ctx.lineTo(side * 12 * scale, 3.5 * scale); ctx.lineTo(side * 16.6 * scale, 4.4 * scale); ctx.closePath();
    }
    ctx.fill();
    ctx.beginPath(); ctx.moveTo(-11.6 * scale, -12.4 * scale); ctx.lineTo(11.6 * scale, -12.4 * scale); ctx.lineTo(11.6 * scale, -9.2 * scale);
    ctx.lineTo(9.6 * scale, -9.6 * scale); ctx.quadraticCurveTo(2 * scale, -11.6 * scale, -11.6 * scale, -10.6 * scale); ctx.closePath(); ctx.fill();
  } else if (style === 24) {
    // Arrepiado: espetos pontudos, mais altos no meio.
    scalpCap(color, 7);
    ctx.beginPath();
    for (let index = 0; index < 7; index += 1) {
      const base = -12 + index * 4;
      const height = 6.4 - Math.abs(base) / 6 + (index % 2) * 1.4;
      ctx.moveTo((base - 2.9) * scale, -15.6 * scale); ctx.lineTo(base * 1.16 * scale, (-19 - height) * scale); ctx.lineTo((base + 2.9) * scale, -15.6 * scale); ctx.closePath();
    }
    ctx.fill();
  } else if (style === 25) {
    // Repartido: duas cortinas saindo da risca do meio até as têmporas.
    ctx.beginPath();
    for (let side = -1; side <= 1; side += 2) {
      ctx.moveTo(side * .5 * scale, -20.4 * scale); ctx.quadraticCurveTo(side * 14.6 * scale, -21.2 * scale, side * 15 * scale, -7.4 * scale);
      ctx.lineTo(side * 11.6 * scale, -8 * scale); ctx.quadraticCurveTo(side * 8.6 * scale, -13.4 * scale, side * .5 * scale, -15.4 * scale); ctx.closePath();
    }
    ctx.fill();
    ctx.fillStyle = shade(skin, -10); ctx.fillRect(-.5 * scale, -19.6 * scale, 1 * scale, 4.6 * scale);
  } else if (style === 26) {
    // Hi-top: caixa alta e reta em cima, lados raspados.
    scalpCap(mix(skin, color, .55), 7);
    ctx.beginPath(); ctx.moveTo(-10.6 * scale, -12.6 * scale); ctx.lineTo(-11.4 * scale, -25.2 * scale); ctx.lineTo(11.4 * scale, -25.2 * scale); ctx.lineTo(10.6 * scale, -12.6 * scale); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(color, 20); ctx.fillRect(-11.4 * scale, -25.2 * scale, 22.8 * scale, 1.2 * scale);
  } else if (style === 27) {
    // Nagô: fileiras da testa para a nuca, separadas por sulcos de couro cabeludo.
    scalpCap(color, 8);
    ctx.lineCap = "butt";
    ctx.strokeStyle = hairDetail(color); ctx.lineWidth = .5 * scale;
    ctx.beginPath();
    for (let index = 0; index < 6; index += 1) {
      const x = -11.5 + index * 4.6;
      for (let step = 1; step <= 3; step += 1) {
        const px = x * (1 - .38 * step / 4);
        const py = -11.4 - 7.2 * step / 4;
        ctx.moveTo((px - 1) * scale, (py - .7) * scale); ctx.lineTo((px + 1) * scale, (py + .5) * scale);
      }
    }
    ctx.stroke();
    ctx.strokeStyle = shade(skin, -14); ctx.lineWidth = 1.1 * scale;
    ctx.beginPath();
    for (let index = 0; index < 5; index += 1) {
      const x = -9.2 + index * 4.6;
      ctx.moveTo(x * scale, -11.2 * scale); ctx.lineTo(x * .62 * scale, -18.8 * scale);
    }
    ctx.stroke();
  } else if (style === 28) {
    // Dois coques no alto, com risca no meio.
    scalpCap(color, 8);
    ctx.beginPath(); ctx.arc(-9.4 * scale, -20.4 * scale, 5.3 * scale, 0, Math.PI * 2); ctx.moveTo(14.7 * scale, -20.4 * scale); ctx.arc(9.4 * scale, -20.4 * scale, 5.3 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = hairDetail(color); ctx.lineWidth = .8 * scale; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(-9.4 * scale, -20.4 * scale, 2.6 * scale, Math.PI * .9, Math.PI * 2.1); ctx.moveTo(12 * scale, -20.4 * scale); ctx.arc(9.4 * scale, -20.4 * scale, 2.6 * scale, 0, Math.PI * 1.1, true); ctx.stroke();
    ctx.fillStyle = shade(skin, -10); ctx.fillRect(-.5 * scale, -19 * scale, 1 * scale, 4.4 * scale);
  } else if (style === 29) {
    // Pra trás: entradas altas, volume atrás e marcas do pente.
    ctx.beginPath(); ctx.moveTo(-14 * scale, -9 * scale); ctx.lineTo(-14 * scale, -15 * scale); ctx.quadraticCurveTo(-14 * scale, -21.6 * scale, 0, -21.6 * scale);
    ctx.quadraticCurveTo(14 * scale, -21.6 * scale, 14 * scale, -15 * scale); ctx.lineTo(14 * scale, -9 * scale); ctx.lineTo(12.2 * scale, -9 * scale); ctx.lineTo(11.4 * scale, -12.4 * scale);
    ctx.quadraticCurveTo(0, -17.4 * scale, -11.4 * scale, -12.4 * scale); ctx.lineTo(-12.2 * scale, -9 * scale); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = hairDetail(color); ctx.lineWidth = .7 * scale; ctx.lineCap = "round";
    ctx.beginPath();
    for (let index = 0; index < 4; index += 1) {
      const x = -7.5 + index * 5;
      ctx.moveTo(x * scale, (-15.4 + x * x / 60) * scale); ctx.quadraticCurveTo(x * 1.05 * scale, -19 * scale, x * .7 * scale, -21 * scale);
    }
    ctx.stroke();
  } else if (style === 30) {
    // Moicano espetado: lados raspados e uma fileira de espetos em leque.
    scalpCap(mix(skin, color, .55), 6);
    ctx.fillRect(-3.4 * scale, -19.4 * scale, 6.8 * scale, 7.2 * scale);
    ctx.beginPath();
    for (let index = -2; index <= 2; index += 1) {
      const angle = index * .3;
      const length = 10.4 - Math.abs(index) * .3;
      const base = index * 1.5;
      ctx.moveTo((base - 2.1) * scale, -16.4 * scale);
      ctx.lineTo((base + Math.sin(angle) * length) * scale, (-17 - Math.cos(angle) * length) * scale);
      ctx.lineTo((base + 2.1) * scale, -16.4 * scale); ctx.closePath();
    }
    ctx.fill();
  } else if (style === 31) {
    // A frente do afro gigante: linha do cabelo cacheada sobre a testa.
    ctx.beginPath(); ctx.roundRect(-14.6 * scale, -21 * scale, 29.2 * scale, 8.6 * scale, 4 * scale);
    for (let index = 0; index < 6; index += 1) {
      const x = (-12 + index * 4.8) * scale;
      ctx.moveTo(x + 2.7 * scale, -12.6 * scale); ctx.arc(x, -12.6 * scale, 2.7 * scale, 0, Math.PI * 2);
    }
    ctx.fill();
  } else if (style === 32) {
    // Chanel: capacete arredondado até o queixo com franja reta.
    ctx.beginPath(); ctx.moveTo(-16.4 * scale, 6 * scale); ctx.lineTo(-16.4 * scale, -12 * scale); ctx.quadraticCurveTo(-16.4 * scale, -21.6 * scale, 0, -21.6 * scale);
    ctx.quadraticCurveTo(16.4 * scale, -21.6 * scale, 16.4 * scale, -12 * scale); ctx.lineTo(16.4 * scale, 6 * scale); ctx.lineTo(11.8 * scale, 6 * scale);
    ctx.lineTo(11.8 * scale, -11 * scale); ctx.lineTo(-11.8 * scale, -11 * scale); ctx.lineTo(-11.8 * scale, 6 * scale); ctx.closePath(); ctx.fill();
    ctx.fillStyle = shade(color, -18); ctx.fillRect(-11.8 * scale, -11.8 * scale, 23.6 * scale, .8 * scale);
  } else if (style === 33) {
    // Preso para trás na trança: liso em cima, puxado para o lado dela.
    scalpCap(color, 8);
    ctx.strokeStyle = hairDetail(color); ctx.lineWidth = .6 * scale; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(6 * scale, -12.4 * scale); ctx.quadraticCurveTo(-2 * scale, -18.6 * scale, -11 * scale, -15 * scale);
    ctx.moveTo(11 * scale, -13 * scale); ctx.quadraticCurveTo(2 * scale, -19.8 * scale, -12 * scale, -16.6 * scale); ctx.stroke();
  }
}

function drawKit(ctx: CanvasRenderingContext2D, pattern: number, primary: string, secondary: string, scale: number) {
  // Cada estampa pertence ao tecido. Sem este recorte, padrões rotacionados
  // (principalmente a faixa diagonal) continuam sendo pintados por trás do
  // pescoço e da cabeça, mesmo que o busto externo esteja dentro do disco.
  ctx.save();
  ctx.beginPath();
  ctx.rect(-22 * scale, 7 * scale, 44 * scale, 27 * scale);
  ctx.clip();
  ctx.fillStyle = primary; ctx.fillRect(-22 * scale, 7 * scale, 44 * scale, 27 * scale);
  ctx.fillStyle = secondary;
  switch (pattern) {
    case 0: ctx.fillRect(-5 * scale, 7 * scale, 10 * scale, 27 * scale); break;
    case 2: for (let x = -18; x <= 18; x += 9) ctx.fillRect(x * scale, 7 * scale, 4 * scale, 27 * scale); break;
    case 3: ctx.fillRect(0, 7 * scale, 22 * scale, 27 * scale); break;
    case 4:
      ctx.save(); ctx.translate(0, 20 * scale); ctx.rotate(-.56); ctx.fillRect(-4 * scale, -32 * scale, 8 * scale, 64 * scale); ctx.restore(); break;
    case 5:
      ctx.beginPath(); ctx.moveTo(-18 * scale, 10 * scale); ctx.lineTo(0, 20 * scale); ctx.lineTo(18 * scale, 10 * scale); ctx.lineTo(18 * scale, 15 * scale); ctx.lineTo(0, 25 * scale); ctx.lineTo(-18 * scale, 15 * scale); ctx.closePath(); ctx.fill(); break;
    case 6: ctx.fillRect(-22 * scale, 7 * scale, 44 * scale, 7 * scale); ctx.fillRect(-22 * scale, 7 * scale, 8 * scale, 14 * scale); ctx.fillRect(14 * scale, 7 * scale, 8 * scale, 14 * scale); break;
    case 7: for (let x = -19; x <= 19; x += 6) ctx.fillRect(x * scale, 7 * scale, 1.4 * scale, 27 * scale); break;
    case 8: ctx.fillRect(-22 * scale, 17 * scale, 44 * scale, 8 * scale); break;
    case 9:
      for (let y = 7; y < 34; y += 8) for (let x = -22; x < 22; x += 8) if (((x + 22) / 8 + (y - 7) / 8) % 2 === 0) ctx.fillRect(x * scale, y * scale, 8 * scale, 8 * scale); break;
    case 10: ctx.globalAlpha = .48; for (let y = 7; y < 34; y += 4) { ctx.globalAlpha += .07; ctx.fillRect(-22 * scale, y * scale, 44 * scale, 4 * scale); } ctx.globalAlpha = 1; break;
    case 11: ctx.fillRect(-22 * scale, 7 * scale, 9 * scale, 27 * scale); ctx.fillRect(13 * scale, 7 * scale, 9 * scale, 27 * scale); break;
  }
  ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.fillRect(-22 * scale, 7 * scale, 44 * scale, 2 * scale);
  ctx.restore();
}

function drawBeard(ctx: CanvasRenderingContext2D, beard: number, color: string, scale: number) {
  if (beard === 0) return;
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.35 * scale;
  ctx.lineCap = "round";

  if (beard === 1) {
    ctx.fillRect(-2.8 * scale, 7 * scale, 5.6 * scale, 4.8 * scale);
    ctx.fillRect(-4 * scale, 2.1 * scale, 3.2 * scale, 1.5 * scale);
    ctx.fillRect(.8 * scale, 2.1 * scale, 3.2 * scale, 1.5 * scale);
  } else if (beard === 2) {
    ctx.beginPath();
    ctx.moveTo(-12 * scale, -.5 * scale); ctx.lineTo(-7.5 * scale, 8.5 * scale);
    ctx.quadraticCurveTo(0, 13.2 * scale, 7.5 * scale, 8.5 * scale);
    ctx.lineTo(12 * scale, -.5 * scale); ctx.lineTo(10 * scale, 9.5 * scale);
    ctx.quadraticCurveTo(0, 15 * scale, -10 * scale, 9.5 * scale); ctx.closePath(); ctx.fill();
  } else if (beard === 3) {
    ctx.beginPath();
    ctx.moveTo(-7.5 * scale, 2 * scale); ctx.quadraticCurveTo(-4 * scale, .6 * scale, -.7 * scale, 2.7 * scale);
    ctx.quadraticCurveTo(-4 * scale, 4.4 * scale, -7.5 * scale, 2 * scale); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(7.5 * scale, 2 * scale); ctx.quadraticCurveTo(4 * scale, .6 * scale, .7 * scale, 2.7 * scale);
    ctx.quadraticCurveTo(4 * scale, 4.4 * scale, 7.5 * scale, 2 * scale); ctx.fill();
  } else if (beard === 4) {
    ctx.beginPath();
    ctx.moveTo(-11 * scale, 3 * scale); ctx.lineTo(-8 * scale, 8.5 * scale);
    ctx.quadraticCurveTo(0, 12.2 * scale, 8 * scale, 8.5 * scale); ctx.lineTo(11 * scale, 3 * scale);
    ctx.lineTo(9 * scale, 9.8 * scale); ctx.quadraticCurveTo(0, 14 * scale, -9 * scale, 9.8 * scale); ctx.closePath(); ctx.fill();
  } else if (beard === 5) {
    ctx.fillRect(-11 * scale, 1 * scale, 2.2 * scale, 7.5 * scale);
    ctx.fillRect(8.8 * scale, 1 * scale, 2.2 * scale, 7.5 * scale);
    ctx.beginPath(); ctx.arc(0, 8.2 * scale, 4.3 * scale, 0, Math.PI); ctx.stroke();
    ctx.fillRect(-2.1 * scale, 8.1 * scale, 4.2 * scale, 3.5 * scale);
  } else if (beard === 6) {
    ctx.fillRect(-7 * scale, 2.1 * scale, 5.8 * scale, 1.1 * scale);
    ctx.fillRect(1.2 * scale, 2.1 * scale, 5.8 * scale, 1.1 * scale);
  } else if (beard === 8) {
    // Barba longa: cobre a mandíbula e desce bem abaixo do queixo, por cima da camisa.
    ctx.beginPath();
    ctx.moveTo(-13.8 * scale, -2 * scale); ctx.lineTo(-13.8 * scale, 6 * scale); ctx.quadraticCurveTo(-12.6 * scale, 15.6 * scale, -4.2 * scale, 18.8 * scale);
    ctx.quadraticCurveTo(0, 20.4 * scale, 4.2 * scale, 18.8 * scale); ctx.quadraticCurveTo(12.6 * scale, 15.6 * scale, 13.8 * scale, 6 * scale); ctx.lineTo(13.8 * scale, -2 * scale);
    ctx.lineTo(11 * scale, -2 * scale); ctx.lineTo(9 * scale, 4.2 * scale); ctx.quadraticCurveTo(0, 12.6 * scale, -9 * scale, 4.2 * scale); ctx.lineTo(-11 * scale, -2 * scale); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-8.6 * scale, 4.6 * scale); ctx.quadraticCurveTo(-4.4 * scale, .9 * scale, 0, 2.3 * scale); ctx.quadraticCurveTo(4.4 * scale, .9 * scale, 8.6 * scale, 4.6 * scale);
    ctx.quadraticCurveTo(0, 2.9 * scale, -8.6 * scale, 4.6 * scale); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,.22)"; ctx.lineWidth = .7 * scale;
    ctx.beginPath(); ctx.moveTo(-6 * scale, 11 * scale); ctx.lineTo(-4.2 * scale, 16.4 * scale); ctx.moveTo(0, 12.4 * scale); ctx.lineTo(0, 18.4 * scale); ctx.moveTo(6 * scale, 11 * scale); ctx.lineTo(4.2 * scale, 16.4 * scale); ctx.stroke();
  } else if (beard === 9) {
    // Costeletas: só a faixa na frente da orelha, até a linha da mandíbula.
    ctx.beginPath();
    for (let side = -1; side <= 1; side += 2) {
      ctx.moveTo(side * 14 * scale, -11 * scale); ctx.lineTo(side * 11.2 * scale, -11 * scale); ctx.lineTo(side * 10.8 * scale, 1.6 * scale); ctx.lineTo(side * 12.4 * scale, 4.4 * scale); ctx.lineTo(side * 14 * scale, 3.6 * scale); ctx.closePath();
    }
    ctx.fill();
  } else if (beard === 10) {
    // Ferradura: bigode com as duas barras descendo até a mandíbula.
    ctx.beginPath();
    ctx.moveTo(-7.4 * scale, 3.2 * scale); ctx.quadraticCurveTo(-4 * scale, 1.2 * scale, 0, 2.3 * scale); ctx.quadraticCurveTo(4 * scale, 1.2 * scale, 7.4 * scale, 3.2 * scale);
    ctx.lineTo(7.4 * scale, 10.6 * scale); ctx.lineTo(5.4 * scale, 10.6 * scale); ctx.lineTo(5.4 * scale, 4.2 * scale); ctx.quadraticCurveTo(0, 3 * scale, -5.4 * scale, 4.2 * scale);
    ctx.lineTo(-5.4 * scale, 10.6 * scale); ctx.lineTo(-7.4 * scale, 10.6 * scale); ctx.closePath(); ctx.fill();
  } else if (beard === 11) {
    // Contorno: um fio fino acompanhando a mandíbula de orelha a orelha.
    ctx.beginPath(); ctx.moveTo(-13 * scale, -4 * scale); ctx.lineTo(-13 * scale, 5 * scale); ctx.quadraticCurveTo(-13 * scale, 9.2 * scale, -9 * scale, 9.2 * scale);
    ctx.lineTo(9 * scale, 9.2 * scale); ctx.quadraticCurveTo(13 * scale, 9.2 * scale, 13 * scale, 5 * scale); ctx.lineTo(13 * scale, -4 * scale); ctx.stroke();
  } else {
    const dots = [[-9,3],[-5,5],[-1,7],[3,6],[7,4],[-7,8],[-3,10],[2,10],[6,8],[-10,6],[10,6]];
    for (const [x, y] of dots) { ctx.globalAlpha = .72; ctx.beginPath(); ctx.arc(x * scale, y * scale, .85 * scale, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

export function drawPlayerBust(
  ctx: CanvasRenderingContext2D,
  appearanceValue: PlayerAppearance,
  primary: string,
  secondary: string,
  radius: number,
  contentOffsetY = 0,
) {
  const appearance = normalizePlayerAppearance(appearanceValue);
  const skin = appearance.customSkinColor ?? SKIN_COLORS[appearance.skin];
  const hair = appearance.customHairColor ?? HAIR_COLORS[appearance.hairColor];
  const eyes = appearance.customEyeColor ?? EYE_COLORS[appearance.eyeColor];
  const scale = radius / 28;
  const accent = accessoryColorOf(appearance);
  // Boné e bandana cobrem o alto da cabeça: moicano, black power, coques etc. não atravessam.
  const capped = appearance.headwear === 3 || appearance.headwear === 4;

  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = shade(primary, -24); ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  ctx.translate(0, contentOffsetY);
  drawKit(ctx, appearance.kitPattern, primary, secondary, scale);
  ctx.fillStyle = shade(skin, -12); ctx.fillRect(-4 * scale, 4 * scale, 8 * scale, 8 * scale);
  if (capped) clipBelowCap(ctx, scale);
  drawHairBack(ctx, appearance.hairStyle, hair, scale);
  if (capped) ctx.restore();
  ctx.fillStyle = skin; ctx.beginPath(); ctx.roundRect(-14 * scale, -17 * scale, 28 * scale, 27 * scale, 4 * scale); ctx.fill();
  ctx.fillStyle = shade(skin, -13); ctx.fillRect(-15 * scale, -8 * scale, 2 * scale, 7 * scale); ctx.fillRect(13 * scale, -8 * scale, 2 * scale, 7 * scale);
  ctx.fillStyle = eyes; ctx.fillRect(-8 * scale, -6 * scale, 4 * scale, 3.5 * scale); ctx.fillRect(4 * scale, -6 * scale, 4 * scale, 3.5 * scale);
  drawBrows(ctx, appearance.brow, appearance.face, shade(hair, 12), skin, scale);
  ctx.fillStyle = shade(skin, -18); ctx.fillRect(-1.5 * scale, -2 * scale, 3 * scale, 5 * scale);
  drawFaceMark(ctx, appearance.faceMark ?? 0, skin, accent, scale);
  if (capped) clipBelowCap(ctx, scale);
  drawHair(ctx, appearance.hairStyle, hair, scale, skin);
  if (capped) ctx.restore();
  drawBeard(ctx, appearance.beard, shade(hair, -5), scale);
  drawEyewear(ctx, appearance.eyewear ?? 0, accent, scale);
  drawEarrings(ctx, appearance.earrings ?? 0, scale);
  drawHeadwear(ctx, appearance.headwear ?? 0, accent, scale);
  const mouth = shade(skin, -56);
  ctx.strokeStyle = mouth; ctx.fillStyle = mouth; ctx.lineWidth = 1.7 * scale; ctx.lineCap = "round";
  if (appearance.face === 0) ctx.fillRect(-5 * scale, 4 * scale, 10 * scale, 1.6 * scale);
  else if (appearance.face === 1) { ctx.beginPath(); ctx.moveTo(-5 * scale, 5 * scale); ctx.quadraticCurveTo(1 * scale, 7 * scale, 6 * scale, 3 * scale); ctx.stroke(); }
  else if (appearance.face === 2) { ctx.beginPath(); ctx.arc(0, 2.6 * scale, 3.8 * scale, .08, Math.PI - .08); ctx.stroke(); }
  else if (appearance.face === 3) { ctx.fillRect(-4 * scale, 4 * scale, 8 * scale, 2.3 * scale); }
  else if (appearance.face === 4) { ctx.beginPath(); ctx.arc(0, 3 * scale, 3 * scale, .2, Math.PI - .2); ctx.stroke(); }
  else if (appearance.face === 5) { ctx.beginPath(); ctx.ellipse(0, 5 * scale, 2.7 * scale, 3.4 * scale, 0, 0, Math.PI * 2); ctx.fill(); }
  else if (appearance.face === 6) { ctx.fillStyle = "#f5eee2"; ctx.fillRect(-4.5 * scale, 3.2 * scale, 9 * scale, 3.5 * scale); ctx.fillStyle = mouth; ctx.fillRect(-4.5 * scale, 6 * scale, 9 * scale, 1.1 * scale); }
  else if (appearance.face === 7) { ctx.beginPath(); ctx.moveTo(-3 * scale, 5 * scale); ctx.quadraticCurveTo(0, 2.4 * scale, 3 * scale, 5 * scale); ctx.quadraticCurveTo(0, 7 * scale, -3 * scale, 5 * scale); ctx.fill(); }
  else if (appearance.face === 8) { ctx.beginPath(); ctx.moveTo(-4.5 * scale, 5.3 * scale); ctx.quadraticCurveTo(-.5 * scale, 7.4 * scale, 4.5 * scale, 3 * scale); ctx.stroke(); }
  else if (appearance.face === 9) {
    // Sorrisão: boca aberta com a fileira de dentes e a língua no fundo.
    ctx.beginPath(); ctx.moveTo(-6.6 * scale, 2.6 * scale); ctx.quadraticCurveTo(0, 3.8 * scale, 6.6 * scale, 2.6 * scale); ctx.quadraticCurveTo(0, 14.4 * scale, -6.6 * scale, 2.6 * scale); ctx.fill();
    ctx.fillStyle = "#c4545a"; ctx.beginPath(); ctx.ellipse(0, 7.2 * scale, 2.8 * scale, 1.1 * scale, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f5eee2"; ctx.beginPath(); ctx.moveTo(-5.8 * scale, 3 * scale); ctx.quadraticCurveTo(0, 4.1 * scale, 5.8 * scale, 3 * scale);
    ctx.lineTo(5 * scale, 4.5 * scale); ctx.quadraticCurveTo(0, 5.6 * scale, -5 * scale, 4.5 * scale); ctx.closePath(); ctx.fill();
  } else { ctx.beginPath(); ctx.moveTo(-4.2 * scale, 5.2 * scale); ctx.lineTo(1 * scale, 5.2 * scale); ctx.quadraticCurveTo(3.8 * scale, 5.1 * scale, 5 * scale, 3.2 * scale); ctx.stroke(); }
  ctx.restore();
}

/** Aba do boné / barra da bandana: acima dela o cabelo some; o que cai pelos lados e pela nuca fica. */
const CAP_LINE = -13.4;

function clipBelowCap(ctx: CanvasRenderingContext2D, scale: number) {
  ctx.save();
  ctx.beginPath(); ctx.rect(-40 * scale, CAP_LINE * scale, 80 * scale, 80 * scale); ctx.clip();
}

function drawBrows(ctx: CanvasRenderingContext2D, brow: number, face: number, color: string, skin: string, scale: number) {
  // 0..2 continuam idênticas (o índice também descia a sobrancelha); "Com risco"
  // e "Grossa" ficam na altura da "Reta".
  const browY = (-10 + (brow > 2 ? 1 : brow)) * scale;
  const thickness = (brow === 4 ? 2.6 : 1.6) * scale;
  const y = brow === 4 ? browY - .5 * scale : browY;
  ctx.fillStyle = color;
  if (face === 10) {
    // Desconfiado: a sobrancelha esquerda sobe e arqueia.
    ctx.strokeStyle = color; ctx.lineWidth = thickness; ctx.lineCap = "butt";
    ctx.beginPath(); ctx.moveTo(-9.2 * scale, y + thickness / 2 - 1.4 * scale); ctx.quadraticCurveTo(-6.6 * scale, y + thickness / 2 - 3.6 * scale, -3 * scale, y + thickness / 2 - 2 * scale); ctx.stroke();
  } else ctx.fillRect(-9 * scale, y, 6 * scale, thickness);
  ctx.fillRect(3 * scale, y, 6 * scale, thickness);
  if (brow === 3) {
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.moveTo(5.3 * scale, y - .3 * scale); ctx.lineTo(6.5 * scale, y - .3 * scale); ctx.lineTo(5.9 * scale, y + 1.9 * scale); ctx.lineTo(4.7 * scale, y + 1.9 * scale); ctx.closePath(); ctx.fill();
  }
}

/** Sardas: pares x,y nas bochechas e no nariz. */
const FRECKLE_DOTS = [-10.2, -.6, -8.4, .5, -6.6, -.4, -9.4, 1.9, -7.2, 1.5, 6.6, -.4, 8.4, .5, 10.2, -.6, 9.4, 1.9, 7.2, 1.5, -.8, -.8, .9, .1];

function drawFaceMark(ctx: CanvasRenderingContext2D, mark: number, skin: string, accent: string, scale: number) {
  if (mark === 1) {
    ctx.fillStyle = shade(skin, -46); ctx.globalAlpha = .55;
    ctx.beginPath();
    for (let index = 0; index < FRECKLE_DOTS.length; index += 2) {
      ctx.moveTo((FRECKLE_DOTS[index] + .45) * scale, FRECKLE_DOTS[index + 1] * scale); ctx.arc(FRECKLE_DOTS[index] * scale, FRECKLE_DOTS[index + 1] * scale, .45 * scale, 0, Math.PI * 2);
    }
    ctx.fill(); ctx.globalAlpha = 1;
  } else if (mark === 2) {
    ctx.fillStyle = shade(skin, -70); ctx.beginPath(); ctx.arc(7.6 * scale, .4 * scale, .8 * scale, 0, Math.PI * 2); ctx.fill();
  } else if (mark === 3) {
    // Cicatriz cortando a sobrancelha esquerda: contorno escuro com o miolo claro.
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-7.9 * scale, -12.4 * scale); ctx.lineTo(-5.2 * scale, -6.6 * scale);
    ctx.strokeStyle = shade(skin, -34); ctx.lineWidth = 1.3 * scale; ctx.stroke();
    ctx.strokeStyle = shade(skin, 30); ctx.lineWidth = .6 * scale; ctx.stroke();
  } else if (mark === 4) {
    ctx.fillStyle = "#121212";
    ctx.beginPath(); ctx.roundRect(-8.8 * scale, -1.9 * scale, 5.6 * scale, 1.7 * scale, .6 * scale); ctx.roundRect(3.2 * scale, -1.9 * scale, 5.6 * scale, 1.7 * scale, .6 * scale); ctx.fill();
  } else if (mark === 5) {
    // Pintura de guerra: dois riscos inclinados em cada bochecha.
    ctx.fillStyle = accent;
    ctx.beginPath();
    for (let side = -1; side <= 1; side += 2) {
      for (let row = 0; row < 2; row += 1) {
        const y = row * 2.4;
        ctx.moveTo(side * 11.8 * scale, (y + .2) * scale); ctx.lineTo(side * 6.6 * scale, (y - .9) * scale); ctx.lineTo(side * 6.6 * scale, (y + .5) * scale); ctx.lineTo(side * 11.8 * scale, (y + 1.6) * scale); ctx.closePath();
      }
    }
    ctx.fill();
  }
}

function drawEyewear(ctx: CanvasRenderingContext2D, eyewear: number, accent: string, scale: number) {
  if (eyewear === 1) {
    // Óculos esportivo: tira na cor do acessório e lentes claras que deixam ver os olhos.
    ctx.fillStyle = accent; ctx.fillRect(-14.6 * scale, -5.4 * scale, 29.2 * scale, 1.8 * scale);
    ctx.beginPath(); ctx.roundRect(-10.6 * scale, -7.6 * scale, 9.6 * scale, 6.6 * scale, 2.6 * scale); ctx.roundRect(1 * scale, -7.6 * scale, 9.6 * scale, 6.6 * scale, 2.6 * scale);
    ctx.fillStyle = "rgba(200,230,250,.5)"; ctx.fill();
    ctx.strokeStyle = "#23272e"; ctx.lineWidth = 1.6 * scale; ctx.stroke();
    ctx.fillStyle = "#23272e"; ctx.fillRect(-1.6 * scale, -6 * scale, 3.2 * scale, 1.8 * scale);
    ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = .6 * scale; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-8.4 * scale, -5.6 * scale); ctx.lineTo(-7 * scale, -4.2 * scale); ctx.moveTo(2.8 * scale, -5.6 * scale); ctx.lineTo(4.2 * scale, -4.2 * scale); ctx.stroke();
  } else if (eyewear === 2) {
    // Máscara protetora preta: nariz e maçãs do rosto, com os furos dos olhos.
    ctx.fillStyle = "#141518";
    ctx.beginPath();
    ctx.moveTo(-13.6 * scale, -7.2 * scale); ctx.lineTo(13.6 * scale, -7.2 * scale); ctx.lineTo(13.6 * scale, -1.6 * scale); ctx.quadraticCurveTo(9 * scale, .4 * scale, 3.2 * scale, -.4 * scale);
    ctx.lineTo(2.4 * scale, 1.8 * scale); ctx.lineTo(-2.4 * scale, 1.8 * scale); ctx.lineTo(-3.2 * scale, -.4 * scale); ctx.quadraticCurveTo(-9 * scale, .4 * scale, -13.6 * scale, -1.6 * scale); ctx.closePath();
    ctx.roundRect(-8.9 * scale, -6.7 * scale, 5.8 * scale, 4.7 * scale, 1.6 * scale); ctx.roundRect(3.1 * scale, -6.7 * scale, 5.8 * scale, 4.7 * scale, 1.6 * scale);
    ctx.fill("evenodd");
    // Brilho do carbono no contorno e no nariz: sem ele a máscara some em pele escura.
    ctx.strokeStyle = "rgba(255,255,255,.26)"; ctx.lineWidth = .6 * scale; ctx.lineCap = "round"; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -6.2 * scale); ctx.lineTo(0, 1 * scale); ctx.stroke();
  } else if (eyewear === 3) {
    // Óculos escuros: lentes pretas, armação fina na cor do acessório.
    ctx.beginPath(); ctx.roundRect(-9.6 * scale, -7 * scale, 7.2 * scale, 5.2 * scale, 1.6 * scale); ctx.roundRect(2.4 * scale, -7 * scale, 7.2 * scale, 5.2 * scale, 1.6 * scale);
    ctx.fillStyle = "#15181d"; ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = .6 * scale; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2.4 * scale, -5.8 * scale); ctx.quadraticCurveTo(0, -6.8 * scale, 2.4 * scale, -5.8 * scale);
    ctx.moveTo(-9.6 * scale, -6 * scale); ctx.lineTo(-14 * scale, -5.4 * scale); ctx.moveTo(9.6 * scale, -6 * scale); ctx.lineTo(14 * scale, -5.4 * scale); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.4)"; ctx.lineWidth = .6 * scale; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(-8.2 * scale, -5.8 * scale); ctx.lineTo(-6.8 * scale, -4.4 * scale); ctx.moveTo(3.8 * scale, -5.8 * scale); ctx.lineTo(5.2 * scale, -4.4 * scale); ctx.stroke();
  }
}

function drawEarrings(ctx: CanvasRenderingContext2D, earrings: number, scale: number) {
  if (earrings === 0) return;
  // "Brinco" fica só na orelha esquerda da tela; os outros dois vão nas duas.
  for (let side = -1; side <= 1; side += 2) {
    if (earrings === 1 && side === 1) continue;
    if (earrings === 3) {
      ctx.strokeStyle = "#f2c94c"; ctx.lineWidth = .85 * scale;
      ctx.beginPath(); ctx.arc(side * 14.2 * scale, .6 * scale, 1.8 * scale, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.fillStyle = "#f2c94c"; ctx.beginPath(); ctx.arc(side * 14 * scale, -1.6 * scale, 1.1 * scale, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fffbe6"; ctx.beginPath(); ctx.arc((side * 14 - .35) * scale, -1.95 * scale, .45 * scale, 0, Math.PI * 2); ctx.fill();
    }
  }
}

/** Bolinhas da estampa da bandana: pares x,y. */
const BANDANA_DOTS = [-9, -18, -3, -20.4, 4, -19, 9.6, -16, -11.2, -14.8, .6, -15.8];

function drawHeadwear(ctx: CanvasRenderingContext2D, headwear: number, color: string, scale: number) {
  if (headwear === 0) return;
  // Estampa/logo: escura em cor clara, clara em cor escura.
  const ink = lightness(color) > 150 ? "rgba(20,20,24,.5)" : "rgba(255,255,255,.62)";
  ctx.fillStyle = color;
  if (headwear === 1) {
    // Faixa esportiva na testa, por cima do cabelo, logo acima das sobrancelhas.
    ctx.beginPath(); ctx.moveTo(-14.8 * scale, -14.8 * scale); ctx.quadraticCurveTo(0, -16 * scale, 14.8 * scale, -14.8 * scale);
    ctx.lineTo(14.8 * scale, -11.6 * scale); ctx.quadraticCurveTo(0, -12.8 * scale, -14.8 * scale, -11.6 * scale); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = .6 * scale;
    ctx.beginPath(); ctx.moveTo(-14.8 * scale, -13.2 * scale); ctx.quadraticCurveTo(0, -14.4 * scale, 14.8 * scale, -13.2 * scale); ctx.stroke();
  } else if (headwear === 2) {
    // Tiara: arco fino deitado sobre o cabelo, de têmpora a têmpora, um pouco
    // atrás da linha do cabelo (descendo até a orelha vira fone de ouvido).
    ctx.strokeStyle = color; ctx.lineWidth = 1.7 * scale; ctx.lineCap = "round";
    ctx.beginPath(); ctx.ellipse(0, -11 * scale, 13.8 * scale, 7.6 * scale, 0, Math.PI * 1.06, Math.PI * 1.94); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = .5 * scale;
    ctx.beginPath(); ctx.ellipse(0, -11 * scale, 13.8 * scale, 8 * scale, 0, Math.PI * 1.25, Math.PI * 1.75); ctx.stroke();
  } else if (headwear === 3) {
    // Bandana: cobre o alto da cabeça e amarra do lado direito da tela.
    ctx.beginPath(); ctx.moveTo(-15 * scale, -11.8 * scale); ctx.lineTo(-15 * scale, -15 * scale); ctx.quadraticCurveTo(-15 * scale, -22.6 * scale, 0, -22.6 * scale);
    ctx.quadraticCurveTo(15 * scale, -22.6 * scale, 15 * scale, -15 * scale); ctx.lineTo(15 * scale, -11.8 * scale); ctx.quadraticCurveTo(0, -13.6 * scale, -15 * scale, -11.8 * scale); ctx.closePath();
    ctx.moveTo(17.2 * scale, -13 * scale); ctx.arc(15.3 * scale, -13 * scale, 1.9 * scale, 0, Math.PI * 2);
    ctx.moveTo(15.6 * scale, -13.6 * scale); ctx.lineTo(20.2 * scale, -9.4 * scale); ctx.lineTo(18.4 * scale, -8 * scale); ctx.closePath();
    ctx.moveTo(15 * scale, -12.6 * scale); ctx.lineTo(17.4 * scale, -6.4 * scale); ctx.lineTo(15.4 * scale, -6.2 * scale); ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = shade(color, -40); ctx.lineWidth = 1 * scale;
    ctx.beginPath(); ctx.moveTo(-15 * scale, -12.5 * scale); ctx.quadraticCurveTo(0, -14.3 * scale, 15 * scale, -12.5 * scale); ctx.stroke();
    ctx.fillStyle = ink; ctx.beginPath();
    for (let index = 0; index < BANDANA_DOTS.length; index += 2) {
      ctx.moveTo((BANDANA_DOTS[index] + .7) * scale, BANDANA_DOTS[index + 1] * scale); ctx.arc(BANDANA_DOTS[index] * scale, BANDANA_DOTS[index + 1] * scale, .7 * scale, 0, Math.PI * 2);
    }
    ctx.fill();
  } else if (headwear === 4) {
    // Boné: copa com gomos e botão, aba para a frente.
    ctx.beginPath(); ctx.moveTo(-15 * scale, CAP_LINE * scale); ctx.lineTo(-15 * scale, -16 * scale); ctx.quadraticCurveTo(-15 * scale, -25.4 * scale, 0, -25.4 * scale);
    ctx.quadraticCurveTo(15 * scale, -25.4 * scale, 15 * scale, -16 * scale); ctx.lineTo(15 * scale, CAP_LINE * scale); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = shade(color, -34); ctx.lineWidth = .55 * scale;
    ctx.beginPath(); ctx.moveTo(0, -25.2 * scale); ctx.quadraticCurveTo(-5.4 * scale, -22 * scale, -6.4 * scale, -13.8 * scale); ctx.moveTo(0, -25.2 * scale); ctx.quadraticCurveTo(5.4 * scale, -22 * scale, 6.4 * scale, -13.8 * scale); ctx.stroke();
    ctx.fillStyle = shade(color, -22); ctx.beginPath(); ctx.arc(0, -25.1 * scale, 1.1 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ink; ctx.beginPath(); ctx.roundRect(-2.2 * scale, -20.2 * scale, 4.4 * scale, 2.6 * scale, .8 * scale); ctx.fill();
    ctx.fillStyle = shade(color, -14);
    ctx.beginPath(); ctx.moveTo(-15.8 * scale, -13.6 * scale); ctx.quadraticCurveTo(0, -15 * scale, 15.8 * scale, -13.6 * scale); ctx.quadraticCurveTo(0, -7.6 * scale, -15.8 * scale, -13.6 * scale); ctx.fill();
    ctx.strokeStyle = shade(color, -46); ctx.lineWidth = .8 * scale;
    ctx.beginPath(); ctx.moveTo(-15.4 * scale, -13.4 * scale); ctx.quadraticCurveTo(0, -7.8 * scale, 15.4 * scale, -13.4 * scale); ctx.stroke();
  }
}
