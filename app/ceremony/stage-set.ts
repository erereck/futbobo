// Cenário da gala da Bola de Ouro: o teatro inteiro, pronto para receber o
// elenco. O palco 3D (`ballon-dor-stage.ts`) só monta: cria o renderer e a
// câmera, chama `buildGalaSet`, `attach(scene, renderer)`, põe os bonecos nas
// `marks` e a cada quadro chama `update(tempo, dt)` com as luzes/telão do beat.
//
// Unidades do boneco (FIGURE_HEIGHT ≈ 39,7; x para a direita de quem olha da
// plateia, z para a plateia, y para cima). As marcas vêm de `stage-direction.ts`
// (a direção de cena): o cenário é construído em volta delas, então mudar uma
// marca lá move praticável, púlpito e coluna aqui.
//
// Orçamento: ~19 draw calls com tudo aceso (o troféu sozinho são 5), ~17 no
// modo desempenho (sem reflexo no chão, sem sombra, menos plateia/poeira/confete).
// Nada aloca por quadro; `dispose()` solta toda geometria, material e textura.
//
// Ajuste de renderer recomendado: ACESFilmic, exposição ~1,05, sRGB. A sombra
// (ligar e o tipo) fica com quem cria o renderer: o `attach` não mexe nela.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { FIGURE_HEIGHT } from "../botao/three/character";
import { HANDOFF_SPOT, MARK_X, MARK_Z, PEDESTAL, PRESENTER_MARK, RISER, SCREEN, STAGE, WINNER_SPOT, floorAt as directionFloorAt, yawTo } from "./stage-direction";
import { buildArchitecture, type GalaArchitecture, type GalaArchitectureLayout } from "./stage-gala-architecture";
import { AUDIENCE_HEAD_TOP, GalaAudience } from "./stage-gala-audience";
import { GalaConfetti, GalaHaze, GlowPoints } from "./stage-gala-fx";
import { GalaScreen, type GalaScreenContent } from "./stage-gala-screen";
import { SPOT, SPOT_COUNT, SPOT_GOLD, SPOT_WHITE, SpotRig, type SpotColor, type SpotDef } from "./stage-gala-spots";
import { createTrophy, type Trophy } from "./stage-trophy";

export { SPOT, SPOT_COUNT, type SpotColor } from "./stage-gala-spots";
export type { GalaScreenContent } from "./stage-gala-screen";

export type GalaFinalistInfo = {
  id: string;
  name: string;
  club: { name: string; shortName?: string; primary: string; secondary?: string };
};

export type GalaSetOptions = {
  season: number;
  performance: boolean;
  reducedMotion: boolean;
  /** Da esquerda para a direita de quem olha da plateia (a ordem de `input.finalists`). */
  finalists: GalaFinalistInfo[];
  /** Semente da plateia (roupas, quem aplaude). */
  seed?: number;
  /**
   * Cadeiras da primeira fileira deixadas vazias para figurantes de verdade
   * (`marks.frontRow`). Padrão: 4 fora do modo desempenho, 0 nele.
   */
  reserveFrontRow?: number;
};

/** Lugar no chão: pés em (x, y, z) e `yaw` na convenção do boneco (0 = de frente para a plateia, +z). */
export type GalaMark = { x: number; y: number; z: number; yaw: number };

export type GalaShot = { position: THREE.Vector3; target: THREE.Vector3; fov: number };

type V3 = { x: number; y: number; z: number };

/**
 * Luz de um instante, no formato de `LightState` (`stage-shots.ts`): os alvos
 * são pontos no chão; ângulos em radianos (meio-ângulo do feixe).
 */
export type GalaLightState = {
  key: V3;
  keyI: number;
  keyAngle: number;
  fill: V3;
  fillI: number;
  fillAngle: number;
  wash: [V3, V3, V3, V3];
  washI: number;
  /** Brilho do telão (1 = normal). */
  screen: number;
  /** Luz da sala (0..1): plateia, arandelas, lustre, preenchimento geral. */
  house: number;
  /** Facho fino de cima no troféu da coluna (0..1). */
  trophyBeam: number;
};

// ------------------------------------------------------------- planta

/** O apresentador fala com a plateia, um pouco virado para os finalistas (igual a `stage-direction`). */
const PRESENTER_EYE = { x: -40, z: 260 };
/** Os finalistas olham para o meio da plateia (igual a `stage-direction`). */
const AUDIENCE_EYE = { x: 0, z: 330 };
/** Púlpito: à frente do apresentador, nesta distância (centro do móvel). */
const LECTERN_AHEAD = 12;
/** Altura do tampo do púlpito acima do piso onde ele está. */
export const LECTERN_HEIGHT = 21;
/** Altura da coluna do troféu acima do praticável (onde o pé do troféu apoia). */
export const PEDESTAL_HEIGHT = 20.5;

const PROSCENIUM = { z: 58, halfWidth: 214, sideTop: 236, crown: 268, columnX: 230 };
const TRUSS = { y: 238, z: -110, halfWidth: 236 };
const HALL = { halfWidth: 300, backZ: 660, ceiling: 340, firstRow: 124, rowSpacing: 22, rowRise: 4.4, aisle: 18, seat: 17.5, seatsHalfWidth: 272 };
const COLUMNS = { x: 192, z: -119, bottom: 6, width: 20, height: 200 };
/** Cadeiras reservadas para figurantes começam depois deste |x|. */
const FRONT_ROW_MIN_X = 120;

/** Chão em (x, z): palco, degrau e praticável (da direção) e a plateia na frente do palco. */
export function galaFloorAt(x: number, z: number) {
  if (z > STAGE.front || x < STAGE.left || x > STAGE.right) return STAGE.pit;
  return directionFloorAt(x, z);
}

/** Topo das cabeças da plateia sentada em `z`, contínuo entre as fileiras (-Infinity antes da primeira). */
export function audienceHeadTop(z: number) {
  if (z < HALL.firstRow - HALL.rowSpacing / 2) return -Infinity;
  const row = (z - HALL.firstRow) / HALL.rowSpacing;
  return STAGE.pit + Math.max(0, row - 1) * HALL.rowRise + AUDIENCE_HEAD_TOP;
}

function spotDefs(): SpotDef[] {
  const washY = TRUSS.y - 9;
  const washZ = TRUSS.z + 2;
  const wash = (x: number, target: V3, index: number): SpotDef => ({
    origin: [x, washY, washZ],
    target: [target.x, target.y, target.z],
    angle: 0.13,
    intensity: 0.6,
    color: "#ffd9a6",
    beam: 0.5,
    light: 3.2,
    penumbra: 0.55,
    sweep: (t, out) => out.set((index - 1.5) * 95 + 70 * Math.sin(t * 1.15 + index * 1.7), 0, -30 + 34 * Math.cos(t * 0.8 + index)),
  });
  const presenterFloor = { x: PRESENTER_MARK.x, y: RISER.top, z: PRESENTER_MARK.z };
  const pedestalTop = { x: PEDESTAL.x, y: RISER.top + PEDESTAL_HEIGHT, z: PEDESTAL.z };
  const sweeper = (side: number): SpotDef => ({
    origin: [side * (TRUSS.halfWidth - 30), washY, washZ],
    target: [-side * 130, STAGE.pit, 260],
    angle: 0.07,
    intensity: 0,
    color: SPOT_WHITE,
    beam: 0.6,
    light: 0,
    penumbra: 0.4,
    sweep: (t, out) => out.set(side * 200 * Math.sin(t * 0.5 + side), STAGE.pit, 300 + 190 * Math.sin(t * 0.37 + side * 1.3)),
  });
  return [
    wash(MARK_X[0] - 20, { x: MARK_X[0], y: 0, z: MARK_Z }, 0),
    wash(MARK_X[1], { x: MARK_X[1], y: 0, z: MARK_Z }, 1),
    wash(MARK_X[2] + 20, { x: MARK_X[2], y: 0, z: MARK_Z }, 2),
    wash(PRESENTER_MARK.x + 46, presenterFloor, 3),
    {
      origin: [-46, 252, 432],
      target: [0, 0, MARK_Z],
      angle: 0.08,
      intensity: 1,
      color: SPOT_WHITE,
      beam: 0.24,
      light: 6.5,
      penumbra: 0.42,
      sweep: (t, out) => out.set(130 * Math.sin(t * 0.9), 0, 6 * Math.cos(t * 0.7)),
    },
    {
      origin: [58, 246, 440],
      target: [0, 0, -10],
      angle: 0.12,
      intensity: 0.35,
      color: SPOT_WHITE,
      beam: 0.2,
      light: 4.2,
      penumbra: 0.6,
      sweep: (t, out) => out.set(-130 * Math.sin(t * 0.9 + 0.6), 0, -12),
    },
    {
      origin: [PEDESTAL.x, washY, PEDESTAL.z - 12],
      target: [pedestalTop.x, pedestalTop.y, pedestalTop.z],
      angle: 0.045,
      intensity: 1,
      color: SPOT_GOLD,
      beam: 0.9,
      light: 0,
      penumbra: 0.3,
      sweep: (_t, out) => out.set(pedestalTop.x, pedestalTop.y, pedestalTop.z),
    },
    sweeper(-1),
    sweeper(1),
  ];
}

function hallRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    z: HALL.firstRow + index * HALL.rowSpacing,
    y: STAGE.pit + Math.max(0, index - 1) * HALL.rowRise,
  }));
}

/** Ambiente do metal (PMREM da sala neutra do three): gerado uma vez, barato. */
function goldEnvironment(renderer: THREE.WebGLRenderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const texture = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  return texture;
}

// ------------------------------------------------------------------ set

export class GalaSet {
  /** O teatro inteiro (deixe na origem: marcas e planos são em coordenadas de mundo). */
  readonly group = new THREE.Group();
  readonly options: GalaSetOptions;
  /**
   * Marcas de cena (pés no chão, `yaw` do boneco):
   * - `finalists`: os três, da esquerda para a direita de quem olha da plateia;
   * - `presenter`: atrás do púlpito; `lectern`: o móvel (centro da base, tampo em `y + LECTERN_HEIGHT`);
   * - `handoff`: onde o vencedor recebe (`winner`, no praticável) e de onde o apresentador entrega;
   * - `pedestal`: pé da coluna e `top` (onde o troféu apoia);
   * - `frontRow`: cadeiras vazias da primeira fila para figurantes (de frente para o palco).
   */
  readonly marks: {
    finalists: [GalaMark, GalaMark, GalaMark];
    presenter: GalaMark;
    lectern: GalaMark;
    handoff: { winner: GalaMark; presenter: GalaMark };
    pedestal: { x: number; y: number; z: number; top: number };
    frontRow: GalaMark[];
  };
  /** Enquadramentos conferidos no laboratório (sugestões; a direção tem os planos de verdade). */
  readonly shots: { audience: GalaShot; finalists: GalaShot; closeUp: GalaShot; hero: GalaShot };
  /** A Bola de Ouro (de `stage-trophy.ts`) já em cima da coluna; pode trocar de pai (mãos). */
  readonly trophy: Trophy;
  /** Fundo e névoa do teatro (o `attach` põe na cena). */
  readonly background = new THREE.Color("#030204");
  readonly fog = new THREE.FogExp2("#050307", 0.00105);

  private readonly architecture: GalaArchitecture;
  private readonly spots: SpotRig;
  private readonly screen: GalaScreen;
  private readonly audience: GalaAudience;
  private readonly haze: GalaHaze;
  private readonly confetti: GalaConfetti;
  private readonly glows: GlowPoints;
  private readonly hemisphere: THREE.HemisphereLight;
  private readonly screenLight: THREE.PointLight | null;
  private environment: THREE.Texture | null = null;
  private house = 0.4;
  private houseWanted = 0.4;
  private screenBright = 1;
  private applauseLevel = 0;
  private time = 0;
  private disposed = false;

  constructor(options: GalaSetOptions) {
    this.options = options;
    this.group.name = "gala-set";
    const performance = options.performance;

    // --------------------------------------------------------- marcas
    const finalists = [0, 1, 2].map((index) => {
      const home = { x: MARK_X[index], z: MARK_Z };
      return { x: home.x, y: galaFloorAt(home.x, home.z), z: home.z, yaw: yawTo(home, AUDIENCE_EYE) };
    }) as [GalaMark, GalaMark, GalaMark];
    const presenterYaw = yawTo(PRESENTER_MARK, PRESENTER_EYE);
    const presenter = { x: PRESENTER_MARK.x, y: galaFloorAt(PRESENTER_MARK.x, PRESENTER_MARK.z), z: PRESENTER_MARK.z, yaw: presenterYaw };
    const lectern = {
      x: presenter.x + Math.sin(presenterYaw) * LECTERN_AHEAD,
      y: presenter.y,
      z: presenter.z + Math.cos(presenterYaw) * LECTERN_AHEAD,
      yaw: presenterYaw,
    };
    const pedestalY = galaFloorAt(PEDESTAL.x, PEDESTAL.z);
    const pedestal = { x: PEDESTAL.x, y: pedestalY, z: PEDESTAL.z, top: pedestalY + PEDESTAL_HEIGHT };
    const reserve = Math.max(0, Math.min(8, options.reserveFrontRow ?? (performance ? 0 : 4)));
    // Fora do miolo (|x| > 120): no meio eles tapariam o plano aberto da foto oficial.
    const firstFree = Math.ceil((FRONT_ROW_MIN_X - HALL.aisle - HALL.seat / 2) / HALL.seat);
    const reserved = Array.from({ length: reserve }, (_, index) => {
      const side = index % 2 ? 1 : -1;
      const slot = firstFree + Math.floor(index / 2);
      return { row: 0, x: side * (HALL.aisle + HALL.seat / 2 + slot * HALL.seat) };
    });

    // --------------------------------------------------- arquitetura
    const rows = hallRows(performance ? 16 : 22);
    const layout: GalaArchitectureLayout = {
      stage: { ...STAGE },
      riser: { ...RISER },
      screen: { ...SCREEN },
      columns: COLUMNS,
      marks: finalists.map((mark) => ({ x: mark.x, z: mark.z })),
      winner: { ...WINNER_SPOT },
      ring: { x: 0, z: 20, radius: 46 },
      lectern: { x: lectern.x, z: lectern.z, yaw: lectern.yaw, y: lectern.y },
      pedestal: { x: pedestal.x, z: pedestal.z, y: pedestal.y, top: pedestal.top },
      proscenium: PROSCENIUM,
      truss: TRUSS,
      hall: { halfWidth: HALL.halfWidth, backZ: HALL.backZ, ceiling: HALL.ceiling, rows, rowDepth: HALL.rowSpacing },
      stairs: { halfWidth: 56, tread: 8, steps: 3 },
      balconies: [118, 188],
      season: options.season,
    };
    this.architecture = buildArchitecture(layout, { performance });
    this.group.add(this.architecture.group);

    // ------------------------------------------------------- telão
    this.screen = new GalaScreen(
      { x: 0, z: SCREEN.z, bottom: SCREEN.bottom, width: SCREEN.width, height: SCREEN.height },
      COLUMNS,
      [
        { y: 0, x0: STAGE.left, x1: STAGE.right, z0: RISER.stepFront, z1: STAGE.front },
        { y: RISER.top, x0: RISER.left, x1: RISER.right, z0: RISER.back, z1: RISER.front },
      ],
      { season: options.season, performance, reducedMotion: options.reducedMotion },
    );
    this.screen.set({ kind: "title", season: options.season });
    this.group.add(this.screen.mesh);
    if (this.screen.reflection) this.group.add(this.screen.reflection);

    // ----------------------------------------------------- holofotes
    this.spots = new SpotRig(spotDefs(), { floorAt: galaFloorAt }, performance);
    this.group.add(this.spots.group);
    this.glows = new GlowPoints(this.architecture.glows, SPOT_COUNT);
    this.group.add(this.glows.points);

    // ---------------------------------------------------- luz da sala
    this.hemisphere = new THREE.HemisphereLight("#5a4c6e", "#1a0c08", 0.5);
    this.hemisphere.name = "gala-house";
    this.group.add(this.hemisphere);
    this.screenLight = null;
    if (!performance) {
      // O telão é uma parede de luz atrás do elenco: contraluz na cor da arte.
      // Pontual com alcance: acende o palco e morre antes da plateia.
      const light = new THREE.PointLight("#ffb24a", 1, 330, 0);
      light.position.set(0, SCREEN.bottom + SCREEN.height * 0.55, SCREEN.z + 14);
      light.name = "gala-screen-light";
      this.group.add(light);
      this.screenLight = light;
    }

    // ------------------------------------------------------- plateia
    this.audience = new GalaAudience({
      rows,
      halfWidth: HALL.seatsHalfWidth,
      aisle: HALL.aisle,
      seat: HALL.seat,
      reserved,
      seed: options.seed ?? options.season * 7 + 13,
    }, options.reducedMotion);
    this.group.add(this.audience.mesh, this.audience.phones);

    // ------------------------------------------------- poeira e confete
    this.haze = new GalaHaze(
      { min: new THREE.Vector3(-250, -4, STAGE.back), max: new THREE.Vector3(250, 280, 360) },
      performance ? 380 : 1000,
      this.spots.hazeUniforms,
    );
    this.group.add(this.haze.points);
    const confettiCount = Math.round((performance ? 420 : 1100) * (options.reducedMotion ? 0.55 : 1));
    this.confetti = new GalaConfetti({
      count: confettiCount,
      top: TRUSS.y - 6,
      riser: RISER,
      reducedMotion: options.reducedMotion,
      rainCenter: { x: 0, y: 0, z: -24 },
      rainSize: { x: 330, z: 170 },
    });
    this.group.add(this.confetti.mesh);

    // ------------------------------------------------------- troféu
    this.trophy = createTrophy(null);
    this.trophy.root.position.set(pedestal.x, pedestal.top, pedestal.z);
    this.group.add(this.trophy.root);

    const frontRow = this.audience.reservedSeats.map((seat) => ({ x: seat.x, y: seat.y, z: seat.z - 4, yaw: Math.PI }));
    const winnerY = galaFloorAt(WINNER_SPOT.x, WINNER_SPOT.z);
    const handoffY = galaFloorAt(HANDOFF_SPOT.x, HANDOFF_SPOT.z);
    this.marks = {
      finalists,
      presenter,
      lectern,
      handoff: {
        winner: { x: WINNER_SPOT.x, y: winnerY, z: WINNER_SPOT.z, yaw: yawTo(WINNER_SPOT, HANDOFF_SPOT) },
        presenter: { x: HANDOFF_SPOT.x, y: handoffY, z: HANDOFF_SPOT.z, yaw: yawTo(HANDOFF_SPOT, WINNER_SPOT) },
      },
      pedestal,
      frontRow,
    };

    const chest = FIGURE_HEIGHT * 0.68;
    this.shots = {
      audience: { position: new THREE.Vector3(0, 112, 600), target: new THREE.Vector3(0, 58, -70), fov: 40 },
      finalists: { position: new THREE.Vector3(0, 40, 200), target: new THREE.Vector3(0, 24, -3), fov: 32 },
      closeUp: { position: new THREE.Vector3(finalists[1].x + 8, chest + 4, finalists[1].z + 62), target: new THREE.Vector3(finalists[1].x, chest + 3, finalists[1].z), fov: 30 },
      hero: { position: new THREE.Vector3(18, 13, -2), target: new THREE.Vector3(WINNER_SPOT.x, winnerY + 36, WINNER_SPOT.z), fov: 38 },
    };

    this.setHouseLights(0.4, true);
    this.update(0, 0);
  }

  /**
   * Põe o teatro na cena: grupo, fundo, névoa e mapa de ambiente do ouro
   * (troféu e molduras). Chame uma vez, antes de compilar/aquecer os shaders.
   */
  attach(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    scene.add(this.group);
    scene.background = this.background;
    scene.fog = this.fog;
    if (!this.environment) this.environment = goldEnvironment(renderer);
    const environment = this.environment;
    for (const material of this.architecture.metals) {
      material.envMap = environment;
      material.needsUpdate = true;
    }
    this.trophy.root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      const material = mesh.material as THREE.MeshStandardMaterial | undefined;
      if (mesh.isMesh && material && "envMap" in material) {
        material.envMap = environment;
        material.needsUpdate = true;
      }
    });
  }

  // ------------------------------------------------------------ telão

  /** Troca a arte do telão (só redesenha se mudou; entra com cortina dourada). */
  setScreen(content: GalaScreenContent) {
    this.screen.set(content);
  }

  /** Brilho do telão (1 = normal) — e da contraluz que ele joga no palco. */
  setScreenBrightness(value: number) {
    this.screenBright = Number.isFinite(value) ? Math.max(0, value) : 1;
    this.screen.setBrightness(this.screenBright);
  }

  // -------------------------------------------------------- holofotes

  /**
   * Mira o holofote `index` (`SPOT.*`) num ponto do mundo. Sem `snap`, o
   * aparelho vai até lá com mola (operador de canhão); com `snap`, pula.
   */
  aim(index: number, target: THREE.Vector3Like, snap = false) {
    this.spots.aim(index, target, snap);
  }

  /** Intensidade (0..~1,5), cor ("white", "gold" ou CSS) e meio-ângulo do feixe; suaves sem `snap`. */
  setSpot(index: number, values: { intensity?: number; color?: SpotColor; angle?: number }, snap = false) {
    this.spots.set(index, values, snap);
  }

  /** Varredura da abertura: todos os holofotes passeiam pelo palco e pela plateia; desligar volta às miras. */
  setSweep(on: boolean, snap = false) {
    this.spots.setSweep(on, snap);
  }

  /** Quanto o ar brilha dentro dos feixes (1 = padrão; menos em close para não lavar o rosto). */
  setBeamStrength(value: number) {
    this.spots.setBeamStrength(value);
  }

  /** Luz da sala 0..1 (plateia, arandelas, lustre, preenchimento). */
  setHouseLights(level: number, snap = false) {
    this.houseWanted = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0.4;
    if (snap) this.house = this.houseWanted;
  }

  /**
   * Aplica um `LightState` da direção (`stage-shots.ts`) direto, sem suavizar
   * (a direção já mistura os planos). Holofotes dos móveis e cores ficam com
   * o que foi pedido por `setSpot`/`setSweep`.
   */
  applyLights(state: GalaLightState) {
    const spots = this.spots;
    spots.aim(SPOT.key, state.key, true);
    spots.set(SPOT.key, { intensity: state.keyI, angle: state.keyAngle }, true);
    spots.aim(SPOT.fill, state.fill, true);
    spots.set(SPOT.fill, { intensity: state.fillI, angle: state.fillAngle }, true);
    for (let index = 0; index < 4; index += 1) {
      spots.aim(SPOT.wash[index], state.wash[index], true);
      spots.set(SPOT.wash[index], { intensity: state.washI }, true);
    }
    spots.set(SPOT.trophy, { intensity: state.trophyBeam }, true);
    this.setScreenBrightness(state.screen);
    this.setHouseLights(state.house, true);
  }

  /** Depois de um salto no relógio: o próximo `update` põe holofotes e transições no lugar, sem deslizar. */
  snap() {
    this.spots.snap();
  }

  // ---------------------------------------------------------- plateia

  /** Palmas 0..1 (0 para); `standing` levanta quem quer (ovação). */
  applause(level: number, standing = false) {
    this.applauseLevel = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
    this.audience.setApplause(this.applauseLevel, standing);
  }

  /** Celulares erguidos (acendem um a um; flashes só sem movimento reduzido). */
  phones(on: boolean) {
    this.audience.setPhones(on);
  }

  // ---------------------------------------------------------- confete

  /** Estouro de papel dourado do teto sobre `at` (x/z do mundo). `startTime` no relógio do `update`. */
  burst(at: THREE.Vector3Like, startTime?: number) {
    this.confetti.burst(at, startTime);
  }

  /** Chuva contínua de papel (0 para, 1 cheia), opcionalmente centrada em `center`. */
  rain(amount: number, center?: THREE.Vector3Like) {
    this.confetti.setRain(amount, center);
  }

  /** Cor de um dos quatro papéis (0..3; padrão ouro, ouro claro, branco, ouro velho). */
  setConfettiColor(index: number, color: string) {
    this.confetti.setColor(index, color);
  }

  // ----------------------------------------------------------- quadro

  /** Anima tudo. `time` é o relógio do roteiro; `dt` 0 depois de um salto (encaixa sem deslizar). */
  update(time: number, dt: number) {
    if (this.disposed) return;
    this.time = time;
    const step = dt > 0 ? Math.min(dt, 0.1) : 0;
    this.house = step > 0 ? this.house + (this.houseWanted - this.house) * (1 - Math.exp(-3 * step)) : this.houseWanted;
    const house = this.house;

    this.spots.update(time, dt);
    for (let index = 0; index < SPOT_COUNT; index += 1) {
      const lens = this.spots.lens[index];
      this.glows.setLens(index, lens.position, lens.dir, lens.color);
    }
    this.glows.commit();
    this.glows.setLevels(0.25 + 0.85 * house, 0.75 + 0.25 * this.screenBright, 1);
    this.glows.update(time);

    this.screen.update(time, dt);
    if (this.screenLight) {
      this.screenLight.color.copy(this.screen.tint);
      this.screenLight.intensity = 1.6 * this.screenBright;
    }
    this.hemisphere.intensity = 0.3 + 0.9 * house;

    const stageLevel = Math.min(1.4, 0.35 + 0.4 * this.screenBright + 0.3 * this.spots.washAmount / 3.2);
    this.architecture.setLighting(house, stageLevel);
    this.audience.setLighting(house, stageLevel);
    this.audience.update(time, dt);
    this.haze.update(time);
    this.confetti.update(time, dt);
  }

  /** Texturas para subir antes do primeiro quadro (`renderer.initTexture`). */
  textures(): THREE.Texture[] {
    return [...this.architecture.textures, ...this.screen.textureList(), ...this.trophy.textures];
  }

  /** Relógio do último `update`. */
  get clock() {
    return this.time;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.group.removeFromParent();
    this.architecture.dispose();
    this.screen.dispose();
    this.spots.dispose();
    this.glows.dispose();
    this.audience.dispose();
    this.haze.dispose();
    this.confetti.dispose();
    this.trophy.dispose();
    this.hemisphere.dispose();
    this.screenLight?.dispose();
    this.environment?.dispose();
    this.environment = null;
  }
}

/** Monta o teatro da gala (ver `GalaSet`). */
export function buildGalaSet(options: GalaSetOptions): GalaSet {
  return new GalaSet(options);
}
