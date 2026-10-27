// Planos de câmera e luz da gala 3D, em função do relógio do roteiro.
//
// Mesma ideia da versão 2D: cada plano começa num instante e mistura com o
// anterior durante `blend` (0 = corte seco). O enquadramento é pedido em
// "quanto do mundo cabe" (largura × altura em volta de um ponto) e a distância
// sai da proporção da tela: o mesmo plano funciona deitado e em pé, sempre na
// área livre entre a tarja de cima e a legenda.

import {
  CHEST_Y,
  FACE_Y,
  HANDOFF_SPOT,
  MARK_X,
  RISER,
  WINNER_SPOT,
  emptyPose,
  mix,
  smooth01,
  type StagePlan,
} from "./stage-direction";

export type V3 = { x: number; y: number; z: number };

export type CamPose = {
  px: number;
  py: number;
  pz: number;
  tx: number;
  ty: number;
  tz: number;
  fov: number;
  /** Tremida de câmera na mão (multiplica a amplitude base). */
  shake: number;
};

export type ShotView = {
  aspect: number;
  /** Fração da altura da tela livre de tarjas e legenda (onde o assunto tem que caber). */
  free: number;
  portrait: boolean;
};

export type LightState = {
  key: V3;
  keyI: number;
  keyAngle: number;
  fill: V3;
  fillI: number;
  fillAngle: number;
  wash: [V3, V3, V3, V3];
  washI: number;
  /** Brilho do telão (1 = normal). */
  screen: number;
  /** Luz geral da sala (contra e preenchimento). */
  house: number;
  /** Facho fino em cima do troféu na coluna. */
  trophyBeam: number;
};

type Shot<T> = { start: number; blend: number; at: (time: number) => T };

/** Lê uma trilha de planos em `time`, misturando com o anterior durante o `blend` do plano. */
function sampleTrack<T>(track: Shot<T>[], time: number, blend: (from: T, to: T, k: number) => T): T {
  let index = 0;
  for (let cursor = 0; cursor < track.length; cursor += 1) {
    if (track[cursor].start <= time) index = cursor;
    else break;
  }
  const evaluate = (at: number): T => {
    const shot = track[at];
    const value = shot.at(time);
    if (at === 0 || shot.blend <= 0 || time >= shot.start + shot.blend) return value;
    return blend(evaluate(at - 1), value, smooth01((time - shot.start) / shot.blend));
  };
  return evaluate(index);
}

function mixCam(a: CamPose, b: CamPose, k: number): CamPose {
  return {
    px: mix(a.px, b.px, k),
    py: mix(a.py, b.py, k),
    pz: mix(a.pz, b.pz, k),
    tx: mix(a.tx, b.tx, k),
    ty: mix(a.ty, b.ty, k),
    tz: mix(a.tz, b.tz, k),
    fov: mix(a.fov, b.fov, k),
    shake: mix(a.shake, b.shake, k),
  };
}

const mixV = (a: V3, b: V3, k: number): V3 => ({ x: mix(a.x, b.x, k), y: mix(a.y, b.y, k), z: mix(a.z, b.z, k) });

function mixLights(a: LightState, b: LightState, k: number): LightState {
  return {
    key: mixV(a.key, b.key, k),
    keyI: mix(a.keyI, b.keyI, k),
    keyAngle: mix(a.keyAngle, b.keyAngle, k),
    fill: mixV(a.fill, b.fill, k),
    fillI: mix(a.fillI, b.fillI, k),
    fillAngle: mix(a.fillAngle, b.fillAngle, k),
    wash: [mixV(a.wash[0], b.wash[0], k), mixV(a.wash[1], b.wash[1], k), mixV(a.wash[2], b.wash[2], k), mixV(a.wash[3], b.wash[3], k)],
    washI: mix(a.washI, b.washI, k),
    screen: mix(a.screen, b.screen, k),
    house: mix(a.house, b.house, k),
    trophyBeam: mix(a.trophyBeam, b.trophyBeam, k),
  };
}

/** Até onde a câmera recua (a parede do fundo da plateia fica perto de z = 660) e a lente mais aberta. */
const MAX_DISTANCE = 430;
const MAX_FOV = 64;
/**
 * Plano de grupo em pé: recuada até o meio da plateia, a câmera sobe (grua)
 * para a linha de visão passar por cima das cabeças, inclusive de pé na ovação.
 */
const WHOLE_PORTRAIT_PITCH = 0.17;

/**
 * Enquadra `w × h` unidades em volta de (cx, cy, cz), olhando de `yaw`
 * (0 = de frente, da plateia) e `pitch` (positivo = de cima). Em pé a largura
 * pode sobrar um pouco para os lados (o assunto continua inteiro na altura),
 * menos com `whole`: num plano de grupo ninguém pode ficar cortado na borda.
 */
function frame(view: ShotView, cx: number, cy: number, cz: number, w: number, h: number, yaw: number, pitch: number, fov: number, shake = 1, push = 0, whole = false): CamPose {
  let tanV = Math.tan((fov * Math.PI) / 360);
  const width = view.portrait && !whole ? w * 0.72 : w;
  if (view.portrait && whole) pitch = Math.max(pitch, WHOLE_PORTRAIT_PITCH);
  let fit = Math.max(h / 2 / (tanV * view.free), width / 2 / (tanV * view.aspect));
  if (fit > MAX_DISTANCE) {
    // Plano aberto numa tela estreita: em vez de recuar até atravessar a parede
    // do fundo da plateia, a lente abre (até um teto).
    tanV = Math.min(Math.tan((MAX_FOV * Math.PI) / 360), Math.max(h / 2 / (MAX_DISTANCE * view.free), width / 2 / (MAX_DISTANCE * view.aspect)));
    fov = (Math.atan(tanV) * 360) / Math.PI;
    fit = Math.max(h / 2 / (tanV * view.free), width / 2 / (tanV * view.aspect));
  }
  const distance = fit * (1 - push);
  const flat = Math.cos(pitch);
  return {
    px: cx + Math.sin(yaw) * flat * distance,
    py: cy + Math.sin(pitch) * distance,
    pz: cz + Math.cos(yaw) * flat * distance,
    tx: cx,
    ty: cy,
    tz: cz,
    fov,
    shake,
  };
}

const progress = (time: number, from: number, to: number) => Math.max(0, Math.min(1, (time - from) / Math.max(0.01, to - from)));

export type ShotPlan = {
  camera: (time: number) => CamPose;
  lights: (time: number) => LightState;
};

export function buildShots(plan: StagePlan, view: ShotView, reducedMotion: boolean): ShotPlan {
  const beats = plan.beats;
  const scratch = emptyPose();
  const finalistAt = (index: number, time: number) => plan.finalists[index].sample(time, scratch);
  const presenterAt = (time: number) => plan.presenter.sample(time, scratch);
  const chest = (index: number, time: number, lift = CHEST_Y): V3 => {
    const pose = finalistAt(index, time);
    return { x: pose.x, y: pose.y + lift, z: pose.z };
  };
  const presenterChest = (time: number, lift = CHEST_Y): V3 => {
    const pose = presenterAt(time);
    return { x: pose.x, y: pose.y + lift, z: pose.z };
  };
    // À direita, de fora para dentro: o apresentador (atrás, à direita) não fica colado na cabeça dele.
  const sideYaw = (index: number) => (MARK_X[index] < 0 ? 0.2 : MARK_X[index] > 0 ? 0.24 : 0.12);

  /** Peito para cima, empurrando devagar ao longo do plano. */
  const close = (index: number, from: number, to: number, push = 0.1, shake = 1) => (time: number) => {
    const at = chest(index, time, 29.5);
    const u = progress(time, from, to);
    return frame(view, at.x, at.y, at.z, 36, 29, sideYaw(index) - 0.05 * u * Math.sign(sideYaw(index)), 0.03, 30, shake, push * u);
  };
  /** Rosto bem de perto (reação). */
  const faceShot = (index: number, from: number, to: number) => (time: number) => {
    const at = chest(index, time, FACE_Y);
    const u = progress(time, from, to);
    return frame(view, at.x, at.y - 2, at.z, 30, 22, sideYaw(index) * 0.8, 0.0, 28, 1.1, 0.08 * u);
  };
  const presenterShot = (from: number, to: number, push = 0.08, shake = 1) => (time: number) => {
    const at = presenterChest(time, 29);
    const u = progress(time, from, to);
    return frame(view, at.x, at.y, at.z, 46, 36, 0.12, 0.05, 30, shake, push * u);
  };
  const trio = (from: number, to: number, push = 0.06) => (time: number) =>
    frame(view, 0, 24, -3, 214, 58, 0, 0.06, 32, 0.8, push * progress(time, from, to), true);
  const pair = (a: number, b: number, from: number, to: number, push = 0.06) => (time: number) => {
    const pa = chest(a, time, 24);
    const pb = chest(b, time, 24);
    return frame(view, (pa.x + pb.x) / 2, (pa.y + pb.y) / 2, (pa.z + pb.z) / 2, Math.abs(pa.x - pb.x) + 62, 54, 0, 0.05, 32, 0.9, push * progress(time, from, to), true);
  };
  const wide = (time: number) => {
    const drift = reducedMotion ? 0 : Math.sin(time * 0.21) * 0.08;
    return frame(view, 0, 40, -36, 340, 136, drift, 0.1, 34, 0.6);
  };

  const shots: Shot<CamPose>[] = [];

  // Abertura: do fundo da plateia, por cima das cabeças, até o palco.
  const opening = frame(view, 0, 34, -26, 290, 116, 0, 0.1, 36, 0.6);
  shots.push({
    start: 0,
    blend: 0,
    at: (time) => {
      const u = smooth01(time / Math.max(0.1, beats.establishEnd));
      // Bezier: alto atrás da última fila, passa raspando as cabeças e desce no palco.
      const start = { x: opening.px, y: 112, z: 600 };
      const control = { x: opening.px, y: 96, z: (start.z + opening.pz) / 2 + 60 };
      const a = (1 - u) * (1 - u);
      const b = 2 * u * (1 - u);
      const c = u * u;
      return {
        px: a * start.x + b * control.x + c * opening.px,
        py: a * start.y + b * control.y + c * opening.py,
        pz: a * start.z + b * control.z + c * opening.pz,
        tx: opening.tx,
        ty: mix(58, opening.ty, u),
        tz: mix(-70, opening.tz, u),
        fov: mix(40, opening.fov, u),
        shake: 0.5,
      };
    },
  });

  // Finalistas, um a um: a câmera corre a fila.
  beats.nominees.forEach((nominee, order) => {
    shots.push({ start: nominee.start, blend: order === 0 ? 1.1 : 0.75, at: close(nominee.index, nominee.start, nominee.end, 0.12) });
  });

  shots.push({ start: beats.presenterStart, blend: 0.85, at: presenterShot(beats.presenterStart, beats.thirdStart, 0.1) });

  // Terceiro: os três juntos, o corte no nome e depois os dois que sobram.
  const R3 = beats.thirdReveal;
  shots.push({ start: beats.thirdStart, blend: 1, at: trio(beats.thirdStart, R3, 0.1) });
  shots.push({ start: R3, blend: reducedMotion ? 0.5 : 0.22, at: close(plan.thirdIndex, R3, R3 + 2.4, 0.1) });
  const [left, right] = plan.remaining;
  shots.push({ start: R3 + 2.4, blend: 1.1, at: pair(left, right, R3 + 2.4, beats.duelStart, 0.05) });

  // Duelo: cortes secos, com um soco de zoom em cada um e a câmera mais solta.
  const duelEnd = beats.revealStart;
  const cuts = plan.duelCuts;
  cuts.forEach((cut, order) => {
    const next = cuts[order + 1]?.at ?? duelEnd;
    const base = cut.focus === "presenter" ? presenterShot(cut.at, next, 0.06, 1.6) : close(cut.index, cut.at, next, 0.07, 1.6);
    shots.push({
      start: cut.at,
      blend: reducedMotion ? 0.35 : 0,
      at: (time) => {
        const pose = base(time);
        if (reducedMotion) return pose;
        // Entra um pouco mais perto e assenta.
        const kick = 0.12 * Math.exp(-Math.max(0, time - cut.at) * 8);
        return {
          ...pose,
          px: mix(pose.px, pose.tx, kick),
          py: mix(pose.py, pose.ty, kick),
          pz: mix(pose.pz, pose.tz, kick),
        };
      },
    });
  });

  // O envelope: os dois no quadro... e o nome.
  const RW = beats.winnerReveal;
  shots.push({ start: beats.revealStart, blend: 0.5, at: pair(left, right, beats.revealStart, RW, 0.12) });
  const winner = plan.firstIndex;
  shots.push({
    start: RW,
    blend: reducedMotion ? 0.5 : 0.26,
    at: (time) => {
      const at = chest(winner, time, 27);
      const u = progress(time, RW, RW + 2);
      // Um pouco de baixo: ele cresce na tela.
      return frame(view, at.x, at.y, at.z, 52, 44, sideYaw(winner) * 0.7, -0.05, 32, 1.1, 0.08 * u);
    },
  });
  if (plan.userIndex !== winner) {
    // Quem perdeu: o rosto do jogador, primeiro triste, depois aplaudindo.
    shots.push({ start: RW + 1.3, blend: 0, at: faceShot(plan.userIndex, RW + 1.3, beats.celebrateStart) });
  }

  // Festa: acompanha a subida, a entrega de perfil e o herói de baixo para cima.
  const CS = beats.celebrateStart;
  const D = WINNER_SPOT;
  const riserChest = RISER.top + CHEST_Y;
  shots.push({
    start: CS,
    blend: 1.1,
    at: (time) => {
      const at = chest(winner, time, 0);
      const cx = mix(at.x, D.x, 0.45);
      const cz = mix(at.z, D.z, 0.45);
      return frame(view, cx, at.y + 30, cz, 120, 66, 0.08, 0.16, 34, 0.8);
    },
  });
  const handoffCentre = { x: (D.x + HANDOFF_SPOT.x) / 2, z: (D.z + HANDOFF_SPOT.z) / 2 };
  shots.push({
    start: plan.handoffAt - 0.75,
    blend: 0.85,
    at: (time) => frame(view, handoffCentre.x, riserChest + 3, handoffCentre.z, 56, 38, 0.14, 0.04, 30, 0.8, 0.06 * progress(time, plan.handoffAt - 0.75, plan.liftAt)),
  });
  const reactionStart = beats.reactionStart;
  shots.push({
    start: plan.liftAt - 0.1,
    blend: reducedMotion ? 1.4 : 1,
    at: (time) => {
      const u = smooth01(progress(time, plan.liftAt - 0.1, reactionStart));
      // Da direita para a esquerda: começa longe de quem ficou no meio do palco (não entra na frente).
      const angle = mix(0.5, -0.35, u);
      const target = { x: D.x, y: RISER.top + 36, z: D.z };
      const fit = frame(view, target.x, target.y, target.z, 50, 62, angle, 0, 38, 0.7);
      const distance = Math.hypot(fit.px - target.x, fit.pz - target.z) * 0.92;
      // Câmera baixa, quase no piso do palco: o vencedor e a taça contra o telão.
      return { ...fit, px: target.x + Math.sin(angle) * distance, py: 13, pz: target.z + Math.cos(angle) * distance };
    },
  });

  // Reação: foto oficial (ganhou) ou o jogador aplaudindo com o vencedor ao fundo.
  if (plan.userIndex === winner) {
    shots.push({
      start: reactionStart,
      blend: 1.4,
      // Um pouco de cima: as cabeças da plateia da frente ficam no pé do quadro, sem tapar o palco.
      at: (time) => frame(view, 0, 30, -26, 236, 82, 0, 0.13, 32, 0.6, 0.04 * progress(time, reactionStart, beats.endStart), true),
    });
  } else {
    shots.push({
      start: reactionStart,
      blend: 0,
      at: (time) => {
        const at = chest(plan.userIndex, time, FACE_Y);
        const u = progress(time, reactionStart, beats.endStart);
        // O jogador na frente, o vencedor erguendo a taça atrás dele, ao lado:
        // a câmera fica na linha vencedor → jogador, girada para o meio do palco,
        // e mira um pouco na direção do praticável (em pé cabe menos: mira menos).
        const away = Math.atan2(at.x - D.x, at.z - D.z);
        const yaw = away - Math.sign(at.x || 1) * 0.3;
        const lean = view.portrait ? 0.1 : 0.24;
        const cx = mix(at.x, D.x, lean);
        const cy = mix(at.y + 2, RISER.top + 44, lean);
        const cz = mix(at.z, D.z, lean);
        return frame(view, cx, cy, cz, 40, 32, yaw, 0.02, 32, 0.9, 0.05 * u);
      },
    });
  }

  shots.push({ start: beats.endStart, blend: 1.8, at: wide });
  shots.sort((a, b) => a.start - b.start);

  // ---------------------------------------------------------------- luzes
  const floor = (x: number, z: number, y = 0): V3 => ({ x, y, z });
  const markFloor = (index: number, time: number): V3 => {
    const pose = finalistAt(index, time);
    return { x: pose.x, y: pose.y, z: pose.z };
  };
  const presenterFloor = (time: number): V3 => {
    const pose = presenterAt(time);
    return { x: pose.x, y: pose.y, z: pose.z };
  };
  const backlights = (time: number): [V3, V3, V3, V3] => [markFloor(0, time), markFloor(1, time), markFloor(2, time), presenterFloor(time)];
  const base = (time: number, overrides: Partial<LightState>): LightState => ({
    key: floor(0, -10),
    keyI: 1,
    keyAngle: 0.08,
    fill: floor(0, -10),
    fillI: 0.35,
    fillAngle: 0.12,
    wash: backlights(time),
    washI: 0.45,
    screen: 0.9,
    house: 0.3,
    trophyBeam: time < plan.pickAt ? 1 : 0,
    ...overrides,
  });

  const lights: Shot<LightState>[] = [];
  lights.push({
    start: 0,
    blend: 0,
    at: (time) => base(time, {
      key: floor(130 * Math.sin(time * 0.9), 0, 6 * Math.cos(time * 0.7)),
      keyAngle: 0.13,
      fill: floor(-130 * Math.sin(time * 0.9 + 0.6), 0, -12),
      fillI: 0.85,
      fillAngle: 0.13,
      wash: [0, 1, 2, 3].map((j) => floor((j - 1.5) * 95 + 70 * Math.sin(time * 1.15 + j * 1.7), 0, -30 + 34 * Math.cos(time * 0.8 + j))) as [V3, V3, V3, V3],
      washI: 0.7,
      screen: 0.9 * smooth01((time - 0.3) / 1.1),
      house: 0.45,
    }),
  });
  beats.nominees.forEach((nominee, order) => {
    lights.push({
      start: nominee.start,
      blend: order === 0 ? 0.9 : 0.55,
      at: (time) => base(time, { key: markFloor(nominee.index, time), keyAngle: 0.072, fill: markFloor(nominee.index, time), fillI: 0.3, fillAngle: 0.16 }),
    });
  });
  lights.push({
    start: beats.presenterStart,
    blend: 0.7,
    at: (time) => base(time, { key: presenterFloor(time), keyAngle: 0.07, fill: floor(0, 0, -2), fillI: 0.22, fillAngle: 0.2 }),
  });
  lights.push({
    start: beats.thirdStart,
    blend: 0.5,
    at: (time) => base(time, {
      key: floor(84 * Math.sin(time * 3.1), 0, 2),
      fill: floor(-84 * Math.sin(time * 3.1 + 0.4), 0, -2),
      fillI: 0.9,
      fillAngle: 0.08,
      washI: 0.3,
      screen: 0.8,
      house: 0.18,
    }),
  });
  lights.push({
    start: R3,
    blend: 0.15,
    at: (time) => base(time, { key: markFloor(plan.thirdIndex, time), keyAngle: 0.075, fillI: 0.12, washI: 0.4, house: 0.25 }),
  });
  lights.push({
    start: R3 + 2.4,
    blend: 1,
    at: (time) => base(time, {
      key: markFloor(left, time),
      fill: markFloor(right, time),
      fillI: 1,
      fillAngle: 0.075,
      wash: [markFloor(left, time), markFloor(right, time), markFloor(left, time), presenterFloor(time)],
      washI: 0.42,
      house: 0.2,
    }),
  });
  cuts.forEach((cut) => {
    lights.push({
      start: cut.at,
      blend: 0.14,
      at: (time) => {
        const focus = cut.focus === "presenter" ? presenterFloor(time) : markFloor(cut.index, time);
        const other = cut.focus === "presenter" ? floor(0, 0, -2) : markFloor(cut.index === left ? right : left, time);
        return base(time, {
          key: focus,
          keyAngle: 0.072,
          fill: other,
          fillI: 0.55,
          fillAngle: cut.focus === "presenter" ? 0.18 : 0.075,
          wash: [markFloor(left, time), markFloor(right, time), markFloor(left, time), presenterFloor(time)],
          washI: 0.36,
          house: 0.14,
        });
      },
    });
  });
  lights.push({
    start: beats.revealStart,
    blend: 0.4,
    at: (time) => {
      const a = markFloor(left, time);
      const b = markFloor(right, time);
      const middle = (a.x + b.x) / 2;
      const half = Math.abs(a.x - b.x) / 2;
      return base(time, {
        key: floor(middle + half * Math.sin(time * 4.4), 0, a.z),
        fill: floor(middle - half * Math.sin(time * 4.4), 0, b.z),
        fillI: 1,
        fillAngle: 0.075,
        washI: 0.25,
        screen: 0.7,
        house: 0.1,
      });
    },
  });
  // O nome: todas as luzes no vencedor (e o seguem até o praticável).
  lights.push({
    start: RW,
    blend: 0.12,
    at: (time) => {
      const at = markFloor(winner, time);
      return base(time, {
        key: at,
        keyAngle: 0.085,
        fill: at,
        fillI: 0.75,
        fillAngle: 0.12,
        wash: [at, at, at, at],
        washI: 0.6,
        screen: 1,
        house: 0.35,
      });
    },
  });
  if (plan.userIndex !== winner) {
    lights.push({
      start: RW + 1.3,
      blend: 0.3,
      at: (time) => {
        const at = markFloor(winner, time);
        return base(time, { key: markFloor(plan.userIndex, time), keyAngle: 0.07, fill: at, fillI: 0.7, fillAngle: 0.1, wash: [at, at, markFloor(plan.userIndex, time), at], washI: 0.5, screen: 0.95, house: 0.3 });
      },
    });
  }
  lights.push({
    start: CS,
    blend: 0.8,
    at: (time) => {
      const at = markFloor(winner, time);
      const host = presenterFloor(time);
      const handed = smooth01(progress(time, plan.handoffAt, plan.handoffDone + 0.3));
      const others = [0, 1, 2].filter((index) => index !== winner);
      return base(time, {
        key: at,
        keyAngle: 0.085,
        fill: mixV(host, at, handed),
        fillI: 0.85,
        fillAngle: 0.1,
        wash: [at, markFloor(others[0], time), markFloor(others[1], time), at],
        washI: 0.55,
        screen: 1,
        house: 0.4,
      });
    },
  });
  if (plan.userIndex === winner) {
    lights.push({
      start: reactionStart,
      blend: 1.2,
      at: (time) => base(time, {
        key: markFloor(winner, time),
        keyAngle: 0.09,
        fill: floor(0, 0, -20),
        fillI: 0.7,
        fillAngle: 0.2,
        wash: [markFloor(0, time), markFloor(1, time), markFloor(2, time), markFloor(winner, time)],
        washI: 0.5,
        screen: 1,
        house: 0.5,
      }),
    });
  } else {
    lights.push({
      start: reactionStart,
      blend: 0.6,
      at: (time) => {
        const at = markFloor(winner, time);
        return base(time, { key: markFloor(plan.userIndex, time), keyAngle: 0.07, fill: at, fillI: 0.8, fillAngle: 0.1, wash: [at, at, markFloor(plan.userIndex, time), at], washI: 0.5, screen: 0.95, house: 0.3 });
      },
    });
  }
  lights.push({
    start: beats.endStart,
    blend: 1.4,
    at: (time) => base(time, {
      key: markFloor(winner, time),
      keyAngle: 0.09,
      fill: floor(0, 0, -20),
      fillI: 0.6,
      fillAngle: 0.22,
      wash: [markFloor(0, time), markFloor(1, time), markFloor(2, time), markFloor(winner, time)],
      washI: 0.45,
      screen: 0.9,
      house: 0.45,
    }),
  });
  lights.sort((a, b) => a.start - b.start);

  return {
    camera: (time) => sampleTrack(shots, time, mixCam),
    lights: (time) => sampleTrack(lights, time, mixLights),
  };
}
