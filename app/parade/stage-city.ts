// Cidade procedural da festa do título.
//
// Unidades em METROS. A avenida corre em +x de 0 até `avenue.length`, centrada
// em z = 0: pista com `avenue.width` de largura, depois as calçadas onde fica a
// multidão (de |z| = width/2 até width/2 + crowdDepth) e então os prédios.
//
// Orçamento: a cidade inteira cabe em 4 a 8 draw calls (sólidos, fachadas,
// mar, nuvens, brilhos, fogos e, em duas cidades, uma peça móvel). Tudo que é
// parado é fundido em coordenadas do mundo; janelas, luzes, bandeiras ao vento,
// ondas e fogos são animados no shader. Sem sombra, sem textura de imagem (só
// o atlas de nuvens pintado em canvas).

import * as THREE from "three";
import { cityUniforms, facadeMaterial, festive, hashText, makeRand, MeshBuilder, solidMaterial, tone } from "./city-kit";
import { buildClouds, buildFireworks, buildSea, HaloSet, type WaterPatch } from "./city-fx";
import { styleSpec, type CityContext } from "./city-plan";
import { buildBlocks, buildGround, buildStreetDressing } from "./city-blocks";
import { buildAntennas, buildLandmarks, planLandmarks, shapeTerrain } from "./city-landmarks";
import type { ParadeCity, ParadeTimeOfDay } from "./parade-script";

export type AvenueLayout = {
  /** Comprimento da avenida (m). O trio anda de ~0,15 a ~0,85 dela durante a cena. */
  length: number;
  /** Largura da pista (m). */
  width: number;
  /** Profundidade da faixa de público de cada lado (m). */
  crowdDepth: number;
  /** Lado do mar/vazio (estilo "beach"): +1 (z > 0), -1, ou 0 se há prédios dos dois lados. */
  openSide: -1 | 0 | 1;
};

export type CityLighting = {
  skyTop: string;
  skyHorizon: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  /** Direção DE ONDE vem o sol/lua (normalizada). */
  sunDirection: THREE.Vector3;
  sunColor: string;
  sunIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
};

export type CityBuild = {
  group: THREE.Group;
  avenue: AvenueLayout;
  lighting: CityLighting;
  /** Onde estão os marcos (para a câmera enquadrar no plano aéreo). */
  landmarks: Array<{ id: string; position: THREE.Vector3; height: number }>;
  /** Altura típica (m) dos telhados da primeira fileira de prédios da avenida (a câmera passa acima disso). */
  roofHeight: number;
  /** Distância (m) até onde a câmera precisa enxergar para os marcos do horizonte não serem cortados. */
  viewDistance: number;
  /** Fogos no céu (só tarde/noite) — chame `fireworks(true)` no estouro. */
  fireworks(on: boolean): void;
  /**
   * Opcional: onde os fogos sobem (m). `area`: faixa x0..x1, |z| até `z`, estouro a
   * ~`height`; `focus`: parte dos foguetes (`share`) concentrada perto de onde o
   * plano final olha. Sem chamar, vale a avenida inteira.
   */
  aimFireworks?(area: { x0: number; x1: number; z: number; height: number }, focus?: { x: number; z: number; rx: number; rz: number; share: number }): void;
  update(time: number, dt: number): void;
  dispose(): void;
};

// ------------------------------------------------------------- luz

type LightPreset = CityLighting & { reflLow: string; reflHigh: string };

function lightingFor(timeOfDay: ParadeTimeOfDay, rand: () => number, farBoost: number): LightPreset {
  const jitter = (rand() - 0.5) * 0.7;
  const turn = (v: THREE.Vector3) => v.applyAxisAngle(new THREE.Vector3(0, 1, 0), jitter).normalize();
  const hue = (hex: string, amount = 0.012) => `#${tone(hex, 0, 0, (rand() - 0.5) * amount).getHexString(THREE.SRGBColorSpace)}`;
  if (timeOfDay === "sunset") {
    const horizon = hue("#f4a273", 0.02);
    return {
      skyTop: hue("#43568f"),
      skyHorizon: horizon,
      fog: horizon,
      fogNear: 140,
      fogFar: 1000 + farBoost,
      // Sol baixo lá no fim da avenida: quem olha a avenida vê o pôr do sol.
      sunDirection: turn(new THREE.Vector3(0.88, 0.13, 0.45)),
      sunColor: "#ffb06e",
      sunIntensity: 2.1,
      hemiSky: "#ffc7a2",
      hemiGround: "#4b3b42",
      hemiIntensity: 0.95,
      reflLow: "#ffb98a",
      reflHigh: "#6d6ea8",
    };
  }
  if (timeOfDay === "night") {
    const horizon = hue("#28335a");
    return {
      skyTop: "#070c22",
      skyHorizon: horizon,
      fog: horizon,
      fogNear: 110,
      fogFar: 900 + farBoost,
      sunDirection: turn(new THREE.Vector3(-0.35, 0.62, -0.7)),
      sunColor: "#a9bcff",
      sunIntensity: 0.6,
      hemiSky: "#5a6eac",
      hemiGround: "#2d2535",
      hemiIntensity: 0.85,
      reflLow: "#2c3a63",
      reflHigh: "#0d1430",
    };
  }
  const horizon = hue("#c6def1");
  return {
    skyTop: hue("#3f7fd6"),
    skyHorizon: horizon,
    fog: horizon,
    fogNear: 170,
    fogFar: 1100 + farBoost,
    sunDirection: turn(new THREE.Vector3(-0.45, 0.78, 0.45)),
    sunColor: "#fff2db",
    sunIntensity: 2.3,
    hemiSky: "#d9e9ff",
    hemiGround: "#6a6052",
    hemiIntensity: 1.15,
    reflLow: "#d6e8f7",
    reflHigh: "#6f9fd8",
  };
}

// ------------------------------------------------------------ cidade

export function buildCity(city: ParadeCity, options: { timeOfDay: ParadeTimeOfDay; seed: number; variant: number; performance: boolean; colors: [string, string] }): CityBuild {
  const seed = (options.seed ^ hashText(city.id) ^ Math.imul(options.variant + 1, 0x9e3779b1)) >>> 0;
  const rand = makeRand(seed);
  const spec = styleSpec(city);
  const sea = city.landmarks.includes("sea");
  const seafront = city.style === "beach" || (sea && city.landmarks.includes("palms") && city.style === "colonial");
  const openSide: -1 | 0 | 1 = seafront ? (options.variant % 2 === 0 ? 1 : -1) : 0;
  const avenue: AvenueLayout = { length: spec.length, width: spec.width, crowdDepth: spec.crowdDepth, openSide };
  const distant = city.landmarks.includes("mountain") || city.landmarks.includes("pyramid");
  const light = lightingFor(options.timeOfDay, rand, distant ? 260 : 0);
  const reach = light.fogFar * (options.performance ? 0.72 : 0.86);
  const half = avenue.width / 2;
  const crowdOuter = half + avenue.crowdDepth;
  const L = avenue.length;
  const night = options.timeOfDay === "night";
  const sunset = options.timeOfDay === "sunset";

  const ctx: CityContext = {
    city,
    rand,
    seed,
    variant: options.variant,
    performance: options.performance,
    timeOfDay: options.timeOfDay,
    colors: [festive(options.colors[0]), festive(options.colors[1])],
    avenue,
    spec,
    frontZ: crowdOuter + spec.walk + spec.boulevard,
    reach,
    roadEnd: L + reach,
    seaEndX: null,
    shoreZ: crowdOuter + 60,
    river: null,
    solid: new MeshBuilder([{ name: "aFx", size: 4 }], false, false),
    facade: new MeshBuilder([{ name: "aWin", size: 4 }, { name: "aFog", size: 1 }], true),
    halos: new HaloSet(),
    reserved: [],
    terrain: [],
    landmarks: [],
    roofs: [],
    frontTops: [],
    pool: null,
    movers: [],
    tickers: [],
  };
  // Duas cores iguais (ou quase) viram uma festa sem graça: a segunda cai para branco.
  const [first, second] = ctx.colors;
  if (Math.abs(first.r - second.r) + Math.abs(first.g - second.g) + Math.abs(first.b - second.b) < 0.15) ctx.colors[1] = new THREE.Color("#f4f2ec");

  const plan = planLandmarks(ctx);
  if (plan.seaEnd) ctx.seaEndX = L + 380;
  if (plan.end === "arch" || plan.end === "gate") ctx.roadEnd = plan.endX + 110;
  else if (plan.end === "colosseum") ctx.roadEnd = plan.endX - 95;
  else if (plan.end === "congress") ctx.roadEnd = plan.endX - 60;
  else if (plan.end) ctx.roadEnd = plan.endX - 34;
  if (ctx.seaEndX !== null) ctx.roadEnd = Math.min(ctx.roadEnd, ctx.seaEndX - 45);

  shapeTerrain(ctx, plan);
  const crosses = buildBlocks(ctx);
  buildGround(ctx, crosses);
  buildLandmarks(ctx, plan);
  buildStreetDressing(ctx);
  buildAntennas(ctx, plan);

  // ----------------------------------------------------------- água
  const water: WaterPatch[] = [];
  let shore = { out: new THREE.Vector2(0, 1), offset: 1e5 };
  if (openSide !== 0) {
    water.push({ origin: new THREE.Vector2(L / 2, openSide * (ctx.shoreZ - 14)), out: new THREE.Vector2(0, openSide), length: 9000, reach: 3200, foam: 1, amplitude: 0.45, y: -0.45 });
    shore = { out: new THREE.Vector2(0, openSide), offset: ctx.shoreZ };
  }
  if (ctx.seaEndX !== null) {
    water.push({ origin: new THREE.Vector2(ctx.seaEndX - 14, 0), out: new THREE.Vector2(1, 0), length: 9000, reach: 3200, foam: 1, amplitude: 0.45, y: -0.45 });
    shore = { out: new THREE.Vector2(1, 0), offset: ctx.seaEndX };
  }
  if (ctx.river) {
    const r = ctx.river;
    water.push({ origin: new THREE.Vector2(L / 2, r.side * (r.near - 2)), out: new THREE.Vector2(0, r.side), length: 9000, reach: r.far - r.near + 4, foam: 0, amplitude: 0.12, y: -0.8 });
  }

  // --------------------------------------------------------- malhas
  const group = new THREE.Group();
  group.name = "parade-city";
  const uniforms = cityUniforms();
  uniforms.uGlow.value = night ? 1 : sunset ? 0.55 : 0;
  uniforms.uNight.value = night ? 1 : sunset ? 0.42 : 0;
  uniforms.uLit.value = night ? 0.38 : sunset ? 0.24 : 0.08;
  uniforms.uReflLow.value.set(light.reflLow);
  uniforms.uReflHigh.value.set(light.reflHigh);
  if (ctx.pool && options.timeOfDay !== "day") {
    uniforms.uPool.value.set(ctx.pool.spacing, ctx.pool.z, 9, night ? 5 : 2);
    uniforms.uPoolRange.value.set(ctx.pool.x0, ctx.pool.x1);
  }
  const solid = solidMaterial(uniforms);
  const facade = facadeMaterial(uniforms);
  const disposables: Array<{ dispose(): void }> = [solid, facade];
  const statics: THREE.Object3D[] = [];

  const solidMesh = new THREE.Mesh(ctx.solid.build(), solid);
  solidMesh.name = "parade-city-solid";
  const facadeMesh = new THREE.Mesh(ctx.facade.build(), facade);
  facadeMesh.name = "parade-city-facades";
  statics.push(solidMesh, facadeMesh);
  disposables.push(solidMesh.geometry, facadeMesh.geometry);

  let seaBuild: ReturnType<typeof buildSea> | null = null;
  if (water.length) {
    const seaColors = night
      ? { deep: "#0a1b30", shallow: "#1b3d50", foam: "#9fb4d0", light: 0.3 }
      : sunset
        ? { deep: "#1e4466", shallow: "#4f8f96", foam: "#ffe6d2", light: 0.75 }
        : { deep: "#0f5d86", shallow: "#3fb7b0", foam: "#ffffff", light: 1 };
    seaBuild = buildSea({
      patches: water,
      shore,
      ...seaColors,
      skyTop: light.skyTop,
      skyLow: light.skyHorizon,
      sunDirection: light.sunDirection,
      sunColor: light.sunColor,
      performance: options.performance,
    });
    statics.push(seaBuild.mesh);
    disposables.push(seaBuild);
  }

  let clouds: ReturnType<typeof buildClouds> | null = null;
  if (!night) {
    clouds = buildClouds({
      center: new THREE.Vector3(L / 2, 0, 0),
      radius: light.fogFar * 1.1,
      count: options.performance ? 12 : sunset ? 18 : 26,
      height: [230, 420],
      lit: sunset ? "#ffd3b4" : "#ffffff",
      shade: sunset ? "#86607d" : "#b5c3d6",
      opacity: sunset ? 0.85 : 0.95,
      far: light.fogFar * 1.02,
      seed,
    });
    group.add(clouds.mesh);
    disposables.push(clouds);
  }

  let halos: ReturnType<HaloSet["build"]> | null = null;
  if (options.timeOfDay !== "day" && ctx.halos.count) {
    halos = ctx.halos.build(night ? 1 : 0.55);
    statics.push(halos.points);
    disposables.push(halos);
  }

  const gold = new THREE.Color("#ffd257");
  const fireworks = buildFireworks({
    colors: [ctx.colors[0], ctx.colors[1], gold, ctx.colors[0].clone().lerp(new THREE.Color("#ffffff"), 0.35)],
    area: { x0: L * 0.12, x1: L * 1.05, z: crowdOuter + 140, height: 115 },
    shells: options.performance ? 10 : 20,
    sparks: options.performance ? 70 : 120,
    trails: !options.performance,
    intensity: night ? 1.7 : sunset ? 1.35 : 0.7,
    seed,
  });
  fireworks.points.visible = false;
  group.add(fireworks.points);
  disposables.push(fireworks);

  for (const mesh of ctx.movers) {
    if (mesh instanceof THREE.Mesh) {
      mesh.material = solid;
      disposables.push(mesh.geometry);
    }
    group.add(mesh);
  }
  for (const object of statics) {
    group.add(object);
    // Parado: matriz uma vez e fora do updateMatrixWorld de cada quadro.
    object.updateMatrix();
    object.matrixAutoUpdate = false;
  }

  const tops = ctx.frontTops.slice().sort((a, b) => a - b);
  const roofHeight = tops.length ? tops[Math.floor(tops.length * 0.75)] : 20;
  let viewDistance = light.fogFar * 1.05 + 80;
  for (const item of ctx.landmarks) viewDistance = Math.max(viewDistance, Math.hypot(item.position.x - L / 2, item.position.z) + L * 0.6);

  let pending: boolean | null = null;
  return {
    group,
    avenue,
    lighting: {
      skyTop: light.skyTop,
      skyHorizon: light.skyHorizon,
      fog: light.fog,
      fogNear: light.fogNear,
      fogFar: light.fogFar,
      sunDirection: light.sunDirection,
      sunColor: light.sunColor,
      sunIntensity: light.sunIntensity,
      hemiSky: light.hemiSky,
      hemiGround: light.hemiGround,
      hemiIntensity: light.hemiIntensity,
    },
    landmarks: ctx.landmarks,
    roofHeight,
    viewDistance: Math.min(3000, viewDistance),
    aimFireworks(area, focus) {
      fireworks.aim(area, focus);
    },
    fireworks(on) {
      // Liga no próximo `update`, com o relógio do roteiro (não o do quadro anterior).
      pending = on;
    },
    update(time) {
      uniforms.uTime.value = time;
      if (pending !== null) {
        fireworks.set(pending, time);
        pending = null;
      }
      fireworks.update(time);
      seaBuild?.update(time);
      clouds?.update(time);
      halos?.update(time);
      for (const tick of ctx.tickers) tick(time);
    },
    dispose() {
      group.removeFromParent();
      group.clear();
      for (const item of disposables) item.dispose();
    },
  };
}
