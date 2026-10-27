// Céu da festa do título: um domo só, desenhado por último (só onde nada
// cobriu a tela), com degradê, brilho do sol/lua e estrelas à noite. Um draw
// call, nenhuma textura.

import * as THREE from "three";
import type { ParadeTimeOfDay } from "./parade-script";
import type { CityLighting } from "./stage-city";

export type SkyDome = {
  mesh: THREE.Mesh;
  /** Acompanha a câmera (o domo nunca fica para trás nem corta). */
  follow(camera: THREE.Camera): void;
  dispose(): void;
};

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  // Profundidade no plano de fundo: o teste de profundidade descarta o que já foi pintado.
  gl_Position = clip.xyww;
}
`;

// As cores entram já em sRGB e saem sem tone mapping: é o mesmo caminho da
// névoa do three, então o horizonte do céu casa com a cidade sumindo na névoa.
const FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uGlow;
uniform float uDisk;
uniform float uDiskSize;
uniform float uStars;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.6));
  float s = max(dot(d, uSunDir), 0.0);
  // Halo largo (pôr do sol esquenta meio céu) + disco.
  col += uSunColor * (uGlow * (0.55 * pow(s, 6.0) + 0.45 * pow(s, 48.0)));
  col = mix(col, uSunColor * 1.15 + 0.15, uDisk * smoothstep(uDiskSize, uDiskSize + 0.0012, s));
  if (uStars > 0.0) {
    vec3 q = floor(d * 210.0);
    float n = fract(sin(dot(q, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    col += vec3(step(0.9972, n) * smoothstep(0.08, 0.35, h) * uStars * (0.6 + 0.4 * fract(n * 91.0)));
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

function srgb(hex: string) {
  const color = new THREE.Color(hex);
  const out = new THREE.Color();
  color.getRGB(out, THREE.SRGBColorSpace);
  return new THREE.Vector3(out.r, out.g, out.b);
}

export function buildSky(lighting: CityLighting, timeOfDay: ParadeTimeOfDay): SkyDome {
  const night = timeOfDay === "night";
  const sunset = timeOfDay === "sunset";
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uTop: { value: srgb(lighting.skyTop) },
      uHorizon: { value: srgb(lighting.skyHorizon) },
      uSunDir: { value: lighting.sunDirection.clone().normalize() },
      uSunColor: { value: srgb(night ? "#dfe8ff" : lighting.sunColor) },
      uGlow: { value: night ? 0.12 : sunset ? 0.85 : 0.35 },
      uDisk: { value: night ? 0.9 : sunset ? 1 : 0.85 },
      // cos do raio angular do disco: lua e sol de fim de tarde maiores.
      uDiskSize: { value: night ? 0.99955 : sunset ? 0.9993 : 0.99965 },
      uStars: { value: night ? 0.85 : 0 },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const geometry = new THREE.SphereGeometry(10, 24, 12);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "parade-sky";
  mesh.frustumCulled = false;
  // Depois de tudo que é opaco: só pinta o que sobrou.
  mesh.renderOrder = 900;
  mesh.matrixAutoUpdate = false;
  return {
    mesh,
    follow(camera) {
      mesh.position.copy(camera.position);
      mesh.updateMatrix();
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
