// Direção de câmera da festa do título. Cada beat do roteiro tem um ou dois
// planos, e cada plano é uma função pura do tempo (posição, alvo, FOV): pular
// para a frente cai no quadro certo sem precisar "alcançar" nada, e entre um
// plano e outro é corte seco, como num clipe.

import * as THREE from "three";
import { paradeBeatAt, type ParadeBeat, type ParadeTimeline } from "./parade-script";
import type { AvenueLayout } from "./stage-city";

export type DirectorLandmark = { position: THREE.Vector3; height: number };

/** O que não muda durante a cena. */
export type DirectorScene = {
  timeline: ParadeTimeline;
  variant: number;
  /** Lado da avenida preferido pelos planos (+1 em z > 0). */
  side: 1 | -1;
  avenue: AvenueLayout;
  deckHeight: number;
  /** Meio comprimento do trio (m). */
  truckHalfLength: number;
  /** Altura dos prédios da avenida (m): abaixo disso a câmera não sai do cânion. */
  roofHeight: number;
  heroLandmark: DirectorLandmark | null;
  finaleLandmark: DirectorLandmark | null;
  /** Tem fogos no céu (tarde/noite): o final olha mais para cima. */
  fireworks: boolean;
};

/** O que muda a cada quadro (coordenadas do mundo). */
export type DirectorFrame = {
  truck: THREE.Vector3;
  /** Pés do jogador. */
  player: THREE.Vector3;
  /** Meio do time no piso do deck. */
  team: THREE.Vector3;
  /** Topo da taça, quando ela está nas mãos. */
  trophy: THREE.Vector3 | null;
  /** Instante em que a taça sobe (para o alvo subir junto). */
  liftAt: number;
};

export type Shot = {
  /** Muda a cada corte. */
  id: string;
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  roll: number;
  /** Câmera na mão: 0 = drone liso, 1 = no meio do povo. */
  handheld: number;
  /** Câmera na pista: não pode entrar no povo (bandeira e cabeça tapam a lente). */
  street: boolean;
  /** O que não pode sair do quadro em tela estreita (retrato): o alvo puxa para ele com este peso. */
  subject: THREE.Vector3;
  subjectWeight: number;
};

export function createShot(): Shot {
  return { id: "", position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 45, roll: 0, handheld: 0, street: false, subject: new THREE.Vector3(), subjectWeight: 0 };
}

const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};
/** Entra e sai devagar (cúbica). */
const inOut = (value: number) => {
  const t = clamp01(value);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
/** Chega freando (drone pousando no enquadramento). */
const outEase = (value: number, power = 2.2) => 1 - Math.pow(1 - clamp01(value), power);

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _lm = new THREE.Vector3();

/** Azimute (no plano xz, de +x para +z) do trio para o marco; sem marco longe, avenida abaixo. */
function landmarkAzimuth(truck: THREE.Vector3, landmark: DirectorLandmark | null) {
  if (!landmark) return 0;
  const dx = landmark.position.x - truck.x;
  const dz = landmark.position.z - truck.z;
  // Marco em cima do trio (obelisco no meio da avenida): olha avenida abaixo.
  if (dx * dx + dz * dz < 40 * 40) return dx >= 0 ? 0 : Math.PI;
  return Math.atan2(dz, dx);
}

function landmarkPoint(scene: DirectorScene, frame: DirectorFrame, landmark: DirectorLandmark | null, out: THREE.Vector3) {
  if (landmark) return out.copy(landmark.position).setY(landmark.position.y + landmark.height * 0.6);
  return out.set(frame.truck.x + 260, 25, frame.truck.z);
}

/** Alvo que mistura duas DIREÇÕES (não dois pontos): o marco longe não arrasta o quadro. */
function blendLook(position: THREE.Vector3, near: THREE.Vector3, far: THREE.Vector3, weight: number, out: THREE.Vector3) {
  _a.subVectors(near, position).normalize();
  _b.subVectors(far, position).normalize();
  _a.lerp(_b, weight).normalize();
  return out.copy(position).addScaledVector(_a, 40);
}

// ------------------------------------------------------------- planos

function aerial(u: number, scene: DirectorScene, frame: DirectorFrame, shot: Shot) {
  const truck = frame.truck;
  const lm = scene.heroLandmark;
  const theta = landmarkAzimuth(truck, lm);
  const S = scene.side;
  const high = Math.max(95, scene.roofHeight + 40);
  const deck = _c.set(truck.x, scene.deckHeight + 1, truck.z);
  let azimuth: number;
  let radius: number;
  let height: number;
  let weight: number;
  if (scene.variant === 2) {
    // Espiral: começa quase a pino sobre o trio e desce girando até o marco aparecer atrás.
    const e = outEase(u, 2);
    azimuth = theta + Math.PI + S * mix(1.3, 0.12, e);
    radius = mix(34, 52, e);
    height = mix(high + 60, 24, e);
    weight = mix(0, 0.3, e);
  } else {
    // Drone vindo de longe por cima da cidade, com o marco atrás do trio.
    const e = outEase(u);
    const sweep = scene.variant === 1 ? -S : S;
    azimuth = theta + Math.PI + sweep * mix(0.6, 0.08, e);
    radius = mix(200, 46, e);
    height = mix(high, 24, e);
    // Segura o marco no quadro e só no fim inclina para o trio (a revelação).
    weight = mix(0.58, 0.12, smooth((u - 0.25) / 0.7));
  }
  shot.position.set(truck.x + Math.cos(azimuth) * radius, height, truck.z + Math.sin(azimuth) * radius);
  blendLook(shot.position, deck, landmarkPoint(scene, frame, lm, _lm), weight, shot.target);
  shot.fov = mix(50, 43, u);
  shot.roll = 0;
  shot.handheld = 0.12;
  shot.id = "aerial";
}

function avenue(u: number, part: number, scene: DirectorScene, frame: DirectorFrame, shot: Shot) {
  const t = frame.truck;
  const D = scene.deckHeight;
  const half = scene.truckHalfLength;
  const S = scene.side;
  const e = inOut(u);
  shot.roll = 0;
  if (part === 0) {
    if (scene.variant === 1) {
      // Quarto de trás: paredão de som e o painel traseiro.
      shot.position.set(t.x - half - 9 + 4 * e, 2.2, t.z + S * 6.5);
      shot.target.set(t.x + half * 0.2, D * 0.9, t.z);
      shot.fov = 50;
    } else if (scene.variant === 2) {
      // Rente ao chão, bem aberto: o trio vira um prédio andando.
      shot.position.set(t.x + half + 9 - 2 * e, 0.75, t.z - S * 3.5);
      shot.target.set(t.x, D + 1.4, t.z);
      shot.fov = 56;
    } else {
      // Na frente, baixo, recuando com o trio: ele vem para cima da câmera.
      shot.position.set(t.x + half + 11 - 4 * e, 1.3, t.z + S * (2.2 + 1.3 * e));
      shot.target.set(t.x + half * 0.4, D + 1.3, t.z);
      shot.fov = 50;
    }
    shot.handheld = 0.8;
    shot.id = "avenue-a";
    shot.street = true;
    return;
  }
  // Travelling ao lado do paredão de alto-falantes, de trás para a frente, rente
  // à grade (dentro do povo, bandeira tapa a lente).
  // Longe das bandeiras que a primeira fila balança por cima da grade.
  const curb = S * Math.max(scene.avenue.width / 2 - 1.6, Math.abs(t.z) + 4.5);
  shot.position.set(t.x + mix(-half - 2, half + 3, e), 3.1, curb);
  // Olha o trecho do trio que está passando, um pouco à frente: termina num 3/4 da frente.
  shot.target.set(t.x + mix(-half * 0.3, half * 0.7, e), D + 0.9, t.z);
  shot.fov = 54;
  shot.handheld = 0.7;
  shot.id = "avenue-b";
  shot.street = true;
}

function crowd(u: number, part: number, scene: DirectorScene, frame: DirectorFrame, shot: Shot) {
  const t = frame.truck;
  const D = scene.deckHeight;
  const half = scene.truckHalfLength;
  const S = scene.side;
  const W = scene.avenue.width;
  const e = inOut(u);
  shot.roll = 0;
  if (part === 0) {
    // Rente à grade, na altura dos olhos: o povo enche um lado do quadro e o
    // trio vem chegando pela diagonal (dentro da multidão alguém taparia a lente).
    // A ~2 m dos seguranças da beira da pista (mais perto, uma cabeça tapa meio quadro).
    shot.position.set(t.x + half + 11 - 4 * e, 1.75, S * Math.max(Math.abs(t.z) + 4, W / 2 - 2.6));
    // Avenida larga (9 de Julio): o alvo não pode colar na grade, senão o trio sai pela borda.
    shot.target.set(t.x + 2, 2.7, S * Math.max(Math.abs(t.z) + 2, Math.min(W / 2 - 4.2, Math.abs(t.z) + 7)));
    shot.fov = 52;
    shot.handheld = 1.1;
    shot.subject.set(t.x + half * 0.6, D * 0.8, t.z);
    shot.subjectWeight = 0.7;
    shot.id = "crowd-a";
    shot.street = true;
    return;
  }
  // Do alto do trio para o povo do lado: cartazes com o nome dele, sinalizadores.
  shot.position.set(t.x + half * 0.3 + 0.8 * e, D + 2.7, t.z + S * 1.4);
  shot.target.set(t.x + 10 + 3 * e, 1.8, S * (W / 2 + scene.avenue.crowdDepth * 0.35));
  shot.fov = 46;
  shot.handheld = 0.8;
  shot.id = "crowd-b";
}

function deck(u: number, part: number, scene: DirectorScene, frame: DirectorFrame, shot: Shot) {
  const t = frame.truck;
  const D = scene.deckHeight;
  const half = scene.truckHalfLength;
  const S = scene.side;
  const p = frame.player;
  const e = inOut(u);
  shot.roll = 0;
  if (part === 0) {
    if (scene.variant === 1) {
      // De trás e de cima do time: as costas com os números e a avenida lotada à frente.
      shot.position.set(t.x - half * 0.35 + 1.2 * e, D + 3.4, t.z - S * 2.4);
      shot.target.set(p.x + 4.5, D + 0.9, t.z);
      shot.fov = 50;
    } else {
      // De lado, na altura dos olhos (abaixo dos varais de bandeirinhas): o time
      // inteiro dançando em diagonal, a câmera deslizando junto.
      shot.position.set(p.x + 2.6 - 1.6 * e, D + 1.35, t.z + S * 4.6);
      shot.target.set(frame.team.x + 0.8, frame.team.y + 1.2, frame.team.z);
      shot.fov = 50;
    }
    shot.handheld = 0.6;
    shot.id = "deck-a";
    return;
  }
  // Aproximação no jogador, um pouco de baixo (por baixo das bandeiras da frente e dos varais).
  shot.position.set(p.x + mix(4.8, 2.4, e), p.y + mix(1.05, 1.2, e), p.z + S * mix(1.7, 0.6, e));
  shot.target.set(p.x, p.y + 1.5, p.z);
  shot.fov = mix(40, 33, e);
  shot.handheld = 0.5;
  shot.id = "deck-b";
}

function trophy(time: number, u: number, part: number, scene: DirectorScene, frame: DirectorFrame, shot: Shot) {
  const t = frame.truck;
  const D = scene.deckHeight;
  const half = scene.truckHalfLength;
  const S = scene.side;
  const p = frame.player;
  const e = inOut(u);
  if (part === 0) {
    // Contra-plongée girando em volta do herói enquanto a taça sobe.
    // Na frente do deck, entre as bandeiras das quinas, na altura do rosto e
    // olhando para cima (mais baixo, a grade e a faixa da frente tapam o herói).
    const angle = S * mix(-0.45, 0.35, e);
    const radius = mix(3.4, 2.8, e);
    shot.position.set(p.x + Math.cos(angle) * radius, p.y + mix(1.45, 1.65, e), p.z + Math.sin(angle) * radius);
    const chest = _a.set(p.x, p.y + 1.35, p.z);
    if (frame.trophy) {
      const up = smooth((time - frame.liftAt) / 0.7);
      shot.target.copy(chest).lerp(frame.trophy, 0.25 + 0.45 * up);
    } else shot.target.copy(chest);
    shot.fov = 50;
    shot.roll = S * 0.035;
    shot.handheld = 0.45;
    shot.id = "trophy-a";
    return;
  }
  // Grua subindo: o time, o povo e o céu pegando fogo.
  shot.position.set(t.x + half + 8 + 6 * e, D + 1.5 + 7 * e, t.z + S * (7 + 5 * e));
  shot.target.set(p.x, p.y + 1.6 + 1.5 * e, p.z);
  shot.fov = 50;
  shot.roll = 0;
  shot.handheld = 0.3;
  shot.id = "trophy-b";
}

/** Ângulo em (-π, π]. */
const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/**
 * Azimute do drone do final sem prédio entre ele e o trio: no eixo da avenida
 * (olhando ao longo dela) ou sobre o lado aberto (mar). De lado, por cima das
 * fachadas, o paredão da primeira fileira tapa o trio a qualquer altura útil.
 */
function clearAzimuth(azimuth: number, scene: DirectorScene) {
  const band = 0.3;
  const a = wrapAngle(azimuth);
  const open = scene.avenue.openSide;
  const sin = Math.sin(a);
  if (Math.abs(sin) <= Math.sin(band) || (open !== 0 && Math.sign(sin) === open)) return a;
  // Encosta na beirada mais perto da faixa do eixo (frente ou trás do trio).
  const side = Math.sign(sin);
  const candidates = [side * band, side * (Math.PI - band)];
  return Math.abs(wrapAngle(a - candidates[0])) < Math.abs(wrapAngle(a - candidates[1])) ? candidates[0] : candidates[1];
}

/** Final e cartão: drone se afastando e subindo; no fim, órbita lenta sem fim. */
function pullBack(e: number, orbit: number, scene: DirectorScene, frame: DirectorFrame, shot: Shot) {
  const truck = frame.truck;
  const D = scene.deckHeight;
  const S = scene.side;
  const lm = scene.finaleLandmark;
  const theta = landmarkAzimuth(truck, lm);
  const azimuth = clearAzimuth(theta + Math.PI + S * (mix(-0.3, 0.25, e) + orbit), scene);
  // Sobre o lado aberto (mar) ou no eixo da avenida, dentro do cânion: baixo
  // o bastante para o povo encher a avenida e o céu (marco, fogos) o alto do quadro.
  const open = scene.avenue.openSide !== 0 && Math.sign(Math.sin(azimuth)) === scene.avenue.openSide && Math.abs(Math.sin(azimuth)) > 0.3;
  const top = open ? Math.max(28, Math.min(40, scene.roofHeight * 0.7)) : Math.max(20, Math.min(32, scene.roofHeight * 0.32));
  const radius = mix(16, open ? 80 : 64, e);
  const height = mix(D + 6, top, e);
  shot.position.set(truck.x + Math.cos(azimuth) * radius, height, truck.z + Math.sin(azimuth) * radius);
  const fov = mix(46, 52, e);
  // Trio no terço de baixo do quadro e o resto para o céu; de lado, puxa o
  // olhar para o marco só até onde o trio continua no quadro.
  const dx = truck.x - shot.position.x;
  const dz = truck.z - shot.position.z;
  const truckYaw = Math.atan2(dz, dx);
  let yaw = truckYaw;
  if (lm) {
    const lmYaw = Math.atan2(lm.position.z - shot.position.z, lm.position.x - shot.position.x);
    const half = Math.atan(Math.tan((fov * Math.PI) / 360) * (16 / 9));
    const turn = Math.max(-half * 0.45, Math.min(half * 0.45, wrapAngle(lmYaw - truckYaw)));
    yaw += turn * (scene.fireworks ? 0.5 : 0.8) * e;
  }
  const truckPitch = Math.atan2(D + 2 - height, Math.hypot(dx, dz));
  let pitch = truckPitch + ((fov * Math.PI) / 180) * mix(0.02, scene.fireworks ? 0.3 : 0.22, e);
  if (lm) {
    // Marco alto (Cristo no morro): sobe o olhar até o topo dele entrar, sem perder o trio.
    const top3 = landmarkPoint(scene, frame, lm, _lm);
    const lmPitch = Math.atan2(top3.y + lm.height * 0.4 - height, Math.hypot(top3.x - shot.position.x, top3.z - shot.position.z));
    const vfov = (fov * Math.PI) / 180;
    pitch = Math.max(pitch, Math.min(lmPitch - vfov * 0.38, truckPitch + vfov * 0.36) * e + pitch * (1 - e));
  }
  shot.target.set(
    shot.position.x + Math.cos(yaw) * Math.cos(pitch) * 40,
    shot.position.y + Math.sin(pitch) * 40,
    shot.position.z + Math.sin(yaw) * Math.cos(pitch) * 40,
  );
  shot.fov = fov;
  shot.roll = 0;
  shot.handheld = 0.12;
}

// ---------------------------------------------------------- roteiro

/** Qual dos dois planos do beat e quanto dele já passou (reaproveitado: nada alocado por quadro). */
const _split = { part: 0, u: 0 };
function split(beat: ParadeBeat, time: number, at: number) {
  const length = Math.max(0.001, beat.end - beat.start);
  const u = (time - beat.start) / length;
  _split.part = u < at ? 0 : 1;
  _split.u = u < at ? u / at : (u - at) / (1 - at);
  return _split;
}

/**
 * Câmera ideal no instante `time` (sem tremida nem ajuste de tela). A cidade
 * vem por último: abaixo do telhado a câmera não sai da avenida.
 */
export function directShot(time: number, scene: DirectorScene, frame: DirectorFrame, shot: Shot) {
  shot.street = false;
  shot.subjectWeight = 0;
  const beat = paradeBeatAt(scene.timeline, time);
  const length = Math.max(0.001, beat.end - beat.start);
  switch (beat.id) {
    case "aerial":
      aerial(clamp01((time - beat.start) / length), scene, frame, shot);
      break;
    case "avenue": {
      const s = split(beat, time, 0.5);
      avenue(s.u, s.part, scene, frame, shot);
      break;
    }
    case "crowd": {
      const s = split(beat, time, 0.52);
      crowd(s.u, s.part, scene, frame, shot);
      break;
    }
    case "deck": {
      const s = split(beat, time, 0.5);
      deck(s.u, s.part, scene, frame, shot);
      break;
    }
    case "trophy": {
      const s = split(beat, time, 0.6);
      trophy(time, s.u, s.part, scene, frame, shot);
      break;
    }
    case "finale":
      pullBack(inOut((time - beat.start) / length), 0, scene, frame, shot);
      shot.id = "finale";
      break;
    default:
      // Continua exatamente de onde o final parou, balançando devagar para os
      // lados (uma volta inteira passaria por trás dos prédios).
      pullBack(1, 0.35 * Math.sin((time - beat.start) * 0.16), scene, frame, shot);
      shot.id = "finale";
      break;
  }
  keepInStreet(scene, shot.position, shot.street);
  return shot;
}

/** Abaixo da linha dos telhados a câmera fica entre as fachadas (não atravessa prédio). */
export function keepInStreet(scene: DirectorScene, position: THREE.Vector3, street = false) {
  if (street) {
    const curb = scene.avenue.width / 2 - 1.2;
    position.z = Math.max(-curb, Math.min(curb, position.z));
  }
  const avenueWidth = scene.avenue.width / 2 + scene.avenue.crowdDepth * 0.8;
  const above = smooth((position.y - scene.roofHeight - 4) / 18);
  const limit = avenueWidth + above * 4000;
  const open = scene.avenue.openSide;
  if (position.z > limit && open !== 1) position.z = limit;
  if (position.z < -limit && open !== -1) position.z = -limit;
  if (position.y < 0.5) position.y = 0.5;
}

/**
 * Quadro pensado em paisagem (16:9). Em telas estreitas abre o FOV e, quando
 * ele bate no limite, afasta a câmera do alvo; no retrato aceita perder um
 * pouco das laterais para o assunto não ficar minúsculo.
 */
export function fitAspect(fov: number, aspect: number, out = { fov: 0, distance: 1 }) {
  const reference = 16 / 9;
  out.fov = fov;
  out.distance = 1;
  if (aspect >= 1.5) return out;
  const halfTan = Math.tan((fov * Math.PI) / 360);
  const coverage = mix(0.62, 1, clamp01((aspect - 0.5) / (1.5 - 0.5)));
  const wantTan = (halfTan * reference * coverage) / aspect;
  const maxTan = Math.tan((68 * Math.PI) / 360);
  const outTan = Math.max(halfTan, Math.min(wantTan, maxTan));
  out.fov = (Math.atan(outTan) * 360) / Math.PI;
  out.distance = Math.min(1.7, Math.max(1, wantTan / outTan));
  return out;
}
