// Holofotes da gala: cones de luz no ar (todos numa malha instanciada, um draw
// call), as latas dos aparelhos e as luzes de verdade.
//
// O degradê do cone não depende da malha: cada pixel calcula a distância do
// raio da câmera até o eixo do feixe e quanto do cone ele atravessa. Por isso
// o miolo é claro e a borda some macia de qualquer ângulo, inclusive olhando
// para dentro do feixe (a tampa larga fecha o cone).
//
// Luz de verdade só onde ela aparece no boneco: os quatro contras do fundo
// (`wash`, um por finalista e o do púlpito), o canhão principal (`key`, o único
// com sombra) e o segundo canhão (`fill`), os dois na ponte de luz sobre a
// plateia. No modo desempenho os quatro contras viram uma luz direcional só e
// o canhão perde a sombra; os cones continuam todos.

import * as THREE from "three";

/** Índices dos holofotes (`GalaSet.aim`, `GalaSet.setSpot`). */
export const SPOT = {
  /** Contraluzes do fundo (treliça sobre o telão): finalistas 0, 1, 2 e o apresentador. */
  wash: [0, 1, 2, 3] as const,
  /** Canhão seguidor principal (ponte sobre a plateia): luz no rosto, com sombra. */
  key: 4,
  /** Segundo canhão seguidor (sem sombra). */
  fill: 5,
  /** Facho fino de cima sobre o troféu na coluna (só cone, sem luz real). */
  trophy: 6,
  /** Dois móveis nos cantos da treliça do fundo: cruzam a plateia na varredura e na festa. */
  sweepers: [7, 8] as const,
} as const;

export const SPOT_COUNT = 9;

/** "white", "gold" ou qualquer cor CSS. */
export type SpotColor = string;

export const SPOT_WHITE = "#fff1dc";
export const SPOT_GOLD = "#ffbd52";

export type SpotDef = {
  origin: readonly [number, number, number];
  target: readonly [number, number, number];
  /** Meio-ângulo do feixe (rad), como `SpotLight.angle`. */
  angle: number;
  intensity: number;
  color: string;
  /** Brilho do cone no ar (feixe longo e fino precisa de mais). */
  beam: number;
  /** Luz real com intensidade cheia (decay 0); 0 = só o cone. */
  light: number;
  penumbra: number;
  /** Ponto da varredura no instante `t` (escreve em `out`). */
  sweep: (t: number, out: THREE.Vector3) => THREE.Vector3;
};

export type SpotFloor = {
  /** Altura do chão sob (x, z): o feixe atravessa o alvo e morre nele. */
  floorAt: (x: number, z: number) => number;
};

const CONE_SEGMENTS = 28;
const APEX_RATIO = 0.06;

const CONE_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vApex;
  varying vec3 vAxis;
  varying float vLength;
  varying float vRadius;
  varying vec3 vTint;
  #include <fog_pars_vertex>
  void main() {
    mat4 m = instanceMatrix;
    vApex = (modelMatrix * vec4(m[3].xyz, 1.0)).xyz;
    vec3 back = m[2].xyz;
    vLength = length(back);
    vAxis = normalize(mat3(modelMatrix) * -back);
    vRadius = length(m[0].xyz);
    #ifdef USE_INSTANCING_COLOR
      vTint = instanceColor;
    #else
      vTint = vec3(1.0);
    #endif
    vec4 world = modelMatrix * m * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const CONE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  varying vec3 vWorld;
  varying vec3 vApex;
  varying vec3 vAxis;
  varying float vLength;
  varying float vRadius;
  varying vec3 vTint;
  #include <fog_pars_fragment>

  float hash3(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x),
                   mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
               mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x),
                   mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
  }

  void main() {
    if (dot(vTint, vTint) < 1e-7) discard;
    // Aproximação mais curta entre o raio da câmera e o eixo do feixe.
    vec3 ray = normalize(vWorld - cameraPosition);
    vec3 w0 = cameraPosition - vApex;
    float b = dot(ray, vAxis);
    float d = dot(ray, w0);
    float e = dot(vAxis, w0);
    float denom = max(1.0 - b * b, 1e-4);
    float along = clamp((e - b * d) / denom, 0.0, vLength);
    float rayT = max(0.0, (b * e - d) / denom);
    vec3 closest = cameraPosition + ray * rayT;
    vec3 onAxis = vApex + vAxis * along;
    float dist = length(closest - onAxis);
    float t = along / vLength;
    float radius = vRadius * (APEX + (1.0 - APEX) * t);
    float q = clamp(dist / radius, 0.0, 1.0);
    // Corda atravessada (miolo cheio, borda macia) e a luz que se abre com a distância.
    float chord = pow(1.0 - q * q, 1.5);
    float spread = 0.6 / (0.3 + t * 1.8);
    float ends = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.7, 1.0, t));
    float density = 1.0;
    #ifndef GALA_LITE
      vec3 drift = vec3(uTime * 3.0, uTime * -1.4, uTime * 2.1);
      vec3 sampleAt = onAxis + (closest - onAxis) * 0.6;
      density = 0.5 + 0.75 * noise3(sampleAt * 0.04 + drift * 0.04) + 0.25 * noise3(sampleAt * 0.11 - drift * 0.07);
    #endif
    vec3 color = vTint * (chord * spread * ends * density * uStrength);
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogF = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        float fogF = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      color *= 1.0 - fogF * 0.85;
    #endif
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Cone fechado com ápice em z = 0 e boca de raio 1 em z = -1 (a matriz da instância estica). */
function coneGeometry() {
  const geometry = new THREE.CylinderGeometry(1, APEX_RATIO, 1, CONE_SEGMENTS, 1, false);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, -0.5);
  geometry.deleteAttribute("uv");
  return geometry;
}

/** Lata do refletor com a lente para -z (mesma convenção do cone) e a alça. */
function fixtureGeometry() {
  const body = new THREE.CylinderGeometry(4.4, 5.4, 12, 16, 1, false);
  body.rotateX(-Math.PI / 2);
  body.translate(0, 0, 3.5);
  return body;
}

const UP = new THREE.Vector3(0, 1, 0);
const SIDE = new THREE.Vector3(1, 0, 0);

export class SpotRig {
  readonly group = new THREE.Group();
  readonly cones: THREE.InstancedMesh;
  readonly fixtures: THREE.InstancedMesh;
  /** Luz real de cada holofote (null = só o cone). */
  readonly lights: Array<THREE.SpotLight | null> = [];
  /** Modo desempenho: contraluz direcional no lugar dos quatro `wash`. */
  readonly washFallback: THREE.DirectionalLight | null;
  readonly origins: THREE.Vector3[] = [];
  /** Alvo pedido (sem a varredura) e alvo atual (suavizado). */
  readonly aimed: THREE.Vector3[] = [];
  readonly current: THREE.Vector3[] = [];
  /** Dados para a poeira acender dentro dos feixes (os mesmos objetos dos uniforms dela). */
  readonly hazeUniforms = {
    uSpotPos: { value: Array.from({ length: SPOT_COUNT }, () => new THREE.Vector3()) },
    uSpotDir: { value: Array.from({ length: SPOT_COUNT }, () => new THREE.Vector3(0, -1, 0)) },
    uSpotCos: { value: Array.from({ length: SPOT_COUNT }, () => 0.99) },
    uSpotColor: { value: Array.from({ length: SPOT_COUNT }, () => new THREE.Vector3()) },
  };
  /** Lente de cada aparelho (para os pontos de brilho): posição, direção e cor × intensidade. */
  readonly lens = Array.from({ length: SPOT_COUNT }, () => ({ position: new THREE.Vector3(), dir: new THREE.Vector3(), color: new THREE.Color() }));

  private readonly defs: SpotDef[];
  private readonly velocity: THREE.Vector3[] = [];
  private readonly intensity = new Float32Array(SPOT_COUNT);
  private readonly intensityWanted = new Float32Array(SPOT_COUNT);
  private readonly angle = new Float32Array(SPOT_COUNT);
  private readonly angleWanted = new Float32Array(SPOT_COUNT);
  private readonly colors: THREE.Color[] = [];
  private readonly colorsWanted: THREE.Color[] = [];
  private sweep = 0;
  private sweepWanted = 0;
  private snapNext = true;
  private washLevel = 0;
  private readonly coneMaterial: THREE.ShaderMaterial;
  private readonly fixtureMaterial: THREE.MeshStandardMaterial;

  private readonly matrix = new THREE.Matrix4();
  private readonly look = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly wanted = new THREE.Vector3();
  private readonly sweepAt = new THREE.Vector3();
  private readonly tint = new THREE.Color();

  constructor(defs: SpotDef[], private readonly floor: SpotFloor, performance: boolean) {
    this.defs = defs;
    this.coneMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uStrength: { value: 1 } }]),
      vertexShader: CONE_VERTEX,
      fragmentShader: CONE_FRAGMENT,
      defines: performance ? { GALA_LITE: "", APEX: APEX_RATIO.toFixed(3) } : { APEX: APEX_RATIO.toFixed(3) },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      fog: true,
    });
    this.cones = new THREE.InstancedMesh(coneGeometry(), this.coneMaterial, SPOT_COUNT);
    this.cones.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.cones.frustumCulled = false;
    this.cones.renderOrder = 6;
    this.cones.name = "gala-spot-cones";
    this.fixtureMaterial = new THREE.MeshStandardMaterial({ color: "#16161a", roughness: 0.42, metalness: 0.55 });
    this.fixtures = new THREE.InstancedMesh(fixtureGeometry(), this.fixtureMaterial, SPOT_COUNT);
    this.fixtures.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.fixtures.frustumCulled = false;
    this.fixtures.name = "gala-spot-fixtures";
    this.group.add(this.cones, this.fixtures);

    defs.forEach((def, index) => {
      this.origins.push(new THREE.Vector3(...def.origin));
      this.aimed.push(new THREE.Vector3(...def.target));
      this.current.push(new THREE.Vector3(...def.target));
      this.velocity.push(new THREE.Vector3());
      this.intensity[index] = this.intensityWanted[index] = def.intensity;
      this.angle[index] = this.angleWanted[index] = def.angle;
      this.colors.push(new THREE.Color(def.color));
      this.colorsWanted.push(new THREE.Color(def.color));
      const isWash = (SPOT.wash as readonly number[]).includes(index);
      let light: THREE.SpotLight | null = null;
      if (def.light > 0 && !(performance && isWash)) {
        light = new THREE.SpotLight(def.color, def.light, 0, def.angle, def.penumbra, 0);
        light.position.copy(this.origins[index]);
        light.target.position.copy(this.current[index]);
        if (index === SPOT.key && !performance) {
          light.castShadow = true;
          light.shadow.mapSize.set(1024, 1024);
          light.shadow.bias = -0.0002;
          light.shadow.normalBias = 0.4;
          light.shadow.camera.near = 300;
          light.shadow.camera.far = 900;
        }
        light.name = `gala-spot-${index}`;
        this.group.add(light, light.target);
      }
      this.lights.push(light);
    });

    this.washFallback = null;
    if (performance) {
      // Contraluz do fundo, de cima: recorta cabelo e ombros como os quatro fariam.
      const wash = new THREE.DirectionalLight(SPOT_GOLD, 0);
      wash.position.set(0, 260, -160);
      wash.target.position.set(0, 0, -10);
      wash.name = "gala-wash-fallback";
      this.group.add(wash, wash.target);
      this.washFallback = wash;
    }
  }

  aim(index: number, target: THREE.Vector3Like, snap = false) {
    const aimed = this.aimed[index];
    if (!aimed || !Number.isFinite(target.x) || !Number.isFinite(target.y) || !Number.isFinite(target.z)) return;
    aimed.set(target.x, target.y, target.z);
    if (snap) {
      this.current[index].copy(aimed);
      this.velocity[index].set(0, 0, 0);
    }
  }

  set(index: number, values: { intensity?: number; color?: SpotColor; angle?: number }, snap = false) {
    if (!(index >= 0 && index < SPOT_COUNT)) return;
    if (values.intensity !== undefined && Number.isFinite(values.intensity)) {
      this.intensityWanted[index] = Math.max(0, values.intensity);
      if (snap) this.intensity[index] = this.intensityWanted[index];
    }
    if (values.angle !== undefined && Number.isFinite(values.angle)) {
      this.angleWanted[index] = Math.min(0.9, Math.max(0.01, values.angle));
      if (snap) this.angle[index] = this.angleWanted[index];
    }
    if (values.color !== undefined) {
      const hex = values.color === "white" ? SPOT_WHITE : values.color === "gold" ? SPOT_GOLD : values.color;
      this.colorsWanted[index].set(hex);
      if (snap) this.colors[index].copy(this.colorsWanted[index]);
    }
  }

  setSweep(on: boolean, snap = false) {
    this.sweepWanted = on ? 1 : 0;
    if (snap) this.sweep = this.sweepWanted;
  }

  /** Brilho do ar dentro dos cones (1 = padrão). */
  setBeamStrength(value: number) {
    this.coneMaterial.uniforms.uStrength.value = Math.max(0, value);
  }

  /** O próximo `update` põe tudo no lugar pedido sem deslizar (depois de um salto). */
  snap() {
    this.snapNext = true;
  }

  update(time: number, dt: number) {
    const snap = this.snapNext || !(dt > 0);
    this.snapNext = false;
    const step = Math.min(dt, 0.1);
    this.coneMaterial.uniforms.uTime.value = time;
    if (snap) this.sweep = this.sweepWanted;
    else this.sweep += (this.sweepWanted - this.sweep) * (1 - Math.exp(-2 * step));
    const sweep = this.sweep * this.sweep * (3 - 2 * this.sweep);
    const follow = 1 - Math.exp(-8 * step);
    const fade = 1 - Math.exp(-7 * step);
    let wash = 0;

    for (let index = 0; index < SPOT_COUNT; index += 1) {
      const def = this.defs[index];
      const origin = this.origins[index];
      const current = this.current[index];
      const wanted = this.wanted.copy(this.aimed[index]);
      if (sweep > 0.001) wanted.lerp(def.sweep(time, this.sweepAt), sweep);
      if (snap) {
        current.copy(wanted);
        this.velocity[index].set(0, 0, 0);
        this.intensity[index] = this.intensityWanted[index];
        this.angle[index] = this.angleWanted[index];
        this.colors[index].copy(this.colorsWanted[index]);
      } else {
        // Mola criticamente amortecida: o operador acelera e freia, sem tranco.
        const k = 6;
        const velocity = this.velocity[index];
        velocity.x += ((wanted.x - current.x) * k * k - 2 * k * velocity.x) * step;
        velocity.y += ((wanted.y - current.y) * k * k - 2 * k * velocity.y) * step;
        velocity.z += ((wanted.z - current.z) * k * k - 2 * k * velocity.z) * step;
        current.addScaledVector(velocity, step);
        this.intensity[index] += (this.intensityWanted[index] - this.intensity[index]) * fade;
        this.angle[index] += (this.angleWanted[index] - this.angle[index]) * follow;
        this.colors[index].lerp(this.colorsWanted[index], fade);
      }

      const dir = this.dir.subVectors(current, origin);
      const toTarget = Math.max(1, dir.length());
      dir.multiplyScalar(1 / toTarget);
      // O feixe atravessa o alvo e morre no chão (o depth do chão recorta o resto).
      let length = toTarget * 1.5;
      if (dir.y < -0.02) {
        const floorY = this.floor.floorAt(current.x, current.z);
        length = Math.max(toTarget, (floorY - origin.y) / dir.y);
      }
      length *= 1.05;
      const angle = this.angle[index];
      const mouth = length * Math.tan(angle);
      const intensity = this.intensity[index];

      this.look.lookAt(origin, current, Math.abs(dir.y) > 0.995 ? SIDE : UP);
      this.quaternion.setFromRotationMatrix(this.look);
      this.matrix.compose(origin, this.quaternion, this.scale.set(mouth, mouth, length));
      this.cones.setMatrixAt(index, this.matrix);
      this.tint.copy(this.colors[index]).multiplyScalar(intensity * def.beam);
      this.cones.setColorAt(index, this.tint);
      this.matrix.compose(origin, this.quaternion, this.scale.set(1, 1, 1));
      this.fixtures.setMatrixAt(index, this.matrix);

      const light = this.lights[index];
      if (light) {
        light.target.position.copy(current);
        light.angle = angle;
        light.intensity = def.light * intensity;
        light.color.copy(this.colors[index]);
      }
      if ((SPOT.wash as readonly number[]).includes(index)) wash += intensity * def.light * 0.25;

      const haze = this.hazeUniforms;
      haze.uSpotPos.value[index].copy(origin);
      haze.uSpotDir.value[index].copy(dir);
      haze.uSpotCos.value[index] = Math.cos(angle);
      haze.uSpotColor.value[index].set(this.tint.r, this.tint.g, this.tint.b);

      const lens = this.lens[index];
      lens.position.copy(origin).addScaledVector(dir, 2);
      lens.dir.copy(dir);
      lens.color.copy(this.colors[index]).multiplyScalar(intensity);
    }
    this.washLevel = wash;
    if (this.washFallback) this.washFallback.intensity = wash * 0.55;
    this.cones.instanceMatrix.needsUpdate = true;
    if (this.cones.instanceColor) this.cones.instanceColor.needsUpdate = true;
    this.fixtures.instanceMatrix.needsUpdate = true;
  }

  /** Soma da luz dos contras (para quem quiser acompanhar o nível, como o reflexo do chão). */
  get washAmount() {
    return this.washLevel;
  }

  dispose() {
    this.cones.geometry.dispose();
    this.coneMaterial.dispose();
    this.fixtures.geometry.dispose();
    this.fixtureMaterial.dispose();
    for (const light of this.lights) light?.dispose();
    this.washFallback?.dispose();
    this.cones.dispose();
    this.fixtures.dispose();
  }
}
