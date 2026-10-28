// Gol de verdade (7,32 × 2,44 m): traves e travessão, ferragem de trás, rede
// em losango desenhada no fragment shader (some em véu quando a malha fica
// menor que o pixel) e estufada no vertex shader no ponto do impacto, com a
// onda que corre pela rede e a bola afundando nela. Bandeirinhas de escanteio.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PITCH } from "../types";
import type { Vec3 } from "../types";

const POST_X = PITCH.goalHalfWidth + PITCH.postRadius;
const BAR_Y = PITCH.goalHeight + PITCH.postRadius;
// Rede em caixa, como a da simulação (fundo reto em linha + profundidade,
// teto na altura do travessão): a bola parada na rede fica DENTRO do pano.
const ROOF_DEPTH = PITCH.goalDepth;
const ROOF_BACK_Y = PITCH.goalHeight - 0.04;

/** Contorno lateral da rede (z relativo à linha, y): linha → teto → fundo inclinado → chão. */
const SIDE: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [PITCH.goalDepth, 0],
  [ROOF_DEPTH, ROOF_BACK_Y],
  [0, PITCH.goalHeight],
];

type NetPanel = {
  /** Ponto do painel em (u, v) 0..1. */
  at: (u: number, v: number, out: THREE.Vector3) => THREE.Vector3;
  normal: THREE.Vector3;
  cols: number;
  rows: number;
  /** Coordenada da malha (m) em (u, v): o desenho acompanha o pano quando ele estufa. */
  grid: (u: number, v: number) => [number, number];
};

function buildNetGeometry(mirror: boolean) {
  const line = PITCH.goalLineZ;
  const half = PITCH.goalHalfWidth;
  const sign = mirror ? -1 : 1;
  const panels: NetPanel[] = [];
  const backNormal = new THREE.Vector3(0, 0, 1);
  // Fundo: do chão (z = linha + profundidade) até a borda de trás do teto.
  panels.push({
    at: (u, v, out) => out.set(-half + u * 2 * half, v * ROOF_BACK_Y, line + PITCH.goalDepth + (ROOF_DEPTH - PITCH.goalDepth) * v),
    normal: backNormal,
    cols: 26,
    rows: 10,
    grid: (u, v) => [u * 2 * half, v * Math.hypot(ROOF_BACK_Y, PITCH.goalDepth - ROOF_DEPTH)],
  });
  // Teto: do travessão para trás.
  panels.push({
    at: (u, v, out) => out.set(-half + u * 2 * half, PITCH.goalHeight + (ROOF_BACK_Y - PITCH.goalHeight) * v, line + ROOF_DEPTH * v),
    normal: new THREE.Vector3(0, 1, 0),
    cols: 26,
    rows: 4,
    grid: (u, v) => [u * 2 * half, 7 + v * ROOF_DEPTH],
  });
  // Laterais: quadrilátero plano em x = ±meia largura (bilinear nos quatro cantos).
  for (const side of [-1, 1]) {
    panels.push({
      at: (u, v, out) => {
        const [z0, y0] = SIDE[0];
        const [z1, y1] = SIDE[1];
        const [z2, y2] = SIDE[2];
        const [z3, y3] = SIDE[3];
        const bottomZ = z0 + (z1 - z0) * u;
        const bottomY = y0 + (y1 - y0) * u;
        const topZ = z3 + (z2 - z3) * u;
        const topY = y3 + (y2 - y3) * u;
        return out.set(side * half, bottomY + (topY - bottomY) * v, line + bottomZ + (topZ - bottomZ) * v);
      },
      normal: new THREE.Vector3(side, 0, 0),
      cols: 8,
      rows: 10,
      grid: (u, v) => [u * PITCH.goalDepth + 20, v * PITCH.goalHeight],
    });
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const grids: number[] = [];
  const free: number[] = [];
  const indices: number[] = [];
  const point = new THREE.Vector3();
  for (const panel of panels) {
    const base = positions.length / 3;
    for (let row = 0; row <= panel.rows; row += 1) {
      for (let col = 0; col <= panel.cols; col += 1) {
        const u = col / panel.cols;
        const v = row / panel.rows;
        panel.at(u, v, point);
        positions.push(point.x, point.y, point.z * sign);
        normals.push(panel.normal.x, panel.normal.y, panel.normal.z * sign);
        const [gx, gy] = panel.grid(u, v);
        grids.push(gx, gy);
        // Bordas presas na ferragem e no chão; o meio do pano é que estufa.
        free.push(Math.pow(Math.sin(Math.PI * u) * Math.sin(Math.PI * v), 0.5));
      }
    }
    const stride = panel.cols + 1;
    for (let row = 0; row < panel.rows; row += 1) {
      for (let col = 0; col < panel.cols; col += 1) {
        const a = base + row * stride + col;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        indices.push(a, b, d, a, d, c);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("aGrid", new THREE.Float32BufferAttribute(grids, 2));
  geometry.setAttribute("aFree", new THREE.Float32BufferAttribute(free, 1));
  geometry.setIndex(indices);
  return geometry;
}

function tube(from: THREE.Vector3, to: THREE.Vector3, radius: number, color: THREE.Color, radial = 12) {
  const length = from.distanceTo(to);
  const geometry = new THREE.CylinderGeometry(radius, radius, length, radial, 1, false);
  const direction = to.clone().sub(from).normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
  const matrix = new THREE.Matrix4().compose(from.clone().add(to).multiplyScalar(0.5), quaternion, new THREE.Vector3(1, 1, 1));
  geometry.applyMatrix4(matrix);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) color.toArray(colors, index * 3);
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function frameGeometry(mirror: boolean) {
  const sign = mirror ? -1 : 1;
  const z = PITCH.goalLineZ * sign;
  const white = new THREE.Color("#f6f7f4");
  const steel = new THREE.Color("#5b6168");
  const r = PITCH.postRadius;
  const parts: THREE.BufferGeometry[] = [];
  const v = (x: number, y: number, zz: number) => new THREE.Vector3(x, y, zz);
  // Traves vão até o topo do travessão (canto reto como nos gols de estádio).
  parts.push(tube(v(-POST_X, 0, z), v(-POST_X, BAR_Y + r, z), r, white, 18));
  parts.push(tube(v(POST_X, 0, z), v(POST_X, BAR_Y + r, z), r, white, 18));
  parts.push(tube(v(-POST_X - r, BAR_Y, z), v(POST_X + r, BAR_Y, z), r, white, 18));
  // Ferragem de trás (fina e escura): suportes do teto, fundo e base no chão.
  const back = PITCH.goalLineZ + PITCH.goalDepth;
  const roof = PITCH.goalLineZ + ROOF_DEPTH;
  const pr = 0.022;
  for (const side of [-1, 1]) {
    const x = side * PITCH.goalHalfWidth;
    parts.push(tube(v(x, PITCH.goalHeight, z), v(x, ROOF_BACK_Y, roof * sign), pr, steel, 6));
    parts.push(tube(v(x, ROOF_BACK_Y, roof * sign), v(x, 0, back * sign), pr, steel, 6));
    // Mão-francesa do canto de trás (o "L" que segura a caixa).
    parts.push(tube(v(x, 0.02, (back - 0.7) * sign), v(x, 0.7, back * sign), pr, steel, 6));
    parts.push(tube(v(x, 0.02, z), v(x, 0.02, back * sign), pr, steel, 6));
  }
  parts.push(tube(v(-PITCH.goalHalfWidth, 0.02, back * sign), v(PITCH.goalHalfWidth, 0.02, back * sign), pr, steel, 6));
  parts.push(tube(v(-PITCH.goalHalfWidth, ROOF_BACK_Y, roof * sign), v(PITCH.goalHalfWidth, ROOF_BACK_Y, roof * sign), pr, steel, 6));
  const merged = mergeGeometries(parts.map((part) => part.toNonIndexed()), false)!;
  for (const part of parts) part.dispose();
  return merged;
}

const NET_PARS_VERTEX = /* glsl */ `
attribute vec2 aGrid;
attribute float aFree;
uniform vec3 uHit;
uniform float uHitAge;
uniform float uHitPower;
uniform vec3 uBall;
uniform float uBallPush;
uniform float uNetTime;
varying vec2 vGrid;
`;

const NET_VERTEX = /* glsl */ `
vGrid = aGrid;
{
  float dist = length(position - uHit);
  float t = uHitAge;
  // Estufa rápido, oscila e assenta (~1,5 s); a onda corre pelo pano a ~5 m/s.
  float swell = (1.0 - exp(-t * 26.0)) * exp(-t * 2.1) * (0.75 + 0.25 * cos(t * 10.0));
  float bump = exp(-dist * dist / 0.9) * swell;
  float front = dist - t * 5.0;
  float ripple = sin(front * 8.0) * exp(-front * front * 2.5) * exp(-t * 2.6) * 0.22;
  float idle = sin(uNetTime * 1.3 + position.x * 1.7 + position.y * 2.1) * 0.012;
  // Bola apoiada na rede: o pano envolve a bola (o quanto ela passou do plano, em tenda).
  vec3 toBall = uBall - position;
  float across = dot(toBall, normal);
  float pen = max(across + 0.13, 0.0);
  vec3 lateral = toBall - normal * across;
  float wrap = pen * exp(-dot(lateral, lateral) / 0.3) * uBallPush;
  float push = (bump + ripple) * uHitPower + idle;
  transformed += normal * (push * aFree + wrap * sqrt(aFree));
}
`;

const NET_PARS_FRAGMENT = /* glsl */ `
varying vec2 vGrid;
`;

const NET_FRAGMENT = /* glsl */ `
{
  // Malha em losango de 12 cm, fio de ~0,9 cm (a câmera atrás do gol fica a
  // 2 m da rede: fio grosso escondia a bola); longe vira véu (cobertura média).
  vec2 g = mat2(0.7071, 0.7071, -0.7071, 0.7071) * vGrid / 0.12;
  vec2 cell = abs(fract(g) - 0.5);
  float lineD = min(cell.x, cell.y);
  vec2 fw = fwidth(g);
  float aa = max(max(fw.x, fw.y), 1e-4);
  float wire = clamp(0.5 + (0.038 - lineD) / aa, 0.0, 1.0) * 0.92;
  float veil = 0.26;
  float detail = smoothstep(0.12, 0.35, aa);
  diffuseColor.a *= mix(wire, veil, detail);
  if (diffuseColor.a < 0.02) discard;
}
`;

export class Goal {
  readonly group = new THREE.Group();
  private readonly frame: THREE.Mesh;
  private readonly net: THREE.Mesh;
  /** Verso da rede (desenhado logo antes da frente). */
  private readonly netBack: THREE.Mesh;
  private readonly flags: THREE.Mesh;
  private readonly poles: THREE.Mesh;
  private readonly netUniforms = {
    uHit: { value: new THREE.Vector3(0, 1.2, PITCH.goalLineZ + 2) },
    uHitAge: { value: 99 },
    uHitPower: { value: 0 },
    uBall: { value: new THREE.Vector3(0, -50, 0) },
    uBallPush: { value: 0 },
    uNetTime: { value: 0 },
  };
  private readonly flagUniforms = { uFlagTime: { value: 0 } };
  private ballPush = 0;

  constructor(options: { flagColor: string }) {
    const frameGeo = mergeGeometries([frameGeometry(false), frameGeometry(true)], false)!;
    this.frame = new THREE.Mesh(frameGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.05 }));
    this.frame.castShadow = true;
    this.frame.receiveShadow = true;
    this.group.add(this.frame);

    const netGeo = mergeGeometries([buildNetGeometry(false), buildNetGeometry(true)], false)!;
    // Brilho próprio: o fio branco não fica preto na contraluz dos refletores.
    const netMaterial = new THREE.MeshLambertMaterial({ color: "#f4f6f8", emissive: "#5d636b", transparent: true, side: THREE.FrontSide, depthWrite: false });
    const netShader = (shader: THREE.WebGLProgramParametersWithUniforms) => {
      Object.assign(shader.uniforms, this.netUniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${NET_PARS_VERTEX}`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>\n${NET_VERTEX}`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${NET_PARS_FRAGMENT}`)
        .replace("#include <color_fragment>", `#include <color_fragment>\n${NET_FRAGMENT}`);
    };
    netMaterial.onBeforeCompile = netShader;
    // Rede vista dos dois lados: verso e frente em duas malhas, nesta ordem, o
    // mesmo que o DoubleSide transparente do three faz sozinho, mas sem trocar o
    // lado do material (e refazer os parâmetros do programa) duas vezes por
    // quadro. A mesma função de compilação nas duas dá os mesmos dois programas.
    const netBackMaterial = netMaterial.clone();
    netBackMaterial.side = THREE.BackSide;
    netBackMaterial.onBeforeCompile = netShader;
    this.netBack = new THREE.Mesh(netGeo, netBackMaterial);
    this.netBack.renderOrder = 2;
    this.group.add(this.netBack);
    this.net = new THREE.Mesh(netGeo, netMaterial);
    this.net.renderOrder = 2.001;
    this.group.add(this.net);

    // Bandeirinhas: mastros listrados e panos que tremulam (um draw call cada).
    const poleParts: THREE.BufferGeometry[] = [];
    const flagParts: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * PITCH.halfWidth;
        const z = sz * PITCH.goalLineZ;
        for (let band = 0; band < 4; band += 1) {
          const color = new THREE.Color(band % 2 === 0 ? "#f4f4f0" : options.flagColor);
          poleParts.push(tube(new THREE.Vector3(x, band * 0.4, z), new THREE.Vector3(x, band * 0.4 + 0.4, z), 0.02, color, 6));
        }
        const flag = new THREE.PlaneGeometry(0.5, 0.36, 6, 1);
        flag.translate(0.25, 1.42, 0);
        // O pano aponta para fora do campo (lado do x da bandeirinha) e gira com o vento.
        flag.rotateY(sx > 0 ? Math.PI * 0.15 : Math.PI * 0.85);
        flag.translate(x, 0, z);
        flagParts.push(flag);
      }
    }
    const poleGeo = mergeGeometries(poleParts.map((part) => part.toNonIndexed()), false)!;
    for (const part of poleParts) part.dispose();
    this.poles = new THREE.Mesh(poleGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.poles.castShadow = true;
    this.group.add(this.poles);
    const flagGeo = mergeGeometries(flagParts, false)!;
    for (const part of flagParts) part.dispose();
    const flagMaterial = new THREE.MeshLambertMaterial({ color: options.flagColor, side: THREE.DoubleSide });
    flagMaterial.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.flagUniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uFlagTime;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          // uv.x = distância do mastro: a ponta balança mais.
          float flutter = sin(uFlagTime * 7.0 - uv.x * 6.0 + position.x * 0.3) * 0.07 * uv.x;
          transformed.y += flutter * 0.4;
          transformed.x += flutter * 0.5;
          transformed.z += flutter;`,
        );
    };
    this.flags = new THREE.Mesh(flagGeo, flagMaterial);
    this.group.add(this.flags);
  }

  /** Bola entrou: estufa a rede no ponto (força 0..1 pela velocidade). */
  hit(point: Vec3, power: number) {
    this.netUniforms.uHit.value.set(point.x, point.y, point.z);
    this.netUniforms.uHitAge.value = 0;
    this.netUniforms.uHitPower.value = THREE.MathUtils.clamp(0.18 + power * 0.42, 0.18, 0.6);
  }

  update(time: number, dt: number, ball: { pos: Vec3; inNet: boolean }) {
    this.netUniforms.uNetTime.value = time;
    this.netUniforms.uHitAge.value += dt;
    this.flagUniforms.uFlagTime.value = time;
    // Bola dentro do gol, encostada no pano: afunda a rede onde ela está.
    const inside = ball.inNet && ball.pos.z > PITCH.goalLineZ;
    this.ballPush = THREE.MathUtils.damp(this.ballPush, inside ? 1 : 0, inside ? 10 : 3, dt);
    if (inside) this.netUniforms.uBall.value.set(ball.pos.x, ball.pos.y, ball.pos.z);
    this.netUniforms.uBallPush.value = this.ballPush;
  }

  dispose() {
    for (const mesh of [this.frame, this.net, this.flags, this.poles]) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    // O verso divide a geometria com a frente (já liberada acima).
    (this.netBack.material as THREE.Material).dispose();
  }
}
