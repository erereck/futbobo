// Corridas dos companheiros na mira (as setas do Score! Hero): cada um mostra
// no gramado o caminho que ainda vai fazer — tracejado correndo para a frente
// e ponta de flecha — e um anel no pé, para quem é do seu time se ler de longe
// no meio dos zagueiros. Uma malha só, refeita quando a mira muda.

import * as THREE from "three";
import type { Actor, GameState } from "../types";

const MAX_POINTS = 260;
/** Vértices: 2 por ponto da fita + 3 por flecha + 4 por anel. */
const MAX_VERTS = MAX_POINTS * 2 + 8 * 3 + 8 * 4;

const VERTEX = /* glsl */ `
attribute float aU;
attribute float aV;
attribute float aKind;
attribute vec2 aRing;
varying float vU;
varying float vV;
varying float vKind;
varying vec2 vRing;
void main() {
  vU = aU;
  vV = aV;
  vKind = aKind;
  vRing = aRing;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uFade;
uniform vec3 uColor;
varying float vU;
varying float vV;
varying float vKind;
varying vec2 vRing;
void main() {
  float a = 0.0;
  if (vKind < 0.5) {
    // Tracejado andando no sentido da corrida, sumindo no começo (sai do pé dele).
    float dash = smoothstep(0.42, 0.5, fract(vU / 0.95 - uTime * 0.9)) * (1.0 - smoothstep(0.86, 0.94, fract(vU / 0.95 - uTime * 0.9)));
    a = dash * smoothstep(1.0, 0.45, abs(vV)) * smoothstep(0.3, 1.2, vU);
  } else if (vKind < 1.5) {
    a = 0.9 * smoothstep(1.0, 0.7, abs(vV));
  } else {
    float r = length(vRing);
    float ring = smoothstep(0.1, 0.0, abs(r - 0.78));
    float dash = step(0.3, fract(atan(vRing.y, vRing.x) * 6.0 / 6.28318 + uTime * 0.12));
    a = ring * (0.35 + 0.45 * dash) + smoothstep(0.8, 0.0, r) * 0.08;
    a *= smoothstep(1.0, 0.92, r);
  }
  a *= uFade;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;

export class RunMarks {
  readonly mesh: THREE.Mesh;
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material: THREE.ShaderMaterial;
  private readonly pos = new Float32Array(MAX_VERTS * 3);
  private readonly u = new Float32Array(MAX_VERTS);
  private readonly v = new Float32Array(MAX_VERTS);
  private readonly kind = new Float32Array(MAX_VERTS);
  private readonly ring = new Float32Array(MAX_VERTS * 2);
  private key = "";
  private fade = 0;
  private want = 0;

  constructor(time: { value: number }) {
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("aU", new THREE.BufferAttribute(this.u, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("aV", new THREE.BufferAttribute(this.v, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("aKind", new THREE.BufferAttribute(this.kind, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("aRing", new THREE.BufferAttribute(this.ring, 2).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(MAX_VERTS * 3), 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { uTime: time, uFade: { value: 0 }, uColor: { value: new THREE.Color("#bff6ff") } },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.visible = false;
  }

  /** `drawing`: com o dedo na tela as setas baixam (o traço manda). */
  update(state: GameState, dt: number, drawing: boolean) {
    const aim = state.phase === "aim";
    const mates = aim ? state.actors.filter((actor) => actor.role === "mate") : [];
    const key = aim ? `${state.heroId}|${state.attempt}|${state.passes}|${mates.map((m) => `${m.pos.x.toFixed(1)},${m.pos.z.toFixed(1)}`).join(";")}` : "";
    if (key && key !== this.key) this.build(mates);
    this.key = key;
    const want = aim ? (drawing ? 0.45 : 1) : 0;
    this.want = want;
    this.fade = THREE.MathUtils.damp(this.fade, want, want > this.fade ? 5 : 12, dt);
    this.material.uniforms.uFade.value = this.fade;
    this.mesh.visible = this.fade > 0.01;
  }

  /** As setas já chegaram onde deviam (acesas, baixas ou apagadas). */
  get settled(): boolean {
    return Math.abs(this.fade - this.want) < 0.01;
  }

  private build(mates: Actor[]) {
    let vert = 0;
    let idx = 0;
    const index = this.geometry.index!.array as Uint16Array;
    const put = (x: number, y: number, z: number, u: number, v: number, kind: number, rx = 0, ry = 0) => {
      const o = vert * 3;
      this.pos[o] = x;
      this.pos[o + 1] = y;
      this.pos[o + 2] = z;
      this.u[vert] = u;
      this.v[vert] = v;
      this.kind[vert] = kind;
      this.ring[vert * 2] = rx;
      this.ring[vert * 2 + 1] = ry;
      vert += 1;
      return vert - 1;
    };
    const tri = (a: number, b: number, c: number) => {
      index[idx] = a;
      index[idx + 1] = b;
      index[idx + 2] = c;
      idx += 3;
    };
    const perMate = Math.floor(MAX_POINTS / Math.max(1, mates.length));
    for (const mate of mates.slice(0, 8)) {
      // Anel no pé.
      const r = 1.05;
      const c0 = put(mate.pos.x - r, 0.03, mate.pos.z - r, 0, 0, 2, -1, -1);
      put(mate.pos.x + r, 0.03, mate.pos.z - r, 0, 0, 2, 1, -1);
      put(mate.pos.x + r, 0.03, mate.pos.z + r, 0, 0, 2, 1, 1);
      put(mate.pos.x - r, 0.03, mate.pos.z + r, 0, 0, 2, -1, 1);
      tri(c0, c0 + 1, c0 + 2);
      tri(c0, c0 + 2, c0 + 3);
      const run = mate.run;
      if (!run || !run.length) continue;
      // Fita: reamostra o caminho a cada ~0,35 m.
      const path = [{ x: mate.pos.x, z: mate.pos.z }, ...run];
      const pts: Array<{ x: number; z: number; u: number }> = [{ ...path[0], u: 0 }];
      let along = 0;
      for (let i = 1; i < path.length; i += 1) {
        const a = path[i - 1];
        const b = path[i];
        const seg = Math.hypot(b.x - a.x, b.z - a.z);
        const n = Math.max(1, Math.ceil(seg / 0.35));
        for (let k = 1; k <= n; k += 1) {
          if (pts.length >= perMate - 1) break;
          pts.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n, u: along + (seg * k) / n });
        }
        along += seg;
      }
      if (pts.length < 2) continue;
      // A flecha come o fim da fita (a ponta fica no último ponto).
      const tip = pts[pts.length - 1];
      const prev = pts[Math.max(0, pts.length - 3)];
      const dl = Math.hypot(tip.x - prev.x, tip.z - prev.z) || 1;
      const dir = { x: (tip.x - prev.x) / dl, z: (tip.z - prev.z) / dl };
      const head = 0.95;
      const base = { x: tip.x - dir.x * head, z: tip.z - dir.z * head };
      while (pts.length > 2 && Math.hypot(pts[pts.length - 1].x - tip.x, pts[pts.length - 1].z - tip.z) < head) pts.pop();
      const width = 0.17;
      let first = -1;
      for (let i = 0; i < pts.length; i += 1) {
        const p = pts[i];
        const q = pts[Math.min(pts.length - 1, i + 1)];
        const o = pts[Math.max(0, i - 1)];
        let tx = q.x - o.x;
        let tz = q.z - o.z;
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl;
        tz /= tl;
        const a = put(p.x - tz * width, 0.035, p.z + tx * width, p.u, -1, 0);
        put(p.x + tz * width, 0.035, p.z - tx * width, p.u, 1, 0);
        if (first >= 0) {
          tri(a - 2, a - 1, a);
          tri(a - 1, a + 1, a);
        }
        first = a;
      }
      const hw = 0.48;
      const h0 = put(base.x - dir.z * hw, 0.04, base.z + dir.x * hw, along, -1, 1);
      put(base.x + dir.z * hw, 0.04, base.z - dir.x * hw, along, 1, 1);
      put(tip.x, 0.04, tip.z, along, 0, 1);
      tri(h0, h0 + 1, h0 + 2);
    }
    this.geometry.setDrawRange(0, idx);
    for (const name of ["position", "aU", "aV", "aKind", "aRing"]) this.geometry.getAttribute(name).needsUpdate = true;
    this.geometry.index!.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
