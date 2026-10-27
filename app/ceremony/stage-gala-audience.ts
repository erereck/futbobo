// Plateia da gala: fileiras de convidados sentados, de bloco como os bonecos,
// numa InstancedMesh só (cadeira de veludo + pessoa = uma instância).
//
// Tudo que mexe é do shader: palmas (braços sobem para o peito e batem),
// cabeça que acompanha, quique do corpo e o "de pé" da ovação. Cada um tem a
// sua fase, ritmo e vontade (uns nem aplaudem, uns não levantam). A luz também
// é de mentira e barata: ambiente da sala + o palco iluminando a frente. De
// costas, contra o palco aceso, viram silhuetas.
//
// Os celulares erguidos são pontos de luz (um draw call) que acendem na revelação.

import * as THREE from "three";

export type AudienceLayout = {
  /** z de cada fileira (a primeira é a mais perto do palco) e o y do piso dela. */
  rows: Array<{ z: number; y: number }>;
  /** Meia-largura da plateia e meia-largura do corredor do meio. */
  halfWidth: number;
  aisle: number;
  /** Largura de cada cadeira. */
  seat: number;
  /** Cadeiras vazias de propósito (para figurantes de verdade): índice da fileira e x. */
  reserved: Array<{ row: number; x: number }>;
  seed: number;
};

/** px de boneco → unidades (um tico menor que os bonecos do palco). */
const S = 1.12;

const AUDIENCE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uApplause;
  uniform float uStand;
  attribute float aPart;
  attribute vec3 aPivot;
  attribute vec3 aClothes;
  attribute vec4 aSkin;
  attribute vec3 aHair;
  attribute vec4 aSeed;
  varying vec3 vColor;
  varying vec3 vNormalW;
  varying float vSeat;
  #include <fog_pars_vertex>

  vec3 rotX(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
  vec3 rotY(vec3 p, float a) { float c = cos(a); float s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }

  void main() {
    vec3 p = position;
    vec3 n = normal;
    float part = aPart;
    vSeat = part < 0.5 ? 1.0 : 0.0;
    // Cadeira reservada: some a pessoa, fica a cadeira.
    if (aSkin.w > 0.5 && part > 0.5) p = vec3(0.0);
    float claps = step(0.16, aSeed.z);
    float clap = uApplause * claps * smoothstep(0.0, 0.25, uApplause * 1.4 - aSeed.x * 0.25);
    float t = uTime * mix(3.4, 5.0, aSeed.y) + aSeed.x * 6.2831;
    float stand = clamp(uStand * 2.2 - aSeed.w * 1.4, 0.0, 1.0) * step(0.3, aSeed.w);
    stand = stand * stand * (3.0 - 2.0 * stand);
    if (part > 0.5) {
      if (part > 3.5) {
        // Braço e mão: do colo para o peito, para dentro, e batem.
        float side = (part < 4.5 || (part > 5.5 && part < 6.5)) ? 1.0 : -1.0;
        float raise = smoothstep(0.0, 1.0, clap * 1.2);
        float pitch = mix(0.5, 1.35, raise) + raise * 0.18 * stand;
        float yaw = side * (raise * 0.52 + clap * 0.17 * sin(t));
        vec3 local = rotY(rotX(p - aPivot, pitch), yaw);
        n = rotY(rotX(n, pitch), yaw);
        p = aPivot + local;
      } else if (part > 1.5) {
        // Cabeça acompanha o ritmo.
        float nod = 0.1 * clap * sin(t * 0.5 + 1.3) - 0.05 * stand;
        p = aPivot + rotX(p - aPivot, nod);
        n = rotX(n, nod);
      }
      // De pé: o tronco sobe e as pernas (abaixo do quadril) esticam até o chão.
      float lift = stand * 9.0;
      if (part < 1.5 && p.y < HIP_Y) p.y *= 1.0 + lift / HIP_Y;
      else p.y += lift;
      p.y += clap * 0.45 * abs(sin(t * 0.5));
    }
    vec3 color = part < 0.5 ? vec3(0.0) : part < 1.5 ? aClothes : part < 2.5 ? aSkin.rgb : part < 3.5 ? aHair : part < 5.5 ? aClothes : aSkin.rgb;
    vColor = color;
    mat4 world = modelMatrix * instanceMatrix;
    vNormalW = normalize(mat3(world) * n);
    vec4 mvPosition = viewMatrix * world * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const AUDIENCE_FRAGMENT = /* glsl */ `
  uniform vec3 uSeatColor;
  uniform vec3 uAmbient;
  uniform vec3 uStageColor;
  uniform vec3 uStageDir;
  uniform vec3 uTopColor;
  varying vec3 vColor;
  varying vec3 vNormalW;
  varying float vSeat;
  #include <fog_pars_fragment>
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 base = mix(vColor, uSeatColor, vSeat);
    float front = max(0.0, dot(n, uStageDir));
    float top = max(0.0, n.y);
    vec3 light = uAmbient + uStageColor * front + uTopColor * top;
    gl_FragColor = vec4(base * light, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

const PHONE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uOn;
  uniform float uFlash;
  uniform float uScale;
  attribute vec4 aSeed;
  varying vec3 vColor;
  #include <fog_pars_vertex>
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    // Cada celular acende no seu tempo e treme um pouco na mão.
    float on = clamp(uOn * 2.0 - aSeed.x, 0.0, 1.0);
    float wobble = 0.85 + 0.15 * sin(uTime * (1.5 + aSeed.y * 2.0) + aSeed.z * 6.28);
    // Flash de foto: um em cada tanto, curtinho.
    float cycle = fract(uTime * (0.35 + aSeed.w * 0.4) + aSeed.z * 13.0);
    float flash = uFlash * smoothstep(0.93, 0.935, cycle) * (1.0 - smoothstep(0.935, 0.975, cycle)) * step(0.55, aSeed.y);
    float level = on * wobble + flash * 6.0;
    vColor = mix(vec3(0.55, 0.72, 1.0), vec3(1.0), flash) * level;
    gl_PointSize = level > 0.001 ? min(64.0, (3.2 + flash * 6.0) * uScale / -mvPosition.z) : 0.0;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const PHONE_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  #include <fog_pars_fragment>
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    float glow = exp(-d * d * 5.0) + 0.6 * smoothstep(0.35, 0.0, max(abs(c.x) * 1.6, abs(c.y)));
    vec3 color = vColor * glow;
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        float fogF = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      color *= 1.0 - fogF;
    #endif
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

type Piece = { size: [number, number, number]; center: [number, number, number]; part: number; pivot: [number, number, number] };

/** Convidado sentado olhando para -z (o palco), pés no chão da fileira (y = 0). */
function personPieces(): Piece[] {
  const hips: [number, number, number] = [0, 9, 1];
  const neck: [number, number, number] = [0, 20, 1];
  const pieces: Piece[] = [
    // Cadeira: encosto, assento, braços.
    { size: [14, 15, 2.4], center: [0, 12, 5.4], part: 0, pivot: hips },
    { size: [14, 2, 9], center: [0, 7, 0], part: 0, pivot: hips },
    { size: [1.6, 2, 9], center: [7.4, 10.5, 0.5], part: 0, pivot: hips },
    { size: [1.6, 2, 9], center: [-7.4, 10.5, 0.5], part: 0, pivot: hips },
    // Corpo: coxa, canela, tronco.
    { size: [8, 3, 8], center: [0, 9.5, -2], part: 1, pivot: hips },
    { size: [7.6, 8, 3], center: [0, 4, -5.5], part: 1, pivot: hips },
    { size: [8, 11, 4], center: [0, 16.5, 1], part: 1, pivot: hips },
    // Cabeça e cabelo.
    { size: [7, 7, 7], center: [0, 25.5, 1], part: 2, pivot: neck },
    { size: [7.4, 2.4, 7.4], center: [0, 28.6, 1.2], part: 3, pivot: neck },
    { size: [7.4, 4, 1.6], center: [0, 26.4, 4.5], part: 3, pivot: neck },
  ];
  // Braços (manga) e mãos, presos no ombro.
  for (const side of [1, -1]) {
    const shoulder: [number, number, number] = [5.7 * side, 21, 1];
    pieces.push({ size: [3.2, 8, 3.2], center: [shoulder[0], shoulder[1] - 4, shoulder[2]], part: side > 0 ? 4 : 5, pivot: shoulder });
    pieces.push({ size: [3, 2.4, 3], center: [shoulder[0], shoulder[1] - 9.2, shoulder[2]], part: side > 0 ? 6 : 7, pivot: shoulder });
  }
  return pieces;
}

/** Topo do cabelo de quem está sentado, acima do piso da fileira (cada um varia até ~10% no tamanho). */
export const AUDIENCE_HEAD_TOP = S * Math.max(...personPieces()
  .filter((piece) => piece.part === 2 || piece.part === 3)
  .map((piece) => piece.center[1] + piece.size[1] / 2));

function personGeometry() {
  const positions: number[] = [];
  const normals: number[] = [];
  const parts: number[] = [];
  const pivots: number[] = [];
  const indices: number[] = [];
  for (const piece of personPieces()) {
    const box = new THREE.BoxGeometry(piece.size[0] * S, piece.size[1] * S, piece.size[2] * S);
    box.translate(piece.center[0] * S, piece.center[1] * S, piece.center[2] * S);
    const base = positions.length / 3;
    const position = box.getAttribute("position") as THREE.BufferAttribute;
    const normal = box.getAttribute("normal") as THREE.BufferAttribute;
    for (let index = 0; index < position.count; index += 1) {
      positions.push(position.getX(index), position.getY(index), position.getZ(index));
      normals.push(normal.getX(index), normal.getY(index), normal.getZ(index));
      parts.push(piece.part);
      pivots.push(piece.pivot[0] * S, piece.pivot[1] * S, piece.pivot[2] * S);
    }
    const index = box.getIndex()!;
    for (let i = 0; i < index.count; i += 1) indices.push(base + index.getX(i));
    box.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("aPart", new THREE.Float32BufferAttribute(parts, 1));
  geometry.setAttribute("aPivot", new THREE.Float32BufferAttribute(pivots, 3));
  geometry.setIndex(indices);
  return geometry;
}

function random(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// Traje de gala: quase tudo escuro, com vestidos de cor aqui e ali.
const SUITS = ["#0d0d10", "#111319", "#15151a", "#1b1c24", "#0f1420", "#22232a", "#1a1512"];
const GOWNS = ["#7a1020", "#c9a24a", "#e9e4da", "#0f4a3a", "#3a1a5a", "#9a2a4a", "#b88a3a", "#203a6a"];
const SKINS = ["#f1c9a5", "#e0ac83", "#c68b62", "#a8714f", "#8a5a3c", "#6b4430", "#4e3124"];
const HAIRS = ["#1a1410", "#2b1d14", "#4a3020", "#6b4a2a", "#a8824a", "#d8c08a", "#8a8a8a", "#0d0d0d"];

export class GalaAudience {
  readonly mesh: THREE.InstancedMesh;
  readonly phones: THREE.Points;
  /** Posições das cadeiras reservadas (assento, de frente para o palco). */
  readonly reservedSeats: Array<{ x: number; y: number; z: number }> = [];
  private readonly material: THREE.ShaderMaterial;
  private readonly phoneMaterial: THREE.ShaderMaterial;
  private readonly phoneGeometry: THREE.BufferGeometry;
  private applause = 0;
  private applauseWanted = 0;
  private stand = 0;
  private standWanted = 0;
  private phonesOn = 0;
  private phonesWanted = 0;
  private readonly size = new THREE.Vector2();

  constructor(layout: AudienceLayout, private readonly reducedMotion: boolean) {
    const rand = random(layout.seed);
    const seats: Array<{ x: number; y: number; z: number; row: number; reserved: boolean }> = [];
    layout.rows.forEach((row, rowIndex) => {
      // Fileiras de trás um pouco desencontradas (cada um enxerga entre duas cabeças).
      const offset = rowIndex % 2 ? layout.seat / 2 : 0;
      for (let x = layout.aisle + layout.seat / 2 + offset; x < layout.halfWidth; x += layout.seat) {
        for (const side of [-1, 1]) {
          const sx = x * side;
          const reserved = layout.reserved.some((seat) => seat.row === rowIndex && Math.abs(seat.x - sx) < layout.seat / 2);
          seats.push({ x: sx, y: row.y, z: row.z, row: rowIndex, reserved });
        }
      }
    });

    const geometry = personGeometry();
    const count = seats.length;
    const clothes = new Float32Array(count * 3);
    const skin = new Float32Array(count * 4);
    const hair = new Float32Array(count * 3);
    const seed = new Float32Array(count * 4);
    const color = new THREE.Color();
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 },
        uApplause: { value: 0 },
        uStand: { value: 0 },
        uSeatColor: { value: new THREE.Color("#5c111b") },
        uAmbient: { value: new THREE.Color("#0c0b12") },
        uStageColor: { value: new THREE.Color("#4a3a2a") },
        uStageDir: { value: new THREE.Vector3(0, 0.45, -1).normalize() },
        uTopColor: { value: new THREE.Color("#2a2230") },
      }]),
      vertexShader: AUDIENCE_VERTEX,
      fragmentShader: AUDIENCE_FRAGMENT,
      defines: { HIP_Y: (11 * S).toFixed(2) },
      fog: true,
    });
    this.mesh = new THREE.InstancedMesh(geometry, this.material, count);
    this.mesh.name = "gala-audience";
    seats.forEach((seat, index) => {
      // Gira de leve para o centro do palco e cada um com seu jeito.
      const yaw = Math.atan2(seat.x, seat.z + 40) * 0.35 + (rand() - 0.5) * 0.12;
      quaternion.setFromAxisAngle(up, yaw);
      const size = 0.94 + rand() * 0.12;
      matrix.compose(position.set(seat.x, seat.y, seat.z), quaternion, scale.set(size, size * (0.96 + rand() * 0.08), size));
      this.mesh.setMatrixAt(index, matrix);
      const gown = rand() < 0.2;
      color.set(gown ? GOWNS[Math.floor(rand() * GOWNS.length)] : SUITS[Math.floor(rand() * SUITS.length)]);
      clothes.set([color.r, color.g, color.b], index * 3);
      color.set(SKINS[Math.floor(rand() * SKINS.length)]);
      const empty = seat.reserved || rand() < 0.03;
      skin.set([color.r, color.g, color.b, empty ? 1 : 0], index * 4);
      color.set(HAIRS[Math.floor(rand() * HAIRS.length)]);
      hair.set([color.r, color.g, color.b], index * 3);
      seed.set([rand(), rand(), rand(), rand()], index * 4);
      if (seat.reserved) this.reservedSeats.push({ x: seat.x, y: seat.y, z: seat.z });
    });
    geometry.setAttribute("aClothes", new THREE.InstancedBufferAttribute(clothes, 3));
    geometry.setAttribute("aSkin", new THREE.InstancedBufferAttribute(skin, 4));
    geometry.setAttribute("aHair", new THREE.InstancedBufferAttribute(hair, 3));
    geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seed, 4));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingSphere();
    // O shader levanta e estica: a esfera calculada não acompanha.
    this.mesh.frustumCulled = false;

    // Celulares: na mão erguida de um em cada tanto, à frente do rosto.
    const phonePositions: number[] = [];
    const phoneSeeds: number[] = [];
    for (const seat of seats) {
      if (seat.reserved || rand() > 0.14) continue;
      phonePositions.push(seat.x + (rand() - 0.5) * 6, seat.y + 30 * S + rand() * 8, seat.z - 6 - rand() * 3);
      phoneSeeds.push(rand(), rand(), rand(), rand());
    }
    this.phoneGeometry = new THREE.BufferGeometry();
    this.phoneGeometry.setAttribute("position", new THREE.Float32BufferAttribute(phonePositions, 3));
    this.phoneGeometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(phoneSeeds, 4));
    this.phoneGeometry.computeBoundingSphere();
    this.phoneMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTime: { value: 0 },
        uOn: { value: 0 },
        uFlash: { value: 0 },
        uScale: { value: 400 },
      }]),
      vertexShader: PHONE_VERTEX,
      fragmentShader: PHONE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
      toneMapped: false,
    });
    this.phones = new THREE.Points(this.phoneGeometry, this.phoneMaterial);
    this.phones.name = "gala-phones";
    this.phones.frustumCulled = false;
    this.phones.visible = false;
    this.phones.onBeforeRender = (renderer, _scene, camera) => {
      renderer.getDrawingBufferSize(this.size);
      const projection = (camera as THREE.PerspectiveCamera).projectionMatrix.elements[5];
      this.phoneMaterial.uniforms.uScale.value = this.size.y * 0.5 * projection;
    };
  }

  /** Palmas 0..1 (0 para); `standing` põe de pé quem tem vontade. */
  setApplause(level: number, standing: boolean) {
    this.applauseWanted = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
    this.standWanted = standing ? 1 : 0;
  }

  setPhones(on: boolean) {
    this.phonesWanted = on ? 1 : 0;
  }

  /** Luz da sala na plateia (0 = breu; 1 = luzes da casa acesas) e o palco iluminando a frente. */
  setLighting(house: number, stage: number) {
    const uniforms = this.material.uniforms;
    (uniforms.uAmbient.value as THREE.Color).setRGB(0.008 + 0.03 * house, 0.007 + 0.026 * house, 0.011 + 0.032 * house);
    (uniforms.uStageColor.value as THREE.Color).setRGB(0.3 * stage, 0.22 * stage, 0.16 * stage);
    (uniforms.uTopColor.value as THREE.Color).setRGB(0.012 + 0.05 * house, 0.01 + 0.04 * house, 0.016 + 0.05 * house);
  }

  update(time: number, dt: number) {
    const snap = !(dt > 0);
    const k = snap ? 1 : 1 - Math.exp(-5 * Math.min(dt, 0.1));
    this.applause += (this.applauseWanted - this.applause) * k;
    const standRate = snap ? 1 : 1 - Math.exp(-1.6 * Math.min(dt, 0.1));
    this.stand += (this.standWanted - this.stand) * standRate;
    this.phonesOn = snap ? this.phonesWanted : Math.max(0, Math.min(1, this.phonesOn + Math.sign(this.phonesWanted - this.phonesOn) * Math.min(dt, 0.1) / 1.6));
    const uniforms = this.material.uniforms;
    uniforms.uTime.value = time;
    uniforms.uApplause.value = this.applause;
    uniforms.uStand.value = this.stand;
    const phone = this.phoneMaterial.uniforms;
    phone.uTime.value = time;
    phone.uOn.value = this.phonesOn;
    phone.uFlash.value = this.reducedMotion ? 0 : this.phonesOn;
    this.phones.visible = this.phonesOn > 0.001;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.phoneGeometry.dispose();
    this.phoneMaterial.dispose();
    this.mesh.dispose();
  }
}
