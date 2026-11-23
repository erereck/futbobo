// Estádio do modo 3D: gramado (pintado pelo mesmo código da mesa 2D), tabelas
// com placas de LED, gols com rede de pano, bandeirinhas, fotógrafos, torcida
// de bonecos de bloco animada na GPU e torres de luz.
//
// Mundo: x do campo vira X - largura/2, y do campo vira Z - altura/2. Assim o
// gol da CPU (y = 0) fica em -Z e o seu (y = altura) em +Z. O usuário ataca -Z
// e a CPU ataca +Z.
//
// Orçamento: 13 draw calls no passe principal e 6 no da sombra (modo desempenho:
// 10 e nenhum). Nada liga/desliga `visible` nem troca de tipo de material
// durante o jogo, então nenhum shader recompila no gol. Tudo aqui é parado:
// as matrizes são calculadas uma vez (só a trave que treme recalcula a dela).
//
// Campo de rua (tema "street"): no lugar do estádio, um bairro com três
// variações (rua do bairro de dia, terrão no pôr do sol, quadra da praça à
// noite). Mesmas tabelas, mesmos gols e a mesma torcida (vizinhos de pé), no
// máximo 13 draw calls e 5 na sombra; a hora do dia sai em `sceneMoodForMatch`.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FIELD, GOAL_LEFT, GOAL_RIGHT } from "../engine";
import {
  fieldThemeForMatch,
  isFutsalTheme,
  streetVariantForMatch,
  type BotaoFieldTheme,
  type BotaoStreetVariant,
} from "../field-themes";
import { drawFieldSurface } from "../render";
import type { BotaoMatchSetup, BotaoSide, BotaoTeam } from "../types";
import { luminance, mixHex, shadeHex } from "./textures";

export const HALF_W = FIELD.width / 2;
export const HALF_H = FIELD.height / 2;
export const GOAL_HEIGHT = 30;
const RAIL_HEIGHT = 7;
const RAIL_THICKNESS = 3;
const NET_CELL = 3.6;
// Traves no mesmo lugar e com o mesmo raio do motor (y = -1 e altura + 1): a
// bola volta exatamente quando encosta no poste desenhado.
const POST_RADIUS = FIELD.postRadius;
const POST_OFFSET = 1;
const CROSSBAR_RADIUS = 2.6;
const LED_WIDTH = 1024;
const LED_HEIGHT = 64;
// Setor visitante: miolo da arquibancada atrás do gol que o visitante ataca.
const AWAY_HALF_WIDTH = 110;
const SECTOR_GAP = 10;
// Modo desempenho: escadas entre os blocos de cadeiras pintadas.
const AISLE_SPACING = 64;
const AISLE_WIDTH = 3;
// A ola dá uma volta no estádio nesse tempo (~260 u/s na arquibancada).
const WAVE_LAP = 7;
// Período comum dos balanços ociosos (1.6 e 0.8 rad/s): o relógio da GPU dá a
// volta aqui sem salto e nunca perde precisão.
const IDLE_PERIOD = (Math.PI * 2 * 20) / 0.8;
const FLASH_AMBIENT = 0.02;
const SIDES = ["user", "cpu"] as const;
const STAND_ROWS = 6;
/** Pernas do vizinho de rua (unidades do boneco, antes da escala). */
const FAN_LEG = 5.5;
const STEP_COLOR = "#252c35";
const FLOOR_COLOR = "#0b1016";
const APRON_HALF_W = HALF_W + 42;
const APRON_HALF_H = HALF_H + 58;
const FLOOR_HALF = 2000;
/** Entorno escuro de cada quadra de futsal (o 2D usa a mesma ideia na moldura). */
const FUTSAL_APRONS = { "futsal-blue": "#0b2c42", "futsal-orange": "#46200f" } as const;
/** Rugosidade do piso de rua: asfalto, terra batida, concreto pintado. */
const STREET_ROUGHNESS: Record<BotaoStreetVariant, number> = { 0: 0.93, 1: 1, 2: 0.6 };
const LAMP_EMISSIVE = "#fff7e0";
const LAMP_GLOW = 2.4;
/**
 * Placa no modo desempenho (MeshBasic): o brilho vira cor acima de 1, que passa
 * pelo ACES como o emissivo. Ganho que casa com emissivo + difusa da placa PBR.
 */
const LED_BASIC_GAIN = 1.3;

/** Acabamento PBR por vértice: [rugosidade, metal, brilho próprio 0..1]. */
type Finish = readonly [number, number, number];
const RAIL_FINISH: Finish = [0.55, 0.2, 0];
const POLE_FINISH: Finish = [0.5, 0, 0];
const FRAME_FINISH: Finish = [0.35, 0.1, 0];
const TOWER_FINISH: Finish = [0.6, 0.4, 0];
const LAMP_FINISH: Finish = [1, 0, 1];

export type StadiumOptions = {
  /** Sem piscar nem tremer: placas trocam de texto sem estrobo, sem flashes, torcida pula menos. */
  reducedMotion?: boolean;
  /**
   * Modo desempenho 3D: sem torcida (degraus pintados nas cores dos times),
   * flashes, fotógrafos e torres; gramado sem PBR e com textura em meia
   * resolução, placas sem PBR, tabelas e traves em Lambert e nada de sombra.
   * Fixo por estádio: trocar o modo recria a visão.
   */
  performance?: boolean;
};

type BoardMode = "base" | "goal" | "fim" | "post";

// ------------------------------------------------------------------ clima

/**
 * Luz e céu da cena. A visão monta fundo, neblina, luzes e exposição com isto;
 * o estádio é sempre a mesma noite de transmissão, a rua muda com a variação.
 */
export type SceneMood = {
  background: string;
  fog: string;
  hemisphereSky: string;
  hemisphereGround: string;
  hemisphereIntensity: number;
  sun: string;
  sunIntensity: number;
  /** Onde fica o sol em relação ao centro da caixa de sombra (direção e distância). */
  sunOffset: readonly [number, number, number];
  fill: string;
  fillIntensity: number;
  fillPosition: readonly [number, number, number];
  exposure: number;
};

/** Os valores de sempre do estádio (grama e futsal): nada muda para eles. */
export const STADIUM_MOOD: SceneMood = {
  background: "#0a1219",
  fog: "#0a1219",
  hemisphereSky: "#d6ecff",
  hemisphereGround: "#1d3322",
  hemisphereIntensity: 1.05,
  sun: "#fff3df",
  sunIntensity: 2.35,
  sunOffset: [-170, 430, 210],
  fill: "#9cc3ff",
  fillIntensity: 0.55,
  fillPosition: [220, 260, -260],
  exposure: 1.08,
};

const STREET_MOODS: Record<BotaoStreetVariant, SceneMood> = {
  // Tarde de sol: céu claro, sol quente vindo do oeste e um pouco baixo.
  0: {
    background: "#a9c3d6",
    fog: "#a9c3d6",
    hemisphereSky: "#d4e8ff",
    hemisphereGround: "#6a5c4c",
    hemisphereIntensity: 1,
    sun: "#ffefd2",
    sunIntensity: 2.55,
    sunOffset: [-280, 400, 150],
    fill: "#b4d2ff",
    fillIntensity: 0.4,
    fillPosition: [240, 220, -240],
    exposure: 1.02,
  },
  // Pôr do sol: sol laranja rasante (sombras compridas), céu lilás e neblina dourada.
  1: {
    background: "#d29a72",
    fog: "#d29a72",
    hemisphereSky: "#b9a2d8",
    hemisphereGround: "#6e4a30",
    hemisphereIntensity: 1,
    sun: "#ffad5c",
    sunIntensity: 2.45,
    sunOffset: [-430, 210, 160],
    fill: "#7d8fe0",
    fillIntensity: 0.45,
    fillPosition: [260, 160, -220],
    exposure: 1.1,
  },
  // Noite: a "luz do sol" é a dos refletores, quase a pino; o resto é azul-escuro
  // e um rebote alaranjado de poste de rua.
  2: {
    background: "#070b16",
    fog: "#0a1020",
    hemisphereSky: "#5a6c9c",
    hemisphereGround: "#15171e",
    hemisphereIntensity: 0.62,
    sun: "#eef2ff",
    sunIntensity: 2.05,
    sunOffset: [-110, 470, 160],
    fill: "#ffb36b",
    fillIntensity: 0.3,
    fillPosition: [240, 200, -260],
    exposure: 1.12,
  },
};

/** Clima da partida: o estádio de sempre ou a hora do dia da rua sorteada. */
export function sceneMoodForMatch(setup: BotaoMatchSetup): SceneMood {
  return fieldThemeForMatch(setup) === "street" ? STREET_MOODS[streetVariantForMatch(setup)] : STADIUM_MOOD;
}

// ------------------------------------------------------------ utilidades

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sobe e desce com velocidades diferentes, sem passar do alvo. */
function approach(current: number, target: number, rise: number, fall: number, dt: number) {
  return target > current ? Math.min(target, current + rise * dt) : Math.max(target, current - fall * dt);
}

function sideIndex(side: BotaoSide) {
  return side === "user" ? 0 : 1;
}

/** Usuário ataca -Z (gol da CPU), CPU ataca +Z. */
function attackSign(side: BotaoSide) {
  return side === "user" ? -1 : 1;
}

/**
 * Junta peças estáticas numa geometria só. Estádio parado não precisa de
 * um draw call por degrau, trave ou poste — no celular isso faz diferença.
 * Com `color`, grava cor por vértice: peças de cores diferentes no mesmo draw.
 * Com `finishes`, grava também o acabamento (`finishMaterial`); sem isso, um
 * `finish` só escurece a cor pelo metal (a parte difusa do PBR, para Lambert).
 * UV só fica com `keepUv` (quem tem textura): o resto não paga a memória.
 */
class Baker {
  private readonly parts: THREE.BufferGeometry[] = [];
  private readonly helper = new THREE.Object3D();
  private readonly tint = new THREE.Color();

  constructor(private readonly options: { finishes?: boolean; keepUv?: boolean } = {}) {}

  /** `scale` deixa reaproveitar uma caixa/cilindro unitário para peças de qualquer tamanho. */
  add(geometry: THREE.BufferGeometry, position: THREE.Vector3, rotation?: THREE.Euler | THREE.Quaternion, color?: THREE.ColorRepresentation, finish?: Finish, scale?: THREE.Vector3) {
    this.helper.position.copy(position);
    if (rotation instanceof THREE.Quaternion) this.helper.quaternion.copy(rotation);
    else if (rotation) this.helper.rotation.copy(rotation);
    else this.helper.rotation.set(0, 0, 0);
    if (scale) this.helper.scale.copy(scale);
    else this.helper.scale.set(1, 1, 1);
    this.helper.updateMatrix();
    const part = geometry.clone().applyMatrix4(this.helper.matrix);
    if (!this.options.keepUv) part.deleteAttribute("uv");
    const count = part.getAttribute("position").count;
    // O merge exige todas indexadas (ou nenhuma): icosaedro e prisma vêm sem índice.
    if (!part.index) part.setIndex(Array.from({ length: count }, (_, index) => index));
    if (color !== undefined) {
      this.tint.set(color);
      if (finish && !this.options.finishes) this.tint.multiplyScalar(1 - finish[1]);
      part.setAttribute("color", new THREE.BufferAttribute(repeated(count, this.tint.r, this.tint.g, this.tint.b), 3));
    }
    if (this.options.finishes) {
      const [roughness, metalness, glow] = finish ?? [1, 0, 0];
      part.setAttribute("aFinish", new THREE.BufferAttribute(repeated(count, roughness, metalness, glow), 3));
    }
    this.parts.push(part);
  }

  geometry() {
    if (this.parts.length === 0) return new THREE.BufferGeometry();
    const merged = mergeGeometries(this.parts) ?? new THREE.BufferGeometry();
    this.parts.forEach((part) => part.dispose());
    this.parts.length = 0;
    return merged;
  }

  /** Sem sombra recebida por padrão: só chão, gramado, tabelas e traves pedem. */
  build(material: THREE.Material, receiveShadow = false) {
    const result = new THREE.Mesh(this.geometry(), material);
    result.receiveShadow = receiveShadow;
    return result;
  }
}

function repeated(count: number, a: number, b: number, c: number) {
  const values = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    values[index * 3] = a;
    values[index * 3 + 1] = b;
    values[index * 3 + 2] = c;
  }
  return values;
}

/** Peça parada: matriz montada uma vez e fora do `updateMatrixWorld` de cada quadro. */
function freeze(object: THREE.Object3D) {
  object.traverse((child) => {
    child.updateMatrix();
    child.matrixAutoUpdate = false;
  });
}

/**
 * Moldura no chão entre o retângulo `inner` e o `outer` (meias medidas), sem
 * nada no miolo: o que fica embaixo do gramado ou do entorno nunca é pintado.
 * As faixas dos lados entram `overlap` nas de cima e de baixo, sem fresta.
 */
function addFrame(baker: Baker, innerX: number, innerZ: number, outerX: number, outerZ: number, y: number, color: string, overlap = 1) {
  const flat = new THREE.Euler(-Math.PI / 2, 0, 0);
  const depth = outerZ - innerZ;
  const band = new THREE.PlaneGeometry(outerX * 2, depth);
  for (const sign of [-1, 1]) baker.add(band, new THREE.Vector3(0, y, sign * (innerZ + depth / 2)), flat, color);
  const width = outerX - innerX;
  const side = new THREE.PlaneGeometry(width, (innerZ + overlap) * 2);
  for (const sign of [-1, 1]) baker.add(side, new THREE.Vector3(sign * (innerX + width / 2), y, 0), flat, color);
  band.dispose();
  side.dispose();
}

/**
 * MeshStandard com rugosidade, metal e brilho próprio vindos do vértice
 * (atributo `aFinish` do Baker): tabelas, mastros, traves, torres e refletores
 * dividem um programa e um material. O emissivo do material só acende onde o
 * brilho é 1 (refletores), então animar a intensidade não mexe no resto.
 */
function finishMaterial() {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: LAMP_EMISSIVE, emissiveIntensity: LAMP_GLOW });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aFinish;\nvarying vec3 vFinish;")
      .replace("#include <color_vertex>", "#include <color_vertex>\nvFinish = aFinish;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vFinish;")
      .replace("#include <roughnessmap_fragment>", "float roughnessFactor = vFinish.x;")
      .replace("#include <metalnessmap_fragment>", "float metalnessFactor = vFinish.y;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vFinish.z;");
  };
  material.customProgramCacheKey = () => "futbobo-finish";
  return material;
}

// ------------------------------------------------------------ texturas

/**
 * `scale` texels por unidade do campo: 4 normal, 2 no modo desempenho (1/4 da
 * memória). Na rua o piso já vem cheio de detalhe do `render.ts` (asfalto,
 * terra ou concreto): nada de grão de grama por cima.
 */
function fieldTexture(setup: BotaoMatchSetup, theme: BotaoFieldTheme, streetVariant: BotaoStreetVariant, anisotropy: number, scale: number) {
  const canvas = document.createElement("canvas");
  canvas.width = FIELD.width * scale;
  canvas.height = FIELD.height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  drawFieldSurface(ctx, setup, streetVariant);
  if (theme === "street") {
    if (streetVariant === 2) {
      // Concreto pintado sob refletor: um brilho largo no meio da quadra.
      const sheen = ctx.createRadialGradient(FIELD.width / 2, FIELD.height / 2, 10, FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.62);
      sheen.addColorStop(0, "rgba(255,255,255,0.06)");
      sheen.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }
  } else if (!isFutsalTheme(theme)) {
    // Grão de grama: de longe some, de perto tira o aspecto de plástico. Os
    // traços vão para dois caminhos (claro e escuro): 2 strokes em vez de 14 mil.
    const random = seeded(setup.seed ^ 0x9e3779b9);
    const light = new Path2D();
    const dark = new Path2D();
    for (let index = 0; index < 14000; index += 1) {
      const x = random() * FIELD.width;
      const y = random() * FIELD.height;
      const path = random() < 0.5 ? light : dark;
      path.moveTo(x, y);
      path.lineTo(x + (random() - 0.5) * 1.4, y - 1 - random() * 1.6);
    }
    ctx.lineWidth = 0.35;
    ctx.strokeStyle = "rgba(255,255,255,0.045)";
    ctx.stroke(light);
    ctx.strokeStyle = "rgba(0,0,0,0.07)";
    ctx.stroke(dark);
  } else {
    const sheen = ctx.createRadialGradient(FIELD.width / 2, FIELD.height / 2, 10, FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.7);
    sheen.addColorStop(0, "rgba(255,255,255,0.08)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

/**
 * Faixas de corte que clareiam de um lado e escurecem do outro conforme de onde
 * a câmera olha, como a grama deitada na TV. Máscara analítica igual ao desenho
 * de `render.ts`, em coordenadas do campo; no máximo ±5% do brilho. Serve para
 * Standard e Lambert (os dois têm `map_fragment` e `diffuseColor`).
 */
function addMowingSheen(material: THREE.Material, theme: BotaoFieldTheme) {
  // Quadra e rua não têm grama deitada.
  if (isFutsalTheme(theme) || theme === "street") return;
  const mode = theme === "classic" ? 0 : theme === "vertical" ? 1 : theme === "checker" ? 2 : 3;
  const mask = [
    "float mowMask = mod(floor(field.y / 46.0), 2.0) < 0.5 ? 1.0 : -1.0; vec2 mowDir = vec2(1.0, 0.0);",
    "float mowMask = mod(floor(field.x / 30.0), 2.0) < 0.5 ? 1.0 : -1.0; vec2 mowDir = vec2(0.0, 1.0);",
    "float mowMask = mod(floor(field.x / 50.0) + floor(field.y / 46.0), 2.0) < 0.5 ? 1.0 : -1.0; vec2 mowDir = vec2(0.7071, 0.7071);",
    // Diagonal de render.ts: faixas de 42 giradas -15° em volta do centro.
    "float mowX = (field.x - 150.0) * 0.96593 - (field.y - 230.0) * 0.25882; float mowMask = fract((mowX + 760.0) / 84.0) < 0.5 ? 1.0 : -1.0; vec2 mowDir = vec2(0.25882, 0.96593);",
  ][mode];
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vMowWorld;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvMowWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vMowWorld;")
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        {
          vec2 field = vec2(vMowWorld.x + ${HALF_W.toFixed(1)}, vMowWorld.z + ${HALF_H.toFixed(1)});
          ${mask}
          vec3 toCamera = normalize(cameraPosition - vMowWorld);
          diffuseColor.rgb *= 1.0 + 0.05 * mowMask * dot(toCamera.xz, mowDir);
        }`,
      );
  };
  material.customProgramCacheKey = () => `futbobo-mow-${mode}`;
}

function ledCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = LED_WIDTH;
  canvas.height = LED_HEIGHT;
  return canvas;
}

function ledGrid(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  for (let x = 0; x < LED_WIDTH; x += 4) ctx.fillRect(x, 0, 1, LED_HEIGHT);
  for (let y = 0; y < LED_HEIGHT; y += 4) ctx.fillRect(0, y, LED_WIDTH, 1);
}

function ledCanvasTexture(canvas: HTMLCanvasElement, anisotropy: number) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  // As placas laterais ficam quase de perfil: anisotropia mantém o texto legível.
  texture.anisotropy = Math.min(4, anisotropy);
  return texture;
}

function ledFont(size: number) {
  return `900 ${size}px ui-sans-serif, system-ui, sans-serif`;
}

function ledBaseTexture(setup: BotaoMatchSetup, anisotropy: number) {
  const canvas = ledCanvas();
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#04070a";
  ctx.fillRect(0, 0, LED_WIDTH, LED_HEIGHT);
  const items = [
    { text: "FUTBOBO", color: "#ffc72c" },
    { text: setup.userTeam.shortName.toLocaleUpperCase("pt-BR"), color: setup.userTeam.primary },
    { text: setup.competitionName.toLocaleUpperCase("pt-BR"), color: "#f4f6f2" },
    { text: setup.cpuTeam.shortName.toLocaleUpperCase("pt-BR"), color: setup.cpuTeam.primary },
  ];
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const segment = LED_WIDTH / items.length;
  items.forEach((item, index) => {
    const x = index * segment;
    ctx.fillStyle = shadeHex(item.color, -150);
    ctx.fillRect(x + 4, 6, segment - 8, 52);
    ctx.fillStyle = mixHex(item.color, "#ffffff", 0.18);
    let size = 34;
    ctx.font = ledFont(size);
    while (ctx.measureText(item.text).width > segment - 30 && size > 14) {
      size -= 2;
      ctx.font = ledFont(size);
    }
    ctx.fillText(item.text, x + segment / 2, 33);
  });
  ledGrid(ctx);
  return ledCanvasTexture(canvas, anisotropy);
}

/** Mensagem repetida na largura da faixa para emendar sem costura ao rolar. */
function ledMessageTexture(text: string, background: string, ink: string, anisotropy: number) {
  const canvas = ledCanvas();
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, LED_WIDTH, LED_HEIGHT);
  // Moldura escura em cima e embaixo, como nas placas de verdade.
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(0, 0, LED_WIDTH, 5);
  ctx.fillRect(0, LED_HEIGHT - 5, LED_WIDTH, 5);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  let size = 44;
  ctx.font = ledFont(size);
  let width = ctx.measureText(text).width;
  const copies = Math.max(1, Math.min(3, Math.floor(LED_WIDTH / (width + 70))));
  const segment = LED_WIDTH / copies;
  while (width > segment - 28 && size > 18) {
    size -= 2;
    ctx.font = ledFont(size);
    width = ctx.measureText(text).width;
  }
  ctx.fillStyle = ink;
  for (let index = 0; index < copies; index += 1) ctx.fillText(text, segment * (index + 0.5), 34);
  ledGrid(ctx);
  return ledCanvasTexture(canvas, anisotropy);
}

/**
 * Malha da rede como alphaMap (canal verde): linhas de 7 px num ladrilho de 32
 * (~39% coberto). Com alpha-to-coverage o mipmap vira transparência de verdade
 * de longe; sem MSAA o alphaTest baixo segura as linhas sem sumir. Como `map`,
 * o pixel transparente do canvas é preto e o filtro deixava a rede cinza.
 */
function netTexture(anisotropy: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 32, 4);
  ctx.fillRect(0, 29, 32, 3);
  ctx.fillRect(0, 0, 4, 32);
  ctx.fillRect(29, 0, 3, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // Dado (cobertura), não cor: sem conversão de sRGB.
  texture.anisotropy = Math.min(4, anisotropy);
  return texture;
}

/** Flash de câmera: miolo branco estourado e halo azulado curto. */
function flashTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.28, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.55, "rgba(205,225,255,0.3)");
  gradient.addColorStop(1, "rgba(205,225,255,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// ------------------------------------------------------------------ gol

type NetImpulse = { x: number; y: number; z: number; t: number; strength: number; amplitude: number };

/** Painéis da rede numa malha só, com direção "para fora" e folga por vértice. */
class NetBuilder {
  readonly positions: number[] = [];
  readonly uvs: number[] = [];
  readonly push: number[] = [];
  readonly give: number[] = [];
  readonly indices: number[] = [];
  private readonly point = new THREE.Vector3();
  private readonly top = new THREE.Vector3();
  private readonly bottom = new THREE.Vector3();

  /**
   * Grade bilinear entre quatro cantos. `belly` deforma o repouso (barriga do
   * pano) e `push` é para onde o vértice vai quando a bola bate.
   */
  panel(p00: THREE.Vector3, p10: THREE.Vector3, p01: THREE.Vector3, p11: THREE.Vector3, segU: number, segV: number, push: THREE.Vector3, belly: THREE.Vector3) {
    const base = this.positions.length / 3;
    const widthU = p00.distanceTo(p10) / NET_CELL;
    const widthV = p00.distanceTo(p01) / NET_CELL;
    for (let j = 0; j <= segV; j += 1) {
      for (let i = 0; i <= segU; i += 1) {
        const u = i / segU;
        const v = j / segV;
        this.bottom.lerpVectors(p00, p10, u);
        this.top.lerpVectors(p01, p11, u);
        this.point.lerpVectors(this.bottom, this.top, v);
        // Zero nas bordas (presas na trave e no chão), máximo no meio.
        const shape = Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
        this.point.addScaledVector(belly, shape);
        this.positions.push(this.point.x, this.point.y, this.point.z);
        this.uvs.push(u * widthU, v * widthV);
        this.push.push(push.x, push.y, push.z);
        this.give.push(Math.sqrt(shape));
      }
    }
    for (let j = 0; j < segV; j += 1) {
      for (let i = 0; i < segU; i += 1) {
        const a = base + j * (segU + 1) + i;
        const b = a + 1;
        const c = a + segU + 1;
        const d = c + 1;
        this.indices.push(a, b, d, a, d, c);
      }
    }
  }
}

/** Estufa rápido, balança e assenta em ~2 s (forma do ripple antigo). */
function netWave(t: number) {
  const decay = Math.exp(-t * 2.6);
  // A rampa também decai: sem isso a rede dava um salto de ~0.16 em t = 0.12.
  return (Math.sin(t * 15) + Math.min(1, t / 0.12) * 0.6) * decay;
}

/** Pintura da trave: a geometria (e a física) é sempre a mesma. `stripes` = faixas da quadra de praça. */
type GoalStyle = { post: string; support: string; stripes: string | null };
const GOAL_STYLE: GoalStyle = { post: "#f5f7f4", support: "#d5d9d6", stripes: null };

class GoalView {
  readonly group = new THREE.Group();
  /** Trave e rede no mesmo grupo: o tremor da bola na trave leva as duas juntas. */
  private readonly frame = new THREE.Group();
  private readonly frameGeometry: THREE.BufferGeometry;
  private readonly netGeometry: THREE.BufferGeometry;
  private readonly rest: Float32Array;
  private readonly push: Float32Array;
  private readonly give: Float32Array;
  private readonly impulses: NetImpulse[] = [];
  private readonly xL: number;
  private readonly xR: number;
  private readonly backZ: number;
  private moving = false;
  private wobbleT = -1;
  /** Rede ou trave mexeram no último update (inclusive o quadro em que voltam ao repouso). */
  changed = false;

  constructor(
    readonly top: boolean,
    frameMaterial: THREE.Material,
    netMaterial: THREE.Material,
    accent: string,
    private readonly calm: boolean,
    /** Sombra (null = modo desempenho, sem sombra). A rede usa a do three por causa do alphaTest. */
    depthMaterial: THREE.Material | null,
    /** Acabamento por vértice para o `finishMaterial` (fora do modo desempenho). */
    finishes: boolean,
    style: GoalStyle = GOAL_STYLE,
  ) {
    const dir = top ? -1 : 1;
    const lineZ = dir * HALF_H;
    const postZ = dir * (HALF_H + POST_OFFSET);
    const depth = FIELD.goalDepth;
    const xL = GOAL_LEFT - HALF_W;
    const xR = GOAL_RIGHT - HALF_W;
    const barY = GOAL_HEIGHT - CROSSBAR_RADIUS;
    const backTop = GOAL_HEIGHT * 0.62;
    const backZ = lineZ + dir * depth;
    this.xL = xL;
    this.xR = xR;
    this.backZ = backZ;
    this.group.add(this.frame);
    for (let index = 0; index < 4; index += 1) this.impulses.push({ x: 0, y: 0, z: 0, t: -1, strength: 0, amplitude: 0 });

    // Traves, travessão, faixas e suportes numa geometria com cor por vértice (1 draw call).
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const frame = new Baker({ finishes });
    const white = style.post;
    const support = style.support;
    const post = new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, GOAL_HEIGHT, 18);
    for (const x of [xL, xR]) frame.add(post, v(x, GOAL_HEIGHT / 2, postZ), undefined, white, FRAME_FINISH);
    const bar = new THREE.CylinderGeometry(CROSSBAR_RADIUS, CROSSBAR_RADIUS, xR - xL, 16);
    frame.add(bar, v(0, barY, postZ), new THREE.Euler(0, 0, Math.PI / 2), white, FRAME_FINISH);
    // Faixa no pé da trave com a cor do dono do gol.
    const band = new THREE.CylinderGeometry(POST_RADIUS + 0.14, POST_RADIUS + 0.14, 3, 18);
    for (const x of [xL, xR]) frame.add(band, v(x, 1.5, postZ), undefined, accent, FRAME_FINISH);
    if (style.stripes) {
      // Trave listrada de quadra de praça: anéis um fio mais grossos por cima do branco.
      const ring = new THREE.CylinderGeometry(POST_RADIUS + 0.08, POST_RADIUS + 0.08, 4.5, 18);
      for (const x of [xL, xR]) for (let y = 7.25; y < GOAL_HEIGHT - 3; y += 9) frame.add(ring, v(x, y, postZ), undefined, style.stripes, FRAME_FINISH);
      const barRing = new THREE.CylinderGeometry(CROSSBAR_RADIUS + 0.08, CROSSBAR_RADIUS + 0.08, 8, 16);
      for (let x = xL + 10; x < xR - 6; x += 16) frame.add(barRing, v(x, barY, postZ), new THREE.Euler(0, 0, Math.PI / 2), style.stripes, FRAME_FINISH);
      ring.dispose();
      barRing.dispose();
    }
    const up = new THREE.Vector3(0, 1, 0);
    const rotation = new THREE.Quaternion();
    const stanchion = (from: THREE.Vector3, to: THREE.Vector3, radius = 0.6) => {
      const piece = new THREE.CylinderGeometry(radius, radius, from.distanceTo(to), 8);
      rotation.setFromUnitVectors(up, to.clone().sub(from).normalize());
      frame.add(piece, from.clone().add(to).multiplyScalar(0.5), rotation, support, FRAME_FINISH);
      piece.dispose();
    };
    for (const x of [xL, xR]) {
      stanchion(v(x, barY, postZ), v(x, backTop, backZ));
      stanchion(v(x, backTop, backZ), v(x, 0, backZ));
    }
    stanchion(v(xL, 0.6, backZ), v(xR, 0.6, backZ));
    stanchion(v(xL, backTop, backZ), v(xR, backTop, backZ));
    post.dispose();
    bar.dispose();
    band.dispose();
    const frameMesh = frame.build(frameMaterial, depthMaterial !== null);
    frameMesh.castShadow = depthMaterial !== null;
    if (depthMaterial) frameMesh.customDepthMaterial = depthMaterial;
    this.frameGeometry = frameMesh.geometry;
    this.frame.add(frameMesh);

    // Rede: teto cede, fundo e laterais com barriga para fora. Uma malha só.
    const net = new NetBuilder();
    const outBack = v(0, 0, dir);
    // Normal do teto inclinado (sobe do fundo para o travessão), apontando para fora.
    const roofOut = v(0, depth, (barY - backTop) * dir).normalize();
    net.panel(v(xL, barY, postZ), v(xR, barY, postZ), v(xL, backTop, backZ), v(xR, backTop, backZ), 18, 4, roofOut, v(0, -1.6, 0));
    net.panel(v(xL, 0, backZ), v(xR, 0, backZ), v(xL, backTop, backZ), v(xR, backTop, backZ), 18, 6, outBack, v(0, 0, 2.2 * dir));
    for (const x of [xL, xR]) {
      const out = v(Math.sign(x), 0, 0);
      net.panel(v(x, 0, postZ), v(x, 0, backZ), v(x, barY, postZ), v(x, backTop, backZ), 5, 6, out, out.clone().multiplyScalar(1.2));
    }
    this.netGeometry = new THREE.BufferGeometry();
    this.netGeometry.setAttribute("position", new THREE.Float32BufferAttribute(net.positions, 3));
    this.netGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(net.uvs, 2));
    this.netGeometry.setIndex(net.indices);
    this.netGeometry.computeVertexNormals();
    // A esfera sai do repouso; a rede estufa até ~15 para fora e não pode sumir na borda da tela.
    this.netGeometry.computeBoundingSphere();
    this.netGeometry.boundingSphere!.radius += 16;
    (this.netGeometry.getAttribute("position") as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    this.rest = Float32Array.from(net.positions);
    this.push = Float32Array.from(net.push);
    this.give = Float32Array.from(net.give);
    const netMesh = new THREE.Mesh(this.netGeometry, netMaterial);
    netMesh.castShadow = depthMaterial !== null;
    this.frame.add(netMesh);
  }

  /** Bola no fundo da rede na altura do campo `fieldX`. */
  ripple(fieldX: number, strength: number) {
    const x = Math.max(this.xL + 4, Math.min(this.xR - 4, fieldX - HALF_W));
    this.poke(x, 6, this.backZ, strength);
  }

  /**
   * Empurrão em qualquer ponto da rede (coordenadas do mundo): lateral por
   * dentro ou por fora, teto, goleiro pendurado. Até 4 somados.
   */
  poke(x: number, y: number, z: number, strength: number) {
    // Um NaN aqui viraria vértice NaN e a rede some até o impulso expirar.
    if (!Number.isFinite(x + y + z + strength)) return;
    let slot = this.impulses[0];
    for (const impulse of this.impulses) {
      if (impulse.t < 0) {
        slot = impulse;
        break;
      }
      if (impulse.t > slot.t) slot = impulse;
    }
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.t = 0;
    slot.strength = Math.max(0, Math.min(1.6, strength));
    this.moving = true;
  }

  wobble() {
    if (this.calm) return;
    this.wobbleT = 0;
  }

  update(dt: number) {
    this.changed = this.moving || this.wobbleT >= 0;
    if (this.moving) this.updateNet(dt);
    if (this.wobbleT >= 0) {
      this.wobbleT += dt;
      this.frame.position.x = Math.sin(this.wobbleT * 70) * 0.7 * Math.exp(-this.wobbleT * 7);
      if (this.wobbleT > 0.8) {
        this.frame.position.x = 0;
        this.wobbleT = -1;
      }
      // O estádio todo tem a matriz congelada: só a trave que treme recalcula.
      this.frame.updateMatrix();
    }
  }

  private updateNet(dt: number) {
    const impulses = this.impulses;
    let active = false;
    for (let k = 0; k < impulses.length; k += 1) {
      const impulse = impulses[k];
      if (impulse.t < 0) continue;
      impulse.t += dt;
      if (impulse.t > 2.2) {
        impulse.t = -1;
        continue;
      }
      impulse.amplitude = 7 * impulse.strength * netWave(impulse.t);
      active = true;
    }
    const position = this.netGeometry.getAttribute("position") as THREE.BufferAttribute;
    const array = position.array as Float32Array;
    if (!active) {
      array.set(this.rest);
      position.needsUpdate = true;
      this.moving = false;
      return;
    }
    const rest = this.rest;
    const push = this.push;
    const give = this.give;
    for (let vertex = 0, index = 0; index < array.length; vertex += 1, index += 3) {
      const rx = rest[index];
      const ry = rest[index + 1];
      const rz = rest[index + 2];
      let offset = 0;
      for (let k = 0; k < impulses.length; k += 1) {
        const impulse = impulses[k];
        if (impulse.t < 0) continue;
        const dx = rx - impulse.x;
        const dy = ry - impulse.y;
        const dz = rz - impulse.z;
        offset += impulse.amplitude * Math.exp(-(dx * dx) / 420 - (dy * dy) / 260 - (dz * dz) / 300);
      }
      offset *= give[vertex];
      array[index] = rx + push[index] * offset;
      array[index + 1] = ry + push[index + 1] * offset;
      array[index + 2] = rz + push[index + 2] * offset;
    }
    position.needsUpdate = true;
  }

  dispose() {
    this.frameGeometry.dispose();
    this.netGeometry.dispose();
  }
}

// --------------------------------------------------------- arquibancada

type Fan = { x: number; y: number; z: number; yaw: number; side: BotaoSide };

/**
 * Quem a `Crowd` desenha: a arquibancada (`Stands`) ou os vizinhos da rua.
 * `street` = bonecos com pernas, de pé no chão, em `scale` (o pulo tira os pés
 * do chão); `teamShare` < 1 deixa mais gente com roupa comum.
 */
type CrowdLayout = {
  readonly fans: Fan[];
  readonly random: () => number;
  readonly street?: boolean;
  readonly scale?: number;
  readonly teamShare?: number;
  readonly neutrals?: readonly string[];
};

/**
 * Fileira de degraus: centro (x, z) e eixo ao longo dela; o bloco vai do chão
 * até `height`, e `under` é a altura da fileira da frente (0 na primeira).
 */
type StandRow = { x: number; z: number; alongX: number; alongZ: number; length: number; outX: number; outZ: number; height: number; under: number; row: number; end: boolean };

/**
 * Fileiras e lugares das quatro arquibancadas. Os torcedores saem do mesmo
 * gerador de sempre, na mesma ordem: a mesma semente dá a mesma torcida, e
 * `random` continua a sequência para as cores.
 */
class Stands {
  readonly fans: Fan[] = [];
  readonly rows: StandRow[] = [];
  readonly random: () => number;
  private readonly home: BotaoSide | null;
  private readonly away: BotaoSide | null;

  constructor(setup: BotaoMatchSetup) {
    this.random = seeded(setup.seed ^ 0x51ed27);
    this.home = setup.neutralVenue ? null : setup.userIsHost ? "user" : "cpu";
    this.away = this.home === null ? null : this.home === "user" ? "cpu" : "user";
    const sideOffset = HALF_W + 46;
    const endOffset = HALF_H + 62;
    this.stand(-sideOffset, 0, 0, 1, FIELD.height + 90, -1, 0, false);
    this.stand(sideOffset, 0, 0, 1, FIELD.height + 90, 1, 0, false);
    this.stand(0, -endOffset, 1, 0, FIELD.width + 60, 0, -1, true);
    this.stand(0, endOffset, 1, 0, FIELD.width + 60, 0, 1, true);
  }

  /**
   * Cada torcida atrás do gol que o time dela ATACA: quem marca vê a própria
   * gente explodir atrás da rede. Campo neutro: metade/metade; com mandante,
   * só o miolo atrás do gol que o visitante ataca é do visitante.
   */
  sideAt(x: number, z: number, end: boolean): BotaoSide | null {
    const { home, away } = this;
    if (home === null || away === null) {
      if (!end && Math.abs(z) < SECTOR_GAP / 2) return null;
      return z < 0 ? "user" : "cpu";
    }
    if (end && Math.sign(z) === attackSign(away)) {
      if (Math.abs(x) < AWAY_HALF_WIDTH) return away;
      // Corredor de cadeiras vazias separa as torcidas, como no estádio de verdade.
      if (Math.abs(x) < AWAY_HALF_WIDTH + SECTOR_GAP) return null;
    }
    return home;
  }

  private stand(originX: number, originZ: number, alongX: number, alongZ: number, length: number, outX: number, outZ: number, end: boolean) {
    const random = this.random;
    for (let row = 0; row < STAND_ROWS; row += 1) {
      const distance = row * 9 + 4.5;
      const height = 4 + row * 4.6;
      const under = row === 0 ? 0 : height - 4.6;
      this.rows.push({ x: originX + outX * distance, z: originZ + outZ * distance, alongX, alongZ, length, outX, outZ, height, under, row, end });
      const count = Math.floor(length / 7.6);
      for (let index = 0; index < count; index += 1) {
        if (random() < 0.07) continue;
        const along = (index + 0.5) / count - 0.5;
        const x = originX + alongX * along * length + outX * distance + (random() - 0.5) * 1.6;
        const z = originZ + alongZ * along * length + outZ * distance + (random() - 0.5) * 1.6;
        const yaw = Math.atan2(-outX, -outZ) + (random() - 0.5) * 0.5;
        const side = this.sideAt(x, z, end);
        if (side) this.fans.push({ x, y: height, z, yaw, side });
      }
    }
  }
}

/**
 * Modo desempenho, sem torcida: cada setor da arquibancada ganha a cor do time
 * (assento na cor, fileiras alternando com um toque da segunda cor, espelho do
 * degrau escuro), o corredor vazio fica cinza e escadas de concreto dividem os
 * blocos de cadeiras. Só as faces que aparecem (assento, espelho, fundo da
 * última fileira e as pontas): 1 draw call, montado direto nos arrays.
 */
function paintStands(stands: Stands, setup: BotaoMatchSetup) {
  const ink = "#0b1016";
  const palette = (kind: BotaoSide | null | "aisle", row: number) => {
    if (kind === "aisle") return { seat: "#454c56", riser: "#2a3038" };
    if (kind === null) return { seat: row % 2 === 0 ? "#2c333d" : "#262c35", riser: "#1a1f26" };
    const team = kind === "user" ? setup.userTeam : setup.cpuTeam;
    const seat = row % 2 === 0 ? mixHex(team.primary, ink, 0.12) : mixHex(mixHex(team.primary, team.secondary, 0.22), ink, 0.3);
    return { seat, riser: mixHex(team.primary, ink, 0.55) };
  };
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const quad = (corners: THREE.Vector3[], normal: THREE.Vector3, color: THREE.Color) => {
    const base = positions.length / 3;
    for (const corner of corners) {
      positions.push(corner.x, corner.y, corner.z);
      normals.push(normal.x, normal.y, normal.z);
      colors.push(color.r, color.g, color.b);
    }
    // Anti-horário visto do lado da normal: o verso é descartado.
    edgeA.subVectors(corners[1], corners[0]);
    edgeB.subVectors(corners[2], corners[0]);
    if (edgeA.cross(edgeB).dot(normal) >= 0) indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  const up = new THREE.Vector3(0, 1, 0);
  const seat = new THREE.Color();
  const riser = new THREE.Color();
  for (const row of stands.rows) {
    const half = row.length / 2;
    const along = new THREE.Vector3(row.alongX, 0, row.alongZ);
    const out = new THREE.Vector3(row.outX, 0, row.outZ);
    const toField = out.clone().negate();
    const last = row.row === STAND_ROWS - 1;
    // Ponto da fileira: `t` ao longo dela, `o` para fora (±4.5 = frente/fundo), altura `y`.
    const at = (t: number, o: number, y: number) => new THREE.Vector3(row.x + along.x * t + out.x * o, y, row.z + along.z * t + out.z * o);
    // Onde a cor pode trocar ao longo da fileira: meio do campo neutro, setor
    // visitante, corredor vazio e as escadas (iguais em todas as fileiras).
    const cuts = new Set([-half, half]);
    const cut = (where: number) => {
      if (Math.abs(where) < half) cuts.add(where);
    };
    for (const edge of [SECTOR_GAP / 2, AWAY_HALF_WIDTH, AWAY_HALF_WIDTH + SECTOR_GAP]) {
      cut(edge);
      cut(-edge);
    }
    const aisles: number[] = [];
    for (let where = -Math.floor((half - AISLE_SPACING / 2) / AISLE_SPACING) * AISLE_SPACING; where < half - AISLE_SPACING / 2; where += AISLE_SPACING) {
      aisles.push(where);
      cut(where - AISLE_WIDTH / 2);
      cut(where + AISLE_WIDTH / 2);
    }
    const sorted = [...cuts].sort((a, b) => a - b);
    const runs: Array<{ from: number; to: number; kind: BotaoSide | null | "aisle" }> = [];
    for (let index = 0; index + 1 < sorted.length; index += 1) {
      const middle = (sorted[index] + sorted[index + 1]) / 2;
      const kind = aisles.some((where) => Math.abs(middle - where) < AISLE_WIDTH / 2)
        ? "aisle"
        : stands.sideAt(row.x + row.alongX * middle, row.z + row.alongZ * middle, row.end);
      const previous = runs[runs.length - 1];
      if (previous && previous.kind === kind) previous.to = sorted[index + 1];
      else runs.push({ from: sorted[index], to: sorted[index + 1], kind });
    }
    const top = row.height;
    for (const run of runs) {
      const colors = palette(run.kind, row.row);
      seat.set(colors.seat);
      riser.set(colors.riser);
      quad([at(run.from, -4.5, top), at(run.to, -4.5, top), at(run.to, 4.5, top), at(run.from, 4.5, top)], up, seat);
      // Espelho: só o pedaço acima da fileira da frente aparece.
      quad([at(run.from, -4.5, row.under), at(run.to, -4.5, row.under), at(run.to, -4.5, top), at(run.from, -4.5, top)], toField, riser);
      if (last) quad([at(run.from, 4.5, 0), at(run.to, 4.5, 0), at(run.to, 4.5, top), at(run.from, 4.5, top)], out, riser);
      // Pontas da arquibancada (as emendas entre trechos ficam por dentro).
      for (const [end, sign] of [[-half, -1], [half, 1]] as const) {
        if ((sign < 0 ? run.from : run.to) !== end) continue;
        quad([at(end, -4.5, 0), at(end, 4.5, 0), at(end, 4.5, top), at(end, -4.5, top)], along.clone().multiplyScalar(sign), riser);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * Torcedor de bloco: corpo, cabeça e dois braços numa geometria só, com a peça
 * marcada por vértice (0 corpo, 1 cabeça, 2 braço esquerdo, 3 braço direito).
 * Frente em +Z local. Fundo de corpo e cabeça nunca aparece: fica sem face.
 */
function fanGeometry(legs = false) {
  const positions: number[] = [];
  const normals: number[] = [];
  const parts: number[] = [];
  const indices: number[] = [];
  // [normal, u, v] de cada face, com u × v = normal (triângulo anti-horário visto de fora).
  const faces: Array<[number[], number[], number[]]> = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  const box = (size: number[], center: number[], part: number, withBottom: boolean) => {
    const half = [size[0] / 2, size[1] / 2, size[2] / 2];
    const extent = (axis: number[]) => Math.abs(axis[0]) * half[0] + Math.abs(axis[1]) * half[1] + Math.abs(axis[2]) * half[2];
    for (const [n, u, v] of faces) {
      if (!withBottom && n[1] === -1) continue;
      const base = positions.length / 3;
      const dn = extent(n);
      const du = extent(u);
      const dv = extent(v);
      for (const [su, sv] of corners) {
        for (let axis = 0; axis < 3; axis += 1) positions.push(center[axis] + n[axis] * dn + u[axis] * du * su + v[axis] * dv * sv);
        normals.push(n[0], n[1], n[2]);
        parts.push(part);
      }
      indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
    }
  };
  box([5.2, 7, 3.6], [0, 3.5, 0], 0, false);
  box([4.2, 4.2, 4.2], [0, 9.1, 0], 1, false);
  // Braços pendurados no ombro (±3.3, 6.6): é em volta dele que giram no shader.
  box([1.4, 5.6, 1.4], [-3.3, 3.8, 0], 2, true);
  box([1.4, 5.6, 1.4], [3.3, 3.8, 0], 3, true);
  // Vizinho de pé na rua: pernas (peça 4) abaixo do tronco, a origem fica no quadril.
  if (legs) {
    box([2.1, FAN_LEG, 2.3], [-1.3, -FAN_LEG / 2, 0], 4, true);
    box([2.1, FAN_LEG, 2.3], [1.3, -FAN_LEG / 2, 0], 4, true);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("aPart", new THREE.Float32BufferAttribute(parts, 1));
  geometry.setIndex(indices);
  return geometry;
}

const CROWD_PARS = /* glsl */ `
attribute vec4 aFan;
attribute vec3 aSkin;
attribute float aPart;
uniform float uTime;
uniform float uCalm;
uniform vec2 uCheer;
uniform vec2 uCheerT;
uniform vec2 uStand;
uniform vec2 uOoh;
uniform vec2 uSad;
uniform vec2 uWave;
// Cabeça e inclinação só dependem do lado: (cos, sin) dos dois lados vêm do JS.
uniform vec4 uHeadCs;
uniform vec4 uLeanCs;
// Giros recebem (cos, sin) prontos: normal e posição usam os mesmos ângulos.
vec3 fanRotX(vec3 p, vec2 cs) {
  return vec3(p.x, p.y * cs.x - p.z * cs.y, p.y * cs.y + p.z * cs.x);
}
vec3 fanRotZ(vec3 p, vec2 cs) {
  return vec3(p.x * cs.x - p.y * cs.y, p.x * cs.y + p.y * cs.x, p.z);
}
vec2 fanCs(float a) {
  return vec2(cos(a), sin(a));
}
`;

// Pose calculada uma vez por vértice, no espaço do boneco (antes da instanceMatrix,
// que é estática). aFan = (fase, energia, lado 0/1, ângulo em volta do estádio 0..1).
const CROWD_POSE = /* glsl */ `
float fanSide = aFan.z;
float fanCheer = mix(uCheer.x, uCheer.y, fanSide);
float fanStand = mix(uStand.x, uStand.y, fanSide);
float fanOoh = mix(uOoh.x, uOoh.y, fanSide);
float fanSad = mix(uSad.x, uSad.y, fanSide);
// Ola e pulo só custam quando estão acontecendo: parados, dariam zero de qualquer
// jeito (desvio igual para o lado inteiro, os vértices vizinhos seguem juntos).
float fanWave = 0.0;
if (uWave.y > 0.0) {
  float fanDw = abs(fract(aFan.w - uWave.x + 0.5) - 0.5);
  fanWave = uWave.y * exp(-fanDw * fanDw / 0.0012);
}
float fanArmSign = aPart > 2.5 && aPart < 3.5 ? 1.0 : -1.0;
float fanJump = 0.0;
float fanSwing = 0.0;
if (fanCheer > 0.0) {
  float fanCheerT = mix(uCheerT.x, uCheerT.y, fanSide);
  // Primeiros 0.8 s caóticos, depois todo mundo no mesmo pulo (2.2 Hz). Mistura as
  // saídas, não as fases, para a passagem não acelerar ninguém.
  float fanSync = max(uCalm, smoothstep(0.8, 1.4, fanCheerT));
  fanJump = mix(max(0.0, sin(fanCheerT * 9.0 * aFan.y + aFan.x)), max(0.0, sin(fanCheerT * 13.8)), fanSync);
  fanSwing = mix(sin(fanCheerT * 11.0 * aFan.y + aFan.x + fanArmSign), sin(fanCheerT * 13.8 + 1.4), fanSync);
}
#ifdef FAN_STREET
// Vizinho na rua já está de pé e tem pernas: nada de "sentar" (afundaria no
// chão); só o pulo da festa e a ola tiram os pés do chão.
float fanLift = fanCheer * fanJump * mix(3.2, 1.2, uCalm) + fanWave * 1.2;
#else
float fanUp = clamp(max(max(fanStand, fanCheer), max(fanOoh, fanWave)), 0.0, 1.0) * (1.0 - fanSad);
float fanLift = -2.4 * (1.0 - fanUp) - 0.7 * fanSad
  + max(0.0, sin(uTime * 1.6 + aFan.x)) * 0.35 * (1.0 - fanCheer)
  + fanCheer * fanJump * mix(4.5, 1.8, uCalm)
  + fanWave * 1.6;
#endif
// Braço: az abre para o lado/para cima (em volta de Z), ax leva para a frente (em volta de X).
float fanAz = mix(0.12, 0.3, fanStand);
float fanAx = mix(0.0, -0.6, fanStand);
fanAz = mix(fanAz, 2.75 + 0.3 * fanSwing, fanCheer);
fanAx = mix(fanAx, -0.15, fanCheer);
fanAz = mix(fanAz, 3.35, fanOoh);
fanAx = mix(fanAx, -0.35, fanOoh);
fanAz = mix(fanAz, 2.95, fanWave);
fanAx = mix(fanAx, 0.0, fanWave);
fanAz = mix(fanAz, 0.06, fanSad);
fanAx = mix(fanAx, -0.4, fanSad);
float fanSway = sin(uTime * 0.8 + aFan.x * 2.0) * 0.05 * (1.0 - fanCheer) * (1.0 - fanSad);
float fanIsHead = step(0.5, aPart) * step(aPart, 1.5);
#ifdef FAN_STREET
float fanIsArm = step(1.5, aPart) * step(aPart, 3.5);
#else
float fanIsArm = step(1.5, aPart);
#endif
vec3 fanShoulder = vec3(3.3 * fanArmSign, 6.6, 0.0);
vec3 fanNeck = vec3(0.0, 7.0, 0.0);
vColor.rgb = mix(vColor.rgb, aSkin, fanIsHead);
#ifdef FAN_STREET
// Calça jeans, bermuda cáqui ou preta, sorteada pela fase do boneco.
float fanPantsPick = fract(aFan.x * 1.37);
vec3 fanPants = fanPantsPick < 0.5 ? vec3(0.045, 0.065, 0.12) : fanPantsPick < 0.78 ? vec3(0.21, 0.16, 0.09) : vec3(0.025, 0.025, 0.03);
vColor.rgb = mix(vColor.rgb, fanPants, step(3.5, aPart));
#endif
vec2 fanCsAx = fanCs(fanAx);
vec2 fanCsAz = fanCs(fanArmSign * fanAz);
vec2 fanCsHead = mix(uHeadCs.xy, uHeadCs.zw, fanSide);
vec2 fanCsLean = mix(uLeanCs.xy, uLeanCs.zw, fanSide);
// Balanço de no máximo 0.05 rad: série de Taylor (erro < 1e-6) no lugar de cos/sin.
float fanSway2 = fanSway * fanSway;
vec2 fanCsSway = vec2(1.0 - 0.5 * fanSway2, fanSway * (1.0 - fanSway2 / 6.0));
vec3 fanNormal = objectNormal;
fanNormal = mix(fanNormal, fanRotZ(fanRotX(fanNormal, fanCsAx), fanCsAz), fanIsArm);
fanNormal = mix(fanNormal, fanRotX(fanNormal, fanCsHead), fanIsHead);
objectNormal = fanRotZ(fanRotX(fanNormal, fanCsLean), fanCsSway);
`;

const CROWD_MOVE = /* glsl */ `
vec3 fanPoint = transformed;
fanPoint = mix(fanPoint, fanRotZ(fanRotX(fanPoint - fanShoulder, fanCsAx), fanCsAz) + fanShoulder, fanIsArm);
fanPoint = mix(fanPoint, fanRotX(fanPoint - fanNeck, fanCsHead) + fanNeck, fanIsHead);
fanPoint = fanRotZ(fanRotX(fanPoint, fanCsLean), fanCsSway);
fanPoint.y += fanLift;
transformed = fanPoint;
`;

/**
 * Torcida inteira num draw call. As matrizes são montadas uma vez; pulo, braços,
 * ola e desânimo saem do vertex shader a partir de poucos uniforms por lado.
 * Não projeta nem recebe sombra, então o programa nasce sem o código de sombra
 * (o three o ligaria só porque o renderer tem sombra).
 */
class Crowd {
  readonly fans: Fan[];
  readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.MeshLambertMaterial;
  private readonly uniforms = {
    uTime: { value: 0 },
    uCalm: { value: 0 },
    uCheer: { value: new THREE.Vector2() },
    uCheerT: { value: new THREE.Vector2(60, 60) },
    uStand: { value: new THREE.Vector2() },
    uOoh: { value: new THREE.Vector2() },
    uSad: { value: new THREE.Vector2() },
    uWave: { value: new THREE.Vector2() },
    uHeadCs: { value: new THREE.Vector4(1, 0, 1, 0) },
    uLeanCs: { value: new THREE.Vector4(1, 0, 1, 0) },
  };
  private readonly cheerLeft = [0, 0];
  private readonly cheerAge = [60, 60];
  private readonly cheer = [0, 0];
  private readonly sadLeft = [0, 0];
  private readonly sad = [0, 0];
  private oohLeft = 0;
  private oohLevel = 0;
  private tension = 0;
  private tensionTarget = 0;
  private waveT = -1;

  /** Escala dos bonecos (1 na arquibancada, maior na rua, onde ficam perto dos jogadores). */
  private readonly scale: number;

  constructor(setup: BotaoMatchSetup, layout: CrowdLayout, calm: boolean) {
    const random = layout.random;
    this.fans = layout.fans;
    this.scale = layout.scale ?? 1;
    const street = layout.street === true;
    const count = this.fans.length;
    const geometry = fanGeometry(street);
    const fanAttribute = new Float32Array(count * 4);
    const skinAttribute = new Float32Array(count * 3);
    this.material = new THREE.MeshLambertMaterial();
    if (street) this.material.defines = { FAN_STREET: "" };
    this.uniforms.uCalm.value = calm ? 1 : 0;
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      // O prefixo do three (com o #define) vem antes deste corpo.
      shader.vertexShader = `#undef USE_SHADOWMAP\n${shader.vertexShader}`
        .replace("#include <common>", `#include <common>\n${CROWD_PARS}`)
        .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>\n${CROWD_POSE}`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>\n${CROWD_MOVE}`);
      shader.fragmentShader = `#undef USE_SHADOWMAP\n${shader.fragmentShader}`;
    };
    this.material.customProgramCacheKey = () => (street ? "futbobo-crowd-street" : "futbobo-crowd");
    this.mesh = new THREE.InstancedMesh(geometry, this.material, count);
    const color = new THREE.Color();
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(this.scale, this.scale, this.scale);
    const up = new THREE.Vector3(0, 1, 0);
    const skins = ["#f6d9c0", "#e5aa84", "#cc8965", "#985d43", "#714633", "#4b3027", "#edbf9d"];
    const neutrals = layout.neutrals ?? ["#f2f2f0", "#2a2d33", "#6b7280", "#1e3a5f"];
    // Com `teamShare` 1 (estádio) os cortes são 0.7 e 0.9 de sempre: mesma semente, mesma torcida.
    const share = layout.teamShare ?? 1;
    this.fans.forEach((fan, index) => {
      quaternion.setFromAxisAngle(up, fan.yaw);
      position.set(fan.x, fan.y, fan.z);
      matrix.compose(position, quaternion, scale);
      this.mesh.setMatrixAt(index, matrix);
      const team = fan.side === "user" ? setup.userTeam : setup.cpuTeam;
      const roll = random();
      color.set(roll < 0.7 * share ? team.primary : roll < 0.9 * share ? team.secondary : neutrals[Math.floor(random() * neutrals.length)]);
      this.mesh.setColorAt(index, color);
      color.set(skins[Math.floor(random() * skins.length)]);
      skinAttribute[index * 3] = color.r;
      skinAttribute[index * 3 + 1] = color.g;
      skinAttribute[index * 3 + 2] = color.b;
      fanAttribute[index * 4] = random() * Math.PI * 2;
      fanAttribute[index * 4 + 1] = 0.6 + random() * 0.8;
      fanAttribute[index * 4 + 2] = fan.side === "user" ? 0 : 1;
      fanAttribute[index * 4 + 3] = (Math.atan2(fan.z, fan.x) / (Math.PI * 2) + 1) % 1;
    });
    geometry.setAttribute("aFan", new THREE.InstancedBufferAttribute(fanAttribute, 4));
    geometry.setAttribute("aSkin", new THREE.InstancedBufferAttribute(skinAttribute, 3));
    // O shader move os bonecos para fora da caixa calculada no CPU; a torcida
    // cerca o campo inteiro, então nunca sai toda do quadro de qualquer jeito.
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  /** Torcedores de um lado para os flashes (cabeça, um pouco à frente do rosto). */
  spots(side: BotaoSide, count: number, random: () => number) {
    const pool = this.fans.filter((fan) => fan.side === side);
    const spots: THREE.Vector3[] = [];
    const s = this.scale;
    for (let index = 0; index < count && pool.length > 0; index += 1) {
      const fan = pool[Math.floor(random() * pool.length)];
      spots.push(new THREE.Vector3(fan.x + Math.sin(fan.yaw) * 2.8 * s, fan.y + 9.4 * s, fan.z + Math.cos(fan.yaw) * 2.8 * s));
    }
    return spots;
  }

  celebrate(side: BotaoSide, seconds: number, saddenOther: boolean) {
    const index = sideIndex(side);
    const other = 1 - index;
    // Comemoração emendada não recomeça o caos: só estende o pulo sincronizado.
    if (this.cheer[index] < 0.3) this.cheerAge[index] = 0;
    this.cheerLeft[index] = Math.max(this.cheerLeft[index], seconds);
    this.sadLeft[index] = 0;
    if (saddenOther) {
      this.cheerLeft[other] = 0;
      this.sadLeft[other] = Math.max(this.sadLeft[other], Math.min(2.6, seconds));
    }
  }

  groan(side: BotaoSide, seconds: number) {
    const index = sideIndex(side);
    this.cheerLeft[index] = 0;
    this.sadLeft[index] = Math.max(this.sadLeft[index], seconds);
  }

  ooh(seconds: number) {
    this.oohLeft = Math.max(this.oohLeft, seconds);
  }

  setTension(value: number) {
    this.tensionTarget = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  }

  wave() {
    this.waveT = 0;
  }

  update(dt: number, time: number) {
    for (let index = 0; index < 2; index += 1) {
      this.cheerLeft[index] = Math.max(0, this.cheerLeft[index] - dt);
      this.sadLeft[index] = Math.max(0, this.sadLeft[index] - dt);
      this.cheerAge[index] = Math.min(60, this.cheerAge[index] + dt);
      this.cheer[index] = approach(this.cheer[index], this.cheerLeft[index] > 0 ? 1 : 0, 1 / 0.12, 1 / 0.6, dt);
      this.sad[index] = approach(this.sad[index], this.sadLeft[index] > 0 ? 1 : 0, 1 / 0.3, 1 / 0.9, dt);
    }
    this.oohLeft = Math.max(0, this.oohLeft - dt);
    this.oohLevel = approach(this.oohLevel, this.oohLeft > 0 ? 1 : 0, 1 / 0.12, 1 / 0.5, dt);
    // Perigo: levanta rápido (~6/s) e senta devagar (~2/s).
    this.tension = approach(this.tension, this.tensionTarget, 6, 2, dt);
    const uniforms = this.uniforms;
    uniforms.uTime.value = time % IDLE_PERIOD;
    uniforms.uCheer.value.set(this.cheer[0], this.cheer[1]);
    uniforms.uCheerT.value.set(this.cheerAge[0], this.cheerAge[1]);
    uniforms.uStand.value.set(this.tension, this.tension);
    uniforms.uOoh.value.set(this.oohLevel, this.oohLevel);
    uniforms.uSad.value.set(this.sad[0], this.sad[1]);
    // Cabeça (desânimo baixa, "ooh" e festa levantam) e corpo inclinado por lado.
    const head0 = 0.55 * this.sad[0] - 0.25 * this.oohLevel - 0.15 * this.cheer[0];
    const head1 = 0.55 * this.sad[1] - 0.25 * this.oohLevel - 0.15 * this.cheer[1];
    const lean0 = 0.14 * this.tension * (1 - this.cheer[0]) + 0.2 * this.sad[0];
    const lean1 = 0.14 * this.tension * (1 - this.cheer[1]) + 0.2 * this.sad[1];
    uniforms.uHeadCs.value.set(Math.cos(head0), Math.sin(head0), Math.cos(head1), Math.sin(head1));
    uniforms.uLeanCs.value.set(Math.cos(lean0), Math.sin(lean0), Math.cos(lean1), Math.sin(lean1));
    if (this.waveT >= 0) {
      this.waveT += dt;
      const envelope = Math.max(0, Math.min(1, this.waveT / 0.5, (WAVE_LAP - this.waveT) / 0.6));
      // Começa atrás do gol da CPU (ângulo 0.75) e dá uma volta.
      uniforms.uWave.value.set((0.75 + this.waveT / WAVE_LAP) % 1, envelope);
      if (this.waveT >= WAVE_LAP) {
        this.waveT = -1;
        uniforms.uWave.value.set(0, 0);
      }
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}

// ------------------------------------------------------ flashes de câmera

const FLASH_PARS = /* glsl */ `
attribute vec2 aFlash;
uniform vec3 uClock;
uniform vec3 uRate;
varying float vFlash;
`;

const FLASH_SIZE = 30;

// Cada ponto pisca quando a fase passa do zero. A janela acesa é proporcional
// à taxa, então o flash dura ~50 ms qualquer que seja a taxa, e cada ponto
// nunca passa de ~1.7 piscadas por segundo (taxa 2.22 × velocidade 0.75).
const FLASH_VERTEX = /* glsl */ `
{
  vec3 flashGroup = vec3(step(aFlash.y, 0.5), step(0.5, aFlash.y) * step(aFlash.y, 1.5), step(1.5, aFlash.y));
  float flashClock = dot(uClock, flashGroup);
  float flashRate = dot(uRate, flashGroup);
  float flashSpeed = 0.35 + 0.4 * aFlash.x;
  float flashPhase = fract(flashClock * flashSpeed + aFlash.x * 17.0);
  float flashWindow = flashRate * flashSpeed * 0.05;
  float flashOn = step(flashPhase, flashWindow) * step(0.0001, flashWindow);
  vFlash = flashOn * (1.0 - flashPhase / max(flashWindow, 0.0001));
  // Teto de 5% da meia altura da tela: no close o flash nao vira um sol. scale
  // vem em px CSS e gl_PointSize em px do aparelho; size ja traz o pixelRatio.
  gl_PointSize = min(gl_PointSize, scale * size * ${(0.05 / FLASH_SIZE).toFixed(6)}) * (0.75 + 0.25 * vFlash) * mix(1.0, 0.8, flashGroup.z);
  // Apagado sai do recorte: ponto de tamanho 0 ainda vira 1 px em alguns drivers.
  if (flashOn < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

/**
 * Flashes brancos pequenos na arquibancada e nas lentes dos fotógrafos: um
 * `Points` só (1 draw call), grupos 0 = torcida do usuário, 1 = da CPU, 2 =
 * fotógrafos. O relógio de cada grupo é integrado no JS para a taxa mudar sem
 * salto de fase.
 */
class CameraFlashes {
  readonly points: THREE.Points;
  private readonly material: THREE.PointsMaterial;
  private readonly texture: THREE.Texture;
  private readonly clock = new THREE.Vector3();
  private readonly rate = new THREE.Vector3();
  private readonly age = [99, 99, 99];
  private readonly span = [1, 1, 1];
  private readonly peak = [0, 0, 0];

  constructor(groups: THREE.Vector3[][], seed: number, private readonly calm: boolean) {
    const random = seeded(seed ^ 0xf1a5);
    const total = groups.reduce((sum, group) => sum + group.length, 0);
    const positions = new Float32Array(Math.max(1, total) * 3);
    const flash = new Float32Array(Math.max(1, total) * 2);
    let cursor = 0;
    groups.forEach((group, groupIndex) => {
      for (const spot of group) {
        positions[cursor * 3] = spot.x;
        positions[cursor * 3 + 1] = spot.y;
        positions[cursor * 3 + 2] = spot.z;
        flash[cursor * 2] = random();
        flash[cursor * 2 + 1] = groupIndex;
        cursor += 1;
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aFlash", new THREE.BufferAttribute(flash, 2));
    this.texture = flashTexture();
    this.material = new THREE.PointsMaterial({
      size: FLASH_SIZE,
      map: this.texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      fog: false,
    });
    this.material.color.setRGB(1.6, 1.6, 1.6);
    const uniforms = { uClock: { value: this.clock }, uRate: { value: this.rate } };
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${FLASH_PARS}`)
        .replace("#include <logdepthbuf_vertex>", `${FLASH_VERTEX}\n#include <logdepthbuf_vertex>`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vFlash;")
        .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= 0.4 + 0.6 * vFlash;");
    };
    this.material.customProgramCacheKey = () => "futbobo-flashes";
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  trigger(side: BotaoSide, seconds: number) {
    const group = sideIndex(side);
    const span = Math.max(0.5, seconds);
    this.age[group] = 0;
    this.span[group] = span;
    this.peak[group] = 2;
    this.age[2] = 0;
    this.span[2] = span;
    this.peak[2] = 2.2;
  }

  update(dt: number) {
    for (let group = 0; group < 3; group += 1) {
      this.age[group] += dt;
      const age = this.age[group];
      const span = this.span[group];
      const boost = age < span ? this.peak[group] * Math.exp((-3 * age) / span) : 0;
      // Com movimento reduzido nada pisca.
      const rate = this.calm ? 0 : FLASH_AMBIENT + boost;
      this.rate.setComponent(group, rate);
      this.clock.setComponent(group, this.clock.getComponent(group) + rate * dt);
    }
  }

  prepare(renderer: THREE.WebGLRenderer) {
    renderer.initTexture(this.texture);
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

// ------------------------------------------------------------ fotógrafos

/**
 * Fotógrafos ajoelhados atrás das linhas de fundo, fora da boca do gol, lente
 * para a área. Vão para `baker` com cor por vértice (junto com os degraus, 1
 * draw call). Devolve a ponta de cada lente para os flashes.
 */
function buildPhotographers(seed: number, futsal: boolean, baker: Baker) {
  const random = seeded(seed ^ 0x9070);
  const lenses: THREE.Vector3[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const facing = new THREE.Quaternion();
  const local = new THREE.Vector3();
  const world = new THREE.Vector3();
  const tilt = new THREE.Quaternion();
  const combined = new THREE.Quaternion();
  const legs = new THREE.BoxGeometry(5, 2.4, 6.2);
  const torso = new THREE.BoxGeometry(5.2, 5.4, 3.4);
  const head = new THREE.BoxGeometry(4, 4, 4);
  const cap = new THREE.BoxGeometry(4.3, 1.1, 4.8);
  const arm = new THREE.BoxGeometry(1.3, 1.3, 4);
  const body = new THREE.BoxGeometry(2.8, 2.3, 2.6);
  const lens = new THREE.CylinderGeometry(1.15, 1, 4, 10);
  const vests = ["#c8742a", "#3c4654", "#b7832f", "#4f5b3a"];
  const skins = ["#f1cfb4", "#d9a07c", "#a86f50", "#6f4632"];
  const xs = futsal ? [70, 104] : [62, 88, 114];
  for (const sz of [-1, 1]) {
    for (const sx of [-1, 1]) {
      for (const offset of xs) {
        const x = sx * offset + (random() - 0.5) * 6;
        const z = sz * (HALF_H + 22 + random() * 4);
        // Lente mirando a grande área do próprio lado.
        const yaw = Math.atan2(0 - x, sz * (HALF_H - 70) - z);
        facing.setFromAxisAngle(up, yaw);
        const base = new THREE.Vector3(x, 0, z);
        const place = (geometry: THREE.BufferGeometry, lx: number, ly: number, lz: number, color: string, pitch = 0) => {
          world.copy(local.set(lx, ly, lz)).applyQuaternion(facing).add(base);
          tilt.setFromAxisAngle(new THREE.Vector3(1, 0, 0), pitch);
          combined.copy(facing).multiply(tilt);
          baker.add(geometry, world, combined, color);
        };
        const vest = vests[Math.floor(random() * vests.length)];
        const skin = skins[Math.floor(random() * skins.length)];
        place(legs, 0, 1.2, -0.4, "#2b2f36");
        place(torso, 0, 5, -0.4, vest, 0.12);
        place(head, 0, 9.7, 0.2, skin);
        place(cap, 0, 12.2, 0.6, "#1d232b");
        place(arm, -1.9, 8.2, 1.6, "#2b2f36");
        place(arm, 2.6, 8.2, 1.6, "#2b2f36");
        place(body, 0.9, 9.4, 3, "#15171b");
        // Cilindro nasce em Y: +90° em X deita o eixo para a frente (+Z).
        place(lens, 0.9, 9.4, 6.3, "#2c3036", Math.PI / 2);
        lenses.push(local.set(0.9, 9.4, 8.6).clone().applyQuaternion(facing).add(base));
      }
    }
  }
  for (const geometry of [legs, torso, head, cap, arm, body, lens]) geometry.dispose();
  return lenses;
}

// ------------------------------------------------------------ bandeirinhas

const FLAG_LENGTH = 7;
const FLAG_HEIGHT = 5;
const FLAG_COLUMNS = 7;
const FLAG_TOP = 22;
// sin(0.7 t) e sin(7 t) fecham o ciclo juntos aqui: o relógio da GPU dá a volta sem salto.
const FLAG_PERIOD = (Math.PI * 2) / 0.7;

const CLOTH_PARS = /* glsl */ `
attribute vec2 aCloth;
uniform float uClothTime;
uniform float uClothWind;
// Onda correndo do mastro para a ponta, mais larga na ponta, girada em volta do
// mastro pelo vento. aCloth = (0 no mastro..1 na ponta, fase da bandeira);
// position = pé do pano no mastro (x, altura da linha, z).
vec3 clothPoint(out vec3 clothNormal) {
  float k = aCloth.x;
  // Mesmo vento para todas; cada uma só oscila um pouco em volta dele.
  float turn = uClothWind + sin(uClothTime * 0.7 + aCloth.y) * 0.15;
  vec2 cs = vec2(cos(turn), sin(turn));
  float u = k * ${FLAG_LENGTH.toFixed(1)};
  float wave = uClothTime * 7.0 - u * 0.9 + aCloth.y;
  float waveSin = sin(wave);
  float w = waveSin * 0.6 * k;
  float slope = -0.54 * cos(wave) * k + waveSin * ${(0.6 / FLAG_LENGTH).toFixed(6)};
  vec2 n = vec2(-slope, 1.0) * inversesqrt(slope * slope + 1.0);
  // Local (u, y, w) girado em Y: x = u·cos + w·sin, z = -u·sin + w·cos.
  clothNormal = vec3(n.x * cs.x + n.y * cs.y, 0.0, -n.x * cs.y + n.y * cs.x);
  return vec3(position.x + u * cs.x + w * cs.y, position.y - 0.5 * k * k, position.z - u * cs.y + w * cs.x);
}
`;

/**
 * Quatro bandeiras de pano numa malha só, todas para o mesmo lado do vento. A
 * onda sai do vertex shader (posição e normal analítica): nada sobe para a GPU
 * por quadro, só o relógio. A sombra usa a mesma onda.
 */
class CornerFlags {
  readonly cloth: THREE.Mesh;
  readonly depthMaterial: THREE.MeshDepthMaterial | null;
  private readonly uniforms = { uClothTime: { value: 0 }, uClothWind: { value: 0 } };

  constructor(seed: number, material: THREE.Material, castShadow: boolean) {
    const random = seeded(seed ^ 0xf1a6);
    this.uniforms.uClothWind.value = random() * Math.PI * 2;
    const corners: Array<{ x: number; z: number; phase: number }> = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) corners.push({ x: sx * (HALF_W + 7), z: sz * (HALF_H + 7), phase: random() * Math.PI * 2 });
    const perFlag = FLAG_COLUMNS * 2;
    const count = corners.length * perFlag;
    const positions = new Float32Array(count * 3);
    const cloth = new Float32Array(count * 2);
    corners.forEach((corner, flag) => {
      for (let row = 0; row < 2; row += 1) {
        for (let column = 0; column < FLAG_COLUMNS; column += 1) {
          const index = flag * perFlag + row * FLAG_COLUMNS + column;
          positions.set([corner.x, FLAG_TOP - FLAG_HEIGHT + row * FLAG_HEIGHT, corner.z], index * 3);
          cloth.set([column / (FLAG_COLUMNS - 1), corner.phase], index * 2);
        }
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aCloth", new THREE.BufferAttribute(cloth, 2));
    const indices: number[] = [];
    for (let flag = 0; flag < corners.length; flag += 1) {
      for (let column = 0; column < FLAG_COLUMNS - 1; column += 1) {
        const a = flag * perFlag + column;
        const b = a + 1;
        const c = a + FLAG_COLUMNS;
        const d = c + 1;
        indices.push(a, b, d, a, d, c);
      }
    }
    geometry.setIndex(indices);
    // Os vértices andam no shader: esfera fixa que cobre os quatro cantos.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, FLAG_TOP / 2, 0), Math.hypot(HALF_W + 16, HALF_H + 16) + FLAG_TOP);
    const uniforms = this.uniforms;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${CLOTH_PARS}`)
        .replace("#include <beginnormal_vertex>", "vec3 clothNormal;\nvec3 clothPosition = clothPoint(clothNormal);\nvec3 objectNormal = clothNormal;")
        .replace("#include <begin_vertex>", "vec3 transformed = clothPosition;");
    };
    material.customProgramCacheKey = () => "futbobo-cloth";
    this.cloth = new THREE.Mesh(geometry, material);
    this.cloth.castShadow = castShadow;
    this.depthMaterial = null;
    if (castShadow) {
      // A sombra só lê profundidade: sem gravar cor.
      const depth = new THREE.MeshDepthMaterial({ colorWrite: false });
      depth.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", `#include <common>\n${CLOTH_PARS}`)
          .replace("#include <begin_vertex>", "vec3 clothNormal;\nvec3 transformed = clothPoint(clothNormal);");
      };
      depth.customProgramCacheKey = () => "futbobo-cloth-depth";
      this.cloth.customDepthMaterial = depth;
      this.depthMaterial = depth;
    }
  }

  update(time: number) {
    this.uniforms.uClothTime.value = time % FLAG_PERIOD;
  }

  dispose() {
    this.cloth.geometry.dispose();
    this.depthMaterial?.dispose();
  }
}

// --------------------------------------------------------------------- rua

/** Lado de fora das tabelas laterais: daí para fora começa a calçada (ou a terra). */
const RAIL_OUT = HALF_W + RAIL_THICKNESS + 0.3;
/** Calçada no nível do topo das tabelas: na rua do bairro a tabela é o próprio meio-fio. */
const SIDEWALK_TOP = RAIL_HEIGHT;
/** Vizinho de pé perto do campo: quase do tamanho dos jogadores (na arquibancada é 1). */
const STREET_FAN_SCALE = 2;
const STONE_FINISH: Finish = [0.92, 0, 0];
const WOOD_FINISH: Finish = [0.82, 0, 0];
const METAL_FINISH: Finish = [0.42, 0.65, 0];
const PAINT_FINISH: Finish = [0.6, 0, 0];
/** Lâmpada de rua sem brilho (de dia ela está apagada). */
const BULB_OFF_FINISH: Finish = [0.3, 0, 0];
// sin(3.2 t) e sin(2.1 t) fecham o ciclo juntos aqui: o relógio da GPU dá a volta sem salto.
const BUNTING_PERIOD = (Math.PI * 2) / 0.1;
/** Brilho das lâmpadas no MeshBasic (cor acima de 1 passa pelo ACES como emissivo). */
const GLOW_GAIN = 1.7;

const WALL_COLORS = ["#f2c14e", "#e76f51", "#2a9d8f", "#8ecae6", "#f4a261", "#b8a1d9", "#a7c957", "#efe6d8", "#ff99c8", "#4cc9f0", "#ffd6a5", "#e9c46a", "#90be6d", "#f28482"];
const DOOR_COLORS = ["#5b3a29", "#1d6f6b", "#3d4449", "#1d4e89", "#7a1f1f", "#e8e2d4"];
const SIDEWALK_COLORS = ["#a8a49b", "#b36b55", "#9a978f", "#c4beb0", "#8d8a83", "#a3553f"];
const ROOF_TILES = ["#b5582f", "#a34a2a", "#c0623a", "#9c4426"];
const CLOTHES = ["#e63946", "#f1faee", "#457b9d", "#ffd23f", "#2a9d8f", "#ff5d8f", "#1d3557"];
const STREET_NEUTRALS = ["#f2f2f0", "#2a2d33", "#6b7280", "#1e3a5f", "#c0392b", "#f1c40f", "#16a085", "#e67e22", "#8e44ad", "#d0d3d4", "#b03a2e", "#5dade2"];
const BUNTING_COLORS = ["#e63946", "#ffd23f", "#2a9d8f", "#3a86ff", "#ff7f11", "#ff5d8f", "#f4f1de", "#8ac926"];
const SKINS = ["#f6d9c0", "#e5aa84", "#cc8965", "#985d43", "#714633", "#4b3027", "#edbf9d"];

/** Pintura de trave de cada rua: a geometria e a física são as de sempre. */
const STREET_GOALS: Record<BotaoStreetVariant, GoalStyle> = {
  0: { post: "#f1eee6", support: "#c9ccc8", stripes: null },
  1: { post: "#e6dfd0", support: "#b9b1a0", stripes: null },
  2: { post: "#f4f4f0", support: "#c8ccd0", stripes: "#c62f2f" },
};

// ------------------------------------------------------------ texturas da rua

type MuralPiece = "futbobo" | "varzea" | "terrao" | "craque" | "tags" | "jersey" | "bar" | "mercado";
const MURAL_SIZE = 1024;
/** Retângulos (x, y, largura, altura) de cada peça no atlas do grafite e das placas. */
const MURAL_LAYOUT: Record<MuralPiece, readonly [number, number, number, number]> = {
  futbobo: [0, 0, 512, 220],
  varzea: [512, 0, 512, 220],
  terrao: [0, 220, 512, 220],
  craque: [512, 220, 512, 220],
  tags: [0, 440, 512, 210],
  jersey: [512, 440, 512, 210],
  bar: [0, 660, 420, 150],
  mercado: [420, 660, 420, 150],
};

function graffitiFont(size: number) {
  return `italic 900 ${size}px "Arial Black", Impact, ui-sans-serif, system-ui, sans-serif`;
}

/** Letra de grafite: nuvem de spray, volume, contorno, degradê, brilho e escorrido. */
function graffitiPiece(ctx: CanvasRenderingContext2D, piece: MuralPiece, text: string, fill: readonly [string, string], outline: string, splash: string, random: () => number) {
  const [x, y, w, h] = MURAL_LAYOUT[piece];
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 2, y + 2, w - 4, h - 4);
  ctx.clip();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.fillStyle = splash;
  for (let index = 0; index < 9; index += 1) {
    ctx.beginPath();
    ctx.ellipse((random() - 0.5) * w * 0.62, (random() - 0.5) * h * 0.3, w * (0.12 + random() * 0.1), h * (0.24 + random() * 0.12), random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.rotate(-0.06);
  let size = h * 0.56;
  ctx.font = graffitiFont(size);
  while (ctx.measureText(text).width > w * 0.82 && size > 20) {
    size -= 4;
    ctx.font = graffitiFont(size);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  // Volume: a letra repetida para baixo e para a direita.
  ctx.fillStyle = "#16101c";
  for (let step = 9; step >= 1; step -= 1) ctx.fillText(text, step * 1.2, step * 1.2);
  ctx.lineWidth = size * 0.17;
  ctx.strokeStyle = outline;
  ctx.strokeText(text, 0, 0);
  const gradient = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
  gradient.addColorStop(0, fill[0]);
  gradient.addColorStop(1, fill[1]);
  ctx.fillStyle = gradient;
  ctx.fillText(text, 0, 0);
  ctx.lineWidth = size * 0.03;
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.strokeText(text, -1.5, -2.5);
  // Escorridos de tinta e estrelinhas de brilho.
  const textWidth = ctx.measureText(text).width;
  ctx.fillStyle = fill[1];
  for (let index = 0; index < 7; index += 1) {
    const dx = (random() - 0.5) * textWidth * 0.85;
    const length = 10 + random() * 24;
    ctx.fillRect(dx, size * 0.32, 3.5, length);
    ctx.beginPath();
    ctx.arc(dx + 1.75, size * 0.32 + length, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#ffffff";
  for (let index = 0; index < 3; index += 1) {
    const sx = (random() - 0.5) * textWidth;
    const sy = (random() - 0.5) * size * 0.7;
    const r = 5 + random() * 6;
    ctx.beginPath();
    for (let point = 0; point < 8; point += 1) {
      const angle = (point / 8) * Math.PI * 2;
      const radius = point % 2 === 0 ? r : r * 0.25;
      ctx.lineTo(sx + Math.cos(angle) * radius, sy + Math.sin(angle) * radius);
    }
    ctx.fill();
  }
  ctx.restore();
}

/** Pichações miúdas: assinaturas, coração, estrela. */
function graffitiTags(ctx: CanvasRenderingContext2D, random: () => number) {
  const [x, y, w, h] = MURAL_LAYOUT.tags;
  const words = ["ZÉ", "KIKO", "VILA", "10", "RUA", "FUT", "MANO", "TOP"];
  const inks = ["#ff4fa3", "#20e0c0", "#ffd23f", "#f4f1de", "#3a86ff", "#111111", "#ff7f11"];
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let index = 0; index < 11; index += 1) {
    const word = words[index % words.length];
    ctx.save();
    ctx.translate(x + 40 + random() * (w - 80), y + 30 + random() * (h - 60));
    ctx.rotate((random() - 0.5) * 0.5);
    const size = 26 + random() * 30;
    ctx.font = graffitiFont(size);
    ctx.lineWidth = 3 + random() * 3;
    ctx.strokeStyle = inks[Math.floor(random() * inks.length)];
    ctx.strokeText(word, 0, 0);
    ctx.restore();
  }
  // Coração e estrela de spray.
  ctx.fillStyle = "#e63946";
  const hx = x + w * 0.78;
  const hy = y + h * 0.3;
  ctx.beginPath();
  ctx.moveTo(hx, hy + 22);
  ctx.bezierCurveTo(hx - 40, hy - 6, hx - 14, hy - 30, hx, hy - 8);
  ctx.bezierCurveTo(hx + 14, hy - 30, hx + 40, hy - 6, hx, hy + 22);
  ctx.fill();
  ctx.fillStyle = "#ffd23f";
  ctx.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const angle = -Math.PI / 2 + (point / 10) * Math.PI * 2;
    const radius = point % 2 === 0 ? 26 : 11;
    ctx.lineTo(x + w * 0.2 + Math.cos(angle) * radius, y + h * 0.72 + Math.sin(angle) * radius);
  }
  ctx.fill();
  ctx.restore();
}

/** Camisa 10 pintada no muro, amarela de gola verde. */
function graffitiJersey(ctx: CanvasRenderingContext2D) {
  const [x, y, w, h] = MURAL_LAYOUT.jersey;
  const cx = x + w / 2;
  const top = y + 18;
  const s = h / 200;
  ctx.save();
  ctx.fillStyle = "#3a86ff";
  ctx.beginPath();
  ctx.ellipse(cx, y + h / 2, w * 0.36, h * 0.46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 40 * s, top);
  ctx.lineTo(cx - 92 * s, top + 22 * s);
  ctx.lineTo(cx - 112 * s, top + 70 * s);
  ctx.lineTo(cx - 74 * s, top + 84 * s);
  ctx.lineTo(cx - 66 * s, top + 70 * s);
  ctx.lineTo(cx - 64 * s, top + 166 * s);
  ctx.lineTo(cx + 64 * s, top + 166 * s);
  ctx.lineTo(cx + 66 * s, top + 70 * s);
  ctx.lineTo(cx + 74 * s, top + 84 * s);
  ctx.lineTo(cx + 112 * s, top + 70 * s);
  ctx.lineTo(cx + 92 * s, top + 22 * s);
  ctx.lineTo(cx + 40 * s, top);
  ctx.quadraticCurveTo(cx, top + 30 * s, cx - 40 * s, top);
  ctx.closePath();
  ctx.lineJoin = "round";
  ctx.lineWidth = 9;
  ctx.strokeStyle = "#14532d";
  ctx.stroke();
  ctx.fillStyle = "#f7d117";
  ctx.fill();
  ctx.fillStyle = "#1f9d55";
  ctx.font = graffitiFont(78 * s);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 7;
  ctx.strokeStyle = "#1d3557";
  ctx.strokeText("10", cx, top + 104 * s);
  ctx.fillText("10", cx, top + 104 * s);
  ctx.restore();
}

/** Placa pintada de comércio de bairro (opaca). */
function shopSign(ctx: CanvasRenderingContext2D, piece: MuralPiece, text: string, board: string, ink: string, rim: string) {
  const [x, y, w, h] = MURAL_LAYOUT[piece];
  ctx.save();
  ctx.fillStyle = rim;
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = board;
  ctx.fillRect(x + 12, y + 12, w - 24, h - 24);
  ctx.fillStyle = ink;
  let size = h * 0.48;
  ctx.font = `900 ${size}px ui-sans-serif, system-ui, sans-serif`;
  while (ctx.measureText(text).width > w - 50 && size > 18) {
    size -= 2;
    ctx.font = `900 ${size}px ui-sans-serif, system-ui, sans-serif`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + w / 2, y + h / 2 + 3);
  ctx.restore();
}

type MuralAtlas = { texture: THREE.CanvasTexture; uv: (piece: MuralPiece) => readonly [number, number, number, number]; aspect: (piece: MuralPiece) => number };

/**
 * Grafites e placas num atlas só (1 material, 1 draw call): cada parede ganha
 * planos com o UV da peça. Fundo transparente + alphaTest: a tinta fica por
 * cima da cor da parede, com borda dura de spray.
 */
function muralAtlas(anisotropy: number, seed: number): MuralAtlas {
  const canvas = document.createElement("canvas");
  canvas.width = MURAL_SIZE;
  canvas.height = MURAL_SIZE;
  const ctx = canvas.getContext("2d")!;
  const random = seeded(seed ^ 0x6a2f);
  graffitiPiece(ctx, "futbobo", "FUTBOBO", ["#ffe14d", "#ff7a1a"], "#1d1030", "rgba(58,134,255,0.9)", random);
  graffitiPiece(ctx, "varzea", "VÁRZEA", ["#7dffb2", "#12a36b"], "#14141f", "rgba(255,79,163,0.88)", random);
  graffitiPiece(ctx, "terrao", "TERRÃO", ["#ffd6f0", "#ff4fa3"], "#221133", "rgba(32,224,192,0.85)", random);
  graffitiPiece(ctx, "craque", "CRAQUE", ["#b9e6ff", "#3a86ff"], "#0f1a33", "rgba(255,210,63,0.9)", random);
  graffitiTags(ctx, random);
  graffitiJersey(ctx);
  shopSign(ctx, "bar", "BAR DO ZÉ", "#c62f2f", "#fff4d6", "#f4f1de");
  shopSign(ctx, "mercado", "MERCADINHO", "#1f7a4d", "#ffe14d", "#f4f1de");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(4, anisotropy);
  return {
    texture,
    uv: (piece) => {
      const [x, y, w, h] = MURAL_LAYOUT[piece];
      // flipY do three: v = 0 é o pé do canvas.
      return [x / MURAL_SIZE, 1 - (y + h) / MURAL_SIZE, (x + w) / MURAL_SIZE, 1 - y / MURAL_SIZE];
    },
    aspect: (piece) => MURAL_LAYOUT[piece][3] / MURAL_LAYOUT[piece][2],
  };
}

/** Quanto do mundo cabe num ladrilho do chão de cada rua. */
const GROUND_TILE: Record<BotaoStreetVariant, number> = { 0: 46, 1: 70, 2: 60 };

/**
 * Ladrilho claro e neutro do chão em volta do campo (a cor vem do vértice):
 * pedrinhas no asfalto, torrões na terra, juntas no concreto. Manchas
 * repetidas nas 9 posições vizinhas para emendar sem costura.
 */
function groundTileTexture(variant: BotaoStreetVariant, anisotropy: number) {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const random = seeded(0x7e11 + variant);
  ctx.fillStyle = "#e2e2e2";
  ctx.fillRect(0, 0, size, size);
  const blotches = variant === 1 ? 22 : 12;
  for (let index = 0; index < blotches; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = 18 + random() * 50;
    const light = random() < 0.45;
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const gradient = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, radius);
        gradient.addColorStop(0, light ? "rgba(255,255,255,0.35)" : `rgba(120,120,120,${variant === 1 ? 0.28 : 0.16})`);
        gradient.addColorStop(1, "rgba(128,128,128,0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(x + ox - radius, y + oy - radius, radius * 2, radius * 2);
      }
    }
  }
  const dots = variant === 0 ? 5200 : variant === 1 ? 2600 : 1800;
  const grain = variant === 1 ? 2.6 : 1.6;
  for (const [color, count] of [["rgba(255,255,255,0.55)", dots], ["rgba(90,90,90,0.5)", dots]] as const) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let index = 0; index < count; index += 1) {
      const dot = 0.8 + random() * grain;
      ctx.rect(random() * size, random() * size, dot, dot);
    }
    ctx.fill();
  }
  if (variant === 2) {
    // Juntas das placas da praça na borda do ladrilho: viram uma grade no chão.
    ctx.fillStyle = "rgba(60,60,60,0.45)";
    ctx.fillRect(0, 0, size, 2);
    ctx.fillRect(0, 0, 2, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = Math.min(8, anisotropy);
  return texture;
}

/** Alambrado: losangos de arame como alphaMap (canal verde), no mesmo esquema da rede. */
function fenceTexture(anisotropy: number) {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (const dx of [-size, 0, size]) {
    ctx.moveTo(dx, 0);
    ctx.lineTo(dx + size, size);
    ctx.moveTo(dx + size, 0);
    ctx.lineTo(dx, size);
  }
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = Math.min(4, anisotropy);
  return texture;
}

// ------------------------------------------------------------- bandeirinhas

type BuntingString = { from: THREE.Vector3; to: THREE.Vector3; sag: number };

const BUNTING_PARS = /* glsl */ `
attribute vec4 aSway;
uniform float uFlagTime;
uniform float uFlagAmp;
`;

/**
 * Bandeirinhas de festa junina em cordões: todas numa malha (1 draw call), cor
 * por vértice. Só a ponta de cada triângulo balança, no vertex shader: nada
 * sobe para a GPU por quadro além do relógio. Não fazem sombra.
 */
class Bunting {
  readonly mesh: THREE.Mesh;
  private readonly uniforms = { uFlagTime: { value: 0 }, uFlagAmp: { value: 1 } };

  constructor(strings: BuntingString[], random: () => number, material: THREE.MeshLambertMaterial, calm: boolean) {
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const sway: number[] = [];
    const color = new THREE.Color();
    const cord = new THREE.Color("#2d2a26");
    // Catenária aproximada por parábola: barriga `sag` no meio do vão.
    const point = (string: BuntingString, t: number) => {
      const p = new THREE.Vector3().lerpVectors(string.from, string.to, t);
      p.y -= string.sag * 4 * t * (1 - t);
      return p;
    };
    const vertex = (p: THREE.Vector3, normal: THREE.Vector3, tint: THREE.Color, weight: number, phase: number) => {
      positions.push(p.x, p.y, p.z);
      normals.push(normal.x, normal.y, normal.z);
      colors.push(tint.r, tint.g, tint.b);
      sway.push(normal.x, normal.z, phase, weight);
    };
    for (const string of strings) {
      const along = new THREE.Vector3().subVectors(string.to, string.from).setY(0).normalize();
      const normal = new THREE.Vector3(-along.z, 0, along.x);
      const length = string.from.distanceTo(string.to);
      // Cordão: fita fina de ponta a ponta, parada.
      const segments = 12;
      for (let index = 0; index < segments; index += 1) {
        const a = point(string, index / segments);
        const b = point(string, (index + 1) / segments);
        const a2 = a.clone().setY(a.y + 0.5);
        const b2 = b.clone().setY(b.y + 0.5);
        for (const p of [a, b, b2, a, b2, a2]) vertex(p, normal, cord, 0, 0);
      }
      const flags = Math.max(2, Math.floor(length / 7.5));
      for (let index = 0; index < flags; index += 1) {
        const t0 = (index + 0.12) / flags;
        const t1 = (index + 0.88) / flags;
        const a = point(string, t0);
        const b = point(string, t1);
        const tip = point(string, (t0 + t1) / 2);
        tip.y = (a.y + b.y) / 2 - 6.5;
        color.set(BUNTING_COLORS[Math.floor(random() * BUNTING_COLORS.length)]);
        const phase = random() * Math.PI * 2;
        vertex(a, normal, color, 0, phase);
        vertex(b, normal, color, 0, phase);
        vertex(tip, normal, color, 1, phase);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("aSway", new THREE.Float32BufferAttribute(sway, 4));
    geometry.computeBoundingSphere();
    if (geometry.boundingSphere) geometry.boundingSphere.radius += 3;
    this.uniforms.uFlagAmp.value = calm ? 0.35 : 1;
    const uniforms = this.uniforms;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${BUNTING_PARS}`)
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          transformed.xz += aSway.xy * sin(uFlagTime * 3.2 + aSway.z) * 1.5 * uFlagAmp * aSway.w;
          transformed.y += sin(uFlagTime * 2.1 + aSway.z * 1.7) * 0.5 * uFlagAmp * aSway.w;`,
        );
    };
    material.customProgramCacheKey = () => "futbobo-bunting";
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  update(time: number) {
    this.uniforms.uFlagTime.value = time % BUNTING_PERIOD;
  }

  dispose() {
    this.mesh.geometry.dispose();
  }
}

// ------------------------------------------------------------ peças da rua

type FencePanel = { x0: number; z0: number; x1: number; z1: number; height: number };

/** Painéis verticais do alambrado com UV em unidades do mundo (losango de ~6 em qualquer painel). */
function fenceGeometry(panels: FencePanel[]) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const cell = 6;
  for (const panel of panels) {
    const length = Math.hypot(panel.x1 - panel.x0, panel.z1 - panel.z0);
    const nx = -(panel.z1 - panel.z0) / length;
    const nz = (panel.x1 - panel.x0) / length;
    const base = positions.length / 3;
    positions.push(panel.x0, 0, panel.z0, panel.x1, 0, panel.z1, panel.x1, panel.height, panel.z1, panel.x0, panel.height, panel.z0);
    uvs.push(0, 0, length / cell, 0, length / cell, panel.height / cell, 0, panel.height / cell);
    for (let corner = 0; corner < 4; corner += 1) normals.push(nx, 0, nz);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

/** Prisma triangular unitário (base em y = 0, cumeeira em y = 1, ao longo de X): telhado de duas águas. */
function prismGeometry() {
  const front = [[-0.5, 0], [0.5, 0], [0, 1]] as const;
  const positions: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  const p = (x: number, i: number) => [x, front[i][1], front[i][0]];
  // Anti-horário visto de fora; sem a face de baixo (fica em cima da casa).
  positions.push(...p(0.5, 1), ...p(0.5, 0), ...p(0.5, 2), ...p(-0.5, 0), ...p(-0.5, 1), ...p(-0.5, 2));
  quad(p(-0.5, 1), p(0.5, 1), p(0.5, 2), p(-0.5, 2));
  quad(p(0.5, 0), p(-0.5, 0), p(-0.5, 2), p(0.5, 2));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Fachada: centro (x, z) no pé da frente e `yaw` com a frente apontando para (sin, cos). */
type Facade = { x: number; z: number; yaw: number };

/**
 * Oficina das peças do bairro. Tudo sai de meia dúzia de geometrias unitárias
 * escaladas no `Baker` e cai em poucas malhas: `scenery` (Lambert, cor por
 * vértice), `solid` (as tabelas, com acabamento), `glow` (lâmpadas e janelas
 * acesas, sem luz), `mural` (grafite) e `ground` (chão com ladrilho).
 */
class StreetParts {
  readonly scenery = new Baker();
  readonly glow = new Baker();
  readonly mural = new Baker({ keepUv: true });
  readonly ground = new Baker({ keepUv: true });
  readonly fans: Fan[] = [];
  readonly strings: BuntingString[] = [];
  readonly fence: FencePanel[] = [];
  readonly box = new THREE.BoxGeometry(1, 1, 1);
  readonly cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  readonly cone = new THREE.ConeGeometry(0.5, 1, 5);
  readonly blob = new THREE.IcosahedronGeometry(1, 1);
  readonly tire = new THREE.TorusGeometry(1, 0.38, 6, 14);
  readonly prism = prismGeometry();
  private readonly plane = new THREE.PlaneGeometry(1, 1);
  private readonly obstacles: number[] = [];
  private readonly at = new THREE.Vector3();
  private readonly size = new THREE.Vector3();
  private readonly turn = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly spin = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly dir = new THREE.Vector3();
  private readonly tint = new THREE.Color();

  constructor(
    readonly random: () => number,
    readonly solid: Baker,
    readonly atlas: MuralAtlas,
    /** Com acabamento por vértice (fora do modo desempenho) a lâmpada acesa vai para o `solid` e pisca no gol. */
    readonly finishes: boolean,
  ) {}

  pick<T>(list: readonly T[]) {
    return list[Math.floor(this.random() * list.length)];
  }

  /** Caixa com a BASE em `y`, girada `yaw` em volta de Y. */
  block(baker: Baker, x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.ColorRepresentation, yaw = 0, finish?: Finish) {
    baker.add(this.box, this.at.set(x, y + h / 2, z), this.turn.set(0, yaw, 0, "YXZ"), color, finish, this.size.set(w, h, d));
  }

  /** Peça qualquer pelo CENTRO, com giro yaw → pitch → roll. */
  piece(baker: Baker, geometry: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation, yaw = 0, pitch = 0, roll = 0, finish?: Finish) {
    baker.add(geometry, this.at.set(x, y, z), this.turn.set(pitch, yaw, roll, "YXZ"), color, finish, this.size.set(sx, sy, sz));
  }

  /** Barra de `from` até `to` (fio, cano, corda, braço de poste). */
  rod(baker: Baker, from: THREE.Vector3, to: THREE.Vector3, thickness: number, color: THREE.ColorRepresentation, finish?: Finish) {
    this.dir.subVectors(to, from);
    const length = this.dir.length();
    if (length < 1e-3) return;
    this.spin.setFromUnitVectors(this.up, this.dir.divideScalar(length));
    baker.add(this.box, this.at.addVectors(from, to).multiplyScalar(0.5), this.spin, color, finish, this.size.set(thickness, length, thickness));
  }

  /** Fio que barriga: parábola em poucas barras. */
  wire(baker: Baker, from: THREE.Vector3, to: THREE.Vector3, sag: number, thickness: number, color: THREE.ColorRepresentation, segments = 5) {
    let previous = from.clone();
    for (let index = 1; index <= segments; index += 1) {
      const t = index / segments;
      const next = new THREE.Vector3().lerpVectors(from, to, t);
      next.y -= sag * 4 * t * (1 - t);
      this.rod(baker, previous, next, thickness, color);
      previous = next;
    }
  }

  /** Chão plano (com o ladrilho da variação) entre dois cantos. */
  floor(x0: number, z0: number, x1: number, z1: number, y: number, color: THREE.ColorRepresentation) {
    this.ground.add(this.plane, this.at.set((x0 + x1) / 2, y, (z0 + z1) / 2), this.turn.set(-Math.PI / 2, 0, 0, "XYZ"), color, undefined, this.size.set(Math.abs(x1 - x0), Math.abs(z1 - z0), 1));
  }

  /** Lâmpada acesa: no `solid` com brilho (pisca no gol) ou no `glow` sem luz no modo desempenho. */
  lamp(x: number, y: number, z: number, w: number, h: number, d: number, color: string, yaw = 0, pitch = 0) {
    if (this.finishes) this.piece(this.solid, this.box, x, y, z, w, h, d, "#ffffff", yaw, pitch, 0, LAMP_FINISH);
    else this.piece(this.glow, this.box, x, y, z, w, h, d, this.tint.set(color).multiplyScalar(GLOW_GAIN), yaw, pitch);
  }

  /** Lâmpada pequena (janela acesa, bulbo de gambiarra): sempre no `glow`, `gain` acima de 1 brilha. */
  light(x: number, y: number, z: number, w: number, h: number, d: number, color: string, gain = GLOW_GAIN, yaw = 0) {
    this.piece(this.glow, this.box, x, y, z, w, h, d, this.tint.set(color).multiplyScalar(gain), yaw);
  }

  /** Grafite ou placa: plano do atlas, `width` de largura, de frente para `yaw`. */
  muralPlane(piece: MuralPiece, x: number, y: number, z: number, yaw: number, width: number) {
    const [u0, v0, u1, v1] = this.atlas.uv(piece);
    const plane = new THREE.PlaneGeometry(width, width * this.atlas.aspect(piece));
    const uv = plane.getAttribute("uv") as THREE.BufferAttribute;
    for (let index = 0; index < uv.count; index += 1) uv.setXY(index, u0 + uv.getX(index) * (u1 - u0), v0 + uv.getY(index) * (v1 - v0));
    this.mural.add(plane, this.at.set(x, y, z), this.turn.set(0, yaw, 0, "YXZ"));
    plane.dispose();
  }

  /** Marca um lugar ocupado (poste, árvore, mesa): vizinho não nasce em cima. */
  occupy(x: number, z: number, radius: number) {
    this.obstacles.push(x, z, radius);
  }

  free(x: number, z: number, radius = 6) {
    for (let index = 0; index < this.obstacles.length; index += 3) {
      if (Math.hypot(x - this.obstacles[index], z - this.obstacles[index + 1]) < radius + this.obstacles[index + 2]) return false;
    }
    return true;
  }

  /**
   * Vizinho de pé em (x, chão, z), olhando para o ponto do campo mais perto
   * (puxado um pouco para o meio). Torce pelo time que ataca para o lado dele,
   * com um em cada cinco do contra.
   */
  neighbour(x: number, ground: number, z: number) {
    if (!this.free(x, z, 4)) return;
    const random = this.random;
    const tx = Math.max(-HALF_W, Math.min(HALF_W, x)) * 0.7;
    const tz = Math.max(-HALF_H, Math.min(HALF_H, z)) * 0.7;
    const yaw = Math.atan2(tx - x, tz - z) + (random() - 0.5) * 0.5;
    const home: BotaoSide = z < 0 ? "user" : "cpu";
    const side: BotaoSide = random() < 0.2 ? (home === "user" ? "cpu" : "user") : home;
    this.fans.push({ x, y: ground + FAN_LEG * STREET_FAN_SCALE, z, yaw, side });
    this.occupy(x, z, 3.5);
  }

  /** Árvore: tronco e copa de bolhas (ipê amarelo quando `blossom`). */
  tree(x: number, ground: number, z: number, scale: number, blossom = false) {
    const random = this.random;
    const greens = blossom ? ["#f4c430", "#f7d046", "#e9b824"] : ["#4f7a3a", "#3e6a30", "#5f8a3e", "#6e9440"];
    this.piece(this.scenery, this.cylinder, x, ground + 17 * scale, z, 5 * scale, 34 * scale, 5 * scale, "#5b3a24");
    for (let index = 0; index < 4; index += 1) {
      const radius = (13 + random() * 8) * scale;
      const angle = random() * Math.PI * 2;
      const reach = index === 0 ? 0 : 10 * scale;
      this.piece(this.scenery, this.blob, x + Math.cos(angle) * reach, ground + (40 + random() * 12) * scale, z + Math.sin(angle) * reach, radius, radius * 0.8, radius, this.pick(greens), random() * Math.PI);
    }
    this.occupy(x, z, 7 * scale);
  }

  /** Carro de bairro estacionado (fusquinha quadrado), comprimento ao longo de `yaw`. */
  car(x: number, z: number, yaw: number, color: string) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const at = (along: number, side: number): [number, number] => [x + side * c + along * s, z - side * s + along * c];
    let [px, pz] = at(0, 0);
    this.piece(this.scenery, this.box, px, 7.5, pz, 17, 8, 36, color, yaw);
    this.piece(this.scenery, this.box, px, 14, pz, 15, 6, 19, "#2b3a48", yaw);
    this.piece(this.scenery, this.box, px, 17.6, pz, 15.4, 1.4, 18, color, yaw);
    for (const along of [-18.2, 18.2]) {
      [px, pz] = at(along, 0);
      this.piece(this.scenery, this.box, px, 5, pz, 17.4, 2.4, 1.4, "#9aa0a4", yaw);
    }
    for (const side of [-5.5, 5.5]) {
      [px, pz] = at(17.6, side);
      this.piece(this.scenery, this.box, px, 9, pz, 3.4, 2.2, 0.8, "#fff6d8", yaw);
      [px, pz] = at(-17.6, side);
      this.piece(this.scenery, this.box, px, 9, pz, 3.4, 2.2, 0.8, "#c0392b", yaw);
    }
    for (const along of [-11, 11]) {
      for (const side of [-8.2, 8.2]) {
        [px, pz] = at(along, side);
        this.piece(this.scenery, this.cylinder, px, 3.6, pz, 7.2, 2.6, 7.2, "#1b1c1e", yaw, 0, Math.PI / 2);
      }
    }
    this.occupy(x, z, 20);
  }

  /** Mesa e cadeiras de plástico de boteco. */
  barTable(x: number, ground: number, z: number, color: string) {
    this.block(this.scenery, x, ground + 11, z, 14, 1.2, 14, color);
    for (const [dx, dz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) this.block(this.scenery, x + dx, ground, z + dz, 1.2, 11, 1.2, color);
    for (const [dx, dz, yaw] of [[0, -12, 0], [0, 12, Math.PI], [-12, 0, Math.PI / 2]] as const) {
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      this.block(this.scenery, x + dx, ground + 6.5, z + dz, 8, 1, 8, color, yaw);
      this.block(this.scenery, x + dx - s * 4, ground + 7, z + dz - c * 4, 8, 9, 1, color, yaw);
      this.block(this.scenery, x + dx, ground, z + dz, 6, 6.5, 6, shadeHex(color, -30), yaw);
    }
    this.occupy(x, z, 16);
  }

  /** O vira-lata caramelo, deitado de olho no jogo. */
  dog(x: number, ground: number, z: number, yaw: number) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const caramel = "#c68642";
    this.block(this.scenery, x, ground, z, 6, 5, 12, caramel, yaw);
    this.block(this.scenery, x + s * 7, ground + 2, z + c * 7, 5, 5, 5, caramel, yaw);
    this.block(this.scenery, x + s * 9.6, ground + 3, z + c * 9.6, 2.4, 2, 2, "#8a5a2b", yaw);
    for (const side of [-1.8, 1.8]) this.block(this.scenery, x + s * 6 + c * side, ground + 6.4, z + c * 6 - s * side, 1.2, 2.2, 1.2, "#8a5a2b", yaw);
    this.block(this.scenery, x - s * 7.5, ground + 3, z - c * 7.5, 1.2, 1.2, 5, caramel, yaw);
    this.occupy(x, z, 8);
  }

  /** Caixotes de feira com frutas. */
  crates(x: number, ground: number, z: number, yaw: number) {
    const fruits = ["#f39c12", "#d63031", "#6ab04c", "#fdcb6e"];
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    for (let index = 0; index < 3; index += 1) {
      const along = (index - 1) * 11;
      const px = x + along * c;
      const pz = z - along * s;
      this.block(this.scenery, px, ground, pz, 10, 7, 8, "#b07a45", yaw);
      this.block(this.scenery, px, ground + 7, pz, 9, 1.6, 7, fruits[index % fruits.length], yaw);
    }
    this.block(this.scenery, x, ground + 7, z, 10, 7, 8, "#a36d3c", yaw);
    this.block(this.scenery, x, ground + 14, z, 9, 1.6, 7, fruits[3], yaw);
    this.occupy(x, z, 18);
  }

  dispose() {
    for (const geometry of [this.box, this.cylinder, this.cone, this.blob, this.tire, this.prism, this.plane]) geometry.dispose();
  }
}

/** Ponto de uma fachada: `along` na frente da casa, `out` para a rua. */
function facadePoint(facade: Facade, along: number, out: number): [number, number] {
  const c = Math.cos(facade.yaw);
  const s = Math.sin(facade.yaw);
  return [facade.x + along * c + out * s, facade.z - along * s + out * c];
}

type HouseSpec = {
  width: number;
  depth: number;
  floors: 1 | 2;
  roof: "tile" | "laje";
  wall: string;
  shop?: "bar" | "mercado";
  garage?: boolean;
  /** Vizinhos na laje (só perto do campo). */
  lajeFans?: number;
};

/**
 * Casa de bairro: corpo pintado, rodapé, porta, janelas com peitoril (às vezes
 * grade), portão de garagem, ar-condicionado, e telhado de barro ou laje com
 * mureta, caixa d'água azul, puxadinho de tijolo e varal. Devolve a altura
 * do telhado para quem quiser pendurar algo.
 */
function buildHouse(parts: StreetParts, facade: Facade, ground: number, spec: HouseSpec) {
  const { random } = parts;
  const { width, depth, wall } = spec;
  const height = spec.floors === 2 ? 96 : 52;
  const top = ground + height;
  const trim = shadeHex(wall, -46);
  const put = (along: number, y: number, out: number, w: number, h: number, d: number, color: THREE.ColorRepresentation, baker: Baker = parts.scenery) => {
    const [x, z] = facadePoint(facade, along, out);
    parts.block(baker, x, y, z, w, h, d, color, facade.yaw);
  };
  put(0, -0.6, -depth / 2, width, top + 0.6, depth, wall);
  put(0, ground, 0.3, width + 0.2, 6, 0.8, trim);
  if (spec.floors === 2) put(0, ground + 48, 0.6, width + 0.6, 2.4, 1.4, mixHex(wall, "#ffffff", 0.35));

  const addWindow = (along: number, base: number) => {
    put(along, base - 2, 1.1, 21, 2, 2.2, "#e9e4d8");
    put(along, base + 15.5, 0.8, 21, 1.6, 1.6, trim);
    put(along, base, 0.35, 16, 15.5, 0.7, "#3b5166");
    if (random() < 0.45) for (const offset of [-5, 0, 5]) put(along + offset, base, 0.9, 0.8, 15.5, 0.6, "#2b2f33");
  };

  // Térreo: comércio (porta larga, toldo e placa), ou porta + janela/garagem.
  const doorAlong = spec.shop ? 0 : (random() < 0.5 ? -1 : 1) * (width / 2 - 13);
  if (spec.shop) {
    put(0, ground, 0.4, 32, 30, 0.8, "#1d2226");
    put(0, ground, 3, 32, 12, 4.5, "#d8c3a5");
    const stripes = spec.shop === "bar" ? ["#d62828", "#f4f1de"] : ["#2a9d8f", "#f4d35e"];
    for (let index = 0; index < 7; index += 1) {
      const [x, z] = facadePoint(facade, -18 + index * 6, 6.5);
      parts.piece(parts.scenery, parts.box, x, ground + 37, z, 6, 1.2, 13, stripes[index % 2], facade.yaw, 0.38);
    }
    const [sx, sz] = facadePoint(facade, 0, 0.45);
    parts.muralPlane(spec.shop, sx, ground + 46, sz, facade.yaw, Math.min(width - 6, 40));
  } else {
    put(doorAlong, ground, 0.25, 17, 36, 0.5, trim);
    put(doorAlong, ground, 0.5, 14, 34, 1, parts.pick(DOOR_COLORS));
    const otherAlong = -doorAlong * 0.7;
    if (spec.garage && width > 60) {
      const metal = parts.pick(["#6d7a84", "#2f6f8f", "#8a8f93", "#4a5560"]);
      put(otherAlong, ground, 0.45, 28, 30, 0.9, metal);
      for (let index = 0; index < 4; index += 1) put(otherAlong, ground + 5 + index * 6.5, 0.95, 28, 0.7, 0.3, shadeHex(metal, -35));
    } else {
      addWindow(otherAlong, ground + 14);
    }
  }
  if (spec.floors === 2) {
    for (const along of [-width / 4, width / 4]) addWindow(along, ground + 64);
    if (random() < 0.35) put(width / 4 + 14, ground + 62, 2.6, 10, 6, 5, "#eceae4");
  }

  if (spec.roof === "tile") {
    const [x, z] = facadePoint(facade, 0, -depth / 2);
    parts.piece(parts.scenery, parts.prism, x, top, z, width + 3, 16 + random() * 6, depth + 8, parts.pick(ROOF_TILES), facade.yaw);
  } else {
    put(0, top, -depth / 2, width + 1, 3, depth + 1, "#a19d95");
    put(0, top + 3, -0.8, width, 6, 1.6, wall);
    put(0, top + 3, -depth + 0.8, width, 6, 1.6, wall);
    for (const side of [-1, 1]) put(side * (width / 2 - 0.8), top + 3, -depth / 2, 1.6, 6, depth, wall);
    const tankAlong = (random() - 0.5) * (width - 20);
    const [tx, tz] = facadePoint(facade, tankAlong, -depth * 0.68);
    parts.piece(parts.scenery, parts.cylinder, tx, top + 8, tz, 14, 10, 14, "#2f6fb0");
    parts.piece(parts.scenery, parts.cylinder, tx, top + 13.6, tz, 15, 1.4, 15, "#2a5d96");
    if (random() < 0.4) {
      // Puxadinho de tijolo à vista no fundo da laje.
      put(-tankAlong * 0.6, top + 3, -depth * 0.78, width * 0.42, 24, depth * 0.36, "#b5643c");
    } else if (random() < 0.6) {
      // Varal com roupa colorida.
      const [ax, az] = facadePoint(facade, -width / 2 + 6, -depth * 0.38);
      const [bx, bz] = facadePoint(facade, width / 2 - 6, -depth * 0.38);
      parts.block(parts.scenery, ax, top + 3, az, 1, 17, 1, "#7a7a7a");
      parts.block(parts.scenery, bx, top + 3, bz, 1, 17, 1, "#7a7a7a");
      parts.wire(parts.scenery, new THREE.Vector3(ax, top + 19, az), new THREE.Vector3(bx, top + 19, bz), 1.5, 0.35, "#d0d0d0", 3);
      for (let index = 0; index < 5; index += 1) {
        const t = (index + 0.7) / 6;
        put(-width / 2 + 6 + t * (width - 12), top + 11.5, -depth * 0.38, 6, 7.5, 0.5, parts.pick(CLOTHES));
      }
    }
    for (let index = 0; index < (spec.lajeFans ?? 0); index += 1) {
      const [fx, fz] = facadePoint(facade, (random() - 0.5) * (width - 14), -5 - random() * 6);
      parts.neighbour(fx, top + 3, fz);
    }
  }
  return top;
}

/** Postinho de concreto com braço para a rua e luminária (acesa só se `lit`). */
function streetLamp(parts: StreetParts, x: number, ground: number, z: number, towardX: number, lit: boolean) {
  parts.piece(parts.solid, parts.cylinder, x, ground + 60, z, 3.4, 120, 3.4, "#a3a29b", 0, 0, 0, STONE_FINISH);
  const arm = new THREE.Vector3(x + towardX * 26, ground + 122, z);
  parts.rod(parts.solid, new THREE.Vector3(x, ground + 114, z), arm, 1.3, "#8d8c86", METAL_FINISH);
  if (lit) parts.lamp(arm.x, arm.y - 1.6, arm.z, 9, 2, 5, "#ffe2a8");
  else parts.piece(parts.solid, parts.box, arm.x, arm.y - 1.6, arm.z, 9, 2.4, 5, "#e6e3d8", 0, 0, 0, BULB_OFF_FINISH);
  parts.occupy(x, z, 5);
}

/**
 * Tabelas de rua: o mesmo volume de sempre (a bola quica aqui), com a cara
 * da variação: meio-fio de concreto, tábuas de madeira com estacas ou mureta
 * pintada. `outX`/`outZ` = para onde fica o lado de fora.
 */
function streetRail(parts: StreetParts, variant: BotaoStreetVariant, x: number, z: number, width: number, depth: number, outX: number, outZ: number) {
  const rails = parts.solid;
  if (variant === 0) {
    parts.block(rails, x, 0, z, width, RAIL_HEIGHT, depth, "#b9b6ad", 0, STONE_FINISH);
    return;
  }
  if (variant === 1) {
    parts.block(rails, x, 0, z, width, 3.4, depth, "#8a5a32", 0, WOOD_FINISH);
    parts.block(rails, x, 3.6, z, width, RAIL_HEIGHT - 3.6, depth, "#7b4f2c", 0, WOOD_FINISH);
    parts.block(rails, x, 3.4, z, width * 0.9, 0.2, depth * 0.9, "#3a2414", 0, WOOD_FINISH);
    // Estacas por fora, a cada ~38: seguram as tábuas sem entrar no campo.
    const length = Math.max(width, depth);
    const count = Math.max(2, Math.round(length / 38) + 1);
    for (let index = 0; index < count; index += 1) {
      const t = index / (count - 1) - 0.5;
      // Folga de 6 nas pontas: a estaca não encosta na trave nem no canto.
      const along = t * (length - 12);
      const px = width > depth ? x + along : x + outX * 2.8;
      const pz = width > depth ? z + outZ * 2.8 : z + along;
      parts.block(rails, px, 0, pz, 2.4, 9.5, 2.4, "#5e3d22", 0, WOOD_FINISH);
    }
    return;
  }
  parts.block(rails, x, 0, z, width, 1.2, depth, "#565b60", 0, PAINT_FINISH);
  parts.block(rails, x, 1.2, z, width, 4.2, depth, "#e3dccb", 0, PAINT_FINISH);
  parts.block(rails, x, 5.4, z, width, RAIL_HEIGHT - 5.4, depth, "#f2c14e", 0, PAINT_FINISH);
}

// ------------------------------------------------------- rua do bairro (dia)

function buildBairro(parts: StreetParts) {
  const { random } = parts;
  const asphalt = "#4a4d52";
  const crossNear = -322;
  const crossFar = -402;
  // Chão: a rua continua depois do campo, a transversal fecha o fundo em T.
  parts.floor(-RAIL_OUT, crossNear, RAIL_OUT, -HALF_H + 1, -0.08, asphalt);
  parts.floor(-RAIL_OUT, HALF_H - 1, RAIL_OUT, 1500, -0.08, asphalt);
  parts.floor(-1500, crossFar, 1500, crossNear, -0.08, asphalt);
  addFrame(parts.ground, RAIL_OUT, HALF_H, FLOOR_HALF, FLOOR_HALF, -0.6, "#5a554c");
  // Faixa dupla amarela continuando fora do campo, gasta, e a linha de PARE.
  for (const [from, to] of [[HALF_H, 1500], [crossNear, -HALF_H]] as const) {
    for (let z = from; z < to; z += 26) {
      for (const x of [-3.2, 3.2]) parts.floor(x - 0.8, z, x + 0.8, Math.min(to, z + 18), 0.02, "#b49a4e");
    }
  }
  parts.floor(-RAIL_OUT, crossNear - 9, 0, crossNear - 5, 0.02, "#d7d5cd");

  // Meio-fio além das tabelas, até as esquinas.
  for (const side of [-1, 1]) {
    const x = side * (HALF_W + 0.3 + RAIL_THICKNESS / 2);
    parts.block(parts.scenery, x, -0.6, (crossNear - HALF_H - 3) / 2, RAIL_THICKNESS, SIDEWALK_TOP + 0.6, -HALF_H - 3 - crossNear, "#b9b6ad");
    parts.block(parts.scenery, x, -0.6, (HALF_H + 3 + 760) / 2, RAIL_THICKNESS, SIDEWALK_TOP + 0.6, 760 - HALF_H - 3, "#b9b6ad");
  }

  // Duas fileiras de casas, da esquina até o fim da rua. Calçada de cada casa
  // com o piso que o dono escolheu (no Brasil cada um faz a sua).
  const shops: Array<{ side: number; z: number }> = [{ side: -1, z: 70 }, { side: 1, z: -80 }];
  for (const side of [-1, 1]) {
    let z = crossNear;
    let previous = "";
    while (z < 760) {
      const width = 46 + Math.floor(random() * 30);
      const gap = random() < 0.2 ? 4 : 0;
      const center = z + width / 2;
      const facade: Facade = { x: side * 206, z: center, yaw: -side * (Math.PI / 2) };
      parts.block(parts.scenery, side * (RAIL_OUT + 206) / 2, -0.6, z + (width + gap) / 2, 206 - RAIL_OUT, SIDEWALK_TOP + 0.6, width + gap, parts.pick(SIDEWALK_COLORS));
      let wall = parts.pick(WALL_COLORS);
      if (wall === previous) wall = parts.pick(WALL_COLORS);
      previous = wall;
      const shop = shops.find((entry) => entry.side === side && Math.abs(entry.z - center) < width / 2);
      const near = Math.abs(center) < 330;
      buildHouse(parts, facade, SIDEWALK_TOP, {
        width: width - 1,
        depth: 64,
        floors: random() < 0.38 ? 2 : 1,
        roof: random() < 0.48 ? "laje" : "tile",
        wall,
        shop: shop ? (side < 0 ? "bar" : "mercado") : undefined,
        garage: random() < 0.35,
        lajeFans: near ? 1 + Math.floor(random() * 3) : 0,
      });
      if (shop) {
        if (side < 0) {
          parts.barTable(side * 176, SIDEWALK_TOP, center + 4, "#d62828");
          parts.dog(side * 168, SIDEWALK_TOP, center + 30, Math.PI / 2 + 0.4);
          parts.block(parts.scenery, side * 198, SIDEWALK_TOP, center - 20, 9, 6, 7, "#c0392b");
          parts.block(parts.scenery, side * 198, SIDEWALK_TOP + 6, center - 20, 9, 6, 7, "#f1c40f");
          parts.occupy(side * 198, center - 20, 6);
        } else {
          parts.crates(side * 184, SIDEWALK_TOP, center, Math.PI / 2);
        }
      }
      z += width + gap;
    }
  }

  // Fileira do fundo (do outro lado da transversal) com um terreno baldio no
  // meio: muro grafitado virado para o campo.
  parts.block(parts.scenery, 0, -0.6, crossFar - 20, 1400, SIDEWALK_TOP + 0.6, 40, "#a9a59c");
  parts.block(parts.scenery, 0, SIDEWALK_TOP, crossFar - 44, 144, 34, 6, "#d8d2c4");
  parts.block(parts.scenery, 0, SIDEWALK_TOP + 34, crossFar - 44, 146, 2, 7, "#b8b2a4");
  parts.muralPlane("craque", -28, SIDEWALK_TOP + 18, crossFar - 40.8, 0, 72);
  parts.muralPlane("tags", 44, SIDEWALK_TOP + 16, crossFar - 40.8, 0, 46);
  for (const [start, end] of [[-640, -72], [72, 640]] as const) {
    for (let x = start; end - x >= 30;) {
      const width = Math.min(end - x, 50 + Math.floor(random() * 28));
      const center = x + width / 2;
      buildHouse(parts, { x: center, z: crossFar - 40, yaw: 0 }, SIDEWALK_TOP, {
        width: width - 1,
        depth: 60,
        floors: random() < 0.45 ? 2 : 1,
        roof: random() < 0.5 ? "laje" : "tile",
        wall: parts.pick(WALL_COLORS),
        garage: random() < 0.3,
        lajeFans: Math.abs(center) < 260 ? Math.floor(random() * 2) : 0,
      });
      x += width;
    }
  }

  // Postes com fiação de um lado, iluminação do outro (apagados: é de tarde).
  const poles = [-280, -40, 200, 440, 680];
  for (const z of poles) streetLamp(parts, -199, SIDEWALK_TOP, z, 1, false);
  for (const z of [-150, 330]) streetLamp(parts, 199, SIDEWALK_TOP, z, -1, false);
  for (let index = 0; index + 1 < poles.length; index += 1) {
    for (const [dy, sag] of [[112, 7], [107, 9], [101, 6]] as const) {
      parts.wire(parts.scenery, new THREE.Vector3(-199, SIDEWALK_TOP + dy, poles[index]), new THREE.Vector3(-199, SIDEWALK_TOP + dy, poles[index + 1]), sag, 0.45, "#1d1e20");
    }
  }
  // "Gato" atravessando a rua: um fio do poste até a casa da frente.
  parts.wire(parts.scenery, new THREE.Vector3(-199, SIDEWALK_TOP + 104, 440), new THREE.Vector3(206, SIDEWALK_TOP + 70, 470), 18, 0.4, "#1d1e20", 7);

  // Bandeirinhas: atravessando a rua depois dos gols e correndo pelas calçadas.
  for (const z of [-290, 282, 338, 398, 470]) {
    parts.strings.push({ from: new THREE.Vector3(-205, 78, z), to: new THREE.Vector3(205, 78, z + (random() - 0.5) * 16), sag: 15 + random() * 6 });
  }
  for (const side of [-1, 1]) {
    for (let z = -300; z < 300; z += 150) {
      parts.strings.push({ from: new THREE.Vector3(side * 192, 70, z), to: new THREE.Vector3(side * 192, 70, z + 150), sag: 7 });
    }
  }

  parts.tree(188, SIDEWALK_TOP, 140, 1.05, true);
  parts.tree(-188, SIDEWALK_TOP, -150, 1);
  parts.car(122, 318, 0, "#d9d4c7");
  parts.car(-122, 470, Math.PI, "#c0392b");
  parts.car(-250, -362, Math.PI / 2, "#2e86de");
  parts.car(310, -378, -Math.PI / 2, "#f1c40f");
  parts.car(124, 620, 0, "#7f8c8d");
  // Lixeiras.
  parts.block(parts.scenery, -166, SIDEWALK_TOP, -64, 8, 11, 8, "#2e7d32");
  parts.block(parts.scenery, 166, SIDEWALK_TOP, 236, 8, 11, 8, "#e67e22");
  parts.occupy(-166, -64, 6);
  parts.occupy(166, 236, 6);

  // Vizinhos: calçadas dos dois lados (mais gente perto do campo), na
  // calçada da transversal e no asfalto atrás do gol de baixo.
  for (const side of [-1, 1]) {
    for (let z = -305; z < 430; z += 12) {
      const chance = Math.abs(z) < HALF_H + 20 ? 0.62 : 0.3;
      if (random() > chance) continue;
      parts.neighbour(side * (162 + random() * 34), SIDEWALK_TOP, z + (random() - 0.5) * 6);
    }
  }
  for (let x = -170; x < 170; x += 15) if (random() < 0.5) parts.neighbour(x + (random() - 0.5) * 6, SIDEWALK_TOP, crossFar - 10 - random() * 18);
  for (let x = -146; x < 146; x += 13) {
    if (Math.abs(x) < 56 || random() < 0.4) continue;
    parts.neighbour(x, 0, HALF_H + 34 + random() * 26);
  }
}

// -------------------------------------------------------- terrão (pôr do sol)

function buildTerrao(parts: StreetParts) {
  const { random } = parts;
  const dirt = "#c9976c";
  // Capim meio seco: no pôr do sol a luz laranja já puxa para o dourado.
  const grass = "#7f9c48";
  addFrame(parts.ground, HALF_W - 1, HALF_H - 1, 214, 304, -0.08, dirt);
  addFrame(parts.ground, 213, 303, FLOOR_HALF, FLOOR_HALF, -0.6, grass);
  // Trilha de terra até o bar e terra pisada em volta das árvores.
  parts.floor(-300, 92, -213, 152, -0.3, dirt);

  // Muro de reboco atrás do gol de cima, com tijolo aparecendo e grafite.
  const wallZ = -318;
  parts.block(parts.scenery, 0, -0.6, wallZ, 460, 35, 6, "#d9cdb5");
  parts.block(parts.scenery, 0, 34, wallZ, 462, 2.2, 7, "#bdb3a0");
  parts.block(parts.scenery, 0, -0.6, wallZ + 3.1, 460, 5.6, 0.3, "#9b8f78");
  for (let index = 0; index < 9; index += 1) {
    const x = -210 + random() * 420;
    const y = 6 + random() * 22;
    for (let brick = 0; brick < 4; brick += 1) {
      parts.block(parts.scenery, x + (brick % 2) * 7 + (random() - 0.5) * 2, y + Math.floor(brick / 2) * 3.6, wallZ + 3.15, 6.4, 3.1, 0.5, parts.pick(["#a4573a", "#b5643c", "#94492f"]));
    }
  }
  parts.muralPlane("futbobo", -112, 17, wallZ + 3.3, 0, 116);
  parts.muralPlane("terrao", 96, 17, wallZ + 3.3, 0, 108);
  parts.muralPlane("tags", 194, 15, wallZ + 3.3, 0, 40);
  parts.muralPlane("jersey", -196, 16, wallZ + 3.3, 0, 46);
  for (const x of [-182, -150, 148, 188]) parts.neighbour(x, 36.2, wallZ);

  // Cerca de madeira nos lados (aberta na frente do bar).
  for (const side of [-1, 1]) {
    for (let z = -300; z <= 300; z += 30) {
      if (side < 0 && z > 60 && z < 180) continue;
      parts.block(parts.scenery, side * 224, -0.6, z, 2.6, 23, 2.6, "#6f5638");
      if (z + 30 <= 300 && !(side < 0 && z + 30 > 60 && z < 180)) {
        for (const y of [8, 17]) parts.block(parts.scenery, side * 224, y, z + 15, 1, 2.6, 30, parts.pick(["#8b6b4a", "#7d5f40", "#967552"]));
      }
    }
  }
  // Bancos de reserva.
  for (const side of [-1, 1]) {
    for (const z of [-46, 46]) {
      parts.block(parts.scenery, side * 186, 7, z, 8, 2, 38, "#9a6b3f");
      for (const dz of [-15, 15]) parts.block(parts.scenery, side * 186, -0.6, z + dz, 6, 7.6, 2, "#6e4a2a");
      parts.occupy(side * 186, z, 18);
    }
  }

  // Boteco de tijolo pintado, telhado de barro, mesas de plástico e gambiarra de lâmpadas.
  const bar: Facade = { x: -262, z: 122, yaw: Math.PI / 2 };
  const barTop = buildHouse(parts, bar, 0, { width: 72, depth: 50, floors: 1, roof: "tile", wall: "#3fae8b", shop: "bar" });
  parts.barTable(-232, 0, 98, "#f1c40f");
  parts.barTable(-226, 0, 146, "#f1c40f");
  for (let index = 0; index < 3; index += 1) {
    parts.block(parts.scenery, -246, index * 6, 162, 9, 6, 7, index % 2 === 0 ? "#c0392b" : "#f1c40f");
  }
  parts.occupy(-246, 162, 6);

  // Postes de madeira com fiação barriguda e uma lâmpada no do bar.
  const poles = [-420, -150, 100, 350];
  for (const z of poles) {
    parts.piece(parts.solid, parts.cylinder, -330, 55, z, 3.6, 110, 3.6, "#6b4f36", 0, 0, 0, WOOD_FINISH);
    parts.block(parts.solid, -330, 104, z, 26, 2.2, 2.2, "#5a4330", 0, WOOD_FINISH);
    parts.occupy(-330, z, 5);
  }
  for (let index = 0; index + 1 < poles.length; index += 1) {
    for (const dx of [-11, 0, 11]) {
      parts.wire(parts.scenery, new THREE.Vector3(-330 + dx, 106.4, poles[index]), new THREE.Vector3(-330 + dx, 106.4, poles[index + 1]), 12 + random() * 4, 0.45, "#1d1e20", 6);
    }
  }
  parts.wire(parts.scenery, new THREE.Vector3(-330, 104, 100), new THREE.Vector3(-262, barTop + 8, 110), 9, 0.4, "#1d1e20");
  parts.block(parts.solid, -326, 86, 100, 8, 1.6, 1.6, "#4a4a4a", 0, METAL_FINISH);
  parts.lamp(-321, 84, 100, 4, 3, 4, "#ffd89a");
  const bulbs = (from: THREE.Vector3, to: THREE.Vector3, sag: number) => {
    parts.wire(parts.scenery, from, to, sag, 0.35, "#2a2a2a", 6);
    for (let index = 1; index < 12; index += 1) {
      const t = index / 12;
      const p = new THREE.Vector3().lerpVectors(from, to, t);
      p.y -= sag * 4 * t * (1 - t) + 1.6;
      parts.light(p.x, p.y, p.z, 1.8, 2.4, 1.8, "#ffcf7a", 1.9);
    }
  };
  // Dois mastros de madeira na boca da cerca seguram a gambiarra que sai do telhado do bar.
  for (const z of [60, 180]) parts.block(parts.scenery, -222, -0.6, z, 2.4, 48, 2.4, "#6f5638");
  bulbs(new THREE.Vector3(-261, 47, 98), new THREE.Vector3(-222, 46, 180), 8);
  bulbs(new THREE.Vector3(-261, 47, 146), new THREE.Vector3(-222, 46, 60), 9);

  // Árvores, pneus pintados meio enterrados nos cantos e uma pilha de pneus.
  const trees: Array<[number, number, number]> = [[-258, -232, 1.1], [262, -214, 1], [300, 250, 1.25], [-300, 318, 1.1], [24, 372, 1.3], [-120, -392, 1], [170, -402, 0.95], [-372, -40, 1.2]];
  for (const [x, z, scale] of trees) parts.tree(x, 0, z, scale);
  const paints = ["#e63946", "#ffd23f", "#2a9d8f", "#f4f1de", "#3a86ff"];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (let index = 0; index < 3; index += 1) {
        const x = sx * (HALF_W + 16 + index * 13);
        const z = sz * (HALF_H + 12);
        parts.piece(parts.scenery, parts.tire, x, 1, z, 5, 5, 5, paints[(index + (sx > 0 ? 1 : 0) + (sz > 0 ? 2 : 0)) % paints.length], 0, 0, 0);
        parts.occupy(x, z, 6);
      }
    }
  }
  for (let index = 0; index < 4; index += 1) parts.piece(parts.scenery, parts.tire, 212, 2.3 + index * 4.5, 276, 6, 6, 6, "#1d1e20", 0, Math.PI / 2, 0);
  parts.occupy(212, 276, 8);
  // Tufos de capim em volta do terrão.
  const tufts = ["#7f9a3e", "#9aa64a", "#6a8a34", "#b6b05a"];
  for (let index = 0; index < 170; index += 1) {
    const angle = random() * Math.PI * 2;
    const ring = 1 + random() * 0.35;
    const x = Math.max(-420, Math.min(420, Math.cos(angle) * 230 * ring));
    const z = Math.max(-420, Math.min(420, Math.sin(angle) * 330 * ring));
    if (Math.abs(x) < 206 && Math.abs(z) < 300) continue;
    const height = 3 + random() * 5;
    parts.piece(parts.scenery, parts.cone, x, height / 2 - 0.5, z, 4 + random() * 4, height, 4 + random() * 4, parts.pick(tufts), random() * Math.PI);
  }

  // Vizinhos: atrás das cercas, em volta do bar, atrás do gol de baixo.
  for (const side of [-1, 1]) {
    for (let z = -290; z < 296; z += 15) {
      if (random() > 0.6) continue;
      parts.neighbour(side * (232 + random() * 18), 0, z + (random() - 0.5) * 6);
    }
  }
  for (let index = 0; index < 9; index += 1) parts.neighbour(-238 + random() * 40, 0, 78 + random() * 96);
  for (let x = -180; x < 180; x += 16) if (random() < 0.55) parts.neighbour(x, 0, HALF_H + 70 + random() * 26);
  for (let x = -200; x < 200; x += 18) if (random() < 0.4) parts.neighbour(x, 0, wallZ + 14 + random() * 10);
}

// ------------------------------------------------------ quadra da praça (noite)

function buildPraca(parts: StreetParts) {
  const { random } = parts;
  const fenceX = 184;
  const fenceZ = 268;
  addFrame(parts.ground, HALF_W - 1, HALF_H - 1, fenceX + 2, fenceZ + 2, -0.08, "#8e3e30");
  addFrame(parts.ground, fenceX + 1, fenceZ + 1, 340, 430, -0.3, "#8a877f");
  // Rua em volta da praça, com postes de luz amarela e carros parados.
  addFrame(parts.ground, 340, 430, 404, 494, -0.3, "#3a3d42");
  addFrame(parts.ground, 403, 493, FLOOR_HALF, FLOOR_HALF, -0.6, "#2b3427");
  for (const side of [-1, 1]) {
    for (const z of [-360, -120, 120, 360]) streetLamp(parts, side * 410, 0, z, -side, true);
  }
  parts.car(372, -210, 0, "#c0392b");
  parts.car(-372, 170, Math.PI, "#d9d4c7");
  parts.car(150, 462, Math.PI / 2, "#2e86de");
  parts.car(-230, -462, -Math.PI / 2, "#7f8c8d");

  // Alambrado: tela (malha à parte, alphaTest) e tubos de aço no `solid`.
  const height = 64;
  const corners: Array<[number, number]> = [[-fenceX, -fenceZ], [fenceX, -fenceZ], [fenceX, fenceZ], [-fenceX, fenceZ]];
  for (let index = 0; index < 4; index += 1) {
    const [x0, z0] = corners[index];
    const [x1, z1] = corners[(index + 1) % 4];
    parts.fence.push({ x0, z0, x1, z1, height });
    const length = Math.hypot(x1 - x0, z1 - z0);
    const posts = Math.round(length / 46);
    for (let post = 0; post < posts; post += 1) {
      const t = post / posts;
      parts.piece(parts.solid, parts.cylinder, x0 + (x1 - x0) * t, height / 2 + 1, z0 + (z1 - z0) * t, 2.4, height + 2, 2.4, "#7d868c", 0, 0, 0, METAL_FINISH);
    }
    parts.rod(parts.solid, new THREE.Vector3(x0, height, z0), new THREE.Vector3(x1, height, z1), 1.6, "#8d969c", METAL_FINISH);
    parts.rod(parts.solid, new THREE.Vector3(x0, 1, z0), new THREE.Vector3(x1, 1, z1), 1.2, "#6d757a", METAL_FINISH);
  }

  // Refletores: seis postes com duas luminárias mirando o meio da quadra.
  const aim = new THREE.Object3D();
  for (const [x, z] of [[-198, -282], [198, -282], [-198, 282], [198, 282], [-198, 0], [198, 0]] as const) {
    parts.piece(parts.solid, parts.cylinder, x, 75, z, 4, 150, 4, "#5d666d", 0, 0, 0, METAL_FINISH);
    parts.block(parts.solid, x, 146, z, 3, 2.4, 30, "#4d555b", 0, METAL_FINISH);
    for (const dz of [-10, 10]) {
      aim.position.set(x - Math.sign(x) * 3, 151, z + dz);
      aim.lookAt(0, 0, z * 0.4);
      const euler = new THREE.Euler().setFromQuaternion(aim.quaternion, "YXZ");
      parts.lamp(aim.position.x, aim.position.y, aim.position.z, 12, 8, 3, "#f4f6ff", euler.y, euler.x);
    }
    parts.occupy(x, z, 6);
  }

  // Muros grafitados: atrás do gol de cima e na lateral esquerda da praça.
  const wallZ = -318;
  parts.block(parts.scenery, 0, -0.6, wallZ, 420, 39, 6, "#9d9a92");
  parts.block(parts.scenery, 0, 38, wallZ, 422, 2, 7, "#86837c");
  parts.muralPlane("futbobo", -112, 19, wallZ + 3.2, 0, 124);
  parts.muralPlane("varzea", 100, 19, wallZ + 3.2, 0, 118);
  parts.muralPlane("tags", 186, 16, wallZ + 3.2, 0, 40);
  parts.muralPlane("tags", -190, 16, wallZ + 3.2, 0, 36);
  const sideWallX = -300;
  parts.block(parts.scenery, sideWallX, -0.6, 0, 6, 35, 380, "#a29c90");
  parts.block(parts.scenery, sideWallX, 34, 0, 7, 2, 382, "#8b867c");
  parts.muralPlane("craque", sideWallX + 3.2, 17, -86, Math.PI / 2, 110);
  parts.muralPlane("jersey", sideWallX + 3.2, 17, 40, Math.PI / 2, 76);
  parts.muralPlane("tags", sideWallX + 3.2, 15, 136, Math.PI / 2, 56);
  for (const x of [-160, -120, 132, 172]) parts.neighbour(x, 40, wallZ);

  // Prédios em volta, com janelas acesas (quentes, frias, de TV) no `glow`.
  // Longe o bastante (raio > 640) para a câmera girada nunca ficar atrás de um.
  const blocks: Array<[number, number, number, number, number, string]> = [
    [-470, -660, 200, 90, 300, "#c9b9a6"],
    [-60, -800, 220, 90, 360, "#a7b4bd"],
    [380, -720, 180, 90, 260, "#d8c7a2"],
    [800, -260, 90, 200, 300, "#9e8f84"],
    [-780, 160, 90, 220, 320, "#bfc6b0"],
    [720, 560, 140, 140, 240, "#b9a99a"],
    [-300, 840, 220, 90, 260, "#a9a2b8"],
  ];
  for (const [x, z, w, d, h, color] of blocks) {
    parts.block(parts.scenery, x, -0.6, z, w, h, d, color);
    parts.block(parts.scenery, x, h - 0.6, z, w + 2, 3, d + 2, shadeHex(color, -30));
    parts.block(parts.scenery, x + w * 0.2, h + 2, z, 24, 14, 18, "#8c8f93");
    // As duas fachadas viradas para a quadra.
    const faces: Array<{ nx: number; nz: number; width: number }> = [
      { nx: 0, nz: -Math.sign(z) || 1, width: w },
      { nx: -Math.sign(x) || 1, nz: 0, width: d },
    ];
    for (const face of faces) {
      const cx = x + face.nx * (w / 2 + 0.4);
      const cz = z + face.nz * (d / 2 + 0.4);
      const yaw = Math.atan2(face.nx, face.nz);
      const columns = Math.floor((face.width - 16) / 18);
      for (let floor = 0; floor * 26 + 30 < h - 10; floor += 1) {
        const y = 16 + floor * 26;
        parts.block(parts.scenery, cx - face.nx * 0.2, y + 17, cz - face.nz * 0.2, face.nz !== 0 ? face.width + 1 : 1.6, 1.4, face.nx !== 0 ? face.width + 1 : 1.6, shadeHex(color, 22));
        for (let column = 0; column < columns; column += 1) {
          const along = (column - (columns - 1) / 2) * 18;
          const wx = cx + Math.cos(yaw) * along;
          const wz = cz - Math.sin(yaw) * along;
          const roll = random();
          if (roll < 0.42) parts.light(wx, y + 6, wz, 8, 11, 0.4, roll < 0.3 ? "#ffd18a" : roll < 0.37 ? "#a8d0ff" : "#d4b0ff", roll < 0.3 ? 1.25 : 1.05, yaw);
          else parts.light(wx, y + 6, wz, 8, 11, 0.4, "#1e2530", 1, yaw);
        }
      }
    }
  }

  // Praça: bancos de concreto, árvore, lixeira e o carrinho de pipoca aceso.
  for (const [x, z, yaw] of [[-214, -130, 0], [-214, 130, 0], [214, -160, 0], [214, 120, 0], [-90, 294, Math.PI / 2], [90, 294, Math.PI / 2]] as const) {
    parts.block(parts.scenery, x, -0.6, z, 10, 8.6, 40, "#b5b0a6", yaw);
    parts.occupy(x, z, 16);
  }
  parts.tree(-262, -0.3, 214, 1.35);
  parts.tree(256, -0.3, -214, 1.1);
  parts.block(parts.scenery, 214, -0.3, 20, 8, 11, 8, "#2e7d32");
  parts.occupy(214, 20, 6);
  const cart = { x: 232, z: 196 };
  parts.block(parts.scenery, cart.x, 6, cart.z, 14, 14, 24, "#c0392b");
  for (const dz of [-6, 0, 6]) parts.block(parts.scenery, cart.x, 6, cart.z + dz, 14.4, 14, 2.4, "#f4f1de");
  parts.light(cart.x, 26, cart.z, 12, 10, 20, "#fff1b8", 1.35);
  parts.block(parts.scenery, cart.x, 31, cart.z, 18, 1.6, 28, "#f4f1de");
  for (const dz of [-10, 10]) parts.piece(parts.scenery, parts.cylinder, cart.x + 7.5, 4, cart.z + dz, 8, 2, 8, "#1d1e20", 0, 0, Math.PI / 2);
  parts.occupy(cart.x, cart.z, 16);

  // Vizinhos: encostados no alambrado por fora, nos fundos e em cima do muro.
  for (const side of [-1, 1]) {
    for (let z = -256; z < 256; z += 14) {
      if (random() > 0.55) continue;
      parts.neighbour(side * (192 + random() * 22), 0, z + (random() - 0.5) * 5);
    }
  }
  for (let x = -170; x < 170; x += 14) {
    if (random() < 0.55) parts.neighbour(x + (random() - 0.5) * 5, 0, -(fenceZ + 10 + random() * 22));
    if (random() < 0.45) parts.neighbour(x + (random() - 0.5) * 5, 0, fenceZ + 10 + random() * 16);
  }
}

/**
 * Modo desempenho (sem torcida animada): metade dos vizinhos vira boneco de
 * caixas parado no `scenery`, para a rua não parecer abandonada. Custa só
 * vértices na malha que já existe.
 */
function bakeStillNeighbours(parts: StreetParts, setup: BotaoMatchSetup) {
  const random = parts.random;
  const s = STREET_FAN_SCALE;
  parts.fans.forEach((fan, index) => {
    if (index % 2 === 1) return;
    const team = fan.side === "user" ? setup.userTeam : setup.cpuTeam;
    const roll = random();
    const shirt = roll < 0.35 ? team.primary : roll < 0.45 ? team.secondary : parts.pick(STREET_NEUTRALS);
    const c = Math.cos(fan.yaw);
    const sn = Math.sin(fan.yaw);
    const hip = fan.y;
    const ground = hip - FAN_LEG * s;
    for (const side of [-1.3, 1.3]) parts.block(parts.scenery, fan.x + c * side * s, ground, fan.z - sn * side * s, 2.1 * s, FAN_LEG * s, 2.3 * s, "#1f2a3d", fan.yaw);
    parts.block(parts.scenery, fan.x, hip, fan.z, 5.2 * s, 7 * s, 3.6 * s, shirt, fan.yaw);
    for (const side of [-3.3, 3.3]) parts.block(parts.scenery, fan.x + c * side * s, hip + 1 * s, fan.z - sn * side * s, 1.4 * s, 5.6 * s, 1.4 * s, shirt, fan.yaw);
    parts.block(parts.scenery, fan.x, hip + 7 * s, fan.z, 4.2 * s, 4.2 * s, 4.2 * s, parts.pick(SKINS), fan.yaw);
  });
}

type StreetScene = {
  objects: THREE.Object3D[];
  layout: CrowdLayout;
  bunting: Bunting | null;
  /** Materiais com alphaTest que viram alpha-to-coverage quando há MSAA (alambrado). */
  cutouts: THREE.MeshLambertMaterial[];
  /** Texturas de canvas para subir e soltar da RAM no `prepare`. */
  textures: THREE.CanvasTexture[];
};

/**
 * Monta o bairro de uma variação. As tabelas (e postes, refletores, tubos)
 * entram no `rails` do estádio; o resto vira até cinco malhas: chão com
 * ladrilho, cenário com cor por vértice, luzes sem luz (janelas, lâmpadas),
 * grafites e alambrado. Bandeirinhas e vizinhos voltam para o estádio animar.
 */
function buildStreetScene(setup: BotaoMatchSetup, variant: BotaoStreetVariant, rails: Baker, options: { lite: boolean; calm: boolean; anisotropy: number; finishes: boolean }): StreetScene {
  const random = seeded(setup.seed ^ 0x57ee7 ^ (variant * 0x1000193));
  const atlas = muralAtlas(options.anisotropy, setup.seed);
  const parts = new StreetParts(random, rails, atlas, options.finishes);
  // Tabelas: mesmas posições e altura de sempre, só a cara muda.
  const sideLength = FIELD.height + RAIL_THICKNESS * 2;
  for (const side of [-1, 1]) streetRail(parts, variant, side * (HALF_W + RAIL_THICKNESS / 2 + 0.3), 0, RAIL_THICKNESS, sideLength, side, 0);
  const endSegment = GOAL_LEFT - 1.8;
  for (const sign of [-1, 1]) {
    const z = sign * (HALF_H + RAIL_THICKNESS / 2 + 0.3);
    streetRail(parts, variant, -HALF_W + endSegment / 2, z, endSegment, RAIL_THICKNESS, 0, sign);
    streetRail(parts, variant, HALF_W - endSegment / 2, z, endSegment, RAIL_THICKNESS, 0, sign);
  }
  if (variant === 0) buildBairro(parts);
  else if (variant === 1) buildTerrao(parts);
  else buildPraca(parts);
  if (options.lite) bakeStillNeighbours(parts, setup);

  const objects: THREE.Object3D[] = [];
  const textures: THREE.CanvasTexture[] = [atlas.texture];
  const cutouts: THREE.MeshLambertMaterial[] = [];

  const tile = groundTileTexture(variant, options.anisotropy);
  textures.push(tile);
  const groundGeometry = parts.ground.geometry();
  // UV planar em unidades do mundo: o ladrilho emenda entre todos os pedaços de chão.
  const position = groundGeometry.getAttribute("position");
  const uv = groundGeometry.getAttribute("uv") as THREE.BufferAttribute | undefined;
  if (uv) for (let index = 0; index < position.count; index += 1) uv.setXY(index, position.getX(index) / GROUND_TILE[variant], position.getZ(index) / GROUND_TILE[variant]);
  const ground = new THREE.Mesh(groundGeometry, new THREE.MeshLambertMaterial({ map: tile, vertexColors: true }));
  ground.receiveShadow = !options.lite;
  ground.renderOrder = 1;
  objects.push(ground);

  const scenery = parts.scenery.build(new THREE.MeshLambertMaterial({ vertexColors: true }));
  scenery.renderOrder = 0.5;
  objects.push(scenery);

  const glowGeometry = parts.glow.geometry();
  if (glowGeometry.getAttribute("position")) objects.push(new THREE.Mesh(glowGeometry, new THREE.MeshBasicMaterial({ vertexColors: true })));
  else glowGeometry.dispose();

  const muralGeometry = parts.mural.geometry();
  if (muralGeometry.getAttribute("position")) objects.push(new THREE.Mesh(muralGeometry, new THREE.MeshLambertMaterial({ map: atlas.texture, alphaTest: 0.5 })));
  else muralGeometry.dispose();

  if (parts.fence.length > 0) {
    const fenceMap = fenceTexture(options.anisotropy);
    textures.push(fenceMap);
    const fenceMaterial = new THREE.MeshLambertMaterial({ alphaMap: fenceMap, color: "#aeb6bb", alphaTest: 0.35, side: THREE.DoubleSide });
    cutouts.push(fenceMaterial);
    objects.push(new THREE.Mesh(fenceGeometry(parts.fence), fenceMaterial));
  }

  let bunting: Bunting | null = null;
  if (parts.strings.length > 0) {
    bunting = new Bunting(parts.strings, random, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), options.calm);
    objects.push(bunting.mesh);
  }
  parts.dispose();
  return {
    objects,
    layout: { fans: parts.fans, random, street: true, scale: STREET_FAN_SCALE, teamShare: 0.55, neutrals: STREET_NEUTRALS },
    bunting,
    cutouts,
    textures,
  };
}

// ---------------------------------------------------------------- estádio

/** Três pulsos curtos nas torres, casados com as piscadas acesas das placas (2.5 Hz). */
function lampPulses(t: number) {
  let total = 0;
  for (let index = 0; index < 3; index += 1) {
    const d = (t - 0.1 - index * 0.4) / 0.06;
    total += Math.exp(-d * d);
  }
  return total;
}

export class Stadium {
  readonly group = new THREE.Group();
  private readonly setup: BotaoMatchSetup;
  private readonly calm: boolean;
  private readonly anisotropy: number;
  private readonly goals: Record<"top" | "bottom", GoalView>;
  /** Sem torcida nem flashes no modo desempenho: os métodos da festa só mexem nas placas. */
  private readonly crowd: Crowd | null;
  private readonly flashes: CameraFlashes | null;
  private readonly flags: CornerFlags | null;
  /** Bandeirinhas de festa junina (só na rua do bairro). */
  private readonly bunting: Bunting | null;
  private readonly netMaterial: THREE.MeshLambertMaterial;
  /** Rede e alambrado: alphaTest que vira alpha-to-coverage no `prepare` quando há MSAA. */
  private readonly cutouts: THREE.MeshLambertMaterial[];
  /** Placas de LED; null na rua (não há placa: gol e trave só mexem na torcida e nas lâmpadas). */
  private readonly ledMaterial: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial | null;
  /** Tabelas, traves, torres e refletores (o emissivo é o dos refletores); null no modo desempenho. */
  private readonly finishMaterial: THREE.MeshStandardMaterial | null;
  private readonly fieldMap: THREE.CanvasTexture;
  /** Canvas grandes (gramado, grafite) que o `prepare` solta da RAM depois de subir. */
  private readonly bakedCanvases: THREE.CanvasTexture[] = [];
  private readonly baseBoard: THREE.CanvasTexture | null;
  private readonly boards = new Map<string, THREE.CanvasTexture>();
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private boardMode: BoardMode = "base";
  private boardTexture: THREE.Texture | null;
  private boardT = 0;
  /** Céu, neblina e luzes desta partida (estádio de sempre ou a hora do dia da rua). */
  readonly mood: SceneMood;

  constructor(setup: BotaoMatchSetup, anisotropy: number, options: StadiumOptions = {}) {
    this.setup = setup;
    this.calm = Boolean(options.reducedMotion);
    // Modo desempenho 3D: fixo por estádio (trocar recria a visão).
    const lite = Boolean(options.performance);
    this.anisotropy = anisotropy;
    const theme = fieldThemeForMatch(setup);
    const futsal = isFutsalTheme(theme);
    const street = theme === "street";
    const streetVariant = streetVariantForMatch(setup);
    this.mood = sceneMoodForMatch(setup);
    const track = <T extends { dispose: () => void }>(item: T) => {
      this.disposables.push(item);
      return item;
    };
    // Um Lambert com cor por vértice pinta chão, degraus e fotógrafos (no modo
    // desempenho também tabelas, mastros e traves): um material, um programa.
    const paint = track(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.finishMaterial = lite ? null : track(finishMaterial());
    const solid = this.finishMaterial ?? paint;
    // Sombra dos opacos sem textura: o mapa de sombra só lê a profundidade.
    const depthOnly = lite ? null : track(new THREE.MeshDepthMaterial({ colorWrite: false }));

    // Chão: entorno em volta do campo e piso escuro em volta do entorno, em
    // molduras (nada pintado por baixo do gramado nem do entorno). É o último
    // opaco: o que já está na frente (gramado, arquibancada, bonecos) descarta
    // os pixels dele no teste de profundidade antes de iluminar.
    // Na rua o chão (com ladrilho) vem do bairro, montado mais abaixo.
    if (!street) {
      const ground = new Baker();
      addFrame(ground, HALF_W - 1, HALF_H - 1, APRON_HALF_W, APRON_HALF_H, -0.08, futsal ? FUTSAL_APRONS[theme] : "#0d3b24");
      addFrame(ground, APRON_HALF_W - 1, APRON_HALF_H - 1, FLOOR_HALF, FLOOR_HALF, -0.6, FLOOR_COLOR);
      const groundMesh = ground.build(paint, !lite);
      groundMesh.renderOrder = 1;
      this.group.add(groundMesh);
    }
    // Gramado depois dos bonecos e antes do chão: embaixo de quem está em pé não ilumina.
    this.fieldMap = track(fieldTexture(setup, theme, streetVariant, lite ? Math.min(4, anisotropy) : anisotropy, lite ? 2 : 4));
    this.bakedCanvases.push(this.fieldMap);
    // Concreto pintado da praça tem um brilho de quadra; asfalto e terra são foscos.
    const glossy = futsal || (street && streetVariant === 2);
    let fieldMaterial: THREE.Material;
    if (!lite) fieldMaterial = new THREE.MeshStandardMaterial({ map: this.fieldMap, roughness: futsal ? 0.42 : street ? STREET_ROUGHNESS[streetVariant] : 0.95, metalness: 0 });
    // Modo desempenho: grama sem PBR (o especular dela é quase nada); a quadra de
    // futsal mantém um brilho barato (Phong).
    else if (glossy) fieldMaterial = new THREE.MeshPhongMaterial({ map: this.fieldMap, specular: futsal ? "#262626" : "#1a1a1a", shininess: futsal ? 28 : 16 });
    else fieldMaterial = new THREE.MeshLambertMaterial({ map: this.fieldMap });
    track(fieldMaterial);
    addMowingSheen(fieldMaterial, theme);
    const field = new THREE.Mesh(track(new THREE.PlaneGeometry(FIELD.width, FIELD.height)), fieldMaterial);
    field.rotation.x = -Math.PI / 2;
    field.receiveShadow = !lite;
    field.renderOrder = 0.5;
    this.group.add(field);

    // Tabelas: a bola quica exatamente aqui, então ficam rente às linhas. Corpo
    // das tabelas e mastros das bandeirinhas numa geometria, painéis de LED em
    // outra. As mensagens do gol já nascem prontas: trocar o map não recompila nada.
    // Na rua não há placa: as tabelas (meio-fio, tábua ou mureta) e todo poste,
    // tubo e refletor do bairro vão para a mesma geometria do `railBodies`.
    const railBodies = new Baker({ finishes: !lite });
    let streetScene: StreetScene | null = null;
    if (street) {
      this.baseBoard = null;
      this.boardTexture = null;
      this.ledMaterial = null;
      streetScene = buildStreetScene(setup, streetVariant, railBodies, { lite, calm: this.calm, anisotropy, finishes: !lite });
    } else {
      this.baseBoard = ledBaseTexture(setup, anisotropy);
      this.boardTexture = this.baseBoard;
      this.boards.set("base", this.baseBoard);
      for (const side of SIDES) {
        const team = side === "user" ? setup.userTeam : setup.cpuTeam;
        this.boards.set(`goal|${side}|${team.primary}`, this.messageBoard("goal", team, team.primary));
        this.boards.set(`fim|${side}|${team.primary}`, this.messageBoard("fim", team, team.primary));
      }
      // "QUASE!" é o rótulo do quase-gol do Botao3DView: pronto aqui para não desenhar canvas no lance.
      for (const label of ["NA TRAVE!", "QUASE!"]) this.boards.set(`post|${label}`, ledMessageTexture(label, "#04070a", "#ffd23f", anisotropy));
      // Modo desempenho: placa sem luz, o brilho vira cor (`updateBoards`).
      const ledMaterial = lite
        ? new THREE.MeshBasicMaterial({ map: this.baseBoard })
        : new THREE.MeshStandardMaterial({ map: this.baseBoard, emissive: "#ffffff", emissiveMap: this.baseBoard, emissiveIntensity: 0.9, roughness: 0.4 });
      this.ledMaterial = track(ledMaterial);
      const ledPanels = new Baker({ keepUv: true });
      const panelHeight = RAIL_HEIGHT * 0.78;
      const rail = (x: number, z: number, width: number, depth: number, facing: number, length: number) => {
        const body = new THREE.BoxGeometry(width, RAIL_HEIGHT, depth);
        railBodies.add(body, new THREE.Vector3(x, RAIL_HEIGHT / 2, z), undefined, "#151b22", RAIL_FINISH);
        body.dispose();
        const panel = new THREE.PlaneGeometry(length - 1, panelHeight);
        // O texto mantém a proporção: o painel repete a faixa conforme o comprimento.
        const uv = panel.getAttribute("uv") as THREE.BufferAttribute;
        const repeat = length / panelHeight / 16;
        for (let index = 0; index < uv.count; index += 1) uv.setX(index, uv.getX(index) * repeat);
        const inward = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
        const offset = Math.abs(inward.x) * width / 2 + Math.abs(inward.z) * depth / 2 + 0.06;
        ledPanels.add(panel, new THREE.Vector3(x + inward.x * offset, RAIL_HEIGHT / 2, z + inward.z * offset), new THREE.Euler(0, facing, 0));
        panel.dispose();
      };
      const sideLength = FIELD.height + RAIL_THICKNESS * 2;
      rail(-HALF_W - RAIL_THICKNESS / 2 - 0.3, 0, RAIL_THICKNESS, sideLength, Math.PI / 2, sideLength);
      rail(HALF_W + RAIL_THICKNESS / 2 + 0.3, 0, RAIL_THICKNESS, sideLength, -Math.PI / 2, sideLength);
      const endSegment = GOAL_LEFT - 1.8;
      for (const sign of [-1, 1]) {
        const z = sign * (HALF_H + RAIL_THICKNESS / 2 + 0.3);
        const facing = sign < 0 ? 0 : Math.PI;
        rail(-HALF_W + endSegment / 2, z, endSegment, RAIL_THICKNESS, facing, endSegment);
        rail(HALF_W - endSegment / 2, z, endSegment, RAIL_THICKNESS, facing, endSegment);
      }
      this.group.add(ledPanels.build(ledMaterial, !lite));
    }

    // Bandeirinhas de escanteio (quadra de futsal e rua não têm): mastros com as tabelas.
    if (!futsal && !street) {
      const pole = new THREE.CylinderGeometry(0.55, 0.55, FLAG_TOP, 8);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) railBodies.add(pole, new THREE.Vector3(sx * (HALF_W + 7), FLAG_TOP / 2, sz * (HALF_H + 7)), undefined, "#f2f2f2", POLE_FINISH);
      pole.dispose();
      const clothMaterial = track(new THREE.MeshLambertMaterial({ color: "#ffd23f", side: THREE.DoubleSide }));
      this.flags = new CornerFlags(setup.seed, clothMaterial, !lite);
      this.group.add(this.flags.cloth);
    } else {
      this.flags = null;
    }
    const railMesh = railBodies.build(solid, !lite);
    railMesh.castShadow = !lite;
    if (depthOnly) railMesh.customDepthMaterial = depthOnly;
    this.group.add(railMesh);

    // Gols: trave e rede batendo com a física do motor (na rua só muda a pintura).
    const netMap = track(netTexture(anisotropy));
    // Sem MSAA confirmado, alphaTest baixo; `prepare` troca para alpha-to-coverage.
    this.netMaterial = track(new THREE.MeshLambertMaterial({ alphaMap: netMap, color: "#eef1f3", alphaTest: 0.3, side: THREE.DoubleSide }));
    const goalStyle = street ? STREET_GOALS[streetVariant] : GOAL_STYLE;
    this.goals = {
      top: new GoalView(true, solid, this.netMaterial, setup.cpuTeam.primary, this.calm, depthOnly, !lite, goalStyle),
      bottom: new GoalView(false, solid, this.netMaterial, setup.userTeam.primary, this.calm, depthOnly, !lite, goalStyle),
    };
    this.group.add(this.goals.top.group, this.goals.bottom.group);

    if (streetScene) {
      // Bairro: chão, casas, luzes, grafite, alambrado e bandeirinhas já
      // montados; vizinhos animados (fora do modo desempenho, que os assa parados).
      this.cutouts = [this.netMaterial, ...streetScene.cutouts];
      for (const texture of streetScene.textures) track(texture);
      this.bakedCanvases.push(streetScene.textures[0]);
      this.bunting = streetScene.bunting;
      for (const object of streetScene.objects) this.group.add(object);
      if (lite || streetScene.layout.fans.length === 0) {
        this.crowd = null;
        this.flashes = null;
      } else {
        this.crowd = new Crowd(setup, streetScene.layout, this.calm);
        this.group.add(this.crowd.mesh);
        // Celular filmando o lance: os mesmos flashes, só na mão dos vizinhos.
        const spotRandom = seeded(setup.seed ^ 0x5eed);
        this.flashes = new CameraFlashes([this.crowd.spots("user", 14, spotRandom), this.crowd.spots("cpu", 14, spotRandom), []], setup.seed, this.calm);
        this.group.add(this.flashes.points);
      }
      freeze(this.group);
      return;
    }
    this.cutouts = [this.netMaterial];
    this.bunting = null;

    // Arquibancada (degraus e fotógrafos numa malha, depois da torcida que os
    // cobre), torcida e flashes. Modo desempenho: degraus nas cores dos setores.
    const stands = new Stands(setup);
    let sceneryMesh: THREE.Mesh;
    if (lite) {
      sceneryMesh = new THREE.Mesh(paintStands(stands, setup), paint);
      this.crowd = null;
      this.flashes = null;
    } else {
      const scenery = new Baker();
      const lenses = buildPhotographers(setup.seed, futsal, scenery);
      for (const row of stands.rows) {
        const step = new THREE.BoxGeometry(Math.abs(row.alongX) * row.length + Math.abs(row.outX) * 9, row.height, Math.abs(row.alongZ) * row.length + Math.abs(row.outZ) * 9);
        scenery.add(step, new THREE.Vector3(row.x, row.height / 2, row.z), undefined, STEP_COLOR);
        step.dispose();
      }
      sceneryMesh = scenery.build(paint);
      this.crowd = new Crowd(setup, stands, this.calm);
      this.group.add(this.crowd.mesh);
      const spotRandom = seeded(setup.seed ^ 0x5eed);
      this.flashes = new CameraFlashes([this.crowd.spots("user", 60, spotRandom), this.crowd.spots("cpu", 60, spotRandom), lenses], setup.seed, this.calm);
      this.group.add(this.flashes.points);
    }
    sceneryMesh.renderOrder = 0.5;
    this.group.add(sceneryMesh);

    // Torres de luz com os refletores (o brilho vem do acabamento por vértice).
    if (this.finishMaterial) {
      const towers = new Baker({ finishes: true });
      const aim = new THREE.Object3D();
      const towerGeometry = new THREE.BoxGeometry(6, 220, 6);
      const lampGeometry = new THREE.BoxGeometry(34, 18, 4);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const x = sx * (HALF_W + 120);
          const z = sz * (HALF_H + 130);
          towers.add(towerGeometry, new THREE.Vector3(x, 110, z), undefined, "#2a3038", TOWER_FINISH);
          aim.position.set(x - sx * 3, 222, z - sz * 3);
          aim.lookAt(0, 0, 0);
          towers.add(lampGeometry, aim.position, aim.quaternion, "#ffffff", LAMP_FINISH);
        }
      }
      towerGeometry.dispose();
      lampGeometry.dispose();
      this.group.add(towers.build(this.finishMaterial));
    }
    freeze(this.group);
  }

  /**
   * Chamar uma vez, logo depois de construir e antes do primeiro quadro: sobe
   * para a GPU o gramado e as placas (senão o upload acontece no gol e engasga
   * no Android) e solta a cópia delas na RAM (~10 MB: a perda de contexto
   * recria a visão inteira, nada é reenviado). Se o canvas tem MSAA, passa a
   * rede para alpha-to-coverage — transparência certa de longe sem ordenar nem
   * cintilar. Os shaders compilam no primeiro render (ou no compile da visão).
   */
  prepare(renderer: THREE.WebGLRenderer) {
    const gl = renderer.getContext();
    const canvases: THREE.CanvasTexture[] = [...this.bakedCanvases];
    for (const texture of this.boards.values()) {
      renderer.initTexture(texture);
      canvases.push(texture);
    }
    for (const item of this.disposables) if (item instanceof THREE.Texture) renderer.initTexture(item);
    this.flashes?.prepare(renderer);
    if (!gl.isContextLost()) {
      for (const texture of canvases) {
        const image = texture.image as HTMLCanvasElement | undefined;
        if (image && image.width > 1) {
          image.width = 1;
          image.height = 1;
        }
      }
    }
    const samples = renderer.getRenderTarget() === null ? Number(gl.getParameter(gl.SAMPLES)) : 0;
    // Rede e alambrado: alpha-to-coverage quando o canvas tem MSAA.
    for (const material of this.cutouts) {
      if (samples > 1 && !material.alphaToCoverage) {
        material.alphaTest = 0;
        material.alphaToCoverage = true;
        material.needsUpdate = true;
      }
    }
  }

  goal(side: "top" | "bottom") {
    return this.goals[side];
  }

  /** Lado que marcou (ou venceu) pula; o outro senta desanimado. */
  celebrate(side: BotaoSide, seconds = 3.2) {
    this.crowd?.celebrate(side, seconds, true);
  }

  /**
   * "ooh": todo mundo de pé com as mãos na cabeça ~1.2 s (bola na trave; `side`
   * = quem atacou) e a placa mostra `label` (null = não mexe na placa). Na rua
   * não há placa: só os vizinhos reagem.
   * "groan": torcida de `side` senta e desaba. "cheer": torcida de `side` vibra.
   */
  crowdReact(kind: "ooh" | "groan" | "cheer", side: BotaoSide, label: string | null = "NA TRAVE!") {
    if (kind === "ooh") {
      this.crowd?.ooh(1.2);
      if (label && this.ledMaterial && this.boardMode !== "goal" && this.boardMode !== "fim") {
        const key = `post|${label}`;
        let texture = this.boards.get(key);
        if (!texture) {
          texture = ledMessageTexture(label.toLocaleUpperCase("pt-BR"), "#04070a", "#ffd23f", this.anisotropy);
          this.boards.set(key, texture);
        }
        this.showBoard("post", texture);
      }
    } else if (kind === "groan") {
      this.crowd?.groan(side, 2.4);
    } else {
      this.crowd?.celebrate(side, 1.6, false);
    }
  }

  /** Perigo perto do gol (0..1), todo quadro: a arquibancada vai ficando de pé. */
  setTension(value: number) {
    this.crowd?.setTension(value);
  }

  /** Ola dando uma volta no estádio (~7 s). */
  wave() {
    if (this.calm) return;
    this.crowd?.wave();
  }

  /**
   * Placas viram "GOOOL ★ TIME ★" (ou "VITÓRIA · TIME") com fundo na cor do
   * time, rolando rápido, piscando a 2.5 Hz por 1.2 s; o gol volta ao normal em
   * 2.4 s, a vitória fica na placa. Torres dão três pulsos. Na rua, sem placa,
   * quem pisca são os refletores e lâmpadas acesas do bairro.
   */
  goalShow(side: BotaoSide, color: string, mode: "goal" | "fim" = "goal") {
    let texture: THREE.CanvasTexture | null = null;
    if (this.ledMaterial) {
      const team = side === "user" ? this.setup.userTeam : this.setup.cpuTeam;
      const key = `${mode}|${side}|${color}`;
      texture = this.boards.get(key) ?? null;
      if (!texture) {
        texture = this.messageBoard(mode, team, color);
        this.boards.set(key, texture);
      }
    }
    this.showBoard(mode, texture);
    // Apito final: a festa do vencedor dura mais que a de um gol.
    if (mode === "fim") this.crowd?.celebrate(side, 6, true);
  }

  /** Chuva de flashes na torcida de `side` e nas lentes dos fotógrafos, decaindo em `seconds`. */
  cameraFlashes(side: BotaoSide, seconds: number) {
    this.flashes?.trigger(side, seconds);
  }

  /**
   * Beira do campo em frente à torcida de `side` (atrás do gol que ela ataca):
   * para quem quiser correr ou mirar a câmera na própria gente.
   */
  fanAnchor(side: BotaoSide) {
    return { x: 0, z: attackSign(side) * (HALF_H + 70) };
  }

  /**
   * Alguma sombra do estádio mudou no último `update` (rede estufando ou trave
   * tremendo, até o quadro em que voltam ao lugar): para quem refaz o mapa de
   * sombra só sob demanda. As bandeirinhas balançam sempre e ficam de fora: a
   * sombra delas é um fiapo no entorno e pode esperar a próxima atualização.
   */
  shadowsChanged() {
    return this.goals.top.changed || this.goals.bottom.changed;
  }

  update(dt: number, time: number) {
    this.updateBoards(dt);
    this.flags?.update(time);
    this.bunting?.update(time);
    this.goals.top.update(dt);
    this.goals.bottom.update(dt);
    this.crowd?.update(dt, time);
    this.flashes?.update(dt);
  }

  private messageBoard(mode: "goal" | "fim", team: BotaoTeam, color: string) {
    const name = team.shortName.toLocaleUpperCase("pt-BR");
    const text = mode === "fim" ? `VITÓRIA · ${name}` : `GOOOL ★ ${name} ★`;
    const ink = luminance(color) > 0.58 ? "#0b0f14" : "#ffffff";
    return ledMessageTexture(text, color, ink, this.anisotropy);
  }

  /** `texture` null = sem placa (rua): o modo ainda corre, por causa dos pulsos das lâmpadas. */
  private showBoard(mode: BoardMode, texture: THREE.Texture | null) {
    this.boardMode = mode;
    this.boardT = 0;
    this.boardTexture = texture;
    if (!this.ledMaterial || !texture) return;
    // Mesmo tipo de textura nos dois slots: só troca uniform, sem recompilar.
    this.ledMaterial.map = texture;
    if (this.ledMaterial instanceof THREE.MeshStandardMaterial) this.ledMaterial.emissiveMap = texture;
  }

  private updateBoards(dt: number) {
    let speed = 0.035;
    let glow = 0.9;
    let lamp = LAMP_GLOW;
    if (this.boardMode === "post") {
      this.boardT += dt;
      glow = 1.35;
      if (this.boardT > 1.6) this.showBoard("base", this.baseBoard);
    } else if (this.boardMode !== "base") {
      this.boardT += dt;
      const t = this.boardT;
      const loud = t < 2.4;
      speed = loud ? 0.22 : 0.05;
      // Onda quadrada de 2.5 Hz: 3 acesas em 1.2 s, nunca mais rápido que isso.
      if (t < 1.2) glow = this.calm ? 1.6 : Math.sin(Math.PI * 2 * 2.5 * t) >= 0 ? 2.5 : 1.3;
      else glow = loud ? 1.5 : 1.15;
      if (t < 1.3) lamp = LAMP_GLOW * (1 + (this.calm ? 0.35 * Math.sin((Math.PI * t) / 1.3) : 0.9 * lampPulses(t)));
      if (!loud && this.boardMode === "goal") this.showBoard("base", this.baseBoard);
    }
    const texture = this.boardTexture;
    if (texture) texture.offset.x = (texture.offset.x + dt * speed) % 1;
    if (this.ledMaterial instanceof THREE.MeshStandardMaterial) this.ledMaterial.emissiveIntensity = glow;
    else if (this.ledMaterial) this.ledMaterial.color.setScalar(glow * LED_BASIC_GAIN);
    if (this.finishMaterial) this.finishMaterial.emissiveIntensity = lamp;
  }

  dispose() {
    for (const item of this.disposables) item.dispose();
    for (const texture of this.boards.values()) texture.dispose();
    this.crowd?.dispose();
    this.flashes?.dispose();
    this.flags?.dispose();
    this.bunting?.dispose();
    this.goals.top.dispose();
    this.goals.bottom.dispose();
    // Peças assadas (degraus, tabelas, torres, fotógrafos, bairro) não passam por `track`.
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material.dispose();
      }
    });
  }
}
