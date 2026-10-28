// Contas e paletas comuns da cena do Scorebobo (metros, segundos).

import * as THREE from "three";

export const TAU = Math.PI * 2;

export function clamp(value: number, min: number, max: number) {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function smooth(t: number) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

export function smoother(t: number) {
  const x = clamp01(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** Amortecimento exponencial independente da taxa de quadros (`rate` ≈ 1/tempo de reação). */
export function damp(current: number, target: number, rate: number, dt: number) {
  return target + (current - target) * Math.exp(-rate * dt);
}

export function dampVec(current: THREE.Vector3, target: THREE.Vector3, rate: number, dt: number) {
  const k = 1 - Math.exp(-rate * dt);
  current.x += (target.x - current.x) * k;
  current.y += (target.y - current.y) * k;
  current.z += (target.z - current.z) * k;
  return current;
}

export function angleDiff(from: number, to: number) {
  let delta = (to - from) % TAU;
  if (delta > Math.PI) delta -= TAU;
  if (delta < -Math.PI) delta += TAU;
  return delta;
}

/** Hash 0..1 estável a partir de dois números (sem estado). */
export function hash2(a: number, b: number) {
  const value = Math.sin(a * 127.1 + b * 311.7 + 74.7) * 43758.5453;
  return value - Math.floor(value);
}

/** Hash de texto (ids dos bonecos) para escolhas estáveis. */
export function hashString(text: string) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Gerador pseudoaleatório com semente (mulberry32). */
export function seeded(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function mixHex(a: string, b: string, t: number) {
  return "#" + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}

/** Ruído suave 1D (soma de senos com fases fixas): balanço de câmera na mão. */
export function wobble(t: number, seed: number) {
  return (
    Math.sin(t * 1.13 + seed * 1.7) * 0.5 +
    Math.sin(t * 2.31 + seed * 4.1) * 0.3 +
    Math.sin(t * 0.47 + seed * 2.9) * 0.6
  ) / 1.4;
}

// ------------------------------------------------------------ céu e luz

export type SkyKind = "day" | "sunset" | "night";

export type SkyLook = {
  zenith: string;
  horizon: string;
  /** Faixa logo acima do horizonte (brilho da cidade à noite, laranja no pôr do sol). */
  glow: string;
  sunColor: string;
  /** De onde vem a luz principal (sol ou refletores), já normalizada. */
  keyDir: THREE.Vector3;
  keyColor: string;
  keyIntensity: number;
  /** Contraluz/segundo refletor do lado oposto (sem sombra): traves e rostos não ficam pretos. */
  fillColor: string;
  fillIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fog: string;
  fogNear: number;
  fogFar: number;
  exposure: number;
  stars: number;
  clouds: number;
  /** 0..1: refletores e luzes do teto acesos. */
  lights: number;
  /** Sombra do estádio sobre o gramado (meio-plano ao longo de x): borda e força. */
  standShadow: { edge: number; strength: number; soft: number };
  /** Disco do sol visível (0 à noite). */
  sunDisc: number;
  /** Escurece arquibancada/torcida (sem luz direta nelas). */
  standLight: number;
};

export const SKY_LOOKS: Record<SkyKind, SkyLook> = {
  day: {
    zenith: "#2f78d6",
    horizon: "#cfe6ff",
    glow: "#f4f8ff",
    sunColor: "#fff3d6",
    keyDir: new THREE.Vector3(-0.42, 0.82, -0.38).normalize(),
    keyColor: "#fff1dc",
    keyIntensity: 2.6,
    fillColor: "#cfe2ff",
    fillIntensity: 0.45,
    hemiSky: "#cfe7ff",
    hemiGround: "#3d5a2c",
    hemiIntensity: 1.25,
    fog: "#c4dcf2",
    fogNear: 140,
    fogFar: 900,
    exposure: 1.0,
    stars: 0,
    clouds: 0.75,
    lights: 0,
    standShadow: { edge: -27, strength: 0.26, soft: 2.5 },
    sunDisc: 1,
    standLight: 0.95,
  },
  sunset: {
    zenith: "#26315f",
    horizon: "#ff9a5a",
    glow: "#ffcf8a",
    sunColor: "#ffb36b",
    keyDir: new THREE.Vector3(-0.86, 0.3, 0.42).normalize(),
    keyColor: "#ffbf80",
    keyIntensity: 3.4,
    fillColor: "#9fb4ff",
    fillIntensity: 0.6,
    hemiSky: "#a7b4e0",
    hemiGround: "#5a4630",
    hemiIntensity: 1.25,
    fog: "#c2917a",
    fogNear: 120,
    fogFar: 760,
    exposure: 1.12,
    stars: 0.15,
    clouds: 0.85,
    lights: 0.65,
    standShadow: { edge: -21, strength: 0.38, soft: 4 },
    sunDisc: 1,
    standLight: 0.8,
  },
  night: {
    zenith: "#03060f",
    horizon: "#16223a",
    glow: "#3b4a6a",
    sunColor: "#9fb6ff",
    keyDir: new THREE.Vector3(0.36, 0.86, -0.36).normalize(),
    // Noite de verdade: o gramado aceso pelos refletores (luz branca e dura), o
    // resto no escuro — céu, arquibancada e o ambiente bem mais baixos.
    keyColor: "#f4f7ff",
    keyIntensity: 2.75,
    fillColor: "#dfe8ff",
    fillIntensity: 1.05,
    hemiSky: "#3e5482",
    hemiGround: "#14241a",
    hemiIntensity: 0.6,
    fog: "#070c18",
    fogNear: 120,
    fogFar: 700,
    exposure: 1.02,
    stars: 1,
    clouds: 0.25,
    lights: 1,
    standShadow: { edge: 0, strength: 0, soft: 1 },
    sunDisc: 0,
    standLight: 0.32,
  },
};

/**
 * Uniforms de ambiente que todos os materiais próprios leem (neblina, luz
 * principal, hemisfério): um objeto só, trocado pela fase e pelo céu.
 */
export function createEnvUniforms() {
  return {
    uTime: { value: 0 },
    uFogColor: { value: new THREE.Color("#000000") },
    uFogNear: { value: 100 },
    uFogFar: { value: 800 },
    uKeyDir: { value: new THREE.Vector3(0, 1, 0) },
    uKeyColor: { value: new THREE.Color("#ffffff") },
    uHemiSky: { value: new THREE.Color("#ffffff") },
    uHemiGround: { value: new THREE.Color("#333333") },
    uStandLight: { value: 1 },
    uLights: { value: 0 },
  };
}

export type EnvUniforms = ReturnType<typeof createEnvUniforms>;

/** Neblina linear igual à THREE.Fog, para os shaders próprios (fragment). */
export const ENV_FOG = /* glsl */ `
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
vec3 envFog(vec3 color, float depth) {
  float f = smoothstep(uFogNear, uFogFar, depth);
  return mix(color, uFogColor, f);
}
`;

/** Luz simples (hemisfério + principal com meia-lambert) para multidão e afins. */
export const ENV_LIGHT = /* glsl */ `
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uHemiSky;
uniform vec3 uHemiGround;
uniform float uStandLight;
vec3 envLight(vec3 albedo, vec3 n) {
  float up = n.y * 0.5 + 0.5;
  vec3 hemi = mix(uHemiGround, uHemiSky, up) * 0.55;
  float lambert = max(dot(n, uKeyDir), 0.0);
  return albedo * (hemi + uKeyColor * lambert * 0.75) * uStandLight;
}
`;

export function applyEnv(env: EnvUniforms, look: SkyLook) {
  env.uFogColor.value.set(look.fog);
  env.uFogNear.value = look.fogNear;
  env.uFogFar.value = look.fogFar;
  env.uKeyDir.value.copy(look.keyDir);
  env.uKeyColor.value.set(look.keyColor).multiplyScalar(look.keyIntensity / 2.5);
  env.uHemiSky.value.set(look.hemiSky).multiplyScalar(look.hemiIntensity);
  env.uHemiGround.value.set(look.hemiGround).multiplyScalar(look.hemiIntensity);
  env.uStandLight.value = look.standLight;
  env.uLights.value = look.lights;
}

/** Libera tudo que pendurou num grupo (geometrias, materiais e texturas dos materiais). */
export function disposeTree(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (!material) return;
    for (const item of Array.isArray(material) ? material : [material]) {
      for (const value of Object.values(item)) if (value instanceof THREE.Texture) textures.add(value);
      const uniforms = (item as THREE.ShaderMaterial).uniforms;
      if (uniforms) for (const uniform of Object.values(uniforms)) if (uniform && uniform.value instanceof THREE.Texture) textures.add(uniform.value);
      item.dispose();
    }
  });
  for (const texture of textures) texture.dispose();
}

/** Textura radial suave (brilhos, sombras de contato). */
export function radialTexture(stops: Array<[number, string]>, size = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
