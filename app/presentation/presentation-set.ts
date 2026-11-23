// Cenário 3D da apresentação: o painel de fundo com o escudo repetido
// ("step-and-repeat"), o praticável com o tapete do clube, dois rebatedores,
// a fila de fotógrafos e os flashes deles.
//
// Tudo que não mexe é cozido em poucas malhas (cor por vértice): o cenário
// inteiro sai em ~5 draw calls. Os flashes são um `Points` só; o brilho de
// cada um vem do roteiro (`flashBrightness`), o mesmo instante que acende a
// luz do palco e o clique do obturador no som.

import * as THREE from "three";
import { readableInk } from "../botao/kits";
import { canvasTexture, luminance, mixHex, shadeHex } from "../botao/three/textures";
import { FLASH_UNITS, PHOTOGRAPHERS, flashBrightness, type FlashSchedule } from "./presentation-script";

// ------------------------------------------------------------------ medidas
// Unidades do campo do botão (o boneco tem ~40 de altura). x para a direita de
// quem olha dos fotógrafos, z na direção deles, y para cima.

/** Altura do praticável (o piso de quem anda nele). */
export const FLOOR_Y = 1.4;
/** Painel de fundo. */
export const BACKDROP = { z: -40, width: 360, height: 112, tile: 56 } as const;
/**
 * Marcas: onde ele para (o meio das fotos), onde o diretor espera (perto: a
 * camisa passa de mão em mão sem ninguém esticar demais), para onde o diretor
 * recua depois da entrega e por onde o jogador entra.
 */
export const PLAYER_MARK = { x: -2, z: 6 } as const;
export const DIRECTOR_MARK = { x: 14, z: 6 } as const;
export const DIRECTOR_ASIDE = { x: 21, z: 1 } as const;
export const ENTRY = { x: -100, z: 9 } as const;

type Part = readonly [w: number, h: number, d: number, x: number, y: number, z: number, tone: Tone, rx?: number];
type Tone = "jacket" | "pants" | "skin" | "hair" | "shoe" | "camera" | "lens" | "ring" | "flash" | "strap";

/** Fotógrafo de pé (olhando para +z): pernas, paletó, cabeça, braços e a câmera na frente do rosto. */
const UPPER_BODY: readonly Part[] = [
  [10.4, 15, 5.6, 0, 22.5, 0, "jacket"],
  [9.6, 9.6, 9.6, 0, 35, 0.4, "skin"],
  [10, 3.2, 10, 0, 40.4, 0.2, "hair"],
  [10, 6.4, 2.4, 0, 37.4, -4.4, "hair"],
  [3.6, 9, 3.6, 6.8, 26.4, 2.4, "jacket", -0.75],
  [3.6, 9, 3.6, -6.8, 26.4, 2.4, "jacket", -0.75],
  [3.2, 3.2, 8, 4.8, 31.6, 6.4, "jacket"],
  [3.2, 3.2, 8, -4.8, 31.6, 6.4, "jacket"],
  [1.2, 9, 0.8, 4.2, 26, 3.1, "strap"],
  [8, 5.4, 4.6, 0, 34.6, 7.4, "camera"],
  [4, 4, 6.4, 0, 34.4, 11.8, "lens"],
  [4.6, 4.6, 0.6, 0, 34.4, 15.1, "ring"],
  [3.2, 3, 2.6, 0, 38.8, 7.4, "camera"],
  [4, 2.6, 1.6, 0, 41.2, 8, "flash"],
];
const STANDING_LEGS: readonly Part[] = [
  [4.6, 15, 5, 2.6, 7.5, 0, "pants"],
  [4.6, 15, 5, -2.6, 7.5, 0, "pants"],
  [4.8, 2, 6.8, 2.6, 1, 0.9, "shoe"],
  [4.8, 2, 6.8, -2.6, 1, 0.9, "shoe"],
];
/** Ajoelhado num joelho só: o tronco desce 11 e vem um pouco à frente. */
const KNEELING_LEGS: readonly Part[] = [
  [4.6, 8, 5, -2.6, 5, 1, "pants"],
  [4.6, 3.2, 12, -2.6, 1.6, -4, "pants"],
  [4.6, 4.6, 11, 2.6, 9.4, 5, "pants"],
  [4.6, 9.4, 4.6, 2.6, 5, 10.4, "pants"],
  [4.8, 2, 6.8, 2.6, 1, 11.6, "shoe"],
];
const KNEEL_DROP = 11;
const KNEEL_FORWARD = 1.2;
/** Ponta do flash em cima da câmera (local, de pé). */
const FLASH_TIP = new THREE.Vector3(0, 41.2, 9);

/**
 * [x, z, ajoelhado] de cada fotógrafo: atrás das câmeras dos planos de perto
 * (eles só aparecem quando a grua abre), dois grupos com um corredor no meio
 * para a câmera da TV. Os quatro primeiros ficam à esquerda (luz da esquerda).
 */
const PHOTOGRAPHER_SPOTS: ReadonlyArray<readonly [number, number, boolean]> = [
  [-32, 100, true],
  [-38, 116, false],
  [-52, 106, true],
  [-66, 120, false],
  [33, 101, true],
  [39, 117, false],
  [53, 107, true],
  [67, 121, false],
];

const JACKETS = ["#23262d", "#30363f", "#3b3129", "#1d2b3b", "#40384a", "#2b2f2a"];
const PANTS = ["#1a1c22", "#2a2e38", "#353a44", "#24211d"];
const SKINS = ["#e5aa84", "#bd7b58", "#714633", "#f6d9c0", "#985d43", "#d99b73"];
const HAIRS = ["#12110f", "#28201b", "#473023", "#ded8cc", "#69422a"];

function seededRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------- cozinha

/** Junta caixas coloridas numa malha só (cor por vértice, já no espaço linear). */
class BoxBaker {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];
  private readonly local = new THREE.Matrix4();
  private readonly world = new THREE.Matrix4();
  private readonly rotation = new THREE.Matrix4();
  private readonly normalMatrix = new THREE.Matrix3();
  private readonly vertex = new THREE.Vector3();
  private readonly color = new THREE.Color();

  box(w: number, h: number, d: number, x: number, y: number, z: number, color: string, parent: THREE.Matrix4 | null = null, rx = 0) {
    const geometry = new THREE.BoxGeometry(w, h, d);
    this.local.makeTranslation(x, y, z);
    if (rx) this.local.multiply(this.rotation.makeRotationX(rx));
    if (parent) this.world.multiplyMatrices(parent, this.local);
    else this.world.copy(this.local);
    this.normalMatrix.getNormalMatrix(this.world);
    this.color.set(color);
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const index = geometry.getIndex();
    const offset = this.positions.length / 3;
    for (let i = 0; i < position.count; i += 1) {
      this.vertex.fromBufferAttribute(position, i).applyMatrix4(this.world);
      this.positions.push(this.vertex.x, this.vertex.y, this.vertex.z);
      this.vertex.fromBufferAttribute(normal, i).applyMatrix3(this.normalMatrix).normalize();
      this.normals.push(this.vertex.x, this.vertex.y, this.vertex.z);
      this.colors.push(this.color.r, this.color.g, this.color.b);
    }
    if (index) for (let i = 0; i < index.count; i += 1) this.indices.push(offset + index.getX(i));
    geometry.dispose();
  }

  build() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    return geometry;
  }
}

// ------------------------------------------------------------- pinturas

/** Escudo genérico com a sigla (quando o clube não tem imagem). */
export function drawCrest(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, fill: string, ink: string, abbr: string, family: string) {
  ctx.save();
  ctx.fillStyle = fill;
  ctx.strokeStyle = ink;
  ctx.lineWidth = size * 0.05;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.42, cy - size * 0.46);
  ctx.quadraticCurveTo(cx, cy - size * 0.56, cx + size * 0.42, cy - size * 0.46);
  ctx.lineTo(cx + size * 0.42, cy + size * 0.04);
  ctx.quadraticCurveTo(cx + size * 0.4, cy + size * 0.38, cx, cy + size * 0.56);
  ctx.quadraticCurveTo(cx - size * 0.4, cy + size * 0.38, cx - size * 0.42, cy + size * 0.04);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = readableInk(fill);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const text = abbr.slice(0, 4).toUpperCase();
  let px = size * 0.36;
  ctx.font = `900 ${px}px ${family}`;
  const width = ctx.measureText(text).width;
  if (width > size * 0.72) {
    px *= (size * 0.72) / width;
    ctx.font = `900 ${px}px ${family}`;
  }
  ctx.fillText(text, cx, cy);
  ctx.restore();
}

/** Diferença de luminância pequena: a segunda cor some em cima da primeira. */
function weakContrast(a: string, b: string) {
  return Math.abs(luminance(a) - luminance(b)) < 0.14;
}

type BackdropArt = { primary: string; secondary: string; abbr: string; shortName: string; caption: string; crest: CanvasImageSource | null; font: string };

/**
 * Ladrilho do painel (512×512): escudo e nome do clube em xadrez, como o
 * painel de patrocinadores de uma coletiva. Repete sem emenda.
 */
export function paintBackdropTile(art: BackdropArt, size = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const { primary, secondary } = art;
  const ink = readableInk(primary);
  const accent = weakContrast(primary, secondary) ? ink : secondary;
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, size, size);
  // Trama do tecido do painel (bem fraca: o painel é a cor do clube, não um padrão).
  ctx.fillStyle = luminance(primary) > 0.5 ? "rgba(0,0,0,.035)" : "rgba(255,255,255,.03)";
  for (let y = 0; y < size; y += 4) ctx.fillRect(0, y, size, 1);
  const crest = (cx: number, cy: number) => {
    const s = size * 0.3;
    if (art.crest) ctx.drawImage(art.crest, cx - s / 2, cy - s / 2, s, s);
    else drawCrest(ctx, cx, cy, s, accent === ink ? shadeHex(primary, luminance(primary) > 0.5 ? -40 : 40) : accent, ink, art.abbr, art.font);
  };
  const word = (cx: number, cy: number) => {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const name = art.shortName.toUpperCase();
    let px = size * 0.1;
    ctx.font = `900 ${px}px ${art.font}`;
    const width = ctx.measureText(name).width;
    if (width > size * 0.42) {
      px *= (size * 0.42) / width;
      ctx.font = `900 ${px}px ${art.font}`;
    }
    ctx.fillStyle = ink;
    ctx.fillText(name, cx, cy - size * 0.02);
    ctx.fillStyle = accent;
    ctx.fillRect(cx - size * 0.12, cy + px * 0.45, size * 0.24, Math.max(2, size * 0.008));
    ctx.font = `800 ${size * 0.036}px ${art.font}`;
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.8;
    ctx.fillText(art.caption, cx, cy + px * 0.45 + size * 0.04);
    ctx.globalAlpha = 1;
  };
  crest(size * 0.25, size * 0.25);
  word(size * 0.75, size * 0.25);
  word(size * 0.25, size * 0.75);
  crest(size * 0.75, size * 0.75);
  return canvas;
}

/** Brilho do flash: miolo branco, halo e uma estrela de quatro pontas (a horizontal mais longa). */
function flashSprite(size = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const centre = size / 2;
  const glow = ctx.createRadialGradient(centre, centre, 0, centre, centre, centre);
  glow.addColorStop(0, "rgba(255,255,255,1)");
  glow.addColorStop(0.1, "rgba(250,248,255,.95)");
  glow.addColorStop(0.3, "rgba(210,225,255,.35)");
  glow.addColorStop(1, "rgba(180,200,255,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "lighter";
  for (const [angle, length, thick] of [[0, 1, 2.4], [Math.PI / 2, 0.62, 1.8]] as const) {
    ctx.save();
    ctx.translate(centre, centre);
    ctx.rotate(angle);
    const ray = ctx.createLinearGradient(-centre * length, 0, centre * length, 0);
    ray.addColorStop(0, "rgba(220,232,255,0)");
    ray.addColorStop(0.5, "rgba(255,255,255,.85)");
    ray.addColorStop(1, "rgba(220,232,255,0)");
    ctx.fillStyle = ray;
    ctx.fillRect(-centre * length, -thick, centre * length * 2, thick * 2);
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const FLASH_VERTEX = /* glsl */ `
attribute float aBright;
attribute float aSize;
uniform float uScale;
varying float vBright;
void main() {
  vBright = aBright;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * (0.55 + 0.45 * aBright) * uScale / max(1.0, -mv.z);
  // Apagado sai do recorte: ponto de tamanho 0 ainda vira 1 px em alguns drivers.
  if (aBright < 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const FLASH_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
varying float vBright;
void main() {
  vec4 tex = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(uColor * tex.rgb * (0.6 + vBright), tex.a * vBright);
  #include <colorspace_fragment>
}
`;

// ------------------------------------------------------------------ set

export type PresentationSetOptions = {
  primary: string;
  secondary: string;
  abbr: string;
  shortName: string;
  city?: string;
  crest: CanvasImageSource | null;
  font: string;
  performance: boolean;
  seed: number;
};

export class PresentationSet {
  readonly group = new THREE.Group();
  /** Luz principal (a única com sombra), apontada para o meio das marcas. */
  readonly key = new THREE.SpotLight("#fff4e6", 2.3, 0, 0.4, 0.8, 0);
  private readonly fill = new THREE.DirectionalLight("#bfd0ff", 0.42);
  private readonly rimLeft = new THREE.DirectionalLight("#ffe7c4", 0.85);
  private readonly rimRight = new THREE.DirectionalLight("#ffffff", 0.85);
  private readonly hemi = new THREE.HemisphereLight("#a3aec6", "#1b1611", 0.55);
  /** Os flashes acendem o jogador de verdade: uma luz por lado. */
  private readonly flashLeft = new THREE.PointLight("#eef3ff", 0, 0, 0);
  private readonly flashRight = new THREE.PointLight("#eef3ff", 0, 0, 0);
  private readonly textureList: THREE.Texture[] = [];
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly brightness: THREE.BufferAttribute;
  private readonly flashMaterial: THREE.ShaderMaterial;
  private readonly units: number;

  constructor(private readonly options: PresentationSetOptions) {
    const lite = options.performance;
    const { primary, secondary } = options;
    const accent = weakContrast(primary, secondary) ? readableInk(primary) : secondary;

    // ------------------------------------------------------------ painel
    const tile = canvasTexture(paintBackdropTile({
      primary,
      secondary,
      abbr: options.abbr,
      shortName: options.shortName,
      caption: options.city ? options.city.toUpperCase() : "APRESENTAÇÃO OFICIAL",
      crest: options.crest,
      font: options.font,
    }));
    tile.wrapS = THREE.RepeatWrapping;
    tile.wrapT = THREE.RepeatWrapping;
    tile.repeat.set(BACKDROP.width / BACKDROP.tile, BACKDROP.height / BACKDROP.tile);
    tile.anisotropy = 8;
    this.textureList.push(tile);
    const backdropMaterial = new THREE.MeshStandardMaterial({ map: tile, roughness: 0.92, metalness: 0 });
    const backdropGeometry = new THREE.PlaneGeometry(BACKDROP.width, BACKDROP.height);
    const backdrop = new THREE.Mesh(backdropGeometry, backdropMaterial);
    backdrop.position.set(0, BACKDROP.height / 2, BACKDROP.z);
    backdrop.receiveShadow = true;
    this.group.add(backdrop);
    this.disposables.push(backdropMaterial, backdropGeometry);

    // -------------------------------------------------------------- piso
    const floorMaterial = new THREE.MeshStandardMaterial({ color: "#0c0d11", roughness: 0.62, metalness: 0 });
    const floorGeometry = new THREE.PlaneGeometry(1000, 700);
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 250);
    floor.receiveShadow = true;
    this.group.add(floor);
    this.disposables.push(floorMaterial, floorGeometry);

    // ------------------------------------------- praticável, fotógrafos e luzes
    const baker = new BoxBaker();
    const glow = new BoxBaker();
    baker.box(270, FLOOR_Y, 64, 0, FLOOR_Y / 2, -8, "#191a20");
    baker.box(270, FLOOR_Y + 0.3, 1.2, 0, (FLOOR_Y + 0.3) / 2, 24.6, primary);
    // Tapete do clube por onde ele entra, até a marca.
    baker.box(176, 0.08, 17, (ENTRY.x - 30 + PLAYER_MARK.x + 22) / 2, FLOOR_Y + 0.04, 7, mixHex(primary, "#0a0a0c", 0.25));
    baker.box(176, 0.1, 0.9, (ENTRY.x - 30 + PLAYER_MARK.x + 22) / 2, FLOOR_Y + 0.05, 15.6, accent);
    baker.box(176, 0.1, 0.9, (ENTRY.x - 30 + PLAYER_MARK.x + 22) / 2, FLOOR_Y + 0.05, -1.6, accent);
    // Moldura do painel: travessa de cima, colunas e rodapé.
    baker.box(372, 7, 4, 0, BACKDROP.height + 3.5, BACKDROP.z + 1, "#121318");
    baker.box(5, BACKDROP.height + 7, 5, -BACKDROP.width / 2 - 3, (BACKDROP.height + 7) / 2, BACKDROP.z + 1, "#26282e");
    baker.box(5, BACKDROP.height + 7, 5, BACKDROP.width / 2 + 3, (BACKDROP.height + 7) / 2, BACKDROP.z + 1, "#26282e");
    baker.box(BACKDROP.width, 3, 1.2, 0, 1.5, BACKDROP.z + 0.6, shadeHex(primary, -60));
    glow.box(372, 1.3, 0.6, 0, BACKDROP.height + 0.4, BACKDROP.z + 3.4, primary);

    // Rebatedores (softbox) nos cantos do painel, virados para o meio das marcas
    // (longe do caminho da câmera: só aparecem quando o plano abre).
    const stand = new THREE.Matrix4();
    const turn = new THREE.Matrix4();
    for (const side of [-1, 1]) {
      const x = side * 150;
      const z = -14;
      stand.makeTranslation(x, 0, z).multiply(turn.makeRotationY(Math.atan2(PLAYER_MARK.x - x, PLAYER_MARK.z - z)));
      baker.box(1.4, 64, 1.4, 0, 32, 0, "#202226", stand);
      for (const angle of [0, 2.1, 4.2]) {
        baker.box(1, 1, 13, Math.sin(angle) * 5, 2.6, Math.cos(angle) * 5, "#202226", stand);
      }
      const head = new THREE.Matrix4().copy(stand).multiply(new THREE.Matrix4().makeTranslation(0, 68, 0)).multiply(new THREE.Matrix4().makeRotationX(0.22));
      baker.box(22, 22, 9, 0, 0, -2, "#16171a", head);
      glow.box(19.5, 19.5, 0.4, 0, 0, 2.6, "#fff4e2", head);
    }

    // Fotógrafos: um voltado para cada lado do jogador.
    const random = seededRandom(options.seed ^ 0x5eed);
    const placement = new THREE.Matrix4();
    const upper = new THREE.Matrix4();
    const tip = new THREE.Vector3();
    const flashPositions: number[] = [];
    const flashSizes: number[] = [];
    for (const [x, z, kneel] of PHOTOGRAPHER_SPOTS) {
      const yaw = Math.atan2(PLAYER_MARK.x - x, PLAYER_MARK.z - z) + (random() - 0.5) * 0.25;
      placement.makeTranslation(x, 0, z).multiply(turn.makeRotationY(yaw));
      const tones: Record<Tone, string> = {
        jacket: JACKETS[Math.floor(random() * JACKETS.length)],
        pants: PANTS[Math.floor(random() * PANTS.length)],
        skin: SKINS[Math.floor(random() * SKINS.length)],
        hair: HAIRS[Math.floor(random() * HAIRS.length)],
        shoe: "#111114",
        camera: "#121214",
        lens: "#1d1d21",
        ring: "#34343a",
        flash: "#e9e9ec",
        strap: "#0d0d10",
      };
      for (const [w, h, d, px, py, pz, tone, rx] of kneel ? KNEELING_LEGS : STANDING_LEGS) baker.box(w, h, d, px, py, pz, tones[tone], placement, rx ?? 0);
      upper.copy(placement).multiply(turn.makeTranslation(0, kneel ? -KNEEL_DROP : 0, kneel ? KNEEL_FORWARD : 0));
      for (const [w, h, d, px, py, pz, tone, rx] of UPPER_BODY) baker.box(w, h, d, px, py, pz, tones[tone], upper, rx ?? 0);
      tip.copy(FLASH_TIP).applyMatrix4(upper);
      flashPositions.push(tip.x, tip.y, tip.z);
      flashSizes.push(30);
    }
    // Imprensa ao fundo (fora do set): só os flashes, espalhados atrás dos fotógrafos.
    for (let index = PHOTOGRAPHERS; index < FLASH_UNITS; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      flashPositions.push(side * (30 + random() * 110), 26 + random() * 34, 132 + random() * 70);
      flashSizes.push(22);
    }

    const propsGeometry = baker.build();
    const propsMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
    const props = new THREE.Mesh(propsGeometry, propsMaterial);
    // Recebe a sombra do jogador no praticável; os fotógrafos não projetam (ficam na frente da luz principal).
    props.receiveShadow = true;
    this.group.add(props);
    const glowGeometry = glow.build();
    const glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    this.group.add(glowMesh);
    this.disposables.push(propsGeometry, propsMaterial, glowGeometry, glowMaterial);

    // ----------------------------------------------------------- flashes
    // No modo desempenho só os fotógrafos do set piscam (menos pontos na tela).
    this.units = lite ? PHOTOGRAPHERS : FLASH_UNITS;
    const flashGeometry = new THREE.BufferGeometry();
    flashGeometry.setAttribute("position", new THREE.Float32BufferAttribute(flashPositions, 3));
    flashGeometry.setAttribute("aSize", new THREE.Float32BufferAttribute(flashSizes, 1));
    this.brightness = new THREE.BufferAttribute(new Float32Array(FLASH_UNITS), 1);
    this.brightness.setUsage(THREE.DynamicDrawUsage);
    flashGeometry.setAttribute("aBright", this.brightness);
    flashGeometry.setDrawRange(0, this.units);
    const sprite = flashSprite();
    this.textureList.push(sprite);
    this.flashMaterial = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: sprite }, uScale: { value: 400 }, uColor: { value: new THREE.Color(1, 0.98, 0.95) } },
      vertexShader: FLASH_VERTEX,
      fragmentShader: FLASH_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(flashGeometry, this.flashMaterial);
    points.frustumCulled = false;
    points.renderOrder = 6;
    this.group.add(points);
    this.disposables.push(flashGeometry, this.flashMaterial);

    // ------------------------------------------------------------- luzes
    const target = new THREE.Vector3(PLAYER_MARK.x + 8, 18, PLAYER_MARK.z - 6);
    this.key.position.set(78, 140, 150);
    this.key.target.position.copy(target);
    this.key.castShadow = !lite;
    if (!lite) {
      this.key.shadow.mapSize.set(1024, 1024);
      this.key.shadow.camera.near = 120;
      this.key.shadow.camera.far = 420;
      this.key.shadow.bias = -0.0004;
      this.key.shadow.normalBias = 0.35;
    }
    this.fill.position.set(-130, 70, 120);
    this.fill.target.position.copy(target);
    this.rimLeft.position.set(-90, 100, -150);
    this.rimLeft.target.position.copy(target);
    this.rimRight.color.set(mixHex("#ffffff", primary, 0.35));
    this.rimRight.position.set(100, 100, -150);
    this.rimRight.target.position.copy(target);
    this.flashLeft.position.set(-40, 42, 96);
    this.flashRight.position.set(42, 42, 98);
    this.group.add(this.key, this.key.target, this.fill, this.fill.target, this.rimLeft, this.rimLeft.target, this.rimRight, this.rimRight.target, this.hemi, this.flashLeft);
    if (!lite) this.group.add(this.flashRight);
    this.disposables.push(this.key, this.fill, this.rimLeft, this.rimRight, this.hemi, this.flashLeft, this.flashRight);
  }

  textures(): THREE.Texture[] {
    return this.textureList;
  }

  /** Brilho de cada flash e a luz que eles jogam no palco. Devolve o clarão total (0..1,6). */
  update(time: number, schedule: FlashSchedule, calm: boolean, viewHeight: number, fov: number) {
    const array = this.brightness.array as Float32Array;
    let left = 0;
    let right = 0;
    let total = 0;
    for (let unit = 0; unit < this.units; unit += 1) {
      const value = flashBrightness(schedule, unit, time, calm);
      array[unit] = value;
      if (unit < PHOTOGRAPHERS) {
        if (unit < PHOTOGRAPHERS / 2) left += value;
        else right += value;
        total += value;
      } else {
        left += 0.3 * value;
        right += 0.3 * value;
        total += 0.3 * value;
      }
    }
    this.brightness.needsUpdate = true;
    // Altura do buffer / tan(meio campo de visão): o tamanho em pixels de um ponto a 1 unidade.
    this.flashMaterial.uniforms.uScale.value = viewHeight / 2 / Math.tan((fov * Math.PI) / 360);
    const lite = this.options.performance;
    this.flashLeft.intensity = Math.min(2.2, lite ? (left + right) * 1.1 : left * 1.5);
    this.flashRight.intensity = Math.min(2.2, right * 1.5);
    return Math.min(1.6, total);
  }

  dispose() {
    for (const item of this.disposables) item.dispose();
    for (const texture of this.textureList) texture.dispose();
    this.disposables.length = 0;
  }
}
