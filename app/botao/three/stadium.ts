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

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FIELD, GOAL_LEFT, GOAL_RIGHT } from "../engine";
import { fieldThemeForMatch, type BotaoFieldTheme } from "../field-themes";
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
const STEP_COLOR = "#252c35";
const FLOOR_COLOR = "#0b1016";
const APRON_HALF_W = HALF_W + 42;
const APRON_HALF_H = HALF_H + 58;
const FLOOR_HALF = 2000;
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

  add(geometry: THREE.BufferGeometry, position: THREE.Vector3, rotation?: THREE.Euler | THREE.Quaternion, color?: THREE.ColorRepresentation, finish?: Finish) {
    this.helper.position.copy(position);
    if (rotation instanceof THREE.Quaternion) this.helper.quaternion.copy(rotation);
    else if (rotation) this.helper.rotation.copy(rotation);
    else this.helper.rotation.set(0, 0, 0);
    this.helper.updateMatrix();
    const part = geometry.clone().applyMatrix4(this.helper.matrix);
    if (!this.options.keepUv) part.deleteAttribute("uv");
    const count = part.getAttribute("position").count;
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

/** `scale` texels por unidade do campo: 4 normal, 2 no modo desempenho (1/4 da memória). */
function fieldTexture(setup: BotaoMatchSetup, futsal: boolean, anisotropy: number, scale: number) {
  const canvas = document.createElement("canvas");
  canvas.width = FIELD.width * scale;
  canvas.height = FIELD.height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  drawFieldSurface(ctx, setup);
  if (!futsal) {
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
  if (theme === "futsal-blue") return;
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
    const white = "#f5f7f4";
    const support = "#d5d9d6";
    const post = new THREE.CylinderGeometry(POST_RADIUS, POST_RADIUS, GOAL_HEIGHT, 18);
    for (const x of [xL, xR]) frame.add(post, v(x, GOAL_HEIGHT / 2, postZ), undefined, white, FRAME_FINISH);
    const bar = new THREE.CylinderGeometry(CROSSBAR_RADIUS, CROSSBAR_RADIUS, xR - xL, 16);
    frame.add(bar, v(0, barY, postZ), new THREE.Euler(0, 0, Math.PI / 2), white, FRAME_FINISH);
    // Faixa no pé da trave com a cor do dono do gol.
    const band = new THREE.CylinderGeometry(POST_RADIUS + 0.14, POST_RADIUS + 0.14, 3, 18);
    for (const x of [xL, xR]) frame.add(band, v(x, 1.5, postZ), undefined, accent, FRAME_FINISH);
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
function fanGeometry() {
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
float fanArmSign = aPart > 2.5 ? 1.0 : -1.0;
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
float fanUp = clamp(max(max(fanStand, fanCheer), max(fanOoh, fanWave)), 0.0, 1.0) * (1.0 - fanSad);
float fanLift = -2.4 * (1.0 - fanUp) - 0.7 * fanSad
  + max(0.0, sin(uTime * 1.6 + aFan.x)) * 0.35 * (1.0 - fanCheer)
  + fanCheer * fanJump * mix(4.5, 1.8, uCalm)
  + fanWave * 1.6;
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
float fanIsArm = step(1.5, aPart);
vec3 fanShoulder = vec3(3.3 * fanArmSign, 6.6, 0.0);
vec3 fanNeck = vec3(0.0, 7.0, 0.0);
vColor.rgb = mix(vColor.rgb, aSkin, fanIsHead);
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

  constructor(setup: BotaoMatchSetup, stands: Stands, calm: boolean) {
    const random = stands.random;
    this.fans = stands.fans;
    const count = this.fans.length;
    const geometry = fanGeometry();
    const fanAttribute = new Float32Array(count * 4);
    const skinAttribute = new Float32Array(count * 3);
    this.material = new THREE.MeshLambertMaterial();
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
    this.material.customProgramCacheKey = () => "futbobo-crowd";
    this.mesh = new THREE.InstancedMesh(geometry, this.material, count);
    const color = new THREE.Color();
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);
    const skins = ["#f6d9c0", "#e5aa84", "#cc8965", "#985d43", "#714633", "#4b3027", "#edbf9d"];
    const neutrals = ["#f2f2f0", "#2a2d33", "#6b7280", "#1e3a5f"];
    this.fans.forEach((fan, index) => {
      quaternion.setFromAxisAngle(up, fan.yaw);
      position.set(fan.x, fan.y, fan.z);
      matrix.compose(position, quaternion, scale);
      this.mesh.setMatrixAt(index, matrix);
      const team = fan.side === "user" ? setup.userTeam : setup.cpuTeam;
      const roll = random();
      color.set(roll < 0.7 ? team.primary : roll < 0.9 ? team.secondary : neutrals[Math.floor(random() * neutrals.length)]);
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
    for (let index = 0; index < count && pool.length > 0; index += 1) {
      const fan = pool[Math.floor(random() * pool.length)];
      spots.push(new THREE.Vector3(fan.x + Math.sin(fan.yaw) * 2.8, fan.y + 9.4, fan.z + Math.cos(fan.yaw) * 2.8));
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
  private readonly netMaterial: THREE.MeshLambertMaterial;
  private readonly ledMaterial: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
  /** Tabelas, traves, torres e refletores (o emissivo é o dos refletores); null no modo desempenho. */
  private readonly finishMaterial: THREE.MeshStandardMaterial | null;
  private readonly fieldMap: THREE.CanvasTexture;
  private readonly baseBoard: THREE.CanvasTexture;
  private readonly boards = new Map<string, THREE.CanvasTexture>();
  private readonly disposables: Array<{ dispose: () => void }> = [];
  private boardMode: BoardMode = "base";
  private boardTexture: THREE.Texture;
  private boardT = 0;

  constructor(setup: BotaoMatchSetup, anisotropy: number, options: StadiumOptions = {}) {
    this.setup = setup;
    this.calm = Boolean(options.reducedMotion);
    // Modo desempenho 3D: fixo por estádio (trocar recria a visão).
    const lite = Boolean(options.performance);
    this.anisotropy = anisotropy;
    const theme = fieldThemeForMatch(setup);
    const futsal = theme === "futsal-blue";
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
    const ground = new Baker();
    addFrame(ground, HALF_W - 1, HALF_H - 1, APRON_HALF_W, APRON_HALF_H, -0.08, futsal ? "#0b2c42" : "#0d3b24");
    addFrame(ground, APRON_HALF_W - 1, APRON_HALF_H - 1, FLOOR_HALF, FLOOR_HALF, -0.6, FLOOR_COLOR);
    const groundMesh = ground.build(paint, !lite);
    groundMesh.renderOrder = 1;
    this.group.add(groundMesh);
    // Gramado depois dos bonecos e antes do chão: embaixo de quem está em pé não ilumina.
    this.fieldMap = track(fieldTexture(setup, futsal, lite ? Math.min(4, anisotropy) : anisotropy, lite ? 2 : 4));
    let fieldMaterial: THREE.Material;
    if (!lite) fieldMaterial = new THREE.MeshStandardMaterial({ map: this.fieldMap, roughness: futsal ? 0.42 : 0.95, metalness: 0 });
    // Modo desempenho: grama sem PBR (o especular dela é quase nada); a quadra de
    // futsal mantém um brilho barato (Phong).
    else if (futsal) fieldMaterial = new THREE.MeshPhongMaterial({ map: this.fieldMap, specular: "#262626", shininess: 28 });
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
    this.ledMaterial = lite
      ? new THREE.MeshBasicMaterial({ map: this.baseBoard })
      : new THREE.MeshStandardMaterial({ map: this.baseBoard, emissive: "#ffffff", emissiveMap: this.baseBoard, emissiveIntensity: 0.9, roughness: 0.4 });
    track(this.ledMaterial);
    const railBodies = new Baker({ finishes: !lite });
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

    // Bandeirinhas de escanteio (quadra de futsal não tem): mastros com as tabelas.
    if (!futsal) {
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
    this.group.add(railMesh, ledPanels.build(this.ledMaterial, !lite));

    // Gols: trave e rede batendo com a física do motor.
    const netMap = track(netTexture(anisotropy));
    // Sem MSAA confirmado, alphaTest baixo; `prepare` troca para alpha-to-coverage.
    this.netMaterial = track(new THREE.MeshLambertMaterial({ alphaMap: netMap, color: "#eef1f3", alphaTest: 0.3, side: THREE.DoubleSide }));
    this.goals = {
      top: new GoalView(true, solid, this.netMaterial, setup.cpuTeam.primary, this.calm, depthOnly, !lite),
      bottom: new GoalView(false, solid, this.netMaterial, setup.userTeam.primary, this.calm, depthOnly, !lite),
    };
    this.group.add(this.goals.top.group, this.goals.bottom.group);

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
    const canvases: THREE.CanvasTexture[] = [this.fieldMap];
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
    if (samples > 1 && !this.netMaterial.alphaToCoverage) {
      this.netMaterial.alphaTest = 0;
      this.netMaterial.alphaToCoverage = true;
      this.netMaterial.needsUpdate = true;
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
   * = quem atacou) e a placa mostra `label` (null = não mexe na placa).
   * "groan": torcida de `side` senta e desaba. "cheer": torcida de `side` vibra.
   */
  crowdReact(kind: "ooh" | "groan" | "cheer", side: BotaoSide, label: string | null = "NA TRAVE!") {
    if (kind === "ooh") {
      this.crowd?.ooh(1.2);
      if (label && this.boardMode !== "goal" && this.boardMode !== "fim") {
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
   * 2.4 s, a vitória fica na placa. Torres dão três pulsos.
   */
  goalShow(side: BotaoSide, color: string, mode: "goal" | "fim" = "goal") {
    const team = side === "user" ? this.setup.userTeam : this.setup.cpuTeam;
    const key = `${mode}|${side}|${color}`;
    let texture = this.boards.get(key);
    if (!texture) {
      texture = this.messageBoard(mode, team, color);
      this.boards.set(key, texture);
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

  private showBoard(mode: BoardMode, texture: THREE.Texture) {
    this.boardMode = mode;
    this.boardT = 0;
    this.boardTexture = texture;
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
    texture.offset.x = (texture.offset.x + dt * speed) % 1;
    if (this.ledMaterial instanceof THREE.MeshStandardMaterial) this.ledMaterial.emissiveIntensity = glow;
    else this.ledMaterial.color.setScalar(glow * LED_BASIC_GAIN);
    if (this.finishMaterial) this.finishMaterial.emissiveIntensity = lamp;
  }

  dispose() {
    for (const item of this.disposables) item.dispose();
    for (const texture of this.boards.values()) texture.dispose();
    this.crowd?.dispose();
    this.flashes?.dispose();
    this.flags?.dispose();
    this.goals.top.dispose();
    this.goals.bottom.dispose();
    // Peças assadas (degraus, tabelas, torres, fotógrafos) não passam por `track`.
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material.dispose();
      }
    });
  }
}
