// Efeitos da festa: papel picado (chuva leve em volta do trio + explosões dos
// canhões) e sinalizadores de fumaça colorida na multidão.
//
// Tudo é posição em função do tempo, calculada no vertex shader: nada de
// simulação no CPU, então pular no roteiro não quebra nada. Três draw calls:
// papel (quads girando, opaco), fumaça (billboards suaves, sem gravar
// profundidade) e o fogo dos sinalizadores (pontos aditivos com faíscas).

import * as THREE from "three";
import type { AvenueLayout } from "./stage-city";
import { PARADE_FRAGMENT_END, PARADE_LIGHT_PARS, litUniforms, rng, trackFogFade } from "./crowd-kit";
import { flagColors } from "./crowd-people";

export type EffectsBuild = {
  group: THREE.Group;
  /** Chuva de papel picado em volta de `at` (m). */
  burst(at: THREE.Vector3): void;
  /** Sinalizadores com fumaça colorida nas cores da seleção, ao longo da avenida perto de `x`. */
  flares(x: number): void;
  /**
   * `state.truckX` (opcional) leva a chuva leve de papel junto com o trio;
   * sem ele, a chuva fica onde o trio começa.
   */
  update(time: number, dt: number, state?: { truckX?: number }): void;
  dispose(): void;
};

export type EffectsArgs = {
  colors: [string, string, string];
  avenue: AvenueLayout;
  performance: boolean;
  seed: number;
  /** Opcional: altura do asfalto onde o papel assenta (m). Padrão 0. */
  groundY?: number;
};

const CONFETTI_VERTEX = /* glsl */ `
${PARADE_LIGHT_PARS}
#include <fog_pars_vertex>
attribute vec4 aSeed;
attribute vec4 aSeed2;
attribute vec4 aColor;
attribute vec3 aShape;
uniform float uTime;
uniform vec3 uRainCenter;
uniform vec3 uRainSize;
uniform float uRainDensity;
uniform vec4 uBurstA;
uniform vec4 uBurstB;
uniform float uGround;
varying vec3 vFront;
varying vec3 vBack;
vec3 spinAround(vec3 v, vec3 k, float a) {
  float c = cos(a);
  float s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}
void main() {
  float mode = aShape.z;
  vec3 center;
  float alive;
  float landed = 0.0;
  float spin = uTime * (3.0 + aSeed.w * 7.0) * (aShape.y > 0.4 ? 0.35 : 1.0) + aSeed.x * 40.0;
  if (mode < 0.5) {
    // Chuva: caixa que acompanha o trio, mas cada papel fica parado no mundo em x.
    float h = uRainSize.y;
    float y = h - mod(uTime * (0.7 + aSeed.z * 0.8) + aSeed.y * h, h);
    float x = uRainCenter.x + (fract(aSeed.x - uRainCenter.x / uRainSize.x) - 0.5) * uRainSize.x;
    float z = uRainCenter.z + (aSeed2.x - 0.5) * uRainSize.z;
    x += sin(uTime * 1.3 + aSeed.w * 20.0) * 0.5;
    z += cos(uTime * 1.1 + aSeed.x * 20.0) * 0.5;
    center = vec3(x, uRainCenter.y + y, z);
    alive = step(aSeed2.y, uRainDensity) * smoothstep(0.0, 0.6, y);
  } else {
    // Canhão: sai rápido num cone para cima, o ar freia e o papel desce flutuando.
    vec4 b = mode < 1.5 ? uBurstA : uBurstB;
    float t = uTime - b.w;
    alive = step(0.0, t) * (1.0 - smoothstep(13.0, 16.0, t));
    t = max(t, 0.0);
    float theta = aSeed.x * 6.2831853;
    float up = 0.45 + 0.55 * aSeed.y;
    float across = sqrt(max(0.0, 1.0 - up * up));
    vec3 dir = vec3(cos(theta) * across, up, sin(theta) * across);
    float speed = 7.0 + aSeed.z * 13.0;
    float k = 1.4 + aSeed2.y * 0.8;
    float e = (1.0 - exp(-k * t)) / k;
    float terminal = 0.7 + aSeed2.z * 0.8;
    center = b.xyz + dir * speed * e;
    center.y -= terminal * (t - e);
    float flutter = min(t, 1.5);
    center.x += sin(t * 2.3 + aSeed.w * 30.0) * 0.45 * flutter;
    center.z += cos(t * 1.9 + aSeed.x * 30.0) * 0.45 * flutter;
    if (center.y < uGround + 0.015) {
      center.y = uGround + 0.012 + aSeed2.w * 0.006;
      landed = 1.0;
    }
  }
  vec3 corner = vec3(position.x * aShape.x, position.y * aShape.y, 0.0);
  vec3 localN = vec3(0.0, 0.0, 1.0);
  if (landed > 0.5) {
    float a = aSeed.w * 6.2831853;
    corner = vec3(corner.x * cos(a) - corner.y * sin(a), 0.0, corner.x * sin(a) + corner.y * cos(a));
    localN = vec3(0.0, 1.0, 0.0);
  } else {
    vec3 axis = normalize(vec3(aSeed.z - 0.5, aSeed2.w - 0.45, aSeed.y - 0.5) + vec3(0.001));
    corner = spinAround(corner, axis, spin);
    localN = spinAround(localN, axis, spin);
  }
  vec4 mvPosition = modelViewMatrix * vec4(center + corner, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  if (alive < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vec3 n = normalize(normalMatrix * localN);
  vec3 toEye = normalize(-mvPosition.xyz);
  float metal = aColor.w;
  // Papel metalizado pisca quando vira para a câmera.
  float glintFront = pow(max(dot(n, toEye), 0.0), 10.0);
  float glintBack = pow(max(-dot(n, toEye), 0.0), 10.0);
  vec3 base = aColor.rgb;
  vFront = base * (paradeIrradiance(n) * (1.0 - 0.4 * metal) + 0.1 + metal * glintFront * 3.0);
  vBack = base * (paradeIrradiance(-n) * (1.0 - 0.4 * metal) + 0.1 + metal * glintBack * 3.0);
  #include <fog_vertex>
}
`;

const CONFETTI_FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
varying vec3 vFront;
varying vec3 vBack;
void main() {
  gl_FragColor = vec4(gl_FrontFacing ? vFront : vBack, 1.0);
  ${PARADE_FRAGMENT_END}
}
`;

// Sinalizadores: dois lotes (slot 0/1) para trocar de lugar sem cortar a fumaça
// que já está no ar. aHold = (dx em relação ao x do lote, z, lote, cor 0..2).
const FLARE_COMMON = /* glsl */ `
uniform float uTime;
uniform vec4 uSlot;
uniform vec4 uSlotT;
uniform float uGround;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
vec3 flareHand(vec4 hold, float t) {
  float x = hold.z < 0.5 ? uSlot.x : uSlot.y;
  return vec3(x + hold.x + 0.35 * sin(t * 2.1 + hold.x), uGround + 2.3 + 0.15 * sin(t * 3.3 + hold.y * 3.0), hold.y + 0.25 * cos(t * 1.7 + hold.x));
}
vec2 flareSpan(vec4 hold) { return hold.z < 0.5 ? uSlotT.xy : uSlotT.zw; }
vec3 flareColor(vec4 hold) { return hold.w < 0.5 ? uC1 : hold.w < 1.5 ? uC2 : uC3; }
`;

const SMOKE_LIFE = 5.0;

const SMOKE_VERTEX = /* glsl */ `
${PARADE_LIGHT_PARS}
${FLARE_COMMON}
#include <fog_pars_vertex>
attribute vec4 aPuff;
attribute vec4 aHold;
varying vec2 vUv;
varying vec3 vCol;
varying float vAlpha;
void main() {
  float life = ${SMOKE_LIFE.toFixed(1)};
  float age = fract(uTime / life + aPuff.y) * life;
  float born = uTime - age;
  vec2 span = flareSpan(aHold);
  float on = step(span.x, born) * step(born, span.y);
  vec3 p = flareHand(aHold, born);
  // Sobe, abre e vai com o vento (para trás do trio, levemente para o lado).
  p += vec3(0.55 * age + sin(age * 1.3 + aPuff.z * 6.0) * 0.35 * age, 0.95 * age - 0.035 * age * age, (aPuff.w - 0.5) * 0.5 * age + cos(age * 1.1 + aPuff.w * 6.0) * 0.25 * age);
  float size = 0.35 + 0.8 * age + 0.25 * aPuff.z;
  float fade = 1.0 - age / life;
  vAlpha = on * pow(fade, 1.3) * smoothstep(0.0, 0.3, age) * 0.92;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  float rot = aPuff.z * 6.28 + age * (aPuff.w - 0.5);
  vec2 cs = vec2(cos(rot), sin(rot));
  mvPosition.xy += vec2(position.x * cs.x - position.y * cs.y, position.x * cs.y + position.y * cs.x) * size;
  gl_Position = projectionMatrix * mvPosition;
  if (vAlpha < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vec3 c = flareColor(aHold);
  // A fumaça perto do fogo fica incandescente.
  vCol = c * (paradeIrradiance(vec3(0.0, 0.0, 1.0)) * 0.85 + 0.12) + mix(vec3(1.0, 0.42, 0.18), c, 0.35) * exp(-age * 2.4) * 1.4;
  vUv = uv;
  #include <fog_vertex>
}
`;

const SMOKE_FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
varying vec2 vUv;
varying vec3 vCol;
varying float vAlpha;
void main() {
  vec2 q = (vUv - 0.5) * 2.0;
  float r2 = dot(q, q);
  // Miolo cheio e borda macia: a pluma lê como nuvem, não como bolinhas.
  float a = vAlpha * smoothstep(1.0, 0.3, r2) * (0.82 + 0.18 * sin(q.x * 5.0 + q.y * 3.0 + vAlpha * 9.0));
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol, a);
  ${PARADE_FRAGMENT_END}
}
`;

const FIRE_VERTEX = /* glsl */ `
${FLARE_COMMON}
attribute vec4 aHold;
attribute vec4 aSpark;
uniform float uScreenH;
uniform vec2 uFade;
varying vec3 vCol;
void main() {
  vec2 span = flareSpan(aHold);
  float on = step(span.x, uTime) * step(uTime, span.y + 0.8);
  vec3 p = flareHand(aHold, uTime);
  float worldSize = 0.85;
  float bright = 2.2 + 0.6 * sin(uTime * 37.0 + aHold.x * 11.0) + 0.4 * sin(uTime * 23.0);
  if (aSpark.x > 0.5) {
    // Faísca: pula do fogo e cai.
    float age = fract(uTime * 1.6 + aSpark.y) * 0.62;
    vec3 dir = normalize(vec3(aSpark.z - 0.5, 0.9, aSpark.w - 0.5));
    p += dir * 2.6 * age + vec3(0.0, -4.9 * age * age, 0.0);
    worldSize = 0.09;
    bright = 2.2 * (1.0 - age / 0.62);
  }
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float depth = max(-mvPosition.z, 0.1);
  gl_PointSize = clamp(worldSize * projectionMatrix[1][1] * 0.5 * uScreenH / depth, 2.0, 90.0);
  vec3 c = flareColor(aHold);
  vCol = mix(vec3(1.0, 0.55, 0.32), c, 0.35) * bright * (1.0 - smoothstep(uFade.x, uFade.y, depth));
  if (on < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const FIRE_FRAGMENT = /* glsl */ `
varying vec3 vCol;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = smoothstep(0.4, 0.0, d);
  float halo = exp(-d * d * 4.0) * 0.6;
  gl_FragColor = vec4(vCol * halo + vec3(1.0, 0.95, 0.85) * core, 1.0);
  #include <colorspace_fragment>
}
`;

const FLARE_BURN = 22;

export function buildEffects(args: EffectsArgs): EffectsBuild {
  const { avenue, performance } = args;
  const random = rng(args.seed * 977 + 3);
  const groundY = args.groundY ?? 0;
  const [c1, c2, c3] = flagColors(args.colors);
  const group = new THREE.Group();
  group.name = "parade-effects";

  // --- papel picado
  const rainCount = performance ? 500 : 1400;
  const burstCount = performance ? 600 : 1500;
  const total = rainCount + burstCount * 2;
  const palette: Array<[string, number, number]> = [
    [c1, 0, 0.3],
    [c2, 0, 0.25],
    [c3, 0, 0.1],
    ["#ffffff", 0, 0.15],
    ["#ffcf4d", 1, 0.12],
    ["#d8dde6", 1, 0.08],
  ];
  const quad = new THREE.PlaneGeometry(1, 1);
  const confettiGeo = new THREE.InstancedBufferGeometry();
  confettiGeo.index = quad.index;
  confettiGeo.setAttribute("position", quad.getAttribute("position"));
  confettiGeo.instanceCount = total;
  const seedA = new Float32Array(total * 4);
  const seedB = new Float32Array(total * 4);
  const colorAttr = new Uint8Array(total * 4);
  const shape = new Float32Array(total * 3);
  const color = new THREE.Color();
  for (let index = 0; index < total; index += 1) {
    for (let k = 0; k < 4; k += 1) {
      seedA[index * 4 + k] = random();
      seedB[index * 4 + k] = random();
    }
    let roll = random();
    let entry = palette[0];
    for (const item of palette) {
      entry = item;
      roll -= item[2];
      if (roll <= 0) break;
    }
    color.set(entry[0]);
    colorAttr[index * 4] = Math.round(color.r * 255);
    colorAttr[index * 4 + 1] = Math.round(color.g * 255);
    colorAttr[index * 4 + 2] = Math.round(color.b * 255);
    colorAttr[index * 4 + 3] = entry[1] * 255;
    const mode = index < rainCount ? 0 : index < rainCount + burstCount ? 1 : 2;
    // Um em dez papéis do canhão é serpentina (fita comprida).
    const streamer = mode > 0 && random() < 0.08;
    shape[index * 3] = streamer ? 0.035 : 0.075 + random() * 0.03;
    shape[index * 3 + 1] = streamer ? 0.7 + random() * 0.4 : 0.1 + random() * 0.04;
    shape[index * 3 + 2] = mode;
  }
  confettiGeo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seedA, 4));
  confettiGeo.setAttribute("aSeed2", new THREE.InstancedBufferAttribute(seedB, 4));
  confettiGeo.setAttribute("aColor", new THREE.InstancedBufferAttribute(colorAttr, 4, true));
  confettiGeo.setAttribute("aShape", new THREE.InstancedBufferAttribute(shape, 3));
  const confettiUniforms = litUniforms({
    uTime: { value: 0 },
    uRainCenter: { value: new THREE.Vector3(avenue.length * 0.15, groundY, 0) },
    uRainSize: { value: new THREE.Vector3(36, 15, avenue.width + 10) },
    uRainDensity: { value: 0.45 },
    uBurstA: { value: new THREE.Vector4(0, -100, 0, -1e4) },
    uBurstB: { value: new THREE.Vector4(0, -100, 0, -1e4) },
    uGround: { value: groundY },
  });
  const confettiMaterial = new THREE.ShaderMaterial({
    uniforms: confettiUniforms,
    vertexShader: CONFETTI_VERTEX,
    fragmentShader: CONFETTI_FRAGMENT,
    side: THREE.DoubleSide,
    lights: true,
    fog: true,
  });
  const confetti = new THREE.Mesh(confettiGeo, confettiMaterial);
  confetti.name = "parade-confetti";
  confetti.frustumCulled = false;
  group.add(confetti);

  // --- sinalizadores: donos espalhados nas primeiras filas dos dois lados
  const holders = performance ? 6 : 12;
  const puffs = performance ? 12 : 22;
  const flareUniforms = {
    uTime: { value: 0 },
    uSlot: { value: new THREE.Vector4(-1e4, -1e4, 0, 0) },
    uSlotT: { value: new THREE.Vector4(1e4, -1e4, 1e4, -1e4) },
    uGround: { value: groundY },
    uC1: { value: new THREE.Color(c1) },
    uC2: { value: new THREE.Color(c2) },
    uC3: { value: new THREE.Color(c3) },
  };
  const holderData: number[][] = [];
  for (let slot = 0; slot < 2; slot += 1) {
    for (let index = 0; index < holders; index += 1) {
      const side = index % 2 === 0 ? 1 : -1;
      if (avenue.openSide === side && random() < 0.5) continue;
      const dx = ((index + random() * 0.8) / holders - 0.5) * 50;
      const z = side * (avenue.width / 2 + 0.9 + random() * 3.2);
      holderData.push([dx, z, slot, Math.floor(random() * 3)]);
    }
  }
  const puffGeo = new THREE.InstancedBufferGeometry();
  puffGeo.index = quad.index;
  puffGeo.setAttribute("position", quad.getAttribute("position"));
  puffGeo.setAttribute("uv", quad.getAttribute("uv"));
  const puffHold: number[] = [];
  const puffData: number[] = [];
  holderData.forEach((holder) => {
    for (let index = 0; index < puffs; index += 1) {
      puffHold.push(...holder);
      puffData.push(0, index / puffs + random() * 0.02, random(), random());
    }
  });
  puffGeo.instanceCount = puffHold.length / 4;
  puffGeo.setAttribute("aHold", new THREE.InstancedBufferAttribute(new Float32Array(puffHold), 4));
  puffGeo.setAttribute("aPuff", new THREE.InstancedBufferAttribute(new Float32Array(puffData), 4));
  const smokeUniforms = litUniforms(flareUniforms);
  const smokeMaterial = new THREE.ShaderMaterial({
    uniforms: smokeUniforms,
    vertexShader: SMOKE_VERTEX,
    fragmentShader: SMOKE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    lights: true,
    fog: true,
  });
  const smoke = new THREE.Mesh(puffGeo, smokeMaterial);
  smoke.name = "parade-flare-smoke";
  smoke.frustumCulled = false;
  smoke.renderOrder = 4;
  group.add(smoke);

  const sparks = performance ? 3 : 6;
  const fireHold: number[] = [];
  const fireSpark: number[] = [];
  for (const holder of holderData) {
    for (let index = 0; index <= sparks; index += 1) {
      fireHold.push(...holder);
      fireSpark.push(index === 0 ? 0 : 1, random(), random(), random());
    }
  }
  const fireGeo = new THREE.BufferGeometry();
  fireGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array((fireHold.length / 4) * 3), 3));
  fireGeo.setAttribute("aHold", new THREE.Float32BufferAttribute(fireHold, 4));
  fireGeo.setAttribute("aSpark", new THREE.Float32BufferAttribute(fireSpark, 4));
  const fireUniforms = { ...flareUniforms, uScreenH: { value: 800 }, uFade: { value: new THREE.Vector2(200, 900) } };
  const fireMaterial = new THREE.ShaderMaterial({
    uniforms: fireUniforms,
    vertexShader: FIRE_VERTEX,
    fragmentShader: FIRE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const fire = new THREE.Points(fireGeo, fireMaterial);
  fire.name = "parade-flare-fire";
  fire.frustumCulled = false;
  fire.renderOrder = 5;
  trackFogFade(fire, fireUniforms.uFade, fireUniforms.uScreenH);
  group.add(fire);

  // Sem truckX no update, a chuva procura o trio na cena (pelo nome) e segue o grupo dele.
  let explicitTruck = false;
  let trio: THREE.Object3D | null | undefined;
  confetti.onBeforeRender = (renderer, scene) => {
    void renderer;
    if (explicitTruck) return;
    if (trio === undefined || (trio && !trio.parent)) trio = scene.getObjectByName("parade-trio") ?? null;
    if (trio) confettiUniforms.uRainCenter.value.set(trio.position.x + 3, groundY, trio.position.z);
  };

  let clock = 0;
  let nextBurst = 0;
  let nextSlot = 0;
  let rainBoost = 0;
  return {
    group,
    burst(at) {
      const target = nextBurst === 0 ? confettiUniforms.uBurstA.value : confettiUniforms.uBurstB.value;
      target.set(at.x, at.y, at.z, clock);
      nextBurst = 1 - nextBurst;
      // Depois do estouro, a chuva leve engrossa por um tempo.
      rainBoost = 1;
    },
    flares(x) {
      const slot = nextSlot;
      nextSlot = 1 - nextSlot;
      const slots = flareUniforms.uSlot.value;
      const times = flareUniforms.uSlotT.value;
      if (slot === 0) {
        slots.x = x;
        times.x = clock;
        times.y = clock + FLARE_BURN;
        times.w = Math.min(times.w, clock);
      } else {
        slots.y = x;
        times.z = clock;
        times.w = clock + FLARE_BURN;
        times.y = Math.min(times.y, clock);
      }
    },
    update(time, dt, state) {
      clock = time;
      rainBoost = Math.max(0, rainBoost - Math.max(dt, 0) / 12);
      confettiUniforms.uTime.value = time;
      confettiUniforms.uRainDensity.value = 0.45 + 0.55 * rainBoost;
      if (state?.truckX !== undefined && Number.isFinite(state.truckX)) {
        explicitTruck = true;
        confettiUniforms.uRainCenter.value.x = state.truckX + 3;
      }
      flareUniforms.uTime.value = time;
    },
    dispose() {
      confettiGeo.dispose();
      confettiMaterial.dispose();
      puffGeo.dispose();
      smokeMaterial.dispose();
      fireGeo.dispose();
      fireMaterial.dispose();
      quad.dispose();
      group.clear();
    },
  };
}
