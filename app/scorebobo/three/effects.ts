// Efeitos da jogada: tufo de grama no chute, faíscas na trave, chuva de
// confete no gol (canhões atrás do gol e em volta do artilheiro) e o filtro
// de tela (vinheta, clarão, tom "tempo congelado", tarjas do replay).
//
// Partículas na CPU (centenas, conta trivial) em dois Points: um opaco
// (confete, grama) e um somado (faíscas, poeira luminosa). Um draw call cada.

import * as THREE from "three";
import { clamp01, seeded, TAU } from "./util";
import type { Vec3 } from "../types";

const SOLID_MAX = 1700;
const GLOW_MAX = 260;

/** Formas: 0 papel de confete (gira e vira), 1 tufo/poeira redondo, 2 faísca. */
type Kind = 0 | 1 | 2;

type Particle = {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number;
  size: number;
  r: number; g: number; b: number;
  alpha: number;
  angle: number; spin: number;
  flip: number; flipRate: number;
  drag: number; gravity: number;
  kind: Kind;
  /** Confete: balanço lateral ao cair. */
  sway: number;
};

const POINTS_VERTEX = /* glsl */ `
attribute vec4 aMisc;
attribute vec3 aColor;
attribute float aKind;
uniform float uScale;
varying vec4 vMisc;
varying vec3 vColor;
varying float vKind;
void main() {
  vMisc = aMisc;
  vColor = aColor;
  vKind = aKind;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aMisc.x * uScale / max(0.5, -mv.z), 1.0, 160.0);
  gl_Position = projectionMatrix * mv;
}
`;

const POINTS_FRAGMENT = /* glsl */ `
uniform float uGlow;
varying vec4 vMisc;
varying vec3 vColor;
varying float vKind;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float a = 0.0;
  vec3 color = vColor;
  if (vKind < 0.5) {
    // Papel: retângulo girado que estreita quando vira (cos do giro).
    float c = cos(vMisc.z);
    float s = sin(vMisc.z);
    vec2 q = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    float w = max(0.12, abs(cos(vMisc.w))) * 0.9;
    a = step(abs(q.x), w) * step(abs(q.y), 0.5);
    color *= 0.75 + 0.35 * abs(sin(vMisc.w));
  } else if (vKind < 1.5) {
    float r = length(p);
    a = smoothstep(1.0, 0.2, r);
  } else {
    float r = length(p);
    a = exp(-r * r * 5.0);
    color = mix(color, vec3(1.0), exp(-r * r * 20.0));
  }
  a *= vMisc.y;
  if (a < 0.02) discard;
  if (uGlow > 0.5) gl_FragColor = vec4(color * a, 1.0);
  else gl_FragColor = vec4(color, a);
}
`;

/** Sobe para a GPU só as `count` primeiras partículas (o resto do buffer não é desenhado). */
function uploadHead(attribute: THREE.BufferAttribute, count: number) {
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, count * attribute.itemSize);
  attribute.needsUpdate = true;
}

class Pool {
  readonly points: THREE.Points;
  private readonly list: Particle[] = [];
  private readonly positions: Float32Array;
  private readonly misc: Float32Array;
  private readonly colors: Float32Array;
  private readonly kinds: Float32Array;
  private readonly geometry: THREE.BufferGeometry;
  private readonly positionAttribute: THREE.BufferAttribute;
  private readonly miscAttribute: THREE.BufferAttribute;
  private readonly colorAttribute: THREE.BufferAttribute;
  private readonly kindAttribute: THREE.BufferAttribute;
  /** Alguém nasceu ou morreu (a fila anda): cor e forma mudam de lugar no buffer. */
  private layoutDirty = false;
  readonly material: THREE.ShaderMaterial;

  constructor(private readonly max: number, glow: boolean) {
    this.positions = new Float32Array(max * 3);
    this.misc = new Float32Array(max * 4);
    this.colors = new Float32Array(max * 3);
    this.kinds = new Float32Array(max);
    this.positionAttribute = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.miscAttribute = new THREE.BufferAttribute(this.misc, 4).setUsage(THREE.DynamicDrawUsage);
    this.colorAttribute = new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage);
    this.kindAttribute = new THREE.BufferAttribute(this.kinds, 1).setUsage(THREE.DynamicDrawUsage);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", this.positionAttribute);
    this.geometry.setAttribute("aMisc", this.miscAttribute);
    this.geometry.setAttribute("aColor", this.colorAttribute);
    this.geometry.setAttribute("aKind", this.kindAttribute);
    this.geometry.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: POINTS_VERTEX,
      fragmentShader: POINTS_FRAGMENT,
      uniforms: { uScale: { value: 600 }, uGlow: { value: glow ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
      blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = glow ? 8 : 3;
  }

  get count() {
    return this.list.length;
  }

  /** Cheio: descarta o novo (o confete que já está no ar não some de repente). */
  add(particle: Particle) {
    if (this.list.length >= this.max) return;
    this.list.push(particle);
    this.layoutDirty = true;
  }

  clear() {
    this.list.length = 0;
  }

  update(dt: number, time: number) {
    const list = this.list;
    let write = 0;
    for (let index = 0; index < list.length; index += 1) {
      const p = list[index];
      p.age += dt;
      if (p.age >= p.life) continue;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vy = p.vy * drag - p.gravity * dt;
      p.vz *= drag;
      if (p.kind === 0) {
        // Confete: plana balançando de um lado para o outro.
        p.vx += Math.sin(time * 2.3 + p.sway) * 1.6 * dt;
        p.vz += Math.cos(time * 1.9 + p.sway * 1.3) * 1.6 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.01) {
        p.y = 0.01;
        p.vy = 0;
        p.vx *= 0.5;
        p.vz *= 0.5;
        p.spin *= 0.9;
        p.flipRate *= 0.9;
      }
      p.angle += p.spin * dt;
      p.flip += p.flipRate * dt;
      list[write] = p;
      write += 1;
    }
    // Alguém morreu: os de trás andaram na fila.
    if (write !== list.length) this.layoutDirty = true;
    list.length = write;
    // Cor e forma não mudam com a idade: só reescreve (e sobe) quando a fila mexe.
    const layout = this.layoutDirty;
    this.layoutDirty = false;
    for (let index = 0; index < write; index += 1) {
      const p = list[index];
      const t = p.age / p.life;
      const fade = p.kind === 0 ? 1 - clamp01((t - 0.85) / 0.15) : p.kind === 2 ? 1 - t : Math.sin(Math.PI * Math.min(1, t * 1.2 + 0.05)) ;
      this.positions[index * 3] = p.x;
      this.positions[index * 3 + 1] = p.y;
      this.positions[index * 3 + 2] = p.z;
      this.misc[index * 4] = p.size * (p.kind === 1 ? 0.6 + t * 0.8 : 1);
      this.misc[index * 4 + 1] = p.alpha * fade;
      this.misc[index * 4 + 2] = p.angle;
      this.misc[index * 4 + 3] = p.flip;
      if (!layout) continue;
      this.colors[index * 3] = p.r;
      this.colors[index * 3 + 1] = p.g;
      this.colors[index * 3 + 2] = p.b;
      this.kinds[index] = p.kind;
    }
    this.geometry.setDrawRange(0, write);
    this.points.visible = write > 0;
    if (write > 0) {
      // Só o trecho vivo do buffer (sem isso o three sobe a capacidade inteira).
      uploadHead(this.positionAttribute, write);
      uploadHead(this.miscAttribute, write);
      if (layout) {
        uploadHead(this.colorAttribute, write);
        uploadHead(this.kindAttribute, write);
      }
    }
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// ------------------------------------------------------------ filtro de tela

const OVERLAY_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const OVERLAY_FRAGMENT = /* glsl */ `
uniform float uVignette;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uFreeze;
uniform float uBars;
uniform float uDip;
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  p.x *= mix(1.0, uAspect, 0.5);
  float r = length(p);
  float vig = smoothstep(0.55, 1.45, r) * uVignette;
  // Tempo congelado: borda azulada e fria (o centro fica limpo para desenhar).
  float freeze = smoothstep(0.75, 1.6, r) * uFreeze;
  vec3 color = vec3(0.0);
  float alpha = vig * 0.85;
  color = mix(color, vec3(0.05, 0.16, 0.32), freeze / max(0.001, alpha + freeze));
  alpha = alpha + freeze * 0.55;
  // Tarjas do replay.
  float bar = step(vUv.y, 0.075 * uBars) + step(1.0 - 0.075 * uBars, vUv.y);
  color = mix(color, vec3(0.0), bar);
  alpha = max(alpha, bar);
  // Clarão (gol, trave) e a passagem de câmera do replay (mergulho no escuro).
  color = mix(color, uFlashColor, uFlash / max(0.001, alpha + uFlash));
  alpha = alpha + uFlash * (1.0 - alpha);
  color = mix(color, vec3(0.0), uDip);
  alpha = max(alpha, uDip);
  gl_FragColor = vec4(color, clamp(alpha, 0.0, 1.0));
}
`;

export class Effects {
  readonly group = new THREE.Group();
  private readonly solid = new Pool(SOLID_MAX, false);
  private readonly glow = new Pool(GLOW_MAX, true);
  private readonly overlay: THREE.Mesh;
  private readonly overlayUniforms = {
    uVignette: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color("#ffffff") },
    uFreeze: { value: 0 },
    uBars: { value: 0 },
    uDip: { value: 0 },
    uAspect: { value: 1 },
  };
  private readonly random = seeded(4242);
  private time = 0;
  private flash = 0;
  private dip = 0;
  private vignette = 0;
  private vignetteTarget = 0;
  private freeze = 0;
  private freezeTarget = 0;
  private bars = 0;
  private barsTarget = 0;
  private readonly cannons: Array<{ at: Vec3; left: number; rate: number; colors: THREE.Color[] }> = [];
  private readonly confettiColors: THREE.Color[];

  constructor(
    private readonly options: { reducedMotion: boolean; performance: boolean; colors: string[] },
  ) {
    this.group.add(this.solid.points, this.glow.points);
    this.confettiColors = [...options.colors, "#ffd23f", "#ffffff", "#ffffff"].map((hex) => new THREE.Color(hex));
    const material = new THREE.ShaderMaterial({
      vertexShader: OVERLAY_VERTEX,
      fragmentShader: OVERLAY_FRAGMENT,
      uniforms: this.overlayUniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.overlay = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.overlay.frustumCulled = false;
    this.overlay.renderOrder = 1000;
    this.overlay.visible = false;
    this.group.add(this.overlay);
  }

  /** Escala dos pontos (px por metro a 1 m). */
  setPointScale(scale: number, aspect: number) {
    this.solid.material.uniforms.uScale.value = scale;
    this.glow.material.uniforms.uScale.value = scale;
    this.overlayUniforms.uAspect.value = aspect;
  }

  private particle(overrides: Partial<Particle> & Pick<Particle, "x" | "y" | "z">): Particle {
    return {
      vx: 0, vy: 0, vz: 0, age: 0, life: 1, size: 0.1, r: 1, g: 1, b: 1, alpha: 1,
      angle: 0, spin: 0, flip: 0, flipRate: 0, drag: 0.5, gravity: 9.8, kind: 1, sway: 0,
      ...overrides,
    };
  }

  /** Chute: torrão de grama e poeira saindo do pé na direção do chute. */
  kick(at: Vec3, dir: { x: number; z: number }, power: number) {
    const rnd = this.random;
    const count = this.options.performance ? 8 : 16;
    for (let index = 0; index < count; index += 1) {
      const spread = (rnd() - 0.5) * 1.4;
      const speed = 1.5 + rnd() * 3 * power;
      const green = 0.6 + rnd() * 0.4;
      this.solid.add(this.particle({
        x: at.x + (rnd() - 0.5) * 0.2, y: 0.05, z: at.z + (rnd() - 0.5) * 0.2,
        vx: (dir.x + spread * dir.z) * speed, vy: 1.8 + rnd() * 2.6 * power, vz: (dir.z - spread * dir.x) * speed,
        life: 0.6 + rnd() * 0.5, size: 0.035 + rnd() * 0.03,
        r: 0.16 * green, g: 0.42 * green, b: 0.1 * green,
        kind: 0, spin: (rnd() - 0.5) * 20, flipRate: 10 + rnd() * 10, drag: 1.2, gravity: 9.8,
      }));
    }
    for (let index = 0; index < 5; index += 1) {
      this.solid.add(this.particle({
        x: at.x, y: 0.12, z: at.z,
        vx: dir.x * (0.6 + rnd()) + (rnd() - 0.5) * 0.8, vy: 0.4 + rnd() * 0.6, vz: dir.z * (0.6 + rnd()) + (rnd() - 0.5) * 0.8,
        life: 0.9 + rnd() * 0.6, size: 0.35 + rnd() * 0.3,
        r: 0.78, g: 0.8, b: 0.66, alpha: 0.32,
        kind: 1, drag: 2.4, gravity: -0.15,
      }));
    }
  }

  /** Bola na trave: faíscas brancas/douradas e um clarão rápido. */
  spark(at: Vec3) {
    const rnd = this.random;
    for (let index = 0; index < 34; index += 1) {
      const theta = rnd() * TAU;
      const phi = Math.acos(2 * rnd() - 1);
      const speed = 3 + rnd() * 7;
      this.glow.add(this.particle({
        x: at.x, y: at.y, z: at.z,
        vx: Math.sin(phi) * Math.cos(theta) * speed, vy: Math.cos(phi) * speed + 1.5, vz: Math.sin(phi) * Math.sin(theta) * speed,
        life: 0.35 + rnd() * 0.4, size: 0.05 + rnd() * 0.05,
        r: 1, g: 0.82 + rnd() * 0.18, b: 0.45 + rnd() * 0.3,
        kind: 2, drag: 2.5, gravity: 9.8,
      }));
    }
    this.glow.add(this.particle({ x: at.x, y: at.y, z: at.z, life: 0.25, size: 1.4, r: 1, g: 0.95, b: 0.8, kind: 2, gravity: 0, drag: 0 }));
    this.pulse(0.25, "#fff4d6");
  }

  /** Bola estufando a rede: poeirinha de giz no ponto. */
  netPuff(at: Vec3) {
    const rnd = this.random;
    for (let index = 0; index < 10; index += 1) {
      this.glow.add(this.particle({
        x: at.x, y: at.y, z: at.z,
        vx: (rnd() - 0.5) * 2, vy: (rnd() - 0.2) * 1.5, vz: rnd() * 1.5,
        life: 0.6 + rnd() * 0.4, size: 0.18 + rnd() * 0.18, r: 0.9, g: 0.92, b: 1, alpha: 0.35,
        kind: 1, drag: 3, gravity: 0.5,
      }));
    }
  }

  /** Gol: canhões de confete atrás do gol e nas laterais (o artilheiro ganha o dele na festa). */
  goal() {
    // Atrás do gol e nas laterais perto da área: a chuva cobre o lance de qualquer câmera.
    const cannons: Vec3[] = [
      { x: -14, y: 4, z: 61 },
      { x: 14, y: 4, z: 61 },
      { x: -30, y: 4, z: 58 },
      { x: 30, y: 4, z: 58 },
      { x: 0, y: 5, z: 63 },
      { x: -41, y: 4, z: 44 },
      { x: 41, y: 4, z: 44 },
    ];
    this.cannons.length = 0;
    const per = this.options.performance ? 70 : 150;
    for (const cannon of cannons) this.cannons.push({ at: cannon, left: per, rate: per / 1.6, colors: this.confettiColors });
    this.pulse(0.55, "#fff8e0");
  }

  /** Estouro de confete num ponto (artilheiro comemorando). */
  burst(at: Vec3, count: number, power: number) {
    const rnd = this.random;
    for (let index = 0; index < count; index += 1) {
      const theta = rnd() * TAU;
      const up = 0.5 + rnd() * 0.5;
      const speed = power * (0.5 + rnd() * 0.6);
      const color = this.confettiColors[Math.floor(rnd() * this.confettiColors.length)];
      this.solid.add(this.particle({
        x: at.x, y: Math.max(0.5, at.y), z: at.z,
        // Mais para os lados que para cima: a chuva cai em volta de quem comemora, dentro do close.
        vx: Math.cos(theta) * speed * (1 - up * 0.4), vy: speed * up * 0.7, vz: Math.sin(theta) * speed * (1 - up * 0.4),
        life: 3.5 + rnd() * 2.5, size: 0.07 + rnd() * 0.05, r: color.r, g: color.g, b: color.b,
        kind: 0, spin: (rnd() - 0.5) * 9, flipRate: 6 + rnd() * 10, drag: 1.6, gravity: 2.2, sway: rnd() * 10,
      }));
    }
  }

  /** Clarão de tela (0..1), sem nada no movimento reduzido. */
  pulse(strength: number, color = "#ffffff") {
    if (this.options.reducedMotion) return;
    if (strength >= this.flash) this.overlayUniforms.uFlashColor.value.set(color);
    this.flash = Math.max(this.flash, strength);
  }

  /** Passagem de câmera do replay: escurece rápido e volta. */
  dipToBlack() {
    this.dip = 1;
  }

  setVignette(value: number) {
    this.vignetteTarget = this.options.reducedMotion ? 0 : value;
  }

  setFreeze(value: number) {
    this.freezeTarget = value;
  }

  setBars(on: boolean) {
    this.barsTarget = on ? 1 : 0;
  }

  clear() {
    this.solid.clear();
    this.glow.clear();
    this.cannons.length = 0;
  }

  /** Nenhuma partícula no ar, canhão atirando nem filtro de tela andando. */
  get settled(): boolean {
    if (this.solid.count > 0 || this.glow.count > 0) return false;
    for (const cannon of this.cannons) if (cannon.left > 0) return false;
    return (
      this.flash <= 0.002 &&
      this.dip <= 0.002 &&
      Math.abs(this.vignette - this.vignetteTarget) < 0.003 &&
      Math.abs(this.freeze - this.freezeTarget) < 0.003 &&
      Math.abs(this.bars - this.barsTarget) < 0.003
    );
  }

  /** `gameDt` move partículas (câmera lenta); `realDt` move o filtro de tela. */
  update(gameDt: number, realDt: number) {
    this.time += gameDt;
    const rnd = this.random;
    for (const cannon of this.cannons) {
      if (cannon.left <= 0) continue;
      const shots = Math.min(cannon.left, Math.ceil(cannon.rate * gameDt));
      cannon.left -= shots;
      for (let index = 0; index < shots; index += 1) {
        const color = cannon.colors[Math.floor(rnd() * cannon.colors.length)];
        // Para cima e um pouco para o campo.
        const spread = (rnd() - 0.5) * 3;
        // Para o campo: de trás do gol vai em -z; das laterais, para o meio.
        const side = Math.abs(cannon.at.x) > 38 ? -Math.sign(cannon.at.x) : 0;
        const inward = 2.5 + rnd() * 3.5;
        this.solid.add(this.particle({
          x: cannon.at.x + (rnd() - 0.5), y: cannon.at.y, z: cannon.at.z,
          vx: side ? side * inward : spread, vy: 13 + rnd() * 7, vz: side ? spread : -inward,
          life: 5 + rnd() * 3, size: 0.13 + rnd() * 0.08, r: color.r, g: color.g, b: color.b,
          kind: 0, spin: (rnd() - 0.5) * 9, flipRate: 5 + rnd() * 10, drag: 1.25, gravity: 2.2, sway: rnd() * 10,
        }));
      }
    }
    this.solid.update(gameDt, this.time);
    this.glow.update(gameDt, this.time);

    this.flash = Math.max(0, this.flash - realDt * 2.6);
    this.dip = Math.max(0, this.dip - realDt * 3.2);
    this.vignette = THREE.MathUtils.damp(this.vignette, this.vignetteTarget, 4, realDt);
    this.freeze = THREE.MathUtils.damp(this.freeze, this.freezeTarget, 5, realDt);
    this.bars = THREE.MathUtils.damp(this.bars, this.barsTarget, 6, realDt);
    const u = this.overlayUniforms;
    u.uFlash.value = this.flash;
    u.uDip.value = Math.min(1, this.dip * 1.3) * (this.dip > 0 ? 1 : 0);
    u.uVignette.value = this.vignette;
    u.uFreeze.value = this.freeze;
    u.uBars.value = this.bars;
    this.overlay.visible = this.flash > 0.002 || this.dip > 0.002 || this.vignette > 0.01 || this.freeze > 0.01 || this.bars > 0.01;
  }

  dispose() {
    this.solid.dispose();
    this.glow.dispose();
    this.overlay.geometry.dispose();
    (this.overlay.material as THREE.Material).dispose();
  }
}
