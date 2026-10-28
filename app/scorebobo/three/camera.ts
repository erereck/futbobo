// Diretor de câmera do Scorebobo. Cada "plano" calcula uma pose desejada
// (posição, alvo, abertura) a partir do estado; a troca de plano mistura a
// pose de onde a câmera estava com a do plano novo numa curva suave (sem
// tranco nem corte, exceto no replay, que passa por um mergulho no escuro).
//
// Planos: apresentação (da arquibancada até a mira), mira (atrás e acima do
// herói, enquadrando gol e companheiros; parada, para o traço bater com o
// dedo), voo (segue a bola com antecipação), chute (rente à trave ou atrás do
// gol), gol (segura na rede estufando em câmera lenta e depois gira em volta
// do artilheiro), defesa (close no goleiro), reação (close no herói) e replay
// (os ângulos da simulação: 0 câmera de TV na lateral, 1 atrás do gol de frente
// para o chute, 2 colada na bola, saindo do rosto do herói).

import * as THREE from "three";
import { PITCH, type GameState, type SimEvent, type Vec3 } from "../types";
import { clamp, clamp01, dampVec, mix, smoother, wobble } from "./util";

export type ShotKind =
  | "intro"
  | "aim"
  | "follow"
  | "shot"
  | "goalHold"
  | "celebrate"
  | "keeper"
  | "react"
  | "focus"
  | "replay"
  | "done";

type Pose = { pos: THREE.Vector3; target: THREE.Vector3; fov: number };

const GOAL = new THREE.Vector3(0, 1.1, PITCH.goalLineZ);
const UP = new THREE.Vector3(0, 1, 0);
/** Duração do voo de apresentação (a simulação dá ~1,4 s de intro; o resto mistura com a mira). */
const INTRO_SWEEP = 1.9;

function pose(): Pose {
  return { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 50 };
}

function copyPose(out: Pose, from: Pose) {
  out.pos.copy(from.pos);
  out.target.copy(from.target);
  out.fov = from.fov;
  return out;
}

export class CameraDirector {
  shot: ShotKind = "intro";
  /** Tempo real no plano atual. */
  private shotT = 0;
  private readonly from = pose();
  private readonly desired = pose();
  private readonly actual = pose();
  private blendT = 1;
  private blendDur = 0.001;
  // Embalo da câmera: a pose de partida continua andando e freia sozinha (a
  // troca de plano nunca começa com a câmera parando de repente).
  private readonly velPos = new THREE.Vector3();
  private readonly velTarget = new THREE.Vector3();
  private readonly fromVelPos = new THREE.Vector3();
  private readonly fromVelTarget = new THREE.Vector3();
  private readonly lastPos = new THREE.Vector3();
  private readonly lastTarget = new THREE.Vector3();
  private hasLast = false;
  private readonly aimPose = pose();
  private aimKey = "";
  private aimSettled = false;
  private readonly fitCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  private readonly probe = new THREE.Vector3();
  // Rigs suavizados.
  private readonly followPos = new THREE.Vector3();
  private readonly followTarget = new THREE.Vector3();
  private readonly trackTarget = new THREE.Vector3();
  private readonly orbitCenter = new THREE.Vector3();
  private orbitAngle = 0;
  private shotSide = 1;
  private shotVariant = 0;
  private readonly shotOrigin = new THREE.Vector3();
  private focusId: string | null = null;
  private scorerId: string | null = null;
  private keeperId: string | null = null;
  private replayAngle = -1;
  private replaySide = 1;
  private readonly replayHero = new THREE.Vector3();
  private readonly replayStart = new THREE.Vector3();
  private aspect = 16 / 9;
  private shake = 0;
  /** Soco de zoom no gol (fecha a lente e volta). */
  private punchAmt = 0;
  private time = 0;
  private outcomeHandled = false;
  /** Fase só de chute direto: a mira ignora os companheiros e fecha no gol. */
  shootOnly = false;
  /** O plano trocou de ângulo do replay (quem desenha escurece a tela). */
  cutRequested = false;
  /** Centro visual de um ator (o corpo pode estar longe do ponto dele, no mergulho). */
  focusOf: ((id: string, out: THREE.Vector3) => THREE.Vector3 | null) | null = null;
  private readonly focusPoint = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly reducedMotion: boolean,
  ) {}

  get portrait() {
    return this.aspect < 0.85;
  }

  /** Pose atual da câmera de mira (para o traço e para quem quiser comparar). */
  get settled() {
    return this.shot === "aim" && this.blendT >= this.blendDur && this.aimSettled;
  }

  /**
   * O dedo encostou com a câmera ainda chegando na mira (logo depois de um
   * domínio): termina a viagem na hora. O traço é lido com a câmera parada,
   * senão a fita no gramado escorrega para longe do dedo.
   */
  snapToAim() {
    if (this.shot !== "aim" || this.settled) return;
    this.blendT = this.blendDur;
    this.aimSettled = true;
    copyPose(this.actual, this.aimPose);
    this.velPos.set(0, 0, 0);
    this.velTarget.set(0, 0, 0);
    this.lastPos.copy(this.actual.pos);
    this.lastTarget.copy(this.actual.target);
    const camera = this.camera;
    camera.position.copy(this.actual.pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(this.actual.target);
    camera.fov = this.actual.fov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  setAspect(aspect: number) {
    if (Math.abs(aspect - this.aspect) > 0.01) {
      this.aspect = aspect;
      this.aimKey = "";
    }
  }

  /** Gol: a lente fecha num soco e volta (junto com um tranco curto). */
  punch(strength: number) {
    if (this.reducedMotion) return;
    this.punchAmt = Math.max(this.punchAmt, strength);
    this.bump(0.35 * strength);
  }

  /** Pancada (trave, defesa): treme a câmera por um instante. */
  bump(strength: number) {
    if (this.reducedMotion) return;
    this.shake = Math.max(this.shake, strength);
  }

  private cut(kind: ShotKind, duration: number) {
    if (kind === this.shot && duration > 0) return;
    copyPose(this.from, this.actual);
    // Corte seco (replay) não leva embalo.
    if (duration > 0.01) {
      this.fromVelPos.copy(this.velPos);
      this.fromVelTarget.copy(this.velTarget);
    } else {
      this.fromVelPos.set(0, 0, 0);
      this.fromVelTarget.set(0, 0, 0);
    }
    this.shot = kind;
    this.shotT = 0;
    this.blendT = 0;
    this.blendDur = Math.max(0.001, duration);
  }

  // ---------------------------------------------------------------- mira

  /**
   * Atrás e acima do herói olhando para o gol, como no Score! Hero: o herói
   * (pés e bola) no terço de baixo e o travessão perto do alto da tela. O
   * ângulo até o herói é fixo (íngreme o bastante para desenhar); a distância
   * sai por bisseção para a separação vertical herói↔gol caber no quadro, e a
   * inclinação põe os dois nas alturas certas. Companheiros que não cabem
   * afastam a câmera. Retrato: mais íngreme e com mais abertura.
   */
  private computeAim(state: GameState, out: Pose) {
    const hero = state.actors.find((actor) => actor.id === state.heroId);
    const ball = state.ball.pos;
    // Âncora na BOLA (é nela que o traço começa), puxada um pouco para o herói,
    // que espera um passo atrás e ao lado, para ele caber embaixo do quadro.
    const pull = hero ? Math.min(0.3, 0.7 / Math.max(0.01, Math.hypot(hero.pos.x - ball.x, hero.pos.z - ball.z))) : 0;
    const hx = hero ? ball.x + (hero.pos.x - ball.x) * pull : ball.x;
    const hz = hero ? ball.z + (hero.pos.z - ball.z) * pull : ball.z;
    // Direção: o gol pesa mais, mas os companheiros à frente e do lado puxam o olhar (o grupo
    // fica no quadro). Quem está atrás da bola não entorta a câmera (as setas da
    // borda mostram onde ele está); bola no ar (cabeceio, voleio) é só o gol.
    const goalDir = new THREE.Vector3(GOAL.x - hx, 0, GOAL.z - hz).normalize();
    const aerial = !state.ball.owner && state.ball.pos.y > 0.5;
    const toGoal = goalDir.clone().multiplyScalar(this.portrait ? 5 : 3.5);
    const ahead: typeof state.actors = [];
    if (!aerial && !this.shootOnly) {
      for (const actor of state.actors) {
        if (actor.role !== "mate") continue;
        const dx = actor.pos.x - hx;
        const dz = actor.pos.z - hz;
        const length = Math.hypot(dx, dz);
        if (length <= 1 || length >= 32 || (dx * goalDir.x + dz * goalDir.z) / length <= -0.15) continue;
        ahead.push(actor);
        toGoal.add(this.probe.set(dx / length, 0, dz / length));
      }
    }
    toGoal.normalize();
    // No máximo ~20° fora da linha do gol: o gol nunca fica de lado na tela.
    const yawOff = Math.atan2(goalDir.x * toGoal.z - goalDir.z * toGoal.x, goalDir.x * toGoal.x + goalDir.z * toGoal.z);
    const maxYaw = THREE.MathUtils.degToRad(20);
    if (Math.abs(yawOff) > maxYaw) toGoal.copy(goalDir).applyAxisAngle(UP, -Math.sign(yawOff) * maxYaw);
    const distance = Math.max(3, (GOAL.x - hx) * toGoal.x + (GOAL.z - hz) * toGoal.z);
    const lateral = new THREE.Vector3(toGoal.z, 0, -toGoal.x);
    const portrait = this.portrait;
    // Hora do chute (ninguém à frente para receber, ou bola no ar): teleobjetiva.
    // A câmera recua e fecha, e o gol cresce na tela (no celular, o ângulo tinha
    // 10 px: mirar ali era sorte).
    const tight = aerial || ahead.length === 0;
    const fov = portrait ? (tight ? 50 : 60) : tight ? 36 : 46;
    const t = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    // Alturas na tela (NDC) do pé do herói e do travessão.
    // Celular deitado (tela baixa): a bola sobe um pouco, longe da dica no pé da tela.
    const heroY = portrait ? -0.52 : this.aspect > 1.9 ? -0.47 : -0.58;
    const goalY = portrait ? 0.6 : 0.64;
    const heroAngle = THREE.MathUtils.degToRad(portrait ? (tight ? 40 : 47) : tight ? 32 : 39);
    const rise = Math.tan(heroAngle);
    const need = Math.atan(-heroY * t) + Math.atan(goalY * t);
    const top = PITCH.goalHeight + 0.25;
    const separation = (back: number) => heroAngle - Math.atan2(back * rise - top, back + distance);
    let lo = 4.5;
    let hi = 40;
    if (separation(lo) <= need) hi = lo;
    else if (separation(hi) >= need) lo = hi;
    else {
      for (let step = 0; step < 24; step += 1) {
        const mid = (lo + hi) / 2;
        if (separation(mid) > need) lo = mid;
        else hi = mid;
      }
    }
    // Câmera um pouco para o lado oposto ao do herói: o raio até a bola passa
    // longe do corpo dele (a bola nunca fica escondida atrás das pernas).
    const heroSide = hero ? Math.sign((hero.pos.x - ball.x) * lateral.x + (hero.pos.z - ball.z) * lateral.z) || -1 : -1;
    let sideShift = -heroSide * 1.2;
    const interest: THREE.Vector3[] = [
      new THREE.Vector3(-PITCH.goalHalfWidth - 0.8, PITCH.goalHeight, PITCH.goalLineZ),
      new THREE.Vector3(PITCH.goalHalfWidth + 0.8, PITCH.goalHeight, PITCH.goalLineZ),
      new THREE.Vector3(-PITCH.goalHalfWidth - 0.8, 0, PITCH.goalLineZ),
      new THREE.Vector3(PITCH.goalHalfWidth + 0.8, 0, PITCH.goalLineZ),
    ];
    for (const actor of ahead) {
      interest.push(new THREE.Vector3(actor.pos.x, 0, actor.pos.z), new THREE.Vector3(actor.pos.x, 1.9, actor.pos.z));
    }
    const cam = this.fitCamera;
    cam.fov = fov;
    cam.aspect = this.aspect;
    cam.updateProjectionMatrix();
    const place = (back: number) => {
      const height = back * rise;
      cam.position.set(hx, 0, hz).addScaledVector(toGoal, -back).addScaledVector(lateral, sideShift);
      cam.position.y = height;
      // Inclinação que põe o pé do herói em `heroY`. A câmera deslocada para o
      // lado gira de volta para um ponto entre a bola e o gol: a bola não vai
      // para a beirada da tela (no celular em pé, o quadro é estreito).
      const pitch = heroAngle - Math.atan(-heroY * t);
      const ahead = Math.min(distance * 0.3, 7);
      const flat = this.probe.set(hx + toGoal.x * ahead - cam.position.x, 0, hz + toGoal.z * ahead - cam.position.z).normalize();
      const look = flat.multiplyScalar(Math.cos(pitch)).setY(-Math.sin(pitch));
      cam.up.set(0, 1, 0);
      cam.lookAt(cam.position.x + look.x * 10, cam.position.y + look.y * 10, cam.position.z + look.z * 10);
      cam.updateMatrixWorld(true);
    };
    // Afasta para caber os companheiros, até um teto (no celular em pé, quem
    // está muito aberto fica fora do quadro em vez de a câmera ir para o céu).
    let back = lo;
    // Celular deitado (tela baixa e larga) também afasta pouco: jogador e gol pequenos demais
    // para mirar; quem não cabe ganha a seta na borda.
    const limit = lo * (portrait ? 1.7 : this.aspect > 1.9 ? 1.4 : 2.1);
    const fit = () => {
      for (let step = 0; step < 30 && back < limit; step += 1) {
        place(back);
        let fits = true;
        for (const point of interest) {
          const p = this.probe.copy(point).project(cam);
          if (p.z > 1 || Math.abs(p.x) > 0.9 || p.y > 0.9) {
            fits = false;
            break;
          }
        }
        if (fits) break;
        back = Math.min(limit, back * 1.07);
      }
      place(back);
    };
    fit();
    // Bola livre: se o corpo do herói (pé → cabeça) ainda cobre a bola na tela
    // (câmera alta e longe, olhar puxado pelos companheiros), ela anda mais para
    // o lado até abrir espaço.
    if (hero) {
      const feet = new THREE.Vector3();
      const head = new THREE.Vector3();
      const orb = new THREE.Vector3();
      for (let step = 0; step < 8; step += 1) {
        feet.set(hero.pos.x, 0.1, hero.pos.z).project(cam);
        head.set(hero.pos.x, 1.8, hero.pos.z).project(cam);
        orb.set(ball.x, ball.y, ball.z).project(cam);
        const sx = (head.x - feet.x) * this.aspect;
        const sy = head.y - feet.y;
        const px = (orb.x - feet.x) * this.aspect;
        const py = orb.y - feet.y;
        const u = clamp((px * sx + py * sy) / (sx * sx + sy * sy || 1), 0, 1);
        const gap = Math.hypot(px - sx * u, py - sy * u);
        // Meia largura do boneco com os braços abertos da mira ≈ 28% da altura.
        if (gap > Math.hypot(sx, sy) * 0.28 + 0.05) break;
        sideShift -= heroSide * 0.55;
        place(back);
      }
      // Andar para o lado pode ter tirado alguém do quadro: afasta de novo se precisar.
      fit();
    }
    out.pos.copy(cam.position);
    cam.getWorldDirection(this.probe);
    out.target.copy(cam.position).addScaledVector(this.probe, back * 1.6 + distance * 0.5);
    out.fov = fov;
  }

  // ---------------------------------------------------------------- voo

  private computeFollow(state: GameState, dt: number, out: Pose, snap: boolean) {
    const ball = state.ball;
    const b = new THREE.Vector3(ball.pos.x, ball.pos.y, ball.pos.z);
    const flat = new THREE.Vector3(ball.vel.x, 0, ball.vel.z);
    const speed = flat.length();
    const toGoal = new THREE.Vector3(GOAL.x - b.x, 0, GOAL.z - b.z).normalize();
    const dir = speed > 2 ? flat.clone().normalize().lerp(toGoal, 0.4).normalize() : toGoal;
    const shot = state.plan?.shot ?? false;
    const portrait = this.portrait;
    const back = (portrait ? 11 : 9) + speed * 0.12;
    const height = (portrait ? 9.5 : 5.6) + ball.pos.y * 0.45 - (shot ? 1.2 : 0);
    const wantPos = new THREE.Vector3(b.x, 0, b.z).addScaledVector(dir, -back).addScaledVector(UP, height);
    // Antecipa: olha para onde a bola vai estar em ~0,3 s.
    const wantTarget = b.clone().addScaledVector(new THREE.Vector3(ball.vel.x, ball.vel.y * 0.5, ball.vel.z), 0.3);
    if (shot) wantTarget.lerp(GOAL, 0.25);
    wantTarget.y = clamp(wantTarget.y, 0.3, 6);
    if (snap) {
      this.followPos.copy(wantPos);
      this.followTarget.copy(wantTarget);
    } else {
      dampVec(this.followPos, wantPos, 3.2, dt);
      dampVec(this.followTarget, wantTarget, 6.5, dt);
    }
    out.pos.copy(this.followPos);
    out.target.copy(this.followTarget);
    out.fov = portrait ? 62 : 50;
  }

  // ---------------------------------------------------------------- chute

  private computeShot(state: GameState, dt: number, out: Pose) {
    const ball = state.ball.pos;
    const target = state.plan?.target ?? { x: ball.x, y: 1, z: PITCH.goalLineZ };
    const portrait = this.portrait;
    if (this.shotVariant === 0) {
      // Atrás do gol, baixo, entre a rede e as placas: a bola vem na direção da
      // lente, o goleiro voa e a rede estufa na cara de quem assiste.
      out.pos.set(target.x * 0.3 + this.shotSide * 1.1, portrait ? 2.2 : 1.9, PITCH.goalLineZ + 5);
      out.fov = portrait ? 60 : 44;
    } else {
      // Bola alta: do alto, na linha do gol por fora da trave (lado oposto ao
      // canto) — a bola aparece contra o gramado e o goleiro voa pelo quadro.
      const outside = PITCH.goalHalfWidth + (portrait ? 5.5 : 4.5);
      out.pos.set(this.shotSide * outside, portrait ? 4.2 : 3.4, PITCH.goalLineZ + 0.8);
      out.fov = portrait ? 62 : 50;
    }
    // Da linha do gol, mirando só a bola o gol ficava fora do quadro no começo:
    // olha entre a bola e a boca do gol (mais para o gol enquanto a bola está longe).
    const look = this.probe.set(ball.x, Math.max(0.3, ball.y), ball.z);
    if (this.shotVariant !== 0) {
      const far = clamp01((PITCH.goalLineZ - ball.z) / 18) * 0.55;
      look.lerp(this.focusPoint.set(target.x * 0.5, 1.2, PITCH.goalLineZ), far);
    }
    dampVec(this.trackTarget, look, 9, dt);
    out.target.copy(this.trackTarget);
  }

  private computeGoalHold(state: GameState, dt: number, out: Pose, hit: Vec3) {
    // Fica no plano do chute e empurra devagar para a rede estufando.
    this.computeShot(state, dt, out);
    const push = smoother(this.shotT / 2.2) * 0.22;
    const focus = this.probe.set(hit.x, clamp(hit.y, 0.4, 2.2), hit.z);
    out.pos.lerp(focus, push);
    out.target.lerp(focus, smoother(this.shotT / 0.6));
    out.fov -= 6 * smoother(this.shotT / 2);
  }

  private computeOrbit(center: THREE.Vector3, radius: number, height: number, lookY: number, dt: number, out: Pose, rate: number) {
    dampVec(this.orbitCenter, center, 5, dt);
    this.orbitAngle += rate * dt;
    out.pos.set(
      this.orbitCenter.x + Math.sin(this.orbitAngle) * radius,
      height,
      this.orbitCenter.z + Math.cos(this.orbitAngle) * radius,
    );
    out.target.set(this.orbitCenter.x, lookY, this.orbitCenter.z);
  }

  /** Close de frente para um ator (de onde está a câmera agora, sem atravessar o campo). */
  private computeCloseUp(position: { x: number; z: number }, facing: number, dt: number, out: Pose, distance: number, height: number, lookY: number) {
    const front = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing));
    const side = new THREE.Vector3(front.z, 0, -front.x);
    const center = new THREE.Vector3(position.x, 0, position.z);
    const want = center.clone().addScaledVector(front, distance).addScaledVector(side, distance * 0.35);
    want.y = height;
    dampVec(this.followPos, want, 2.2, dt);
    dampVec(this.followTarget, center.setY(lookY), 4, dt);
    out.pos.copy(this.followPos);
    out.target.copy(this.followTarget);
  }

  // ---------------------------------------------------------------- replay

  private computeReplay(state: GameState, dt: number, out: Pose) {
    const ball = state.ball.pos;
    const angle = state.replay?.angle ?? 0;
    const b = this.probe.set(ball.x, Math.max(0.25, ball.y), ball.z);
    if (angle % 3 === 0) {
      // Câmera de TV: no alto da lateral, teleobjetiva acompanhando o lance.
      const want = new THREE.Vector3(this.replaySide * (PITCH.halfWidth + 16), 15, ball.z - 6);
      dampVec(this.followPos, want, 1.6, dt);
      dampVec(this.trackTarget, b, 5, dt);
      out.pos.copy(this.followPos);
      out.target.copy(this.trackTarget);
      out.fov = this.portrait ? 48 : 26;
    } else if (angle % 3 === 1) {
      // Atrás do gol, de frente para o chute (a rede estufa na lente), do lado
      // oposto ao canto: o goleiro mergulha para longe da lente, sem tapar a bola.
      const cross = state.plan?.shot ? state.plan.target.x : this.replayStart.x * 0.25;
      const away = cross > 0.3 ? -1 : cross < -0.3 ? 1 : this.replaySide;
      out.pos.set(cross * 0.15 + away * 2.3, 1.35, PITCH.goalLineZ + 4.4);
      dampVec(this.trackTarget, b, 7, dt);
      out.target.copy(this.trackTarget);
      out.fov = this.portrait ? 54 : 34;
    } else {
      // Colada na bola: sai do rosto do herói e persegue a bola por trás, rente.
      const hero = this.replayHero;
      const toGoal = new THREE.Vector3(GOAL.x - hero.x, 0, GOAL.z - hero.z).normalize();
      const side = new THREE.Vector3(toGoal.z, 0, -toGoal.x);
      const away = clamp01((Math.hypot(b.x - hero.x, b.z - hero.z) - 1) / 5);
      const close = new THREE.Vector3().copy(hero).addScaledVector(toGoal, 2.4).addScaledVector(side, this.replaySide * 1.8).setY(1.05);
      const vel = state.ball.vel;
      const flat = Math.hypot(vel.x, vel.z);
      const dir = flat > 1 ? new THREE.Vector3(vel.x / flat, 0, vel.z / flat) : toGoal;
      const chase = new THREE.Vector3(b.x, 0, b.z).addScaledVector(dir, -2.6).addScaledVector(side, this.replaySide * 0.7);
      chase.y = Math.max(0.7, b.y + 0.55);
      const want = close.lerp(chase, smoother(away));
      if (away <= 0) this.followPos.copy(want);
      else dampVec(this.followPos, want, 4.5, dt);
      out.pos.copy(this.followPos);
      const look = new THREE.Vector3(hero.x, 1.1, hero.z).lerp(b, smoother(away * 1.4));
      dampVec(this.trackTarget, look, 9, dt);
      out.target.copy(this.trackTarget);
      out.fov = this.portrait ? 60 : 44 + away * 10;
    }
  }

  // ---------------------------------------------------------------- quadro

  /**
   * `dt` real (a câmera nunca fica em câmera lenta: é o que dá o ar de cinema).
   * `hit` = ponto do último impacto na rede.
   */
  update(state: GameState, events: SimEvent[], dt: number, hit: Vec3) {
    this.time += dt;
    this.shotT += dt;
    this.cutRequested = false;
    const phase = state.phase;
    const actorById = (id: string | null) => (id ? state.actors.find((actor) => actor.id === id) ?? null : null);

    for (const event of events) {
      if (phase === "replay") continue;
      if (event.type === "goal") {
        this.scorerId = event.scorer;
        if (this.shot !== "shot") {
          // Gol sem o plano do chute (cabeceio de perto): entra direto na rede.
          this.shotVariant = 0;
          this.shotSide = state.ball.pos.x >= 0 ? 1 : -1;
          this.shotOrigin.set(state.ball.pos.x, 0, state.ball.pos.z - 10);
          this.trackTarget.set(state.ball.pos.x, state.ball.pos.y, state.ball.pos.z);
        }
        this.cut("goalHold", this.shot === "shot" ? 0.25 : 0.5);
        this.outcomeHandled = true;
      } else if (event.type === "save") {
        this.keeperId = event.actor;
        this.bump(0.25);
        const keeper = actorById(event.actor);
        if (keeper) {
          this.followPos.copy(this.actual.pos);
          this.followTarget.copy(this.actual.target);
        }
        this.cut("keeper", 0.45);
        this.outcomeHandled = true;
      } else if (event.type === "post") {
        this.bump(0.5);
      } else if (event.type === "intercept") {
        this.focusId = event.actor;
        this.followPos.copy(this.actual.pos);
        this.followTarget.copy(this.actual.target);
        this.cut("focus", 0.6);
        this.outcomeHandled = true;
      }
    }

    // Plano pela fase.
    if (phase === "intro") {
      if (this.shot !== "intro") {
        this.cut("intro", 0.001);
        this.aimKey = "";
      }
    } else if (phase === "aim") {
      // A chave é a BOLA (parada na mira), não o herói: ele gira em volta da bola
      // acompanhando o traço, e a câmera não pode mexer com o dedo na tela.
      const ballPos = state.ball.pos;
      const key = `${state.heroId}:${ballPos.x.toFixed(2)}:${ballPos.y.toFixed(2)}:${ballPos.z.toFixed(2)}:${this.aspect.toFixed(2)}:${state.attempt}`;
      if (key !== this.aimKey) {
        this.aimKey = key;
        this.computeAim(state, this.aimPose);
        this.aimSettled = false;
      }
      if (this.shot !== "aim") {
        // Da apresentação: termina o arco; do voo: muda de herói voando suave.
        this.cut("aim", this.shot === "intro" ? 0.55 : this.shot === "follow" ? 0.6 : 0.85);
      }
      this.outcomeHandled = false;
      this.scorerId = null;
    } else if (phase === "flight") {
      if (this.shot === "aim" || this.shot === "intro" || this.shot === "done" || this.shot === "replay") {
        this.computeFollow(state, dt, this.desired, true);
        this.cut("follow", 0.6);
      }
      if (this.shot === "follow" && state.plan?.shot) {
        // Bola chegando no gol: CORTE seco para o plano do chute junto com a
        // câmera lenta da simulação (~0,45 s de jogo antes da linha). Misturar
        // as duas poses passava a câmera rasante pela arquibancada.
        const ball = state.ball;
        const toLine = PITCH.goalLineZ - ball.pos.z;
        const eta = ball.vel.z > 1 ? toLine / ball.vel.z : 99;
        const lineX = ball.pos.x + ball.vel.x * Math.max(0, eta);
        if (toLine < 30 && eta < 0.48 && eta > -0.2 && Math.abs(lineX) < PITCH.goalHalfWidth + 4) {
          // Bola alta (cabeceio, ângulo): do alto na linha do gol, com o goleiro voando; rasteira: atrás do gol.
          this.shotVariant = state.plan.kind === "header" || state.plan.target.y >= 1.4 ? 1 : 0;
          const tx = state.plan.target.x;
          // Atrás do gol: do lado oposto ao canto (a bola entra cruzando o quadro).
          // Na boca do gol: também do lado oposto, a bola atravessa a boca e estufa a rede do outro lado.
          this.shotSide = tx >= 0 ? -1 : 1;
          this.trackTarget.set(ball.pos.x, Math.max(0.3, ball.pos.y), ball.pos.z);
          this.shotOrigin.set(ball.pos.x, 0, ball.pos.z);
          this.cut("shot", 0.001);
        }
      }
    } else if (phase === "outcome") {
      if (!this.outcomeHandled) {
        this.outcomeHandled = true;
        const result = state.outcome?.result;
        if (result === "goal") this.cut("goalHold", 0.4);
        else if (result === "saved") this.cut("keeper", 0.45);
      }
      if (this.shot === "goalHold" && this.shotT > 1.15 && state.timeScale > 0.6) {
        const scorer = actorById(this.scorerId ?? state.heroId);
        if ((state.outcome?.stars ?? 0) === 0) {
          // Gol anulado: nada de festa, close em quem fez (a cara de quem não acredita).
          this.followPos.copy(this.actual.pos);
          this.followTarget.copy(this.actual.target);
          this.cut("react", 0.9);
        } else {
          if (scorer) {
            this.orbitCenter.set(scorer.pos.x, 0, scorer.pos.z);
            // Corte seco para a FRENTE dele (a comemoração de costas não tem graça),
            // em três quartos; ele vira para o meio-campo para comemorar.
            const facing = Math.atan2(-scorer.pos.x * 0.3, 20 - scorer.pos.z);
            const lean = scorer.pos.x >= 0 ? 1 : -1;
            // Dos ângulos de frente, o primeiro sem ninguém entre a lente e ele (zagueiro tapando o close não).
            const options = [0.5 * lean, -0.5 * lean, 1.1 * lean, -1.1 * lean, 0];
            const clear = (angle: number) => {
              const cx = scorer.pos.x + Math.sin(angle) * 6.5;
              const cz = scorer.pos.z + Math.cos(angle) * 6.5;
              return state.actors.every((other) => {
                if (other.id === scorer.id) return true;
                const vx = scorer.pos.x - cx;
                const vz = scorer.pos.z - cz;
                const k = clamp01(((other.pos.x - cx) * vx + (other.pos.z - cz) * vz) / (vx * vx + vz * vz));
                return k > 0.85 || Math.hypot(cx + vx * k - other.pos.x, cz + vz * k - other.pos.z) > 0.9;
              });
            };
            this.orbitAngle = facing + (options.find((offset) => clear(facing + offset)) ?? options[0]);
          }
          this.cut("celebrate", 0.001);
        }
      }
      if (this.shot === "keeper" && this.shotT > 2.2) {
        this.followPos.copy(this.actual.pos);
        this.followTarget.copy(this.actual.target);
        this.cut("react", 0.9);
      }
      if ((this.shot === "follow" || this.shot === "shot" || this.shot === "focus") && this.shotT > (this.shot === "focus" ? 2 : 0.9)) {
        this.followPos.copy(this.actual.pos);
        this.followTarget.copy(this.actual.target);
        this.cut("react", 0.9);
      }
    } else if (phase === "replay") {
      const angle = state.replay?.angle ?? 0;
      if (this.shot !== "replay" || angle !== this.replayAngle) {
        this.replayAngle = angle;
        this.replaySide = (state.attempt + angle) % 2 === 0 ? 1 : -1;
        const hero = actorById(state.heroId);
        this.replayHero.set(hero?.pos.x ?? state.ball.pos.x, 0, hero?.pos.z ?? state.ball.pos.z);
        this.replayStart.set(state.ball.pos.x, 0, state.ball.pos.z);
        this.trackTarget.set(state.ball.pos.x, state.ball.pos.y, state.ball.pos.z);
        this.followPos.set(this.replaySide * (PITCH.halfWidth + 16), 15, state.ball.pos.z - 6);
        if (angle % 3 === 2) this.followPos.set(this.replayHero.x, 1.05, this.replayHero.z);
        this.cut("replay", 0.001);
        this.cutRequested = true;
      }
    } else if (phase === "done") {
      if (this.shot !== "done" && this.shot !== "celebrate") {
        this.orbitCenter.set(0, 0, PITCH.goalLineZ - 12);
        this.orbitAngle = Math.atan2(this.actual.pos.x, this.actual.pos.z - (PITCH.goalLineZ - 12));
        this.cut("done", 1.2);
      }
    }

    // Pose desejada do plano atual.
    const d = this.desired;
    switch (this.shot) {
      case "intro": {
        const hero = actorById(state.heroId);
        if (!this.aimKey) {
          this.computeAim(state, this.aimPose);
          this.aimKey = "intro";
        }
        const hx = hero?.pos.x ?? 0;
        const hz = hero?.pos.z ?? 30;
        const side = hx >= 0 ? -1 : 1;
        const k = smoother(this.shotT / INTRO_SWEEP);
        // Da arquibancada atrás do gol, desce rasante pela lateral até a mira.
        const p0 = new THREE.Vector3(side * 16, 24, PITCH.goalLineZ + 22);
        const p1 = new THREE.Vector3(side * 22, 6, (hz + PITCH.goalLineZ) * 0.5);
        const p2 = this.aimPose.pos;
        const a = p0.clone().lerp(p1, k);
        const b = p1.clone().lerp(p2, k);
        d.pos.copy(a.lerp(b, k));
        const t0 = new THREE.Vector3(hx * 0.5, 0.5, (hz + PITCH.goalLineZ) * 0.5);
        const t1 = new THREE.Vector3(hx, 1.2, hz);
        const ta = t0.clone().lerp(t1, k);
        const tb = t1.clone().lerp(this.aimPose.target, k);
        d.target.copy(ta.lerp(tb, k));
        d.fov = mix(40, this.aimPose.fov, k);
        break;
      }
      case "aim":
        copyPose(d, this.aimPose);
        break;
      case "follow":
        this.computeFollow(state, dt, d, false);
        break;
      case "shot":
        this.computeShot(state, dt, d);
        break;
      case "goalHold":
        this.computeGoalHold(state, dt, d, hit);
        break;
      case "celebrate": {
        const scorer = actorById(this.scorerId ?? state.heroId);
        // Centro com antecipação (ele está correndo): o artilheiro fica no meio do quadro.
        const center = scorer ? new THREE.Vector3(scorer.pos.x + scorer.vel.x * 0.35, 0, scorer.pos.z + scorer.vel.z * 0.35) : this.orbitCenter.clone();
        const push = smoother(this.shotT / 4);
        this.computeOrbit(center, mix(6.5, 4.2, push), mix(2.2, 1.55, push), 1.05, dt, d, this.reducedMotion ? 0.12 : 0.32);
        if (scorer) d.target.set(scorer.pos.x, 1.05, scorer.pos.z);
        d.fov = this.portrait ? 56 : 38;
        break;
      }
      case "keeper": {
        const keeper = actorById(this.keeperId) ?? state.actors.find((actor) => actor.role === "keeper") ?? null;
        if (keeper) {
          const center = this.focusOf?.(keeper.id, this.focusPoint) ?? null;
          const spot = center ? { x: center.x, z: center.z } : keeper.pos;
          this.computeCloseUp(spot, keeper.facing, dt, d, 4.4, 1.25, center ? center.y : 0.85);
        }
        d.fov = this.portrait ? 58 : 38;
        break;
      }
      case "react": {
        const hero = actorById(state.heroId);
        if (hero) this.computeCloseUp(hero.pos, hero.facing, dt, d, 4.2, 1.6, 1.25);
        d.fov = this.portrait ? 54 : 36;
        break;
      }
      case "focus": {
        const actor = actorById(this.focusId);
        if (actor) this.computeCloseUp(actor.pos, actor.facing, dt, d, 6, 2.4, 1);
        d.fov = this.portrait ? 58 : 42;
        break;
      }
      case "replay":
        this.computeReplay(state, dt, d);
        break;
      case "done": {
        this.computeOrbit(new THREE.Vector3(0, 0, PITCH.goalLineZ - 12), 24, 9, 1.5, dt, d, this.reducedMotion ? 0.03 : 0.07);
        d.fov = this.portrait ? 62 : 48;
        break;
      }
    }

    // Mistura com a pose de onde a câmera veio (que segue no embalo, freando).
    if (this.blendT < this.blendDur) {
      this.from.pos.addScaledVector(this.fromVelPos, dt);
      this.from.target.addScaledVector(this.fromVelTarget, dt);
      const brake = Math.exp(-3 * dt);
      this.fromVelPos.multiplyScalar(brake);
      this.fromVelTarget.multiplyScalar(brake);
    }
    this.blendT = Math.min(this.blendDur, this.blendT + dt);
    const k = smoother(this.blendT / this.blendDur);
    const a = this.actual;
    a.pos.lerpVectors(this.from.pos, d.pos, k);
    a.target.lerpVectors(this.from.target, d.target, k);
    a.fov = mix(this.from.fov, d.fov, k);
    if (this.shot === "aim" && k >= 1) this.aimSettled = true;
    // Velocidade da câmera (suavizada) para o embalo da próxima troca.
    if (this.hasLast && dt > 1e-4) {
      const w = 1 - Math.exp(-dt * 12);
      this.velPos.lerp(this.probe.subVectors(a.pos, this.lastPos).divideScalar(dt), w);
      this.velTarget.lerp(this.probe.subVectors(a.target, this.lastTarget).divideScalar(dt), w);
    }
    if (this.velPos.length() > 40) this.velPos.setLength(40);
    if (this.velTarget.length() > 60) this.velTarget.setLength(60);
    this.lastPos.copy(a.pos);
    this.lastTarget.copy(a.target);
    this.hasLast = true;

    // Câmera na mão (nunca na mira: o traço precisa da tela parada) e o tranco.
    const camera = this.camera;
    camera.position.copy(a.pos);
    if (camera.position.y < 0.25) camera.position.y = 0.25;
    let hand = 0;
    if (!this.reducedMotion) {
      hand = this.shot === "aim" || this.shot === "intro" ? 0 : this.shot === "follow" ? 0.03 : this.shot === "replay" ? 0.02 : 0.05;
      hand *= this.shot === "aim" ? 0 : 1;
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const shake = this.shake * this.shake;
    const t = this.time;
    camera.position.x += (wobble(t * 0.8, 1) * hand + wobble(t * 9, 4) * shake * 0.12);
    camera.position.y += (wobble(t * 0.7, 2) * hand * 0.6 + wobble(t * 11, 5) * shake * 0.1);
    camera.position.z += wobble(t * 0.6, 3) * hand;
    camera.up.set(0, 1, 0);
    camera.lookAt(a.target);
    const roll = wobble(t * 0.5, 7) * hand * 0.06 + wobble(t * 13, 6) * shake * 0.01;
    if (roll !== 0) camera.rotateZ(roll);
    this.punchAmt = Math.max(0, this.punchAmt - dt * 1.5);
    const fov = a.fov - this.punchAmt * this.punchAmt * 7;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }

}
