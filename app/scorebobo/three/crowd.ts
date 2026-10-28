// Torcida 3D das fileiras da frente: torcedores de blocos (mesmo traço dos
// bonecos: cabeção, corpo, braços e pernas) instanciados aos milhares e
// animados inteiros no vertex shader — sentados ou de pé, levantando com a
// bola indo para o gol, mãos na cabeça no "uuuh", pulando e balançando os
// braços no gol (caos no começo, todos no mesmo pulo depois). As cabeças
// acompanham a bola. Três malhas (fundo e laterais) para o recorte de câmera.

import * as THREE from "three";
import { SKIN_COLORS } from "../../player-appearance";
import { ENV_FOG, ENV_LIGHT, type EnvUniforms, seeded } from "./util";
import type { Seat } from "./stadium";

/** Peças: 0 corpo, 1 cabeça, 2 braço esquerdo, 3 braço direito, 4 pernas. Frente em +z local. */
function fanGeometry() {
  const positions: number[] = [];
  const normals: number[] = [];
  const parts: number[] = [];
  const indices: number[] = [];
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
    for (const [n, u, v] of faces) {
      if (skip.bottom && n[1] === -1) continue;
      if (skip.top && n[1] === 1) continue;
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
  box([0.38, 0.62, 0.24], [0, 0.31, 0.01], 4, { bottom: true, top: true });
  box([0.48, 0.62, 0.27], [0, 0.93, 0], 0, { bottom: true });
  box([0.38, 0.38, 0.38], [0, 1.43, 0.01], 1, { bottom: true });
  // Braços pendurados do ombro (±0,3; 1,2): é em volta dele que giram no shader.
  box([0.13, 0.58, 0.13], [-0.305, 0.93, 0], 2, { top: true });
  box([0.13, 0.58, 0.13], [0.305, 0.93, 0], 3, { top: true });
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("aPart", new THREE.Float32BufferAttribute(parts, 1));
  geometry.setIndex(indices);
  return geometry;
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
varying vec3 vNormal;
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
  vec3 n = normal;
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
  vec3 armN = rotZ(rotX(n, ax), side * az);
  p = mix(p, armP, isArm);
  n = mix(n, armN, isArm);

  // Cabeça segue a bola (yaw local, com limite de pescoço).
  vec2 toBall = uBall.xz - aSeat.xz;
  float want = atan(toBall.x, toBall.y) - aSeat.w;
  want = atan(sin(want), cos(want));
  float headYaw = clamp(want, -0.8, 0.8) * (1.0 - uCheer * 0.6);
  vec3 neck = vec3(0.0, 1.24, 0.0);
  p = mix(p, rotY(p - neck, headYaw) + neck, isHead);
  n = mix(n, rotY(n, headYaw), isHead);
  // "Uuuh": corpo vai para trás.
  float lean = -0.18 * uOoh * energy;
  p = rotX(p, lean);
  n = rotX(n, lean);
  p.y += lift;

  vec3 world = rotY(p, aSeat.w) + aSeat.xyz;
  vec3 wn = rotY(n, aSeat.w);

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
  vNormal = wn;
  vec4 mv = viewMatrix * vec4(world, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const CROWD_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying vec3 vNormal;
varying float vDepth;
${ENV_LIGHT}
${ENV_FOG}
void main() {
  vec3 color = envLight(vColor, normalize(vNormal));
  gl_FragColor = vec4(envFog(color, vDepth), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

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
    // Fundo (atrás do gol) e as duas laterais: cada grupo recortado pela câmera sozinho.
    const groups: Seat[][] = [[], [], []];
    for (const seat of seats) {
      const index = seat.z > 50 && Math.abs(seat.x) < 40 ? 0 : seat.x > 0 ? 1 : 2;
      groups[index].push(seat);
    }
    const base = fanGeometry();
    const color = new THREE.Color();
    for (const group of groups) {
      if (!group.length) continue;
      const geometry = new THREE.InstancedBufferGeometry();
      geometry.index = base.index;
      geometry.setAttribute("position", base.getAttribute("position"));
      geometry.setAttribute("normal", base.getAttribute("normal"));
      geometry.setAttribute("aPart", base.getAttribute("aPart"));
      const seat = new Float32Array(group.length * 4);
      const fan = new Float32Array(group.length * 4);
      const shirt = new Float32Array(group.length * 3);
      const skin = new Float32Array(group.length * 3);
      const box = new THREE.Box3();
      group.forEach((item, index) => {
        seat.set([item.x, item.y, item.z, item.yaw], index * 4);
        // Atrás do gol (organizada) quase todo mundo de pé; nas laterais, metade sentada.
        const ultras = item.z > 50 ? 0.85 : 0.4;
        fan.set([random(), 0.6 + random() * 0.4, random() < ultras ? 1 : 0, random()], index * 4);
        color.set(pickShirt()).toArray(shirt, index * 3);
        color.set(SKIN_COLORS[Math.floor(random() * SKIN_COLORS.length)]).toArray(skin, index * 3);
        box.expandByPoint(new THREE.Vector3(item.x, item.y, item.z));
      });
      geometry.setAttribute("aSeat", new THREE.InstancedBufferAttribute(seat, 4));
      geometry.setAttribute("aFan", new THREE.InstancedBufferAttribute(fan, 4));
      geometry.setAttribute("aShirt", new THREE.InstancedBufferAttribute(shirt, 3));
      geometry.setAttribute("aSkin", new THREE.InstancedBufferAttribute(skin, 3));
      geometry.instanceCount = group.length;
      box.expandByScalar(2.5);
      geometry.boundingBox = box;
      geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      const mesh = new THREE.Mesh(geometry, this.material);
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
    base.dispose();
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
