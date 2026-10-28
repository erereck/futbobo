// Torcida 3D das fileiras da frente: torcedores de blocos (mesmo traço dos
// bonecos: cabeção, corpo, braços e pernas) instanciados aos milhares e
// animados inteiros no vertex shader — sentados ou de pé, levantando com a
// bola indo para o gol, mãos na cabeça no "uuuh", pulando e balançando os
// braços no gol (caos no começo, todos no mesmo pulo depois). As cabeças
// acompanham a bola. Uma malha por fatia de 36° em volta do campo, para o
// recorte de câmera deixar de fora quem está fora da tela.

import * as THREE from "three";
import { SKIN_COLORS } from "../../player-appearance";
import { ENV_FOG, ENV_LIGHT, type EnvUniforms, seeded } from "./util";
import type { Seat } from "./stadium";

type FanBase = {
  position: THREE.BufferAttribute;
  normal: THREE.BufferAttribute;
  aPart: THREE.BufferAttribute;
  /** Oito cantos por caixa (40 vértices): a normal da face sai das derivadas no fragment. */
  corners: THREE.BufferAttribute;
  /** Quatro vértices por face com a normal no atributo (96): GPU sem highp no fragment. */
  faces: THREE.BufferAttribute;
};

/** Não depende da fase: montado uma vez e reaproveitado (cada renderer sobe o seu buffer). */
let fanBase: FanBase | null = null;

/**
 * Peças: 0 corpo, 1 cabeça, 2 braço esquerdo, 3 braço direito, 4 pernas. Frente em +z local.
 * Os dois jeitos ficam no mesmo buffer (faces primeiro, cantos depois); o índice escolhe.
 */
function fanGeometry(): FanBase {
  if (fanBase) return fanBase;
  const positions: number[] = [];
  const normals: number[] = [];
  const parts: number[] = [];
  const indices: number[] = [];
  const cornerPositions: number[] = [];
  const cornerParts: number[] = [];
  const cornerIndices: number[] = [];
  const faces: Array<[number[], number[], number[]]> = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  const box = (size: number[], center: number[], part: number, skip: { top?: boolean; bottom?: boolean }) => {
    const half = [size[0] / 2, size[1] / 2, size[2] / 2];
    const extent = (axis: number[]) => Math.abs(axis[0]) * half[0] + Math.abs(axis[1]) * half[1] + Math.abs(axis[2]) * half[2];
    // Cantos da caixa: o bit de cada eixo diz o lado (+ ou -).
    const first = cornerPositions.length / 3;
    for (let id = 0; id < 8; id += 1) {
      for (let axis = 0; axis < 3; axis += 1) cornerPositions.push(center[axis] + ((id >> axis) & 1 ? half[axis] : -half[axis]));
      cornerParts.push(part);
    }
    for (const [n, u, v] of faces) {
      if (skip.bottom && n[1] === -1) continue;
      if (skip.top && n[1] === 1) continue;
      const base = positions.length / 3;
      const dn = extent(n);
      const du = extent(u);
      const dv = extent(v);
      const ids: number[] = [];
      for (const [su, sv] of corners) {
        let id = 0;
        for (let axis = 0; axis < 3; axis += 1) {
          positions.push(center[axis] + n[axis] * dn + u[axis] * du * su + v[axis] * dv * sv);
          if (n[axis] + u[axis] * su + v[axis] * sv > 0) id |= 1 << axis;
        }
        normals.push(n[0], n[1], n[2]);
        parts.push(part);
        ids.push(first + id);
      }
      indices.push(base, base + 1, base + 3, base, base + 3, base + 2);
      cornerIndices.push(ids[0], ids[1], ids[3], ids[0], ids[3], ids[2]);
    }
  };
  box([0.38, 0.62, 0.24], [0, 0.31, 0.01], 4, { bottom: true, top: true });
  box([0.48, 0.62, 0.27], [0, 0.93, 0], 0, { bottom: true });
  box([0.38, 0.38, 0.38], [0, 1.43, 0.01], 1, { bottom: true });
  // Braços pendurados do ombro (±0,3; 1,2): é em volta dele que giram no shader.
  box([0.13, 0.58, 0.13], [-0.305, 0.93, 0], 2, { top: true });
  box([0.13, 0.58, 0.13], [0.305, 0.93, 0], 3, { top: true });
  const offset = positions.length / 3;
  fanBase = {
    position: new THREE.Float32BufferAttribute([...positions, ...cornerPositions], 3),
    normal: new THREE.Float32BufferAttribute([...normals, ...cornerPositions.map(() => 0)], 3),
    aPart: new THREE.Float32BufferAttribute([...parts, ...cornerParts], 1),
    corners: new THREE.Uint16BufferAttribute(cornerIndices.map((index) => index + offset), 1),
    faces: new THREE.Uint16BufferAttribute(indices, 1),
  };
  return fanBase;
}

const CROWD_VERTEX = /* glsl */ `
attribute float aPart;
attribute vec4 aSeat;
attribute vec4 aFan;
attribute vec3 aShirt;
attribute vec3 aSkin;
uniform float uTime;
uniform float uCheer;
uniform float uCheerT;
uniform float uOoh;
uniform float uTension;
uniform float uCalm;
uniform vec3 uBall;
varying vec3 vColor;
#ifdef CROWD_FACE_NORMALS
varying vec3 vNormal;
#else
varying vec3 vWorld;
#endif
varying float vDepth;

vec3 rotX(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
vec3 rotY(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }
vec3 rotZ(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(p.x * c - p.y * s, p.x * s + p.y * c, p.z); }

void main() {
  float phase = aFan.x;
  float energy = aFan.y;
  float standing = aFan.z;
  float hairKind = aFan.w;
  vec3 p = position;
  float isHead = step(0.5, aPart) * step(aPart, 1.5);
  float isArm = step(1.5, aPart) * step(aPart, 3.5);
  float side = aPart > 2.5 ? 1.0 : -1.0;

  // De pé: quem já estava, todo mundo na tensão do chute e no gol.
  float up = clamp(max(standing, max(uTension * 1.4 - 0.2, max(uCheer, uOoh))), 0.0, 1.0);
  float sync = max(uCalm, smoothstep(0.9, 1.6, uCheerT));
  float wild = max(0.0, sin(uCheerT * 8.5 * (0.75 + energy * 0.5) + phase * 6.2831));
  float beat = max(0.0, sin(uCheerT * 12.6 + aSeat.y * 0.25));
  float jump = uCheer * mix(wild, beat, sync) * mix(0.38, 0.12, uCalm) * energy;
  float bounce = 0.025 * max(0.0, sin(uTime * (1.6 + energy) + phase * 6.2831)) * (1.0 - uCheer);
  float lift = -0.4 * (1.0 - up) + jump + bounce;

  // Braços: soltos; à frente na tensão; para cima no gol (balançando); na cabeça no "uuuh".
  float clap = step(0.72, fract(phase * 7.3)) * (1.0 - uCheer) * (1.0 - uOoh);
  float az = 0.08 + clap * 0.25;
  float ax = -0.25 * uTension - clap * (0.55 + 0.25 * sin(uTime * 9.0 + phase * 20.0));
  float swing = mix(sin(uCheerT * 10.0 * energy + phase * 9.0 + side), sin(uCheerT * 12.6 + 1.3), sync);
  az = mix(az, 2.75 + 0.3 * swing, uCheer);
  ax = mix(ax, -0.1, uCheer);
  az = mix(az, 2.55, uOoh);
  ax = mix(ax, -0.75, uOoh);
  vec3 shoulder = vec3(0.305 * side, 1.2, 0.0);
  vec3 armP = rotZ(rotX(p - shoulder, ax), side * az) + shoulder;
  p = mix(p, armP, isArm);

  // Cabeça segue a bola (yaw local, com limite de pescoço).
  vec2 toBall = uBall.xz - aSeat.xz;
  float want = atan(toBall.x, toBall.y) - aSeat.w;
  want = atan(sin(want), cos(want));
  float headYaw = clamp(want, -0.8, 0.8) * (1.0 - uCheer * 0.6);
  vec3 neck = vec3(0.0, 1.24, 0.0);
  p = mix(p, rotY(p - neck, headYaw) + neck, isHead);
  // "Uuuh": corpo vai para trás.
  float lean = -0.18 * uOoh * energy;
  p = rotX(p, lean);
  p.y += lift;

  vec3 world = rotY(p, aSeat.w) + aSeat.xyz;
#ifdef CROWD_FACE_NORMALS
  // Normal da face no atributo, girada junto com a peça.
  vec3 n = mix(normal, rotZ(rotX(normal, ax), side * az), isArm);
  n = mix(n, rotY(n, headYaw), isHead);
  vNormal = rotY(rotX(n, lean), aSeat.w);
#else
  vWorld = world;
#endif

  vec3 color = aShirt;
  float shortSleeve = step(0.5, fract(phase * 3.1));
  color = mix(color, mix(aShirt, aSkin, shortSleeve * step(position.y, 0.84)), isArm);
  color = mix(color, aSkin, isHead);
  // Cabelo no topo da cabeça (alguns carecas, alguns de boné na cor do time).
  float hairTop = isHead * step(1.56, position.y + 0.0) ;
  vec3 hairColor = hairKind < 0.15 ? aShirt : hairKind < 0.25 ? aSkin * 0.9 : vec3(0.06, 0.045, 0.035) * (0.6 + hairKind);
  color = mix(color, hairColor, hairTop);
  color = mix(color, vec3(0.1, 0.12, 0.18), step(3.5, aPart));
  vColor = color;
  vec4 mv = viewMatrix * vec4(world, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const CROWD_FRAGMENT = /* glsl */ `
varying vec3 vColor;
#ifdef CROWD_FACE_NORMALS
varying vec3 vNormal;
#else
varying vec3 vWorld;
#endif
varying float vDepth;
${ENV_LIGHT}
${ENV_FOG}
void main() {
#ifdef CROWD_FACE_NORMALS
  vec3 n = normalize(vNormal);
#else
  // Caixas planas: a normal da face sai das derivadas da posição (virada para a câmera).
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (dot(n, cameraPosition - vWorld) < 0.0) n = -n;
#endif
  vec3 color = envLight(vColor, n);
  gl_FragColor = vec4(envFog(color, vDepth), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Fatias em volta do campo (ângulo de atan2(x, z)), cada uma recortada pela câmera sozinha. */
const SECTORS = 10;
/** Fatia com menos torcedores que isso entra na vizinha mais perto do gol (não paga o draw call). */
const MIN_SECTOR = 64;

export type CrowdColors = { homeA: string; homeB: string; awayA: string };

export class Crowd {
  readonly group = new THREE.Group();
  readonly count: number;
  private readonly meshes: THREE.Mesh[] = [];
  private readonly material: THREE.ShaderMaterial;
  private readonly uniforms;

  constructor(seats: Seat[], colors: CrowdColors, env: EnvUniforms, options: { calm: boolean; seed: number }) {
    this.uniforms = {
      uTime: env.uTime,
      uCheer: { value: 0 },
      uCheerT: { value: 99 },
      uOoh: { value: 0 },
      uTension: { value: 0 },
      uCalm: { value: options.calm ? 1 : 0 },
      uBall: { value: new THREE.Vector3(0, 0, 30) },
      uKeyDir: env.uKeyDir,
      uKeyColor: env.uKeyColor,
      uHemiSky: env.uHemiSky,
      uHemiGround: env.uHemiGround,
      uStandLight: env.uStandLight,
      uFogColor: env.uFogColor,
      uFogNear: env.uFogNear,
      uFogFar: env.uFogFar,
    };
    this.material = new THREE.ShaderMaterial({ vertexShader: CROWD_VERTEX, fragmentShader: CROWD_FRAGMENT, uniforms: this.uniforms });
    const base = fanGeometry();
    this.material.onBeforeCompile = (shader) => {
      // A normal pelas derivadas pede highp no fragment; sem ele, volta a de antes
      // (quatro vértices por face, normal no atributo). Decide antes do primeiro quadro.
      if (shader.precision === "highp") return;
      shader.vertexShader = `#define CROWD_FACE_NORMALS\n${shader.vertexShader}`;
      shader.fragmentShader = `#define CROWD_FACE_NORMALS\n${shader.fragmentShader}`;
      for (const mesh of this.meshes) mesh.geometry.index = base.faces;
    };
    this.count = seats.length;
    const random = seeded(options.seed);
    const palette = [
      [colors.homeA, 0.5],
      [colors.homeB, 0.22],
      ["#f2f2f2", 0.1],
      [colors.awayA, 0.06],
      ["#1b1d24", 0.07],
      ["#ffd23f", 0.05],
    ] as const;
    const pickShirt = () => {
      let roll = random();
      for (const [color, weight] of palette) {
        roll -= weight;
        if (roll <= 0) return color;
      }
      return colors.homeA;
    };
    // Sorteio na ordem de sempre (fundo atrás do gol, depois as duas laterais):
    // cada torcedor mantém lugar, camisa, pele e se está de pé, só muda de malha.
    const groups: Seat[][] = [[], [], []];
    for (const seat of seats) {
      const index = seat.z > 50 && Math.abs(seat.x) < 40 ? 0 : seat.x > 0 ? 1 : 2;
      groups[index].push(seat);
    }
    const fans = groups.flat();
    // Fatias de 36° em volta do campo (só a posição decide); as pontas pequenas
    // (modo desempenho) vão para a vizinha mais perto do gol.
    const raw = fans.map((item) => Math.min(SECTORS - 1, Math.floor(((Math.atan2(item.x, item.z) + Math.PI) / (Math.PI * 2)) * SECTORS)));
    const sizes = new Array<number>(SECTORS).fill(0);
    for (const sector of raw) sizes[sector] += 1;
    const sectorOf = raw.map((start) => {
      let sector = start;
      while (sizes[sector] < MIN_SECTOR && sector !== SECTORS / 2 - 1 && sector !== SECTORS / 2) sector += sector < SECTORS / 2 ? 1 : -1;
      return sector;
    });
    const counts = new Array<number>(SECTORS).fill(0);
    for (const sector of sectorOf) counts[sector] += 1;
    const slices = counts.map((count) => ({
      count,
      used: 0,
      seat: new Float32Array(count * 4),
      fan: new Float32Array(count * 4),
      shirt: new Float32Array(count * 3),
      skin: new Float32Array(count * 3),
      box: new THREE.Box3(),
    }));
    const color = new THREE.Color();
    const point = new THREE.Vector3();
    fans.forEach((item, index) => {
      const slice = slices[sectorOf[index]];
      const at = slice.used;
      slice.used += 1;
      slice.seat[at * 4] = item.x;
      slice.seat[at * 4 + 1] = item.y;
      slice.seat[at * 4 + 2] = item.z;
      slice.seat[at * 4 + 3] = item.yaw;
      // Atrás do gol (organizada) quase todo mundo de pé; nas laterais, metade sentada.
      const ultras = item.z > 50 ? 0.85 : 0.4;
      slice.fan[at * 4] = random();
      slice.fan[at * 4 + 1] = 0.6 + random() * 0.4;
      slice.fan[at * 4 + 2] = random() < ultras ? 1 : 0;
      slice.fan[at * 4 + 3] = random();
      color.set(pickShirt()).toArray(slice.shirt, at * 3);
      color.set(SKIN_COLORS[Math.floor(random() * SKIN_COLORS.length)]).toArray(slice.skin, at * 3);
      slice.box.expandByPoint(point.set(item.x, item.y, item.z));
    });
    slices.forEach((slice, sector) => {
      if (!slice.count) return;
      const geometry = new THREE.InstancedBufferGeometry();
      geometry.index = base.corners;
      geometry.setAttribute("position", base.position);
      geometry.setAttribute("normal", base.normal);
      geometry.setAttribute("aPart", base.aPart);
      geometry.setAttribute("aSeat", new THREE.InstancedBufferAttribute(slice.seat, 4));
      geometry.setAttribute("aFan", new THREE.InstancedBufferAttribute(slice.fan, 4));
      geometry.setAttribute("aShirt", new THREE.InstancedBufferAttribute(slice.shirt, 3));
      geometry.setAttribute("aSkin", new THREE.InstancedBufferAttribute(slice.skin, 3));
      geometry.instanceCount = slice.count;
      slice.box.expandByScalar(2.5);
      geometry.boundingBox = slice.box;
      geometry.boundingSphere = slice.box.getBoundingSphere(new THREE.Sphere());
      const mesh = new THREE.Mesh(geometry, this.material);
      // Antes da tigela: a torcida enche o depth e o tapete atrás dela nem é pintado.
      // Entre as fatias, a ordem dos lugares (do lado +x para o -x): nos braços de
      // vizinhos que se cruzam no mesmo plano, quem aparece na frente é o de antes.
      mesh.renderOrder = -1 - sector / 100;
      this.meshes.push(mesh);
      this.group.add(mesh);
    });
  }

  update(state: { cheer: number; cheerT: number; ooh: number; tension: number; ball: { x: number; y: number; z: number } }) {
    const u = this.uniforms;
    u.uCheer.value = state.cheer;
    u.uCheerT.value = state.cheerT;
    u.uOoh.value = state.ooh;
    u.uTension.value = state.tension;
    u.uBall.value.set(state.ball.x, state.ball.y, state.ball.z);
  }

  dispose() {
    for (const mesh of this.meshes) mesh.geometry.dispose();
    this.material.dispose();
  }
}
