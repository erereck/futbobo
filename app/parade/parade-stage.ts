// Palco 3D da festa do título: a seleção campeã no alto de um trio elétrico
// descendo uma avenida lotada. Este arquivo monta tudo (cidade, multidão,
// trio, efeitos, time) e dirige a câmera; o resto mora em `stage-*.ts` e
// `director-*.ts`.
//
// Quem usa: `ParadeCutscene` carrega este módulo sob demanda, chama
// `prepare()` antes do primeiro quadro e depois `render(tempo, dt)` a cada
// quadro com o relógio do roteiro (`parade-script.ts`).
//
// Unidades do mundo: METROS. A avenida corre em +x a partir de x = 0, centrada
// em z = 0; y para cima. Os bonecos da partida (PlayerFigure, ~40 unidades de
// altura) entram com `root.scale` = PARADE_FIGURE_SCALE.
//
// Leve de propósito (WebView de celular): sem mapa de sombra, névoa
// escondendo a distância, céu num draw call só, mapa de ambiente só na taça.

import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { paradeBeatAt, type ParadeTimeline } from "./parade-script";
import { buildCity, type CityBuild } from "./stage-city";
import { buildCrowd, buildEffects, buildTrio, buildWorldCupTrophy, type CrowdBuild, type EffectsBuild, type TrioBuild } from "./stage-crowd";
import { createShot, directShot, fitAspect, keepInStreet, type DirectorFrame, type DirectorLandmark, type DirectorScene } from "./director-camera";
import { buildSky, type SkyDome } from "./director-sky";
import { ParadeTeam } from "./director-team";

/** Escala dos bonecos da partida para ~1,8 m de altura (FIGURE_HEIGHT = 32 × 1,24). */
export const PARADE_FIGURE_SCALE = 1.8 / (32 * 1.24);

export type ParadeStageOptions = {
  /** Modo desempenho 3D: menos gente, menos partículas, resolução menor. */
  performance: boolean;
  /** Sem tremida de câmera nem clarões. */
  reducedMotion: boolean;
  /** O WebGL caiu: quem usa troca para a versão 2D. */
  onContextLost?: () => void;
};

/** Números do último quadro (para medir o orçamento). */
export type ParadeStageStats = {
  calls: number;
  triangles: number;
  /** CPU do último `render` (ms, média móvel). */
  cpuMs: number;
  programs: number;
  geometries: number;
  textures: number;
};

/** Marcos que valem o plano aéreo, do mais reconhecível ao menos. */
const LANDMARK_RANK = [
  "christ", "eiffel", "sugarloaf", "gate", "arch", "obelisk", "congress", "cathedral", "colosseum", "masp",
  "elevador", "clock-tower", "windmill", "pyramid", "mountain", "bridge", "church",
];

/** 128 BPM: o pulso próprio quando a música não manda batida. */
const SYNTH_BEAT = 60 / 128;
/** Teto de pixels desenhados (telas 4K não pagam 4× o preço). */
const MAX_PIXELS = 2_400_000;

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);

function yieldFrame() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function lightness(hex: string) {
  const color = new THREE.Color(hex);
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

/** Terceira cor da festa: branco, ou dourado quando a seleção já tem branco. */
function thirdColor(primary: string, secondary: string) {
  return lightness(primary) > 0.75 || lightness(secondary) > 0.75 ? "#ffd23f" : "#ffffff";
}

const IDENTITY = new THREE.Matrix4();

/**
 * Varais de bandeirinhas cruzando a avenida na altura do deck (e marcos no
 * meio da pista): se a câmera dos closes do jogador passa rente a um deles, as
 * bandeirinhas enchem a tela. Acha onde eles cruzam a pista (vértices da
 * cidade acima do asfalto, lidos uma vez) e devolve quanto adiantar/atrasar o
 * trio para a janela dos closes caber entre dois deles (m).
 */
function clearCloseUps(group: THREE.Object3D, deck: number, speed: number, start: number, window: [number, number]): number {
  const crossings: number[] = [];
  const seen = new Set<number>();
  const point = new THREE.Vector3();
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh) return;
    const position = (object.geometry as THREE.BufferGeometry).getAttribute("position");
    if (!position) return;
    const identity = object.matrixWorld.equals(IDENTITY);
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index);
      if (!identity) point.applyMatrix4(object.matrixWorld);
      if (Math.abs(point.z) > 2.5 || point.y < deck + 0.6 || point.y > deck + 4) continue;
      const key = Math.round(point.x);
      if (seen.has(key)) continue;
      seen.add(key);
      crossings.push(point.x);
    }
  });
  if (!crossings.length) return 0;
  // A câmera dos closes fica ~10 m à frente do centro do trio.
  const lead = 10;
  const cost = (shift: number) => {
    let sum = 0;
    for (let t = window[0]; t <= window[1]; t += 0.1) {
      const x = start + shift + speed * t + lead;
      for (const crossing of crossings) sum += Math.max(0, 2.2 - Math.abs(x - crossing));
    }
    return sum;
  };
  let best = 0;
  let bestCost = cost(0);
  // Do menor deslocamento para o maior: o primeiro sem varal nenhum ganha.
  for (let step = 1; step <= 40 && bestCost > 0; step += 1) {
    for (const shift of [step * 0.5, -step * 0.5]) {
      const value = cost(shift);
      if (value < bestCost) {
        best = shift;
        bestCost = value;
      }
    }
  }
  return best;
}

type Cue = { at: number; window: number; done: boolean; fire: (time: number) => void };

export class ParadeStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.2, 1200);
  private readonly hemisphere = new THREE.HemisphereLight("#dbeaff", "#5a5248", 1);
  private readonly sun = new THREE.DirectionalLight("#fff3df", 2);
  /** Luz de recorte que segue a câmera: o time continua lido de noite. */
  private readonly fill = new THREE.DirectionalLight("#ffe7c4", 0.4);
  private city: CityBuild | null = null;
  private crowd: CrowdBuild | null = null;
  private trio: TrioBuild | null = null;
  private effects: EffectsBuild | null = null;
  private team: ParadeTeam | null = null;
  private sky: SkyDome | null = null;
  private env: THREE.Texture | null = null;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private director: DirectorScene | null = null;
  private readonly frame: DirectorFrame = {
    truck: new THREE.Vector3(),
    player: new THREE.Vector3(),
    team: new THREE.Vector3(),
    trophy: null,
    liftAt: 0,
  };
  private readonly shot = createShot();
  private readonly fit = { fov: 45, distance: 1 };
  private readonly trophyTop = new THREE.Vector3();
  private readonly playerSlot = new THREE.Vector3();
  private readonly teamSlot = new THREE.Vector3();
  private readonly cameraLocal = new THREE.Vector3(8, 6, 4);
  private readonly scratch = new THREE.Vector3();
  private cues: Cue[] = [];
  private speed = 3;
  private startX = 0;
  private laneZ = 0;
  private fireworksOn = false;
  private excitement = 0.5;
  private beatValue = 0;
  private beatStamp = 0;
  private lastTime = -1;
  private width = 0;
  private height = 0;
  private pixelRatio = 1;
  private cpuMs = 0;
  private exposure = 1;
  private ready = false;
  private lost = false;
  private disposed = false;
  private readonly onLost = (event: Event) => {
    event.preventDefault();
    if (this.lost) return;
    this.lost = true;
    this.options.onContextLost?.();
  };

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly timeline: ParadeTimeline,
    readonly options: ParadeStageOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !options.performance,
      alpha: false,
      stencil: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = false;
    canvas.addEventListener("webglcontextlost", this.onLost, false);
    this.scene.add(this.hemisphere, this.sun, this.sun.target, this.fill, this.fill.target);
  }

  /** Monta cidade, multidão e trio e compila os shaders: aguarde antes do primeiro `render`. */
  async prepare(): Promise<void> {
    if (this.ready || this.disposed) return;
    const input = this.timeline.input;
    const performance = this.options.performance;
    const primary = input.country.primary;
    const secondary = input.country.secondary;
    const third = thirdColor(primary, secondary);

    // ----------------------------------------------------------- cidade
    const city = buildCity(input.city, { timeOfDay: input.timeOfDay, seed: input.seed, variant: input.variant, performance, colors: [primary, secondary] });
    this.city = city;
    this.scene.add(city.group);
    const avenue = city.avenue;
    const light = city.lighting;
    this.scene.fog = new THREE.Fog(light.fog, light.fogNear, light.fogFar);
    this.scene.background = new THREE.Color(light.skyHorizon);
    this.hemisphere.color.set(light.hemiSky);
    this.hemisphere.groundColor.set(light.hemiGround);
    this.hemisphere.intensity = light.hemiIntensity;
    this.sun.color.set(light.sunColor);
    this.sun.intensity = light.sunIntensity;
    this.sun.position.copy(light.sunDirection).normalize().multiplyScalar(100);
    this.exposure = input.timeOfDay === "night" ? 1.18 : input.timeOfDay === "sunset" ? 1.06 : 1;
    this.renderer.toneMappingExposure = this.exposure;
    this.fill.intensity = input.timeOfDay === "night" ? 1.1 : input.timeOfDay === "sunset" ? 0.6 : 0.3;
    // Longe o bastante para os marcos do horizonte (a névoa esconde o resto).
    this.camera.far = Math.min(3000, Math.max(700, light.fogFar * 1.05 + 80, city.viewDistance || 0));
    this.sky = buildSky(light, input.timeOfDay);
    this.scene.add(this.sky.mesh);
    await yieldFrame();
    if (this.disposed) return;

    // ------------------------------------------------- povo, trio e efeitos
    this.crowd = buildCrowd({
      avenue,
      colors: [primary, secondary, third],
      seed: input.seed,
      variant: input.variant,
      timeOfDay: input.timeOfDay,
      performance,
      playerName: input.player.name,
      playerNumber: input.player.number,
      stars: input.stars,
      lozenge: input.country.id === "brasil",
    });
    this.scene.add(this.crowd.group);
    await yieldFrame();
    if (this.disposed) return;
    const trio = buildTrio({ colors: [primary, secondary], countryName: input.country.name, season: input.season, stars: input.stars, seed: input.seed, performance, timeOfDay: input.timeOfDay, thirdColor: third, lozenge: input.country.id === "brasil" });
    this.trio = trio;
    this.scene.add(trio.group);
    this.effects = buildEffects({ colors: [primary, secondary, third], avenue, performance, seed: input.seed });
    this.scene.add(this.effects.group);

    // Tamanho do trio antes de pôr gente em cima (a câmera usa o comprimento).
    // Medidas que o trio declara (opcional); sem elas, a caixa da malha.
    const measured = (trio as { size?: { front: number; back: number } }).size;
    const truckBox = measured ? null : new THREE.Box3().setFromObject(trio.group);
    const truckLength = measured ? measured.front - measured.back : truckBox && !truckBox.isEmpty() ? truckBox.max.x - truckBox.min.x : 14;
    const truckHalf = Math.min(14, Math.max(4, truckLength / 2));

    // Taça: ouro precisa de reflexo; o mapa de ambiente vai só nela (o resto
    // da cena não paga a amostra a mais por pixel).
    const trophy = buildWorldCupTrophy();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.envTarget = pmrem.fromScene(room, 0.04);
    this.env = this.envTarget.texture;
    room.dispose();
    pmrem.dispose();
    trophy.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial) {
          material.envMap = this.env;
          material.envMapIntensity = input.timeOfDay === "night" ? 1.25 : 1;
          material.needsUpdate = true;
        }
      }
    });

    // --------------------------------------------------------------- time
    const deckHeight = trio.deckHeight;
    // Lugares "no piso do deck": se vierem com y no chão do caminhão, sobe para o deck.
    const slots = trio.slots.map((slot) => (slot.y < deckHeight * 0.5 ? new THREE.Vector3(slot.x, deckHeight, slot.z) : slot.clone()));
    const side: 1 | -1 = input.variant === 1 ? -1 : 1;
    this.team = new ParadeTeam(trio.group, trophy, this.timeline, {
      slots,
      scale: PARADE_FIGURE_SCALE,
      maxFigures: performance ? 6 : 9,
      side,
    });
    this.playerSlot.copy(this.team.player.root.position);
    const figures = this.team.figures;
    this.teamSlot.set(0, 0, 0);
    for (const figure of figures) this.teamSlot.add(figure.root.position);
    this.teamSlot.multiplyScalar(1 / figures.length);
    await yieldFrame();
    if (this.disposed) return;

    // ------------------------------------------------------ percurso
    const duration = this.timeline.duration;
    // Trio de verdade anda a passo de gente: ~3 m/s, pelo miolo da avenida.
    this.speed = Math.min(3.8, Math.max(2.6, (avenue.length * 0.3) / duration));
    const travel = this.speed * duration;
    const baseStart = Math.max(avenue.length * 0.12, avenue.length * 0.5 - travel * 0.55);
    this.startX = baseStart + clearCloseUps(city.group, trio.deckHeight, this.speed, baseStart, this.closeUpWindow());
    // Faixa do trio: muda com a variação, mas deixa espaço para a câmera entre ele e o povo.
    this.laneZ = [0, -1, 1][input.variant % 3] * Math.min(avenue.width * 0.12, Math.max(0, avenue.width / 2 - 6.5));

    const ranked = city.landmarks
      .map((item) => ({ item, rank: LANDMARK_RANK.indexOf(item.id) }))
      .filter((entry) => entry.rank >= 0)
      .sort((a, b) => a.rank - b.rank || b.item.height - a.item.height)
      .map((entry): DirectorLandmark => ({ position: entry.item.position.clone(), height: entry.item.height }));
    const hero = ranked[0] ?? null;
    // Com dois marcos, o final mostra o outro (Rio: Cristo na abertura, Pão de Açúcar no fim).
    const finale = input.variant !== 0 && ranked[1] ? ranked[1] : hero;
    this.director = {
      timeline: this.timeline,
      variant: input.variant % 3,
      side,
      avenue,
      deckHeight,
      truckHalfLength: truckHalf,
      roofHeight: Number.isFinite(city.roofHeight) ? city.roofHeight : 30,
      heroLandmark: hero,
      finaleLandmark: finale,
      fireworks: input.timeOfDay !== "day",
    };
    this.frame.liftAt = this.timeline.trophyLiftAt;
    this.cues = this.buildCues();
    if (input.timeOfDay !== "day") this.aimFireworks();

    // --------------------------------------------- compila e sobe tudo
    this.ready = true;
    this.resize();
    this.step(0, 0);
    for (const texture of this.team.textures()) this.renderer.initTexture(texture);
    // A taça e os efeitos nascem escondidos; o compile do three percorre os invisíveis também.
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      // Sem compilação paralela: compila no primeiro quadro.
    }
    if (this.disposed || this.lost) return;
    this.renderer.render(this.scene, this.camera);
  }

  private buildCues(): Cue[] {
    const tl = this.timeline;
    const beat = (id: string) => tl.beats.find((item) => item.id === id);
    const cues: Cue[] = [];
    const add = (at: number | undefined, window: number, fire: (time: number) => void) => {
      if (at !== undefined && Number.isFinite(at)) cues.push({ at, window, done: false, fire });
    };
    const half = this.director?.truckHalfLength ?? 7;
    const deck = this.director?.deckHeight ?? 4;
    const avenue = beat("avenue");
    const crowd = beat("crowd");
    const finale = beat("finale");
    add(avenue && avenue.start + 1, 2, (time) => this.effects?.flares(this.truckX(time) + half + 22));
    add(crowd?.start, 3, (time) => this.effects?.flares(this.truckX(time) + half + 6));
    add(crowd && crowd.start + (crowd.end - crowd.start) * 0.52, 2.5, (time) => this.effects?.flares(this.truckX(time) + 12));
    add(tl.burstAt, 4, (time) => {
      const at = this.frame.trophy ? this.trophyTop.clone().setY(this.trophyTop.y + 1.5) : new THREE.Vector3(this.truckX(time), deck + 4, this.laneZ);
      this.effects?.burst(at);
      this.effects?.flares(this.truckX(time));
    });
    add(finale && finale.start + 0.4, 4, (time) => {
      this.effects?.burst(new THREE.Vector3(this.truckX(time) + 2, deck + 8, this.laneZ));
      this.effects?.flares(this.truckX(time) + 18);
    });
    return cues;
  }

  /**
   * Fogos onde o plano final olha (acima da avenida, na frente da câmera) e o
   * resto em volta do trecho que o trio anda depois do estouro: espalhados pela
   * avenida inteira, quase todos caíam fora do quadro ou atrás dos prédios.
   */
  private aimFireworks() {
    const city = this.city;
    const director = this.director;
    if (!city?.aimFireworks || !director) return;
    const tl = this.timeline;
    const avenue = director.avenue;
    const endX = this.truckX(tl.duration);
    const frame: DirectorFrame = { truck: new THREE.Vector3(endX, 0, this.laneZ), player: new THREE.Vector3(), team: new THREE.Vector3(), trophy: null, liftAt: tl.trophyLiftAt };
    frame.player.copy(this.playerSlot).add(frame.truck);
    frame.team.copy(this.teamSlot).add(frame.truck);
    const final = directShot(tl.duration, director, frame, createShot());
    const look = new THREE.Vector3().subVectors(final.target, final.position).normalize();
    const flat = new THREE.Vector3(look.x, 0, look.z).normalize();
    const reach = 230;
    // Estouro mediano um pouco acima do meio do quadro final.
    const elevation = Math.asin(look.y) + THREE.MathUtils.degToRad(final.fov) * 0.2;
    const height = Math.min(150, Math.max(70, (final.position.y + Math.tan(elevation) * reach) / 0.97));
    // Ao longo da avenida (cânion), aperta na largura dela; olhando por cima do mar, abre.
    const along = 150;
    const across = Math.abs(flat.x) > 0.8 ? avenue.width / 2 + avenue.crowdDepth + 20 : 140;
    city.aimFireworks(
      { x0: this.truckX(tl.burstAt) - 120, x1: endX + 260, z: avenue.width / 2 + avenue.crowdDepth + 110, height },
      {
        x: final.position.x + flat.x * reach,
        z: final.position.z + flat.z * reach,
        rx: Math.abs(flat.x) * along + Math.abs(flat.z) * across,
        rz: Math.abs(flat.z) * along + Math.abs(flat.x) * across,
        share: 0.7,
      },
    );
  }

  /** Do close no jogador (segunda metade do "deck") ao fim da órbita com a taça. */
  private closeUpWindow(): [number, number] {
    const deck = this.timeline.beats.find((item) => item.id === "deck");
    const trophy = this.timeline.beats.find((item) => item.id === "trophy");
    const from = deck ? (deck.start + deck.end) / 2 : this.timeline.trophyLiftAt - 3.6;
    const to = trophy ? trophy.start + (trophy.end - trophy.start) * 0.6 : this.timeline.trophyLiftAt + 2.7;
    return [from, to];
  }

  /** Posição do trio no tempo do roteiro: velocidade constante e, no cartão final, freia até parar. */
  private truckX(time: number) {
    const duration = this.timeline.duration;
    const t = Math.max(0, time);
    if (t <= duration) return this.startX + this.speed * t;
    const tau = 3.5;
    return this.startX + this.speed * (duration + tau * (1 - Math.exp(-(t - duration) / tau)));
  }

  private beatAt(time: number) {
    if (this.beatStamp && performance.now() - this.beatStamp < 600) return this.beatValue;
    const phase = (((time % SYNTH_BEAT) + SYNTH_BEAT) % SYNTH_BEAT) / SYNTH_BEAT;
    return Math.exp(-phase * 6);
  }

  private excitementAt(time: number) {
    const tl = this.timeline;
    const beat = paradeBeatAt(tl, time).id;
    let value = beat === "aerial" ? 0.5 : beat === "avenue" ? 0.62 : beat === "crowd" ? 0.8 : beat === "deck" ? 0.66 : beat === "trophy" ? 0.56 : beat === "finale" ? 0.9 : 0.72;
    // A taça sobe: o povo segura o fôlego e explode no estouro.
    if (time >= tl.burstAt) value = Math.max(value, 0.86) + 0.14 * Math.exp(-(time - tl.burstAt) / 2.5);
    return clamp01(value);
  }

  private resize() {
    const width = Math.max(1, Math.round(this.canvas.clientWidth || this.canvas.width || 1));
    const height = Math.max(1, Math.round(this.canvas.clientHeight || this.canvas.height || 1));
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    const device = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    let ratio = Math.min(device, this.options.performance ? 1 : 1.5);
    if (width * height * ratio * ratio > MAX_PIXELS) ratio = Math.max(0.5, Math.sqrt(MAX_PIXELS / (width * height)));
    if (ratio !== this.pixelRatio) {
      this.pixelRatio = ratio;
      this.renderer.setPixelRatio(ratio);
    }
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
  }

  /**
   * Desenha a cena no instante `time` (s) do roteiro. `dt` é o tempo real desde
   * o quadro anterior (0 depois de um salto). Pular para a frente deixa tudo
   * no estado do beat novo (posição do trio, câmera, quem está com a taça).
   */
  render(time: number, dt: number): void {
    if (!this.ready || this.lost || this.disposed) return;
    const started = performance.now();
    this.resize();
    this.step(time, dt);
    this.renderer.render(this.scene, this.camera);
    const spent = performance.now() - started;
    this.cpuMs = this.cpuMs ? this.cpuMs * 0.9 + spent * 0.1 : spent;
  }

  /** Atualiza tudo para o instante `time` (sem desenhar). */
  private step(time: number, dt: number) {
    const director = this.director;
    const city = this.city;
    const trio = this.trio;
    const team = this.team;
    if (!director || !city || !trio || !team) return;
    const tl = this.timeline;
    // Salto (pular, voltar, primeiro quadro): assenta tudo direto no estado novo.
    const expected = this.lastTime + Math.max(0, dt);
    const settle = this.lastTime < 0 || (dt <= 0 ? Math.abs(time - this.lastTime) > 1e-4 : Math.abs(time - expected) > 0.35);
    if (time < this.lastTime - 1e-4) for (const cue of this.cues) if (cue.at > time) cue.done = false;
    const step = settle ? 0 : Math.min(Math.max(dt, 0), 0.1);
    this.lastTime = time;

    // ------------------------------------------------------------- trio
    const truckX = this.truckX(time);
    trio.group.position.set(truckX, 0, this.laneZ);
    // Suspensão: o caminhão balança de leve com o peso do povo pulando em cima.
    trio.group.rotation.x = 0.005 * Math.sin(time * 1.9);
    const beat = this.beatAt(time);
    const wanted = this.excitementAt(time);
    this.excitement = settle ? wanted : this.excitement + (wanted - this.excitement) * (1 - Math.exp(-step * 4));

    // ------------------------------------------------------------ time
    const far = this.camera.position.distanceToSquared(trio.group.position) > 70 * 70;
    team.update(time, step, { cameraLocal: this.cameraLocal, settle, far });
    const frame = this.frame;
    frame.truck.copy(trio.group.position);
    frame.player.copy(this.playerSlot).add(frame.truck);
    frame.team.copy(this.teamSlot).add(frame.truck);
    frame.trophy = team.placeTrophy(time, this.trophyTop) ? this.trophyTop : null;

    // --------------------------------------------- deixas e o resto da cena
    for (const cue of this.cues) {
      if (cue.done || time < cue.at) continue;
      cue.done = true;
      // Pulou muito além: o efeito já teria acabado, não dispara atrasado.
      if (time - cue.at <= cue.window) cue.fire(time);
    }
    const fireworks = tl.input.timeOfDay !== "day" && time >= tl.burstAt;
    if (fireworks !== this.fireworksOn) {
      this.fireworksOn = fireworks;
      city.fireworks(fireworks);
    }
    city.update(time, step);
    this.crowd?.update(time, step, { truckX, excitement: this.excitement, beat, truckZ: this.laneZ });
    trio.update(time, step, beat);
    this.effects?.update(time, step, { truckX });

    // ----------------------------------------------------------- câmera
    const shot = directShot(time, director, frame, this.shot);
    const camera = this.camera;
    const fit = fitAspect(shot.fov, camera.aspect, this.fit);
    if (fit.distance > 1) {
      shot.position.sub(shot.target).multiplyScalar(fit.distance).add(shot.target);
      // Closes no deck olham para cima: recuar na mesma linha desce a câmera
      // para trás da grade e da faixa da frente, que tapam o herói no retrato.
      if (shot.id === "deck-b" || shot.id === "trophy-a") shot.position.y = Math.max(shot.position.y, director.deckHeight + 1.5 + (fit.distance - 1) * 1.1);
      keepInStreet(director, shot.position, shot.street);
    }
    // Retrato: o plano de paisagem perde as laterais; puxa o olhar para o assunto.
    if (shot.subjectWeight > 0 && camera.aspect < 1.5) shot.target.lerp(shot.subject, shot.subjectWeight * clamp01(1.5 - camera.aspect));
    camera.fov = fit.fov;
    camera.position.copy(shot.position);
    camera.up.set(0, 1, 0);
    camera.lookAt(shot.target);
    let roll = shot.roll;
    let yaw = 0;
    let pitch = 0;
    if (!this.options.reducedMotion) {
      // Câmera na mão: somas de senos (sem estado, então pular não quebra nada).
      const amp = shot.handheld;
      const n1 = Math.sin(time * 1.31 + 0.3) + 0.55 * Math.sin(time * 2.73 + 1.1) + 0.25 * Math.sin(time * 5.9 + 2.4);
      const n2 = Math.sin(time * 1.07 + 2.1) + 0.5 * Math.sin(time * 2.41 + 0.2) + 0.3 * Math.sin(time * 6.7 + 1.3);
      yaw += amp * 0.006 * n1;
      pitch += amp * 0.005 * n2;
      roll += amp * 0.0035 * n1 * n2;
      // Tranco do estouro da taça.
      const since = time - tl.burstAt;
      if (since >= 0 && since < 1.6) {
        const kick = 0.014 * Math.exp(-since * 3.2);
        yaw += kick * Math.sin(time * 47);
        pitch += kick * Math.sin(time * 53 + 1);
      }
    }
    if (roll) camera.rotateZ(roll);
    if (yaw) camera.rotateY(yaw);
    if (pitch) camera.rotateX(pitch);
    // Perto do trio, plano de corte próximo curto; no drone, longo (precisão de profundidade).
    const distance = camera.position.distanceTo(frame.truck);
    camera.near = Math.min(2, Math.max(0.12, distance * 0.012));
    camera.updateProjectionMatrix();

    // Recorte vem de trás-acima da câmera, para o time ler bem em qualquer plano.
    this.fill.position.copy(camera.position).setY(camera.position.y + 6);
    this.fill.target.position.copy(frame.player);
    this.fill.target.updateMatrixWorld();
    this.sky?.follow(camera);
    // Clarão do estouro: a exposição pisca e volta em meio segundo (nada com movimento reduzido).
    const afterBurst = time - tl.burstAt;
    const flash = !this.options.reducedMotion && afterBurst >= 0 && afterBurst < 1 ? 0.4 * Math.exp(-afterBurst * 7) : 0;
    this.renderer.toneMappingExposure = this.exposure * (1 + flash);

    this.scratch.copy(camera.position);
    this.cameraLocal.copy(trio.group.worldToLocal(this.scratch));
  }

  /** Batida da música (0..1, pico no tempo forte), para os alto-falantes e a multidão pularem junto. */
  setBeat(pulse: number): void {
    if (!Number.isFinite(pulse)) return;
    this.beatValue = clamp01(pulse);
    this.beatStamp = performance.now();
  }

  /** Números do último quadro: draw calls, triângulos, CPU (ms) e memória da GPU. */
  stats(): ParadeStageStats {
    const info = this.renderer.info;
    return {
      calls: info.render.calls,
      triangles: info.render.triangles,
      cpuMs: Math.round(this.cpuMs * 100) / 100,
      programs: info.programs?.length ?? 0,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ready = false;
    this.canvas.removeEventListener("webglcontextlost", this.onLost, false);
    this.team?.dispose();
    const trophy = this.team?.trophy;
    trophy?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
    this.effects?.dispose();
    this.trio?.dispose();
    this.crowd?.dispose();
    this.city?.dispose();
    this.sky?.dispose();
    this.envTarget?.dispose();
    this.scene.clear();
    this.renderer.dispose();
    // Libera o contexto já: a WebView do Android tem poucos e o 2D/partida podem precisar.
    this.renderer.forceContextLoss();
    this.team = null;
    this.effects = null;
    this.trio = null;
    this.crowd = null;
    this.city = null;
    this.sky = null;
    this.env = null;
    this.envTarget = null;
  }
}
