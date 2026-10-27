// Bola 3D: icosaedro truncado de verdade (12 pentágonos pretos, 20 hexágonos),
// pintado por Voronoi numa textura equiretangular — sem nenhum asset.

import * as THREE from "three";

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

export class BallView {
  readonly root = new THREE.Group();
  readonly sphere: THREE.Mesh;
  private readonly glow: THREE.Mesh;
  private readonly ghost: THREE.Mesh;
  private readonly texture: THREE.Texture;
  private readonly glowTexture: THREE.Texture;
  private readonly axis = new THREE.Vector3();
  private readonly spin = new THREE.Quaternion();
  private lift = 0;
  private liftSpeed = 0;
  private lastX = 0;
  private lastZ = 0;
  private initialized = false;

  constructor(private readonly radius: number) {
    this.texture = soccerBallTexture();
    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 40, 28),
      new THREE.MeshStandardMaterial({ map: this.texture, roughness: 0.42, metalness: 0 }),
    );
    this.sphere.castShadow = true;
    this.sphere.position.y = radius;
    this.root.add(this.sphere);
    // Raio-x: só desenha onde algo está NA FRENTE da bola (GreaterDepth). Com a
    // câmera alta, um boneco de 40 de altura esconde a bola logo atrás dele.
    const ghost = new THREE.Mesh(
      this.sphere.geometry,
      new THREE.MeshBasicMaterial({ color: "#fff6cf", transparent: true, opacity: 0.38, depthWrite: false, depthFunc: THREE.GreaterDepth }),
    );
    ghost.renderOrder = 20;
    this.sphere.add(ghost);
    this.ghost = ghost;

    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,250,215,0.55)");
    gradient.addColorStop(0.35, "rgba(255,250,215,0.16)");
    gradient.addColorStop(1, "rgba(255,250,215,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    this.glowTexture = new THREE.CanvasTexture(canvas);
    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 6, radius * 6),
      new THREE.MeshBasicMaterial({ map: this.glowTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.2;
    this.root.add(this.glow);
  }

  /** Bola reaparece no centro caindo do alto (troca de saída, pênalti). */
  drop(height = 70) {
    this.lift = height;
    this.liftSpeed = 0;
  }

  /** Posição no mundo (x/z) já convertida; gira como se rolasse sem deslizar. */
  update(x: number, z: number, dt: number, teleported: boolean) {
    if (!this.initialized || teleported) {
      this.lastX = x;
      this.lastZ = z;
      this.initialized = true;
    }
    const dx = x - this.lastX;
    const dz = z - this.lastZ;
    const travel = Math.hypot(dx, dz);
    if (travel > 0.0001 && this.lift <= 0.01) {
      // Eixo perpendicular ao deslocamento, no plano do chão.
      this.axis.set(dz, 0, -dx).normalize();
      this.spin.setFromAxisAngle(this.axis, travel / this.radius);
      this.sphere.quaternion.premultiply(this.spin);
    }
    this.lastX = x;
    this.lastZ = z;

    if (this.lift > 0 || this.liftSpeed !== 0) {
      this.liftSpeed -= 820 * dt;
      this.lift += this.liftSpeed * dt;
      if (this.lift <= 0) {
        this.lift = 0;
        this.liftSpeed = Math.abs(this.liftSpeed) > 70 ? -this.liftSpeed * 0.42 : 0;
      }
    }
    this.root.position.set(x, 0, z);
    this.sphere.position.y = this.radius + this.lift;
    const glowScale = 1 / (1 + this.lift / 30);
    this.glow.scale.setScalar(glowScale);
  }

  dispose() {
    this.sphere.geometry.dispose();
    (this.sphere.material as THREE.Material).dispose();
    (this.ghost.material as THREE.Material).dispose();
    this.glow.geometry.dispose();
    (this.glow.material as THREE.Material).dispose();
    this.texture.dispose();
    this.glowTexture.dispose();
  }
}
