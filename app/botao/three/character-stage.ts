// Palco do criador de personagem no modo 3D: o mesmo boneco da partida, em
// cima de um botão gigante, girando devagar. Arrastar gira na mão; as poses
// mostram as animações que ele vai ter em campo.

import * as THREE from "three";
import type { PlayerAppearance } from "../../player-appearance";
import { FIGURE_HEIGHT, PlayerFigure, idleIntent, type FigureIntent } from "./character";

export type StagePose = "idle" | "run" | "kick" | "celebrate";

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

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Enquadra da cabeça até a borda da frente do pedestal.
    this.camera.position.set(0, 36, 122);
    this.camera.lookAt(0, FIGURE_HEIGHT * 0.38, 0);

    this.scene.add(new THREE.HemisphereLight("#e4f1ff", "#2c3a2e", 1.15));
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
    this.turntable.add(this.figure.root);
    this.pedestalMaterial.color.set(primary);
    this.rimMaterial.color.set(secondary === primary ? "#ffc72c" : secondary);
  }

  setPose(pose: StagePose) {
    if (pose === this.pose) return;
    this.pose = pose;
    this.poseTime = 0;
  }

  private intent(): FigureIntent {
    // A cabeça procura a câmera: o boneco olha para quem está criando ele.
    this.lookTarget.copy(this.camera.position).applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.spin);
    const look = { x: this.lookTarget.x, z: this.lookTarget.z };
    switch (this.pose) {
      case "run":
        return idleIntent({ state: "run", speed: 240, heading: 0, faceYaw: 0 });
      case "kick": {
        const cycle = this.poseTime % 2.2;
        if (cycle < 1.1) return idleIntent({ state: "aim", faceYaw: 0, aimRatio: Math.min(1, cycle / 0.95) });
        return idleIntent({ state: "ready", faceYaw: 0, look });
      }
      case "celebrate":
        return idleIntent({ state: this.poseTime % 6 < 3 ? "celebrate" : "scorer", faceYaw: 0 });
      default:
        return idleIntent({ state: "idle", faceYaw: 0, look });
    }
  }

  private tick(dt: number) {
    this.resize();
    const previous = this.poseTime;
    this.poseTime += dt;
    if (!this.drag) {
      // Gira sozinho devagar; depois de arrastar, a inércia some aos poucos.
      this.spinVelocity *= Math.exp(-dt * 3);
      this.spin += (this.spinVelocity + (Math.abs(this.spinVelocity) < 0.4 ? 0.32 : 0)) * dt;
    }
    this.turntable.rotation.y = this.spin;
    if (this.figure) {
      if (this.pose === "kick" && previous % 2.2 < 1.1 && this.poseTime % 2.2 >= 1.1) {
        this.figure.triggerLunge();
        this.figure.triggerKick(1);
      }
      this.figure.update(dt, this.intent());
    }
    this.renderer.render(this.scene, this.camera);
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
