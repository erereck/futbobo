// Estúdio de retratos 3D das figurinhas: UM renderer WebGL fora da tela para o
// jogo inteiro. Cada retrato monta o mesmo boneco da partida (PlayerFigure),
// fotografa cabeça e ombros em três quartos com fundo transparente, copia para
// um canvas 2D e devolve o boneco. Só é carregado (import dinâmico) quando o
// Modo 3D está ligado e alguma figurinha pede o retrato.
//
// O enquadramento copia o busto 2D (`drawPlayerBust` com `cutout`, desenhado em
// translate(w/2, h·0,47) e raio w·0,43): cabeça do mesmo tamanho e altura,
// ombros saindo pela borda de baixo. Assim número, selo de OVR e escudo da
// figurinha continuam nos mesmos cantos livres.

import * as THREE from "three";
import { DEFAULT_PLAYER_APPEARANCE, type PlayerAppearance } from "../../player-appearance";
import { PX, PlayerFigure, idleIntent } from "./character";
import { createKitTextures, resolveLook } from "./textures";

export type PortraitShot = {
  appearance: PlayerAppearance;
  primary: string;
  secondary: string;
  /** Número no peito (como em campo); `null` deixa a camisa lisa. */
  number: number | null;
  /** Lado do retrato quadrado, em pixels. */
  size: number;
};

/** Corpo virado para a direita de quem olha; a cabeça volta quase de frente para a câmera. */
const BODY_YAW = 0.5;
const LOOK_YAW = 0.16;
/** Faixa vertical do quadro (px de boneco): topo do cabelo alto até o meio do peito. */
const FRAME_TOP = 36.2;
const FRAME_BOTTOM = 16.2;
/** Câmera um pouco acima dos olhos: aparece o alto da cabeça, como foto de figurinha. */
const CAMERA_FOV = 20;
const CAMERA_LIFT = 3.2;
/**
 * Cabelo até esta altura (px de boneco) cabe no quadro. Mais alto (black power,
 * moicano, coque), o quadro sobe junto até HAIR_SHIFT_MAX: o rosto desce um
 * pouco em vez de o cabelo ser cortado por uma linha reta no meio da figurinha.
 */
const HAIR_ROOM = 33.6;
const HAIR_SHIFT_MAX = 6;
/** Simula um instante parado antes da foto: a cabeça termina de virar e o corpo assenta. */
const SETTLE_STEPS = 24;
const SETTLE_DT = 1 / 30;

export class PortraitStudio {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 1, 400);
  private readonly look = { x: 0, z: 0 };
  private readonly centerY: number;
  private readonly distance: number;
  private size = 0;
  private lost = false;
  /** Último boneco fotografado, guardado até o próximo (veja `shoot`). */
  private previous: { figure: PlayerFigure; plainKit: THREE.Texture | null } | null = null;

  constructor() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.lost = true;
    });
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // Luz de estúdio de figurinha: céu claro por cima, luz principal quente da
    // frente-esquerda (a cabeça sombreia o ombro) e um contorno branco por trás
    // que solta o boneco do fundo colorido do clube.
    this.scene.add(new THREE.HemisphereLight("#f4f8ff", "#6f6658", 1.35));
    const key = new THREE.DirectionalLight("#fff4e2", 2.3);
    key.position.set(-34, 60, 70);
    key.target.position.set(0, 30, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -24;
    key.shadow.camera.right = 24;
    key.shadow.camera.top = 24;
    key.shadow.camera.bottom = -24;
    key.shadow.camera.near = 40;
    key.shadow.camera.far = 160;
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.35;
    const fill = new THREE.DirectionalLight("#d8e6ff", 0.7);
    fill.position.set(60, 30, 40);
    const rim = new THREE.DirectionalLight("#ffffff", 1.5);
    rim.position.set(30, 50, -70);
    this.scene.add(key, key.target, fill, rim);

    const top = FRAME_TOP * PX;
    const bottom = FRAME_BOTTOM * PX;
    this.centerY = (top + bottom) / 2;
    this.distance = (top - bottom) / 2 / Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2));
    this.frame(0);
    // A cabeça procura um ponto na frente da câmera, um pouco para o lado do corpo.
    this.look.x = Math.sin(LOOK_YAW) * this.distance;
    this.look.z = Math.cos(LOOK_YAW) * this.distance;
  }

  /** Mesmo tamanho de cabeça para todos; `shift` (unidades de campo) só sobe o quadro. */
  private frame(shift: number) {
    this.camera.position.set(0, this.centerY + shift + CAMERA_LIFT, this.distance);
    this.camera.lookAt(0, this.centerY + shift, 0);
  }

  get alive() {
    return !this.lost;
  }

  /** Fotografa um boneco e devolve um canvas 2D novo (`null` se o contexto caiu). */
  shoot(shot: PortraitShot): HTMLCanvasElement | null {
    if (this.lost) return null;
    const size = Math.max(16, Math.round(shot.size));
    if (size !== this.size) {
      this.size = size;
      this.renderer.setSize(size, size, false);
    }

    const { figure, plainKit } = this.pose(shot);
    const geometry = figure.skinnedMesh.geometry;
    geometry.computeBoundingBox();
    const hairTop = (geometry.boundingBox?.max.y ?? 0) / PX;
    this.frame(Math.min(Math.max(0, hairTop - HAIR_ROOM), HAIR_SHIFT_MAX) * PX);
    this.scene.add(figure.root);
    let out: HTMLCanvasElement | null = null;
    try {
      this.renderer.render(this.scene, this.camera);
      if (!this.lost) {
        out = document.createElement("canvas");
        out.width = out.height = size;
        // Copia no mesmo passo do render: o buffer de desenho ainda vale.
        out.getContext("2d")?.drawImage(this.renderer.domElement, 0, 0);
      }
    } finally {
      this.scene.remove(figure.root);
      // O boneco anterior só sai agora: o material dele segura o programa de
      // shader (descartar o último material apaga o programa e o próximo
      // retrato recompilaria tudo).
      this.release();
      this.previous = { figure, plainKit };
    }
    return out;
  }

  /**
   * Compila o shader do boneco sem travar a página (KHR_parallel_shader_compile,
   * onde houver) com um boneco padrão, que fica segurando o programa até o
   * primeiro retrato. O passe de sombra (programa pequeno) compila no primeiro retrato.
   */
  async warm() {
    const posed = this.pose({ appearance: DEFAULT_PLAYER_APPEARANCE, primary: "#0b5cad", secondary: "#ffffff", number: null, size: 320 });
    this.scene.add(posed.figure.root);
    try {
      if (this.renderer.extensions.has("KHR_parallel_shader_compile")) {
        await this.renderer.compileAsync(this.scene, this.camera);
      } else {
        // Sem a extensão: manda compilar e dá um respiro antes do primeiro uso.
        this.renderer.compile(this.scene, this.camera);
        await new Promise((done) => setTimeout(done, 32));
      }
    } finally {
      this.scene.remove(posed.figure.root);
      this.release();
      this.previous = posed;
    }
  }

  /** O boneco da partida parado, de três quartos, olhando quase para a câmera. */
  private pose(shot: PortraitShot) {
    const figure = new PlayerFigure({
      appearance: shot.appearance,
      primary: shot.primary,
      secondary: shot.secondary,
      number: shot.number ?? 0,
      seed: 7,
    });
    // Camisa lisa: troca só a textura do tronco (o mesmo programa de shader serve).
    let plainKit: THREE.Texture | null = null;
    if (shot.number === null) {
      plainKit = createKitTextures({ pattern: resolveLook(shot.appearance).kitPattern, primary: shot.primary, secondary: shot.secondary, number: null }).torso;
      (figure.skinnedMesh.material as THREE.MeshStandardMaterial).map = plainKit;
    }
    figure.contactShadowMesh.visible = false;
    figure.snapYaw(BODY_YAW);
    const intent = idleIntent({ state: "idle", faceYaw: BODY_YAW, look: this.look, mood: "normal" });
    for (let step = 0; step < SETTLE_STEPS; step += 1) figure.update(SETTLE_DT, intent);
    return { figure, plainKit };
  }

  private release() {
    if (!this.previous) return;
    this.previous.figure.dispose();
    this.previous.plainKit?.dispose();
    this.previous = null;
  }

  dispose() {
    this.release();
    this.renderer.dispose();
    if (!this.lost) this.renderer.forceContextLoss();
  }
}
