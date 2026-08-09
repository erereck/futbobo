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
export const EYE_COLORS = ["#111816", "#35251d", "#31505b", "#49633c", "#765139", "#7c8f98", "#5c3f76"];
export const HAIR_STYLE_NAMES = [
  "Clássico", "Franja", "Cacheado", "Moicano", "Black power", "Raspado", "Tranças", "Lateral", "Topete", "Dreads", "Coque", "Descolorido", "Careca",
  "Mullet", "Corte tigelinha", "Faux hawk", "Twists", "Franja longa", "Undercut", "Rabo de cavalo", "Risca dupla", "Mini afro",
];
export const BEARD_NAMES = ["Sem barba", "Cavanhaque", "Barba cheia", "Bigode", "Barba curta", "Barba desenhada", "Bigode fino", "Barba por fazer"];
export const FACE_NAMES = ["Sério", "Confiante", "Sorriso", "Concentrado", "Tranquilo", "Surpreso", "Dentes à mostra", "Bico", "Sorriso torto"];
export const KIT_PATTERN_NAMES = ["Faixa central", "Liso", "Listras", "Metade a metade", "Faixa diagonal", "Chevrons", "Ombros", "Pinstripes", "Faixa horizontal", "Quadriculado", "Degradê", "Mangas contrastantes"];

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
    beard: clampIndex(value?.beard ?? DEFAULT_PLAYER_APPEARANCE.beard, BEARD_NAMES.length),
    brow: clampIndex(value?.brow ?? DEFAULT_PLAYER_APPEARANCE.brow, 3),
    kitPattern: clampIndex(value?.kitPattern ?? DEFAULT_PLAYER_APPEARANCE.kitPattern, KIT_PATTERN_NAMES.length),
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
  return {
    version: 2,
    skin: Math.floor(random() * SKIN_COLORS.length),
    hairColor: Math.floor(random() * HAIR_COLORS.length),
    eyeColor: Math.floor(random() * EYE_COLORS.length),
    hairStyle: Math.floor(random() * HAIR_STYLE_NAMES.length),
    face: Math.floor(random() * FACE_NAMES.length),
    beard: random() < 0.58 ? 0 : 1 + Math.floor(random() * (BEARD_NAMES.length - 1)),
    brow: Math.floor(random() * 3),
    kitPattern: 1,
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
    const weighted = [5, 6, 6, 7, 7, 7, 8, 8, 9, 9];
    appearance.skin = weighted[Math.floor(random() * weighted.length)];
    appearance.hairColor = random() < 0.92 ? 0 : 1;
    appearance.hairStyle = [2, 4, 5, 6, 9, 16, 20, 21][Math.floor(random() * 8)];
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

function shade(hex: string, amount: number) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean, 16);
  const red = Math.max(0, Math.min(255, (value >> 16) + amount));
  const green = Math.max(0, Math.min(255, ((value >> 8) & 255) + amount));
  const blue = Math.max(0, Math.min(255, (value & 255) + amount));
  return `rgb(${red},${green},${blue})`;
}

function drawHairBack(ctx: CanvasRenderingContext2D, style: number, color: string, scale: number) {
  ctx.fillStyle = color;
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

function drawHair(ctx: CanvasRenderingContext2D, style: number, color: string, scale: number) {
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
  }
}

function drawKit(ctx: CanvasRenderingContext2D, pattern: number, primary: string, secondary: string, scale: number) {
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
) {
  const appearance = normalizePlayerAppearance(appearanceValue);
  const skin = appearance.customSkinColor ?? SKIN_COLORS[appearance.skin];
  const hair = appearance.customHairColor ?? HAIR_COLORS[appearance.hairColor];
  const eyes = appearance.customEyeColor ?? EYE_COLORS[appearance.eyeColor];
  const scale = radius / 28;

  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = shade(primary, -24); ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  drawKit(ctx, appearance.kitPattern, primary, secondary, scale);
  ctx.fillStyle = shade(skin, -12); ctx.fillRect(-4 * scale, 4 * scale, 8 * scale, 8 * scale);
  drawHairBack(ctx, appearance.hairStyle, shade(hair, -7), scale);
  ctx.fillStyle = skin; ctx.beginPath(); ctx.roundRect(-14 * scale, -17 * scale, 28 * scale, 27 * scale, 4 * scale); ctx.fill();
  ctx.fillStyle = shade(skin, -13); ctx.fillRect(-15 * scale, -8 * scale, 2 * scale, 7 * scale); ctx.fillRect(13 * scale, -8 * scale, 2 * scale, 7 * scale);
  ctx.fillStyle = eyes; ctx.fillRect(-8 * scale, -6 * scale, 4 * scale, 3.5 * scale); ctx.fillRect(4 * scale, -6 * scale, 4 * scale, 3.5 * scale);
  ctx.fillStyle = shade(hair, 12); const browY = (-10 + appearance.brow) * scale; ctx.fillRect(-9 * scale, browY, 6 * scale, 1.6 * scale); ctx.fillRect(3 * scale, browY, 6 * scale, 1.6 * scale);
  ctx.fillStyle = shade(skin, -18); ctx.fillRect(-1.5 * scale, -2 * scale, 3 * scale, 5 * scale);
  drawHair(ctx, appearance.hairStyle, hair, scale);
  drawBeard(ctx, appearance.beard, shade(hair, -5), scale);
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
  else { ctx.beginPath(); ctx.moveTo(-4.5 * scale, 5.3 * scale); ctx.quadraticCurveTo(-.5 * scale, 7.4 * scale, 4.5 * scale, 3 * scale); ctx.stroke(); }
  ctx.restore();
}
