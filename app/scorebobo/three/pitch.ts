// Gramado: um plano só, com listras de corte, ruído de grama, desgaste na
// pequena área e TODAS as marcações pintadas no fragment shader por distância
// (linhas de 12 cm nítidas em qualquer zoom, sem textura). Recebe a sombra da
// luz principal como qualquer MeshStandardMaterial.

import * as THREE from "three";
import { PITCH } from "../types";
import type { SkyLook } from "./util";

const GRASS_PARS_VERTEX = /* glsl */ `
varying vec3 vGround;
`;

const GRASS_WORLD_VERTEX = /* glsl */ `
vGround = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const GRASS_PARS_FRAGMENT = /* glsl */ `
varying vec3 vGround;
uniform vec3 uGrassLight;
uniform vec3 uGrassDark;
uniform vec3 uGrassDry;
uniform vec3 uApron;
uniform vec3 uLineColor;
uniform vec4 uStandShadow;

float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float gSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
// Distância (m) até a marcação mais próxima. Simétrica nos dois eixos.
float pitchLines(vec2 p) {
  vec2 q = vec2(abs(p.x), abs(p.y));
  float d = gSeg(q, vec2(${PITCH.halfWidth.toFixed(2)}, 0.0), vec2(${PITCH.halfWidth.toFixed(2)}, ${PITCH.goalLineZ.toFixed(2)}));
  d = min(d, gSeg(q, vec2(0.0, ${PITCH.goalLineZ.toFixed(2)}), vec2(${PITCH.halfWidth.toFixed(2)}, ${PITCH.goalLineZ.toFixed(2)})));
  d = min(d, gSeg(q, vec2(0.0, 0.0), vec2(${PITCH.halfWidth.toFixed(2)}, 0.0)));
  d = min(d, abs(length(p) - ${PITCH.arcRadius.toFixed(2)}));
  d = min(d, length(p) - 0.15 + 0.06);
  float boxZ = ${(PITCH.goalLineZ - PITCH.boxDepth).toFixed(2)};
  float smallZ = ${(PITCH.goalLineZ - PITCH.smallBoxDepth).toFixed(2)};
  float spotZ = ${(PITCH.goalLineZ - PITCH.penaltySpot).toFixed(2)};
  d = min(d, gSeg(q, vec2(0.0, boxZ), vec2(${PITCH.boxHalfWidth.toFixed(2)}, boxZ)));
  d = min(d, gSeg(q, vec2(${PITCH.boxHalfWidth.toFixed(2)}, boxZ), vec2(${PITCH.boxHalfWidth.toFixed(2)}, ${PITCH.goalLineZ.toFixed(2)})));
  d = min(d, gSeg(q, vec2(0.0, smallZ), vec2(${PITCH.smallBoxHalfWidth.toFixed(2)}, smallZ)));
  d = min(d, gSeg(q, vec2(${PITCH.smallBoxHalfWidth.toFixed(2)}, smallZ), vec2(${PITCH.smallBoxHalfWidth.toFixed(2)}, ${PITCH.goalLineZ.toFixed(2)})));
  float spot = length(vec2(q.x, q.y - spotZ));
  d = min(d, spot - 0.11 + 0.06);
  // Meia-lua: só a parte fora da grande área.
  if (q.y < boxZ) d = min(d, abs(spot - ${PITCH.arcRadius.toFixed(2)}));
  vec2 corner = q - vec2(${PITCH.halfWidth.toFixed(2)}, ${PITCH.goalLineZ.toFixed(2)});
  if (corner.x < 0.0 && corner.y < 0.0) d = min(d, abs(length(corner) - 1.0));
  return d;
}
`;

const GRASS_COLOR_FRAGMENT = /* glsl */ `
vec2 gp = vGround.xz;
vec2 gq = abs(gp);
// Listras de corte atravessando o campo; a claridade troca com o lado de onde se olha.
float band = floor((gp.y + ${PITCH.goalLineZ.toFixed(2)}) / ${(PITCH.goalLineZ * 2 / 18).toFixed(4)});
float stripe = mod(band, 2.0);
vec3 gView = normalize(cameraPosition - vGround);
float sheen = gView.z * (stripe * 2.0 - 1.0);
vec3 grass = mix(uGrassDark, uGrassLight, clamp(stripe * 0.7 + 0.15 + sheen * 0.2, 0.0, 1.0));
// Ruído em três escalas; o fino some quando o pixel cobre mais que alguns centímetros.
float footprint = length(fwidth(gp));
float n1 = gNoise(gp * 0.07);
float n2 = gNoise(gp * 0.55 + 7.0);
float n3 = gNoise(gp * 7.0 + 3.0);
float fine = 1.0 - smoothstep(0.03, 0.12, footprint);
grass *= 0.88 + 0.2 * n1 + 0.09 * (n2 - 0.5) + 0.16 * (n3 - 0.5) * fine;
// Desgaste: boca do gol, pequena área e marca do pênalti (onde o goleiro pisa).
float mouth = (1.0 - smoothstep(4.0, 8.5, gq.x)) * smoothstep(${(PITCH.goalLineZ - 7.5).toFixed(2)}, ${(PITCH.goalLineZ - 1.5).toFixed(2)}, gq.y) * (1.0 - smoothstep(${(PITCH.goalLineZ + 0.6).toFixed(2)}, ${(PITCH.goalLineZ + 2.0).toFixed(2)}, gq.y));
float spotWear = 1.0 - smoothstep(0.4, 1.6, length(vec2(gq.x, gq.y - ${(PITCH.goalLineZ - PITCH.penaltySpot).toFixed(2)})));
float wear = clamp(mouth * 0.75 + spotWear * 0.5, 0.0, 1.0) * smoothstep(0.35, 0.75, n2 * 0.6 + n3 * 0.4 + 0.15);
grass = mix(grass, uGrassDry * (0.85 + 0.3 * n3), wear * 0.55);
// Fora do campo: grama sem listra até a pista, depois o piso escuro da beira.
float inField = 1.0 - smoothstep(${(PITCH.halfWidth + 4.5).toFixed(2)}, ${(PITCH.halfWidth + 4.6).toFixed(2)}, gq.x);
inField *= 1.0 - smoothstep(${(PITCH.goalLineZ + 5.0).toFixed(2)}, ${(PITCH.goalLineZ + 5.1).toFixed(2)}, gq.y);
vec3 apron = uApron * (0.9 + 0.2 * n2);
grass = mix(apron, grass, inField);
// Marcações.
float lineD = pitchLines(gp);
float aa = max(fwidth(lineD), 0.0008);
float cover = clamp(0.5 + (0.06 - lineD) / aa, 0.0, 1.0) * min(1.0, 0.14 / aa);
grass = mix(grass, uLineColor * (0.92 + 0.08 * n3), cover * 0.93);
// Sombra da arquibancada (sol baixo): meio-plano suave ao longo de x.
float standShade = (1.0 - smoothstep(uStandShadow.x - uStandShadow.z, uStandShadow.x + uStandShadow.z, gp.x + (n1 - 0.5) * 1.5)) * uStandShadow.y;
grass *= 1.0 - standShade;
diffuseColor.rgb = grass;
`;

export class Pitch {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly uniforms = {
    uGrassLight: { value: new THREE.Color("#4f9a3d") },
    uGrassDark: { value: new THREE.Color("#3a7d2f") },
    uGrassDry: { value: new THREE.Color("#8f8a52") },
    uApron: { value: new THREE.Color("#2c4a2c") },
    uLineColor: { value: new THREE.Color("#f2f4ec") },
    uStandShadow: { value: new THREE.Vector4(0, 0, 1, 0) },
  };

  constructor(look: SkyLook) {
    this.material = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.92, metalness: 0 });
    this.setLook(look);
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${GRASS_PARS_VERTEX}`)
        .replace("#include <begin_vertex>", `#include <begin_vertex>\n${GRASS_WORLD_VERTEX}`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${GRASS_PARS_FRAGMENT}`)
        .replace("#include <map_fragment>", GRASS_COLOR_FRAGMENT);
    };
    const geometry = new THREE.PlaneGeometry(140, 180);
    geometry.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = -5;
  }

  setLook(look: SkyLook) {
    const night = look.lights > 0.9;
    // À noite o verde fica mais frio e saturado sob os refletores.
    this.uniforms.uGrassLight.value.set(night ? "#4ea341" : look.sunDisc && look.keyDir.y < 0.4 ? "#5a9a3a" : "#55a03f");
    this.uniforms.uGrassDark.value.set(night ? "#347a2e" : look.sunDisc && look.keyDir.y < 0.4 ? "#3f7b2c" : "#3b8130");
    this.uniforms.uStandShadow.value.set(look.standShadow.edge, look.standShadow.strength, look.standShadow.soft, 0);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
