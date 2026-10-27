// Taça da Copa do Mundo estilizada: base com duas faixas verdes (malaquita),
// duas figuras em espiral subindo e segurando o globo. Feita em ~0,55 m (a de
// verdade tem 0,37 m e some na mão do boneco).
//
// O corpo é um torno (LatheGeometry) torcido: o raio ganha dois gomos que giram
// com a altura — lê como duas figuras abraçadas em espiral. Dois materiais:
// ouro (metal) e malaquita. Sem mapa de ambiente o ouro ficaria preto, então
// ele tem um brilho próprio dourado fraco que garante a cor.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const WORLD_CUP_TROPHY_HEIGHT = 0.55;

export function buildWorldCupTrophy(): THREE.Group {
  const group = new THREE.Group();
  group.name = "world-cup-trophy";

  // Perfil (raio, altura) de baixo para cima. A base fica por conta dos anéis.
  const profile: Array<[number, number]> = [
    [0.0, 0.112],
    [0.086, 0.112],
    [0.084, 0.13],
    [0.072, 0.17],
    [0.058, 0.22],
    [0.047, 0.27],
    [0.05, 0.31],
    [0.064, 0.35],
    [0.084, 0.39],
    [0.094, 0.418],
    [0.088, 0.44],
    [0.068, 0.455],
    [0.04, 0.462],
    [0.0, 0.464],
  ];
  const lathe = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    56,
  );
  // Torce e esculpe: dois gomos (as duas figuras) girando ~1 volta até o topo,
  // com braços abrindo perto do globo.
  const position = lathe.getAttribute("position") as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let index = 0; index < position.count; index += 1) {
    v.fromBufferAttribute(position, index);
    const radius = Math.hypot(v.x, v.z);
    if (radius < 1e-5) continue;
    const t = THREE.MathUtils.clamp((v.y - 0.12) / 0.33, 0, 1);
    const angle = Math.atan2(v.z, v.x);
    const twist = t * Math.PI * 1.3;
    const lobes = 1 + (0.34 * Math.sin(2 * (angle - twist)) + 0.09 * Math.sin(6 * (angle - twist * 1.4))) * Math.sin(Math.PI * Math.min(1, t * 1.15));
    const scaled = radius * lobes;
    v.x = Math.cos(angle) * scaled;
    v.z = Math.sin(angle) * scaled;
    position.setXYZ(index, v.x, v.y, v.z);
  }
  // Normais suaves no torno indexado; o merge precisa da versão sem índice.
  lathe.computeVertexNormals();
  const body = stripUv(lathe);

  // Globo com continentes em relevo (ruído barato de senos).
  const globe = new THREE.SphereGeometry(0.074, 40, 28);
  const globePosition = globe.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < globePosition.count; index += 1) {
    v.fromBufferAttribute(globePosition, index).normalize();
    const land = Math.sin(v.x * 5.1 + 1.3) * Math.sin(v.y * 4.3) + Math.sin(v.z * 6.2 + v.x * 2.0) * 0.6;
    const bump = land > 0.35 ? 0.0045 : 0;
    v.multiplyScalar(0.074 + bump);
    globePosition.setXYZ(index, v.x, v.y + 0.5, v.z);
  }
  globe.computeVertexNormals();

  // Anéis de ouro da base (as faixas verdes vão por cima, em outro material).
  const ring = (radius: number, height: number, y: number) => {
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 48, 1);
    geometry.translate(0, y + height / 2, 0);
    return geometry;
  };
  const gold = mergeGeometries([
    body,
    stripUv(globe),
    stripUv(ring(0.097, 0.022, 0)),
    stripUv(ring(0.096, 0.014, 0.054)),
    stripUv(ring(0.092, 0.012, 0.1)),
  ]);
  // As peças intermediárias nunca vão para a GPU: libera já.
  lathe.dispose();
  body.dispose();
  globe.dispose();
  const goldMaterial = new THREE.MeshStandardMaterial({
    color: "#ffcf5c",
    metalness: 1,
    roughness: 0.25,
    emissive: "#6b4706",
    emissiveIntensity: 0.55,
  });
  const goldMesh = new THREE.Mesh(gold ?? body, goldMaterial);
  goldMesh.name = "trophy-gold";

  const malachite = mergeGeometries([stripUv(ring(0.095, 0.032, 0.022)), stripUv(ring(0.091, 0.032, 0.068))]);
  const malachiteMaterial = new THREE.MeshStandardMaterial({ color: "#0f7a4c", metalness: 0.1, roughness: 0.22, emissive: "#03301c", emissiveIntensity: 0.6 });
  const malachiteMesh = new THREE.Mesh(malachite ?? ring(0.095, 0.064, 0.022), malachiteMaterial);
  malachiteMesh.name = "trophy-malachite";

  group.add(goldMesh, malachiteMesh);
  group.userData.height = WORLD_CUP_TROPHY_HEIGHT;
  // Quem tira a taça da cena chama `dispose` pelo userData (o grupo não tem método próprio).
  group.userData.dispose = () => {
    goldMesh.geometry.dispose();
    malachiteMesh.geometry.dispose();
    goldMaterial.dispose();
    malachiteMaterial.dispose();
  };
  return group;
}

/** mergeGeometries exige os mesmos atributos: o ouro fica só com posição e normal. */
function stripUv(geometry: THREE.BufferGeometry) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat.getAttribute("uv")) flat.deleteAttribute("uv");
  return flat;
}
