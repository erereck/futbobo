// Estádio do modo 3D: gramado (pintado pelo mesmo código da mesa 2D), tabelas
// com placas de LED, gols com rede que estufa, bandeirinhas, arquibancada de
// bonecos de bloco e torres de luz.
//
// Mundo: x do campo vira X - largura/2, y do campo vira Z - altura/2. Assim o
// gol da CPU (y = 0) fica em -Z e o seu (y = altura) em +Z.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FIELD, GOAL_LEFT, GOAL_RIGHT } from "../engine";
import { fieldThemeForMatch } from "../field-themes";
import { drawFieldSurface } from "../render";
import type { BotaoMatchSetup, BotaoSide } from "../types";
import { mixHex, shadeHex } from "./textures";

export const HALF_W = FIELD.width / 2;
export const HALF_H = FIELD.height / 2;
export const GOAL_HEIGHT = 30;
const RAIL_HEIGHT = 7;
const RAIL_THICKNESS = 3;
const NET_CELL = 3.6;

// ------------------------------------------------------------ texturas

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function fieldTexture(setup: BotaoMatchSetup, futsal: boolean, anisotropy: number) {
  const scale = 4;
  const canvas = document.createElement("canvas");
  canvas.width = FIELD.width * scale;
  canvas.height = FIELD.height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  drawFieldSurface(ctx, setup);
  if (!futsal) {
    // Grão de grama: de longe some, de perto tira o aspecto de plástico.
    const random = seeded(setup.seed ^ 0x9e3779b9);
    ctx.lineWidth = 0.35;
    for (let index = 0; index < 14000; index += 1) {
      const x = random() * FIELD.width;
      const y = random() * FIELD.height;
      ctx.strokeStyle = random() < 0.5 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.07)";
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (random() - 0.5) * 1.4, y - 1 - random() * 1.6);
      ctx.stroke();
    }
  } else {
    const sheen = ctx.createRadialGradient(FIELD.width / 2, FIELD.height / 2, 10, FIELD.width / 2, FIELD.height / 2, FIELD.height * 0.7);
    sheen.addColorStop(0, "rgba(255,255,255,0.08)");
    sheen.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  return texture;
}

function ledTexture(setup: BotaoMatchSetup) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#04070a";
  ctx.fillRect(0, 0, 1024, 64);
  const items = [
    { text: "FUTBOBO", color: "#ffc72c" },
    { text: setup.userTeam.shortName.toLocaleUpperCase("pt-BR"), color: setup.userTeam.primary },
    { text: setup.competitionName.toLocaleUpperCase("pt-BR"), color: "#f4f6f2" },
    { text: setup.cpuTeam.shortName.toLocaleUpperCase("pt-BR"), color: setup.cpuTeam.primary },
  ];
  ctx.textBaseline = "middle";
  ctx.font = "900 34px ui-sans-serif, system-ui, sans-serif";
  const segment = 1024 / items.length;
  items.forEach((item, index) => {
    const x = index * segment;
    ctx.fillStyle = shadeHex(item.color, -150);
    ctx.fillRect(x + 4, 6, segment - 8, 52);
    ctx.fillStyle = mixHex(item.color, "#ffffff", 0.18);
    let size = 34;
    ctx.font = `900 ${size}px ui-sans-serif, system-ui, sans-serif`;
    while (ctx.measureText(item.text).width > segment - 30 && size > 14) {
      size -= 2;
      ctx.font = `900 ${size}px ui-sans-serif, system-ui, sans-serif`;
    }
    ctx.textAlign = "center";
    ctx.fillText(item.text, x + segment / 2, 33);
  });
  // Grade de LED.
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  for (let x = 0; x < 1024; x += 4) ctx.fillRect(x, 0, 1, 64);
  for (let y = 0; y < 64; y += 4) ctx.fillRect(0, y, 1024, 1);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  return texture;
}

function netTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 32, 32);
  ctx.strokeStyle = "rgba(255,255,255,1)";
  ctx.lineWidth = 3;
  ctx.strokeRect(1.5, 1.5, 29, 29);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Junta peças estáticas numa geometria só. Estádio parado não precisa de
 * um draw call por degrau, trave ou poste — no celular isso faz diferença.
 */
class Baker {
  private readonly parts: THREE.BufferGeometry[] = [];
  private readonly helper = new THREE.Object3D();

  add(geometry: THREE.BufferGeometry, position: THREE.Vector3, rotation?: THREE.Euler | THREE.Quaternion) {
    this.helper.position.copy(position);
    if (rotation instanceof THREE.Quaternion) this.helper.quaternion.copy(rotation);
    else if (rotation) this.helper.rotation.copy(rotation);
    else this.helper.rotation.set(0, 0, 0);
    this.helper.updateMatrix();
    this.parts.push(geometry.clone().applyMatrix4(this.helper.matrix));
  }

  geometry() {
    const merged = mergeGeometries(this.parts) ?? new THREE.BufferGeometry();
    this.parts.forEach((part) => part.dispose());
    this.parts.length = 0;
    return merged;
  }

  build(material: THREE.Material) {
    const result = new THREE.Mesh(this.geometry(), material);
    result.receiveShadow = true;
    return result;
  }
}

// ------------------------------------------------------------------ gol

/** Painel em grade entre quatro cantos (bilinear), com UV em "células" de rede. */
function gridPanel(p00: THREE.Vector3, p10: THREE.Vector3, p01: THREE.Vector3, p11: THREE.Vector3, segU: number, segV: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const widthU = p00.distanceTo(p10) / NET_CELL;
  const widthV = p00.distanceTo(p01) / NET_CELL;
  const point = new THREE.Vector3();
  const top = new THREE.Vector3();
  const bottom = new THREE.Vector3();
  for (let j = 0; j <= segV; j += 1) {
    for (let i = 0; i <= segU; i += 1) {
      const u = i / segU;
      const v = j / segV;
      bottom.lerpVectors(p00, p10, u);
      top.lerpVectors(p01, p11, u);
      point.lerpVectors(bottom, top, v);
      positions.push(point.x, point.y, point.z);
      uvs.push(u * widthU, v * widthV);
    }
  }
  for (let j = 0; j < segV; j += 1) {
    for (let i = 0; i < segU; i += 1) {
      const a = j * (segU + 1) + i;
      const b = a + 1;
      const c = a + segU + 1;
      const d = c + 1;
      indices.push(a, b, d, a, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

class GoalView {
  readonly group = new THREE.Group();
  private readonly ripplePanels: Array<{ geometry: THREE.BufferGeometry; base: Float32Array }> = [];
  private rippleX = 0;
  private rippleY = 10;
  private rippleT = -1;
  private rippleStrength = 1;
  private wobbleT = -1;
  private readonly frame = new THREE.Group();

  constructor(readonly top: boolean, frameMaterial: THREE.Material, netMaterial: THREE.Material, accent: string) {
    const dir = top ? -1 : 1;
    const z0 = top ? -HALF_H : HALF_H;
    const depth = FIELD.goalDepth;
    const xL = GOAL_LEFT - HALF_W;
    const xR = GOAL_RIGHT - HALF_W;
    const backTop = GOAL_HEIGHT * 0.62;
    this.group.add(this.frame);

    // Traves, travessão e suportes viram uma geometria só (um draw call).
    const frame = new Baker();
    const post = new THREE.CylinderGeometry(1.7, 1.7, GOAL_HEIGHT, 14);
    for (const x of [xL, xR]) frame.add(post, new THREE.Vector3(x, GOAL_HEIGHT / 2, z0));
    frame.add(new THREE.CylinderGeometry(1.7, 1.7, xR - xL + 3.4, 14), new THREE.Vector3(0, GOAL_HEIGHT, z0), new THREE.Euler(0, 0, Math.PI / 2));
    const stanchion = (from: THREE.Vector3, to: THREE.Vector3, radius = 0.6) => {
      const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      frame.add(new THREE.CylinderGeometry(radius, radius, from.distanceTo(to), 8), from.clone().add(to).multiplyScalar(0.5), rotation);
    };
    const backZ = z0 + dir * depth;
    for (const x of [xL, xR]) {
      stanchion(new THREE.Vector3(x, GOAL_HEIGHT, z0), new THREE.Vector3(x, backTop, backZ));
      stanchion(new THREE.Vector3(x, backTop, backZ), new THREE.Vector3(x, 0, backZ));
    }
    stanchion(new THREE.Vector3(xL, 0.6, backZ), new THREE.Vector3(xR, 0.6, backZ));
    stanchion(new THREE.Vector3(xL, backTop, backZ), new THREE.Vector3(xR, backTop, backZ));
    const frameMesh = frame.build(frameMaterial);
    frameMesh.castShadow = true;
    this.frame.add(frameMesh);

    // Faixa no pé da trave com a cor do dono do gol.
    const bands = new Baker();
    const band = new THREE.CylinderGeometry(1.85, 1.85, 3, 14);
    for (const x of [xL, xR]) bands.add(band, new THREE.Vector3(x, 1.5, z0));
    this.frame.add(bands.build(new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5 })));

    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const panel = (geometry: THREE.BufferGeometry, ripple: boolean) => {
      const net = new THREE.Mesh(geometry, netMaterial);
      net.castShadow = true;
      net.renderOrder = 2;
      this.group.add(net);
      if (ripple) {
        const position = geometry.getAttribute("position") as THREE.BufferAttribute;
        this.ripplePanels.push({ geometry, base: Float32Array.from(position.array as Float32Array) });
      }
    };
    panel(gridPanel(v(xL, GOAL_HEIGHT, z0), v(xR, GOAL_HEIGHT, z0), v(xL, backTop, backZ), v(xR, backTop, backZ), 18, 4), true);
    panel(gridPanel(v(xL, 0, backZ), v(xR, 0, backZ), v(xL, backTop, backZ), v(xR, backTop, backZ), 18, 6), true);
    // As laterais não estufam: as duas viram um painel só.
    const sides = new Baker();
    for (const x of [xL, xR]) sides.add(gridPanel(v(x, 0, z0), v(x, 0, backZ), v(x, GOAL_HEIGHT, z0), v(x, backTop, backZ), 5, 6), v(0, 0, 0));
    panel(sides.geometry(), false);
  }

  ripple(fieldX: number, strength: number) {
    this.rippleX = fieldX - HALF_W;
    this.rippleY = 6;
    this.rippleT = 0;
    this.rippleStrength = strength;
  }

  wobble() {
    this.wobbleT = 0;
  }

  update(dt: number) {
    if (this.rippleT >= 0) {
      this.rippleT += dt;
      const dir = this.top ? -1 : 1;
      const decay = Math.exp(-this.rippleT * 2.6);
      const wave = Math.sin(this.rippleT * 15) * decay + (this.rippleT < 0.12 ? (this.rippleT / 0.12) * 0.6 : 0.6 * decay);
      for (const panel of this.ripplePanels) {
        const position = panel.geometry.getAttribute("position") as THREE.BufferAttribute;
        const array = position.array as Float32Array;
        for (let index = 0; index < array.length; index += 3) {
          const x = panel.base[index];
          const y = panel.base[index + 1];
          const falloff = Math.exp(-((x - this.rippleX) ** 2) / 420 - ((y - this.rippleY) ** 2) / 260);
          array[index + 2] = panel.base[index + 2] + dir * 7 * this.rippleStrength * falloff * wave;
        }
        position.needsUpdate = true;
      }
      if (this.rippleT > 2.2) {
        for (const panel of this.ripplePanels) {
          const position = panel.geometry.getAttribute("position") as THREE.BufferAttribute;
          (position.array as Float32Array).set(panel.base);
          position.needsUpdate = true;
        }
        this.rippleT = -1;
      }
    }
    if (this.wobbleT >= 0) {
      this.wobbleT += dt;
      this.frame.position.x = Math.sin(this.wobbleT * 70) * 0.7 * Math.exp(-this.wobbleT * 7);
      if (this.wobbleT > 0.8) {
        this.frame.position.x = 0;
        this.wobbleT = -1;
      }
    }
  }
}

// --------------------------------------------------------- arquibancada

type Fan = { x: number; y: number; z: number; yaw: number; side: BotaoSide; phase: number; energy: number };

class Crowd {
  readonly group = new THREE.Group();
  private readonly bodies: THREE.InstancedMesh;
  private readonly heads: THREE.InstancedMesh;
  private readonly fans: Fan[] = [];
  private readonly cheer: Record<BotaoSide, number> = { user: 0, cpu: 0 };
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private readonly up = new THREE.Vector3(0, 1, 0);
  private frame = 0;

  constructor(setup: BotaoMatchSetup, stepMaterial: THREE.Material) {
    const random = seeded(setup.seed ^ 0x51ed27);
    const rows = 6;
    const steps = new Baker();
    const stand = (originX: number, originZ: number, alongX: number, alongZ: number, length: number, outX: number, outZ: number, sideAt: (x: number, z: number) => BotaoSide) => {
      for (let row = 0; row < rows; row += 1) {
        const distance = row * 9 + 4.5;
        const height = 4 + row * 4.6;
        steps.add(
          new THREE.BoxGeometry(Math.abs(alongX) * length + Math.abs(outX) * 9, height, Math.abs(alongZ) * length + Math.abs(outZ) * 9),
          new THREE.Vector3(originX + outX * distance, height / 2, originZ + outZ * distance),
        );
        const count = Math.floor(length / 7.6);
        for (let index = 0; index < count; index += 1) {
          if (random() < 0.07) continue;
          const along = (index + 0.5) / count - 0.5;
          const x = originX + alongX * along * length + outX * distance + (random() - 0.5) * 1.6;
          const z = originZ + alongZ * along * length + outZ * distance + (random() - 0.5) * 1.6;
          this.fans.push({ x, y: height, z, yaw: Math.atan2(-outX, -outZ) + (random() - 0.5) * 0.5, side: sideAt(x, z), phase: random() * Math.PI * 2, energy: 0.6 + random() * 0.8 });
        }
      }
    };
    const sideOffset = HALF_W + 46;
    const endOffset = HALF_H + 62;
    const zSide = (_x: number, z: number): BotaoSide => (z > 0 ? "user" : "cpu");
    stand(-sideOffset, 0, 0, 1, FIELD.height + 90, -1, 0, zSide);
    stand(sideOffset, 0, 0, 1, FIELD.height + 90, 1, 0, zSide);
    stand(0, -endOffset, 1, 0, FIELD.width + 60, 0, -1, () => "cpu");
    stand(0, endOffset, 1, 0, FIELD.width + 60, 0, 1, () => "user");
    this.group.add(steps.build(stepMaterial));

    const count = this.fans.length;
    this.bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(5.2, 7, 3.6), new THREE.MeshStandardMaterial({ roughness: 0.9 }), count);
    this.heads = new THREE.InstancedMesh(new THREE.BoxGeometry(4.2, 4.2, 4.2), new THREE.MeshStandardMaterial({ roughness: 0.85 }), count);
    const color = new THREE.Color();
    const skins = ["#f6d9c0", "#e5aa84", "#cc8965", "#985d43", "#714633", "#4b3027", "#edbf9d"];
    const neutrals = ["#f2f2f0", "#2a2d33", "#6b7280", "#1e3a5f"];
    this.fans.forEach((fan, index) => {
      const team = fan.side === "user" ? setup.userTeam : setup.cpuTeam;
      const roll = random();
      color.set(roll < 0.66 ? team.primary : roll < 0.84 ? team.secondary : neutrals[Math.floor(random() * neutrals.length)]);
      this.bodies.setColorAt(index, color);
      color.set(skins[Math.floor(random() * skins.length)]);
      this.heads.setColorAt(index, color);
    });
    this.bodies.castShadow = false;
    this.heads.castShadow = false;
    this.bodies.receiveShadow = true;
    this.group.add(this.bodies, this.heads);
    this.update(0, 0, true);
  }

  celebrate(side: BotaoSide, seconds = 3.2) {
    this.cheer[side] = seconds;
  }

  update(dt: number, time: number, force = false) {
    this.cheer.user = Math.max(0, this.cheer.user - dt);
    this.cheer.cpu = Math.max(0, this.cheer.cpu - dt);
    const active = this.cheer.user > 0 || this.cheer.cpu > 0;
    this.frame += 1;
    // Torcida parada mexe pouco: atualiza um quadro sim, outro não.
    if (!force && !active && this.frame % 2 === 1) return;
    this.fans.forEach((fan, index) => {
      const cheering = this.cheer[fan.side] > 0;
      const intensity = cheering ? Math.min(1, this.cheer[fan.side] / 0.6) : 0;
      const bounce = cheering
        ? Math.max(0, Math.sin(time * 9 * fan.energy + fan.phase)) * 4.5 * intensity
        : Math.max(0, Math.sin(time * 1.6 + fan.phase)) * 0.35;
      this.quaternion.setFromAxisAngle(this.up, fan.yaw);
      this.position.set(fan.x, fan.y + 3.5 + bounce, fan.z);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.bodies.setMatrixAt(index, this.matrix);
      this.position.y = fan.y + 9.1 + bounce;
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.heads.setMatrixAt(index, this.matrix);
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.bodies.geometry.dispose();
    (this.bodies.material as THREE.Material).dispose();
    this.heads.geometry.dispose();
    (this.heads.material as THREE.Material).dispose();
    this.bodies.dispose();
    this.heads.dispose();
  }
}

// ---------------------------------------------------------------- estádio

export class Stadium {
  readonly group = new THREE.Group();
  private readonly goals: Record<"top" | "bottom", GoalView>;
  private readonly crowd: Crowd;
  private readonly flags: THREE.Mesh[] = [];
  private readonly ledTextures: THREE.Texture[] = [];
  private readonly disposables: Array<{ dispose: () => void }> = [];

  constructor(setup: BotaoMatchSetup, anisotropy: number) {
    const theme = fieldThemeForMatch(setup);
    const futsal = theme === "futsal-blue";
    const track = <T extends { dispose: () => void }>(item: T) => {
      this.disposables.push(item);
      return item;
    };

    // Chão em volta e gramado.
    const surroundColor = futsal ? "#0b2c42" : "#0d3b24";
    const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(4000, 4000)), track(new THREE.MeshStandardMaterial({ color: "#0b1016", roughness: 1 })));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.6;
    floor.receiveShadow = true;
    this.group.add(floor);
    const apron = new THREE.Mesh(track(new THREE.PlaneGeometry(FIELD.width + 84, FIELD.height + 116)), track(new THREE.MeshStandardMaterial({ color: surroundColor, roughness: 0.96 })));
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.08;
    apron.receiveShadow = true;
    this.group.add(apron);
    const fieldMap = track(fieldTexture(setup, futsal, anisotropy));
    const field = new THREE.Mesh(track(new THREE.PlaneGeometry(FIELD.width, FIELD.height)), track(new THREE.MeshStandardMaterial({ map: fieldMap, roughness: futsal ? 0.42 : 0.95, metalness: 0 })));
    field.rotation.x = -Math.PI / 2;
    field.receiveShadow = true;
    this.group.add(field);

    // Tabelas: a bola quica exatamente aqui, então ficam rente às linhas.
    // Corpo das tabelas numa geometria, painéis de LED em outra (2 draw calls).
    const railMaterial = track(new THREE.MeshStandardMaterial({ color: "#151b22", roughness: 0.55, metalness: 0.2 }));
    const ledMap = track(ledTexture(setup));
    this.ledTextures.push(ledMap);
    const ledMaterial = track(new THREE.MeshStandardMaterial({ map: ledMap, emissive: "#ffffff", emissiveMap: ledMap, emissiveIntensity: 0.9, roughness: 0.4 }));
    const railBodies = new Baker();
    const ledPanels = new Baker();
    const panelHeight = RAIL_HEIGHT * 0.78;
    const rail = (x: number, z: number, width: number, depth: number, facing: number, length: number) => {
      railBodies.add(new THREE.BoxGeometry(width, RAIL_HEIGHT, depth), new THREE.Vector3(x, RAIL_HEIGHT / 2, z));
      const panel = new THREE.PlaneGeometry(length - 1, panelHeight);
      // O texto mantém a proporção: o painel repete a faixa conforme o comprimento.
      const uv = panel.getAttribute("uv") as THREE.BufferAttribute;
      const repeat = length / panelHeight / 16;
      for (let index = 0; index < uv.count; index += 1) uv.setX(index, uv.getX(index) * repeat);
      const inward = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
      const offset = Math.abs(inward.x) * width / 2 + Math.abs(inward.z) * depth / 2 + 0.06;
      ledPanels.add(panel, new THREE.Vector3(x + inward.x * offset, RAIL_HEIGHT / 2, z + inward.z * offset), new THREE.Euler(0, facing, 0));
      panel.dispose();
    };
    const sideLength = FIELD.height + RAIL_THICKNESS * 2;
    rail(-HALF_W - RAIL_THICKNESS / 2 - 0.3, 0, RAIL_THICKNESS, sideLength, Math.PI / 2, sideLength);
    rail(HALF_W + RAIL_THICKNESS / 2 + 0.3, 0, RAIL_THICKNESS, sideLength, -Math.PI / 2, sideLength);
    const endSegment = GOAL_LEFT - 1.8;
    for (const sign of [-1, 1]) {
      const z = sign * (HALF_H + RAIL_THICKNESS / 2 + 0.3);
      const facing = sign < 0 ? 0 : Math.PI;
      rail(-HALF_W + endSegment / 2, z, endSegment, RAIL_THICKNESS, facing, endSegment);
      rail(HALF_W - endSegment / 2, z, endSegment, RAIL_THICKNESS, facing, endSegment);
    }
    const railMesh = railBodies.build(railMaterial);
    railMesh.castShadow = true;
    this.group.add(railMesh, ledPanels.build(ledMaterial));

    // Gols.
    const frameMaterial = track(new THREE.MeshStandardMaterial({ color: "#f5f7f4", roughness: 0.35, metalness: 0.1 }));
    const netMap = track(netTexture());
    const netMaterial = track(new THREE.MeshStandardMaterial({ map: netMap, color: "#eef1f3", transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }));
    this.goals = {
      top: new GoalView(true, frameMaterial, netMaterial, setup.cpuTeam.primary),
      bottom: new GoalView(false, frameMaterial, netMaterial, setup.userTeam.primary),
    };
    this.group.add(this.goals.top.group, this.goals.bottom.group);

    // Bandeirinhas de escanteio.
    const poleMaterial = track(new THREE.MeshStandardMaterial({ color: "#f2f2f2", roughness: 0.5 }));
    const flagMaterial = track(new THREE.MeshStandardMaterial({ color: futsal ? "#ff5a36" : "#ffd23f", side: THREE.DoubleSide, roughness: 0.8 }));
    const poleGeometry = track(new THREE.CylinderGeometry(0.55, 0.55, 22, 8));
    const flagGeometry = track(new THREE.PlaneGeometry(7, 5));
    flagGeometry.translate(3.5, 0, 0);
    const flagPoles = new Baker();
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        flagPoles.add(poleGeometry, new THREE.Vector3(sx * (HALF_W + 7), 11, sz * (HALF_H + 7)));
        const flag = new THREE.Mesh(flagGeometry, flagMaterial);
        flag.position.set(sx * (HALF_W + 7), 19.5, sz * (HALF_H + 7));
        flag.castShadow = true;
        this.flags.push(flag);
        this.group.add(flag);
      }
    }
    const polesMesh = flagPoles.build(poleMaterial);
    polesMesh.castShadow = true;
    this.group.add(polesMesh);

    // Arquibancada e torres de luz.
    const stepMaterial = track(new THREE.MeshStandardMaterial({ color: "#252c35", roughness: 0.92 }));
    this.crowd = new Crowd(setup, stepMaterial);
    this.group.add(this.crowd.group);
    const towerMaterial = track(new THREE.MeshStandardMaterial({ color: "#2a3038", roughness: 0.6, metalness: 0.4 }));
    const lampMaterial = track(new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#fff7e0", emissiveIntensity: 2.4 }));
    const towers = new Baker();
    const lamps = new Baker();
    const aim = new THREE.Object3D();
    const towerGeometry = track(new THREE.BoxGeometry(6, 220, 6));
    const lampGeometry = track(new THREE.BoxGeometry(34, 18, 4));
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const x = sx * (HALF_W + 120);
        const z = sz * (HALF_H + 130);
        towers.add(towerGeometry, new THREE.Vector3(x, 110, z));
        aim.position.set(x - sx * 3, 222, z - sz * 3);
        aim.lookAt(0, 0, 0);
        lamps.add(lampGeometry, aim.position, aim.quaternion);
      }
    }
    this.group.add(towers.build(towerMaterial), lamps.build(lampMaterial));
  }

  goal(side: "top" | "bottom") {
    return this.goals[side];
  }

  celebrate(side: BotaoSide) {
    this.crowd.celebrate(side);
  }

  update(dt: number, time: number) {
    for (const texture of this.ledTextures) texture.offset.x = (texture.offset.x + dt * 0.035) % 1;
    this.flags.forEach((flag, index) => {
      flag.rotation.y = Math.sin(time * 2.4 + index) * 0.35 + (index % 2 ? Math.PI : 0);
    });
    this.goals.top.update(dt);
    this.goals.bottom.update(dt);
    this.crowd.update(dt, time);
  }

  dispose() {
    for (const item of this.disposables) item.dispose();
    this.crowd.dispose();
    // Peças internas dos gols (faixas, suportes) não passam por `track`.
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material.dispose();
      }
    });
  }
}
