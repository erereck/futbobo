// Palco do criador de personagem no modo 3D: o mesmo boneco da partida, em
// cima de um botão gigante, girando devagar. Arrastar gira na mão; as poses
// mostram as animações que ele vai ter em campo.

import * as THREE from "three";
import { celebrationIdOf, type CelebrationId, type PlayerAppearance } from "../../player-appearance";
import { CelebrationFx } from "./celebration-fx";
import { FIGURE_HEIGHT, PlayerFigure, angleDelta, idleIntent, type FigureAction, type FigureIntent } from "./character";
import { Effects } from "./effects";

export type StagePose = "idle" | "run" | "kick" | "celebrate" | "signature";

/**
 * Um trecho da vitrine. `face` é o lado para onde o boneco olha (0 = câmera;
 * o siuuu sai de costas e cai de frente). `speed` > 0 corre no lugar
 * (aviãozinho). Sem ação, fica parado um instante: é o que faz uma
 * comemoração de uma vez só recomeçar do zero no laço.
 */
type ShowcaseItem = { action: FigureAction | null; duration: number; face: number; speed?: number };

/** Vitrine de comemorações do "Gol!": cada uma por alguns segundos, em ciclo. */
const SHOWCASE: readonly ShowcaseItem[] = [
  { action: "jumpCheer", duration: 2, face: 0 },
  { action: "clap", duration: 1.3, face: Math.PI },
  { action: "siuu", duration: 2.6, face: Math.PI },
  { action: "kneeSlide", duration: 0.75, face: 0 },
  { action: "kneelCheer", duration: 2.1, face: 0 },
  { action: "heart", duration: 2.2, face: 0 },
  { action: "backflip", duration: 1.15, face: 0 },
  { action: "pointSky", duration: 1.7, face: 0 },
  { action: "robot", duration: 2.75, face: 0 },
  { action: "airplane", duration: 2.8, face: 0, speed: 175 },
  { action: "shush", duration: 2.6, face: 0 },
  { action: "flagDance", duration: 2.6, face: 0 },
  { action: "cradle", duration: 2.4, face: 0 },
  { action: "crestKiss", duration: 2.6, face: 0 },
  { action: "armsCrossed", duration: 2.4, face: 0 },
  { action: "dance", duration: 2.75, face: 0 },
];

const PAUSE: ShowcaseItem = { action: null, duration: 0.6, face: 0 };
/** Kamehameha no palco: virado ~55° para o lado, o raio passa na diagonal pela frente. */
const KAME_FACE = 0.95;

/** "Minha comemoração": a escolhida no criador, em laço (as de uma vez só recomeçam). */
const SIGNATURES: Readonly<Record<Exclude<CelebrationId, "auto">, readonly ShowcaseItem[]>> = {
  kneeSlide: [{ action: "kneeSlide", duration: 0.75, face: 0 }, { action: "kneelCheer", duration: 2.2, face: 0 }, PAUSE],
  // De costas, mãos na cintura; o salto gira e ele cai de frente.
  siuu: [{ action: "handsOnHips", duration: 0.7, face: Math.PI }, { action: "siuu", duration: 2.6, face: Math.PI }],
  cornerFlag: [{ action: "flagDance", duration: 4, face: 0 }],
  backflip: [{ action: "handsOnHips", duration: 0.45, face: 0 }, { action: "backflip", duration: 1.15, face: 0 }, { action: "pointSky", duration: 1.7, face: 0 }],
  airplane: [{ action: "airplane", duration: 2.8, face: 0, speed: 175 }, { action: "pointSky", duration: 1.7, face: 0 }],
  crest: [{ action: "crestKiss", duration: 2.8, face: 0 }, PAUSE],
  heart: [{ action: "heart", duration: 3, face: 0 }, PAUSE],
  shush: [{ action: "shush", duration: 4, face: 0 }],
  armsCrossed: [{ action: "armsCrossed", duration: 4, face: 0 }],
  cradle: [{ action: "cradle", duration: 4, face: 0 }],
  robot: [{ action: "robot", duration: 4, face: 0 }],
  dance: [{ action: "dance", duration: 4, face: 0 }],
  // De três quartos: o raio atravessa o quadro na diagonal, vindo para a frente.
  kamehameha: [{ action: "kamehameha", duration: 3, face: KAME_FACE }, PAUSE],
  superSaiyan: [{ action: "superSaiyan", duration: 3.6, face: 0 }, PAUSE],
  meditate: [{ action: "meditate", duration: 5, face: 0 }, PAUSE],
  cupEar: [{ action: "cupEar", duration: 4, face: 0 }],
  fingerGuns: [{ action: "fingerGuns", duration: 2.8, face: 0 }, PAUSE],
};

/** Assinaturas com efeito (esfera, raio, aura, brilhos): só elas criam os efeitos do palco. */
const FX_SIGNATURES: ReadonlySet<CelebrationId> = new Set<CelebrationId>(["kamehameha", "superSaiyan", "meditate", "fingerGuns"]);

function showcaseLength(list: readonly ShowcaseItem[]) {
  return list.reduce((sum, item) => sum + item.duration, 0);
}

/** Correndo: trote → corrida → disparada e de volta, para mostrar as passadas. */
function runSpeed(time: number) {
  return 165 + 95 * Math.sin((time / 7) * Math.PI * 2 - Math.PI / 2);
}

/** Destaque leve do criador: o mesmo contorno que o time do jogador tem em campo. */
const STAGE_HIGHLIGHT = 0.25;
const STAGE_SKY = "#e4f1ff";
const STAGE_SKY_INTENSITY = 1.15;

export class CharacterStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(28, 280 / 320, 1, 1000);
  private readonly turntable = new THREE.Group();
  private readonly pedestal: THREE.Mesh;
  private readonly pedestalMaterial: THREE.MeshStandardMaterial;
  private readonly rimMaterial: THREE.MeshStandardMaterial;
  private readonly rim: THREE.Mesh;
  private readonly ground: THREE.Mesh;
  private figure: PlayerFigure | null = null;
  private signature: CelebrationId = "auto";
  private pose: StagePose = "idle";
  private poseTime = 0;
  private spin = -0.5;
  private spinVelocity = 0;
  private drag: { x: number; spin: number; time: number } | null = null;
  private lastFrame = 0;
  private frame = 0;
  private width = 0;
  private height = 0;
  private readonly cleanup: Array<() => void> = [];
  private readonly lookTarget = new THREE.Vector3();
  private readonly upAxis = new THREE.Vector3(0, 1, 0);
  /** 1 = retrato; maior abre o quadro para caber o siuuu e o mortal. */
  private pullBack = 1;
  private readonly hemisphere: THREE.HemisphereLight;
  /** Efeitos das assinaturas novas (criados na primeira vez que uma delas aparece). */
  private fx: { effects: Effects; celebration: CelebrationFx } | null = null;
  private shake = 0;
  private glow = 0;
  private readonly glowColor = new THREE.Color();
  private readonly skyColor = new THREE.Color(STAGE_SKY);

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // Enquadra da cabeça até a borda da frente do pedestal.
    this.frameCamera();

    this.hemisphere = new THREE.HemisphereLight(STAGE_SKY, "#2c3a2e", STAGE_SKY_INTENSITY);
    this.scene.add(this.hemisphere);
    const key = new THREE.DirectionalLight("#fff3df", 2.4);
    key.position.set(-40, 90, 70);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -40;
    key.shadow.camera.right = 40;
    key.shadow.camera.top = 60;
    key.shadow.camera.bottom = -20;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.4;
    this.scene.add(key);
    // Contraluz dourado: recorta a silhueta do fundo escuro do card.
    const rimLight = new THREE.DirectionalLight("#ffc72c", 1.6);
    rimLight.position.set(50, 40, -80);
    this.scene.add(rimLight);

    // O pedestal é um botão de mesa: o boneco continua sendo uma peça do jogo.
    this.pedestalMaterial = new THREE.MeshStandardMaterial({ color: "#2b6b45", roughness: 0.35, metalness: 0.1 });
    this.pedestal = new THREE.Mesh(new THREE.CylinderGeometry(21, 22.5, 3.6, 64), this.pedestalMaterial);
    this.pedestal.position.y = -1.8;
    this.pedestal.receiveShadow = true;
    this.rimMaterial = new THREE.MeshStandardMaterial({ color: "#ffc72c", roughness: 0.3, metalness: 0.5 });
    this.rim = new THREE.Mesh(new THREE.TorusGeometry(21.2, 0.8, 10, 64), this.rimMaterial);
    this.rim.rotation.x = Math.PI / 2;
    this.rim.position.y = 0.05;
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(70, 48), new THREE.ShadowMaterial({ opacity: 0.32 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -3.6;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground, this.pedestal, this.rim, this.turntable);

    const onPointerDown = (event: PointerEvent) => {
      this.drag = { x: event.clientX, spin: this.spin, time: performance.now() };
      this.spinVelocity = 0;
      try { canvas.setPointerCapture(event.pointerId); } catch { /* opcional */ }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!this.drag) return;
      const next = this.drag.spin + (event.clientX - this.drag.x) * 0.012;
      const now = performance.now();
      this.spinVelocity = (next - this.spin) / Math.max(0.016, (now - this.drag.time) / 1000);
      this.drag.time = now;
      this.spin = next;
    };
    const onPointerUp = () => {
      this.drag = null;
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    this.cleanup.push(() => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
    });

    const loop = (time: number) => {
      this.frame = requestAnimationFrame(loop);
      const dt = this.lastFrame ? Math.min(0.05, (time - this.lastFrame) / 1000) : 0;
      this.lastFrame = time;
      this.tick(dt);
    };
    this.frame = requestAnimationFrame(loop);
  }

  setPlayer(appearance: PlayerAppearance, primary: string, secondary: string, number: number) {
    if (this.figure) {
      this.turntable.remove(this.figure.root);
      this.figure.dispose();
    }
    this.figure = new PlayerFigure({ appearance, primary, secondary, number, captain: true, seed: 7 });
    this.figure.setHighlight(STAGE_HIGHLIGHT);
    this.turntable.add(this.figure.root);
    this.pedestalMaterial.color.set(primary);
    this.rimMaterial.color.set(secondary === primary ? "#ffc72c" : secondary);
    const signature = celebrationIdOf(appearance);
    // Trocou a comemoração com a prévia nela: a nova começa do início.
    if (signature !== this.signature && this.pose === "signature") this.poseTime = 0;
    this.signature = signature;
  }

  setPose(pose: StagePose) {
    if (pose === this.pose) return;
    this.pose = pose;
    this.poseTime = 0;
  }

  private intent(): FigureIntent {
    // A cabeça procura a câmera: o boneco olha para quem está criando ele.
    this.lookTarget.copy(this.camera.position).applyAxisAngle(this.upAxis, -this.spin);
    const look = { x: this.lookTarget.x, z: this.lookTarget.z };
    switch (this.pose) {
      case "run":
        return idleIntent({ state: "run", speed: runSpeed(this.poseTime), heading: 0, faceYaw: 0 });
      case "kick": {
        const cycle = this.poseTime % 2.2;
        if (cycle < 1.1) return idleIntent({ state: "aim", faceYaw: 0, aimRatio: Math.min(1, cycle / 0.95) });
        return idleIntent({ state: "ready", faceYaw: 0, look });
      }
      case "celebrate":
      case "signature": {
        const item = this.showcaseItem();
        if (!item.action) return idleIntent({ state: "idle", faceYaw: item.face, look });
        return idleIntent({
          state: item.speed ? "run" : "celebrate",
          speed: item.speed ?? 0,
          heading: item.face,
          faceYaw: item.face,
          action: item.action,
        });
      }
      default:
        return idleIntent({ state: "idle", faceYaw: 0, look });
    }
  }

  /** "Variada" (ou nenhuma escolhida) mostra a vitrine inteira do "Gol!". */
  private showcaseItem() {
    const list = this.pose === "signature" && this.signature !== "auto" ? SIGNATURES[this.signature] : SHOWCASE;
    let time = this.poseTime % showcaseLength(list);
    for (const item of list) {
      if (time < item.duration) return item;
      time -= item.duration;
    }
    return list[0];
  }

  private frameCamera() {
    const pull = this.pullBack;
    const lookY = FIGURE_HEIGHT * 0.38 + (pull - 1) * 30;
    this.camera.position.set(0, lookY + (36 - FIGURE_HEIGHT * 0.38) * pull, 122 * pull);
    this.camera.lookAt(0, lookY, 0);
  }

  private tick(dt: number) {
    this.resize();
    const pull = this.pose === "celebrate" || this.pose === "signature" ? 1.22 : 1;
    if (Math.abs(pull - this.pullBack) > 0.0005) {
      this.pullBack += (pull - this.pullBack) * (1 - Math.exp(-dt * 3));
      this.frameCamera();
    }
    const previous = this.poseTime;
    this.poseTime += dt;
    if (!this.drag) {
      // Gira sozinho devagar; depois de arrastar, a inércia some aos poucos.
      this.spinVelocity *= Math.exp(-dt * 3);
      if (this.pose === "signature" && this.signature === "kamehameha") {
        // Kamehameha: o palco volta de frente e para (o raio cruza o quadro na diagonal); arrastar ainda gira.
        this.spin += this.spinVelocity * dt + angleDelta(this.spin, 0) * (1 - Math.exp(-dt * 2.5));
      } else {
        this.spin += (this.spinVelocity + (Math.abs(this.spinVelocity) < 0.4 ? 0.32 : 0)) * dt;
      }
    }
    this.turntable.rotation.y = this.spin;
    if (this.figure) {
      if (this.pose === "kick" && previous % 2.2 < 1.1 && this.poseTime % 2.2 >= 1.1) {
        this.figure.triggerLunge();
        this.figure.triggerKick(1, "strike");
      }
      this.figure.update(dt, this.intent());
      this.updateFx(dt, this.figure);
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Esfera, raio, aura e brilhos das assinaturas novas, com o tremor e a luz que eles pedem. */
  private updateFx(dt: number, figure: PlayerFigure) {
    const kind = this.pose === "signature" && FX_SIGNATURES.has(this.signature) ? this.signature : null;
    if (!kind && !this.fx) return;
    const fx = this.ensureFx();
    const result = fx.celebration.update(dt, {
      kind,
      focus: { figure, x: 0, z: 0, yaw: this.spin + figure.yaw },
      side: null,
      teamColor: STAGE_SKY,
      stadium: null,
      aspect: this.camera.aspect,
    });
    fx.effects.update(dt, this.camera);
    this.shake = Math.max(Math.max(0, this.shake - dt * 1.6), result.shake);
    this.glow = Math.max(this.glow * Math.exp(-dt * 1.6), result.glow);
    if (result.glowColor) this.glowColor.set(result.glowColor);
    this.hemisphere.intensity = STAGE_SKY_INTENSITY + 0.5 * this.glow;
    this.hemisphere.color.copy(this.skyColor).lerp(this.glowColor, 0.32 * this.glow);
    this.frameCamera();
    if (this.shake > 0.001) {
      const amount = this.shake * this.shake * 1.4;
      this.camera.position.x += (Math.random() * 2 - 1) * amount;
      this.camera.position.y += (Math.random() * 2 - 1) * amount;
    }
  }

  private ensureFx() {
    if (this.fx) return this.fx;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    const effects = new Effects({ surface: "grass", reducedMotion, lowPower: Math.min(window.innerWidth, window.innerHeight) < 600, overTransparent: true });
    this.scene.add(effects.group);
    const celebration = new CelebrationFx(effects, { lite: false, reducedMotion, stage: true });
    // Programas, atlas e buffers antes do primeiro quadro com efeito (quadro descartável).
    effects.prepare(this.renderer);
    celebration.prepare();
    this.renderer.compile(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
    this.fx = { effects, celebration };
    return this.fx;
  }

  private resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (!width || !height || (width === this.width && height === this.height)) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    for (const release of this.cleanup) release();
    this.fx?.celebration.dispose();
    this.fx?.effects.dispose();
    this.figure?.dispose();
    this.pedestal.geometry.dispose();
    this.pedestalMaterial.dispose();
    this.rim.geometry.dispose();
    this.rimMaterial.dispose();
    this.ground.geometry.dispose();
    (this.ground.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
