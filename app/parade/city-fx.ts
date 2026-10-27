// Efeitos da cidade da festa, cada um num draw call: nuvens (cartões virados
// para a câmera), mar (ondas e espuma no shader), brilhos dos postes e luzes
// piscando (pontos) e fogos de artifício (pontos animados só na GPU: a CPU
// só passa o relógio).

import * as THREE from "three";
import { makeRand, type Rand } from "./city-kit";

/** Tamanho de um ponto em pixels por metro a 1 m (altura da tela × projeção). */
function pixelScale(uniform: { value: number }) {
  const size = new THREE.Vector2();
  return (renderer: THREE.WebGLRenderer, _scene: THREE.Scene, camera: THREE.Camera) => {
    renderer.getDrawingBufferSize(size);
    const projection = (camera as THREE.PerspectiveCamera).projectionMatrix.elements[5];
    uniform.value = size.y * 0.5 * projection;
  };
}

// ------------------------------------------------------------- nuvens

function cloudAtlas(rand: Rand) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  // Quatro nuvens, uma por faixa de 64 px: bolotas brancas, base mais reta.
  for (let row = 0; row < 4; row += 1) {
    const top = row * 64;
    // Corpo achatado + bolotas sobrepostas (mais altas no meio): lê como cúmulo, não como bolhas.
    const puffs = 16 + Math.floor(rand() * 6);
    for (let index = 0; index < puffs; index += 1) {
      const x = 30 + rand() * 196;
      const middle = 1 - Math.abs(x - 128) / 110;
      const r = 10 + (8 + rand() * 12) * Math.max(0.25, middle);
      const y = top + 50 - r * (0.35 + rand() * 0.35) - middle * 6;
      const gradient = ctx.createRadialGradient(x, y, r * 0.1, x, y, r);
      gradient.addColorStop(0, "rgba(255,255,255,1)");
      gradient.addColorStop(0.6, "rgba(255,255,255,0.95)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Sombra embaixo: o vermelho guarda a luz (o shader mistura luz e sombra).
    ctx.globalCompositeOperation = "source-atop";
    const shade = ctx.createLinearGradient(0, top + 8, 0, top + 56);
    shade.addColorStop(0, "rgb(255,255,255)");
    shade.addColorStop(1, "rgb(70,70,70)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, top, 256, 64);
    ctx.globalCompositeOperation = "source-over";
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

export type CloudLayer = { mesh: THREE.Mesh; update(time: number): void; dispose(): void };

/** Nuvens soltas acima da cidade, num anel em volta da avenida. */
export function buildClouds(args: {
  center: THREE.Vector3;
  radius: number;
  count: number;
  height: [number, number];
  lit: string;
  shade: string;
  opacity: number;
  far: number;
  seed: number;
}): CloudLayer {
  const rand = makeRand(args.seed ^ 0xc10d);
  const base = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute("position", base.getAttribute("position"));
  geometry.setAttribute("uv", base.getAttribute("uv"));
  const centers = new Float32Array(args.count * 3);
  const shapes = new Float32Array(args.count * 4);
  for (let index = 0; index < args.count; index += 1) {
    const angle = rand() * Math.PI * 2;
    const distance = args.radius * (0.25 + 0.75 * Math.sqrt(rand()));
    centers[index * 3] = args.center.x + Math.cos(angle) * distance;
    centers[index * 3 + 1] = args.height[0] + rand() * (args.height[1] - args.height[0]);
    centers[index * 3 + 2] = args.center.z + Math.sin(angle) * distance;
    const width = 140 + rand() * 220;
    shapes[index * 4] = width;
    shapes[index * 4 + 1] = width * (0.24 + rand() * 0.1);
    shapes[index * 4 + 2] = args.opacity * (0.65 + rand() * 0.35);
    shapes[index * 4 + 3] = Math.floor(rand() * 4);
  }
  geometry.setAttribute("aCenter", new THREE.InstancedBufferAttribute(centers, 3));
  geometry.setAttribute("aShape", new THREE.InstancedBufferAttribute(shapes, 4));
  geometry.instanceCount = args.count;
  const map = cloudAtlas(rand);
  const uniforms = {
    uTime: { value: 0 },
    uMap: { value: map },
    uLit: { value: new THREE.Color(args.lit) },
    uShade: { value: new THREE.Color(args.shade) },
    uFar: { value: args.far },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec3 aCenter;
      attribute vec4 aShape;
      uniform float uTime;
      uniform float uFar;
      varying vec2 vUv;
      varying float vAlpha;
      void main() {
        vec3 center = aCenter + vec3(uTime * 1.8, 0.0, uTime * 0.6);
        vec4 mv = modelViewMatrix * vec4(center, 1.0);
        mv.xy += position.xy * aShape.xy;
        gl_Position = projectionMatrix * mv;
        vUv = vec2(uv.x, (uv.y + 3.0 - aShape.w) * 0.25);
        float dist = length(mv.xyz);
        vAlpha = aShape.z * (1.0 - smoothstep(uFar * 0.7, uFar, dist)) * smoothstep(40.0, 160.0, dist);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      uniform vec3 uLit;
      uniform vec3 uShade;
      varying vec2 vUv;
      varying float vAlpha;
      void main() {
        vec4 tex = texture2D(uMap, vUv);
        gl_FragColor = vec4(mix(uShade, uLit, tex.r), tex.a * vAlpha);
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -2;
  mesh.name = "parade-clouds";
  base.dispose();
  return {
    mesh,
    update(time) {
      uniforms.uTime.value = time;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      map.dispose();
    },
  };
}

// ---------------------------------------------------------------- mar

export type WaterPatch = {
  /** Origem da grade (no chão) e os eixos: `out` aponta mar adentro. */
  origin: THREE.Vector2;
  out: THREE.Vector2;
  /** Comprimento ao longo da costa (centrado na origem) e até onde vai mar adentro. */
  length: number;
  reach: number;
  foam: number;
  amplitude: number;
  y: number;
};

export type SeaBuild = { mesh: THREE.Mesh; update(time: number): void; dispose(): void };

const SEA_WAVE = /* glsl */ `
float seaWave(vec2 q, float t) {
  return 0.5 * sin(q.x * 0.16 + t * 1.25 + sin(q.y * 0.021) * 2.0)
       + 0.28 * sin(q.x * 0.07 - q.y * 0.045 + t * 0.8)
       + 0.16 * sin(q.y * 0.11 + q.x * 0.05 - t * 1.6);
}
`;

/**
 * Mar e rios num draw call. A grade é fina perto da praia (onde a onda sobe
 * e desce na areia) e larga mar adentro (lá só o shader mexe na luz).
 */
export function buildSea(args: {
  patches: WaterPatch[];
  shore: { out: THREE.Vector2; offset: number };
  deep: string;
  shallow: string;
  foam: string;
  skyTop: string;
  skyLow: string;
  sunDirection: THREE.Vector3;
  sunColor: string;
  light: number;
  performance: boolean;
}): SeaBuild {
  const positions: number[] = [];
  const water: number[] = [];
  const indices: number[] = [];
  const cuts = [0, 2, 4.5, 7.5, 11, 16, 23, 32, 45, 62, 85, 120, 170, 240, 340, 480, 680, 950, 1300, 1800, 2500];
  for (const patch of args.patches) {
    const across = cuts.filter((value) => value < patch.reach).concat([patch.reach]);
    const segments = Math.max(4, Math.round(patch.length / (args.performance ? 60 : 36)));
    const perp = new THREE.Vector2(-patch.out.y, patch.out.x);
    const base = positions.length / 3;
    for (let row = 0; row < across.length; row += 1) {
      for (let col = 0; col <= segments; col += 1) {
        const along = -patch.length / 2 + (patch.length * col) / segments;
        const x = patch.origin.x + patch.out.x * across[row] + perp.x * along;
        const z = patch.origin.y + patch.out.y * across[row] + perp.y * along;
        positions.push(x, patch.y, z);
        water.push(patch.foam, patch.amplitude);
      }
    }
    const width = segments + 1;
    for (let row = 0; row < across.length - 1; row += 1) {
      for (let col = 0; col < segments; col += 1) {
        const a = base + row * width + col;
        const b = a + 1;
        const c = a + width;
        const d = c + 1;
        // Normal para cima seja qual for o lado do mar.
        const flip = patch.out.x * perp.y - patch.out.y * perp.x > 0;
        if (flip) indices.push(a, b, d, a, d, c);
        else indices.push(a, d, b, a, c, d);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aWater", new THREE.Float32BufferAttribute(water, 2));
  geometry.setIndex(positions.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(indices, 1) : new THREE.Uint16BufferAttribute(indices, 1));
  geometry.computeBoundingSphere();

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uShore: { value: new THREE.Vector4(args.shore.out.x, args.shore.out.y, args.shore.offset, 0) },
      uDeep: { value: new THREE.Color(args.deep) },
      uShallow: { value: new THREE.Color(args.shallow) },
      uFoam: { value: new THREE.Color(args.foam) },
      uSkyTop: { value: new THREE.Color(args.skyTop) },
      uSkyLow: { value: new THREE.Color(args.skyLow) },
      uSunDir: { value: args.sunDirection.clone().normalize() },
      uSunColor: { value: new THREE.Color(args.sunColor) },
      uLight: { value: args.light },
    },
  ]);
  const material = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    vertexShader: /* glsl */ `
      attribute vec2 aWater;
      uniform float uTime;
      uniform vec4 uShore;
      varying vec3 vWorld;
      varying vec2 vWater;
      #include <fog_pars_vertex>
      ${SEA_WAVE}
      void main() {
        vec3 p = position;
        vec2 q = vec2(dot(p.xz, uShore.xy) - uShore.z, dot(p.xz, vec2(-uShore.y, uShore.x)));
        p.y += seaWave(q, uTime) * aWater.y;
        vWorld = p;
        vWater = aWater;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec4 uShore;
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uFoam;
      uniform vec3 uSkyTop;
      uniform vec3 uSkyLow;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uLight;
      varying vec3 vWorld;
      varying vec2 vWater;
      #include <common>
      #include <fog_pars_fragment>
      ${SEA_WAVE}
      void main() {
        vec2 axis = uShore.xy;
        vec2 perp = vec2(-axis.y, axis.x);
        vec2 q = vec2(dot(vWorld.xz, axis) - uShore.z, dot(vWorld.xz, perp));
        float e = 0.8;
        float h0 = seaWave(q, uTime);
        vec2 grad = vec2(seaWave(q + vec2(e, 0.0), uTime) - h0, seaWave(q + vec2(0.0, e), uTime) - h0) / e * max(vWater.y, 0.25);
        // Longe, as ondas viram serrilhado: some o detalhe fino primeiro, depois o resto.
        float dist = length(cameraPosition - vWorld);
        float fine = 1.0 - smoothstep(25.0, 140.0, dist);
        grad *= 1.0 - 0.8 * smoothstep(120.0, 600.0, dist);
        grad += fine * 0.07 * vec2(sin(q.x * 1.9 + q.y * 0.7 + uTime * 2.3), sin(q.y * 2.3 - q.x * 0.5 - uTime * 1.7));
        vec2 gw = axis * grad.x + perp * grad.y;
        vec3 n = normalize(vec3(-gw.x, 1.0, -gw.y));
        vec3 v = (cameraPosition - vWorld) / dist;
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 r = reflect(-v, n);
        vec3 sky = mix(uSkyLow, uSkyTop, smoothstep(0.0, 0.5, r.y));
        vec3 body = mix(uShallow, uDeep, smoothstep(2.0, 80.0, q.x)) * uLight;
        vec3 col = mix(body, sky, fres * 0.85);
        col += uSunColor * pow(max(dot(r, uSunDir), 0.0), 160.0) * 2.2;
        // Arrebentação chegando e franja de espuma na beira.
        float wave = sin(q.x * 0.16 + uTime * 1.25 + sin(q.y * 0.021) * 2.0 + 0.7);
        float foam = smoothstep(0.6, 0.97, wave) * (1.0 - smoothstep(8.0, 55.0, q.x));
        foam += 1.0 - smoothstep(0.0, 3.0, q.x + 1.2 * sin(uTime * 0.9 + q.y * 0.05));
        foam = clamp(foam, 0.0, 1.0) * vWater.x;
        col = mix(col, uFoam * (0.35 + 0.65 * uLight), foam * 0.85);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        // Névoa mais rala no mar: o horizonte aparece e as ilhas não flutuam no nada.
        #ifdef USE_FOG
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(fogNear, fogFar, vFogDepth * 0.62));
        #endif
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "parade-sea";
  return {
    mesh,
    update(time) {
      uniforms.uTime.value = time;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

// ----------------------------------------------------- brilhos/piscas

/** Brilhos de luz (postes, antenas, holofotes): pontos aditivos que crescem com a distância como um objeto. */
export class HaloSet {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];
  private readonly sizes: number[] = [];
  private readonly blinks: number[] = [];

  get count() {
    return this.sizes.length;
  }

  /** `size` em metros; `blink` 0 = fixo, >0 = fase do pisca, <0 = cintila (brilho da torre). */
  add(x: number, y: number, z: number, color: THREE.Color, size: number, blink = 0) {
    this.positions.push(x, y, z);
    this.colors.push(color.r, color.g, color.b);
    this.sizes.push(size);
    this.blinks.push(blink);
  }

  build(gain: number) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(this.sizes, 1));
    geometry.setAttribute("aBlink", new THREE.Float32BufferAttribute(this.blinks, 1));
    geometry.computeBoundingSphere();
    const uniforms = { uTime: { value: 0 }, uPixel: { value: 600 }, uGain: { value: gain } };
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        attribute vec3 color;
        attribute float aSize;
        attribute float aBlink;
        uniform float uTime;
        uniform float uPixel;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float on = 1.0;
          if (aBlink > 0.0) on = step(0.55, fract(uTime * 0.85 + aBlink));
          if (aBlink < 0.0) on = step(0.82, fract(sin(floor(uTime * 9.0) * 12.9898 + aBlink * 78.233) * 43758.5453));
          float depth = max(-mv.z, 1.0);
          // Longe demais vira um pontinho de no mínimo 2 px (não some na névoa).
          gl_PointSize = on > 0.0 ? max(aSize * uPixel / depth, 2.0) : 0.0;
          vColor = color;
          vAlpha = on * (1.0 - smoothstep(900.0, 1500.0, depth));
        }`,
      fragmentShader: /* glsl */ `
        uniform float uGain;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = dot(c, c) * 4.0;
          float a = exp(-d * 5.0) + 0.5 * exp(-d * 40.0);
          gl_FragColor = vec4(vColor * uGain, a * vAlpha);
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const points = new THREE.Points(geometry, material);
    points.name = "parade-halos";
    points.renderOrder = 2;
    points.onBeforeRender = pixelScale(uniforms.uPixel);
    return {
      points,
      update(time: number) {
        uniforms.uTime.value = time;
      },
      dispose() {
        geometry.dispose();
        material.dispose();
      },
    };
  }
}

// ---------------------------------------------------------------- fogos

export type FireworksBuild = {
  points: THREE.Points;
  /** Liga (a partir de `time`) ou desliga (os que já subiram terminam). */
  set(on: boolean, time: number): void;
  /**
   * Muda onde os fogos sobem: `area` como no build; `focus` junta uma parte
   * (`share`, 0..1) dos foguetes num retângulo (centro x/z, meia largura rx/rz),
   * para o plano final não perder os fogos atrás dos prédios.
   */
  aim(area: { x0: number; x1: number; z: number; height: number }, focus?: { x: number; z: number; rx: number; rz: number; share: number }): void;
  update(time: number): void;
  dispose(): void;
};

/**
 * Fogos: `shells` foguetes que se repetem cada um no seu ciclo, cada ciclo
 * num ponto sorteado no shader (posição, cor, tipo). Peônia, anel e chorão
 * dourado. Tudo na GPU: a CPU só manda o relógio e a hora em que ligou.
 */
export function buildFireworks(args: {
  colors: THREE.Color[];
  area: { x0: number; x1: number; z: number; height: number };
  shells: number;
  sparks: number;
  /** Sombra atrasada de cada fagulha (rastro): dobra os pontos. */
  trails: boolean;
  intensity: number;
  seed: number;
}): FireworksBuild {
  const rand = makeRand(args.seed ^ 0xf1e4);
  // Cada fagulha ganha uma "sombra" um instante atrás (rastro), menos no modo leve.
  const copies = args.trails ? 2 : 1;
  const total = args.shells * args.sparks * copies;
  const sparks = new Float32Array(total * 4);
  const seeds = new Float32Array(total * 2);
  const positions = new Float32Array(total * 3);
  let k = 0;
  for (let shell = 0; shell < args.shells; shell += 1) {
    for (let index = 0; index < args.sparks; index += 1) {
      // Direção uniforme na esfera.
      const u = rand() * 2 - 1;
      const angle = rand() * Math.PI * 2;
      const ring = Math.sqrt(1 - u * u);
      const random = rand();
      for (let copy = 0; copy < copies; copy += 1) {
        if (copy === 1 && index < 10) continue;
        sparks[k * 4] = ring * Math.cos(angle);
        sparks[k * 4 + 1] = u;
        sparks[k * 4 + 2] = ring * Math.sin(angle);
        sparks[k * 4 + 3] = shell;
        seeds[k * 2] = random;
        // Papel: 0 fagulha, 1 rastro do foguete subindo (as 10 primeiras), 2 sombra da fagulha.
        seeds[k * 2 + 1] = copy === 1 ? 2 : index < 10 ? 1 : 0;
        k += 1;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions.subarray(0, k * 3), 3));
  geometry.setAttribute("aSpark", new THREE.BufferAttribute(sparks.subarray(0, k * 4), 4));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds.subarray(0, k * 2), 2));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3((args.area.x0 + args.area.x1) / 2, args.area.height, 0), 4000);
  const palette = [0, 1, 2, 3].map((index) => (args.colors[index % args.colors.length] ?? new THREE.Color("#ffd257")).clone());
  const uniforms = {
    uTime: { value: 0 },
    uStart: { value: 1e6 },
    uStop: { value: 1e7 },
    uArea: { value: new THREE.Vector4(args.area.x0, args.area.x1, args.area.z, args.area.height) },
    uColors: { value: palette },
    uPixel: { value: 600 },
    uIntensity: { value: args.intensity },
    uFocus: { value: new THREE.Vector4(0, 0, 1, 1) },
    uFocusShare: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec4 aSpark;
      attribute vec2 aSeed;
      uniform float uTime;
      uniform float uStart;
      uniform float uStop;
      uniform vec4 uArea;
      uniform vec3 uColors[4];
      uniform float uPixel;
      uniform vec4 uFocus;
      uniform float uFocusShare;
      varying vec3 vColor;
      varying float vAlpha;
      float h1(float n) { return fract(sin(n * 12.9898 + 4.1414) * 43758.5453); }
      void main() {
        float shell = aSpark.w;
        float period = 3.0 + h1(shell * 1.7) * 1.8;
        float offset = h1(shell * 3.1) * period * 0.9;
        float t = uTime - uStart - offset;
        vec3 pos = vec3(0.0, -500.0, 0.0);
        float size = 0.0;
        vAlpha = 0.0;
        vColor = vec3(1.0);
        if (t > 0.0) {
          float cycle = floor(t / period);
          float lt = t - cycle * period;
          float launch = uStart + offset + cycle * period;
          if (launch < uStop) {
            float k = shell * 7.13 + cycle * 3.71;
            vec3 base = vec3(mix(uArea.x, uArea.y, h1(k)), 0.0, (h1(k + 1.3) * 2.0 - 1.0) * uArea.z);
            if (h1(shell * 9.7 + 0.5) < uFocusShare) base = vec3(uFocus.x + (h1(k) * 2.0 - 1.0) * uFocus.z, 0.0, uFocus.y + (h1(k + 1.3) * 2.0 - 1.0) * uFocus.w);
            float burstH = uArea.w * (0.7 + 0.55 * h1(k + 2.1));
            float rise = 0.9 + 0.5 * h1(k + 4.2);
            vec3 color = uColors[int(min(3.0, floor(h1(k + 5.5) * 4.0)))];
            float kind = h1(k + 6.6);
            if (lt < rise) {
              if (aSeed.y > 0.5 && aSeed.y < 1.5) {
                float lag = aSeed.x * 0.3;
                float u = clamp((lt - lag) / rise, 0.0, 1.0);
                pos = base + vec3(sin(u * 9.0 + k) * 1.2, burstH * (1.0 - (1.0 - u) * (1.0 - u)), 0.0);
                vAlpha = (1.0 - aSeed.x) * step(lag, lt);
                vColor = vec3(1.0, 0.75, 0.45);
                size = 2.4;
              }
            } else {
              float ghost = step(1.5, aSeed.y);
              float bt = lt - rise - ghost * (0.1 + 0.06 * aSeed.x);
              float willow = step(0.78, kind);
              float life = mix(2.4, 3.6, willow);
              if (bt > 0.0 && bt < life) {
                vec3 dir = aSpark.xyz;
                if (kind < 0.3) dir = normalize(vec3(dir.x, dir.y * 0.12, dir.z) + 0.0001);
                float speed = mix(105.0, 70.0, willow) * (0.85 + 0.25 * aSeed.x) * (burstH / 110.0);
                float spread = (1.0 - exp(-2.6 * bt)) / 2.6;
                pos = base + vec3(0.0, burstH, 0.0) + dir * speed * spread;
                pos.y -= mix(4.0, 9.0, willow) * bt * bt;
                float fade = 1.0 - bt / life;
                float flash = (1.0 - smoothstep(0.0, 0.18, bt)) * (1.0 - ghost);
                vAlpha = fade * fade * (0.7 + 0.3 * sin(uTime * 31.0 + aSeed.x * 60.0)) + flash;
                vColor = mix(color, vec3(1.0, 0.8, 0.42), willow * 0.85);
                vColor = mix(vColor, vec3(1.0), flash * 0.7);
                size = mix(5.0, 2.6, bt / life) * (1.0 + flash) * (1.0 - 0.3 * ghost);
                vAlpha *= 1.0 - 0.55 * ghost;
              }
            }
          }
        }
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = vAlpha > 0.0 ? max(size * uPixel / max(-mv.z, 1.0), 1.5) : 0.0;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = dot(c, c) * 4.0;
        float a = exp(-d * 3.0);
        vec3 col = mix(vColor, vec3(1.0), exp(-d * 30.0) * 0.6);
        gl_FragColor = vec4(col * uIntensity, a * min(vAlpha, 1.5));
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const points = new THREE.Points(geometry, material);
  points.name = "parade-fireworks";
  points.frustumCulled = false;
  points.renderOrder = 3;
  points.onBeforeRender = pixelScale(uniforms.uPixel);
  let on = false;
  return {
    points,
    set(next, time) {
      if (next === on) return;
      on = next;
      if (on) {
        uniforms.uStart.value = time;
        uniforms.uStop.value = 1e7;
      } else uniforms.uStop.value = time;
    },
    aim(area, focus) {
      uniforms.uArea.value.set(area.x0, area.x1, area.z, area.height);
      if (focus) uniforms.uFocus.value.set(focus.x, focus.z, Math.max(1, focus.rx), Math.max(1, focus.rz));
      uniforms.uFocusShare.value = focus ? Math.min(1, Math.max(0, focus.share)) : 0;
    },
    update(time) {
      uniforms.uTime.value = time;
      // Antes de ligar (ou depois de voltar no tempo) não desenha nada.
      points.visible = uniforms.uStart.value < 1e5 && time >= uniforms.uStart.value - 0.01;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
