// Bola 3D: icosaedro truncado de verdade (12 pentágonos pretos, 20 hexágonos),
// pintado por Voronoi numa textura equiretangular — sem nenhum asset.
//
// Tudo aqui é desenho: x/z vêm do motor; pulo, quique e achatamento só mexem
// na altura e na escala da malha.

import * as THREE from "three";

const GRAVITY = 820;
// Mola do achatamento: ω alto e pouco amortecida dá um "tum" de ~0.2 s.
const SQUASH_OMEGA = 38;
const SQUASH_ZETA = 0.35;
const SQUASH_OMEGA_D = SQUASH_OMEGA * Math.sqrt(1 - SQUASH_ZETA * SQUASH_ZETA);
const SQUASH_LIFE = 0.4;

export type BallViewOptions = {
  /** Sem esticar nem achatar: a bola só rola e quica. */
  reducedMotion?: boolean;
};

function soccerCenters() {
  const phi = (1 + Math.sqrt(5)) / 2;
  const pentagons: THREE.Vector3[] = [];
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      pentagons.push(new THREE.Vector3(0, a, b * phi).normalize());
      pentagons.push(new THREE.Vector3(a, b * phi, 0).normalize());
      pentagons.push(new THREE.Vector3(b * phi, 0, a).normalize());
    }
  }
  // Centros dos hexágonos = centros das faces do icosaedro (vértices do dodecaedro).
  const hexagons: THREE.Vector3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) hexagons.push(new THREE.Vector3(x, y, z).normalize());
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      hexagons.push(new THREE.Vector3(0, a / phi, b * phi).normalize());
      hexagons.push(new THREE.Vector3(a / phi, b * phi, 0).normalize());
      hexagons.push(new THREE.Vector3(b * phi, 0, a / phi).normalize());
    }
  }
  return { pentagons, hexagons };
}

export function soccerBallTexture(width = 512, height = 256) {
  const { pentagons, hexagons } = soccerCenters();
  const centers = [...pentagons.map((center) => ({ center, dark: true })), ...hexagons.map((center) => ({ center, dark: false }))];
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(width, height);
  const direction = new THREE.Vector3();
  for (let y = 0; y < height; y += 1) {
    const latitude = (0.5 - (y + 0.5) / height) * Math.PI;
    for (let x = 0; x < width; x += 1) {
      const longitude = ((x + 0.5) / width) * Math.PI * 2 - Math.PI;
      direction.set(Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude), Math.cos(latitude) * Math.cos(longitude));
      let best = -2;
      let second = -2;
      let dark = false;
      for (const entry of centers) {
        const dot = entry.center.dot(direction);
        if (dot > best) {
          second = best;
          best = dot;
          dark = entry.dark;
        } else if (dot > second) {
          second = dot;
        }
      }
      const seam = best - second < 0.012;
      let value = dark ? 28 : 246;
      if (seam) value = dark ? 40 : 150;
      // Leve variação de couro.
      value += ((x * 13 + y * 7) % 5) - 2;
      const offset = (y * width + x) * 4;
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = dark ? value + 4 : value - 2;
      image.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/**
 * Sombra de contato e halo numa textura só: miolo escuro do tamanho da bola
 * (ela "pesa" no gramado) e um anel creme fraco que a separa do fundo.
 */
function contactTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(0,0,0,0.58)");
  gradient.addColorStop(0.2, "rgba(0,0,0,0.46)");
  gradient.addColorStop(0.36, "rgba(255,250,215,0.17)");
  gradient.addColorStop(0.6, "rgba(255,250,215,0.07)");
  gradient.addColorStop(1, "rgba(255,250,215,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Resposta da mola a um impulso: 1 no contato, oscila e some em ~0.2 s. */
function springAt(age: number) {
  if (age >= SQUASH_LIFE) return 0;
  return Math.exp(-SQUASH_ZETA * SQUASH_OMEGA * age) * Math.cos(SQUASH_OMEGA_D * age);
}

export class BallView {
  readonly root = new THREE.Group();
  readonly sphere: THREE.Mesh;
  // root → squash (altura + escala no eixo do impacto) → unalign (desfaz o giro
  // do eixo) → sphere (só o rolamento). Assim a escala nunca gira com a bola e o
  // quaternion de rolamento continua limpo.
  private readonly squash = new THREE.Group();
  private readonly unalign = new THREE.Group();
  private readonly contact: THREE.Mesh;
  private readonly contactMaterial: THREE.MeshBasicMaterial;
  private readonly ghost: THREE.Mesh;
  private readonly texture: THREE.Texture;
  private readonly contactMap: THREE.Texture;
  private readonly calm: boolean;
  private readonly axis = new THREE.Vector3();
  private readonly spinAxis = new THREE.Vector3(1, 0, 0);
  private readonly spin = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private spinRate = 0;
  private lift = 0;
  private liftSpeed = 0;
  private lastX = 0;
  private lastZ = 0;
  // Último deslocamento não nulo: direção é estável mesmo quando o motor (120 Hz)
  // anda 1, 2 ou 3 passos por quadro; a velocidade estimada não é.
  private moveX = 1;
  private moveZ = 0;
  private lastVX = 0;
  private lastVZ = 0;
  private moving = false;
  private still = 0;
  private stretch = 0;
  private hitAge = SQUASH_LIFE;
  private hitAmount = 0;
  private hitX = 1;
  private hitZ = 0;
  private landAge = SQUASH_LIFE;
  private landAmount = 0;
  private initialized = false;

  constructor(private readonly radius: number, options: BallViewOptions = {}) {
    this.calm = Boolean(options.reducedMotion);
    this.texture = soccerBallTexture();
    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 40, 28),
      new THREE.MeshStandardMaterial({ map: this.texture, roughness: 0.42, metalness: 0 }),
    );
    this.sphere.castShadow = true;
    this.unalign.position.y = radius;
    this.unalign.add(this.sphere);
    this.squash.add(this.unalign);
    this.root.add(this.squash);
    // Raio-x: só desenha onde algo está NA FRENTE da bola (GreaterDepth). Com a
    // câmera alta, um boneco de 40 de altura esconde a bola logo atrás dele.
    const ghost = new THREE.Mesh(
      this.sphere.geometry,
      new THREE.MeshBasicMaterial({ color: "#fff6cf", transparent: true, opacity: 0.38, depthWrite: false, depthFunc: THREE.GreaterDepth }),
    );
    ghost.renderOrder = 20;
    this.sphere.add(ghost);
    this.ghost = ghost;

    this.contactMap = contactTexture();
    this.contactMaterial = new THREE.MeshBasicMaterial({ map: this.contactMap, transparent: true, depthWrite: false });
    this.contact = new THREE.Mesh(new THREE.PlaneGeometry(radius * 6, radius * 6), this.contactMaterial);
    this.contact.rotation.x = -Math.PI / 2;
    this.contact.position.y = 0.2;
    this.root.add(this.contact);
  }

  /** Bola reaparece no centro caindo do alto (troca de saída, pênalti). */
  drop(height = 70) {
    this.lift = height;
    this.liftSpeed = 0;
  }

  /**
   * Pulinho só de desenho (chute forte): sobe `height` unidades e quica uma vez.
   * x/z continuam do motor. Se já estiver no ar, não empilha.
   */
  hop(height: number) {
    const target = Math.max(0, Math.min(12, height));
    // `!(> 0)` também barra NaN: lift NaN nunca volta a 0 e a bola sumiria de vez.
    if (!(target > 0) || this.lift > 0.5) return;
    this.lift = Math.max(this.lift, 0.01);
    this.liftSpeed = Math.sqrt(2 * GRAVITY * target);
  }

  /**
   * Achata a bola no eixo (dirX, dirZ) do mundo. `update` já detecta chutes e
   * tabelas sozinho; isto é para quem souber de um choque que a posição não
   * mostra (rede, luva do goleiro).
   */
  impact(dirX: number, dirZ: number, strength: number) {
    const length = Math.hypot(dirX, dirZ);
    // Escrito assim para NaN também sair: hitAmount NaN × mola 0 ainda é NaN na escala.
    if (!(length > 1e-6) || !(strength > 0)) return;
    const amount = 0.22 * Math.min(1, strength);
    // Um choque mais fraco no meio do "tum" não corta o mais forte.
    if (this.hitAge < 0.12 && amount < this.hitAmount) return;
    this.hitAge = 0;
    this.hitAmount = amount;
    this.hitX = dirX / length;
    this.hitZ = dirZ / length;
  }

  /** Posição no mundo (x/z) já convertida; gira como se rolasse sem deslizar. */
  update(x: number, z: number, dt: number, teleported: boolean) {
    if (!this.initialized || teleported) {
      this.lastX = x;
      this.lastZ = z;
      this.lastVX = 0;
      this.lastVZ = 0;
      this.moving = false;
      this.still = 0;
      this.stretch = 0;
      this.initialized = true;
    }
    const dx = x - this.lastX;
    const dz = z - this.lastZ;
    const travel = Math.hypot(dx, dz);
    if (travel > 0.0001) {
      // Eixo perpendicular ao deslocamento, no plano do chão. Gira também no ar.
      this.axis.set(dz / travel, 0, -dx / travel);
      this.spin.setFromAxisAngle(this.axis, travel / this.radius);
      this.sphere.quaternion.premultiply(this.spin);
      if (dt > 0) {
        this.spinRate = travel / this.radius / dt;
        this.spinAxis.copy(this.axis);
      }
    } else if (this.lift > 0.01 && this.spinRate > 0.05 && dt > 0) {
      // Parada no x/z mas no ar (queda do reinício): segue girando e perde giro aos poucos.
      this.spinRate *= Math.exp(-dt * 1.5);
      this.spin.setFromAxisAngle(this.spinAxis, this.spinRate * dt);
      this.sphere.quaternion.premultiply(this.spin);
    } else if (this.lift <= 0.01) {
      this.spinRate = 0;
    }
    // Milhares de multiplicações seguidas acumulam erro: renormaliza de graça.
    this.sphere.quaternion.normalize();
    this.lastX = x;
    this.lastZ = z;

    if (dt > 0 && !teleported) this.detectImpact(dx, dz, travel, dt);

    if (this.lift > 0 || this.liftSpeed !== 0) {
      // Integração exata para gravidade constante: o pulo chega na altura pedida.
      this.lift += this.liftSpeed * dt - 0.5 * GRAVITY * dt * dt;
      this.liftSpeed -= GRAVITY * dt;
      if (this.lift <= 0) {
        this.lift = 0;
        const fall = Math.abs(this.liftSpeed);
        if (fall > 40) {
          this.landAge = 0;
          this.landAmount = Math.min(0.2, fall / 1600);
        }
        this.liftSpeed = fall > 70 ? fall * 0.42 : 0;
      }
    }

    this.shape(travel, dt);
    this.root.position.set(x, 0, z);
    this.squash.position.y = this.lift;
    // Sombra de contato encolhe e clareia quando a bola sai do chão.
    const contactScale = 1 - Math.min(0.5, this.lift / 40);
    this.contact.scale.set(contactScale, contactScale, 1);
    this.contactMaterial.opacity = 1 - Math.min(0.6, this.lift / 30);
  }

  /** Chute ou tabela: a direção do deslocamento vira de uma vez com a bola rápida. */
  private detectImpact(dx: number, dz: number, travel: number, dt: number) {
    if (travel <= 0.0001) {
      // Um quadro sem passo do motor não é parada; 0.1 s parada já é.
      this.still += dt;
      if (this.still > 0.1) this.moving = false;
      return;
    }
    const vx = dx / dt;
    const vz = dz / dt;
    const speed = travel / dt;
    if (this.moving) {
      const cos = (dx * this.moveX + dz * this.moveZ) / travel;
      const lastSpeed = Math.hypot(this.lastVX, this.lastVZ);
      if (cos < 0.8 && speed > 60 && lastSpeed > 60) {
        const changeX = vx - this.lastVX;
        const changeZ = vz - this.lastVZ;
        const change = Math.hypot(changeX, changeZ);
        if (change > 120) this.impact(changeX, changeZ, change / 700);
      }
    } else if (this.still > 0.1 && speed > 160) {
      // Saiu do repouso de uma vez: foi chutada.
      this.impact(vx, vz, speed / 700);
    }
    this.moveX = dx / travel;
    this.moveZ = dz / travel;
    this.lastVX = vx;
    this.lastVZ = vz;
    this.moving = true;
    this.still = 0;
  }

  /** Estica na velocidade e achata nos choques, sempre perto de volume constante. */
  private shape(travel: number, dt: number) {
    this.hitAge = Math.min(SQUASH_LIFE, this.hitAge + dt);
    this.landAge = Math.min(SQUASH_LIFE, this.landAge + dt);
    if (this.calm) return;
    const speed = dt > 0 ? travel / dt : 0;
    const target = Math.min(0.12, speed / 5000);
    this.stretch += (target - this.stretch) * (1 - Math.exp(-dt * 12));
    const along = this.hitAmount * springAt(this.hitAge);
    const vertical = this.landAmount * springAt(this.landAge);
    // O eixo troca do choque para o movimento só quando a mola já quase parou e o
    // esticão ainda está em zero: sem estalo de orientação.
    const useHit = this.hitAge < 0.25;
    const stretch = this.stretch * Math.min(1, Math.max(0, (this.hitAge - 0.25) / 0.15));
    const axisX = useHit ? this.hitX : this.moveX;
    const axisZ = useHit ? this.hitZ : this.moveZ;
    // Giro em Y que leva o X local para o eixo (axisX, axisZ): yaw = atan2(-z, x).
    const yaw = Math.atan2(-axisZ, axisX);
    const thin = 1 / Math.sqrt(1 + stretch);
    const sx = (1 + stretch) * (1 - along) * (1 + 0.5 * vertical);
    const sy = (1 - vertical) * (1 + 0.5 * along) * thin;
    const sz = (1 + 0.5 * vertical) * (1 + 0.5 * along) * thin;
    this.squash.quaternion.setFromAxisAngle(this.up, yaw);
    this.unalign.quaternion.setFromAxisAngle(this.up, -yaw);
    this.squash.scale.set(sx, sy, sz);
  }

  dispose() {
    this.sphere.geometry.dispose();
    (this.sphere.material as THREE.Material).dispose();
    (this.ghost.material as THREE.Material).dispose();
    this.contact.geometry.dispose();
    this.contactMaterial.dispose();
    this.texture.dispose();
    this.contactMap.dispose();
  }
}
