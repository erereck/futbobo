// A Bola de Ouro em 3D: bola dourada com as costuras dos gomos (os mesmos 32
// gomos da bola da partida) sobre uma base afunilada preta e dourada.
//
// A origem é o pé da base, no centro. Quem segura usa `TROPHY_GRIP`: no colo
// as mãos seguram a própria bola (a base pende embaixo; segurando pela base, a
// bola subia até a altura do rosto e tapava a cara no close); erguida, a taça
// fica em pé em cima das mãos.

import * as THREE from "three";

export const TROPHY_BALL_RADIUS = 5.2;
/** Altura (a partir do pé) do ponto entre as palmas: no colo e erguida (negativo: a taça em pé em cima das mãos). */
export const TROPHY_GRIP = { cradle: 11.4, lift: -1.4 } as const;
export const TROPHY_HEIGHT = 17.6;

const BALL_CENTRE = 12.3;

/** Centros dos gomos (12 pentágonos + 20 hexágonos), como em `ball.ts`. */
function panelCentres() {
  const phi = (1 + Math.sqrt(5)) / 2;
  const centres: Array<[number, number, number]> = [];
  const push = (x: number, y: number, z: number) => {
    const length = Math.hypot(x, y, z);
    centres.push([x / length, y / length, z / length]);
  };
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      push(0, a, b * phi);
      push(a, b * phi, 0);
      push(b * phi, 0, a);
    }
  }
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) push(x, y, z);
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      push(0, a / phi, b * phi);
      push(a / phi, b * phi, 0);
      push(b * phi, 0, a / phi);
    }
  }
  return centres;
}

/**
 * Mapa das costuras (equirretangular): branco no gomo, sulco escuro e macio
 * na emenda. Vai como cor (escurece o ouro) e como relevo (o brilho pega na
 * borda do sulco). Calculado uma vez, no preparo.
 */
function seamTexture(width = 512, height = 256) {
  const centres = panelCentres();
  const count = centres.length;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const image = context.createImageData(width, height);
  const pixels = image.data;
  for (let y = 0; y < height; y += 1) {
    const latitude = (0.5 - (y + 0.5) / height) * Math.PI;
    const cosLatitude = Math.cos(latitude);
    const dy = Math.sin(latitude);
    for (let x = 0; x < width; x += 1) {
      const longitude = ((x + 0.5) / width) * Math.PI * 2 - Math.PI;
      const dx = cosLatitude * Math.sin(longitude);
      const dz = cosLatitude * Math.cos(longitude);
      let best = -2;
      let second = -2;
      for (let index = 0; index < count; index += 1) {
        const centre = centres[index];
        const dot = centre[0] * dx + centre[1] * dy + centre[2] * dz;
        if (dot > best) {
          second = best;
          best = dot;
        } else if (dot > second) second = dot;
      }
      // Sulco com borda macia: largura ~1,5% do raio.
      const gap = best - second;
      const groove = gap < 0.022 ? 1 - Math.max(0, (gap - 0.008) / 0.014) : 0;
      const value = Math.round(255 - groove * 150);
      const offset = (y * width + x) * 4;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export type Trophy = {
  root: THREE.Group;
  /** Brilho próprio da bola (0..1): sobe na revelação e com a taça erguida. */
  setGlow(value: number): void;
  textures: THREE.Texture[];
  dispose(): void;
};

/** Perfil (raio, altura) girado em volta do eixo: base, anel, cálice. */
function lathe(points: Array<[number, number]>, segments = 48) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

export function createTrophy(envMap: THREE.Texture | null): Trophy {
  const seams = seamTexture();
  const gold = new THREE.MeshStandardMaterial({
    color: "#f1c35a",
    metalness: 1,
    roughness: 0.24,
    envMap,
    envMapIntensity: 1.35,
    map: seams,
    bumpMap: seams,
    bumpScale: 1.4,
    emissive: new THREE.Color("#ffb627"),
    emissiveIntensity: 0,
  });
  const goldTrim = new THREE.MeshStandardMaterial({ color: "#e9b54a", metalness: 1, roughness: 0.2, envMap, envMapIntensity: 1.3 });
  const lacquer = new THREE.MeshStandardMaterial({ color: "#0b0a0c", metalness: 0.2, roughness: 0.16, envMap, envMapIntensity: 0.9 });

  const root = new THREE.Group();
  root.name = "golden-ball";
  const parts: THREE.BufferGeometry[] = [];
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    parts.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  };
  // Pé dourado chanfrado, corpo preto afunilado, anel e cálice dourados.
  add(lathe([[0, 0], [5.7, 0], [5.8, 0.5], [5.6, 1], [5.1, 1.25], [0, 1.25]]), goldTrim);
  add(lathe([[0, 1.2], [4.8, 1.2], [4.3, 2.6], [3.4, 4.4], [2.7, 5.8], [2.6, 6.1], [0, 6.1]]), lacquer);
  add(lathe([[0, 6], [2.95, 6], [3.05, 6.35], [2.95, 6.7], [0, 6.7]]), goldTrim);
  add(lathe([[0, 6.6], [2.2, 6.6], [2.4, 7.2], [3.2, 7.8], [3.6, 8.2], [0, 8.2]]), goldTrim);
  const ball = add(new THREE.SphereGeometry(TROPHY_BALL_RADIUS, 48, 32), gold);
  ball.position.y = BALL_CENTRE;

  return {
    root,
    setGlow(value) {
      gold.emissiveIntensity = 0.32 * Math.max(0, value);
    },
    textures: seams ? [seams] : [],
    dispose() {
      for (const geometry of parts) geometry.dispose();
      gold.dispose();
      goldTrim.dispose();
      lacquer.dispose();
      seams?.dispose();
    },
  };
}
