// Trio elétrico da seleção campeã: carreta de ~17 m com paredões de som dos
// dois lados, painéis de LED, deck em cima com grade, treliça de luz na frente
// e telão no fundo.
//
// Draw calls: carroceria + alto-falantes (1, MeshStandard com acabamento por
// vértice), LEDs/vidros/faixas de pano (1, shader próprio com atlas em canvas),
// bandeiras (1, o mesmo programa da multidão) e fachos de luz (1, só tarde/noite).
// Os cones dos alto-falantes pulsam no vertex shader (`aPush` × batida).

import * as THREE from "three";
import type { ParadeTimeOfDay } from "./parade-script";
import {
  GeoBuilder,
  PARADE_FRAGMENT_END,
  PARADE_LIGHT_PARS,
  drawStar,
  fitFont,
  litUniforms,
  luminanceOf,
  rng,
  shade,
  trackFogFade,
} from "./crowd-kit";
import { createCrowdUniforms, createFlagMaterial, flagColors, flagGeometry } from "./crowd-people";

export type TrioBuild = {
  /** Origem no chão, no centro do caminhão; a frente aponta para +x. */
  group: THREE.Group;
  /** Altura do piso do deck de cima (m). */
  deckHeight: number;
  /**
   * Lugares no deck (coordenadas locais do `group`, no piso do deck): o 0 é o
   * do jogador, na frente e no meio; os outros, para os companheiros.
   */
  slots: THREE.Vector3[];
  /** Alto-falantes pulsando, painéis de LED e luzes no ritmo. */
  update(time: number, dt: number, beat: number): void;
  dispose(): void;
  /** Extra: medidas da carreta (m) para a câmera enquadrar. */
  size?: { length: number; width: number; height: number; front: number; back: number };
};

export type TrioArgs = {
  colors: [string, string];
  countryName: string;
  season: number;
  stars: number;
  seed: number;
  performance: boolean;
  timeOfDay: ParadeTimeOfDay;
  /** Opcional: terceira cor (calção) para bandeiras e LEDs. */
  thirdColor?: string;
  /** Opcional: bandeiras com losango e círculo (só o Brasil). Padrão true. */
  lozenge?: boolean;
};

const DECK = 4.2;
const HALF_W = 1.6;
const REAR = -8.6;
const BODY_FRONT = 5.0;
const DECK_FRONT = 8.4;
const CAB_FRONT = 8.8;

// --------------------------------------------------------------- shaders

const BODY_VERTEX_PARS = /* glsl */ `
attribute vec3 aPush;
attribute vec2 aFinish;
uniform float uPump;
varying vec2 vFinish;
`;

function createBodyMaterial(uniforms: { uPump: { value: number } }) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${BODY_VERTEX_PARS}`)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed += aPush * uPump;\nvFinish = aFinish;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vFinish;")
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = vFinish.x;")
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = vFinish.y;");
  };
  material.customProgramCacheKey = () => "parade-trio-body";
  return material;
}

// aLed = (modo, a, b, c). Modos: 0 painel do atlas (a = pontos de LED por unidade de uv),
// 1 letreiro correndo, 2 fita de LED em perseguição (uv.x em metros), 3 pano (iluminado),
// 4 luz sólida (cor do vértice × a; c = pisca na batida), 5 vidro.
const LED_VERTEX = /* glsl */ `
${PARADE_LIGHT_PARS}
#include <fog_pars_vertex>
attribute vec4 aLed;
attribute vec3 color;
varying vec2 vUv;
varying vec4 vLed;
varying vec3 vColor;
varying vec3 vLight;
varying float vFresnel;
void main() {
  vUv = uv;
  vLed = aLed;
  vColor = color;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vLight = paradeIrradiance(n);
  vFresnel = 1.0 - abs(dot(n, normalize(-mvPosition.xyz)));
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const LED_FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uAtlas;
uniform vec4 uMarquee;
uniform float uTime;
uniform float uBeat;
uniform float uStrobe;
uniform float uGain;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
varying vec2 vUv;
varying vec4 vLed;
varying vec3 vColor;
varying vec3 vLight;
varying float vFresnel;
// Grade de LEDs: some de longe (derivada) para não fazer moiré.
float ledDots(vec2 cell) {
  vec2 g = fract(cell) - 0.5;
  float dotMask = smoothstep(0.5, 0.18, length(g));
  float far = clamp(max(fwidth(cell.x), fwidth(cell.y)) * 1.6 - 0.3, 0.0, 1.0);
  return mix(0.3 + 0.9 * dotMask, 0.75, far);
}
vec3 palette(float i) {
  float k = mod(i, 3.0);
  return k < 0.5 ? uC1 : k < 1.5 ? uC2 : uC3;
}
void main() {
  float mode = vLed.x;
  vec3 col;
  if (mode < 0.5) {
    vec3 tex = texture2D(uAtlas, vUv).rgb;
    float sweep = smoothstep(0.85, 1.0, sin(vUv.x * 9.0 - vUv.y * 4.0 - uTime * 2.2));
    col = tex * ledDots(vUv * vLed.y) * uGain * (1.0 + 0.35 * uBeat + 0.35 * sweep);
  } else if (mode < 1.5) {
    vec2 local = vec2(fract(vUv.x - uTime * 0.22), vUv.y);
    vec3 tex = texture2D(uAtlas, uMarquee.xy + local * uMarquee.zw).rgb;
    col = tex * ledDots(vUv * vec2(vLed.y, vLed.z)) * uGain * (1.0 + 0.3 * uBeat);
    col += uStrobe * 0.6;
  } else if (mode < 2.5) {
    float s = vUv.x;
    float run = s * 1.4 - uTime * 6.0 + vLed.y * 2.0;
    vec3 c = palette(floor(run));
    float head = fract(run);
    float pulse = 0.55 + 0.45 * smoothstep(0.0, 0.25, head) + 0.9 * uBeat;
    col = c * ledDots(vec2(s * 16.0, 0.5)) * pulse * uGain * 1.2 + uStrobe * 1.2;
  } else if (mode < 3.5) {
    col = texture2D(uAtlas, vUv).rgb * vLight;
  } else if (mode < 4.5) {
    col = vColor * vLed.y * (1.0 + vLed.z * (1.2 * uBeat - 0.3)) + uStrobe * vLed.z * 0.8;
  } else {
    // Vidro: escuro, com reflexo do céu na borda e uma faixa de brilho.
    float streak = smoothstep(0.05, 0.0, abs(vUv.x - vUv.y * 0.5 - 0.45)) * 0.35;
    col = mix(vec3(0.015, 0.02, 0.03), vLight * 0.55 + 0.04, clamp(vFresnel * 0.9 + streak, 0.0, 1.0));
  }
  gl_FragColor = vec4(col, 1.0);
  ${PARADE_FRAGMENT_END}
}
`;

// Fachos de luz das cabeças móveis: cone aditivo girando no shader.
const BEAM_VERTEX = /* glsl */ `
attribute vec4 aBeam;
attribute vec3 color;
uniform float uTime;
uniform vec2 uFade;
varying float vAlong;
varying float vEdge;
varying vec3 vColor;
varying float vFog;
void main() {
  float i = aBeam.w;
  float pan = sin(uTime * 0.55 + i * 1.9) * 1.2 + i * 1.1;
  float tilt = 0.5 + 0.38 * sin(uTime * 0.83 + i * 2.6);
  vec3 p = position;
  vec3 radial = normalize(vec3(p.x, 0.0, p.z) + vec3(0.0001));
  vec2 ct = vec2(cos(tilt), sin(tilt));
  vec2 cp = vec2(cos(pan), sin(pan));
  p = vec3(p.x, p.y * ct.x - p.z * ct.y, p.y * ct.y + p.z * ct.x);
  p = vec3(p.x * cp.x + p.z * cp.y, p.y, -p.x * cp.y + p.z * cp.x);
  radial = vec3(radial.x, radial.y * ct.x - radial.z * ct.y, radial.y * ct.y + radial.z * ct.x);
  radial = vec3(radial.x * cp.x + radial.z * cp.y, radial.y, -radial.x * cp.y + radial.z * cp.x);
  vec4 mvPosition = modelViewMatrix * vec4(p + aBeam.xyz, 1.0);
  vec3 nView = normalize(normalMatrix * radial);
  vEdge = abs(dot(nView, normalize(-mvPosition.xyz)));
  vAlong = uv.y;
  vColor = color;
  vFog = 1.0 - smoothstep(uFade.x, uFade.y, -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const BEAM_FRAGMENT = /* glsl */ `
uniform float uIntensity;
varying float vAlong;
varying float vEdge;
varying vec3 vColor;
varying float vFog;
void main() {
  float a = pow(1.0 - vAlong, 1.7) * vEdge * vEdge * uIntensity * vFog;
  gl_FragColor = vec4(vColor * a, 1.0);
  #include <colorspace_fragment>
}
`;

// --------------------------------------------------------------- atlas

type Rect = [number, number, number, number];

/** Painéis do trio num canvas 1024²: letreiro, telão, fachada e as faixas de pano. */
function ledAtlas(args: { colors: [string, string, string]; country: string; season: number; stars: number }) {
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const [c1, c2, c3] = args.colors;
  const country = args.country.trim().toUpperCase() || "SELEÇÃO";
  const gold = "#ffc93c";
  const uv = (x: number, y: number, w: number, h: number): Rect => [x / size, 1 - (y + h) / size, w / size, h / size];
  const rects = {
    marquee: uv(0, 0, 1024, 128),
    backdrop: uv(0, 128, 1024, 640),
    facade: uv(0, 768, 512, 256),
    countryCloth: uv(512, 768, 512, 128),
    frontCloth: uv(512, 896, 512, 128),
  };
  // Desenha num canvas com a proporção real da peça e espreme na região do atlas.
  const region = (x: number, y: number, w: number, h: number, aspect: number, paint: (ctx: CanvasRenderingContext2D, width: number, height: number) => void) => {
    if (!context) return;
    const scratch = document.createElement("canvas");
    scratch.height = h;
    scratch.width = Math.round(h * aspect);
    const ctx = scratch.getContext("2d");
    if (!ctx) return;
    paint(ctx, scratch.width, scratch.height);
    context.drawImage(scratch, x, y, w, h);
  };
  const bright = (hex: string) => (luminanceOf(hex) < 0.08 ? shade(hex, 0.35).getStyle() : hex);
  const stars = Math.max(1, Math.min(9, args.stars));
  const starRow = (ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) => {
    ctx.fillStyle = gold;
    for (let index = 0; index < stars; index += 1) drawStar(ctx, cx + (index - (stars - 1) / 2) * radius * 2.6, cy, radius);
  };
  region(0, 0, 1024, 128, 12, (ctx, w, h) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    const text = `CAMPEÃO DO MUNDO ${args.season}   ${country}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitFont(ctx, text, "900", 92, w * 0.8);
    ctx.fillStyle = bright(c1);
    ctx.fillText(text, w / 2, h / 2 + 4);
    ctx.fillStyle = gold;
    drawStar(ctx, w * 0.05, h / 2, 40);
    drawStar(ctx, w * 0.95, h / 2, 40);
  });
  region(0, 128, 1024, 640, 1.6, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h * 0.45, 20, w / 2, h * 0.5, w * 0.7);
    gradient.addColorStop(0, shade(c1, 0.08).getStyle());
    gradient.addColorStop(1, shade(c1, -0.32).getStyle());
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    // Raios saindo do centro (cara de telão de show).
    ctx.save();
    ctx.translate(w / 2, h * 0.55);
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    for (let index = 0; index < 18; index += 1) {
      ctx.rotate((Math.PI * 2) / 18);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, -60);
      ctx.lineTo(w, 60);
      ctx.fill();
    }
    ctx.restore();
    starRow(ctx, w / 2, h * 0.14, 34);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitFont(ctx, "CAMPEÃO DO MUNDO", "900", 96, w * 0.9);
    ctx.lineWidth = 10;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.strokeText("CAMPEÃO DO MUNDO", w / 2, h * 0.36);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("CAMPEÃO DO MUNDO", w / 2, h * 0.36);
    fitFont(ctx, String(args.season), "900", 230, w * 0.8);
    ctx.fillStyle = gold;
    ctx.strokeText(String(args.season), w / 2, h * 0.64);
    ctx.fillText(String(args.season), w / 2, h * 0.64);
    fitFont(ctx, country, "900", 80, w * 0.8);
    ctx.fillStyle = tooDark(c2) ? "#ffffff" : c2;
    ctx.fillText(country, w / 2, h * 0.89);
  });
  region(0, 768, 512, 256, 2.9, (ctx, w, h) => {
    ctx.fillStyle = "#020202";
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitFont(ctx, country, "900", 150, w * 0.9);
    ctx.fillStyle = bright(c1);
    ctx.fillText(country, w / 2, h * 0.42);
    starRow(ctx, w / 2, h * 0.82, 22);
  });
  region(512, 768, 512, 128, 9, (ctx, w, h) => {
    ctx.fillStyle = c1;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = c2;
    ctx.fillRect(0, 0, w, 14);
    ctx.fillRect(0, h - 14, w, 14);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitFont(ctx, country, "900", 92, w * 0.7);
    ctx.lineWidth = 8;
    ctx.strokeStyle = luminanceOf(c2) > 0.5 ? "rgba(0,0,0,0.4)" : "rgba(255,255,255,0.6)";
    ctx.strokeText(country, w / 2, h / 2 + 4);
    ctx.fillStyle = c2;
    ctx.fillText(country, w / 2, h / 2 + 4);
    ctx.fillStyle = gold;
    for (const x of [0.08, 0.92]) drawStar(ctx, w * x, h / 2, 34);
  });
  region(512, 896, 512, 128, 5, (ctx, w, h) => {
    ctx.fillStyle = c2;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = c3;
    ctx.fillRect(0, 0, w, 10);
    ctx.fillRect(0, h - 10, w, 10);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const text = `CAMPEÕES ${args.season}`;
    fitFont(ctx, text, "900", 84, w * 0.86);
    ctx.fillStyle = c1;
    ctx.fillText(text, w / 2, h / 2 + 4);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, rects };
}

function tooDark(hex: string) {
  return luminanceOf(hex) < 0.1;
}

// --------------------------------------------------------------- montagem

type V3 = { x: number; y: number; z: number };

export function buildTrio(args: TrioArgs): TrioBuild {
  const random = rng(args.seed * 31 + 7);
  const [c1, c2, c3] = flagColors([args.colors[0], args.colors[1], args.thirdColor ?? args.colors[1]]);
  const night = args.timeOfDay === "night";
  const sunset = args.timeOfDay === "sunset";
  const group = new THREE.Group();
  group.name = "parade-trio";

  const body = new GeoBuilder({ aPush: 3, aFinish: 2 });
  const led = new GeoBuilder({ aLed: 4 });
  const paint = c1;
  const accent = c2;
  const PAINT: [number, number] = [0.38, 0.25];
  const MATTE: [number, number] = [0.85, 0];
  const CHROME: [number, number] = [0.28, 0.75];
  const RUBBER: [number, number] = [0.92, 0];
  const finish = (value: [number, number]) => body.set("aFinish", value[0], value[1]).set("aPush", 0, 0, 0);
  const boxAt = (color: string, f: [number, number], cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, skip = "") => {
    body.setColor(color);
    finish(f);
    body.box(cx, cy, cz, sx, sy, sz, skip);
  };

  // --- chassi, saia, caixa do som, sobre-cabine, deck
  boxAt("#16171a", MATTE, 0, 0.8, 0, 17.2, 0.36, 2.3, "t");
  boxAt(paint, PAINT, (REAR + BODY_FRONT) / 2, 0.86, 0, BODY_FRONT - REAR, 0.5, HALF_W * 2, "tb");
  boxAt("#17181c", MATTE, (REAR + BODY_FRONT) / 2, 2.62, 0, BODY_FRONT - REAR, 3.04, HALF_W * 2 - 0.02, "b");
  boxAt(paint, PAINT, (BODY_FRONT + DECK_FRONT) / 2, 3.57, 0, DECK_FRONT - BODY_FRONT, 1.14, HALF_W * 2, "");
  boxAt("#2a2c31", MATTE, (REAR + DECK_FRONT) / 2, DECK - 0.025, 0, DECK_FRONT - REAR, 0.05, HALF_W * 2 + 0.04, "b");
  // Frisos dourados no topo da caixa e na sobre-cabine.
  boxAt("#d9a93a", CHROME, (REAR + DECK_FRONT) / 2, DECK - 0.07, 0, DECK_FRONT - REAR + 0.04, 0.04, HALF_W * 2 + 0.06, "tb");
  boxAt("#d9a93a", CHROME, (REAR + BODY_FRONT) / 2, 1.12, 0, BODY_FRONT - REAR + 0.02, 0.04, HALF_W * 2 + 0.04, "tb");
  // Palco da frente do deck (onde fica o jogador).
  boxAt("#3b3f47", MATTE, 6.85, DECK + 0.006, 0, 3.0, 0.012, 3.0, "b");
  boxAt("#d9a93a", CHROME, 5.32, DECK + 0.012, 0, 0.06, 0.024, 3.0, "b");

  // --- cabine
  const cabBack = 5.6;
  boxAt(paint, PAINT, (cabBack + CAB_FRONT) / 2, 1.75, 0, CAB_FRONT - cabBack, 2.3, 2.5, "b");
  boxAt(accent, PAINT, (cabBack + CAB_FRONT) / 2, 1.42, 0, CAB_FRONT - cabBack + 0.02, 0.16, 2.52, "tb");
  boxAt("#16171a", MATTE, (BODY_FRONT + cabBack) / 2, 1.9, 0, cabBack - BODY_FRONT, 2.1, 2.2, "tb");
  boxAt("#c9ced6", CHROME, CAB_FRONT + 0.02, 1.08, 0, 0.04, 0.55, 1.5);
  for (let index = 0; index < 5; index += 1) boxAt("#55585f", MATTE, CAB_FRONT + 0.045, 0.88 + index * 0.1, 0, 0.02, 0.025, 1.4);
  boxAt("#2b2d33", MATTE, CAB_FRONT + 0.08, 0.68, 0, 0.18, 0.24, 2.5);
  // Quebra-sol sobre o para-brisa e teto na cor 2.
  boxAt(accent, PAINT, CAB_FRONT + 0.02, 2.84, 0, 0.16, 0.12, 2.56);
  boxAt(accent, PAINT, (cabBack + CAB_FRONT) / 2 + 0.6, 2.92, 0, CAB_FRONT - cabBack - 1.2, 0.04, 2.3, "b");
  for (const side of [-1, 1]) {
    boxAt("#16171a", MATTE, CAB_FRONT - 0.35, 2.35, side * 1.42, 0.1, 0.42, 0.06);
    boxAt("#16171a", MATTE, CAB_FRONT - 0.42, 2.12, side * 1.33, 0.04, 0.04, 0.2);
  }

  // --- rodas (pneu + cubo cromado), viradas para o eixo z
  const wheelMatrix = new THREE.Matrix4();
  const segments = args.performance ? 10 : 14;
  for (const x of [7.9, 6.25, -4.4, -5.6, -6.8]) {
    for (const side of [-1, 1]) {
      wheelMatrix.makeRotationX(Math.PI / 2).setPosition(x, 0.55, side * 1.3);
      body.setTransform(wheelMatrix);
      body.setColor("#121214");
      finish(RUBBER);
      body.cylinder(0, 0, 0, 0.55, 0.55, 0.42, segments);
      body.setColor("#c9ced6");
      finish(CHROME);
      body.cylinder(0, 0, 0, 0.3, 0.3, 0.44, segments);
    }
  }
  body.setTransform();

  // --- paredão de som: cones (pulsam), cornetas e divisórias de caixa
  const coneRings: Array<[number, number, string, number]> = [
    [1.0, 0, "#9aa0aa", 0],
    [0.93, 0.05, "#34373e", 0.35],
    [0.84, 0.0, "#24262b", 0.7],
    [0.36, -0.42, "#0f1013", 1],
    [0.34, -0.4, "#7d838d", 1],
    [0.0, -0.24, "#b4bac4", 1],
  ];
  const cone = (center: V3, axis: V3, uAxis: V3, vAxis: V3, radius: number) => {
    const ring: number[][] = [];
    for (let index = 0; index < coneRings.length; index += 1) {
      const [r, depth, color, weight] = coneRings[index];
      const prev = coneRings[Math.max(0, index - 1)];
      const next = coneRings[Math.min(coneRings.length - 1, index + 1)];
      // Normal do perfil (ρ, h): tangente para dentro girada para fora da parede.
      let dr = next[0] - prev[0];
      let dh = next[1] - prev[1];
      const length = Math.hypot(dr, dh) || 1;
      dr /= length;
      dh /= length;
      const nr = dh;
      const nh = -dr;
      body.setColor(color);
      // Aro e calota cromados: é o brilho deles que desenha a grade de cones de longe.
      const shiny = index === 0 || index >= 4;
      body.set("aFinish", shiny ? 0.3 : 0.75, shiny ? 0.6 : 0);
      body.set("aPush", axis.x * weight * radius, axis.y * weight * radius, axis.z * weight * radius);
      const indices: number[] = [];
      const count = r === 0 ? 1 : segments;
      for (let s = 0; s < count; s += 1) {
        const angle = (s / segments) * Math.PI * 2;
        const cu = Math.cos(angle);
        const sv = Math.sin(angle);
        const rad = { x: uAxis.x * cu + vAxis.x * sv, y: uAxis.y * cu + vAxis.y * sv, z: uAxis.z * cu + vAxis.z * sv };
        const px = center.x + rad.x * r * radius + axis.x * depth * radius;
        const py = center.y + rad.y * r * radius + axis.y * depth * radius;
        const pz = center.z + rad.z * r * radius + axis.z * depth * radius;
        indices.push(body.vertex(px, py, pz, rad.x * nr + axis.x * nh, rad.y * nr + axis.y * nh, rad.z * nr + axis.z * nh));
      }
      ring.push(indices);
    }
    for (let index = 0; index < ring.length - 1; index += 1) {
      const a = ring[index];
      const b = ring[index + 1];
      for (let s = 0; s < segments; s += 1) {
        const a0 = a[s];
        const a1 = a[(s + 1) % segments];
        if (b.length === 1) {
          body.triangle(a0, a1, b[0]);
        } else {
          const b0 = b[s];
          const b1 = b[(s + 1) % segments];
          body.triangle(a0, a1, b1);
          body.triangle(a0, b1, b0);
        }
      }
    }
  };
  const horn = (center: V3, axis: V3, uAxis: V3, vAxis: V3, w: number, h: number) => {
    finish([0.6, 0.1]);
    const corner = (su: number, sv: number, scale: number, depth: number) => ({
      x: center.x + uAxis.x * su * w * 0.5 * scale + vAxis.x * sv * h * 0.5 * scale + axis.x * depth,
      y: center.y + uAxis.y * su * w * 0.5 * scale + vAxis.y * sv * h * 0.5 * scale + axis.y * depth,
      z: center.z + uAxis.z * su * w * 0.5 * scale + vAxis.z * sv * h * 0.5 * scale + axis.z * depth,
    });
    const quads: Array<[[number, number], [number, number]]> = [
      [[-1, -1], [1, -1]],
      [[1, -1], [1, 1]],
      [[1, 1], [-1, 1]],
      [[-1, 1], [-1, -1]],
    ];
    body.setColor("#2e3138");
    for (const [[au, av], [bu, bv]] of quads) {
      const outerA = corner(au, av, 1, 0);
      const outerB = corner(bu, bv, 1, 0);
      const innerB = corner(bu, bv, 0.3, -0.16);
      const innerA = corner(au, av, 0.3, -0.16);
      const mid = { x: -(au + bu) / 2, y: -(av + bv) / 2 };
      const normal = {
        x: axis.x * 0.6 + (uAxis.x * mid.x + vAxis.x * mid.y) * 0.8,
        y: axis.y * 0.6 + (uAxis.y * mid.x + vAxis.y * mid.y) * 0.8,
        z: axis.z * 0.6 + (uAxis.z * mid.x + vAxis.z * mid.y) * 0.8,
      };
      body.quad(outerA, outerB, innerB, innerA, normal);
    }
    body.setColor("#050506");
    body.quad(corner(-1, -1, 0.3, -0.16), corner(1, -1, 0.3, -0.16), corner(1, 1, 0.3, -0.16), corner(-1, 1, 0.3, -0.16), axis);
  };
  const rows: Array<{ y: number; kind: "cone" | "horn"; r: number }> = [
    { y: 1.44, kind: "cone", r: 0.265 },
    { y: 2.04, kind: "cone", r: 0.265 },
    { y: 2.56, kind: "cone", r: 0.18 },
    { y: 2.98, kind: "horn", r: 0 },
    { y: 3.38, kind: "cone", r: 0.17 },
  ];
  const wallLines = [1.13, 1.74, 2.34, 2.78, 3.18, 3.6];
  // Paredes laterais (z = ±1,6) e traseira (x = traseira).
  const walls: Array<{ axis: V3; u: V3; along: number[]; at: (t: number, y: number) => V3 }> = [];
  const columns: number[] = [];
  for (let x = REAR + 0.35; x < BODY_FRONT - 0.25; x += 0.6) columns.push(x);
  for (const side of [-1, 1]) {
    walls.push({ axis: { x: 0, y: 0, z: side }, u: { x: side, y: 0, z: 0 }, along: columns, at: (t, y) => ({ x: t, y, z: side * HALF_W }) });
  }
  walls.push({ axis: { x: -1, y: 0, z: 0 }, u: { x: 0, y: 0, z: 1 }, along: [-1.2, -0.6, 0, 0.6, 1.2], at: (t, y) => ({ x: REAR, y, z: t }) });
  const up = { x: 0, y: 1, z: 0 };
  for (const wall of walls) {
    for (const t of wall.along) {
      for (const row of rows) {
        const center = wall.at(t, row.y);
        if (row.kind === "cone") {
          cone(center, wall.axis, wall.u, up, row.r);
        } else {
          horn(center, wall.axis, wall.u, up, 0.5, 0.3);
        }
      }
      // Divisória vertical da caixa.
      const edge = wall.at(t - 0.3, (wallLines[0] + wallLines[wallLines.length - 1]) / 2);
      body.setColor("#3a3d45");
      finish(MATTE);
      const thick = 0.02;
      const height = wallLines[wallLines.length - 1] - wallLines[0];
      if (wall.axis.z !== 0) body.box(edge.x, edge.y, edge.z + wall.axis.z * thick / 2, 0.035, height, thick, wall.axis.z > 0 ? "kb" : "fb");
      else body.box(edge.x - thick / 2, edge.y, edge.z, thick, height, 0.035, "rb");
    }
    for (const y of wallLines) {
      const first = wall.at(wall.along[0] - 0.3, y);
      const last = wall.at(wall.along[wall.along.length - 1] + 0.3, y);
      body.setColor("#3a3d45");
      finish(MATTE);
      if (wall.axis.z !== 0) body.box((first.x + last.x) / 2, y, first.z + wall.axis.z * 0.01, Math.abs(last.x - first.x), 0.035, 0.02, wall.axis.z > 0 ? "kb" : "fb");
      else body.box(first.x - 0.01, y, 0, 0.02, 0.035, Math.abs(last.z - first.z), "rb");
    }
  }

  // --- grade do deck (cromada), com corrimão de LED
  const railTop = DECK + 1.05;
  const railFinish = CHROME;
  const railColor = "#cfd3da";
  for (const side of [-1, 1]) {
    const z = side * (HALF_W - 0.04);
    for (let x = REAR + 0.1; x <= DECK_FRONT - 0.05; x += 1.2) boxAt(railColor, railFinish, x, DECK + 0.525, z, 0.045, 1.05, 0.045, "b");
    boxAt(railColor, railFinish, (REAR + DECK_FRONT) / 2, railTop, z, DECK_FRONT - REAR, 0.05, 0.05);
    boxAt(railColor, railFinish, (REAR + DECK_FRONT) / 2, DECK + 0.55, z, DECK_FRONT - REAR, 0.035, 0.035);
  }
  for (const x of [REAR + 0.05, DECK_FRONT - 0.05]) {
    for (let z = -HALF_W + 0.4; z < HALF_W - 0.3; z += 0.8) boxAt(railColor, railFinish, x, DECK + 0.525, z, 0.045, 1.05, 0.045, "b");
    boxAt(railColor, railFinish, x, railTop, 0, 0.05, 0.05, HALF_W * 2);
    boxAt(railColor, railFinish, x, DECK + 0.55, 0, 0.035, 0.035, HALF_W * 2);
  }

  // --- treliça de luz sobre o palco da frente
  const trussX = 5.2;
  const trussTop = DECK + 3.0;
  const trussColor = "#b9bec6";
  const chord = 0.045;
  for (const side of [-1, 1]) {
    const z = side * 1.42;
    for (const [dx, dz] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) boxAt(trussColor, CHROME, trussX + dx, (DECK + trussTop) / 2, z + dz, chord, trussTop - DECK, chord, "b");
    for (let y = DECK + 0.4; y < trussTop; y += 0.5) {
      boxAt(trussColor, CHROME, trussX, y, z - 0.14, 0.28, 0.03, 0.03, "");
      boxAt(trussColor, CHROME, trussX, y, z + 0.14, 0.28, 0.03, 0.03, "");
      boxAt(trussColor, CHROME, trussX - 0.14, y, z, 0.03, 0.03, 0.28, "");
      boxAt(trussColor, CHROME, trussX + 0.14, y, z, 0.03, 0.03, 0.28, "");
    }
  }
  for (const [dx, dy] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) boxAt(trussColor, CHROME, trussX + dx, trussTop + dy, 0, chord, chord, 3.12);
  for (let z = -1.3; z <= 1.31; z += 0.4) {
    boxAt(trussColor, CHROME, trussX, trussTop - 0.14, z, 0.28, 0.03, 0.03);
    boxAt(trussColor, CHROME, trussX, trussTop + 0.14, z, 0.28, 0.03, 0.03);
  }
  // Cabeças móveis penduradas na treliça.
  const heads = [-1.0, -0.34, 0.34, 1.0];
  for (const z of heads) {
    boxAt("#15161a", MATTE, trussX, trussTop - 0.32, z, 0.06, 0.26, 0.26, "");
    boxAt("#1d1f24", MATTE, trussX, trussTop - 0.5, z, 0.3, 0.3, 0.26, "");
  }

  // --- telão no fundo do deck + banda (bateria, teclado)
  const wallX = REAR + 0.85;
  boxAt("#111215", MATTE, wallX, DECK + 1.25, 0, 0.18, 2.5, 3.2, "");
  boxAt("#16171a", MATTE, wallX, DECK + 0.1, 0, 0.6, 0.2, 3.0, "b");
  body.setColor("#f2efe8");
  finish([0.5, 0]);
  wheelMatrix.makeRotationZ(Math.PI / 2).setPosition(wallX + 1.3, DECK + 0.32, 0);
  body.setTransform(wheelMatrix);
  body.cylinder(0, 0, 0, 0.3, 0.3, 0.32, segments);
  body.setTransform();
  for (const [x, z, r] of [[wallX + 1.0, -0.55, 0.16], [wallX + 1.05, 0.5, 0.18], [wallX + 1.6, -0.75, 0.2]] as const) {
    body.setColor(accent);
    finish(PAINT);
    body.cylinder(x, DECK + 0.72, z, r, r, 0.22, segments);
    body.setColor("#c9ced6");
    finish(CHROME);
    body.cylinder(x, DECK + 0.3, z, 0.015, 0.015, 0.6, 6, false);
  }
  for (const [x, z] of [[wallX + 0.9, 0.95], [wallX + 1.5, 1.0], [wallX + 0.8, -1.05]] as const) {
    body.setColor("#d6b04c");
    finish(CHROME);
    body.cylinder(x, DECK + 1.15, z, 0.24, 0.24, 0.012, segments);
    body.setColor("#c9ced6");
    body.cylinder(x, DECK + 0.57, z, 0.012, 0.012, 1.14, 6, false);
  }
  boxAt("#15161a", MATTE, wallX + 2.5, DECK + 0.9, 1.0, 0.4, 0.06, 1.1);
  boxAt("#e9e9e9", MATTE, wallX + 2.5, DECK + 0.94, 1.0, 0.18, 0.02, 1.0, "b");
  boxAt("#2b2d33", MATTE, wallX + 2.5, DECK + 0.45, 1.0, 0.05, 0.9, 0.05, "b");
  // Retornos (monitores de chão) na beira do palco.
  for (const z of [-0.9, 0.9]) {
    wheelMatrix.makeRotationZ(-0.45).setPosition(DECK_FRONT - 0.45, DECK + 0.18, z);
    body.setTransform(wheelMatrix);
    body.setColor("#121316");
    finish(MATTE);
    body.box(0, 0, 0, 0.36, 0.32, 0.55);
    body.setTransform();
  }

  // ------------------------------------------------------------- LEDs, vidro e pano
  const atlas = ledAtlas({ colors: [c1, c2, c3], country: args.countryName, season: args.season, stars: args.stars });
  const ledMode = (mode: number, a = 0, b = 0, c = 0) => led.set("aLed", mode, a, b, c);
  const face = (corner: V3, uDir: V3, vDir: V3, w: number, h: number, normal: V3, uv: [number, number, number, number]) => {
    const P = (su: number, sv: number) => ({ x: corner.x + uDir.x * su * w + vDir.x * sv * h, y: corner.y + uDir.y * su * w + vDir.y * sv * h, z: corner.z + uDir.z * su * w + vDir.z * sv * h });
    led.quad(P(0, 0), P(1, 0), P(1, 1), P(0, 1), normal, uv);
  };
  const atlasUv = (rect: Rect): [number, number, number, number] => [rect[0], rect[1], rect[0] + rect[2], rect[1] + rect[3]];
  const strip = (from: V3, to: V3, normal: V3, width: number, phase: number) => {
    const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    const dir = { x: (to.x - from.x) / length, y: (to.y - from.y) / length, z: (to.z - from.z) / length };
    // Largura no plano da parede: normal × direção, para a face olhar para fora.
    const side = { x: normal.y * dir.z - normal.z * dir.y, y: normal.z * dir.x - normal.x * dir.z, z: normal.x * dir.y - normal.y * dir.x };
    const corner = { x: from.x - side.x * width / 2 + normal.x * 0.012, y: from.y - side.y * width / 2 + normal.y * 0.012, z: from.z - side.z * width / 2 + normal.z * 0.012 };
    ledMode(2, phase);
    led.setColor("#ffffff");
    face(corner, dir, side, length, width, normal, [0, 0, length, 1]);
  };
  // Letreiros correndo no alto das laterais e na traseira.
  const marqueeLow = 3.63;
  const marqueeHigh = 4.1;
  const bandLength = BODY_FRONT - REAR - 0.2;
  for (const side of [-1, 1]) {
    ledMode(1, 128 * 3, 24);
    const startX = side > 0 ? REAR + 0.1 : BODY_FRONT - 0.1;
    face({ x: startX, y: marqueeLow, z: side * (HALF_W + 0.012) }, { x: side, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, bandLength, marqueeHigh - marqueeLow, { x: 0, y: 0, z: side }, [0, 0, 3, 1]);
  }
  ledMode(1, 384, 24);
  face({ x: REAR - 0.012, y: marqueeLow, z: -HALF_W + 0.1 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }, HALF_W * 2 - 0.2, marqueeHigh - marqueeLow, { x: -1, y: 0, z: 0 }, [0, 0, 0.45, 1]);
  // Telão do fundo (as duas faces) e fachada sobre a cabine.
  ledMode(0, 170);
  face({ x: wallX + 0.095, y: DECK + 0.35, z: 1.5 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }, 3.0, 1.9, { x: 1, y: 0, z: 0 }, atlasUv(atlas.rects.backdrop));
  face({ x: wallX - 0.095, y: DECK + 0.35, z: -1.5 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }, 3.0, 1.9, { x: -1, y: 0, z: 0 }, atlasUv(atlas.rects.backdrop));
  ledMode(0, 150);
  face({ x: DECK_FRONT + 0.012, y: 3.06, z: HALF_W - 0.05 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }, HALF_W * 2 - 0.1, 1.02, { x: 1, y: 0, z: 0 }, atlasUv(atlas.rects.facade));
  // Fitas de LED: beira do deck, saia, quinas, corrimão e treliça.
  for (const side of [-1, 1]) {
    const z = side * (HALF_W + 0.002);
    const normal = { x: 0, y: 0, z: side };
    strip({ x: REAR, y: DECK - 0.11, z }, { x: DECK_FRONT, y: DECK - 0.11, z }, normal, 0.06, 0);
    strip({ x: REAR, y: 0.64, z }, { x: BODY_FRONT, y: 0.64, z }, normal, 0.07, 1);
    // Fita no meio do paredão (na frente da divisória das caixas).
    const wallZ = side * (HALF_W + 0.025);
    strip({ x: REAR, y: 2.34, z: wallZ }, { x: BODY_FRONT, y: 2.34, z: wallZ }, normal, 0.05, 3);
    strip({ x: REAR + 0.03, y: 1.15, z }, { x: REAR + 0.03, y: DECK - 0.15, z }, normal, 0.06, 2);
    strip({ x: DECK_FRONT - 0.03, y: 3.02, z }, { x: DECK_FRONT - 0.03, y: DECK - 0.15, z }, normal, 0.06, 2);
    strip({ x: REAR, y: railTop + 0.03, z: side * (HALF_W - 0.04) }, { x: DECK_FRONT, y: railTop + 0.03, z: side * (HALF_W - 0.04) }, { x: 0, y: 1, z: 0 }, 0.05, 0.5);
  }
  strip({ x: trussX + 0.16, y: trussTop + 0.14, z: -1.5 }, { x: trussX + 0.16, y: trussTop + 0.14, z: 1.5 }, { x: 1, y: 0, z: 0 }, 0.05, 1.5);
  strip({ x: trussX + 0.16, y: trussTop - 0.14, z: -1.5 }, { x: trussX + 0.16, y: trussTop - 0.14, z: 1.5 }, { x: 1, y: 0, z: 0 }, 0.05, 2.5);
  strip({ x: REAR - 0.025, y: 2.34, z: -HALF_W }, { x: REAR - 0.025, y: 2.34, z: HALF_W }, { x: -1, y: 0, z: 0 }, 0.05, 3);
  strip({ x: DECK_FRONT + 0.015, y: DECK - 0.11, z: -HALF_W }, { x: DECK_FRONT + 0.015, y: DECK - 0.11, z: HALF_W }, { x: 1, y: 0, z: 0 }, 0.06, 0);
  // Faróis, lanternas e as lentes das cabeças móveis (piscam na batida).
  led.setColor("#fff4dc");
  ledMode(4, 2.2, 0);
  for (const z of [-0.92, 0.92]) face({ x: CAB_FRONT + 0.03, y: 1.17, z: z + 0.16 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }, 0.32, 0.17, { x: 1, y: 0, z: 0 }, [0, 0, 1, 1]);
  led.setColor("#ff2a1f");
  ledMode(4, 1.8, 0);
  for (const z of [-1.3, 1.1]) face({ x: REAR - 0.015, y: 0.72, z }, { x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }, 0.2, 0.12, { x: -1, y: 0, z: 0 }, [0, 0, 1, 1]);
  const lensColors = [c1, "#ffffff", c2, "#ffffff"];
  heads.forEach((z, index) => {
    led.setColor(lensColors[index]);
    ledMode(4, 2.4, 1);
    face({ x: trussX - 0.11, y: trussTop - 0.651, z: z - 0.11 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 0.22, 0.22, { x: 0, y: -1, z: 0 }, [0, 0, 1, 1]);
  });
  // Vidros da cabine.
  ledMode(5);
  led.setColor("#000000");
  face({ x: CAB_FRONT + 0.012, y: 1.78, z: 1.1 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }, 2.2, 0.95, { x: 1, y: 0, z: 0 }, [0, 0, 1, 1]);
  for (const side of [-1, 1]) {
    const start = side > 0 ? 7.45 : 8.6;
    face({ x: start, y: 1.82, z: side * 1.262 }, { x: side > 0 ? 1 : -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 1.15, 0.82, { x: 0, y: 0, z: side }, [0, 0, 1, 1]);
  }
  // Faixas de pano na grade: nome do país nas laterais, "CAMPEÕES" na frente.
  ledMode(3);
  for (const side of [-1, 1]) {
    const length = 9.0;
    const startX = side > 0 ? -4.6 : -4.6 + length;
    face({ x: startX, y: DECK + 0.14, z: side * (HALF_W + 0.01) }, { x: side, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, length, 0.86, { x: 0, y: 0, z: side }, atlasUv(atlas.rects.countryCloth));
  }
  face({ x: DECK_FRONT + 0.01, y: DECK + 0.12, z: 1.4 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }, 2.8, 0.55, { x: 1, y: 0, z: 0 }, atlasUv(atlas.rects.frontCloth));

  // ------------------------------------------------------------- malhas
  const pump = { uPump: { value: 0 } };
  const bodyMaterial = createBodyMaterial(pump);
  const bodyMesh = new THREE.Mesh(body.build(), bodyMaterial);
  bodyMesh.name = "parade-trio-body";
  group.add(bodyMesh);

  const ledUniforms = litUniforms({
    uAtlas: { value: atlas.texture },
    uMarquee: { value: new THREE.Vector4(...atlas.rects.marquee) },
    uTime: { value: 0 },
    uBeat: { value: 0 },
    uStrobe: { value: 0 },
    uGain: { value: night ? 1.9 : sunset ? 1.7 : 1.5 },
    uC1: { value: new THREE.Color(shade(c1, 0.04, 0.1)) },
    uC2: { value: new THREE.Color(shade(c2, 0.04, 0.1)) },
    uC3: { value: new THREE.Color(night ? "#ffffff" : shade(c3, 0.04, 0.1)) },
  });
  const ledMaterial = new THREE.ShaderMaterial({ uniforms: ledUniforms, vertexShader: LED_VERTEX, fragmentShader: LED_FRAGMENT, lights: true, fog: true });
  const ledMesh = new THREE.Mesh(led.build(), ledMaterial);
  ledMesh.name = "parade-trio-led";
  group.add(ledMesh);

  // Bandeiras nas quinas do deck (mesmo programa das bandeiras da multidão).
  const flagUniforms = createCrowdUniforms();
  const flagMaterial = createFlagMaterial([c1, c2, c3], flagUniforms, args.lozenge ?? true);
  const flagSpots: Array<[number, number, number, number, number]> = [
    [DECK_FRONT - 0.1, -HALF_W + 0.08, 3.1, 1.7, 3],
    [DECK_FRONT - 0.1, HALF_W - 0.08, 3.1, 1.7, 0],
    [REAR + 0.15, -HALF_W + 0.08, 3.6, 2.2, 0],
    [REAR + 0.15, HALF_W - 0.08, 3.6, 2.2, 3],
    [trussX, -1.62, 3.9, 1.5, 1],
    [trussX, 1.62, 3.9, 1.5, 2],
  ];
  const flagBase = flagGeometry(12, 6);
  const flagGeo = new THREE.InstancedBufferGeometry();
  flagGeo.index = flagBase.index;
  for (const name of ["position", "normal", "uv", "aPart"]) flagGeo.setAttribute(name, flagBase.getAttribute(name));
  flagGeo.instanceCount = flagSpots.length;
  flagGeo.setAttribute("aFan", new THREE.InstancedBufferAttribute(new Float32Array(flagSpots.flatMap(([x, z, pole]) => [x, DECK, z, pole])), 4));
  flagGeo.setAttribute("aAct", new THREE.InstancedBufferAttribute(new Float32Array(flagSpots.flatMap(() => [random(), 1, 2, 0])), 4));
  flagGeo.setAttribute("aFlag", new THREE.InstancedBufferAttribute(new Float32Array(flagSpots.flatMap(([, , , w, pattern]) => [2, pattern, w, w * 0.66])), 4));
  const flagMesh = new THREE.Mesh(flagGeo, flagMaterial);
  flagMesh.name = "parade-trio-flags";
  flagMesh.frustumCulled = false;
  group.add(flagMesh);

  // Fachos de luz (tarde e noite): cones abertos, aditivos, girando.
  let beamMesh: THREE.Mesh | null = null;
  const beamUniforms = { uTime: { value: 0 }, uIntensity: { value: night ? 0.55 : 0.13 }, uFade: { value: new THREE.Vector2(200, 900) } };
  if (night || sunset) {
    const beams = new GeoBuilder({ aBeam: 4 });
    const pivots: Array<[V3, string]> = heads.map((z, index) => [{ x: trussX, y: trussTop - 0.66, z }, lensColors[index]]);
    if (!args.performance) {
      pivots.push([{ x: wallX, y: DECK + 2.55, z: -1.3 }, c2], [{ x: wallX, y: DECK + 2.55, z: 1.3 }, c1]);
    }
    const length = 30;
    const radius = 2.2;
    pivots.forEach(([pivot, color], index) => {
      beams.set("aBeam", pivot.x, pivot.y, pivot.z, index);
      beams.setColor(color === "#ffffff" ? "#fff6e6" : shade(color, 0.12, 0.1));
      const first = beams.vertexCount;
      const steps = 12;
      for (let s = 0; s <= steps; s += 1) {
        const angle = (s / steps) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        beams.vertex(cos * 0.1, 0, sin * 0.1, cos, 0, sin, s / steps, 0);
        beams.vertex(cos * radius, length, sin * radius, cos, 0, sin, s / steps, 1);
      }
      for (let s = 0; s < steps; s += 1) {
        const a = first + s * 2;
        beams.triangle(a, a + 1, a + 3);
        beams.triangle(a, a + 3, a + 2);
      }
    });
    const beamMaterial = new THREE.ShaderMaterial({
      uniforms: beamUniforms,
      vertexShader: BEAM_VERTEX,
      fragmentShader: BEAM_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    beamMesh = new THREE.Mesh(beams.build(), beamMaterial);
    beamMesh.name = "parade-trio-beams";
    beamMesh.frustumCulled = false;
    beamMesh.renderOrder = 3;
    trackFogFade(beamMesh, beamUniforms.uFade);
    group.add(beamMesh);
  }

  const slots = [
    [6.95, 0],
    [6.1, -1.0],
    [6.1, 1.0],
    [4.4, -0.55],
    [4.4, 0.6],
    [3.0, -1.05],
    [3.0, 0.95],
    [1.7, -0.3],
    [0.5, 0.85],
    [0.3, -1.0],
    [-1.0, 0.1],
    [-2.3, -0.9],
    [-2.6, 0.9],
    [-4.0, 0],
  ].map(([x, z]) => new THREE.Vector3(x, DECK, z));

  let lastBeat = 0;
  let strobe = 0;
  return {
    group,
    deckHeight: DECK,
    slots,
    size: { length: CAB_FRONT + 0.2 - REAR, width: HALF_W * 2, height: trussTop + 0.2, front: CAB_FRONT + 0.2, back: REAR },
    update(time, dt, beat) {
      const pulse = Number.isFinite(beat) ? THREE.MathUtils.clamp(beat, 0, 1) : 0;
      // Estrobo só à noite, no tempo forte.
      if (night && pulse > 0.85 && lastBeat <= 0.85) strobe = 1;
      strobe *= Math.exp(-Math.max(dt, 0) * 14);
      lastBeat = pulse;
      pump.uPump.value = pulse * (args.performance ? 0.18 : 0.26);
      ledUniforms.uTime.value = time;
      ledUniforms.uBeat.value = pulse;
      ledUniforms.uStrobe.value = strobe * 0.6;
      flagUniforms.uTime.value = time;
      beamUniforms.uTime.value = time;
    },
    dispose() {
      bodyMesh.geometry.dispose();
      bodyMaterial.dispose();
      ledMesh.geometry.dispose();
      ledMaterial.dispose();
      atlas.texture.dispose();
      flagGeo.dispose();
      flagBase.dispose();
      flagMaterial.dispose();
      if (beamMesh) {
        beamMesh.geometry.dispose();
        (beamMesh.material as THREE.Material).dispose();
      }
      group.clear();
    },
  };
}
