// Marcos da cidade da festa, montados com primitivas e fundidos nas malhas da
// cidade: o que importa é a silhueta reconhecível de longe (Cristo de braços
// abertos, torre treliçada, arco, Big Ben...). À noite quase todos acendem
// (brilho por vértice) e os distantes atravessam a névoa (névoa por vértice).

import * as THREE from "three";
import { FX_PLAIN, MeshBuilder, SHAPES, WIN, WIN_ROOF, along, at, between, facadeBox, fx, pickOne, shape, tone, win } from "./city-kit";
import { flat, palm } from "./city-blocks";
import { reserve, type CityContext } from "./city-plan";
import type { LandmarkId } from "./parade-script";

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();

/** Ponto local (lx, lz) de uma peça girada `theta` em volta de (cx, cz). */
function local(cx: number, cz: number, theta: number, lx: number, lz: number): [number, number] {
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return [cx + lx * cos + lz * sin, cz - lx * sin + lz * cos];
}

/** Giro que leva a frente local (+z) para a direção (fx, fz). */
const facingAngle = (fx: number, fz: number) => Math.atan2(fx, fz);

function mark(ctx: CityContext, id: string, x: number, y: number, z: number, height: number) {
  ctx.landmarks.push({ id, position: new THREE.Vector3(x, y, z), height });
}

/** Ruído de valor barato (determinístico) para relevo. */
function noise2(x: number, z: number) {
  const s = Math.sin(x * 0.0123 + z * 0.0071) * 0.5 + Math.sin(x * 0.031 - z * 0.027 + 1.7) * 0.3 + Math.sin(x * 0.083 + z * 0.069 + 4.1) * 0.2;
  return s;
}

// ------------------------------------------------------------ plano

export type LandmarkPlan = {
  land: 1 | -1;
  /** Marco que fecha a avenida (a pista termina numa praça antes dele). */
  end: LandmarkId | null;
  endX: number;
  seaEnd: boolean;
  river: boolean;
  cliff: boolean;
  hills: boolean;
};

const END_MARKS: LandmarkId[] = ["arch", "gate", "colosseum", "congress"];

/** Decide o que fica no fim da avenida, onde há rio, morro e cidade alta (antes de erguer prédios). */
export function planLandmarks(ctx: CityContext): LandmarkPlan {
  const ids = ctx.city.landmarks;
  const L = ctx.avenue.length;
  const open = ctx.avenue.openSide;
  const land: 1 | -1 = open !== 0 ? (-open as 1 | -1) : ctx.variant % 2 === 0 ? 1 : -1;
  const seaEnd = ids.includes("sea") && open === 0;
  let end: LandmarkId | null = END_MARKS.find((id) => ids.includes(id)) ?? null;
  if (!end && !seaEnd && ids.includes("clock-tower")) end = "clock-tower";
  if (!end && !seaEnd && ids.includes("church") && !ids.includes("elevador")) end = "church";
  const endX = end === "congress" ? L + 230 : end === "colosseum" ? L + 135 : end === "arch" ? L + 70 : end === "gate" ? L + 45 : L + 60;
  return {
    land,
    end,
    endX,
    seaEnd,
    river: ids.includes("bridge"),
    cliff: ids.includes("elevador"),
    hills: ids.includes("christ") || ids.includes("sugarloaf"),
  };
}

/** Relevo (morros do Rio, cidade alta de Salvador) e reservas: roda antes dos prédios. */
export function shapeTerrain(ctx: CityContext, plan: LandmarkPlan) {
  const L = ctx.avenue.length;
  const land = plan.land;
  if (plan.hills) {
    // Morros atrás da orla; o mais alto e pontudo é o do Cristo.
    const peaks: Array<{ x: number; z: number; h: number; r: number; sharp: number }> = [];
    const christ = ctx.city.landmarks.includes("christ");
    if (christ) peaks.push({ x: L * 0.55 + 380, z: land * (ctx.frontZ + 470), h: 300, r: 330, sharp: 2.2 });
    const count = ctx.performance ? 5 : 8;
    for (let index = 0; index < count; index += 1) {
      const x = -380 + (index / (count - 1)) * (L + 900) + (ctx.rand() - 0.5) * 80;
      peaks.push({ x, z: land * (ctx.frontZ + 280 + ctx.rand() * 260), h: 70 + ctx.rand() * 150, r: 150 + ctx.rand() * 120, sharp: 1.4 });
    }
    const hill = (x: number, z: number) => {
      let h = 0;
      for (const p of peaks) {
        const d2 = ((x - p.x) * (x - p.x) + (z - p.z) * (z - p.z)) / (p.r * p.r);
        if (d2 < 1) h = Math.max(h, p.h * Math.pow(1 - d2, p.sharp));
      }
      return h > 0.5 ? h * (1 + 0.12 * noise2(x, z)) : 0;
    };
    ctx.terrain.push(hill);
    const zNear = ctx.frontZ + 120;
    const zFar = ctx.frontZ + 900;
    terrainMesh(ctx, -620, L + 1150, land > 0 ? zNear : -zFar, land > 0 ? zFar : -zNear, ctx.performance ? 34 : 24, hill);
    if (christ) {
      const peak = peaks[0];
      ctx.christAt = new THREE.Vector3(peak.x, hill(peak.x, peak.z), peak.z);
    }
    favelas(ctx, peaks.slice(christ ? 1 : 0), hill);
  }
  if (plan.cliff) {
    // Escarpa: cidade baixa na avenida, cidade alta 55 m acima (Salvador).
    const zCliff = ctx.frontZ + 48;
    const height = 55;
    const cliff = (x: number, z: number) => {
      const s = z * land - zCliff - 4 * noise2(x * 3, 0);
      return s <= 0 ? 0 : height * Math.min(1, s / 22);
    };
    ctx.terrain.push(cliff);
    const z0 = zCliff - 6;
    const z1 = zCliff + 30;
    terrainMesh(ctx, -ctx.reach, ctx.avenue.length + ctx.reach, land > 0 ? z0 : -z1, land > 0 ? z1 : -z0, 12, cliff, true);
    // Platô lá em cima.
    const top = tone("#5f5a52");
    if (land > 0) flat(ctx, -ctx.reach, L + ctx.reach, z1, ctx.reach + 400, height, top);
    else flat(ctx, -ctx.reach, L + ctx.reach, -ctx.reach - 400, -z1, height, top);
    ctx.cliff = { z: zCliff, height };
  }
  if (plan.river) {
    const near = ctx.frontZ + 250;
    const far = near + 170;
    ctx.river = { side: land, near, far };
  }
  // Reservas dos marcos (nada de prédio em cima deles).
  const ids = ctx.city.landmarks;
  const front = ctx.frontZ;
  if (plan.end === "arch") reserve(ctx, plan.endX, 0, 80, 80);
  if (plan.end === "gate") reserve(ctx, plan.endX, 0, 40, 80);
  if (plan.end === "colosseum") reserve(ctx, plan.endX, land * 20, 110, 100);
  if (plan.end === "congress") reserve(ctx, plan.endX, 0, 140, 160);
  if (plan.end === "clock-tower" || plan.end === "church") reserve(ctx, plan.endX + 10, 0, 45, 45);
  if (ids.includes("masp")) reserve(ctx, L * 0.5, land * (front + 16), 54, 22);
  if (ids.includes("church") && plan.end !== "church" && !plan.cliff) reserve(ctx, L * 0.32, -land * (front + 32), 30, 34);
  if (ids.includes("cathedral")) reserve(ctx, L * 0.78, -land * (front + 45), 40, 40);
  if (ids.includes("obelisk")) reserve(ctx, L * 0.93, 0, 20, 20);
  if (ids.includes("eiffel")) reserve(ctx, L + 380, land * 360, 90, 90);
  if (ids.includes("clock-tower") && plan.end !== "clock-tower") reserve(ctx, L * 0.82, -land * (front + 70), 22, 22);
  if (ids.includes("windmill")) reserve(ctx, L + 40, -land * (front + 26), 30, 30);
  if (ids.includes("antennas")) reserve(ctx, L * 0.74, land * (front + 150), 18, 18);
  // Sopé das montanhas e o deserto das pirâmides: sem prédio subindo pela encosta.
  if (ids.includes("mountain")) for (const peak of mountainPeaks(ctx, land)) reserve(ctx, peak.x, peak.z, peak.r * 0.8, peak.r * 0.8);
  if (ids.includes("pyramid")) reserve(ctx, L + 640, land * 520, 330, 330);
  if (ids.includes("elevador")) reserve(ctx, L * 0.62, land * (front + 40), 14, 14);
  if (ids.includes("bridge") && ctx.river) {
    const x = L * 0.62 + 160;
    reserve(ctx, x, land * (ctx.river.near + ctx.river.far) / 2, 22, (ctx.river.far - ctx.river.near) / 2 + 190);
  }
}

/** Grade de relevo facetada: só os quadrados que saem do chão viram triângulo. */
function terrainMesh(ctx: CityContext, x0: number, x1: number, z0: number, z1: number, cell: number, height: (x: number, z: number) => number, cliff = false) {
  const nx = Math.ceil((x1 - x0) / cell);
  const nz = Math.max(1, Math.ceil((z1 - z0) / cell));
  const dz = (z1 - z0) / nz;
  const heights: number[] = [];
  for (let j = 0; j <= nz; j += 1) for (let i = 0; i <= nx; i += 1) heights.push(height(x0 + i * cell, z0 + j * dz));
  const forest = [tone("#3e6b35"), tone("#4a7a3c"), tone("#355f2f")];
  const rock = tone("#7d776d");
  const color = new THREE.Color();
  const paint = (x: number, z: number, h: number, slope: number) => {
    if (cliff) return color.copy(slope > 1.2 ? rock : forest[1]).multiplyScalar(0.9 + 0.2 * noise2(x * 5, z * 5));
    const n = noise2(x * 4, z * 4);
    color.copy(forest[(Math.floor((n + 1) * 1.5) + 3) % 3]);
    // Granito exposto nas encostas íngremes (os morros do Rio).
    if (slope > 0.9) color.lerp(rock, Math.min(1, (slope - 0.9) * 1.5));
    if (h > 220) color.lerp(rock, 0.25);
    return color;
  };
  const values = fx(0, 0, 0, 0.75);
  const p = [_a, _b, _c, _d];
  for (let j = 0; j < nz; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const h00 = heights[j * (nx + 1) + i];
      const h10 = heights[j * (nx + 1) + i + 1];
      const h01 = heights[(j + 1) * (nx + 1) + i];
      const h11 = heights[(j + 1) * (nx + 1) + i + 1];
      if (Math.max(h00, h10, h01, h11) < 0.3) continue;
      const xa = x0 + i * cell;
      const za = z0 + j * dz;
      p[0].set(xa, h01 - 0.2, za + dz);
      p[1].set(xa + cell, h11 - 0.2, za + dz);
      p[2].set(xa + cell, h10 - 0.2, za);
      p[3].set(xa, h00 - 0.2, za);
      const slope = Math.max(Math.abs(h10 - h00), Math.abs(h01 - h00), Math.abs(h11 - h10)) / cell;
      const c = paint(xa, za, (h00 + h11) / 2, slope);
      ctx.solid.triangle(p[0], p[1], p[2], c, values);
      ctx.solid.triangle(p[0], p[2], p[3], c, values);
    }
  }
}

/** Casinhas coloridas nas encostas baixas dos morros (à noite viram um tapete de luz). */
function favelas(ctx: CityContext, peaks: Array<{ x: number; z: number; h: number; r: number }>, hill: (x: number, z: number) => number) {
  const rand = ctx.rand;
  const colors = ["#c9744f", "#d9a066", "#b8573f", "#e0c9a6", "#8fa7b5", "#d98b6a", "#a7b38a", "#efe2c8", "#b7684a", "#9c5a43"];
  const clusters = ctx.performance ? 6 : 12;
  const houses = ctx.performance ? 22 : 34;
  // Comunidades em manchas na encosta baixa: casinhas coladas, de tijolo e pintadas.
  for (let cluster = 0; cluster < clusters; cluster += 1) {
    const p = pickOne(rand, peaks);
    const angle = rand() * Math.PI * 2;
    const dist = p.r * between(rand, 0.5, 0.82);
    const cx = p.x + Math.cos(angle) * dist;
    const cz = p.z + Math.sin(angle) * dist;
    for (let index = 0; index < houses; index += 1) {
      const r = 46 * Math.sqrt(rand());
      const a = rand() * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const y = hill(x, z);
      if (y < 3 || y > 110) continue;
      const w = between(rand, 4.5, 7.5);
      const h = 2.9 * (1 + Math.floor(rand() * 3));
      facadeBox(ctx.facade, x, y - 3, z, w, h + 3, between(rand, 4.5, 7), tone(pickOne(rand, colors), (rand() - 0.5) * 0.1), tone("#8a8580"), win(WIN.punched, 2.4, 2.9, Math.floor(rand() * 997), 0.8), rand() * 0.5, -3);
    }
  }
}

// ------------------------------------------------------------ marcos

/** Ergue os marcos da cidade (depois do relevo, antes ou depois dos prédios). */
export function buildLandmarks(ctx: CityContext, plan: LandmarkPlan) {
  const ids = ctx.city.landmarks;
  const L = ctx.avenue.length;
  const land = plan.land;
  const front = ctx.frontZ;
  const half = ctx.avenue.width / 2;
  for (const id of ids) {
    switch (id) {
      case "christ":
        christ(ctx);
        break;
      case "sugarloaf":
        sugarloaf(ctx);
        break;
      case "masp":
        masp(ctx, L * 0.5, land);
        break;
      case "elevador":
        elevador(ctx, L * 0.62, land);
        break;
      case "church":
        if (plan.end === "church") church(ctx, plan.endX + 10, 0, 0, facingAngle(-1, 0), "end");
        else if (plan.cliff && ctx.cliff) church(ctx, L * 0.42, land * (ctx.cliff.z + 34), ctx.cliff.height, facingAngle(0, -land), "side");
        else church(ctx, L * 0.32, -land * (front + 32), 0, facingAngle(0, land), "side");
        break;
      case "congress":
        congress(ctx, plan.endX);
        break;
      case "cathedral":
        cathedral(ctx, L * 0.78, -land * (front + 45));
        break;
      case "obelisk":
        obelisk(ctx, L * 0.93, 0);
        break;
      case "eiffel":
        eiffel(ctx, L + 380, land * 360);
        break;
      case "arch":
        if (plan.end === "arch") arch(ctx, plan.endX, 0);
        else arch(ctx, L + 140, land * (front + 60));
        break;
      case "gate":
        gate(ctx, plan.endX, 0);
        break;
      case "colosseum":
        colosseum(ctx, plan.endX, land * 20);
        break;
      case "clock-tower":
        if (plan.end === "clock-tower") clockTower(ctx, plan.endX + 10, 0, facingAngle(-1, 0), "end");
        else clockTower(ctx, L * 0.82, -land * (front + 70), facingAngle(0, land), "side");
        break;
      case "windmill":
        windmill(ctx, L + 40, -land * (front + 26));
        break;
      case "pyramid":
        pyramids(ctx, L + 470, land * 360);
        break;
      case "mountain":
        mountains(ctx, land);
        break;
      case "bridge":
        bridge(ctx, L * 0.62 + 160, land);
        break;
      case "palms":
        break;
      case "sea":
        if (plan.seaEnd && ctx.seaEndX !== null) mark(ctx, "sea", ctx.seaEndX + 60, 0, 0, 0);
        else if (ctx.avenue.openSide !== 0) mark(ctx, "sea", L * 0.5, 0, ctx.avenue.openSide * (ctx.shoreZ + 60), 0);
        break;
      case "antennas":
        break;
    }
  }
  if (plan.end && plan.end !== "church" && plan.end !== "clock-tower") {
    // Praça no fim da avenida, onde a pista desemboca.
    flat(ctx, plan.endX - 90, plan.endX + 90, -95, 95, 0.02, tone(ctx.spec.plinth, -0.05));
  } else if (plan.end) flat(ctx, plan.endX - 50, plan.endX + 60, -half - 40, half + 40, 0.02, tone(ctx.spec.plinth, -0.05));
  if (ctx.avenue.openSide !== 0) beach(ctx);
}

/** Antenas listradas nos prédios mais altos perto da avenida e uma torre de TV (roda depois dos prédios). */
export function buildAntennas(ctx: CityContext, plan: LandmarkPlan) {
  if (!ctx.city.landmarks.includes("antennas")) return;
  const L = ctx.avenue.length;
  const red = tone("#d8322a");
  const white = tone("#f2f0ea");
  const lamp = tone("#ff3b30");
  const lit = ctx.timeOfDay !== "day";
  const near = ctx.roofs
    .filter((roof) => roof.x > -60 && roof.x < L + 120 && Math.abs(roof.z) < ctx.frontZ + 140)
    .sort((a, b) => b.y - a.y)
    .slice(0, ctx.performance ? 4 : 7);
  const mast = (x: number, y: number, z: number, height: number, width: number, bands: number) => {
    // Gomos alternando vermelho e branco, afinando até o topo.
    for (let index = 0; index < bands; index += 1) {
      const bottom = 1 - (index / bands) * 0.85;
      const top = 1 - ((index + 1) / bands) * 0.85;
      const ratio = Math.round((top / bottom) * 100) / 100;
      ctx.solid.add(SHAPES.taper(ratio, 4), at(x, y + (height * index) / bands, z, width * bottom, height / bands, width * bottom, Math.PI / 4), index % 2 ? white : red, fx(0.25));
    }
    ctx.solid.add(SHAPES.cube(), at(x, y + height + 0.4, z, 0.8, 0.8, 0.8), lamp, fx(2.5, ctx.rand() + 0.01));
    if (lit) ctx.halos.add(x, y + height + 0.5, z, lamp, 5, ctx.rand() + 0.01);
  };
  for (const roof of near) mast(roof.x, roof.y, roof.z, between(ctx.rand, 18, 34), 2.2, 6);
  // Torre de TV de treliça (a da Paulista), com plataformas.
  const x = L * 0.74;
  const z = plan.land * (ctx.frontZ + 150);
  mast(x, 0, z, 150, 14, 10);
  for (const y of [70, 100]) ctx.solid.add(SHAPES.box(), at(x, y, z, 12, 2.5, 12, Math.PI / 4), white, fx(0.4));
  mark(ctx, "antennas", x, 0, z, 150);
}

// ------------------------------------------------------- Rio de Janeiro

function christ(ctx: CityContext) {
  const top = ctx.christAt;
  if (!top) return;
  const stone = tone("#ece6da");
  const values = fx(1.1, 0, 0, 0.32);
  const { x, z } = top;
  const y = top.y - 2;
  // De frente para a avenida: os braços abertos aparecem inteiros para quem está nela.
  const theta = Math.atan2(ctx.avenue.length * 0.4 - x, -z);
  // Escala 1,6: precisa ser lido a quase um quilômetro.
  ctx.solid.add(SHAPES.box(), at(x, y, z, 10, 12, 10, theta), stone, values);
  ctx.solid.add(SHAPES.taper(0.62, 8), at(x, y + 12, z, 8, 30, 7, theta), stone, values);
  ctx.solid.add(SHAPES.box(), at(x, y + 38, z, 7.5, 5, 5, theta), stone, values);
  ctx.solid.add(SHAPES.cube(), at(x, y + 40.5, z, 46, 3.6, 3.6, theta), stone, values);
  ctx.solid.add(SHAPES.ico(1), at(x, y + 45.5, z, 2.6, 3, 2.6), stone, values);
  if (ctx.timeOfDay !== "day") ctx.halos.add(x, y + 32, z, tone("#cfe0ff"), 70);
  mark(ctx, "christ", x, y + 12, z, 36);
}

/** Pão de Açúcar e Urca no mar, com o fio do bondinho e uma cabine indo e vindo. */
function sugarloaf(ctx: CityContext) {
  const open = ctx.avenue.openSide || 1;
  const L = ctx.avenue.length;
  const big = new THREE.Vector3(L + 330, 0, open * (ctx.shoreZ + 210));
  const small = new THREE.Vector3(L + 175, 0, open * (ctx.shoreZ + 120));
  const rock = tone("#857d72");
  const green = tone("#46703a");
  const paintRock = (height: number) => (world: THREE.Vector3, _n: THREE.Vector3, color: THREE.Color, _v: number[], localPoint: THREE.Vector3) => {
    const k = Math.sin(localPoint.x * 9.1 + localPoint.z * 7.3) * 0.5 + 0.5;
    world.x += (k - 0.5) * 6;
    world.z += (Math.cos(localPoint.y * 8.3) - 0.5) * 5;
    color.copy(world.y < height * 0.3 + k * 25 ? green : rock).multiplyScalar(0.88 + k * 0.2);
  };
  const values = fx(0, 0, 0, 0.55);
  ctx.solid.add(SHAPES.ico(2), at(big.x, -6, big.z, 95, 250, 120, 0.4, 0, 0.12), rock, values, paintRock(250));
  ctx.solid.add(SHAPES.ico(2), at(small.x, -6, small.z, 130, 135, 120, 0.9), rock, values, paintRock(135));
  // Fio do bondinho: da praia ao Urca e do Urca ao Pão de Açúcar.
  const station = new THREE.Vector3(L + 70, 6, open * (ctx.shoreZ - 20));
  const urcaTop = new THREE.Vector3(small.x - 10, 128, small.z);
  const sugarTop = new THREE.Vector3(big.x - 12, 236, big.z);
  const cable = tone("#3a3a3a");
  ctx.solid.add(SHAPES.box(), along(station, urcaTop, 0.5), cable, fx(0, 0, 0, 0.6));
  ctx.solid.add(SHAPES.box(), along(urcaTop, sugarTop, 0.5), cable, fx(0, 0, 0, 0.6));
  // Cabine: malha própria (anda sozinha no fio).
  const cabin = new MeshBuilder([{ name: "aFx", size: 4 }], false, false);
  cabin.add(SHAPES.cube(), at(0, -3.5, 0, 5, 3.2, 3.2), tone("#e8e2d0"), fx(0.8, 0, 0, 0.6));
  cabin.add(SHAPES.cube(), at(0, -1.2, 0, 0.3, 2.6, 0.3), cable, fx(0, 0, 0, 0.6));
  const mesh = new THREE.Mesh(cabin.build());
  mesh.name = "parade-cablecar";
  ctx.movers.push(mesh);
  const position = new THREE.Vector3();
  ctx.tickers.push((time) => {
    const t = (Math.sin(time * 0.09) + 1) / 2;
    position.lerpVectors(urcaTop, sugarTop, t);
    mesh.position.copy(position);
  });
  mark(ctx, "sugarloaf", big.x, 0, big.z, 250);
}

/** Orla: coqueiros na areia, quiosques, guarda-sóis (de dia) e postos de salva-vidas. */
function beach(ctx: CityContext) {
  const { rand, avenue } = ctx;
  const s = avenue.openSide;
  const L = avenue.length;
  const zSand = avenue.width / 2 + avenue.crowdDepth + 1;
  const shore = ctx.shoreZ;
  const step = ctx.performance ? 22 : 13;
  for (let x = -400 + rand() * 6; x < L + 500; x += step + rand() * 4) palm(ctx, rand, x, s * (zSand + 3 + rand() * 2), 9 + rand() * 5, 0.05);
  const kiosk = tone("#f4efe4");
  const roof = tone("#2f7d6b");
  for (let x = -200; x < L + 300; x += 85) {
    const z = s * (zSand + 9);
    ctx.solid.add(SHAPES.box(), at(x, 0, z, 4, 2.6, 3.2), kiosk, fx(0.6));
    ctx.solid.add(SHAPES.frustum(0.2), at(x, 2.6, z, 5.2, 1.3, 4.4), roof, FX_PLAIN);
    if (ctx.timeOfDay !== "day") ctx.halos.add(x, 2.8, z, tone("#ffcf8a"), 4);
  }
  // Postos de salva-vidas: torrinha sobre pernas.
  for (let x = -100; x < L + 200; x += 190) {
    const z = s * (shore - 18);
    ctx.solid.add(SHAPES.box(), at(x, 0, z, 0.4, 4, 0.4), kiosk, FX_PLAIN);
    ctx.solid.add(SHAPES.box(), at(x, 4, z, 3.4, 2.4, 3.4), kiosk, fx(0.5));
    ctx.solid.add(SHAPES.pyramid(), at(x, 6.4, z, 3.8, 1.2, 3.8), tone("#d33f2f"), FX_PLAIN);
  }
  if (ctx.timeOfDay === "day" || ctx.timeOfDay === "sunset") {
    const tints = ["#e8423a", "#f6c33b", "#2f8ad6", "#f2f2f2", "#3fae5a", "#ef7a2f", "#a64fc4"];
    const count = ctx.performance ? 40 : 110;
    for (let index = 0; index < count; index += 1) {
      const x = -150 + rand() * (L + 300);
      const z = s * between(rand, zSand + 16, shore - 10);
      ctx.solid.add(SHAPES.box(), at(x, 0, z, 0.08, 2.1, 0.08), kiosk, FX_PLAIN);
      ctx.solid.add(SHAPES.cone8(), at(x, 1.7, z, 2.6, 0.7, 2.6), tone(pickOne(rand, tints)), FX_PLAIN);
    }
  }
}

// ------------------------------------------------------------ São Paulo

function masp(ctx: CityContext, x: number, side: 1 | -1) {
  const red = tone("#d42a2a");
  const values = fx(0.8);
  const z = side * (ctx.frontZ + 16);
  // Caixa de vidro escuro suspensa a 8 m entre quatro pilares, com as vigas
  // vermelhas por cima e por baixo: o "vão livre" da Paulista.
  facadeBox(ctx.facade, x, 9, z, 72, 12, 29, tone("#3f4448"), tone("#55585b"), win(WIN.glass, 3.6, 3.4, 77));
  for (const dx of [-37.5, 37.5]) {
    for (const dz of [-15.5, 15.5]) ctx.solid.add(SHAPES.box(), at(x + dx, 0, z + dz, 3.4, 25, 3.4), red, values);
    ctx.solid.add(SHAPES.box(), at(x + dx, 21, z, 3.4, 4, 34.4), red, values);
  }
  for (const dz of [-15.5, 15.5]) {
    ctx.solid.add(SHAPES.box(), at(x, 21, z + dz, 78.4, 4, 3.4), red, values);
    ctx.solid.add(SHAPES.box(), at(x, 7.4, z + dz, 75, 1.8, 2), red, values);
  }
  // Vão livre: praça de concreto.
  flat(ctx, x - 44, x + 44, z - 20, z + 20, 0.12, tone("#b9b5ad"));
  mark(ctx, "masp", x, 0, z, 25);
}

// -------------------------------------------------------------- Salvador

function elevador(ctx: CityContext, x: number, side: 1 | -1) {
  const cliff = ctx.cliff;
  const top = cliff ? cliff.height : 55;
  const zCliff = cliff ? cliff.z : ctx.frontZ + 48;
  const z = side * (zCliff - 7);
  const cream = tone("#efe6d0");
  const values = fx(0.9);
  // Torre art déco com nervuras, casa de máquinas no alto e passarela até o platô.
  facadeBox(ctx.facade, x, 0, z, 12, top + 14, 16, cream, tone("#c9bfa9"), win(WIN.gothic, 2.4, 6, 31));
  ctx.solid.add(SHAPES.box(), at(x, top + 14, z, 13, 2, 17), tone("#d8cfb9"), values);
  const deck = new THREE.Vector3(x, top - 1, z + side * 8);
  const edge = new THREE.Vector3(x, top - 1, side * (zCliff + 26));
  ctx.solid.add(SHAPES.box(), along(deck, edge, 6, 3, 0), cream, values);
  ctx.solid.add(SHAPES.box(), at(x, top - 2, side * (zCliff + 30), 18, 10, 12), cream, values);
  if (ctx.timeOfDay !== "day") ctx.halos.add(x, top + 10, z, tone("#ffd28a"), 18);
  mark(ctx, "elevador", x, 0, z, top + 16);
}

// ---------------------------------------------------------------- igrejas

function church(ctx: CityContext, x: number, z: number, y: number, theta: number, where: "end" | "side") {
  const style = ctx.city.style;
  const kind = ctx.city.id === "roma" ? "dome" : style === "european" ? "gothic" : "baroque";
  const rand = ctx.rand;
  const place = (lx: number, lz: number) => local(x, z, theta, lx, lz);
  const wallColor = kind === "gothic" ? tone("#c9c0b0") : kind === "dome" ? tone("#e9d6b4") : tone("#f4f1e8");
  const trim = kind === "baroque" ? tone(pickOne(rand, ["#e3b84a", "#4f7fb8", "#c9cfd6"])) : wallColor.clone().multiplyScalar(0.85);
  const glow = fx(0.9);
  const scale = where === "end" ? 1.25 : 1;
  const s = scale;
  // Nave atrás, fachada com frontão e as torres na frente.
  {
    const [nx, nz] = place(0, -16 * s);
    facadeBox(ctx.facade, nx, y, nz, 18 * s, 17 * s, 40 * s, wallColor, null, win(WIN.colonial, 6, 7, 5), theta);
    ctx.facade.add(SHAPES.gable(), at(nx, y + 17 * s, nz, 40 * s + 1, 7 * s, 19 * s, theta + Math.PI / 2), tone("#a9553a"), WIN_ROOF);
  }
  {
    const [fx0, fz0] = place(0, 5 * s);
    facadeBox(ctx.facade, fx0, y, fz0, 22 * s, 22 * s, 5 * s, wallColor, wallColor.clone().multiplyScalar(0.9), win(WIN.colonial, 5.5 * s, 7 * s, 9), theta);
    ctx.solid.add(SHAPES.gable(), at(fx0, y + 22 * s, fz0, 15 * s, 5 * s, 4 * s, theta), wallColor, glow);
    const [rx, rz] = place(0, 7.6 * s);
    ctx.solid.add(SHAPES.cyl16(), at(rx, y + 15 * s, rz, 3.6 * s, 0.4, 3.6 * s, theta, Math.PI / 2), tone("#f1d38a"), fx(1.6));
  }
  const towerH = (kind === "gothic" ? 44 : 34) * s;
  for (const sx of [-1, 1]) {
    const [tx, tz] = place(sx * 13 * s, 5 * s);
    facadeBox(ctx.facade, tx, y, tz, 7 * s, towerH, 7 * s, wallColor, null, win(WIN.gothic, 3.5 * s, 8 * s, 13), theta);
    ctx.solid.add(SHAPES.box(), at(tx, y + towerH - 0.5, tz, 7.6 * s, 1.2, 7.6 * s, theta), trim, glow);
    if (kind === "gothic") ctx.solid.add(SHAPES.taper(0.02, 8), at(tx, y + towerH + 0.7, tz, 7 * s, 26 * s, 7 * s, theta), tone("#8a8478"), glow);
    else if (kind === "baroque") {
      ctx.solid.add(SHAPES.dome(), at(tx, y + towerH + 0.7, tz, 3.4 * s, 4.5 * s, 3.4 * s), trim, glow);
      ctx.solid.add(SHAPES.taper(0.1, 6), at(tx, y + towerH + 4.5 * s, tz, 1.2, 5 * s, 1.2), trim, glow);
    } else ctx.solid.add(SHAPES.pyramid(), at(tx, y + towerH + 0.7, tz, 7 * s, 6 * s, 7 * s, theta), tone("#a9553a"), glow);
  }
  if (kind === "dome") {
    const [dx, dz] = place(0, -18 * s);
    ctx.solid.add(SHAPES.cyl16(), at(dx, y + 17 * s, dz, 20 * s, 9 * s, 20 * s), wallColor, glow);
    ctx.solid.add(SHAPES.dome(), at(dx, y + 26 * s, dz, 10.5 * s, 14 * s, 10.5 * s), tone("#8fa0a6"), glow);
    ctx.solid.add(SHAPES.cyl8(), at(dx, y + 39 * s, dz, 3 * s, 6 * s, 3 * s), wallColor, glow);
  }
  // Largo na frente.
  const [px, pz] = place(0, 26 * s);
  if (where === "side") flat(ctx, Math.min(px, x) - 24, Math.max(px, x) + 24, Math.min(pz, z) - 22, Math.max(pz, z) + 22, y + 0.1, tone(ctx.spec.plinth, 0.05));
  mark(ctx, "church", x, y, z, towerH + (kind === "gothic" ? 26 * s : 8 * s));
}

// --------------------------------------------------------------- Brasília

function congress(ctx: CityContext, x: number) {
  const white = tone("#f4f4f0");
  const values = fx(0.85);
  // Plataforma baixa, as duas torres em H, a cúpula do Senado e a cuia da Câmara.
  facadeBox(ctx.facade, x, 0, 0, 70, 12, 220, white, tone("#e6e6e2"), win(WIN.ribbon, 3.4, 4, 3));
  for (const dz of [-12, 12]) facadeBox(ctx.facade, x + 45, 0, dz, 13, 100, 18, tone("#eef0ee"), white, win(WIN.ribbon, 3.4, 3.4, 4 + dz), 0);
  ctx.solid.add(SHAPES.box(), at(x + 45, 50, 0, 10, 7, 8), white, values);
  ctx.solid.add(SHAPES.dome(), at(x, 12, -55, 20, 16, 20), white, values);
  ctx.solid.add(SHAPES.cyl16(), at(x, 12, 55, 7, 3, 7), white, values);
  ctx.solid.add(SHAPES.bowl(), at(x, 13, 55, 32, 13, 32), white, values);
  // Espelho d'água na frente.
  flat(ctx, x - 60, x - 38, -110, 110, 0.06, tone("#3c6f8a"), fx(0.3));
  mark(ctx, "congress", x + 20, 0, 0, 100);
}

function cathedral(ctx: CityContext, x: number, z: number) {
  const white = tone("#f2f2ee");
  const glassColor = tone("#6f9fc6");
  const values = fx(0.9);
  const radius = (y: number) => (y < 13 ? 11 + 19 * Math.pow((13 - y) / 13, 2) : 11 + 11 * Math.pow((y - 13) / 27, 2));
  const pillars = 16;
  const heights = [0, 5, 10, 15, 22, 30, 40];
  for (let index = 0; index < pillars; index += 1) {
    const angle = (index / pillars) * Math.PI * 2;
    const point = (y: number, out: THREE.Vector3) => out.set(x + Math.cos(angle) * radius(y), y, z + Math.sin(angle) * radius(y));
    for (let k = 0; k + 1 < heights.length; k += 1) {
      point(heights[k], _a);
      point(heights[k + 1], _b);
      const width = 2.4 - k * 0.25;
      ctx.solid.add(SHAPES.box(), along(_a.clone(), _b.clone(), width, width * 0.6, angle), white, values);
    }
  }
  // Vitral azul por dentro dos pilares.
  const glass = shape("cathedral-glass", () => {
    const profile: THREE.Vector2[] = [];
    for (let y = 0; y <= 36; y += 4) profile.push(new THREE.Vector2(radius(y) - 0.9, y));
    return new THREE.LatheGeometry(profile, 16);
  });
  ctx.solid.add(glass, at(x, 0, z), glassColor, fx(1.2));
  // Campanário: haste fina com sinos.
  ctx.solid.add(SHAPES.box(), at(x + 34, 0, z + 10, 1.2, 20, 4), white, values);
  ctx.solid.add(SHAPES.box(), at(x + 34, 18, z + 10, 6, 1, 4), white, values);
  flat(ctx, x - 45, x + 45, z - 45, z + 45, 0.1, tone("#d9d6cf"));
  mark(ctx, "cathedral", x, 0, z, 40);
}

// ---------------------------------------------------------- Buenos Aires

function obelisk(ctx: CityContext, x: number, z: number) {
  const white = tone("#f3f1ea");
  const values = fx(1.1);
  flat(ctx, x - 16, x + 16, z - 16, z + 16, 0.14, tone("#6f9a4c"));
  ctx.solid.add(SHAPES.box(), at(x, 0, z, 10, 1.4, 10), tone("#d8d4ca"), values);
  ctx.solid.add(SHAPES.taper(0.62, 4), at(x, 1.4, z, 9.6, 62, 9.6, Math.PI / 4), white, values);
  ctx.solid.add(SHAPES.pyramid(), at(x, 63.4, z, 4.2, 5, 4.2), white, values);
  mark(ctx, "obelisk", x, 0, z, 68);
}

// ------------------------------------------------------------------ Paris

function eiffel(ctx: CityContext, x: number, z: number) {
  const iron = tone("#76522f");
  const values = fx(5.5, 0, 0, 0.6);
  // Pernas curvas em quatro trechos até o segundo andar.
  const levels = [0, 26, 48, 72, 98];
  const offsets = [46, 36, 28, 20, 12];
  const widths = [10, 8.5, 7, 6, 5];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (let k = 0; k + 1 < levels.length; k += 1) {
        _a.set(x + sx * offsets[k], levels[k], z + sz * offsets[k]);
        _b.set(x + sx * offsets[k + 1], levels[k + 1], z + sz * offsets[k + 1]);
        ctx.solid.add(SHAPES.box(), along(_a.clone(), _b.clone(), widths[k], widths[k], Math.PI / 4), iron, values);
        // Travamento em X na face de fora (lê como treliça de longe).
        if (k < 3) {
          const mid = _a.clone().lerp(_b, 0.5);
          ctx.solid.add(SHAPES.box(), along(new THREE.Vector3(x + sx * offsets[k], levels[k], z), mid.clone().setZ(z + sz * offsets[k] * 0.5), 0.9), iron, values);
        }
      }
    }
  }
  // Arcos entre as pernas na base.
  for (let face = 0; face < 4; face += 1) {
    const theta = (face * Math.PI) / 2;
    for (let k = 0; k < 6; k += 1) {
      const a0 = Math.PI * (0.12 + (k / 6) * 0.76);
      const a1 = Math.PI * (0.12 + ((k + 1) / 6) * 0.76);
      const [x0, z0] = local(x, z, theta, Math.cos(a0) * 34, 42);
      const [x1, z1] = local(x, z, theta, Math.cos(a1) * 34, 42);
      ctx.solid.add(SHAPES.box(), along(new THREE.Vector3(x0, 6 + Math.sin(a0) * 30, z0), new THREE.Vector3(x1, 6 + Math.sin(a1) * 30, z1), 1.6), iron, values);
    }
  }
  ctx.solid.add(SHAPES.box(), at(x, 46, z, 66, 4, 66), iron, values);
  ctx.solid.add(SHAPES.box(), at(x, 96, z, 30, 3, 30), iron, values);
  ctx.solid.add(SHAPES.taper(0.16, 4), at(x, 99, z, 30, 128, 30, Math.PI / 4), iron, values);
  ctx.solid.add(SHAPES.box(), at(x, 222, z, 7, 5, 7), iron, values);
  ctx.solid.add(SHAPES.cyl6(), at(x, 227, z, 1.2, 16, 1.2), iron, values);
  flat(ctx, x - 70, x + 70, z - 70, z + 70, 0.1, tone("#7b9c56"));
  if (ctx.timeOfDay !== "day") {
    // Cintilância da torre (aquela das horas cheias) e o farol no alto.
    const sparkle = tone("#fff6e0");
    for (let index = 0; index < (ctx.performance ? 40 : 90); index += 1) {
      const y = ctx.rand() * 225;
      const spread = y < 98 ? 46 - y * 0.35 : 15 * (1 - (y - 98) / 140);
      ctx.halos.add(x + (ctx.rand() - 0.5) * 2 * spread, y, z + (ctx.rand() - 0.5) * 2 * spread, sparkle, 2.2, -(1 + index));
    }
    ctx.halos.add(x, 232, z, tone("#ffe7b0"), 14);
  }
  mark(ctx, "eiffel", x, 0, z, 243);
}

function arch(ctx: CityContext, x: number, z: number) {
  const stone = tone("#e7dcc4");
  const values = fx(1.1);
  const body = shape("arch", () => {
    const outline = new THREE.Shape();
    outline.moveTo(-22.5, 0);
    outline.lineTo(-7.5, 0);
    outline.lineTo(-7.5, 21);
    outline.absarc(0, 21, 7.5, Math.PI, 0, true);
    outline.lineTo(7.5, 0);
    outline.lineTo(22.5, 0);
    outline.lineTo(22.5, 50);
    outline.lineTo(-22.5, 50);
    outline.lineTo(-22.5, 0);
    const geometry = new THREE.ExtrudeGeometry(outline, { depth: 22, bevelEnabled: false, curveSegments: 10 });
    geometry.translate(0, 0, -11);
    geometry.rotateY(Math.PI / 2);
    return geometry;
  }, true);
  ctx.solid.add(body, at(x, 0, z), stone, values);
  ctx.solid.add(SHAPES.box(), at(x, 41.5, z, 24, 2.2, 47), stone.clone().multiplyScalar(0.92), values);
  ctx.solid.add(SHAPES.box(), at(x, 50, z, 23, 1.4, 46), stone.clone().multiplyScalar(0.9), values);
  // Rotatória em volta.
  flat(ctx, x - 26, x + 26, z - 26, z + 26, 0.15, tone("#cfc8b8"));
  mark(ctx, "arch", x, 0, z, 51);
}

// ----------------------------------------------------------------- Berlim

function gate(ctx: CityContext, x: number, z: number) {
  const stone = tone("#e2d5b8");
  const copper = tone("#4f8a72");
  const values = fx(1);
  // Um terço maior que o de verdade: precisa ler no fim da avenida, atrás do trio.
  const s = 1.35;
  const p = (lx: number, ly: number, lz: number) => new THREE.Vector3(x + lx * s, ly * s, z + lz * s);
  const box = (lx: number, ly: number, lz: number, w: number, h: number, d: number, color: THREE.Color) =>
    ctx.solid.add(SHAPES.box(), at(x + lx * s, ly * s, z + lz * s, w * s, h * s, d * s), color, values);
  // Doze colunas dóricas em duas fileiras, entablamento, ático e a quadriga.
  for (const dx of [-4.5, 4.5]) {
    for (let k = 0; k < 6; k += 1) ctx.solid.add(SHAPES.cyl8(), at(x + dx * s, 0, z + (-27 + k * 10.8) * s, 2 * s, 15 * s, 2 * s), stone, values);
  }
  box(0, 15, 0, 12, 4, 62, stone);
  box(0, 19, 0, 10, 4.5, 30, stone);
  ctx.solid.add(SHAPES.gable(), at(x, 23.5 * s, z, 30 * s, 2.5 * s, 10 * s, Math.PI / 2), stone, values);
  // Quadriga: carro, quatro cavalos (corpo + pescoço) e a deusa.
  box(1.5, 23.5, 0, 3, 2.4, 3.6, copper);
  for (let k = 0; k < 4; k += 1) {
    const hz = -3 + k * 2;
    box(-2.5, 24.6, hz, 3.4, 1.4, 0.9, copper);
    ctx.solid.add(SHAPES.box(), along(p(-3.8, 25.6, hz), p(-4.8, 27.6, hz), 0.7 * s), copper, values);
    for (const lx of [-3.8, -1.2]) box(lx, 23.5, hz, 0.4, 1.2, 0.4, copper);
  }
  box(1.5, 25.9, 0, 0.9, 3.4, 0.9, copper);
  box(1.5, 29.3, 0, 0.25, 2.6, 1.6, copper);
  // Alas laterais.
  for (const side of [-1, 1]) facadeBox(ctx.facade, x, 0, z + side * 40 * s, 12 * s, 13 * s, 14 * s, stone, stone.clone().multiplyScalar(0.9), win(WIN.european, 3, 4.3, 17));
  mark(ctx, "gate", x, 0, z, 31 * s);
}

// ----------------------------------------------------------------- Roma

function colosseum(ctx: CityContext, cx: number, cz: number) {
  const stone = tone("#d8c7a3");
  const inner = tone("#b8a684");
  const a = 82;
  const b = 68;
  const segments = ctx.performance ? 40 : 56;
  const full = 48;
  const broken = 36;
  const arcade = win(WIN.arcade, 6.6, 12, 21, 0.9);
  const top = (theta: number) => {
    // Lado sul sem o último anel, com degraus quebrados nas pontas.
    const t = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (t > 3.6 && t < 5.4) {
      const edge = Math.min(t - 3.6, 5.4 - t);
      return edge < 0.25 ? broken + 12 * (1 - edge / 0.25) * (Math.sin(t * 40) > 0 ? 1 : 0.6) : broken + Math.sin(t * 23) * 2;
    }
    return full;
  };
  const point = (theta: number, scale: number, y: number, out: THREE.Vector3) => out.set(cx + Math.cos(theta) * a * scale, y, cz + Math.sin(theta) * b * scale);
  let u = 0;
  const thick = 0.93;
  const values = fx(0.6);
  for (let index = 0; index < segments; index += 1) {
    const t0 = (index / segments) * Math.PI * 2;
    const t1 = ((index + 1) / segments) * Math.PI * 2;
    const h = top((t0 + t1) / 2);
    const p0 = point(t0, 1, 0, new THREE.Vector3());
    const p1 = point(t1, 1, 0, new THREE.Vector3());
    const length = p0.distanceTo(p1);
    // Parede de fora (arcadas no shader), parede de dentro e o topo.
    ctx.facade.quad(_a.copy(p1), _b.copy(p0), _c.copy(p0).setY(h), _d.copy(p1).setY(h), stone, arcade, [u + length, 0, u, h]);
    const q0 = point(t0, thick, 0, new THREE.Vector3());
    const q1 = point(t1, thick, 0, new THREE.Vector3());
    ctx.facade.quad(_a.copy(q0), _b.copy(q1), _c.copy(q1).setY(h), _d.copy(q0).setY(h), inner, win(WIN.arcade, 6.2, 12, 23, 0.9), [u, 0, u + length, h]);
    ctx.solid.quad(_a.copy(q0).setY(h), _b.copy(q1).setY(h), _c.copy(p1).setY(h), _d.copy(p0).setY(h), stone, values);
    // Arquibancada em degraus até a arena.
    const r0 = point(t0, 0.55, 5, new THREE.Vector3());
    const r1 = point(t1, 0.55, 5, new THREE.Vector3());
    ctx.solid.quad(_a.copy(r0), _b.copy(r1), _c.copy(q1).setY(Math.min(h, 34)), _d.copy(q0).setY(Math.min(h, 34)), inner, values);
    ctx.solid.quad(_a.copy(r1), _b.copy(r0), _c.copy(r0).setY(0), _d.copy(r1).setY(0), inner.clone().multiplyScalar(0.8), values);
    u += length;
  }
  ctx.solid.add(SHAPES.disc(), at(cx, 0.6, cz, a * 1.1, 1, b * 1.1), tone("#cdb894"), FX_PLAIN);
  if (ctx.timeOfDay !== "day") ctx.halos.add(cx, 30, cz, tone("#ffb86a"), 110);
  mark(ctx, "colosseum", cx, 0, cz, full);
}

// ------------------------------------------------------------- Londres

function clockTower(ctx: CityContext, x: number, z: number, theta: number, where: "end" | "side") {
  const gold = tone("#cdb27a");
  const values = fx(1.1);
  const s = where === "end" ? 1.15 : 1;
  const shaft = 56 * s;
  facadeBox(ctx.facade, x, 0, z, 12 * s, shaft, 12 * s, gold, null, win(WIN.gothic, 2.4 * s, 5 * s, 41), theta);
  // Andar do relógio, mais largo, com os quatro mostradores acesos.
  ctx.solid.add(SHAPES.box(), at(x, shaft, z, 13.6 * s, 14 * s, 13.6 * s, theta), gold, values);
  const face = tone("#f6efd8");
  const hands = tone("#1f1f1f");
  for (let k = 0; k < 4; k += 1) {
    const angle = theta + (k * Math.PI) / 2;
    const [fxp, fzp] = local(x, z, angle, 0, 6.9 * s);
    ctx.solid.add(SHAPES.cyl16(), at(fxp, shaft + 7 * s, fzp, 9 * s, 0.3, 9 * s, angle, Math.PI / 2), face, fx(2.2));
    const [hx, hz] = local(x, z, angle, 0, 7.1 * s);
    ctx.solid.add(SHAPES.box(), at(hx, shaft + 7 * s, hz, 0.35, 3.6 * s, 0.2, angle, 0, 0.6), hands, FX_PLAIN);
    ctx.solid.add(SHAPES.box(), at(hx, shaft + 7 * s, hz, 0.4, 2.6 * s, 0.2, angle, 0, -2.1), hands, FX_PLAIN);
    if (ctx.timeOfDay !== "day") ctx.halos.add(fxp, shaft + 7 * s, fzp, tone("#fff2c4"), 11 * s);
  }
  ctx.solid.add(SHAPES.box(), at(x, shaft + 14 * s, z, 12 * s, 7 * s, 12 * s, theta), gold.clone().multiplyScalar(0.92), values);
  ctx.solid.add(SHAPES.pyramid(), at(x, shaft + 21 * s, z, 12.5 * s, 18 * s, 12.5 * s, theta), tone("#4f5a62"), values);
  for (const [lx, lz] of [[-5.4, -5.4], [5.4, -5.4], [-5.4, 5.4], [5.4, 5.4]]) {
    const [px, pz] = local(x, z, theta, lx * s, lz * s);
    ctx.solid.add(SHAPES.taper(0.05, 6), at(px, shaft + 21 * s, pz, 1.6, 7 * s, 1.6), gold, values);
  }
  ctx.solid.add(SHAPES.cyl6(), at(x, shaft + 39 * s, z, 0.5, 6 * s, 0.5), gold, values);
  mark(ctx, "clock-tower", x, 0, z, shaft + 45 * s);
}

// ---------------------------------------------------------------- Amsterdã

function windmill(ctx: CityContext, x: number, z: number) {
  const body = tone("#3f4f45");
  const values = fx(0.6);
  const s = 1.6;
  flat(ctx, x - 28, x + 28, z - 28, z + 28, 0.12, tone("#6e9a4a"));
  ctx.solid.add(SHAPES.cyl16(), at(x, 0, z, 16 * s, 3, 16 * s), tone("#6e9a4a"), FX_PLAIN);
  ctx.solid.add(SHAPES.taper(0.62, 8), at(x, 3, z, 11 * s, 16 * s, 11 * s), body, values);
  ctx.solid.add(SHAPES.cyl16(), at(x, 3 + 5 * s, z, 14 * s, 0.4, 14 * s), tone("#e8e2d2"), values);
  ctx.solid.add(SHAPES.dome(), at(x, 3 + 16 * s, z, 4 * s, 4 * s, 4 * s), tone("#2b3530"), values);
  // Pás: malha própria girando em volta do eixo (virado para a avenida).
  const hub = new THREE.Vector3(x - 5 * s, 3 + 18 * s, z);
  const sails = new MeshBuilder([{ name: "aFx", size: 4 }], false, false);
  const cloth = tone("#f1ece0");
  const wood = tone("#5a4535");
  for (let k = 0; k < 4; k += 1) {
    const angle = (k * Math.PI) / 2;
    const dir = new THREE.Vector3(0, Math.cos(angle), Math.sin(angle));
    const side = new THREE.Vector3(0, -Math.sin(angle), Math.cos(angle));
    sails.add(SHAPES.box(), along(new THREE.Vector3(), dir.clone().multiplyScalar(14 * s), 0.6, 0.6), wood, FX_PLAIN);
    const p0 = dir.clone().multiplyScalar(3 * s);
    const p1 = dir.clone().multiplyScalar(14 * s);
    const w = side.clone().multiplyScalar(2.6 * s);
    sails.quad(p0.clone(), p1.clone(), p1.clone().add(w), p0.clone().add(w), cloth, values);
    sails.quad(p0.clone().add(w), p1.clone().add(w), p1.clone(), p0.clone(), cloth, values);
  }
  sails.add(SHAPES.cube(), at(0, 0, 0, 2, 1.4, 1.4), wood, FX_PLAIN);
  const mesh = new THREE.Mesh(sails.build());
  mesh.name = "parade-windmill";
  mesh.position.copy(hub);
  ctx.movers.push(mesh);
  ctx.tickers.push((time) => {
    mesh.rotation.x = time * 0.9;
  });
  mark(ctx, "windmill", x, 0, z, 3 + 24 * s);
}

// ---------------------------------------------------------------- horizonte

function pyramids(ctx: CityContext, x: number, z: number) {
  const sand = tone("#d8b878");
  const values = fx(0.5, 0, 0, 0.35);
  ctx.solid.add(SHAPES.disc(), at(x, 0.05, z, 900, 1, 900), tone("#d2b884"), fx(0, 0, 0, 0.6));
  ctx.solid.add(SHAPES.pyramid(), at(x, 0, z, 230, 146, 230, 0.35), sand, values);
  ctx.solid.add(SHAPES.pyramid(), at(x + 190, 0, z + Math.sign(z) * 170, 214, 136, 214, 0.35), sand.clone().multiplyScalar(0.95), values);
  ctx.solid.add(SHAPES.pyramid(), at(x + 330, 0, z + Math.sign(z) * 300, 104, 65, 104, 0.35), sand.clone().multiplyScalar(0.92), values);
  if (ctx.timeOfDay !== "day") ctx.halos.add(x, 60, z, tone("#ffd29a"), 160);
  mark(ctx, "pyramid", x, 0, z, 146);
}

/** Picos do horizonte (vulcão, ou a cordilheira em Munique), em coordenadas do mundo. */
function mountainPeaks(ctx: CityContext, land: 1 | -1) {
  const L = ctx.avenue.length;
  const x = L + 820;
  const z = land * 430;
  if (ctx.city.id === "munique") return [0, 1, 2, 3, 4].map((k) => ({ x: x + 80 + (k % 2) * 70, z: (k - 2) * 240 + land * 120, h: 190 + ((k * 73) % 5) * 34, r: 270 }));
  const peaks = [{ x, z, h: 360, r: 520 }];
  if (ctx.city.id === "cidade-do-mexico") peaks.push({ x: x + 180, z: z + land * 420, h: 250, r: 420 });
  return peaks;
}

function mountains(ctx: CityContext, land: 1 | -1) {
  const peaks = mountainPeaks(ctx, land);
  const rock = tone(ctx.city.id === "munique" ? "#7d8796" : "#6f7884");
  const snow = tone("#f3f6fa");
  const values = fx(0, 0, 0, ctx.city.id === "munique" ? 0.45 : 0.36);
  const template = shape("mountain", () => new THREE.CylinderGeometry(0.03, 1, 1, 18, 5).translate(0, 0.5, 0), true);
  for (const peak of peaks) {
    const { x: cx, z: cz } = peak;
    ctx.solid.add(template, at(cx, -2, cz, peak.r, peak.h, peak.r), rock, values, (world, _n, color, _v, l) => {
      const n = Math.sin(Math.atan2(l.z, l.x) * 5 + cx * 0.01) * 0.5 + Math.sin(l.y * 13 + l.x * 4) * 0.3;
      const k = 1 + n * 0.1 * (1 - l.y);
      world.x = cx + (world.x - cx) * k;
      world.z = cz + (world.z - cz) * k;
      color.copy(l.y > 0.62 + n * 0.08 ? snow : rock);
    });
  }
  const main = peaks[0];
  mark(ctx, "mountain", main.x, 0, main.z, Math.max(...peaks.map((peak) => peak.h)));
}

function bridge(ctx: CityContext, x: number, land: 1 | -1) {
  const river = ctx.river;
  if (!river) return;
  const white = tone("#eef0f2");
  const deckColor = tone("#a7aaae");
  const values = fx(1.1, 0, 0, 0.8);
  const zc = land * (river.near + river.far) / 2;
  const half = (river.far - river.near) / 2 + 150;
  const deckY = 24;
  // Tabuleiro sobre o rio e rampas descendo até as margens.
  ctx.solid.add(SHAPES.box(), at(x, deckY, zc, 24, 2.2, half * 2), deckColor, values);
  for (const s of [-1, 1]) {
    const startZ = zc + s * half;
    ctx.solid.add(SHAPES.box(), along(new THREE.Vector3(x, deckY, startZ), new THREE.Vector3(x, 0, startZ + s * 120), 24, 2.2), deckColor, values);
  }
  // Mastro em Y invertido no meio do rio, com o leque de estais.
  const apex = new THREE.Vector3(x, 140, zc);
  for (const sx of [-1, 1]) {
    ctx.solid.add(SHAPES.box(), along(new THREE.Vector3(x + sx * 14, -2, zc), new THREE.Vector3(x + sx * 4, 60, zc), 4.5, 4.5), white, values);
    ctx.solid.add(SHAPES.box(), along(new THREE.Vector3(x + sx * 4, 60, zc), new THREE.Vector3(x + sx * 0.6, 100, zc), 4, 4), white, values);
  }
  ctx.solid.add(SHAPES.box(), along(new THREE.Vector3(x, 98, zc), apex, 5, 5), white, values);
  const cables = ctx.performance ? 6 : 10;
  for (const sz of [-1, 1]) {
    for (let k = 1; k <= cables; k += 1) {
      const t = k / cables;
      const anchor = new THREE.Vector3(x, 104 + t * 34, zc);
      for (const sx of [-1, 1]) {
        const deck = new THREE.Vector3(x + sx * 11, deckY + 2, zc + sz * (20 + t * (half - 30)));
        ctx.solid.add(SHAPES.box(), along(anchor, deck, 0.45, 0.45), white, values);
      }
    }
  }
  mark(ctx, "bridge", x, 0, zc, 140);
}
