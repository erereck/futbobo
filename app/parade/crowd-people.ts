// Multidão da festa do título: milhares de torcedores de blocos (mesmo traço
// dos bonecos da partida: cabeça 8, corpo 8×12×4, braços e pernas 4×12×4)
// animados inteiros no vertex shader.
//
// Como cabe no celular:
// - Perto do trio (uma janela de ~150 m que anda com ele) a multidão é 3D: um
//   draw call só para todos os bonecos. Cada torcedor tem um x fixo "módulo a
//   janela": quando o trio avança, quem sai por trás reaparece na frente, sempre
//   no mesmo ponto do mundo enquanto está à vista.
// - No resto da avenida, a mesma multidão vira pontos (sprites de boneco
//   desenhados no fragment shader): um vértice por pessoa.
// - Na borda da janela as duas versões trocam por sorteio por pessoa, sem uma
//   linha reta onde a qualidade muda.
// Bandeiras, cartazes, faixas e lanternas de celular seguem a mão de quem as
// segura porque usam as MESMAS funções de pose (CROWD_COMMON).

import * as THREE from "three";
import { SKIN_COLORS } from "../player-appearance";
import type { AvenueLayout } from "./stage-city";
import type { ParadeTimeOfDay } from "./parade-script";
import {
  GeoBuilder,
  ORDINAL_SHOUTS,
  PARADE_FRAGMENT_END,
  PARADE_LIGHT_PARS,
  drawStar,
  fitFont,
  litUniforms,
  luminanceOf,
  pick,
  rng,
  shade,
  tooClose,
  trackDrawingBuffer,
  trackFogFade,
  type Random,
} from "./crowd-kit";

/** `truckZ` é opcional (faixa do trio na pista); sem ele, o povo olha para o meio da avenida. */
export type CrowdState = { truckX: number; excitement: number; beat: number; truckZ?: number };

export type CrowdBuild = {
  group: THREE.Group;
  /**
   * `truckX`: onde o trio está (a multidão perto dele pula mais e vira para
   * ele); `excitement` 0..1: até ~0,85 só esquenta quem está longe do trio,
   * acima disso (estouro da taça) a avenida inteira pula; `beat` 0..1 da
   * música (cada subida forte acerta o compasso do pulo).
   */
  update(time: number, dt: number, state: CrowdState): void;
  dispose(): void;
};

export type CrowdArgs = {
  avenue: AvenueLayout;
  /** Cores da seleção [principal, secundária] + a do calção/terceira. */
  colors: [string, string, string];
  seed: number;
  variant: number;
  timeOfDay: ParadeTimeOfDay;
  performance: boolean;
  /** Nome do jogador para faixas/cartazes na multidão. */
  playerName: string;
  playerNumber: number;
  /** Opcional: estrelas da seleção com este título ("É PENTA!"). Sem isso, "É CAMPEÃO!". */
  stars?: number;
  /** Opcional: altura da calçada onde o povo pisa (m). Padrão 0,15 (a guia que a cidade monta). */
  groundY?: number;
  /** Opcional: bandeiras com losango e círculo (só o Brasil). Padrão true; false vira tricolor. */
  lozenge?: boolean;
};

// ------------------------------------------------------------ shaders

/** Uniforms que todo material da multidão lê (um objeto só, atualizado uma vez por quadro). */
export function createCrowdUniforms() {
  return {
    uTime: { value: 0 },
    uBeatPhase: { value: 0 },
    uTruckX: { value: -1e4 },
    uTruckZ: { value: 0 },
    uExcite: { value: 0 },
    /** Início da janela 3D, comprimento, faixa de troca 3D/pontos, comprimento da avenida. */
    uWin: { value: new THREE.Vector4(0, 150, 12, 600) },
    uGround: { value: 0 },
    /** Brilho próprio fraco: a cor da camisa não vira lama na sombra nem à noite. */
    uSelfLight: { value: 0.06 },
  };
}

export type CrowdUniforms = ReturnType<typeof createCrowdUniforms>;

/**
 * Pose dos torcedores, compartilhada por bonecos, bandeiras, cartazes e
 * celulares. Comportamentos (b): 0 pula, 1 acena, 2 bandeira, 3 palmas,
 * 4 celular, 5 nos ombros de alguém, 6 cartaz/faixa, 7 segurança, 8 roda a
 * camisa, 9 carrega alguém nos ombros.
 */
export const CROWD_COMMON = /* glsl */ `
uniform float uTime;
uniform float uBeatPhase;
uniform float uTruckX;
uniform float uTruckZ;
uniform float uExcite;
uniform vec4 uWin;
uniform float uGround;
#define CROWD_TAU 6.2831853
const vec3 CROWD_SHOULDER = vec3(0.328, 1.203, 0.0);
const vec3 CROWD_NECK = vec3(0.0, 1.3125, 0.0);
vec3 crowdRotX(vec3 p, vec2 cs) { return vec3(p.x, p.y * cs.x - p.z * cs.y, p.y * cs.y + p.z * cs.x); }
vec3 crowdRotZ(vec3 p, vec2 cs) { return vec3(p.x * cs.x - p.y * cs.y, p.x * cs.y + p.y * cs.x, p.z); }
vec2 crowdCs(float a) { return vec2(cos(a), sin(a)); }
// x no mundo de quem mora na janela 3D (fixo enquanto a janela passa por ele).
float crowdWrapX(float x0) { return uWin.x + mod(x0 - uWin.x, uWin.y); }
// 1 = aparece em 3D: some na beira da janela por sorteio e fora da avenida.
float crowdShown(float x, float r) {
  float edge = min(x - uWin.x, uWin.x + uWin.y - x) / uWin.z;
  return step(r, edge) * step(0.0, x) * step(x, uWin.w);
}
float crowdNear(float x) { float d = (x - uTruckX) / 26.0; return exp(-d * d); }
// O diretor manda empolgação alta o tempo todo (0,5..0,9): longe do trio ela só
// esquenta; perto dele e no estouro da taça (acima de 0,85) vira loucura geral.
float crowdHype(float x) { return clamp(crowdNear(x) * 0.85 + uExcite * 0.5 + max(0.0, uExcite - 0.85) * 2.0, 0.0, 1.0); }
float crowdBeatT(float phase) { return fract(uBeatPhase - phase * 0.14); }
// Pulo na primeira metade do compasso: sobe e desce em parábola, pousa no tempo forte.
float crowdHop(float phase) { float q = clamp(crowdBeatT(phase) * 2.0, 0.0, 1.0); return 4.0 * q * (1.0 - q); }
float crowdLift(float b, float phase, float energy, float hype) {
  float hop = crowdHop(phase);
  if (b > 6.5 && b < 7.5) return 0.0;
  if ((b > 4.5 && b < 5.5) || b > 8.5) return 0.05 * hop;
  float jumper = b < 0.5 ? 1.0 : smoothstep(0.55, 0.95, hype) * step(0.95, energy);
  return hop * mix(0.035, mix(0.08, 0.44, hype) * energy, jumper);
}
// Braço do lado s (-1 esquerdo, +1 direito): (giro para a frente, giro lateral já com sinal).
vec2 crowdArm(float b, float s, float phase, float energy, float hype) {
  float hop = crowdHop(phase);
  float wob = sin(uTime * (2.4 + energy * 1.8) + phase * CROWD_TAU);
  float ax = 0.0;
  float az = 0.1 + 0.08 * hop;
  float sweep = 0.0;
  float frenzy = smoothstep(0.62, 1.0, hype);
  if (b < 0.5) {
    float up = clamp(hype * 1.5 + energy - 1.0, 0.0, 1.0);
    az = mix(0.22 + 0.25 * hop, 2.5 + 0.4 * hop, up);
    ax = 0.2 * up;
  } else if (b < 1.5) {
    az = 2.5; ax = 0.15; sweep = 0.5 * wob;
  } else if (b < 2.5) {
    if (s > 0.0) { az = 2.72; ax = 0.12; } else { az = 0.35 + 0.4 * hop; }
    frenzy = 0.0;
  } else if (b < 3.5) {
    float open = 0.5 + 0.5 * cos(crowdBeatT(phase) * CROWD_TAU * 2.0);
    az = mix(-0.5, 0.2, open); ax = -1.25;
  } else if (b < 4.5) {
    if (s > 0.0) { az = 0.12; ax = -2.2 + 0.06 * wob; } else { az = 0.1; ax = -0.1; }
    frenzy = 0.0;
  } else if (b < 5.5) {
    az = 2.55; ax = 0.1; sweep = 0.45 * sin(uTime * 4.2 + phase * CROWD_TAU);
  } else if (b < 6.5) {
    az = 2.85; ax = 0.38 + 0.08 * hop;
    frenzy = 0.0;
  } else if (b < 7.5) {
    az = -0.5; ax = -1.15; frenzy = 0.0;
  } else if (b < 8.5) {
    float spin = uTime * 7.5 + phase * CROWD_TAU;
    if (s > 0.0) { az = 2.8 + 0.22 * sin(spin); ax = 0.3 * cos(spin); } else { az = 0.3 + 0.2 * hop; }
  } else {
    az = 0.15; ax = -1.0; frenzy = 0.0;
  }
  az = mix(az, 2.55 + 0.35 * hop, frenzy);
  ax = mix(ax, 0.2, frenzy);
  sweep *= 1.0 - frenzy;
  return vec2(ax, s * az + sweep);
}
// Para onde olha (xz): para a pista, virando para o trio quando ele passa.
vec2 crowdFacing(float yaw, float x, float z, float b) {
  vec2 base = vec2(sin(yaw), cos(yaw));
  if (b > 6.5 && b < 7.5) return base;
  vec2 toTruck = vec2(uTruckX - x, uTruckZ - z);
  toTruck /= max(length(toTruck), 0.001);
  vec2 fwd = mix(base, toTruck, crowdNear(x) * 0.8);
  return fwd / max(length(fwd), 0.001);
}
// Do espaço do boneco (frente = +z) para o mundo.
vec3 crowdToWorld(vec3 p, vec2 fwd) { return vec3(p.x * fwd.y + p.z * fwd.x, p.y, -p.x * fwd.x + p.z * fwd.y); }
// Mão (ponta do braço) do lado s, escala 1.
vec3 crowdHand(vec2 arm, float s) {
  return crowdRotX(crowdRotZ(vec3(0.0, -0.62, 0.0), crowdCs(arm.y)), crowdCs(arm.x)) + vec3(CROWD_SHOULDER.x * s, CROWD_SHOULDER.y, 0.0);
}
`;

const FAN_PARS = /* glsl */ `
${CROWD_COMMON}
attribute float aPart;
attribute vec4 aFan;
attribute vec4 aAct;
attribute vec4 aShirt;
attribute vec4 aTrim;
attribute vec4 aSkin;
attribute vec4 aHair;
varying vec3 vCwA;
varying vec3 vCwB;
varying vec3 vCwC;
varying vec4 vCwLocal;
varying vec4 vCwStyle;
const float CW_P = 0.0546875;
`;

// Pose por vértice. aFan = (x na janela, z, rumo base, escala); aAct = (fase,
// energia, comportamento, altura extra de quem está nos ombros).
const FAN_POSE = /* glsl */ `
float cwPart = aPart;
float cwX = crowdWrapX(aFan.x);
float cwShown = crowdShown(cwX, aHair.w);
float cwHype = crowdHype(cwX);
float cwBeh = aAct.z;
vec2 cwFwd = crowdFacing(aFan.z, cwX, aFan.y, cwBeh);
float cwLift = crowdLift(cwBeh, aAct.x, aAct.y, cwHype);
float cwSign = cwPart < 2.5 ? -1.0 : 1.0;
bool cwArm = cwPart > 1.5 && cwPart < 3.5;
bool cwHead = cwPart > 0.5 && cwPart < 1.5;
vec2 cwArmPose = cwArm ? crowdArm(cwBeh, cwSign, aAct.x, aAct.y, cwHype) : vec2(0.0);
vec2 cwCsX = crowdCs(cwArmPose.x);
vec2 cwCsZ = crowdCs(cwArmPose.y);
// Quem está perto do trio olha para cima, para o deck.
float cwPitch = cwBeh > 6.5 && cwBeh < 7.5 ? 0.0 : -0.42 * crowdNear(cwX) - 0.1 * crowdHop(aAct.x);
vec2 cwCsHead = crowdCs(cwPitch);
float cwSway = 0.06 * sin(uTime * 1.7 + aAct.x * 9.0);
vec2 cwCsSway = vec2(1.0 - 0.5 * cwSway * cwSway, cwSway);
vec3 cwShoulder = vec3(CROWD_SHOULDER.x * cwSign, CROWD_SHOULDER.y, 0.0);
vec3 cwN = objectNormal;
if (cwArm) cwN = crowdRotX(crowdRotZ(cwN, cwCsZ), cwCsX);
else if (cwHead) cwN = crowdRotX(cwN, cwCsHead);
objectNormal = crowdToWorld(crowdRotZ(cwN, cwCsSway), cwFwd);
`;

const FAN_MOVE = /* glsl */ `
vec3 cwP = transformed;
vec3 cwCenter = cwPart < 0.5 ? vec3(0.0, 18.0, 0.0) : cwHead ? vec3(0.0, 28.0, 0.0) : cwPart < 3.5 ? vec3(6.0 * cwSign, 18.0, 0.0) : vec3(0.0, 6.0, 0.0);
vec3 cwHalf = cwHead ? vec3(4.0) : cwArm ? vec3(2.0, 6.0, 2.0) : vec3(4.0, 6.0, 2.0);
vCwLocal = vec4((cwP / CW_P - cwCenter) / cwHalf, cwPart);
if (cwArm) cwP = crowdRotX(crowdRotZ(cwP - cwShoulder, cwCsZ), cwCsX) + cwShoulder;
else if (cwHead) cwP = crowdRotX(cwP - CROWD_NECK, cwCsHead) + CROWD_NECK;
cwP = crowdRotZ(cwP, cwCsSway) * aFan.w;
// Oclusão de mentira: no meio do povo, da cintura para baixo é sombra.
float cwAo = mix(0.58, 1.0, smoothstep(0.1, 1.3, cwP.y + aAct.w));
vec3 cwRoot = vec3(cwX, uGround + aAct.w + cwLift, aFan.y);
// Quem vai nos ombros senta um pouco atrás da cabeça de quem carrega.
bool cwRider = cwBeh > 4.5 && cwBeh < 5.5;
if (cwRider) cwRoot -= vec3(cwFwd.x, 0.0, cwFwd.y) * 0.3;
transformed = crowdToWorld(cwP, cwFwd) + cwRoot;
if (cwShown < 0.5 || (cwRider && cwPart > 3.5)) transformed = vec3(cwX, -60.0, aFan.y);
float cwStyle = floor(aShirt.w * 255.0 + 0.5);
float cwFlags = floor(aTrim.w * 255.0 + 0.5);
vCwStyle = vec4(cwStyle, cwHype, cwAo, step(1.5, cwFlags));
vec3 cwPants = aSkin.w < 0.1 ? vec3(0.033, 0.06, 0.14) : aSkin.w < 0.5 ? vec3(0.014, 0.016, 0.02) : aSkin.w < 0.9 ? vec3(0.25, 0.2, 0.11) : vec3(0.1, 0.17, 0.33);
if (cwPart < 0.5) { vCwA = aShirt.rgb; vCwB = aTrim.rgb; vCwC = aSkin.rgb; }
else if (cwHead) { vCwA = aSkin.rgb; vCwB = aHair.rgb; vCwC = aTrim.rgb; vCwStyle.x = mod(cwFlags, 2.0); }
else if (cwArm) { vCwA = cwStyle > 2.5 && cwStyle < 3.5 ? aSkin.rgb : aShirt.rgb; vCwB = aSkin.rgb; vCwC = aTrim.rgb; }
else { vCwA = cwPants; vCwB = vec3(0.02); vCwC = vCwB; }
`;

const FAN_FRAGMENT_PARS = /* glsl */ `
uniform float uSelfLight;
varying vec3 vCwA;
varying vec3 vCwB;
varying vec3 vCwC;
varying vec4 vCwLocal;
varying vec4 vCwStyle;
vec3 crowdPaint() {
  vec3 L = vCwLocal.xyz;
  float part = vCwLocal.w;
  vec3 col = vCwA;
  if (part < 0.5) {
    float st = vCwStyle.x;
    float front = step(0.9, L.z);
    if (st < 0.5) {
      // Camisa da seleção: gola em V e punho de cor.
      float collar = front * step(0.62 + abs(L.x) * 0.9, L.y) * step(abs(L.x), 0.55);
      col = mix(col, vCwB, collar);
      col = mix(col, vCwB, front * step(abs(L.x - 0.45), 0.12) * step(abs(L.y - 0.45), 0.12));
    } else if (st < 1.5) {
      col = mix(col, vCwB, step(0.5, fract(L.x * 1.25 + 0.25)));
    } else if (st < 2.5) {
      col = mix(col, vCwB, step(abs(L.y - 0.2), 0.22));
    } else if (st < 3.5) {
      // Sem camisa, com o peito pintado.
      col = mix(vCwC, vCwB, step(abs(L.y + L.x * 0.7), 0.28));
    }
  } else if (part < 1.5) {
    float cap = vCwStyle.x;
    float front = step(0.96, L.z);
    float back = step(L.z, -0.2);
    float hairLine = mix(0.6, 0.32, cap);
    float hair = max(step(0.97, L.y), step(hairLine, L.y));
    hair = max(hair, back * step(mix(-0.2, 0.25, cap), L.y));
    hair = max(hair, step(L.z, -0.96) * step(-0.55, L.y));
    col = mix(col, vCwB, hair);
    float face = front * (1.0 - hair);
    float eyes = step(-0.12, L.y) * step(L.y, 0.16) * step(0.2, abs(L.x)) * step(abs(L.x), 0.5);
    col = mix(col, vec3(0.03, 0.025, 0.02), face * eyes);
    float open = 0.1 + 0.3 * vCwStyle.y;
    float mouth = step(abs(L.x), 0.22) * step(L.y, -0.42) * step(-0.42 - open, L.y);
    col = mix(col, vec3(0.22, 0.03, 0.03), face * mouth);
    float paint = vCwStyle.w * step(0.55, abs(L.x)) * step(abs(L.y + 0.22), 0.1);
    col = mix(col, vCwC, face * paint);
  } else if (part < 3.5) {
    col = mix(vCwA, vCwB, step(L.y, 0.15));
  } else {
    col = mix(vCwA, vCwB, step(L.y, -0.8));
  }
  return col * vCwStyle.z;
}
`;

// ------------------------------------------------------------ geometria

/** Boneco de torcedor em metros (1,75 m), com a peça de cada vértice em `aPart`. */
function fanGeometry() {
  const P = 1.75 / 32;
  const builder = new GeoBuilder({ aPart: 1 });
  builder.set("aPart", 4).box(0, 6 * P, 0, 8 * P, 12 * P, 4 * P, "tb");
  builder.set("aPart", 0).box(0, 18 * P, 0, 8 * P, 12 * P, 4 * P, "b");
  builder.set("aPart", 1).box(0, 28 * P, 0, 8 * P, 8 * P, 8 * P, "b");
  builder.set("aPart", 2).box(-6 * P, 18 * P, 0, 4 * P, 12 * P, 4 * P, "t");
  builder.set("aPart", 3).box(6 * P, 18 * P, 0, 4 * P, 12 * P, 4 * P, "t");
  return builder.build();
}

/** Mastro (aPart 0, de y 0 a 1) + pano em grade (aPart 1, uv: u do mastro para fora, v de cima para baixo). */
export function flagGeometry(columns = 8, rows = 5) {
  const builder = new GeoBuilder({ aPart: 1 });
  builder.set("aPart", 0).box(0, 0.5, 0, 0.04, 1, 0.04, "b");
  builder.set("aPart", 1);
  const first = builder.vertexCount;
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const v = row / rows;
      builder.vertex(u, -v, 0, 0, 0, 1, u, v);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = first + row * (columns + 1) + column;
      const b = a + 1;
      const c = a + columns + 1;
      const d = c + 1;
      builder.triangle(a, c, b);
      builder.triangle(b, c, d);
    }
  }
  return builder.build();
}

function instanced(base: THREE.BufferGeometry, keep: string[], count: number) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  for (const name of keep) {
    const attribute = base.getAttribute(name);
    if (attribute) geometry.setAttribute(name, attribute);
  }
  geometry.instanceCount = count;
  return geometry;
}

function floatAttribute(data: number[], size: number) {
  return new THREE.InstancedBufferAttribute(new Float32Array(data), size);
}

function byteAttribute(data: number[], size: number) {
  return new THREE.InstancedBufferAttribute(new Uint8Array(data), size, true);
}

// ------------------------------------------------------------ bandeiras

/** Pano e mastro. aFlag = (modo, desenho, largura, altura); modo 0 na mão de torcedor, 1 bandeirão sobre o povo, 2 fixo (trio). */
const FLAG_PARS = /* glsl */ `
${CROWD_COMMON}
attribute float aPart;
attribute vec4 aFan;
attribute vec4 aAct;
attribute vec4 aFlag;
varying vec2 vFlagUv;
varying vec2 vFlagKind;
vec3 flagP;
vec3 flagN;
float flagWave(vec2 w) {
  float t = uTime;
  return 0.24 * sin(w.x * 0.8 - t * 2.4 + w.y * 0.5) + 0.16 * sin(w.y * 1.4 + t * 1.9 + w.x * 0.35)
    + 0.22 * max(0.0, sin(w.x * 2.1 + t * 3.3) * sin(w.y * 1.7 - t * 2.6));
}
void flagCompute(vec3 pos, vec3 nor, vec2 uvIn) {
  float mode = aFlag.x;
  float w = aFlag.z;
  float h = aFlag.w;
  float t = uTime;
  vFlagUv = uvIn;
  vFlagKind = vec2(aPart, aFlag.y);
  if (mode > 1.5) {
    // No trio: o vento do caminho joga o pano para trás (-x).
    if (aPart < 0.5) { flagP = aFan.xyz + vec3(pos.x, pos.y * aFan.w, pos.z); flagN = nor; return; }
    float ph = uvIn.x * 7.0 - t * 9.0 + aAct.x * CROWD_TAU;
    float amp = 0.1 * w * uvIn.x;
    flagP = aFan.xyz + vec3(-uvIn.x * w, aFan.w - 0.04 - uvIn.y * h - uvIn.x * uvIn.x * 0.06 * w, sin(ph) * amp);
    float dzdx = (cos(ph) * 7.0 * amp + sin(ph) * 0.1 * w) / -w;
    flagN = normalize(vec3(-dzdx, 0.0, 1.0));
    return;
  }
  float x = crowdWrapX(aFan.x);
  float shown = crowdShown(x, aAct.w);
  if (mode > 0.5) {
    // Bandeirão: pano enorme passando por cima das cabeças, ondas no mundo.
    if (aPart < 0.5 || shown < 0.5) { flagP = vec3(x, -60.0, aFan.y); flagN = nor; return; }
    vec2 local = vec2((uvIn.x - 0.5) * w, (uvIn.y - 0.5) * h);
    vec2 world = vec2(x, aFan.y) + local;
    float e = 0.3;
    float dx = flagWave(world + vec2(e, 0.0)) - flagWave(world - vec2(e, 0.0));
    float dz = flagWave(world + vec2(0.0, e)) - flagWave(world - vec2(0.0, e));
    vec2 edge = abs(uvIn - 0.5) * 2.0;
    float droop = 0.35 * (edge.x * edge.x * edge.x * edge.x + edge.y * edge.y * edge.y * edge.y);
    flagP = vec3(world.x, uGround + 2.2 + flagWave(world) - droop + 0.08 * crowdHop(aAct.x), world.y);
    flagN = normalize(vec3(-dx, 2.0 * e, -dz));
    return;
  }
  float hype = crowdHype(x);
  vec2 fwd = crowdFacing(aFan.z, x, aFan.y, 2.0);
  float lift = crowdLift(2.0, aAct.x, aAct.y, hype);
  vec3 hand = crowdHand(crowdArm(2.0, 1.0, aAct.x, aAct.y, hype), 1.0) * aFan.w;
  float poleLength = h + 0.9;
  float tilt = (0.5 + 0.2 * hype) * sin(t * (2.0 + aAct.y) + aAct.x * CROWD_TAU) + 0.12;
  vec2 tiltCs = crowdCs(tilt);
  vec3 local;
  vec3 localN;
  if (aPart < 0.5) {
    local = vec3(pos.x, pos.y * poleLength - 0.3, pos.z);
    localN = nor;
  } else {
    float ph = uvIn.x * 5.5 - t * 7.0 + aAct.x * CROWD_TAU;
    float amp = 0.16 * w * uvIn.x;
    local = vec3(uvIn.x * w, poleLength - 0.33 - uvIn.y * h - uvIn.x * uvIn.x * 0.1 * w, sin(ph) * amp);
    float dzdx = (cos(ph) * 5.5 * amp + sin(ph) * 0.16 * w) / w;
    localN = normalize(vec3(-dzdx, 0.0, 1.0));
  }
  flagP = crowdToWorld(crowdRotZ(local, tiltCs) + hand, fwd) + vec3(x, uGround + lift, aFan.y);
  flagN = crowdToWorld(crowdRotZ(localN, tiltCs), fwd);
  if (shown < 0.5) flagP = vec3(x, -60.0, aFan.y);
}
`;

const FLAG_FRAGMENT_PARS = /* glsl */ `
uniform float uSelfLight;
uniform vec3 uFlagA;
uniform vec3 uFlagB;
uniform vec3 uFlagC;
uniform float uLozenge;
varying vec2 vFlagUv;
varying vec2 vFlagKind;
vec3 flagPaint() {
  if (vFlagKind.x < 0.5) return vec3(0.62, 0.62, 0.6);
  vec2 uv = vFlagUv;
  float p = vFlagKind.y;
  if (p < 0.5) return uv.y < 0.334 ? uFlagA : uv.y < 0.667 ? uFlagB : uFlagC;
  if (p < 1.5) return uv.x < 0.334 ? uFlagA : uv.x < 0.667 ? uFlagB : uFlagA;
  if (p < 2.5) return abs(uv.x - uv.y) < 0.17 ? uFlagB : uFlagA;
  // Fora do Brasil o losango vira tricolor vertical (losango em azul e branco lê como Brasil errado).
  if (uLozenge < 0.5) return uv.x < 0.334 ? uFlagA : uv.x < 0.667 ? uFlagC : uFlagB;
  // Campo, losango e círculo.
  vec2 q = abs(uv - 0.5);
  float lozenge = step(q.x / 0.42 + q.y / 0.4, 1.0);
  float disc = step(length((uv - 0.5) * vec2(1.5, 1.0)), 0.21);
  return mix(mix(uFlagB, uFlagA, lozenge), uFlagC, disc);
}
`;

/** Material das bandeiras (multidão e trio usam o mesmo programa). */
export function createFlagMaterial(colors: [string, string, string], uniforms: CrowdUniforms, lozenge = true) {
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const own = {
    uLozenge: { value: lozenge ? 1 : 0 },
    uFlagA: { value: new THREE.Color(colors[0]) },
    uFlagB: { value: new THREE.Color(colors[1]) },
    uFlagC: { value: new THREE.Color(colors[2]) },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, own);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${FLAG_PARS}`)
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nflagCompute(position, normal, uv);\nobjectNormal = flagN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed = flagP;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FLAG_FRAGMENT_PARS}`)
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = flagPaint();")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uSelfLight;");
  };
  material.customProgramCacheKey = () => "parade-flag";
  return material;
}

/** Cores da bandeira: a terceira não pode sumir na primeira. */
export function flagColors(colors: [string, string, string]): [string, string, string] {
  const third = tooClose(colors[2], colors[0]) || tooClose(colors[2], colors[1]) ? (luminanceOf(colors[0]) > 0.5 ? "#1d3f8f" : "#ffffff") : colors[2];
  const second = tooClose(colors[1], colors[0]) ? (luminanceOf(colors[0]) > 0.5 ? "#16233d" : "#ffffff") : colors[1];
  return [colors[0], second, third];
}

// ------------------------------------------------------------ faixas e cartazes

const BANNER_PARS = /* glsl */ `
${CROWD_COMMON}
attribute vec4 aBan;
attribute vec4 aBanSize;
attribute vec4 aBanRect;
attribute vec4 aBanHold;
vec3 banP;
vec3 banN;
void bannerCompute(vec3 pos) {
  float mode = aBanSize.z;
  float t = uTime;
  vec3 p = vec3(pos.x * aBanSize.x, pos.y * aBanSize.y, 0.0);
  vec3 root;
  vec2 fwd = vec2(sin(aBan.w), cos(aBan.w));
  float shown = 1.0;
  if (mode < 0.5) {
    // Presa na grade: só tremula.
    p.z += 0.025 * sin(pos.x * 9.0 + t * 2.2 + aBanSize.w * 6.0);
    root = aBan.xyz;
  } else {
    float x = crowdWrapX(aBan.x);
    shown = crowdShown(x, aBanHold.z);
    float hype = crowdHype(x);
    float lift = crowdLift(6.0, aBanSize.w, aBanHold.x, hype);
    if (mode < 1.5) {
      // Faixa esticada por duas pessoas: barriga no meio, pano ondulando.
      p.y -= 0.14 * (1.0 - 4.0 * pos.x * pos.x);
      p.z += 0.07 * sin(pos.x * 7.0 - t * 3.0 + aBanSize.w * 6.0);
      root = vec3(x, uGround + aBan.y + lift, aBan.z);
    } else {
      fwd = crowdFacing(aBan.w, x, aBan.z, 6.0);
      vec3 hand = crowdHand(crowdArm(6.0, 1.0, aBanSize.w, aBanHold.x, hype), 1.0) * aBanHold.y;
      p += vec3(0.0, hand.y + aBanSize.y * 0.32, hand.z + 0.05);
      root = vec3(x, uGround + lift, aBan.z);
    }
  }
  banP = crowdToWorld(p, fwd) + root;
  banN = crowdToWorld(vec3(0.0, 0.0, 1.0), fwd);
  if (shown < 0.5) banP = vec3(root.x, -60.0, root.z);
}
`;

function createBannerMaterial(map: THREE.Texture, uniforms: CrowdUniforms) {
  const material = new THREE.MeshLambertMaterial({ map, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${BANNER_PARS}`)
      .replace("#include <uv_vertex>", "#include <uv_vertex>\nvMapUv = aBanRect.xy + uv * aBanRect.zw;")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nbannerCompute(position);\nobjectNormal = banN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed = banP;");
    // Verso: papelão/pano sem tinta.
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uSelfLight;")
      .replace("#include <map_fragment>", "#include <map_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.72, 0.6), 0.8);")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uSelfLight;");
  };
  material.customProgramCacheKey = () => "parade-banner";
  return material;
}

type AtlasRect = [number, number, number, number];

/** Faixas (4 de 1024×128) e cartazes (4 de 512×256) num CanvasTexture só. */
function bannerAtlas(args: { colors: [string, string, string]; name: string; number: number; stars?: number }) {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const rects: { faixas: AtlasRect[]; cards: AtlasRect[] } = { faixas: [], cards: [] };
  const toUv = (x: number, y: number, w: number, h: number): AtlasRect => [x / size, 1 - (y + h) / size, w / size, h / size];
  const name = args.name.trim().toUpperCase() || "CRAQUE";
  const shout = args.stars && args.stars > 1 ? `É ${ORDINAL_SHOUTS[args.stars] ?? "CAMPEÃO"}!` : "É CAMPEÃO!";
  const [c1, c2, c3] = flagColors(args.colors);
  const faixas: Array<{ text: string; bg: string; fg: string; border: string }> = [
    { text: `OBRIGADO, ${name}!`, bg: c1, fg: c2, border: c3 },
    { text: `${name} ${args.number}`, bg: c2, fg: c1, border: c1 },
    { text: "CAMPEÕES DO MUNDO", bg: "#ffffff", fg: c1, border: c2 },
    { text: shout, bg: c1, fg: "#ffffff", border: c2 },
  ];
  const cards = [`${name}`, `${args.number}`, shout, `VALEU, ${name}!`];
  for (let index = 0; index < 4; index += 1) {
    const y = index * 128;
    rects.faixas.push(toUv(0, y, 1024, 128));
    if (!context) continue;
    const faixa = faixas[index];
    context.fillStyle = faixa.bg;
    context.fillRect(0, y, 1024, 128);
    context.fillStyle = faixa.border;
    context.fillRect(0, y, 1024, 12);
    context.fillRect(0, y + 116, 1024, 12);
    context.textAlign = "center";
    context.textBaseline = "middle";
    fitFont(context, faixa.text, "900", 84, 900);
    context.lineWidth = 8;
    context.strokeStyle = luminanceOf(faixa.fg) > 0.5 ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.5)";
    context.strokeText(faixa.text, 512, y + 66);
    context.fillStyle = faixa.fg;
    context.fillText(faixa.text, 512, y + 66);
    context.fillStyle = "#f6c945";
    drawStar(context, 46, y + 64, 26);
    drawStar(context, 978, y + 64, 26);
  }
  for (let index = 0; index < 4; index += 1) {
    const x = (index % 2) * 512;
    const y = 512 + Math.floor(index / 2) * 256;
    rects.cards.push(toUv(x, y, 512, 256));
    if (!context) continue;
    // Cartolina com letra de pincel atômico.
    context.fillStyle = index === 1 ? c1 : "#f7f3e8";
    context.fillRect(x, y, 512, 256);
    context.strokeStyle = index === 1 ? c2 : c1;
    context.lineWidth = 14;
    context.strokeRect(x + 10, y + 10, 492, 236);
    context.textAlign = "center";
    context.textBaseline = "middle";
    const text = cards[index];
    fitFont(context, text, "900", index === 1 ? 190 : 110, 440);
    context.fillStyle = index === 1 ? c2 : index === 2 ? c1 : "#1b1b1b";
    context.fillText(text, x + 256, y + 132);
    if (index !== 1) {
      context.fillStyle = "#e0a91a";
      drawStar(context, x + 44, y + 44, 20);
      drawStar(context, x + 468, y + 212, 20);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, rects };
}

// ------------------------------------------------------------ pontos (multidão longe)

const DOT_VERTEX = /* glsl */ `
${CROWD_COMMON}
${PARADE_LIGHT_PARS}
#include <fog_pars_vertex>
attribute vec4 aCol;
attribute vec4 aSkin;
attribute vec4 aData;
uniform float uScreenH;
varying vec3 vCol;
varying vec3 vSkin;
varying vec3 vLight;
varying float vArms;
varying float vTiny;
void main() {
  float x = position.x;
  float edge = min(x - uWin.x, uWin.x + uWin.y - x) / uWin.z;
  // Onde o 3D aparece, o ponto some (mesmo sorteio, invertido).
  if (step(aCol.w, edge) > 0.5 || x < 0.0 || x > uWin.w) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  float hype = crowdHype(x);
  float height = 1.75 * aData.z;
  float hop = crowdHop(aData.x) * mix(0.04, 0.4, hype) * aData.y;
  // O sprite tem 1,2 × a altura: sobra espaço para os braços levantados.
  vec4 mvPosition = modelViewMatrix * vec4(x, uGround + height * 0.6 + hop, position.z, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float px = 1.2 * height * projectionMatrix[1][1] * 0.5 * uScreenH / max(-mvPosition.z, 0.1);
  gl_PointSize = max(px, 1.5);
  vTiny = step(px, 5.0);
  vArms = step(1.0 - (0.25 + hype * 0.7), aData.w);
  vCol = aCol.rgb;
  vSkin = aSkin.rgb;
  vec3 facing = normalize(vec3(0.0, 0.45, -sign(position.z)));
  vLight = paradeIrradiance(normalize((viewMatrix * vec4(facing, 0.0)).xyz));
  #include <fog_vertex>
}
`;

const DOT_FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
varying vec3 vCol;
varying vec3 vSkin;
varying vec3 vLight;
varying float vArms;
varying float vTiny;
void main() {
  vec2 c = gl_PointCoord;
  float ax = abs(c.x - 0.5);
  vec3 col;
  if (vTiny > 0.5) {
    // Longe: um borrão de camisa com cabeça, sem recorte fino.
    if (ax > 0.16) discard;
    col = c.y < 0.35 ? vSkin : vCol;
  } else if (c.y < 0.167) {
    if (vArms < 0.5 || ax < 0.104 || ax > 0.208 || c.y < 0.02) discard;
    col = vSkin;
  } else if (c.y < 0.375) {
    if (ax < 0.104) col = c.y < 0.2 ? vec3(0.03, 0.025, 0.02) : vSkin;
    else if (vArms > 0.5 && ax < 0.208) col = vSkin;
    else discard;
  } else if (c.y < 0.6875) {
    if (ax < 0.104) col = vCol;
    else if (ax < 0.208 && vArms < 0.5) col = c.y < 0.48 ? vCol : vSkin;
    else if (ax < 0.208 && c.y < 0.48) col = vCol;
    else discard;
  } else {
    if (ax > 0.104) discard;
    col = vec3(0.04, 0.05, 0.08);
  }
  // Mais embaixo, mais sombra (igual aos bonecos 3D).
  col *= mix(1.0, 0.5, smoothstep(0.45, 1.0, c.y));
  gl_FragColor = vec4(col * vLight, 1.0);
  ${PARADE_FRAGMENT_END}
}
`;

// ------------------------------------------------------------ lanternas de celular

const PHONE_VERTEX = /* glsl */ `
${CROWD_COMMON}
attribute vec4 aFan;
attribute vec4 aAct;
uniform float uScreenH;
uniform float uGlow;
uniform vec2 uFade;
varying float vBright;
void main() {
  vec3 world;
  float shown;
  if (aAct.z < 0.5) {
    float x = crowdWrapX(aFan.x);
    shown = crowdShown(x, aAct.w);
    float hype = crowdHype(x);
    vec2 fwd = crowdFacing(aFan.z, x, aFan.y, 4.0);
    float lift = crowdLift(4.0, aAct.x, aAct.y, hype);
    vec3 hand = crowdHand(crowdArm(4.0, 1.0, aAct.x, aAct.y, hype), 1.0) * aFan.w;
    world = crowdToWorld(hand + vec3(0.0, 0.06, 0.06), fwd) + vec3(x, uGround + lift, aFan.y);
  } else {
    float x = aFan.x;
    float edge = min(x - uWin.x, uWin.x + uWin.y - x) / uWin.z;
    shown = (1.0 - step(aAct.w, edge)) * step(0.0, x) * step(x, uWin.w);
    world = vec3(x, uGround + 2.0 * aFan.w + 0.1 * sin(uTime * 2.0 + aAct.x * 30.0), aFan.y);
  }
  vec4 mvPosition = modelViewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float depth = max(-mvPosition.z, 0.1);
  float px = 0.5 * projectionMatrix[1][1] * 0.5 * uScreenH / depth;
  gl_PointSize = clamp(px, 2.5, 48.0);
  float twinkle = 0.7 + 0.3 * sin(uTime * (2.0 + aAct.y * 5.0) + aAct.x * 40.0);
  // Ponto pequeno demais acende menos (senão a avenida vira um céu de estrelas brancas).
  vBright = uGlow * twinkle * clamp(px / 2.5, 0.35, 1.0) * (1.0 - smoothstep(uFade.x, uFade.y, depth));
  if (shown < 0.5 || vBright < 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; }
}
`;

const PHONE_FRAGMENT = /* glsl */ `
varying float vBright;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = smoothstep(0.32, 0.0, d);
  float halo = exp(-d * d * 5.0) * 0.55;
  gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * (core + halo) * vBright, 1.0);
  #include <colorspace_fragment>
}
`;

// ------------------------------------------------------------ montagem

const BEHAVIOUR = { jump: 0, wave: 1, flag: 2, clap: 3, phone: 4, rider: 5, sign: 6, guard: 7, twirl: 8, carrier: 9 } as const;

type Fan = {
  x: number;
  z: number;
  yaw: number;
  scale: number;
  phase: number;
  energy: number;
  behaviour: number;
  elevation: number;
  shirt: THREE.Color;
  trim: THREE.Color;
  skin: THREE.Color;
  hair: THREE.Color;
  style: number;
  flags: number;
  pants: number;
  dither: number;
};

const HAIR = ["#16120f", "#16120f", "#2e2119", "#2e2119", "#5a3c26", "#c9a36a", "#8f8a84"];
const NEUTRAL_SHIRTS = ["#1c1f24", "#f2f0ea", "#59606b", "#1f2f4f", "#7a1f2b"];
const GUARD_VEST = "#c9f23a";

export function buildCrowd(args: CrowdArgs): CrowdBuild {
  const { avenue, performance } = args;
  const random = rng(args.seed * 7919 + args.variant * 104729 + 17);
  const group = new THREE.Group();
  group.name = "parade-crowd";
  const uniforms = createCrowdUniforms();
  const groundY = args.groundY ?? 0.15;
  uniforms.uGround.value = groundY;
  uniforms.uSelfLight.value = args.timeOfDay === "night" ? 0.12 : args.timeOfDay === "sunset" ? 0.08 : 0.05;
  const windowLength = performance ? 90 : 130;
  const fade = performance ? 10 : 14;
  uniforms.uWin.value.set(-1e4, windowLength, fade, avenue.length);
  const [c1, c2, c3] = flagColors(args.colors);
  const night = args.timeOfDay === "night";
  const sunset = args.timeOfDay === "sunset";
  // Variação 1: mar de bandeiras. Variação 2: cartazes, pintura e pulo. 0: equilíbrio.
  const flagShare = args.variant === 1 ? 0.15 : 0.08;
  const signShare = args.variant === 2 ? 0.06 : 0.03;
  const phoneShare = night ? 0.14 : sunset ? 0.1 : 0.05;
  const paintShare = args.variant === 2 ? 0.12 : 0.05;
  const halfWidth = avenue.width / 2;
  const depth = Math.max(4, avenue.crowdDepth - 0.4);
  const zFront = halfWidth + 0.6;

  const skinPalette = SKIN_COLORS.map((hex) => new THREE.Color(hex));
  // Tons prontos (tecido mais claro/escuro): são ~30 mil sorteios, nada de Color novo por pessoa.
  const tones = (hex: string) => [-0.04, -0.02, 0, 0.02, 0.04].map((amount) => shade(hex, amount));
  const shirts = { c1: tones(c1), c2: tones(c2), c3: tones(c3), white: tones("#f4f2ec"), neutral: NEUTRAL_SHIRTS.map((hex) => new THREE.Color(hex)) };
  const solid = { c1: new THREE.Color(c1), c2: new THREE.Color(c2) };
  const hairs = HAIR.map((hex) => new THREE.Color(hex));
  const caps = [solid.c1, solid.c2, new THREE.Color("#f4f2ec"), new THREE.Color("#1c1f24")];
  const shirtFor = (fan: Fan, rand: Random) => {
    const roll = rand();
    let style = 0;
    let shirt = pick(rand, shirts.c1);
    let trim = solid.c2;
    if (roll < 0.44) {
      style = 0;
    } else if (roll < 0.54) {
      shirt = pick(rand, shirts.c2);
      trim = solid.c1;
    } else if (roll < 0.62) {
      style = 1;
    } else if (roll < 0.68) {
      style = 2;
      shirt = pick(rand, shirts.white);
      trim = solid.c1;
    } else if (roll < 0.68 + paintShare) {
      style = 3;
      trim = rand() < 0.5 ? solid.c1 : solid.c2;
    } else if (roll < 0.86) {
      style = 4;
      shirt = pick(rand, rand() < 0.6 ? shirts.white : shirts.c3);
    } else {
      style = 4;
      shirt = pick(rand, shirts.neutral);
    }
    fan.shirt = shirt;
    fan.trim = trim;
    fan.style = style;
  };

  const makeFan = (x: number, z: number, side: number, row: number, rand: Random): Fan => {
    const kid = row < 3 && rand() < 0.05;
    const fan: Fan = {
      x,
      z,
      yaw: (side > 0 ? Math.PI : 0) + (rand() - 0.5) * 0.9,
      scale: kid ? 0.7 + rand() * 0.08 : 0.88 + rand() * 0.2,
      phase: rand(),
      energy: 0.6 + rand() * 0.7,
      behaviour: BEHAVIOUR.jump,
      elevation: 0,
      shirt: solid.c1,
      trim: solid.c2,
      skin: pick(rand, skinPalette),
      hair: pick(rand, hairs),
      style: 0,
      flags: 0,
      pants: Math.floor(rand() * 4),
      dither: rand(),
    };
    shirtFor(fan, rand);
    // Boné/chapéu na cor da seleção; rosto pintado.
    if (rand() < 0.14) {
      fan.flags |= 1;
      fan.hair = pick(rand, caps);
    } else if (rand() < 0.05) {
      fan.hair = rand() < 0.5 ? solid.c1 : solid.c2;
    }
    if (rand() < 0.2 + paintShare) fan.flags |= 2;
    return fan;
  };

  // --- bonecos 3D na janela
  const fans: Fan[] = [];
  const flags: Fan[] = [];
  const cards: Fan[] = [];
  const phones: Fan[] = [];
  const faixas: Array<{ x: number; z: number; yaw: number; phase: number; energy: number; dither: number; text: number }> = [];
  const bigFlags: Array<{ x: number; z: number; w: number; h: number; dither: number; phase: number }> = [];
  for (const side of [-1, 1]) {
    let d = 0;
    let row = 0;
    while (d < depth) {
      const t = d / depth;
      // Frente apertada (é o que a câmera vê de perto); o fundo abre e a perspectiva esconde.
      const sx = performance ? 0.9 + t * 0.7 : 0.62 + t * 0.55;
      const sz = performance ? 0.85 + t * 0.6 : 0.6 + t * 0.45;
      const offset = (row % 2) * sx * 0.5;
      for (let x = offset; x < windowLength; x += sx) {
        const fx = (((x + (random() - 0.5) * sx * 0.6) % windowLength) + windowLength) % windowLength;
        const fz = side * (zFront + d + (random() - 0.5) * sz * 0.5);
        const fan = makeFan(fx, fz, side, row, random);
        const roll = random();
        if (roll < flagShare * (row < 6 ? 1.3 : 0.7)) {
          fan.behaviour = BEHAVIOUR.flag;
          flags.push(fan);
        } else if (roll < flagShare + signShare && row < 6) {
          fan.behaviour = BEHAVIOUR.sign;
          cards.push(fan);
        } else if (roll < flagShare + signShare + phoneShare) {
          fan.behaviour = BEHAVIOUR.phone;
          phones.push(fan);
        } else if (roll < 0.3) {
          fan.behaviour = BEHAVIOUR.wave;
        } else if (roll < 0.4) {
          fan.behaviour = BEHAVIOUR.clap;
        } else if (roll < 0.45) {
          fan.behaviour = BEHAVIOUR.twirl;
        } else if (roll < 0.475 && row > 0 && row < 8 && fan.scale > 0.95) {
          // Alguém nos ombros (uma criança) — mesma fase, os dois balançam juntos.
          fan.behaviour = BEHAVIOUR.carrier;
          const rider = makeFan(fx, fz, side, 0, random);
          rider.scale = 0.66 + random() * 0.1;
          rider.behaviour = BEHAVIOUR.rider;
          rider.phase = fan.phase;
          rider.energy = fan.energy;
          rider.yaw = fan.yaw;
          rider.dither = fan.dither;
          rider.elevation = 1.3125 * fan.scale + 0.04 - 0.656 * rider.scale;
          fans.push(rider);
        }
        fans.push(fan);
      }
      d += sz;
      row += 1;
    }
    // Faixas esticadas na segunda fila, presas por duas pessoas de braços erguidos.
    const faixaGap = performance ? 22 : 13;
    for (let x = random() * faixaGap; x < windowLength; x += faixaGap * (0.8 + random() * 0.4)) {
      const z = side * (zFront + 0.75 + random() * 0.6);
      const width = 4.6;
      const holderA = makeFan((x - width / 2 + windowLength) % windowLength, z, side, 1, random);
      const holderB = makeFan((x + width / 2) % windowLength, z, side, 1, random);
      const phase = random();
      const energy = 0.7 + random() * 0.3;
      const dither = random();
      for (const holder of [holderA, holderB]) {
        holder.behaviour = BEHAVIOUR.sign;
        holder.phase = phase;
        holder.energy = energy;
        holder.dither = dither;
        holder.yaw = side > 0 ? Math.PI : 0;
        fans.push(holder);
      }
      faixas.push({ x: x % windowLength, z: z + side * 0.05, yaw: side > 0 ? Math.PI : 0, phase, energy, dither, text: Math.floor(random() * 4) });
    }
    // Seguranças de colete do lado da pista, de costas para o trio.
    for (let x = random() * 16; x < windowLength; x += 14 + random() * 6) {
      const guard = makeFan(x, side * (halfWidth - 0.45), side, 0, random);
      guard.behaviour = BEHAVIOUR.guard;
      guard.yaw = side > 0 ? 0 : Math.PI;
      guard.shirt = new THREE.Color(GUARD_VEST);
      guard.trim = new THREE.Color("#e8e8e0");
      guard.style = 2;
      guard.flags = 1;
      guard.hair = new THREE.Color("#1c1f24");
      guard.pants = 1;
      guard.scale = 0.98 + random() * 0.08;
      // Segurança fica na pista, abaixo da guia.
      guard.elevation = -groundY;
      fans.push(guard);
    }
    // Bandeirões passando por cima das cabeças.
    const bigCount = performance ? 1 : args.variant === 1 ? 3 : 2;
    for (let index = 0; index < bigCount; index += 1) {
      const w = 11 + random() * 5;
      const h = Math.min(depth * 0.55, 6 + random() * 3);
      bigFlags.push({ x: ((index + random() * 0.6) / bigCount) * windowLength, z: side * (zFront + 2 + h / 2 + random() * Math.max(0, depth - h - 3)), w, h, dither: random(), phase: random() });
    }
  }

  // Atributos dos bonecos.
  const fanGeo = instanced(fanGeometry(), ["position", "normal", "aPart"], fans.length);
  {
    const aFan: number[] = [];
    const aAct: number[] = [];
    const aShirt: number[] = [];
    const aTrim: number[] = [];
    const aSkin: number[] = [];
    const aHair: number[] = [];
    const byte = (value: number) => Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);
    const pantsCode = [0, 0.3, 0.7, 1];
    for (const fan of fans) {
      aFan.push(fan.x, fan.z, fan.yaw, fan.scale);
      aAct.push(fan.phase, fan.energy, fan.behaviour, fan.elevation);
      aShirt.push(byte(fan.shirt.r), byte(fan.shirt.g), byte(fan.shirt.b), fan.style);
      aTrim.push(byte(fan.trim.r), byte(fan.trim.g), byte(fan.trim.b), fan.flags);
      aSkin.push(byte(fan.skin.r), byte(fan.skin.g), byte(fan.skin.b), byte(pantsCode[fan.pants]));
      aHair.push(byte(fan.hair.r), byte(fan.hair.g), byte(fan.hair.b), byte(fan.dither));
    }
    fanGeo.setAttribute("aFan", floatAttribute(aFan, 4));
    fanGeo.setAttribute("aAct", floatAttribute(aAct, 4));
    fanGeo.setAttribute("aShirt", byteAttribute(aShirt, 4));
    fanGeo.setAttribute("aTrim", byteAttribute(aTrim, 4));
    fanGeo.setAttribute("aSkin", byteAttribute(aSkin, 4));
    fanGeo.setAttribute("aHair", byteAttribute(aHair, 4));
  }
  const fanMaterial = new THREE.MeshLambertMaterial();
  fanMaterial.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${FAN_PARS}`)
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>\n${FAN_POSE}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${FAN_MOVE}`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${FAN_FRAGMENT_PARS}`)
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb = crowdPaint();")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uSelfLight;");
  };
  fanMaterial.customProgramCacheKey = () => "parade-fans";
  const fanMesh = new THREE.Mesh(fanGeo, fanMaterial);
  fanMesh.name = "parade-fans";
  fanMesh.frustumCulled = false;
  group.add(fanMesh);

  // --- bandeiras (de mão + bandeirões)
  const flagMaterial = createFlagMaterial([c1, c2, c3], uniforms, args.lozenge ?? true);
  const flagCount = flags.length + bigFlags.length;
  const flagGeo = instanced(flagGeometry(), ["position", "normal", "uv", "aPart"], flagCount);
  {
    const aFan: number[] = [];
    const aAct: number[] = [];
    const aFlag: number[] = [];
    for (const fan of flags) {
      aFan.push(fan.x, fan.z, fan.yaw, fan.scale);
      aAct.push(fan.phase, fan.energy, BEHAVIOUR.flag, fan.dither);
      const big = random() < 0.2;
      const w = big ? 1.5 + random() * 0.4 : 0.95 + random() * 0.3;
      aFlag.push(0, Math.floor(random() * 4), w, w * 0.66);
    }
    for (const big of bigFlags) {
      aFan.push(big.x, big.z, 0, 1);
      aAct.push(big.phase, 1, BEHAVIOUR.flag, big.dither);
      aFlag.push(1, random() < 0.6 ? 3 : 0, big.w, big.h);
    }
    flagGeo.setAttribute("aFan", floatAttribute(aFan, 4));
    flagGeo.setAttribute("aAct", floatAttribute(aAct, 4));
    flagGeo.setAttribute("aFlag", floatAttribute(aFlag, 4));
  }
  const flagMesh = new THREE.Mesh(flagGeo, flagMaterial);
  flagMesh.name = "parade-crowd-flags";
  flagMesh.frustumCulled = false;
  group.add(flagMesh);

  // --- faixas na grade, faixas esticadas e cartazes (um CanvasTexture só)
  const atlas = bannerAtlas({ colors: args.colors, name: args.playerName, number: args.playerNumber, stars: args.stars });
  const banners: number[][] = [];
  const barrierZ = halfWidth + 0.25;
  const hungGap = performance ? 34 : 21;
  for (const side of [-1, 1]) {
    for (let x = 6 + random() * hungGap; x < avenue.length - 4; x += hungGap * (0.75 + random() * 0.5)) {
      const rect = atlas.rects.faixas[Math.floor(random() * 4)];
      banners.push([x, groundY + 0.62, side * (barrierZ - 0.04), side > 0 ? Math.PI : 0, 4.8, 0.6, 0, random(), ...rect, 1, 1, 1, 0]);
    }
  }
  for (const faixa of faixas) {
    banners.push([faixa.x, 2.02, faixa.z, faixa.yaw, 4.6, 0.58, 1, faixa.phase, ...atlas.rects.faixas[faixa.text], faixa.energy, 1, faixa.dither, 0]);
  }
  for (const fan of cards) {
    const rect = atlas.rects.cards[Math.floor(random() * 4)];
    banners.push([fan.x, 0, fan.z, fan.yaw, 0.9, 0.45, 2, fan.phase, ...rect, fan.energy, fan.scale, fan.dither, 0]);
  }
  const bannerGeo = instanced(planeGrid(8, 1), ["position", "normal", "uv"], banners.length);
  {
    const columns = [0, 4, 8, 12].map((start) => banners.flatMap((row) => row.slice(start, start + 4)));
    bannerGeo.setAttribute("aBan", floatAttribute(columns[0], 4));
    bannerGeo.setAttribute("aBanSize", floatAttribute(columns[1], 4));
    bannerGeo.setAttribute("aBanRect", floatAttribute(columns[2], 4));
    bannerGeo.setAttribute("aBanHold", floatAttribute(columns[3], 4));
  }
  const bannerMaterial = createBannerMaterial(atlas.texture, uniforms);
  const bannerMesh = new THREE.Mesh(bannerGeo, bannerMaterial);
  bannerMesh.name = "parade-banners";
  bannerMesh.frustumCulled = false;
  group.add(bannerMesh);

  // --- multidão em pontos (a avenida inteira; some onde há 3D)
  const dots: { pos: number[]; col: number[]; skin: number[]; data: number[] } = { pos: [], col: [], skin: [], data: [] };
  const farPhones: number[][] = [];
  {
    const byte = (value: number) => Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);
    const probe = makeFan(0, 0, 1, 5, random);
    for (const side of [-1, 1]) {
      let d = 0;
      let row = 0;
      while (d < depth) {
        const t = d / depth;
        const sx = performance ? 1.15 + t * 0.6 : 0.72 + t * 0.4;
        const sz = performance ? 1.0 + t * 0.4 : 0.66 + t * 0.34;
        for (let x = (row % 2) * sx * 0.5; x < avenue.length; x += sx) {
          const fx = x + (random() - 0.5) * sx * 0.6;
          const fz = side * (zFront + d + (random() - 0.5) * sz * 0.5);
          shirtFor(probe, random);
          const shirt = probe.style === 3 ? pick(random, skinPalette) : probe.shirt;
          const skin = pick(random, skinPalette);
          const scale = 0.86 + random() * 0.22;
          dots.pos.push(fx, 0, fz);
          dots.col.push(byte(shirt.r), byte(shirt.g), byte(shirt.b), byte(random()));
          dots.skin.push(byte(skin.r), byte(skin.g), byte(skin.b), 255);
          dots.data.push(random(), 0.6 + random() * 0.7, scale, random());
          if ((night || sunset) && random() < phoneShare * 0.7) farPhones.push([fx, fz, 0, scale, random(), random(), 1, random()]);
        }
        d += sz;
        row += 1;
      }
    }
  }
  const dotGeo = new THREE.BufferGeometry();
  dotGeo.setAttribute("position", new THREE.Float32BufferAttribute(dots.pos, 3));
  dotGeo.setAttribute("aCol", new THREE.Uint8BufferAttribute(dots.col, 4, true));
  dotGeo.setAttribute("aSkin", new THREE.Uint8BufferAttribute(dots.skin, 4, true));
  dotGeo.setAttribute("aData", new THREE.Float32BufferAttribute(dots.data, 4));
  const dotUniforms = litUniforms({ uScreenH: { value: 800 } });
  Object.assign(dotUniforms, uniforms);
  const dotMaterial = new THREE.ShaderMaterial({ uniforms: dotUniforms, vertexShader: DOT_VERTEX, fragmentShader: DOT_FRAGMENT, lights: true, fog: true });
  const dotMesh = new THREE.Points(dotGeo, dotMaterial);
  dotMesh.name = "parade-crowd-dots";
  dotMesh.frustumCulled = false;
  trackDrawingBuffer(dotMesh, dotUniforms.uScreenH as THREE.IUniform<number>);
  group.add(dotMesh);

  // --- lanternas de celular (fim de tarde e noite)
  let phoneMesh: THREE.Points | null = null;
  let phoneMaterial: THREE.ShaderMaterial | null = null;
  if (night || sunset) {
    const aFan: number[] = [];
    const aAct: number[] = [];
    for (const fan of phones) {
      aFan.push(fan.x, fan.z, fan.yaw, fan.scale);
      aAct.push(fan.phase, fan.energy, 0, fan.dither);
    }
    for (const phone of farPhones) {
      aFan.push(phone[0], phone[1], phone[2], phone[3]);
      aAct.push(phone[4], phone[5], phone[6], phone[7]);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array((aFan.length / 4) * 3), 3));
    geometry.setAttribute("aFan", new THREE.Float32BufferAttribute(aFan, 4));
    geometry.setAttribute("aAct", new THREE.Float32BufferAttribute(aAct, 4));
    const phoneUniforms = { ...uniforms, uScreenH: { value: 800 }, uGlow: { value: night ? 1.5 : 0.7 }, uFade: { value: new THREE.Vector2(200, 900) } };
    phoneMaterial = new THREE.ShaderMaterial({
      uniforms: phoneUniforms,
      vertexShader: PHONE_VERTEX,
      fragmentShader: PHONE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    phoneMesh = new THREE.Points(geometry, phoneMaterial);
    phoneMesh.name = "parade-phones";
    phoneMesh.frustumCulled = false;
    phoneMesh.renderOrder = 2;
    trackFogFade(phoneMesh, phoneUniforms.uFade, phoneUniforms.uScreenH);
    group.add(phoneMesh);
  }

  // --- chão: sombra de mentira sob o povo e grades
  const ground = crowdGround(avenue, groundY);
  group.add(ground.shadow, ground.barriers);

  // Batida: o diretor manda um pulso 0..1; aqui vira fase de compasso. Cada
  // subida forte marca o tempo e acerta o período (sem música, segue a 124 bpm).
  let lastBeat = 0;
  let lastOnset = 0;
  let period = 60 / 124;

  return {
    group,
    update(time, dt, state) {
      void dt;
      const beat = Number.isFinite(state.beat) ? state.beat : 0;
      if (beat > 0.55 && beat - lastBeat > 0.2 && time - lastOnset > 0.28) {
        const gap = time - lastOnset;
        if (gap > 0.3 && gap < 1.1) period = period * 0.7 + gap * 0.3;
        lastOnset = time;
      }
      lastBeat = beat;
      const phase = (time - lastOnset) / period;
      uniforms.uTime.value = time;
      uniforms.uBeatPhase.value = phase - Math.floor(phase);
      uniforms.uTruckX.value = state.truckX;
      uniforms.uTruckZ.value = Number.isFinite(state.truckZ) ? (state.truckZ as number) : 0;
      uniforms.uExcite.value = THREE.MathUtils.clamp(state.excitement, 0, 1);
      // Janela 3D um pouco à frente do trio: a câmera costuma olhar para onde ele vai.
      uniforms.uWin.value.x = state.truckX - windowLength * 0.42;
    },
    dispose() {
      for (const mesh of [fanMesh, flagMesh, bannerMesh, dotMesh, phoneMesh, ground.shadow, ground.barriers]) {
        if (!mesh) continue;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      atlas.texture.dispose();
      ground.dispose();
      group.clear();
    },
  };
}

/** Grade x × y de quads em [-0.5, 0.5]², normal +z. */
function planeGrid(columns: number, rows: number) {
  const builder = new GeoBuilder();
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      builder.vertex(column / columns - 0.5, row / rows - 0.5, 0, 0, 0, 1, column / columns, row / rows);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      builder.triangle(a, a + 1, a + columns + 2);
      builder.triangle(a, a + columns + 2, a + columns + 1);
    }
  }
  return builder.build();
}

/** Faixa escura sob a multidão (oclusão de mentira) e grades de contenção. */
function crowdGround(avenue: AvenueLayout, groundY: number) {
  const halfWidth = avenue.width / 2;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (const side of [-1, 1]) {
    const open = avenue.openSide === side;
    const strength = open ? 0.32 : 0.5;
    const stops: Array<[number, number]> = [
      [halfWidth - 0.6, 0],
      [halfWidth + 0.3, strength],
      [halfWidth + avenue.crowdDepth * 0.75, strength * 0.9],
      [halfWidth + avenue.crowdDepth + 0.6, 0],
    ];
    const first = positions.length / 3;
    for (const [z, alpha] of stops) {
      positions.push(0, groundY + 0.04, side * z, avenue.length, groundY + 0.04, side * z);
      colors.push(0.02, 0.018, 0.015, alpha, 0.02, 0.018, 0.015, alpha);
    }
    for (let index = 0; index < stops.length - 1; index += 1) {
      const a = first + index * 2;
      // Face para cima nos dois lados (o z troca de sinal, a ordem também).
      if (side > 0) indices.push(a, a + 3, a + 1, a, a + 2, a + 3);
      else indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  const shadowGeo = new THREE.BufferGeometry();
  shadowGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  shadowGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  shadowGeo.setIndex(indices);
  const shadow = new THREE.Mesh(
    shadowGeo,
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  shadow.name = "parade-crowd-shadow";
  shadow.renderOrder = -1;
  shadow.frustumCulled = false;

  // Grade de ferro: um quad comprido por lado, as barras saem de um alphaMap repetido.
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "#000";
    context.fillRect(0, 0, 128, 64);
    context.fillStyle = "#fff";
    context.fillRect(0, 2, 128, 7);
    context.fillRect(0, 50, 128, 6);
    context.fillRect(0, 0, 5, 64);
    context.fillRect(123, 0, 5, 64);
    for (let x = 12; x < 120; x += 10) context.fillRect(x, 6, 3, 46);
  }
  const alpha = new THREE.CanvasTexture(canvas);
  alpha.wrapS = THREE.RepeatWrapping;
  const panel = 2.4;
  const builder = new GeoBuilder();
  for (const side of [-1, 1]) {
    const z = side * (halfWidth + 0.25);
    const repeat = avenue.length / panel;
    // A face da frente olha para a pista (luz certa do lado de quem vê o trio passar).
    const y0 = groundY + 0.06;
    const y1 = groundY + 1.12;
    const near = side > 0 ? avenue.length : 0;
    const far = side > 0 ? 0 : avenue.length;
    builder.quad({ x: near, y: y0, z }, { x: far, y: y0, z }, { x: far, y: y1, z }, { x: near, y: y1, z }, { x: 0, y: 0, z: -side }, [0, 0, repeat, 1]);
  }
  const barriers = new THREE.Mesh(builder.build(), new THREE.MeshLambertMaterial({ color: "#a9b0b8", alphaMap: alpha, alphaTest: 0.5, side: THREE.DoubleSide }));
  barriers.name = "parade-barriers";
  barriers.frustumCulled = false;
  return { shadow, barriers, dispose: () => alpha.dispose() };
}
