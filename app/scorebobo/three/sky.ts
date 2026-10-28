// Céu da fase (dia, pôr do sol, noite): uma cúpula com degradê, sol, nuvens
// e estrelas no fragment shader. Segue a câmera (nunca chega perto da borda).

import * as THREE from "three";
import type { SkyLook } from "./util";

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 world = modelMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uSunDisc;
uniform float uStars;
uniform float uClouds;
uniform float uTime;
varying vec3 vDir;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  // Degradê: horizonte largo e claro, zênite fundo; abaixo do horizonte, a cor da neblina.
  float up = clamp(h, 0.0, 1.0);
  vec3 color = mix(uHorizon, uZenith, pow(up, 0.55));
  color = mix(color, uGlow, exp(-max(h, 0.0) * 14.0) * 0.6);
  // Sol: disco + halo largo (o halo existe mesmo de noite: brilho dos refletores no ar).
  float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
  color += uSunColor * (pow(sunDot, 9.0) * 0.35 + pow(sunDot, 90.0) * 0.6) * (0.25 + 0.75 * uSunDisc);
  color += uSunColor * smoothstep(0.9993, 0.9997, sunDot) * 6.0 * uSunDisc;
  // Nuvens num plano alto, andando devagar; mais finas perto do horizonte.
  if (uClouds > 0.0 && h > 0.0) {
    vec2 plane = dir.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.006, uTime * 0.002);
    float n = fbm(plane);
    float cover = smoothstep(0.48, 0.82, n) * uClouds * smoothstep(0.0, 0.25, h);
    vec3 lit = mix(uHorizon, vec3(1.0), 0.55) + uSunColor * pow(sunDot, 4.0) * 0.5;
    vec3 cloud = mix(lit, uZenith * 1.2 + uGlow * 0.15, smoothstep(0.55, 0.95, n) * 0.6);
    color = mix(color, cloud, cover * 0.85);
  }
  // Estrelas: uma por célula, piscando.
  if (uStars > 0.0 && h > 0.05) {
    vec2 cell = dir.xz / (h + 0.4) * 140.0;
    vec2 id = floor(cell);
    vec2 f = fract(cell) - 0.5;
    float r = hash(id);
    float star = step(0.93, r) * smoothstep(0.09, 0.0, length(f + (vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5) * 0.6));
    float twinkle = 0.6 + 0.4 * sin(uTime * (1.5 + r * 3.0) + r * 40.0);
    color += vec3(0.85, 0.9, 1.0) * star * twinkle * uStars * smoothstep(0.05, 0.4, h) * (0.4 + r);
  }
  if (h < 0.0) color = mix(uHorizon, uHorizon * 0.5, clamp(-h * 4.0, 0.0, 1.0));
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class SkyDome {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(look: SkyLook, time: { value: number }) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      uniforms: {
        uZenith: { value: new THREE.Color(look.zenith) },
        uHorizon: { value: new THREE.Color(look.horizon) },
        uGlow: { value: new THREE.Color(look.glow) },
        uSunColor: { value: new THREE.Color(look.sunColor) },
        uSunDir: { value: look.keyDir.clone() },
        uSunDisc: { value: look.sunDisc },
        uStars: { value: look.stars },
        uClouds: { value: look.clouds },
        uTime: time,
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  follow(camera: THREE.Camera) {
    this.mesh.position.copy(camera.position);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
