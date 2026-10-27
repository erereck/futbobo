// Chão, avenida e prédios da cidade da festa. Tudo entra nos dois montadores
// do contexto (sólidos e fachadas): nenhum objeto próprio por prédio.

import * as THREE from "three";
import { FX_PLAIN, SHAPES, WIN_ROOF, along, at, between, facadeBox, fx, pickOne, tone, win, WIN, type Rand } from "./city-kit";
import { groundAt, isReserved, isWater, reserve, type CityContext } from "./city-plan";

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const WHITE = new THREE.Color("#f4f2ec");

/** Retângulo deitado (normal para cima). */
export function flat(ctx: CityContext, x0: number, x1: number, z0: number, z1: number, y: number, color: THREE.Color, values = FX_PLAIN) {
  ctx.solid.quad(_a.set(x0, y, z1), _b.set(x1, y, z1), _c.set(x1, y, z0), _d.set(x0, y, z0), color, values);
}

/** Parede vertical de (x0, z0) a (x1, z1), de y0 a y1, virada para a esquerda de quem anda de 0 para 1. */
export function wall(ctx: CityContext, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, color: THREE.Color, values = FX_PLAIN) {
  ctx.solid.quad(_a.set(x0, y0, z0), _b.set(x1, y0, z1), _c.set(x1, y1, z1), _d.set(x0, y1, z0), color, values);
}

function vary(rand: Rand, hex: string, amount = 1) {
  return tone(hex, (rand() - 0.5) * 0.08 * amount, (rand() - 0.5) * 0.08 * amount, (rand() - 0.5) * 0.016 * amount);
}

// --------------------------------------------------------------- chão

/** Chão da cidade, areia, margens do rio, pista, calçadas da multidão e faixas. Devolve as ruas transversais. */
export function buildGround(ctx: CityContext, crosses: number[]) {
  const { avenue, spec } = ctx;
  const half = avenue.width / 2;
  const crowdOuter = half + avenue.crowdDepth;
  const open = avenue.openSide;
  const far = 6000;
  const xLand = ctx.seaEndX !== null ? ctx.seaEndX - 40 : far;
  const zLo = open === -1 ? -(crowdOuter + 1) : -far;
  const zHi = open === 1 ? crowdOuter + 1 : far;
  const ground = tone(spec.ground);
  const bands: Array<[number, number]> = [];
  if (ctx.river) {
    const a = ctx.river.side * ctx.river.near;
    const b = ctx.river.side * ctx.river.far;
    bands.push([zLo, Math.min(a, b)], [Math.max(a, b), zHi]);
    // Cais de pedra nas duas margens.
    const quay = tone("#8d8478");
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    wall(ctx, far, lo, -far, lo, -3, -0.05, quay);
    wall(ctx, -far, hi, far, hi, -3, -0.05, quay);
  } else bands.push([zLo, zHi]);
  for (const [z0, z1] of bands) if (z1 > z0) flat(ctx, -far, xLand, z0, z1, -0.05, ground);

  // Areia em rampa até debaixo d'água (a onda sobe e desce nela).
  const sand = tone("#e2cf9f");
  const wet = tone("#b9a47a");
  if (open !== 0) {
    const s = open;
    const z0 = crowdOuter + 1;
    const shore = ctx.shoreZ;
    const strip = (za: number, zb: number, ya: number, yb: number, color: THREE.Color) => {
      if (s > 0) ctx.solid.quad(_a.set(-far, yb, zb), _b.set(far, yb, zb), _c.set(far, ya, za), _d.set(-far, ya, za), color, FX_PLAIN);
      else ctx.solid.quad(_a.set(-far, ya, -za), _b.set(far, ya, -za), _c.set(far, yb, -zb), _d.set(-far, yb, -zb), color, FX_PLAIN);
    };
    strip(z0, shore - 7, 0.05, -0.12, sand);
    strip(shore - 7, shore, -0.12, -0.6, wet);
    strip(shore, shore + 40, -0.6, -2.8, wet);
    // Muro baixo do calçadão para a areia.
    if (s > 0) wall(ctx, far, z0, -far, z0, -0.2, 0.15, tone(spec.curb));
    else wall(ctx, -far, -z0, far, -z0, -0.2, 0.15, tone(spec.curb));
  }
  if (ctx.seaEndX !== null) {
    const x0 = ctx.seaEndX - 40;
    const sx = ctx.seaEndX;
    const slope = (xa: number, xb: number, ya: number, yb: number, color: THREE.Color) =>
      ctx.solid.quad(_a.set(xa, ya, far), _b.set(xb, yb, far), _c.set(xb, yb, -far), _d.set(xa, ya, -far), color, FX_PLAIN);
    slope(x0, sx - 7, -0.05, -0.12, sand);
    slope(sx - 7, sx, -0.12, -0.6, wet);
    slope(sx, sx + 40, -0.6, -2.8, wet);
  }

  // Pista da festa e a continuação até o fim da avenida.
  const road = tone(spec.road);
  const x0 = -ctx.reach * 0.9;
  const x1 = ctx.roadEnd;
  flat(ctx, x0, x1, -half, half, 0, road);
  // Calçadas da multidão (+ calçada até a fachada), com guia.
  const walk = tone(spec.walkColor);
  const walkFar = tone(spec.walkColor, -0.04);
  const curb = tone(spec.curb);
  const boulevard = spec.boulevard;
  for (const side of [-1, 1] as const) {
    const zIn = half;
    const zCrowd = crowdOuter;
    const zWalk = crowdOuter + (side === open ? 1 : spec.walk);
    const s = side;
    const span = (za: number, zb: number, y: number, color: THREE.Color) => (s > 0 ? flat(ctx, x0, x1, za, zb, y, color) : flat(ctx, x0, x1, -zb, -za, y, color));
    span(zIn, zCrowd, 0.15, walk);
    if (zWalk > zCrowd) span(zCrowd, zWalk, 0.15, walkFar);
    // Guia: face virada para a pista.
    if (s > 0) wall(ctx, x1, zIn, x0, zIn, 0, 0.15, curb);
    else wall(ctx, x0, -zIn, x1, -zIn, 0, 0.15, curb);
    if (boulevard > 0 && side !== open) {
      const green = tone("#5f8a45");
      span(zWalk, zWalk + 9, 0.12, green);
      span(zWalk + 9, zWalk + boulevard, 0.01, road);
    }
  }

  // Faixas brancas tracejadas e de borda.
  const paint = tone("#e9e7df");
  const lanes = Math.max(2, Math.round(avenue.width / 3.5));
  const dashFrom = Math.max(x0, -320);
  for (let lane = 1; lane < lanes; lane += 1) {
    const z = -half + (avenue.width * lane) / lanes;
    for (let x = dashFrom; x < x1 - 4; x += 9) flat(ctx, x, x + 3.2, z - 0.07, z + 0.07, 0.025, paint);
  }
  for (const side of [-1, 1]) flat(ctx, dashFrom, x1, side * (half - 0.45) - 0.08, side * (half - 0.45) + 0.08, 0.025, paint);
  // Faixas de pedestre nas esquinas.
  for (const cross of crosses) {
    if (cross < dashFrom || cross > x1 - 6) continue;
    for (let z = -half + 0.8; z < half - 0.8; z += 1.1) flat(ctx, cross - 2.2, cross + 2.2, z, z + 0.55, 0.03, paint);
  }
}

// ------------------------------------------------------- vegetação

/** Árvore de copa facetada (plátano do bulevar ou árvore redonda). */
export function tree(ctx: CityContext, rand: Rand, x: number, z: number, scale = 1, y = 0) {
  const solid = ctx.solid;
  const trunk = tone("#6b5443", (rand() - 0.5) * 0.05);
  const height = (3 + rand() * 1.6) * scale;
  solid.add(SHAPES.taper(0.6, 5), at(x, y, z, 0.45 * scale, height, 0.45 * scale), trunk, FX_PLAIN);
  const leaf = tone(pickOne(rand, ["#4f7d36", "#5c8a3c", "#46732f", "#6a9443"]), (rand() - 0.5) * 0.06);
  const crown = (2.6 + rand() * 1.4) * scale;
  solid.add(SHAPES.ico(ctx.performance ? 0 : 1), at(x, y + height + crown * 0.55, z, crown, crown * 0.85, crown, rand() * 6), leaf, fx(0, 0, 0.08), (world, _normal, color, values) => {
    // Copa mais escura embaixo e só o alto balança.
    color.multiplyScalar(0.78 + 0.32 * THREE.MathUtils.clamp((world.y - y - height) / (crown * 1.6), 0, 1));
    values[2] = world.y > y + height + crown * 0.6 ? 0.12 * scale : 0;
  });
}

/** Coqueiro: tronco curvo em gomos e palhas caídas dos dois lados (balançam nas pontas). */
export function palm(ctx: CityContext, rand: Rand, x: number, z: number, height = 9 + rand() * 5, y = 0) {
  const solid = ctx.solid;
  const trunkColor = tone("#8b7a60", (rand() - 0.5) * 0.06);
  const lean = (rand() - 0.5) * 0.5;
  const heading = rand() * Math.PI * 2;
  const segments = 4;
  const start = new THREE.Vector3(x, y, z);
  let previous = start.clone();
  for (let index = 1; index <= segments; index += 1) {
    const t = index / segments;
    const bend = lean * t * t * height * 0.35;
    const next = new THREE.Vector3(x + Math.cos(heading) * bend, y + height * t, z + Math.sin(heading) * bend);
    solid.add(SHAPES.taper(0.85, 5), along(previous, next, 0.5 - t * 0.12, 0.5 - t * 0.12), trunkColor, FX_PLAIN);
    previous = next;
  }
  const top = previous;
  const frond = tone(pickOne(rand, ["#3f7d34", "#4b8a39", "#376f2c"]), (rand() - 0.5) * 0.05);
  const dark = frond.clone().multiplyScalar(0.7);
  const count = 8;
  const sway = fx(0, 0, 0.35);
  const still = fx(0, 0, 0.05);
  for (let index = 0; index < count; index += 1) {
    const angle = heading + (index / count) * Math.PI * 2 + rand() * 0.3;
    const dir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const length = 3.8 + rand() * 1.4;
    const mid = top.clone().addScaledVector(dir, length * 0.5).setY(top.y + 0.5);
    const tip = top.clone().addScaledVector(dir, length).setY(top.y - 1.4 - rand() * 0.8);
    const ml = mid.clone().addScaledVector(side, 0.75);
    const mr = mid.clone().addScaledVector(side, -0.75);
    // Frente e verso (o material só pinta a frente).
    solid.triangle(top, ml, mr, frond, still);
    solid.triangle(top, mr, ml, dark, still);
    solid.triangle(ml, tip, mr, frond, sway, frond, sway);
    solid.triangle(mr, tip, ml, dark, sway, dark, sway);
  }
  solid.add(SHAPES.ico(0), at(top.x, top.y - 0.3, top.z, 0.55, 0.55, 0.55), tone("#6b5a2f"), FX_PLAIN);
}

// ------------------------------------------------------ rua enfeitada

/** Postes com bandeira, varal de bandeirinhas cruzando a avenida, grades e faixas nos prédios. */
export function buildStreetDressing(ctx: CityContext) {
  const { avenue, solid, rand, colors, spec } = ctx;
  const half = avenue.width / 2;
  const L = avenue.length;
  const crowdOuter = half + avenue.crowdDepth;
  const lampColor = tone("#3a3e44");
  const headColor = tone("#fff1cf");
  const haloColor = tone("#ffc27a");
  const spacing = 30;
  const zPole = half + 0.55;
  // Alto o bastante para o varal que cruza a pista passar acima da treliça do trio (~7,6 m).
  const poleH = Math.min(11.5, 8.8 + avenue.width * 0.08);
  const [first, second] = colors;
  const whiteFx = fx(0, 0, 0);
  const lit = ctx.timeOfDay !== "day";
  const xs: number[] = [];
  for (let x = -150; x <= L + 150 && x < ctx.roadEnd - 10; x += spacing) xs.push(x);
  ctx.pool = { spacing, z: zPole + 1.6, x0: xs[0] ?? 0, x1: xs[xs.length - 1] ?? L };
  for (const x of xs) {
    for (const side of [-1, 1] as const) {
      const z = side * zPole;
      solid.add(SHAPES.cyl6(), at(x, 0, z, 0.26, poleH, 0.26), lampColor, FX_PLAIN);
      // Braço sobre a pista e luminária (acende à noite).
      solid.add(SHAPES.cube(), at(x, poleH - 0.1, z - side * 1.1, 0.12, 0.12, 2.3), lampColor, FX_PLAIN);
      solid.add(SHAPES.cube(), at(x, poleH - 0.25, z - side * 2.1, 0.5, 0.22, 0.9), headColor, fx(1.4));
      if (lit) ctx.halos.add(x, poleH - 0.6, z - side * 2.1, haloColor, 5.5);
      // Bandeira pendurada no poste (metade de cada cor), balançando embaixo.
      const fy = poleH * 0.62;
      const fz = z + side * 0.25;
      const flagW = 1.0;
      const flagH = 1.9;
      solid.add(SHAPES.cube(), at(x + 0.55, fy + 0.05, fz, 1.2, 0.07, 0.07), lampColor, FX_PLAIN);
      flagPanel(ctx, x + 0.08, fy, fz, flagW, flagH, first, second);
    }
  }

  // Varais de bandeirinhas: atravessando a avenida (pares de postes) e ao longo das calçadas.
  for (let index = 0; index < xs.length; index += ctx.performance ? 2 : 1) {
    const x = xs[index];
    // Preso no braço da luminária e quase esticado: a ponta das bandeirinhas fica a ~8,5 m.
    bunting(ctx, new THREE.Vector3(x, poleH - 0.1, -zPole), new THREE.Vector3(x, poleH - 0.1, zPole), 0.75, [first, second, WHITE], whiteFx);
    if (!ctx.performance && index + 1 < xs.length) {
      for (const side of [-1, 1]) {
        bunting(ctx, new THREE.Vector3(x, poleH - 2.5, side * zPole), new THREE.Vector3(xs[index + 1], poleH - 2.5, side * zPole), 1.6, [second, first], whiteFx);
      }
    }
  }

  // Grade de contenção na beira da pista.
  const steel = tone("#9aa1a8");
  const zRail = half + 0.25;
  const railFrom = -40;
  const railTo = Math.min(L + 40, ctx.roadEnd - 10);
  for (const side of [-1, 1]) {
    const z = side * zRail;
    for (const y of [0.25, 1.05]) solid.add(SHAPES.cube(), at((railFrom + railTo) / 2, y, z, railTo - railFrom, 0.06, 0.05), steel, FX_PLAIN);
    if (!ctx.performance) for (let x = railFrom; x <= railTo; x += 2.5) solid.add(SHAPES.box(), at(x, 0.15, z, 0.06, 0.95, 0.06), steel, FX_PLAIN);
  }

  // Árvores da calçada larga e do canteiro do bulevar.
  const open = avenue.openSide;
  if (spec.walk >= 5 && spec.trees !== "none") {
    const step = (spec.trees === "palm" ? 13 : 9.5) * (ctx.performance ? 1.6 : 1);
    for (const side of [-1, 1] as const) {
      if (side === open) continue;
      const z = side * (crowdOuter + spec.walk * 0.55);
      for (let x = -260 + rand() * 4; x < Math.min(L + 260, ctx.roadEnd - 8); x += step) {
        if (isReserved(ctx, x - 1, x + 1, z - 1, z + 1)) continue;
        if (spec.trees === "palm") palm(ctx, rand, x, z, 8 + rand() * 4, 0.15);
        else tree(ctx, rand, x, z, spec.trees === "plane" ? 1.15 : 1, 0.15);
      }
    }
  }
  if (spec.boulevard > 0) {
    for (const side of [-1, 1] as const) {
      const z = side * (crowdOuter + spec.walk + 4.5);
      for (let x = -260; x < L + 260; x += ctx.performance ? 18 : 11) {
        if (isReserved(ctx, x - 1, x + 1, z - 1, z + 1)) continue;
        if (spec.trees === "palm" && rand() < 0.5) palm(ctx, rand, x, z, 9 + rand() * 3, 0.12);
        else tree(ctx, rand, x, z, 1.1, 0.12);
      }
    }
  }
}

/** Bandeira retangular presa pelo alto (x0 = borda do mastro), duas faixas verticais. */
function flagPanel(ctx: CityContext, x0: number, top: number, z: number, w: number, h: number, first: THREE.Color, second: THREE.Color) {
  const solid = ctx.solid;
  const still = fx(0, 0, 0);
  const sway = fx(0, 0, 0.28);
  const mid = x0 + w / 2;
  const end = x0 + w;
  const bottom = top - h;
  // Frente (+z) e verso (-z), cada metade numa cor; o balanço cresce para baixo.
  for (const [a, b, color] of [[x0, mid, first], [mid, end, second]] as const) {
    solid.triangle(_a.set(a, top, z), _b.set(b, top, z), _c.set(b, bottom, z), color, still, color, sway);
    solid.triangle(_a.set(a, top, z), _c.set(b, bottom, z), _d.set(a, bottom, z), color, still, color, sway);
    solid.triangle(_a.set(b, top, z), _b.set(a, top, z), _c.set(a, bottom, z), color, still, color, sway);
    solid.triangle(_a.set(b, top, z), _c.set(a, bottom, z), _d.set(b, bottom, z), color, still, color, sway);
  }
}

/** Varal com bandeirinhas triangulares, caindo em barriga entre `from` e `to`. */
export function bunting(ctx: CityContext, from: THREE.Vector3, to: THREE.Vector3, sag: number, palette: THREE.Color[], still: number[]) {
  const solid = ctx.solid;
  const length = from.distanceTo(to);
  const count = Math.max(2, Math.floor(length / 0.85));
  const dir = new THREE.Vector3().subVectors(to, from).normalize();
  const sway = fx(0, 0, 0.3);
  const point = (t: number, out: THREE.Vector3) => out.lerpVectors(from, to, t).setY(from.y + (to.y - from.y) * t - sag * 4 * t * (1 - t));
  const cable = tone("#2b2b2b");
  const segments = 6;
  const p0 = new THREE.Vector3();
  const p1 = new THREE.Vector3();
  for (let index = 0; index < segments; index += 1) {
    point(index / segments, p0);
    point((index + 1) / segments, p1);
    solid.add(SHAPES.box(), along(p0, p1, 0.04), cable, FX_PLAIN);
  }
  const left = new THREE.Vector3();
  const right = new THREE.Vector3();
  const tip = new THREE.Vector3();
  for (let index = 0; index < count; index += 1) {
    const t = (index + 0.5) / count;
    point(t, tip);
    left.copy(tip).addScaledVector(dir, -0.26);
    right.copy(tip).addScaledVector(dir, 0.26);
    tip.y -= 0.62;
    const color = palette[index % palette.length];
    solid.triangle(left, right, tip, color, still, color, sway);
    solid.triangle(right, left, tip, color, still, color, sway);
  }
}

/** Bandeirão pendurado na fachada (duas faixas horizontais), virado para `facing` (±z). */
export function facadeBanner(ctx: CityContext, x: number, top: number, z: number, facing: 1 | -1, w: number, h: number) {
  const solid = ctx.solid;
  const [first, second] = ctx.colors;
  const still = fx(0, 0, 0);
  const sway = fx(0, 0, 0.18);
  const zf = z + facing * 0.3;
  const x0 = x - (w / 2) * facing;
  const x1 = x + (w / 2) * facing;
  const mid = top - h * 0.5;
  const bottom = top - h;
  solid.quad(_a.set(x0, mid, zf), _b.set(x1, mid, zf), _c.set(x1, top, zf), _d.set(x0, top, zf), first, still);
  solid.triangle(_a.set(x0, bottom, zf), _b.set(x1, bottom, zf), _c.set(x1, mid, zf), second, sway, second, still);
  solid.triangle(_a.set(x0, bottom, zf), _c.set(x1, mid, zf), _d.set(x0, mid, zf), second, sway, second, still);
  solid.add(SHAPES.cube(), at(x, bottom + h * 0.25, zf, w * 0.5, h * 0.12, 0.05), WHITE, FX_PLAIN);
}

// ---------------------------------------------------------- prédios

type Building = { x: number; z: number; w: number; d: number; y0: number; floors: number; facing: 1 | -1; tier: 0 | 1 | 2 };

const GLASS = ["#6f8fa3", "#56747f", "#7e94a6", "#4f6c78", "#8aa3a8", "#5f7f95"];

/**
 * Prédios em volta da avenida: quarteirões detalhados perto, um bloco por
 * quarteirão no anel distante. Devolve as ruas transversais (faixas de pedestre).
 */
export function buildBlocks(ctx: CityContext): number[] {
  const { spec, avenue, rand } = ctx;
  const L = avenue.length;
  const pitch = spec.block + spec.street;
  const detail = ctx.performance ? 230 : 330;
  const xLo = -ctx.reach;
  const xHi = Math.min(L + ctx.reach, ctx.seaEndX !== null ? ctx.seaEndX - 55 : Infinity);
  const crosses: number[] = [];
  for (let x = xLo + rand() * pitch; x < xHi; x += pitch * between(rand, 0.85, 1.2)) crosses.push(x);
  if (ctx.city.style === "modernist") {
    modernist(ctx);
    return crosses;
  }
  // A cada variação, uma ou duas praças com árvores no lugar de um quarteirão da avenida.
  const plazas = new Set<string>();
  const inAvenue = crosses.map((x, index) => ({ x, index })).filter((item) => item.x > L * 0.1 && item.x < L * 0.9);
  for (let count = 0; count < 1 + (ctx.variant % 2) && inAvenue.length; count += 1) {
    const item = inAvenue[Math.floor(rand() * inAvenue.length)];
    plazas.add(`${item.index}:${rand() < 0.5 ? -1 : 1}`);
  }
  let banners = ctx.performance ? 6 : 14;
  for (const side of [-1, 1] as const) {
    if (side === avenue.openSide) continue;
    for (let index = 0; index + 1 < crosses.length; index += 1) {
      const bx0 = crosses[index] + spec.street / 2;
      const bx1 = crosses[index + 1] - spec.street / 2;
      if (bx1 - bx0 < 14) continue;
      let z0 = ctx.frontZ;
      for (let row = 0; z0 < ctx.reach; row += 1) {
        const depth = spec.block * (row === 0 ? 1 : between(rand, 0.85, 1.2));
        const z1 = z0 + depth;
        const cx = (bx0 + bx1) / 2;
        const dist = Math.hypot(Math.max(0, -cx, cx - L), (z0 + z1) / 2);
        const zA = side > 0 ? z0 : -z1;
        const zB = side > 0 ? z1 : -z0;
        const skip = dist > ctx.reach || isReserved(ctx, bx0, bx1, zA, zB) || isWater(ctx, cx, side * (z0 + z1) / 2, depth * 0.5);
        const lift = skip ? 0 : blockLift(ctx, bx0, bx1, zA, zB);
        if (!skip && lift >= 0) {
          if (row === 0 && plazas.has(`${index}:${side}`)) plaza(ctx, bx0, bx1, zA, zB);
          else if (dist < detail) {
            flat(ctx, bx0 - 1.5, bx1 + 1.5, zA - 1.5, zB + 1.5, lift + 0.08, tone(spec.plinth));
            const made = detailedBlock(ctx, side, bx0, bx1, z0, z1, row, lift);
            if (row === 0 && banners > 0) {
              for (const item of made) {
                if (item.tier !== 0 || item.floors < 3 || rand() > 0.35 || banners <= 0) continue;
                banners -= 1;
                const top = item.y0 + item.floors * spec.floor - 1;
                facadeBanner(ctx, item.x, top, side * z0, -side as 1 | -1, Math.min(4, item.w * 0.5), Math.min(10, item.floors * spec.floor * 0.45));
              }
            }
          } else farBlock(ctx, bx0, bx1, zA, zB, lift);
        }
        z0 = z1 + spec.street * (row === 0 && spec.boulevard > 0 ? 0.5 : 1);
      }
    }
  }
  return crosses;
}

/** Chão do quarteirão: plano (devolve a altura) ou -1 se estiver na encosta. */
function blockLift(ctx: CityContext, x0: number, x1: number, z0: number, z1: number) {
  if (!ctx.terrain.length) return 0;
  const corners = [groundAt(ctx, x0, z0), groundAt(ctx, x1, z0), groundAt(ctx, x0, z1), groundAt(ctx, x1, z1), groundAt(ctx, (x0 + x1) / 2, (z0 + z1) / 2)];
  const lo = Math.min(...corners);
  const hi = Math.max(...corners);
  if (hi - lo > 2.5) return -1;
  return lo;
}

function plaza(ctx: CityContext, x0: number, x1: number, z0: number, z1: number) {
  const { rand } = ctx;
  flat(ctx, x0 - 1.5, x1 + 1.5, z0 - 1.5, z1 + 1.5, 0.1, tone(ctx.spec.plinth, 0.04));
  flat(ctx, x0 + 3, x1 - 3, z0 + 3, z1 - 3, 0.14, tone("#6c9a4b"));
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  // Chafariz no meio e árvores em volta.
  ctx.solid.add(SHAPES.cyl16(), at(cx, 0.1, cz, 9, 0.6, 9), tone("#d9d3c6"), FX_PLAIN);
  ctx.solid.add(SHAPES.cyl16(), at(cx, 0.2, cz, 8, 0.45, 8), tone("#5d9fc0"), fx(0.3));
  ctx.solid.add(SHAPES.cyl8(), at(cx, 0.6, cz, 1.2, 2.4, 1.2), tone("#d9d3c6"), FX_PLAIN);
  for (let x = x0 + 6; x < x1 - 4; x += 9) {
    for (let z = z0 + 6; z < z1 - 4; z += 9) {
      if (Math.hypot(x - cx, z - cz) < 9) continue;
      if (ctx.spec.trees === "palm" && rand() < 0.6) palm(ctx, rand, x + rand() * 3, z + rand() * 3, 7 + rand() * 4, 0.14);
      else tree(ctx, rand, x + rand() * 3, z + rand() * 3, 1, 0.14);
    }
  }
}

function floorsIn(rand: Rand, range: [number, number], bias = 1) {
  // Distribuição puxada para baixo: poucos prédios bem altos.
  const t = Math.pow(rand(), bias);
  return Math.round(range[0] + (range[1] - range[0]) * t);
}

/** Toques de cor por estilo (um prédio em cinco foge da paleta da cidade). */
const ACCENTS: Record<string, string[]> = {
  beach: ["#e9d6c0", "#d7e3e8", "#efe3c8", "#c8d6cf", "#e6c9b5", "#f4f1ea"],
  metropolis: ["#8c96a0", "#b8aa98", "#6f7880", "#d5cfc4", "#9e8a78"],
  modernist: ["#f2f1ec", "#e3e6e8"],
  colonial: ["#f2c14e", "#e86a5b", "#4fb3bf", "#8ac26e", "#f39ac0", "#f4f1ea", "#7fa7d9"],
  european: ["#e8dcc6", "#d9c7a7", "#efe6d2", "#cdbb9c"],
};

function facadeColor(ctx: CityContext, rand: Rand) {
  const accents = ACCENTS[ctx.city.style];
  const base = rand() < 0.22 && accents ? pickOne(rand, accents) : pickOne(rand, ctx.city.facade);
  return vary(rand, base, 1.3);
}

/** Quarteirão detalhado: lotes de frente para a rua de cá (z0) e, se couber, de costas para a de lá (z1). */
function detailedBlock(ctx: CityContext, side: 1 | -1, bx0: number, bx1: number, z0: number, z1: number, row: number, y0: number): Building[] {
  const { spec, rand } = ctx;
  const style = ctx.city.style;
  const made: Building[] = [];
  const contiguous = spec.contiguous;
  const range = row === 0 ? spec.front : spec.back;
  const lotDepth = style === "colonial" ? between(rand, 10, 13) : style === "european" ? between(rand, 15, 19) : between(rand, 16, 26);
  const faces: Array<{ zFace: number; facing: 1 | -1 }> = [{ zFace: z0, facing: 1 }];
  if (z1 - z0 > lotDepth * 2 + 6) faces.push({ zFace: z1, facing: -1 });
  for (const face of faces) {
    let x = bx0;
    const merge = contiguous && row >= 2;
    while (x < bx1 - 5) {
      let w: number;
      if (merge) w = bx1 - x;
      else if (contiguous) w = style === "colonial" ? between(rand, 6.5, 12) : between(rand, 13, 24);
      else w = between(rand, 16, 32);
      w = Math.min(w, bx1 - x);
      if (bx1 - x - w < (contiguous ? 5 : 10)) w = bx1 - x;
      w = Math.max(contiguous ? 5 : 10, Math.round(w / spec.column) * spec.column);
      if (x + w > bx1 + 1) w = bx1 - x;
      const gap = contiguous ? 0 : between(rand, 2, 7);
      const d = contiguous ? lotDepth : Math.min(lotDepth, z1 - z0 - 4);
      const lotZ = face.facing === 1 ? face.zFace + d / 2 : face.zFace - d / 2;
      const building: Building = {
        x: x + w / 2,
        z: side * lotZ,
        w: Math.max(4, w - gap),
        d,
        y0,
        floors: Math.max(1, floorsIn(rand, range, style === "metropolis" ? 1.6 : 1)),
        facing: face.facing,
        tier: row === 0 && face.facing === 1 ? 0 : 1,
      };
      if (!isReserved(ctx, building.x - building.w / 2, building.x + building.w / 2, building.z - d / 2, building.z + d / 2)) {
        raise(ctx, building, side);
        made.push(building);
        if (building.tier === 0) ctx.frontTops.push(building.y0 + building.floors * spec.floor + (spec.contiguous ? 4 : 2));
      }
      x += w;
    }
  }
  // Torres soltas no miolo de quarteirões grandes (cidades de prédio alto).
  if (!contiguous && z1 - z0 > 50 && rand() < 0.7) {
    const building: Building = { x: between(rand, bx0 + 12, bx1 - 12), z: side * ((z0 + z1) / 2), w: 18, d: 18, y0, floors: floorsIn(rand, spec.back, 1.4), facing: 1, tier: 1 };
    if (!isReserved(ctx, building.x - 9, building.x + 9, building.z - 9, building.z + 9)) raise(ctx, building, side);
  }
  return made;
}

/** Quarteirão do anel distante: uma ou duas caixas com janelas (a névoa faz o resto). */
function farBlock(ctx: CityContext, x0: number, x1: number, z0: number, z1: number, y0: number) {
  const { spec, rand } = ctx;
  if (rand() < 0.12) return;
  const style = ctx.city.style;
  const count = spec.contiguous ? 1 : 1 + Math.floor(rand() * 2);
  for (let index = 0; index < count; index += 1) {
    const w = (x1 - x0) * (count === 1 ? between(rand, 0.75, 0.95) : between(rand, 0.35, 0.45));
    const d = (z1 - z0) * between(rand, 0.6, 0.9);
    const x = count === 1 ? (x0 + x1) / 2 : index === 0 ? x0 + w / 2 + 2 : x1 - w / 2 - 2;
    const z = (z0 + z1) / 2 + (rand() - 0.5) * (z1 - z0 - d);
    const floors = Math.max(1, floorsIn(rand, spec.far, 1.3));
    const h = floors * spec.floor + 1;
    const wallColor = facadeColor(ctx, rand);
    const roofColor = style === "colonial" ? tone("#a8573b", (rand() - 0.5) * 0.06) : tone("#6e6b66", (rand() - 0.5) * 0.06);
    facadeBox(ctx.facade, x, y0, z, w, h, d, wallColor, roofColor, win(pickOne(rand, spec.windows), spec.column, spec.floor, Math.floor(rand() * 997)));
    if (style === "european") ctx.facade.add(SHAPES.mansard(), at(x, y0 + h, z, w, 3.2, d), tone("#5b6370"), WIN_ROOF);
  }
}

/** Ergue um prédio conforme o estilo da cidade. */
function raise(ctx: CityContext, b: Building, side: 1 | -1) {
  const { spec, rand } = ctx;
  const facade = ctx.facade;
  const style = ctx.city.style;
  const seed = Math.floor(rand() * 997);
  const wallColor = facadeColor(ctx, rand);
  const slab = tone("#6f6c67", (rand() - 0.5) * 0.06);
  const toAvenue = -side;
  if (style === "european") {
    const h = b.floors * spec.floor + 1.2;
    facadeBox(facade, b.x, b.y0, b.z, b.w, h, b.d, wallColor, null, win(5, spec.column, spec.floor, seed));
    // Cornija saliente e mansarda de ardósia com chaminés.
    facade.add(SHAPES.box(), at(b.x, b.y0 + h - 0.1, b.z, b.w + 0.2, 0.55, b.d + 0.9), tone("#e9e2d2"), WIN_ROOF);
    const mansard = 3.4 + rand() * 1.2;
    facade.add(SHAPES.mansard(), at(b.x, b.y0 + h + 0.45, b.z, b.w, mansard, b.d), tone("#56606d", (rand() - 0.5) * 0.04), WIN_ROOF);
    if (b.tier === 0 || rand() < 0.4) {
      for (let k = 0; k < 2; k += 1) {
        facade.add(SHAPES.box(), at(b.x + (k - 0.5) * b.w * 0.5, b.y0 + h + mansard * 0.5, b.z + (rand() - 0.5) * 2, 0.9, mansard * 0.5 + 1.6, 1.6), tone("#a06a52"), WIN_ROOF);
      }
    }
    if (b.floors >= 5 && b.tier === 0) {
      // Balcão corrido de ferro no 2º e no último andar.
      for (const floor of [2, b.floors]) {
        const y = b.y0 + 1.2 + (floor - 1) * spec.floor;
        facade.add(SHAPES.box(), at(b.x, y, b.z + toAvenue * (b.d / 2 + 0.35), b.w - 0.6, 0.18, 0.7), tone("#30343a"), WIN_ROOF);
      }
    }
  } else if (style === "colonial") {
    const h = b.floors * spec.floor + 0.6;
    facadeBox(facade, b.x, b.y0, b.z, b.w, h, b.d, wallColor, null, win(4, spec.column, spec.floor, seed));
    // Cimalha branca e telhado de barro (às vezes platibanda reta).
    facade.add(SHAPES.box(), at(b.x, b.y0 + h - 0.35, b.z, b.w + 0.04, 0.45, b.d + 0.35), tone("#f3efe6"), WIN_ROOF);
    if (rand() < 0.75) facade.add(SHAPES.gable(), at(b.x, b.y0 + h, b.z, b.w + 0.3, 2.2 + b.d * 0.1, b.d + 0.9), tone("#b0583a", (rand() - 0.5) * 0.08), WIN_ROOF);
    else {
      facadeBox(facade, b.x, b.y0 + h, b.z, b.w, 1.1, b.d, wallColor, slab, WIN_ROOF);
    }
  } else if (style === "beach") {
    // Laje com varandas sobre pilotis, caixa d'água no topo.
    const h = b.floors * spec.floor + 1.5;
    facadeBox(facade, b.x, b.y0, b.z, b.w, h, b.d, wallColor, slab, win(rand() < 0.75 ? 7 : 1, spec.column, spec.floor, seed));
    facadeBox(facade, b.x + (rand() - 0.5) * b.w * 0.3, b.y0 + h, b.z, b.w * 0.3, 2.6, b.d * 0.4, wallColor, slab, WIN_ROOF);
    if (h > 25) ctx.roofs.push({ x: b.x, z: b.z, y: b.y0 + h, size: Math.min(b.w, b.d) });
  } else {
    tower(ctx, b, wallColor, slab, seed);
  }
}

/** Arranha-céu: base, recuos, coroa, caixa de máquinas e luz de aviação. */
function tower(ctx: CityContext, b: Building, wallColor: THREE.Color, slab: THREE.Color, seed: number) {
  const { spec, rand } = ctx;
  const facade = ctx.facade;
  const tall = b.floors >= 22;
  const glass = tall ? rand() < 0.45 : rand() < 0.15;
  const style = glass ? WIN.glass : pickOne(rand, spec.windows.filter((item) => item !== WIN.glass).concat([WIN.punched]));
  const color = glass ? tone(pickOne(rand, GLASS), (rand() - 0.5) * 0.06) : wallColor;
  let height = b.floors * spec.floor + 1.6;
  let w = b.w;
  let d = b.d;
  let y = b.y0;
  let vBase = 0;
  const steps = tall && rand() < 0.55 ? 1 + Math.floor(rand() * 2) : 0;
  for (let step = 0; step <= steps; step += 1) {
    const part = step === steps ? height - vBase : height * between(rand, 0.45, 0.65) - vBase;
    facadeBox(facade, b.x, y, b.z, w, part, d, color, slab, win(style, spec.column, spec.floor, seed), 0, vBase);
    y += part;
    vBase += part;
    w = Math.max(8, Math.round((w * between(rand, 0.68, 0.85)) / spec.column) * spec.column);
    d = Math.max(8, d * between(rand, 0.7, 0.86));
  }
  height = y - b.y0;
  // Coroa: caixa de máquinas, pináculo ou heliponto.
  const crown = rand();
  if (crown < 0.45) facadeBox(facade, b.x, y, b.z, w * 0.45, 3.5, d * 0.45, tone("#8b8781"), slab, WIN_ROOF);
  else if (crown < 0.62 && tall) facade.add(SHAPES.pyramid(), at(b.x, y, b.z, w * 0.9, w * 0.7, d * 0.9), color.clone().multiplyScalar(0.85), WIN_ROOF);
  else if (crown < 0.75 && tall) {
    ctx.solid.add(SHAPES.cyl8(), at(b.x, y, b.z, 0.5, 14 + rand() * 18, 0.5), tone("#c9cdd2"), FX_PLAIN);
  } else if (crown < 0.85) ctx.solid.add(SHAPES.cyl16(), at(b.x, y, b.z, Math.min(w, d) * 0.7, 0.3, Math.min(w, d) * 0.7), tone("#5c5f63"), FX_PLAIN);
  if (height > 30) ctx.roofs.push({ x: b.x, z: b.z, y, size: Math.min(w, d) });
  // Luz vermelha de aviação nos mais altos (pisca à noite).
  if (height > 70) {
    const red = tone("#ff3b30");
    ctx.solid.add(SHAPES.cube(), at(b.x + w * 0.4, y + 0.6, b.z + d * 0.4, 0.5, 0.5, 0.5), red, fx(2, rand() + 0.01));
    if (ctx.timeOfDay !== "day") ctx.halos.add(b.x + w * 0.4, y + 0.8, b.z + d * 0.4, red, 3, rand() + 0.01);
  }
}

// --------------------------------------------------------- modernista

/**
 * Esplanada (Brasília): gramado aberto dos dois lados, fileiras de blocos
 * brancos iguais (ministérios) e, longe, superquadras de prédios baixos em
 * pilotis entre árvores.
 */
function modernist(ctx: CityContext) {
  const { spec, rand, avenue } = ctx;
  const L = avenue.length;
  const white = tone("#f2f1ec");
  const slab = tone("#9a9894");
  // Ministérios: uma fileira de cada lado, blocos iguais de frente para o gramado, em pilotis.
  const zMin = ctx.frontZ + 70;
  const blocks = ctx.performance ? 7 : 10;
  for (const side of [-1, 1] as const) {
    for (let index = 0; index < blocks; index += 1) {
      const x = L * 0.12 + index * 46;
      if (x > ctx.roadEnd - 70) break;
      const z = side * (zMin + 9);
      if (isReserved(ctx, x - 16, x + 16, z - 50, z + 50)) continue;
      facadeBox(ctx.facade, x, 3.5, z, 16, 34, 92, white, slab, win(WIN.ribbon, spec.column, spec.floor, Math.floor(rand() * 997)));
      for (const dz of [-40, -20, 0, 20, 40]) for (const dx of [-6, 6]) ctx.solid.add(SHAPES.box(), at(x + dx, 0, z + dz, 0.9, 3.6, 0.9), white, FX_PLAIN);
    }
  }
  // Superquadras: blocos de 6 andares em pilotis, em grupos, com árvores.
  const superBlock = 260;
  for (let gx = -ctx.reach; gx < L + ctx.reach; gx += superBlock) {
    for (const side of [-1, 1] as const) {
      for (let gz = zMin + 80; gz < ctx.reach; gz += superBlock) {
        const cx = gx + superBlock / 2;
        const cz = side * (gz + superBlock / 2);
        const dist = Math.hypot(Math.max(0, -cx, cx - L), gz + superBlock / 2);
        if (dist > ctx.reach) continue;
        if (isReserved(ctx, gx, gx + superBlock, cz - superBlock / 2, cz + superBlock / 2) || isWater(ctx, cx, cz, 60)) continue;
        const detail = dist < (ctx.performance ? 300 : 420);
        const slabs = detail ? 6 : 3;
        for (let k = 0; k < slabs; k += 1) {
          const along = rand() < 0.5;
          const x = gx + 30 + rand() * (superBlock - 60);
          const z = cz + (rand() - 0.5) * (superBlock - 70);
          const floors = Math.max(3, floorsIn(rand, spec.back));
          const h = floors * spec.floor;
          facadeBox(ctx.facade, x, 3, z, along ? 80 : 13, h, along ? 13 : 80, vary(rand, pickOne(rand, ctx.city.facade)), slab, win(WIN.ribbon, spec.column, spec.floor, Math.floor(rand() * 997)));
        }
        if (detail && !ctx.performance) for (let k = 0; k < 8; k += 1) tree(ctx, rand, gx + rand() * superBlock, cz + (rand() - 0.5) * superBlock, 1.2);
      }
    }
  }
  // Reserva da esplanada (nada nasce no gramado central).
  reserve(ctx, L / 2, 0, L, zMin - 2);
}
