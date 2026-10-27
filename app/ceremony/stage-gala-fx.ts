// Efeitos da gala, cada um num draw call e animado só no shader:
// - poeira no ar (pontos que acendem quando passam dentro de um feixe);
// - chuva de papel dourado (estouro do teto e chuva contínua; assenta no chão);
// - pontos de brilho fixos e móveis (arandelas da sala, cortina de estrelas,
//   lentes dos refletores que ofuscam quando apontam para a câmera).

import * as THREE from "three";
import { SPOT_COUNT } from "./stage-gala-spots";

/** Tamanho do ponto em pixels a partir do tamanho no mundo (renderer + câmera do quadro). */
function pointScale(points: THREE.Points, uniform: { value: number }) {
  const size = new THREE.Vector2();
  points.onBeforeRender = (renderer, _scene, camera) => {
    renderer.getDrawingBufferSize(size);
    uniform.value = size.y * 0.5 * (camera as THREE.PerspectiveCamera).projectionMatrix.elements[5];
  };
}

const FOG_FADE = /* glsl */ `
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogF = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    color *= 1.0 - fogF;
  #endif
`;

// ------------------------------------------------------------- poeira

const HAZE_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uAmbient;
  uniform vec3 uBoxMin;
  uniform vec3 uBoxSize;
  uniform vec3 uSpotPos[SPOTS];
  uniform vec3 uSpotDir[SPOTS];
  uniform float uSpotCos[SPOTS];
  uniform vec3 uSpotColor[SPOTS];
  attribute vec4 aSeed;
  varying vec3 vColor;
  #include <fog_pars_vertex>
  void main() {
    vec3 drift = vec3(
      sin(uTime * 0.11 + aSeed.x * 6.2831) * 14.0 + uTime * 1.8,
      sin(uTime * 0.07 + aSeed.y * 6.2831) * 9.0 + uTime * 0.7,
      cos(uTime * 0.09 + aSeed.z * 6.2831) * 14.0 - uTime * 0.6);
    vec3 p = uBoxMin + mod(position - uBoxMin + drift, uBoxSize);
    vec3 light = vec3(0.0);
    for (int i = 0; i < SPOTS; i++) {
      vec3 v = p - uSpotPos[i];
      float along = dot(v, uSpotDir[i]);
      if (along <= 0.0) continue;
      float c = along / max(length(v), 1e-3);
      float inside = smoothstep(uSpotCos[i], mix(uSpotCos[i], 1.0, 0.45), c);
      light += uSpotColor[i] * inside * (120.0 / (120.0 + along * 0.35));
    }
    float twinkle = 0.55 + 0.45 * sin(uTime * (0.7 + aSeed.w * 1.3) + aSeed.x * 31.0);
    vColor = (light * 2.2 + vec3(uAmbient)) * twinkle;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    float size = mix(0.9, 2.2, aSeed.w);
    gl_PointSize = dot(vColor, vec3(1.0)) > 0.003 ? clamp(size * uScale / -mvPosition.z, 1.0, 22.0) : 0.0;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const HAZE_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  #include <fog_pars_fragment>
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    vec3 color = vColor * exp(-d * d * 4.0);
    ${FOG_FADE}
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class GalaHaze {
  readonly points: THREE.Points;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;

  constructor(
    box: { min: THREE.Vector3; max: THREE.Vector3 },
    count: number,
    spotUniforms: Record<string, THREE.IUniform>,
  ) {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 4);
    let state = 91;
    const rand = () => {
      state = (state * 16807) % 2147483647;
      return state / 2147483647;
    };
    const size = new THREE.Vector3().subVectors(box.max, box.min);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = box.min.x + rand() * size.x;
      positions[index * 3 + 1] = box.min.y + rand() * size.y;
      positions[index * 3 + 2] = box.min.z + rand() * size.z;
      seeds.set([rand(), rand(), rand(), rand()], index * 4);
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
    this.geometry.boundingSphere = new THREE.Sphere(box.min.clone().add(box.max).multiplyScalar(0.5), size.length() / 2);
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uScale: { value: 400 },
      uAmbient: { value: 0.012 },
      uBoxMin: { value: box.min.clone() },
      uBoxSize: { value: size },
    }]);
    Object.assign(uniforms, spotUniforms);
    this.material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: HAZE_VERTEX,
      fragmentShader: HAZE_FRAGMENT,
      defines: { SPOTS: SPOT_COUNT },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = "gala-haze";
    this.points.frustumCulled = false;
    this.points.renderOrder = 7;
    pointScale(this.points, this.material.uniforms.uScale);
  }

  update(time: number) {
    this.material.uniforms.uTime.value = time;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// ------------------------------------------------------------- confete

const CONFETTI_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uBurstTime;
  uniform float uBurstLife;
  uniform vec3 uBurstAt;
  uniform float uShare;
  uniform float uRain;
  uniform vec3 uRainCenter;
  uniform vec2 uRainSize;
  uniform float uTop;
  uniform vec4 uRiser;
  uniform float uRiserTop;
  uniform float uSpin;
  uniform vec3 uColors[4];
  uniform vec3 uLightDir;
  attribute vec4 aRandA;
  attribute vec4 aRandB;
  varying vec3 vColor;
  #include <fog_pars_vertex>

  mat3 axisAngle(vec3 axis, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    float t = 1.0 - c;
    return mat3(
      t * axis.x * axis.x + c, t * axis.x * axis.y + s * axis.z, t * axis.x * axis.z - s * axis.y,
      t * axis.x * axis.y - s * axis.z, t * axis.y * axis.y + c, t * axis.y * axis.z + s * axis.x,
      t * axis.x * axis.z + s * axis.y, t * axis.y * axis.z - s * axis.x, t * axis.z * axis.z + c);
  }

  float floorAt(vec2 xz) {
    return (xz.x > uRiser.x && xz.x < uRiser.y && xz.y > uRiser.z && xz.y < uRiser.w) ? uRiserTop : 0.0;
  }

  void main() {
    float fall = mix(24.0, 38.0, aRandB.x);
    float flutter = mix(1.6, 3.4, aRandB.y);
    float age;
    float alive;
    vec3 pos;
    if (aRandA.w < uShare) {
      // Estouro: sai do teto sobre o ponto, abre para os lados e desce rodopiando.
      age = uTime - uBurstTime;
      float angle = aRandA.x * 6.2831;
      float speed = mix(20.0, 120.0, sqrt(aRandA.y));
      float drag = (1.0 - exp(-1.5 * max(age, 0.0))) / 1.5;
      float vy = mix(-70.0, 25.0, aRandA.z);
      pos = vec3(uBurstAt.x + cos(angle) * speed * drag, uTop + vy * drag - fall * max(0.0, age - 0.35), uBurstAt.z + sin(angle) * speed * drag * 0.7);
      alive = step(0.0, age) * (1.0 - smoothstep(uBurstLife - 1.5, uBurstLife, age));
    } else {
      // Chuva: cada papel cai, fica um pouco no chão e volta ao teto (sorteado de novo a cada volta).
      float span = uTop / fall + 2.5;
      float local = uTime + aRandB.z * span;
      float cycle = floor(local / span);
      age = local - cycle * span;
      float pick = fract(sin((cycle + 1.0) * 12.9898 + aRandA.x * 78.233) * 43758.5453);
      alive = step(pick, uRain) * (1.0 - smoothstep(span - 0.5, span, age)) * smoothstep(0.0, 0.3, age);
      pos = vec3(uRainCenter.x + (aRandA.x - 0.5) * uRainSize.x, uTop + 10.0 - fall * age, uRainCenter.z + (aRandA.y - 0.5) * uRainSize.y);
    }
    pos.x += sin(age * flutter + aRandB.w * 6.2831) * 4.0;
    pos.z += cos(age * flutter * 0.8 + aRandB.z * 6.2831) * 4.0;
    float ground = floorAt(pos.xz) + 0.12 + aRandB.x * 0.08;
    float landed = step(pos.y, ground);
    pos.y = max(pos.y, ground);

    vec3 axis = normalize(aRandB.yzw * 2.0 - 1.0 + vec3(0.001, 0.002, 0.003));
    mat3 rotation = axisAngle(axis, age * mix(4.0, 10.0, aRandA.z) * uSpin + aRandA.x * 6.2831);
    // No chão: deitado, virado ao acaso.
    float yaw = aRandA.x * 6.2831;
    mat3 lying = mat3(cos(yaw), 0.0, -sin(yaw), -sin(yaw), 0.0, -cos(yaw), 0.0, 1.0, 0.0);
    mat3 orient = landed > 0.5 ? lying : rotation;
    float size = mix(0.8, 1.25, aRandB.x) * alive;
    // Perto da lente o papel viraria um borrão do tamanho da tela: o tamanho na
    // tela tem teto e, mais perto que NEAR_FULL, ele encolhe até sumir em NEAR_GONE.
    float depth = -(viewMatrix * modelMatrix * vec4(pos, 1.0)).z;
    float onScreen = 1.3 * size * projectionMatrix[1][1] / max(depth, 1.0);
    size *= min(1.0, MAX_SCREEN / max(onScreen, 1e-4)) * smoothstep(NEAR_GONE, NEAR_FULL, depth);
    vec3 local = orient * (position * vec3(2.6, 1.6, 1.0) * size);
    vec3 normal = orient * vec3(0.0, 0.0, 1.0);
    vec4 world = modelMatrix * vec4(pos + local, 1.0);
    vec3 view = normalize(cameraPosition - world.xyz);
    float facing = abs(dot(normal, uLightDir));
    vec3 halfway = normalize(uLightDir + view);
    float glint = pow(abs(dot(normal, halfway)), 28.0);
    int tone = int(floor(aRandB.w * 3.999));
    vec3 base = uColors[tone];
    vColor = base * (0.28 + 0.5 * facing) + vec3(1.0, 0.92, 0.75) * glint * 2.6;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const CONFETTI_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  #include <fog_pars_fragment>
  void main() {
    gl_FragColor = vec4(vColor, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export class GalaConfetti {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private time = 0;
  private burstTime = -1e4;
  private rain = 0;
  private rainWanted = 0;
  private readonly life = 16;

  constructor(options: {
    count: number;
    top: number;
    riser: { left: number; right: number; back: number; front: number; top: number };
    reducedMotion: boolean;
    rainCenter: THREE.Vector3Like;
    rainSize: { x: number; z: number };
  }) {
    const plane = new THREE.PlaneGeometry(1, 1);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = plane.index;
    this.geometry.setAttribute("position", plane.getAttribute("position"));
    this.geometry.instanceCount = options.count;
    const a = new Float32Array(options.count * 4);
    const b = new Float32Array(options.count * 4);
    let state = 7;
    const rand = () => {
      state = (state * 16807) % 2147483647;
      return state / 2147483647;
    };
    for (let index = 0; index < options.count * 4; index += 1) {
      a[index] = rand();
      b[index] = rand();
    }
    this.geometry.setAttribute("aRandA", new THREE.InstancedBufferAttribute(a, 4));
    this.geometry.setAttribute("aRandB", new THREE.InstancedBufferAttribute(b, 4));
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uBurstTime: { value: -1e4 },
      uBurstLife: { value: this.life },
      uBurstAt: { value: new THREE.Vector3() },
      uShare: { value: 0.6 },
      uRain: { value: 0 },
      uRainCenter: { value: new THREE.Vector3(options.rainCenter.x, options.rainCenter.y, options.rainCenter.z) },
      uRainSize: { value: new THREE.Vector2(options.rainSize.x, options.rainSize.z) },
      uTop: { value: options.top },
      uRiser: { value: new THREE.Vector4(options.riser.left, options.riser.right, options.riser.back, options.riser.front) },
      uRiserTop: { value: options.riser.top },
      uSpin: { value: options.reducedMotion ? 0.45 : 1 },
      uColors: { value: [new THREE.Color("#ffcf5c"), new THREE.Color("#fff0c2"), new THREE.Color("#ffffff"), new THREE.Color("#d6962a")] },
      uLightDir: { value: new THREE.Vector3(0.2, 0.8, 0.55).normalize() },
    }]);
    this.material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: CONFETTI_VERTEX,
      fragmentShader: CONFETTI_FRAGMENT,
      // Distâncias até a câmera (unidades do boneco, ~40 de altura) e o teto do
      // papel na tela (lado maior / altura da tela).
      defines: { NEAR_GONE: "25.0", NEAR_FULL: "40.0", MAX_SCREEN: "0.08" },
      side: THREE.DoubleSide,
      fog: true,
    });
    plane.dispose();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = "gala-confetti";
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Estouro do teto sobre `at` (x, z do mundo). `startTime` no relógio do `update` (padrão: agora). */
  burst(at: THREE.Vector3Like, startTime?: number) {
    this.burstTime = startTime ?? this.time;
    this.material.uniforms.uBurstAt.value.set(at.x, at.y, at.z);
    this.material.uniforms.uBurstTime.value = this.burstTime;
  }

  /** Chuva contínua (0 para; 1 cheia), opcionalmente centrada em outro ponto. */
  setRain(amount: number, center?: THREE.Vector3Like) {
    this.rainWanted = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
    if (center) this.material.uniforms.uRainCenter.value.set(center.x, center.y, center.z);
  }

  /** Cor de um dos quatro papéis (padrão: ouro, ouro claro, branco, ouro velho). */
  setColor(index: number, color: string) {
    const colors = this.material.uniforms.uColors.value as THREE.Color[];
    colors[Math.max(0, Math.min(3, index))]?.set(color);
  }

  update(time: number, dt: number) {
    this.time = time;
    const k = dt > 0 ? 1 - Math.exp(-1.5 * Math.min(dt, 0.1)) : 1;
    this.rain += (this.rainWanted - this.rain) * k;
    const uniforms = this.material.uniforms;
    uniforms.uTime.value = time;
    uniforms.uRain.value = this.rain;
    const burstAge = time - this.burstTime;
    this.mesh.visible = this.rain > 0.002 || (burstAge >= 0 && burstAge < this.life);
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

// ------------------------------------------------------------- brilhos

const GLOW_VERTEX = /* glsl */ `
  uniform float uScale;
  uniform float uTime;
  uniform vec3 uLevels;
  attribute vec3 aColor;
  attribute float aSize;
  attribute vec3 aDir;
  attribute vec2 aInfo;
  varying vec3 vColor;
  #include <fog_pars_vertex>
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec4 mvPosition = viewMatrix * world;
    float level = aInfo.x < 0.5 ? uLevels.x : aInfo.x < 1.5 ? uLevels.y : uLevels.z;
    float facing = 1.0;
    if (dot(aDir, aDir) > 0.0) {
      // Lente: ofusca quando aponta para a câmera.
      float toward = max(0.0, dot(normalize(aDir), normalize(cameraPosition - world.xyz)));
      facing = 0.06 + 0.94 * pow(toward, 5.0);
    }
    float twinkle = aInfo.y > 0.0 ? 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * (0.6 + aInfo.y * 2.4) + aInfo.y * 57.0), 3.0) : 1.0;
    vColor = aColor * level * facing * twinkle;
    float size = aSize * (0.55 + 0.45 * facing);
    gl_PointSize = dot(vColor, vec3(1.0)) > 0.002 ? clamp(size * uScale / -mvPosition.z, 0.0, 160.0) : 0.0;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const GLOW_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  #include <fog_pars_fragment>
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    vec3 color = vColor * (exp(-d * d * 22.0) * 1.6 + exp(-d * d * 4.0) * 0.4) * (1.0 - smoothstep(0.8, 1.0, d));
    ${FOG_FADE}
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export type GlowSpec = {
  position: readonly [number, number, number];
  color: string;
  /** Multiplica a cor (HDR). */
  intensity: number;
  /** Tamanho no mundo (unidades). */
  size: number;
  /** 0 = luz da sala (segue `house`), 1 = cenário do palco, 2 = lentes (movidas pelo set). */
  group: 0 | 1 | 2;
  /** > 0 cintila (semente). */
  twinkle?: number;
};

export class GlowPoints {
  readonly points: THREE.Points;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly dirs: Float32Array;
  private readonly dynamicCount: number;

  /** As primeiras `dynamicCount` entradas são as lentes (posição/cor/direção mudam a cada quadro). */
  constructor(specs: GlowSpec[], dynamicCount: number) {
    const count = specs.length + dynamicCount;
    this.dynamicCount = dynamicCount;
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.dirs = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const info = new Float32Array(count * 2);
    const color = new THREE.Color();
    for (let index = 0; index < dynamicCount; index += 1) {
      sizes[index] = 34;
      info[index * 2] = 2;
    }
    specs.forEach((spec, offset) => {
      const index = dynamicCount + offset;
      this.positions.set(spec.position, index * 3);
      color.set(spec.color).multiplyScalar(spec.intensity);
      this.colors.set([color.r, color.g, color.b], index * 3);
      sizes[index] = spec.size;
      info[index * 2] = spec.group;
      info[index * 2 + 1] = spec.twinkle ?? 0;
    });
    this.geometry = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(this.positions, 3);
    const colorAttr = new THREE.BufferAttribute(this.colors, 3);
    const dir = new THREE.BufferAttribute(this.dirs, 3);
    for (const attribute of [position, colorAttr, dir]) attribute.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute("position", position);
    this.geometry.setAttribute("aColor", colorAttr);
    this.geometry.setAttribute("aDir", dir);
    this.geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute("aInfo", new THREE.BufferAttribute(info, 2));
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uScale: { value: 400 },
        uTime: { value: 0 },
        uLevels: { value: new THREE.Vector3(1, 1, 1) },
      }]),
      vertexShader: GLOW_VERTEX,
      fragmentShader: GLOW_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: true,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = "gala-glows";
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    pointScale(this.points, this.material.uniforms.uScale);
  }

  /** Lente `index`: posição, direção do feixe e cor × intensidade. */
  setLens(index: number, position: THREE.Vector3, dir: THREE.Vector3, color: THREE.Color) {
    if (index < 0 || index >= this.dynamicCount) return;
    this.positions[index * 3] = position.x;
    this.positions[index * 3 + 1] = position.y;
    this.positions[index * 3 + 2] = position.z;
    this.dirs[index * 3] = dir.x;
    this.dirs[index * 3 + 1] = dir.y;
    this.dirs[index * 3 + 2] = dir.z;
    this.colors[index * 3] = color.r;
    this.colors[index * 3 + 1] = color.g;
    this.colors[index * 3 + 2] = color.b;
  }

  /** Sobe as lentes mudadas no quadro (só a faixa delas). */
  commit() {
    if (!this.dynamicCount) return;
    for (const name of ["position", "aColor", "aDir"]) {
      const attribute = this.geometry.getAttribute(name) as THREE.BufferAttribute;
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, this.dynamicCount * 3);
      attribute.needsUpdate = true;
    }
  }

  /** Níveis dos grupos: luz da sala, cenário, lentes. */
  setLevels(house: number, decor: number, lens = 1) {
    (this.material.uniforms.uLevels.value as THREE.Vector3).set(house, decor, lens);
  }

  update(time: number) {
    this.material.uniforms.uTime.value = time;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
