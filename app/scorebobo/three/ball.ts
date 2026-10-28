// Bola em metros (raio 0,11): a mesma textura de icosaedro truncado da
// partida, girando pelo efeito e pela rolagem, com sombra de contato, um
// halo leve no voo e o rastro que brilha e some. Longe da câmera ela cresce um
// pouco (leitura), sempre apoiada no gramado.

import * as THREE from "three";
import { soccerBallTexture } from "../../botao/three/ball";
import { PITCH, type BallState } from "../types";
import { clamp, clamp01, radialTexture } from "./util";

const TRAIL_MAX = 48;
const TRAIL_LIFE = 0.5;

const TRAIL_VERTEX = /* glsl */ `
attribute float aAlpha;
attribute float aEdge;
varying float vAlpha;
varying float vEdge;
void main() {
  vAlpha = aAlpha;
  vEdge = aEdge;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const TRAIL_FRAGMENT = /* glsl */ `
uniform vec3 uCore;
uniform vec3 uEdgeColor;
uniform float uOpacity;
varying float vAlpha;
varying float vEdge;
void main() {
  float across = 1.0 - abs(vEdge);
  float core = pow(across, 3.0);
  vec3 color = mix(uEdgeColor, uCore, core) * (0.35 + 0.9 * core);
  float a = vAlpha * smoothstep(0.0, 0.6, across) * uOpacity;
  gl_FragColor = vec4(color * a, 1.0);
}
`;

export class BallActor {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  private readonly ghost: THREE.Mesh;
  private readonly texture: THREE.Texture;
  private readonly shadow: THREE.Mesh;
  private readonly shadowTexture: THREE.Texture;
  private readonly halo: THREE.Sprite;
  private readonly haloTexture: THREE.Texture;
  private readonly trail: THREE.Mesh;
  private readonly trailGeometry: THREE.BufferGeometry;
  private readonly trailMaterial: THREE.ShaderMaterial;
  private readonly trailPositions: Float32Array;
  private readonly trailAlpha: Float32Array;
  private readonly history: Array<{ x: number; y: number; z: number; age: number }> = [];
  private readonly spinQ = new THREE.Quaternion();
  private readonly step = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly view = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private trailLevel = 0;
  private haloLevel = 0;
  private lastX = 0;
  private lastY = 0;
  private lastZ = 0;
  private shot = false;

  constructor(performance: boolean) {
    this.texture = performance ? soccerBallTexture(256, 128) : soccerBallTexture(512, 256);
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(PITCH.ballRadius, 32, 20),
      // Brilho próprio leve nos gomos brancos: a bola não some na contraluz da noite.
      new THREE.MeshStandardMaterial({ map: this.texture, roughness: 0.38, metalness: 0, emissive: "#ffffff", emissiveMap: this.texture, emissiveIntensity: 0.16 }),
    );
    this.mesh.castShadow = !performance;
    this.group.add(this.mesh);
    // Raio-x: só desenha onde algo está NA FRENTE da bola (o herói na mira tapa a bola).
    this.ghost = new THREE.Mesh(
      this.mesh.geometry,
      new THREE.MeshBasicMaterial({ color: "#fff6cf", transparent: true, opacity: 0.42, depthWrite: false, depthFunc: THREE.GreaterDepth }),
    );
    this.ghost.renderOrder = 20;
    this.mesh.add(this.ghost);

    this.shadowTexture = radialTexture([
      [0, "rgba(0,0,0,0.62)"],
      [0.35, "rgba(0,0,0,0.38)"],
      [1, "rgba(0,0,0,0)"],
    ]);
    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: this.shadowTexture, transparent: true, depthWrite: false }),
    );
    this.shadow.renderOrder = 1;
    this.group.add(this.shadow);

    this.haloTexture = radialTexture([
      [0, "rgba(255,255,255,0.9)"],
      [0.25, "rgba(255,246,214,0.35)"],
      [1, "rgba(255,240,200,0)"],
    ]);
    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.haloTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }),
    );
    this.halo.renderOrder = 7;
    this.group.add(this.halo);

    this.trailPositions = new Float32Array(TRAIL_MAX * 2 * 3);
    this.trailAlpha = new Float32Array(TRAIL_MAX * 2);
    const edge = new Float32Array(TRAIL_MAX * 2);
    for (let index = 0; index < TRAIL_MAX; index += 1) {
      edge[index * 2] = -1;
      edge[index * 2 + 1] = 1;
    }
    const indices: number[] = [];
    for (let index = 0; index < TRAIL_MAX - 1; index += 1) {
      const a = index * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.trailGeometry = new THREE.BufferGeometry();
    this.trailGeometry.setAttribute("position", new THREE.BufferAttribute(this.trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.trailGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(this.trailAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.trailGeometry.setAttribute("aEdge", new THREE.BufferAttribute(edge, 1));
    this.trailGeometry.setIndex(indices);
    this.trailGeometry.setDrawRange(0, 0);
    this.trailMaterial = new THREE.ShaderMaterial({
      vertexShader: TRAIL_VERTEX,
      fragmentShader: TRAIL_FRAGMENT,
      uniforms: {
        uCore: { value: new THREE.Color("#ffffff") },
        uEdgeColor: { value: new THREE.Color("#7fdcff") },
        uOpacity: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.trail = new THREE.Mesh(this.trailGeometry, this.trailMaterial);
    this.trail.frustumCulled = false;
    this.trail.renderOrder = 6;
    this.group.add(this.trail);
  }

  textures() {
    return [this.texture, this.shadowTexture, this.haloTexture];
  }

  /** Cor do rastro: chute (dourado quente) ou passe (azul gelo). */
  setShot(shot: boolean) {
    if (shot === this.shot) return;
    this.shot = shot;
    this.trailMaterial.uniforms.uEdgeColor.value.set(shot ? "#ffb347" : "#7fdcff");
  }

  /** Esquece o voo (replay recomeçando, nova tentativa). */
  reset() {
    this.history.length = 0;
    this.trailLevel = 0;
  }

  /**
   * `gameDt`: tempo de jogo (gira e envelhece o rastro na câmera lenta).
   * `realDt`: brilhos que acompanham a tela.
   */
  update(ball: BallState, gameDt: number, realDt: number, camera: THREE.Camera, inFlight: boolean) {
    const { pos, vel, spin } = ball;
    const r = PITCH.ballRadius;
    const moved = Math.hypot(pos.x - this.lastX, pos.y - this.lastY, pos.z - this.lastZ);
    if (moved > 6) this.reset();
    this.lastX = pos.x;
    this.lastY = pos.y;
    this.lastZ = pos.z;

    // Leitura: até ~1,9× longe da câmera, sem afundar no gramado.
    const distance = camera.position.distanceTo(this.tmp.set(pos.x, pos.y, pos.z));
    const scale = clamp(distance / 10, 1, 1.9);
    const grounded = 1 - clamp01((pos.y - r) / 0.6);
    this.mesh.scale.setScalar(scale);
    this.mesh.position.set(pos.x, pos.y + (scale - 1) * r * grounded, pos.z);

    // Giro: rolagem no chão + efeito (y = lateral, x = por cima) no ar.
    const speed = Math.hypot(vel.x, vel.y, vel.z);
    if (gameDt > 0 && (speed > 0.05 || Math.abs(spin.x) + Math.abs(spin.y) + Math.abs(spin.z) > 0.05)) {
      this.axis.set(0, 0, 0);
      const flat = Math.hypot(vel.x, vel.z);
      if (flat > 0.01) {
        // Eixo de rolagem = cima × direção.
        this.side.set(vel.z / flat, 0, -vel.x / flat);
        const rolling = pos.y < r + 0.05 ? flat / r : 0;
        this.axis.addScaledVector(this.side, rolling + spin.x);
      }
      this.axis.y += spin.y;
      this.axis.z += spin.z * 0.2;
      const rate = this.axis.length();
      if (rate > 1e-4) {
        this.step.setFromAxisAngle(this.axis.multiplyScalar(1 / rate), rate * gameDt);
        this.spinQ.premultiply(this.step);
        this.mesh.quaternion.copy(this.spinQ);
      }
    }

    // Sombra: encolhe e clareia com a altura.
    const height = Math.max(0, pos.y - r);
    const size = r * 3.4 * scale * (1 + height * 0.25);
    this.shadow.scale.set(size, 1, size);
    this.shadow.position.set(pos.x + height * 0.08, 0.012, pos.z + height * 0.05);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = clamp(1 - height / 7, 0.15, 1);

    // Rastro e halo só com a bola viajando.
    const flying = inFlight && !ball.owner && speed > 4;
    this.trailLevel = THREE.MathUtils.damp(this.trailLevel, flying ? 1 : 0, flying ? 10 : 3, realDt);
    this.haloLevel = THREE.MathUtils.damp(this.haloLevel, flying ? 1 : 0, flying ? 8 : 4, realDt);
    const haloMaterial = this.halo.material as THREE.SpriteMaterial;
    haloMaterial.opacity = this.haloLevel * 0.8;
    this.halo.visible = this.haloLevel > 0.01;
    this.halo.position.copy(this.mesh.position);
    this.halo.scale.setScalar(r * scale * 9);

    for (const sample of this.history) sample.age += gameDt;
    while (this.history.length && this.history[0].age > TRAIL_LIFE) this.history.shift();
    if (flying) {
      const last = this.history[this.history.length - 1];
      if (!last || Math.hypot(pos.x - last.x, pos.y - last.y, pos.z - last.z) > 0.08) {
        this.history.push({ x: pos.x, y: pos.y, z: pos.z, age: 0 });
        if (this.history.length > TRAIL_MAX) this.history.shift();
      }
    }
    this.buildTrail(camera, scale, speed);
  }

  private buildTrail(camera: THREE.Camera, scale: number, speed: number) {
    const list = this.history;
    const count = this.trailLevel > 0.01 ? list.length : 0;
    if (count < 2) {
      this.trail.visible = false;
      return;
    }
    this.trail.visible = true;
    const head = this.mesh.position;
    const widthBase = PITCH.ballRadius * scale * (0.7 + clamp01(speed / 30) * 0.5);
    for (let index = 0; index < count; index += 1) {
      const sample = list[index];
      const isHead = index === count - 1;
      const px = isHead ? head.x : sample.x;
      const py = isHead ? head.y : sample.y;
      const pz = isHead ? head.z : sample.z;
      const next = list[Math.min(count - 1, index + 1)];
      const prev = list[Math.max(0, index - 1)];
      this.tangent.set(next.x - prev.x, next.y - prev.y, next.z - prev.z);
      if (this.tangent.lengthSq() < 1e-8) this.tangent.set(0, 0, 1);
      this.tangent.normalize();
      this.view.set(camera.position.x - px, camera.position.y - py, camera.position.z - pz).normalize();
      this.side.crossVectors(this.tangent, this.view);
      if (this.side.lengthSq() < 1e-8) this.side.set(1, 0, 0);
      this.side.normalize();
      const along = index / (count - 1);
      const life = 1 - clamp01(sample.age / TRAIL_LIFE);
      const width = widthBase * (0.15 + 0.85 * along);
      const o = index * 6;
      this.trailPositions[o] = px - this.side.x * width;
      this.trailPositions[o + 1] = py - this.side.y * width;
      this.trailPositions[o + 2] = pz - this.side.z * width;
      this.trailPositions[o + 3] = px + this.side.x * width;
      this.trailPositions[o + 4] = py + this.side.y * width;
      this.trailPositions[o + 5] = pz + this.side.z * width;
      const alpha = Math.pow(along, 1.4) * life * this.trailLevel;
      this.trailAlpha[index * 2] = alpha;
      this.trailAlpha[index * 2 + 1] = alpha;
    }
    this.trailGeometry.attributes.position.needsUpdate = true;
    this.trailGeometry.attributes.aAlpha.needsUpdate = true;
    this.trailGeometry.setDrawRange(0, (count - 1) * 6);
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    (this.ghost.material as THREE.Material).dispose();
    this.texture.dispose();
    this.shadow.geometry.dispose();
    (this.shadow.material as THREE.Material).dispose();
    this.shadowTexture.dispose();
    (this.halo.material as THREE.Material).dispose();
    this.haloTexture.dispose();
    this.trailGeometry.dispose();
    this.trailMaterial.dispose();
  }
}
