// O traço do jogador no gramado: fita de neon (giz luminoso) que segue o dedo,
// com setas correndo para a frente e ponta de flecha; a sombra pontilhada do
// voo previsto (altura); a mira no plano do gol (o tamanho mostra a
// imprecisão); o anel no recebedor do passe e o anel do herói.

import * as THREE from "three";
import { PITCH, type KickPlan, type Vec3 } from "../types";
import { clamp, clamp01 } from "./util";

const MAX_POINTS = 220;
const ARC_MAX = 120;
/** Primeiro vértice da flecha (fica no fim do buffer da fita). */
const ARROW = MAX_POINTS * 2;

// Cores fixas da fita e da mira: copiar é bem mais barato que ler "#hex" (ou
// criar uma Color) a cada quadro do desenho.
const NEUTRAL_START = new THREE.Color("#ffffff");
const NEUTRAL_END = new THREE.Color("#c9d3dc");
const SHOT_START = new THREE.Color("#fff3c4");
const SHOT_END = new THREE.Color("#ffb02e");
const SHOT_RISK = new THREE.Color("#ff3b2f");
const PASS_START = new THREE.Color("#e8fdff");
const PASS_END = new THREE.Color("#4fe8ff");
const PASS_RISK = new THREE.Color("#ff8a3d");
const RETICLE_COLOR = new THREE.Color("#ffd23f");

/** Sobe para a GPU só os `count` primeiros vértices (o resto não é desenhado). */
function uploadHead(attribute: THREE.BufferAttribute, count: number) {
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, count * attribute.itemSize);
  attribute.needsUpdate = true;
}

function fadeOf(mesh: THREE.Mesh) {
  return (mesh.material as THREE.ShaderMaterial).uniforms.uFade.value as number;
}

const RIBBON_VERTEX = /* glsl */ `
attribute float aU;
attribute float aV;
attribute float aT;
attribute float aArrow;
varying float vU;
varying float vV;
varying float vT;
varying float vArrow;
void main() {
  vU = aU;
  vV = aV;
  vT = aT;
  vArrow = aArrow;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const RIBBON_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uFade;
uniform float uGrow;
uniform vec3 uStart;
uniform vec3 uEnd;
uniform float uLength;
varying float vU;
varying float vV;
varying float vT;
varying float vArrow;
void main() {
  // Pontos que sobram no buffer (vT = 2) não desenham.
  if (vT > uGrow + 0.001) discard;
  vec3 tint = mix(uStart, uEnd, smoothstep(0.0, 1.0, vT));
  float across = 1.0 - abs(vV);
  float core = smoothstep(0.45, 0.85, across);
  float glow = pow(across, 1.6);
  // Setas correndo para a frente (a cada 1,1 m).
  float flow = fract(vU / 1.1 - uTime * 1.6);
  float chevron = smoothstep(0.0, 0.08, flow) * (1.0 - smoothstep(0.18, 0.32, flow + abs(vV) * 0.22));
  float startFade = smoothstep(0.0, 0.7, vU);
  float intensity = (glow * 0.55 + core * 0.9 + chevron * 0.7 * across) * startFade;
  if (vArrow > 0.5) intensity = 1.25 * smoothstep(0.0, 0.25, across) + 0.35;
  vec3 color = mix(tint, vec3(1.0), core * 0.55 + chevron * 0.25);
  float a = intensity * uFade;
  gl_FragColor = vec4(color * a, a);
}
`;

const ARC_VERTEX = /* glsl */ `
attribute float aU;
attribute float aV;
attribute float aDanger;
varying float vU;
varying float vV;
varying float vDanger;
void main() {
  vU = aU;
  vV = aV;
  vDanger = aDanger;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const ARC_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uFade;
uniform vec3 uColor;
varying float vU;
varying float vV;
varying float vDanger;
void main() {
  // Trecho ao alcance de um zagueiro: vermelho pulsando, mais cheio e mais
  // rápido (cortado no caminho); a disputa na chegada só puxa para o âmbar.
  float cut = step(0.75, vDanger);
  float contest = step(0.25, vDanger) * (1.0 - cut) * 0.45;
  float hot = cut;
  float dash = step(mix(0.45, 0.25, hot), fract(vU / 0.55 - uTime * mix(0.8, 1.8, hot)));
  float across = 1.0 - abs(vV);
  vec3 color = mix(uColor, vec3(1.0, 0.66, 0.16), contest);
  color = mix(color, vec3(1.0, 0.2, 0.16), cut);
  float pulse = 1.0 + cut * 0.35 * sin(uTime * 14.0);
  float a = dash * smoothstep(0.0, 0.7, across) * uFade * mix(0.55, 0.95, hot) * pulse;
  if (a < 0.01) discard;
  gl_FragColor = vec4(color * a, a);
}
`;

const RING_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Anel decalque: 0 herói (calmo), 1 recebedor (pulsando), 2 mira do gol, 3 área de chegada. */
const RING_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uFade;
uniform vec3 uColor;
uniform float uKind;
varying vec2 vUv;
void main() {
  float r = length(vUv);
  float angle = atan(vUv.y, vUv.x);
  float a = 0.0;
  if (uKind < 0.5) {
    float ring = smoothstep(0.08, 0.0, abs(r - 0.8));
    float dash = step(0.35, fract(angle * 3.0 / 3.14159 + uTime * 0.15));
    a = ring * (0.45 + 0.55 * dash) + smoothstep(0.85, 0.0, r) * 0.12;
  } else if (uKind < 1.5) {
    float pulse = fract(uTime * 0.9);
    float ring = smoothstep(0.09, 0.0, abs(r - 0.72));
    float wave = smoothstep(0.08, 0.0, abs(r - (0.3 + pulse * 0.68))) * (1.0 - pulse);
    a = ring + wave * 0.8 + smoothstep(0.75, 0.0, r) * 0.18;
  } else if (uKind < 2.5) {
    float ring = smoothstep(0.06, 0.0, abs(r - 0.82));
    float ticks = step(0.75, fract(angle * 4.0 / 3.14159 - uTime * 0.25)) * smoothstep(0.12, 0.0, abs(r - 0.66));
    float cross = (smoothstep(0.035, 0.0, abs(vUv.x)) + smoothstep(0.035, 0.0, abs(vUv.y))) * step(0.18, r) * step(r, 0.5);
    float dot = smoothstep(0.1, 0.04, r);
    a = ring + ticks + cross * 0.8 + dot;
    a *= 0.85 + 0.15 * sin(uTime * 8.0);
  } else {
    float edge = smoothstep(0.07, 0.0, abs(r - 0.9));
    float fill = smoothstep(1.0, 0.0, r) * 0.22;
    a = edge * 0.9 + fill;
  }
  a *= smoothstep(1.0, 0.94, r) * uFade;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;

function ringMesh(kind: number, color: string, time: { value: number }) {
  const material = new THREE.ShaderMaterial({
    vertexShader: RING_VERTEX,
    fragmentShader: RING_FRAGMENT,
    uniforms: { uTime: time, uFade: { value: 0 }, uColor: { value: new THREE.Color(color) }, uKind: { value: kind } },
    transparent: true,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  mesh.renderOrder = 4;
  mesh.visible = false;
  return mesh;
}

export class StrokeView {
  readonly group = new THREE.Group();
  private readonly ribbon: THREE.Mesh;
  private readonly ribbonGeometry: THREE.BufferGeometry;
  private readonly ribbonMaterial: THREE.ShaderMaterial;
  private readonly rPos: Float32Array;
  private readonly rU: Float32Array;
  private readonly rV: Float32Array;
  private readonly rT: Float32Array;
  private readonly rArrow: Float32Array;
  private readonly arc: THREE.Mesh;
  private readonly arcGeometry: THREE.BufferGeometry;
  private readonly arcMaterial: THREE.ShaderMaterial;
  private readonly aPos: Float32Array;
  private readonly aU: Float32Array;
  private readonly aDanger: Float32Array;
  private readonly heroRing: THREE.Mesh;
  private readonly receiverRing: THREE.Mesh;
  private readonly reticle: THREE.Mesh;
  private readonly landing: THREE.Mesh;
  private readonly time: { value: number };
  private fade = 0;
  private fadeTarget = 0;
  private plan: KickPlan | null = null;
  private heroFade = 0;
  private hasStroke = false;
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpC = new THREE.Vector3();
  private readonly tmpD = new THREE.Vector3();
  // Vetores reaproveitados: a fita é refeita a cada quadro do desenho.
  private readonly raw: THREE.Vector3[] = [];
  private readonly samples: THREE.Vector3[] = Array.from({ length: MAX_POINTS }, () => new THREE.Vector3());
  private readonly facing = new THREE.Vector3();
  private readonly endSide = new THREE.Vector3();
  private readonly endDir = new THREE.Vector3();
  private readonly arcPrev = new THREE.Vector3();
  private readonly ribbonAttributes: THREE.BufferAttribute[];
  private readonly arcAttributes: THREE.BufferAttribute[];
  /** Quantos pontos a fita tinha quando a flecha entrou no índice (começa no fim do buffer). */
  private arrowAt = MAX_POINTS;

  constructor(
    private readonly camera: THREE.Camera,
    time: { value: number },
  ) {
    this.time = time;
    // Fita: 2 vértices por ponto + 3 da flecha.
    const vertexCount = MAX_POINTS * 2 + 3;
    this.rPos = new Float32Array(vertexCount * 3);
    this.rU = new Float32Array(vertexCount);
    this.rV = new Float32Array(vertexCount);
    this.rT = new Float32Array(vertexCount);
    this.rArrow = new Float32Array(vertexCount);
    // Lado da fita (-1/1) e a marca da flecha não mudam: sobem uma vez só.
    for (let index = 0; index < MAX_POINTS; index += 1) {
      this.rV[index * 2] = -1;
      this.rV[index * 2 + 1] = 1;
    }
    // Flecha cheia: o brilho vem do ramo "vArrow" do shader (miolo na ponta).
    this.rV[ARROW] = -0.2;
    this.rV[ARROW + 1] = 0.2;
    this.rV[ARROW + 2] = 0;
    this.rArrow.fill(1, ARROW);
    const position = new THREE.BufferAttribute(this.rPos, 3).setUsage(THREE.DynamicDrawUsage);
    const u = new THREE.BufferAttribute(this.rU, 1).setUsage(THREE.DynamicDrawUsage);
    const t = new THREE.BufferAttribute(this.rT, 1).setUsage(THREE.DynamicDrawUsage);
    this.ribbonAttributes = [position, u, t];
    this.ribbonGeometry = new THREE.BufferGeometry();
    this.ribbonGeometry.setAttribute("position", position);
    this.ribbonGeometry.setAttribute("aU", u);
    this.ribbonGeometry.setAttribute("aV", new THREE.BufferAttribute(this.rV, 1));
    this.ribbonGeometry.setAttribute("aT", t);
    this.ribbonGeometry.setAttribute("aArrow", new THREE.BufferAttribute(this.rArrow, 1));
    const indices: number[] = [];
    for (let index = 0; index < MAX_POINTS - 1; index += 1) {
      const a = index * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    indices.push(ARROW, ARROW + 1, ARROW + 2);
    this.ribbonGeometry.setIndex(indices);
    this.ribbonMaterial = new THREE.ShaderMaterial({
      vertexShader: RIBBON_VERTEX,
      fragmentShader: RIBBON_FRAGMENT,
      uniforms: {
        uTime: time,
        uFade: { value: 0 },
        uGrow: { value: 1 },
        uStart: { value: new THREE.Color("#ffffff") },
        uEnd: { value: new THREE.Color("#5ff2ff") },
        uLength: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      // Pré-multiplicado: brilha sobre o gramado sem lavar a cor.
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.ribbon = new THREE.Mesh(this.ribbonGeometry, this.ribbonMaterial);
    this.ribbon.frustumCulled = false;
    this.ribbon.renderOrder = 5;
    this.ribbon.visible = false;
    this.group.add(this.ribbon);

    this.aPos = new Float32Array(ARC_MAX * 2 * 3);
    this.aU = new Float32Array(ARC_MAX * 2);
    this.aDanger = new Float32Array(ARC_MAX * 2);
    const aV = new Float32Array(ARC_MAX * 2);
    for (let index = 0; index < ARC_MAX; index += 1) {
      aV[index * 2] = -1;
      aV[index * 2 + 1] = 1;
    }
    const arcIndices: number[] = [];
    for (let index = 0; index < ARC_MAX - 1; index += 1) {
      const a = index * 2;
      arcIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const arcPosition = new THREE.BufferAttribute(this.aPos, 3).setUsage(THREE.DynamicDrawUsage);
    const arcU = new THREE.BufferAttribute(this.aU, 1).setUsage(THREE.DynamicDrawUsage);
    const arcDanger = new THREE.BufferAttribute(this.aDanger, 1).setUsage(THREE.DynamicDrawUsage);
    this.arcAttributes = [arcPosition, arcU, arcDanger];
    this.arcGeometry = new THREE.BufferGeometry();
    this.arcGeometry.setAttribute("position", arcPosition);
    this.arcGeometry.setAttribute("aU", arcU);
    this.arcGeometry.setAttribute("aV", new THREE.BufferAttribute(aV, 1));
    this.arcGeometry.setAttribute("aDanger", arcDanger);
    this.arcGeometry.setIndex(arcIndices);
    this.arcMaterial = new THREE.ShaderMaterial({
      vertexShader: ARC_VERTEX,
      fragmentShader: ARC_FRAGMENT,
      uniforms: { uTime: time, uFade: { value: 0 }, uColor: { value: new THREE.Color("#ffffff") } },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
    });
    this.arc = new THREE.Mesh(this.arcGeometry, this.arcMaterial);
    this.arc.frustumCulled = false;
    this.arc.renderOrder = 5;
    this.arc.visible = false;
    this.group.add(this.arc);

    this.heroRing = ringMesh(0, "#ffd76a", time);
    this.heroRing.rotation.x = -Math.PI / 2;
    this.receiverRing = ringMesh(1, "#6ff3ff", time);
    this.receiverRing.rotation.x = -Math.PI / 2;
    this.landing = ringMesh(3, "#6ff3ff", time);
    this.landing.rotation.x = -Math.PI / 2;
    this.reticle = ringMesh(2, "#ffd23f", time);
    // Mira de pé no plano da linha do gol, de frente para o campo.
    this.reticle.rotation.y = Math.PI;
    this.group.add(this.heroRing, this.receiverRing, this.landing, this.reticle);
  }

  /** O traço (pontos no mundo) e a prévia do plano. `null` apaga com um esmaecer curto. */
  set(points: Vec3[] | null, plan: KickPlan | null) {
    this.plan = plan;
    if (!points || points.length < 2) {
      this.fadeTarget = 0;
      if (!points) this.plan = null;
      return;
    }
    this.hasStroke = true;
    this.fadeTarget = 1;
    this.buildRibbon(points, plan);
    this.buildArc(plan);
  }

  private buildRibbon(points: Vec3[], plan: KickPlan | null) {
    // Reamostra a cada ~0,2 m e alisa (o dedo treme).
    const rawCount = points.length;
    const raw = this.raw;
    while (raw.length < rawCount) raw.push(new THREE.Vector3());
    for (let index = 0; index < rawCount; index += 1) {
      const p = points[index];
      raw[index].set(p.x, Math.max(0, p.y), p.z);
    }
    let total = 0;
    for (let index = 1; index < rawCount; index += 1) total += raw[index].distanceTo(raw[index - 1]);
    if (total < 0.05) return;
    const step = Math.max(0.2, total / (MAX_POINTS - 1));
    const samples = this.samples;
    samples[0].copy(raw[0]);
    let count = 1;
    let carry = 0;
    for (let index = 1; index < rawCount; index += 1) {
      const a = raw[index - 1];
      const b = raw[index];
      const length = a.distanceTo(b);
      let t = step - carry;
      while (t <= length && count < MAX_POINTS - 1) {
        samples[count].copy(a).lerp(b, t / length);
        count += 1;
        t += step;
      }
      carry = length - (t - step);
    }
    const last = raw[rawCount - 1];
    if (samples[count - 1].distanceTo(last) > 0.02) {
      samples[count].copy(last);
      count += 1;
    }
    for (let pass = 0; pass < 2; pass += 1) {
      for (let index = 1; index < count - 1; index += 1) {
        samples[index].lerpVectors(samples[index - 1], samples[index + 1], 0.5).lerp(samples[index], 0.5);
      }
    }
    const cam = this.camera.position;
    const up = this.tmpD.set(0, 1, 0);
    let along = 0;
    const endSide = this.endSide.set(1, 0, 0);
    const endDir = this.endDir.set(0, 0, 1);
    let endWidth = 0.3;
    for (let index = 0; index < count; index += 1) {
      const p = samples[index];
      if (index > 0) along += p.distanceTo(samples[index - 1]);
      const next = samples[Math.min(count - 1, index + 1)];
      const prev = samples[Math.max(0, index - 1)];
      const tangent = this.tmpA.subVectors(next, prev);
      if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, 1);
      tangent.normalize();
      // No chão a fita deita; no ar (plano do gol) vira de frente para a câmera.
      const ground = this.tmpB.crossVectors(tangent, up);
      const view = this.tmpC.subVectors(cam, p).normalize();
      const facing = this.facing.crossVectors(tangent, view);
      const air = clamp01((p.y - 0.08) / 0.4);
      const side = ground.lengthSq() > 1e-6 ? ground.normalize().lerp(facing.normalize(), air).normalize() : facing.normalize();
      const distance = cam.distanceTo(p);
      const width = 0.17 + distance * 0.0065;
      const lift = 0.03;
      const o = index * 6;
      this.rPos[o] = p.x - side.x * width;
      this.rPos[o + 1] = p.y + lift - side.y * width;
      this.rPos[o + 2] = p.z - side.z * width;
      this.rPos[o + 3] = p.x + side.x * width;
      this.rPos[o + 4] = p.y + lift + side.y * width;
      this.rPos[o + 5] = p.z + side.z * width;
      this.rU[index * 2] = along;
      this.rU[index * 2 + 1] = along;
      if (index === count - 1) {
        endSide.copy(side);
        endDir.copy(tangent);
        endWidth = width;
      }
    }
    for (let index = 0; index < count; index += 1) {
      const t = along > 0 ? this.rU[index * 2] / along : 0;
      this.rT[index * 2] = t * 0.97;
      this.rT[index * 2 + 1] = t * 0.97;
    }
    // Flecha: base um pouco mais larga que a fita, ponta à frente do último ponto.
    const tip = samples[count - 1];
    const arrowWidth = endWidth * 2.3;
    const arrowLength = endWidth * 3.2;
    this.arrowVertex(ARROW, tip.x - endSide.x * arrowWidth, tip.y - endSide.y * arrowWidth, tip.z - endSide.z * arrowWidth, along);
    this.arrowVertex(ARROW + 1, tip.x + endSide.x * arrowWidth, tip.y + endSide.y * arrowWidth, tip.z + endSide.z * arrowWidth, along);
    this.arrowVertex(ARROW + 2, tip.x + endDir.x * arrowLength, tip.y + endDir.y * arrowLength, tip.z + endDir.z * arrowLength, along);

    // A esfera envolvente da fita sai das posições no primeiro quadro em que ela
    // aparece (e nunca mais) e é ela que ordena fita e prévia (as duas com
    // renderOrder 5). Até lá, as sobras do buffer colapsam no último ponto como
    // antes, para a ordem ser a de sempre; elas não sobem nem são desenhadas.
    if (this.ribbonGeometry.boundingSphere === null) {
      const s = (count - 1) * 6;
      for (let index = count; index < MAX_POINTS; index += 1) {
        const o = index * 6;
        for (let k = 0; k < 6; k += 1) this.rPos[o + k] = this.rPos[s + k];
      }
    }

    // Índices: a fita usa (count-1) quads e a flecha vem logo depois deles (a
    // mesma ordem de desenho de antes, sem os quads vazios do fim do buffer).
    // Sobe só o que é desenhado: os vértices da fita e os três da flecha.
    this.placeArrow(count);
    for (const attribute of this.ribbonAttributes) {
      uploadHead(attribute, count * 2);
      attribute.addUpdateRange(ARROW * attribute.itemSize, 3 * attribute.itemSize);
    }
    this.ribbonMaterial.uniforms.uLength.value = along;

    // Cor: passe azul gelo, chute dourado→laranja; imprecisão puxa para o vermelho.
    const accuracy = plan ? clamp01(plan.accuracy) : 1;
    let cutRisk = 0;
    for (const span of plan?.danger ?? []) if (!span.contest) cutRisk = 0.55;
    const risk = Math.max(1 - accuracy, cutRisk);
    const start = this.ribbonMaterial.uniforms.uStart.value as THREE.Color;
    const end = this.ribbonMaterial.uniforms.uEnd.value as THREE.Color;
    if (!plan) {
      start.copy(NEUTRAL_START);
      end.copy(NEUTRAL_END);
    } else if (plan.shot) {
      start.copy(SHOT_START);
      end.copy(SHOT_END).lerp(SHOT_RISK, clamp01(risk * 1.4));
    } else {
      start.copy(PASS_START);
      end.copy(PASS_END).lerp(PASS_RISK, clamp01(risk * 1.4));
    }
    this.ribbon.visible = true;
  }

  private arrowVertex(vertex: number, x: number, y: number, z: number, along: number) {
    this.rPos[vertex * 3] = x;
    this.rPos[vertex * 3 + 1] = y + 0.035;
    this.rPos[vertex * 3 + 2] = z;
    this.rU[vertex] = along;
    this.rT[vertex] = 1;
  }

  /**
   * Leva o triângulo da flecha para logo depois do último quad da fita (o
   * primeiro triângulo do quad seguinte, que só desenhava pontos colapsados) e
   * devolve o quad de onde ela saiu. Os trechos mudados se acumulam até o
   * próximo upload (um quadro sem render não perde nenhum).
   */
  private placeArrow(count: number) {
    if (count === this.arrowAt) return;
    const index = this.ribbonGeometry.index!;
    const array = index.array;
    if (this.arrowAt < MAX_POINTS) {
      const slot = (this.arrowAt - 1) * 6;
      const a = (this.arrowAt - 1) * 2;
      array[slot] = a;
      array[slot + 1] = a + 1;
      array[slot + 2] = a + 2;
      index.addUpdateRange(slot, 3);
    }
    const slot = (count - 1) * 6;
    array[slot] = ARROW;
    array[slot + 1] = ARROW + 1;
    array[slot + 2] = ARROW + 2;
    index.addUpdateRange(slot, 3);
    index.needsUpdate = true;
    this.arrowAt = count;
    this.ribbonGeometry.setDrawRange(0, slot + 3);
  }

  private buildArc(plan: KickPlan | null) {
    const path = plan?.preview ?? [];
    if (path.length < 2) {
      this.arc.visible = false;
      return;
    }
    const cam = this.camera.position;
    const count = Math.min(path.length, ARC_MAX);
    const stride = path.length / count;
    let along = 0;
    let prev: THREE.Vector3 | null = null;
    const prevPoint = this.arcPrev;
    const p = this.tmpA;
    const n = this.tmpB;
    const spans = plan?.danger ?? [];
    for (let index = 0; index < count; index += 1) {
      const srcIndex = Math.min(path.length - 1, Math.round(index * stride));
      const src = path[srcIndex];
      const u = srcIndex / Math.max(1, path.length - 1);
      let danger = 0;
      // A disputa na chegada fica em âmbar fraco; o corte no caminho, vermelho.
      for (const span of spans) if (u >= span.from - 0.02 && u <= span.to + 0.02) danger = Math.max(danger, span.contest ? 0.3 : 1);
      this.aDanger[index * 2] = danger;
      this.aDanger[index * 2 + 1] = danger;
      p.set(src.x, Math.max(0.05, src.y), src.z);
      const nextSrc = path[Math.min(path.length - 1, Math.round((index + 1) * stride))];
      n.set(nextSrc.x - src.x, nextSrc.y - src.y, nextSrc.z - src.z);
      if (n.lengthSq() < 1e-8 && prev) n.subVectors(p, prev);
      if (n.lengthSq() < 1e-8) n.set(0, 0, 1);
      n.normalize();
      if (prev) along += p.distanceTo(prev);
      const view = this.tmpC.subVectors(cam, p).normalize();
      const side = this.tmpD.crossVectors(n, view).normalize();
      const width = 0.035 + cam.distanceTo(p) * 0.0016;
      const o = index * 6;
      this.aPos[o] = p.x - side.x * width;
      this.aPos[o + 1] = p.y - side.y * width;
      this.aPos[o + 2] = p.z - side.z * width;
      this.aPos[o + 3] = p.x + side.x * width;
      this.aPos[o + 4] = p.y + side.y * width;
      this.aPos[o + 5] = p.z + side.z * width;
      this.aU[index * 2] = along;
      this.aU[index * 2 + 1] = along;
      prev = prevPoint.copy(p);
    }
    this.arcGeometry.setDrawRange(0, (count - 1) * 6);
    for (const attribute of this.arcAttributes) uploadHead(attribute, count * 2);
    this.arc.visible = true;
  }

  /**
   * `hero`: onde está o herói (anel no pé) ou null fora da mira.
   * `receiver`: posição do recebedor do passe em mira. `dim`: o traço
   * fica mais fraco durante a jogada (giz no gramado, sem roubar a cena).
   */
  update(dt: number, hero: { x: number; z: number } | null, receiver: { x: number; z: number } | null, dim = 1) {
    const goal = this.fadeTarget * dim;
    const rate = goal > this.fade ? 14 : 7;
    this.fade = THREE.MathUtils.damp(this.fade, goal, rate, dt);
    const visible = this.fade > 0.01;
    this.ribbon.visible = visible && this.hasStroke;
    this.ribbonMaterial.uniforms.uFade.value = this.fade;
    this.arcMaterial.uniforms.uFade.value = this.fade;
    this.arc.visible = this.arc.visible && visible;
    if (!visible && this.fadeTarget === 0) this.hasStroke = false;

    const plan = this.plan;
    // Mira no gol (chute) com o tamanho da imprecisão.
    const retMat = this.reticle.material as THREE.ShaderMaterial;
    const aiming = dim >= 1;
    if (plan && plan.shot && this.fadeTarget > 0 && aiming) {
      const spread = 0.42 + (1 - clamp01(plan.accuracy)) * 1.3;
      const tz = PITCH.goalLineZ - 0.05;
      this.reticle.position.set(plan.target.x, clamp(plan.target.y, spread * 0.4, PITCH.goalHeight + 1.5), tz);
      this.reticle.scale.setScalar(spread * 2);
      (retMat.uniforms.uColor.value as THREE.Color).copy(RETICLE_COLOR).lerp(SHOT_RISK, clamp01((1 - plan.accuracy) * 1.3));
      this.reticle.visible = true;
    }
    retMat.uniforms.uFade.value = THREE.MathUtils.damp(retMat.uniforms.uFade.value, plan && plan.shot && this.fadeTarget > 0 && aiming ? 1 : 0, 10, dt);
    if (retMat.uniforms.uFade.value < 0.01) this.reticle.visible = false;

    // Bola no espaço (passe sem recebedor): mancha de chegada no gramado.
    const landMat = this.landing.material as THREE.ShaderMaterial;
    const landing = plan && !plan.shot && !plan.receiver && this.fadeTarget > 0 && aiming;
    if (landing && plan) {
      const spread = 0.7 + (1 - clamp01(plan.accuracy)) * 2.2;
      this.landing.position.set(plan.target.x, 0.04, plan.target.z);
      this.landing.scale.setScalar(spread * 2);
      this.landing.visible = true;
    }
    landMat.uniforms.uFade.value = THREE.MathUtils.damp(landMat.uniforms.uFade.value, landing ? 1 : 0, 10, dt);
    if (landMat.uniforms.uFade.value < 0.01) this.landing.visible = false;

    const recMat = this.receiverRing.material as THREE.ShaderMaterial;
    if (receiver) {
      this.receiverRing.position.set(receiver.x, 0.045, receiver.z);
      this.receiverRing.scale.setScalar(2.4);
      this.receiverRing.visible = true;
    }
    recMat.uniforms.uFade.value = THREE.MathUtils.damp(recMat.uniforms.uFade.value, receiver ? 1 : 0, 12, dt);
    if (recMat.uniforms.uFade.value < 0.01) this.receiverRing.visible = false;

    const heroMat = this.heroRing.material as THREE.ShaderMaterial;
    this.heroFade = THREE.MathUtils.damp(this.heroFade, hero ? 1 : 0, hero ? 6 : 10, dt);
    if (hero) this.heroRing.position.set(hero.x, 0.04, hero.z);
    this.heroRing.scale.setScalar(1.9);
    heroMat.uniforms.uFade.value = this.heroFade * 0.85;
    this.heroRing.visible = this.heroFade > 0.01;
  }

  /**
   * Nada do traço mudando na tela: sem traço nem prévia, mira e anéis apagados
   * e o anel do herói parado (aceso ou apagado). A mira parada pode desenhar
   * mais devagar sem cortar nenhum esmaecer.
   */
  get settled(): boolean {
    return (
      this.fadeTarget === 0 &&
      this.fade < 0.01 &&
      fadeOf(this.reticle) < 0.01 &&
      fadeOf(this.landing) < 0.01 &&
      fadeOf(this.receiverRing) < 0.01 &&
      (this.heroFade > 0.99 || this.heroFade < 0.01)
    );
  }

  /** Há um traço na tela agora. */
  get drawing() {
    return this.fadeTarget > 0 && this.hasStroke;
  }

  get receiverId() {
    return this.fadeTarget > 0 ? this.plan?.receiver ?? null : null;
  }

  /** 0..1: quanto o herói arma a perna (traço mais longo e forte = mais armado). */
  get aimRatio() {
    if (this.fadeTarget === 0 || !this.plan) return this.fadeTarget * 0.3;
    return clamp01(0.35 + this.plan.speed / 40);
  }

  dispose() {
    this.ribbonGeometry.dispose();
    this.ribbonMaterial.dispose();
    this.arcGeometry.dispose();
    this.arcMaterial.dispose();
    for (const mesh of [this.heroRing, this.receiverRing, this.reticle, this.landing]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  }
}
