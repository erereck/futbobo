// Efeitos das comemorações de assinatura (Kamehameha, Super Saiyajin,
// meditação, "não tô ouvindo" e pistoleiro). Quem manda no tempo é o boneco:
// a ação solta marcas (`cues`, lidas no takeCues) e daqui sai o resto — esfera
// de energia, raio, aura, brilhos, som — pelos pedidos por quadro dos efeitos.
//
// Só desenho e som: não lê nem escreve o motor. Nenhuma luz nova: o tremor e o
// brilho da cena voltam no update para a visão aplicar (com Math.max).

import * as THREE from "three";
import { FIELD } from "../engine";
import { playSignatureSound } from "../signature-audio";
import type { BotaoSide } from "../types";
import { FIGURE_HEIGHT, KAME, type PlayerFigure } from "./character";
import type { Effects } from "./effects";
import type { Stadium } from "./stadium";

export type CelebrationFxContext = {
  /** `Choreographer.kind` (ou a comemoração do palco); null desliga tudo. */
  kind: string | null;
  /** Quem comemora: o boneco, a posição dele (pés) e para onde olha. */
  focus: { figure: PlayerFigure; x: number; z: number; yaw: number } | null;
  /** Time que comemora: a torcida dele grita no "não tô ouvindo". */
  side: BotaoSide | null;
  teamColor: string;
  stadium: Pick<Stadium, "crowdReact"> | null;
  /** Largura ÷ altura da tela (padrão 16/9): em pé o raio encurta para a ponta caber. */
  aspect?: number;
};

/** O que a visão soma à cena neste quadro (com Math.max): tremor da câmera e brilho do céu. */
export type CelebrationFxResult = { shake: number; glow: number; glowColor: string | null };

export type CelebrationFxOptions = {
  /** Modo desempenho: sem os brilhos lentos da meditação e com menos impactos. */
  lite: boolean;
  /** Sem tremor, raio pela metade, aura sem faíscas. */
  reducedMotion: boolean;
  /** Palco do criador: sem som, raio mais curto e quase reto (não há gramado em volta). */
  stage?: boolean;
};

const KAME_COLOR = "#8fd8ff";
const SSJ_COLOR = "#ffd84a";
/** O brilho da cabeça puxa para o laranja: em cima do gramado verde o dourado puro vira limão. */
const SSJ_HAIR = "#ffb52e";
const ZEN_COLOR = "#cfe8ff";
const BANG_COLOR = "#ffe08a";
/** O raio cresce até o comprimento todo nisto (s). */
const BEAM_GROW = 0.12;
/** Do fim do raio ao fim do apagar (s): o mesmo que a ação. */
const BEAM_FADE = KAME.FADE_END - KAME.BEAM_END;
const BEAM_WIDTH = 7;
const BEAM_LENGTH = 110;
const BEAM_LENGTH_PORTRAIT = 80;
const BEAM_LENGTH_STAGE = 52;
/** A ponta desce até esta altura: encosta no gramado e explode lá. */
const BEAM_END_Y = 3;
/** Intervalo entre os impactos na ponta enquanto o raio segura. */
const TIP_GAP = 0.3;
/** Até onde a ponta vai: no avental, na frente das arquibancadas (as laterais começam em +46, os fundos em +62). */
const BEAM_BOUND_X = FIELD.width / 2 + 38;
const BEAM_BOUND_Z = FIELD.height / 2 + 55;

/**
 * Quanto o raio anda de (x, z) na direção (dirX, dirZ) até a ponta encostar no
 * limite do avental (Infinity se não encosta). O corredor do raio na coreografia usa a mesma conta.
 */
export function beamRoom(x: number, z: number, dirX: number, dirZ: number) {
  let room = Infinity;
  if (Math.abs(dirX) > 1e-6) room = Math.min(room, (BEAM_BOUND_X - Math.sign(dirX) * x) / Math.abs(dirX));
  if (Math.abs(dirZ) > 1e-6) room = Math.min(room, (BEAM_BOUND_Z - Math.sign(dirZ) * z) / Math.abs(dirZ));
  return room;
}

const clamp01 = (value: number) => (!(value > 0) ? 0 : value > 1 ? 1 : value);
const smooth = (value: number) => {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
};

export class CelebrationFx {
  private readonly result: CelebrationFxResult = { shake: 0, glow: 0, glowColor: null };
  private kind: string | null = null;
  private figure: PlayerFigure | null = null;
  // Segundos desde cada marca (-1 = ainda não veio).
  private charge = -1;
  private fire = -1;
  private end = -1;
  private ssjStart = -1;
  private ssjBurst = -1;
  private zen = -1;
  private bangs = 0;
  private nextTip = BEAM_GROW;
  private sparkleIn = 0;
  private beamVisible = false;
  private readonly tip = new THREE.Vector3();
  private readonly handL = new THREE.Vector3();
  private readonly handR = new THREE.Vector3();
  private readonly mid = new THREE.Vector3();
  private readonly forward = new THREE.Vector3(0, 0, 1);
  private readonly dir = new THREE.Vector3();
  private readonly hand = new THREE.Vector3();
  private readonly head = new THREE.Vector3();

  constructor(private readonly effects: Effects, private readonly options: CelebrationFxOptions) {}

  /** Antes da partida: zera tudo (os programas dos efeitos já vão no prepare deles). */
  prepare() {
    this.reset();
  }

  /** A festa acabou: nada mais é pedido (raio e esfera somem no próximo update dos efeitos). */
  stop() {
    this.reset();
    this.kind = null;
    this.figure = null;
  }

  dispose() {
    this.stop();
  }

  /** Ponta do raio no mundo enquanto ele aparece (null fora disso). Só leitura. */
  beamEnd(): { x: number; y: number; z: number } | null {
    return this.beamVisible ? this.tip : null;
  }

  /** Chame depois de atualizar o boneco do foco e antes do `effects.update` do quadro. dt já em tempo de cena. */
  update(dt: number, ctx: CelebrationFxContext): CelebrationFxResult {
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    const out = this.result;
    out.shake = 0;
    out.glow = 0;
    out.glowColor = null;
    const figure = ctx.kind && ctx.focus ? ctx.focus.figure : null;
    if (ctx.kind !== this.kind || figure !== this.figure) {
      this.reset();
      this.kind = ctx.kind;
      this.figure = figure;
      // Marcas velhas (de uma festa anterior que ninguém leu até o fim) não disparam nada nesta.
      figure?.takeCues();
    }
    this.beamVisible = false;
    if (!figure || !ctx.focus) return out;
    // Os relógios andam antes das marcas novas: a marca deste quadro começa em 0.
    if (this.charge >= 0) this.charge += step;
    if (this.fire >= 0) this.fire += step;
    if (this.end >= 0) this.end += step;
    if (this.ssjStart >= 0) this.ssjStart += step;
    if (this.ssjBurst >= 0) this.ssjBurst += step;
    if (this.zen >= 0) this.zen += step;
    const cues = figure.takeCues();
    for (let index = 0; index < cues.length; index += 1) this.onCue(cues[index], ctx, out);
    this.kamehameha(ctx, out);
    this.superSaiyan(ctx, out);
    this.meditate(ctx, step);
    if (this.options.reducedMotion) out.shake = 0;
    return out;
  }

  private reset() {
    this.charge = this.fire = this.end = -1;
    this.ssjStart = this.ssjBurst = -1;
    this.zen = -1;
    this.bangs = 0;
    this.nextTip = BEAM_GROW;
    this.sparkleIn = 0;
    this.beamVisible = false;
  }

  private sound(name: Parameters<typeof playSignatureSound>[0], intensity: number) {
    if (!this.options.stage) playSignatureSound(name, intensity);
  }

  private onCue(cue: string, ctx: CelebrationFxContext, out: CelebrationFxResult) {
    const focus = ctx.focus!;
    switch (cue) {
      case "kame-charge":
        this.charge = 0;
        this.fire = this.end = -1;
        this.sound("kameCharge", 0.6);
        break;
      case "kame-fire": {
        this.fire = 0;
        this.end = -1;
        this.nextTip = BEAM_GROW;
        this.locate(focus);
        const fwd = this.forward;
        // O tranco: onda no gramado, poeira atrás dos pés (no palco não há grama), câmera e céu acendendo.
        this.effects.shockwave(focus.x, focus.z, KAME_COLOR, 50);
        if (!this.options.stage) this.effects.kickPuff(focus.x - fwd.x * 6, focus.z - fwd.z * 6, 0.9, -fwd.x, -fwd.z);
        this.sound("kameBeam", 0.8);
        out.shake = Math.max(out.shake, 0.6);
        out.glow = 1;
        out.glowColor = KAME_COLOR;
        break;
      }
      case "kame-end":
        if (this.fire >= 0) this.end = 0;
        break;
      case "ssj-start":
        this.ssjStart = 0;
        this.ssjBurst = -1;
        break;
      case "ssj-burst":
        this.ssjBurst = 0;
        if (this.ssjStart < 0) this.ssjStart = 0.6;
        this.effects.shockwave(focus.x, focus.z, SSJ_COLOR, 45);
        if (!this.options.stage) this.effects.kickPuff(focus.x, focus.z, 1);
        this.effects.impact(focus.x, FIGURE_HEIGHT * 0.6, focus.z, 0.8, "#fff2a0");
        this.sound("aura", 0.7);
        out.shake = Math.max(out.shake, 0.35);
        out.glow = Math.max(out.glow, 0.8);
        out.glowColor = SSJ_COLOR;
        break;
      case "zen":
        this.zen = 0;
        this.sparkleIn = 0;
        break;
      case "ear":
        if (ctx.side) ctx.stadium?.crowdReact("cheer", ctx.side, null);
        break;
      case "bang":
        this.bang(focus);
        break;
    }
  }

  /** Palmas (meio delas) e frente do boneco no mundo, do quadro atual da pose. */
  private locate(focus: NonNullable<CelebrationFxContext["focus"]>) {
    const figure = focus.figure;
    // getWorldPosition sobe a cadeia inteira (cotovelo → raiz): a matriz da raiz fica em dia junto.
    figure.handAnchor("left").getWorldPosition(this.handL);
    figure.handAnchor("right").getWorldPosition(this.handR);
    this.mid.addVectors(this.handL, this.handR).multiplyScalar(0.5);
    const e = figure.root.matrixWorld.elements;
    this.forward.set(e[8], 0, e[10]);
    if (this.forward.lengthSq() < 1e-8) this.forward.set(Math.sin(focus.yaw), 0, Math.cos(focus.yaw));
    this.forward.normalize();
  }

  private beamLength(ctx: CelebrationFxContext) {
    if (this.options.stage) return BEAM_LENGTH_STAGE;
    const aspect = ctx.aspect ?? 16 / 9;
    return aspect < 0.8 ? BEAM_LENGTH_PORTRAIT : BEAM_LENGTH;
  }

  private kamehameha(ctx: CelebrationFxContext, out: CelebrationFxResult) {
    if (this.charge < 0 && this.fire < 0) return;
    const focus = ctx.focus!;
    this.locate(focus);
    const mid = this.mid;
    const reduced = this.options.reducedMotion;
    if (this.fire < 0) {
      // A esfera cresce entre as palmas e a energia vem espiralando para ela.
      if (this.charge > 2) {
        // A ação foi cortada antes do disparo.
        this.charge = -1;
        return;
      }
      const grow = smooth(this.charge / (KAME.FIRE - KAME.CHARGE));
      const crackle = reduced ? 1 : 1 + 0.1 * Math.sin(this.charge * 53);
      this.effects.orb(mid.x, mid.y, mid.z, (4 + 5 * grow) * crackle, KAME_COLOR, 0.55 + 0.75 * grow);
      this.effects.converge(mid.x, mid.y, mid.z, 16 + 8 * grow, KAME_COLOR, 20);
      out.shake = Math.max(out.shake, 0.08 + 0.12 * grow);
      out.glow = Math.max(out.glow, 0.3 * grow);
      out.glowColor = KAME_COLOR;
      return;
    }
    const t = this.fire;
    const fade = this.end >= 0 ? clamp01(1 - this.end / BEAM_FADE) : 1;
    // Sem a marca do fim (show cortado), apaga sozinho um pouco depois do tempo dela.
    if (fade <= 0 || t > KAME.FADE_END - KAME.FIRE + 0.5) {
      this.charge = this.fire = this.end = -1;
      return;
    }
    let full = this.beamLength(ctx);
    // Sai das mãos, para onde ele olha, descendo até encostar no chão no fim.
    const endY = this.options.stage ? mid.y - 6 : BEAM_END_Y;
    const dir = this.dir.set(this.forward.x * full, endY - mid.y, this.forward.z * full).normalize();
    // Perto da lateral (ou do fundo) o raio inteiro entraria na arquibancada: encurta e a
    // ponta desce mais cedo, encostando no avental (a descida mais íngreme só o deixa mais para dentro).
    const room = this.options.stage ? full : Math.max(30, beamRoom(mid.x + dir.x * 1.5, mid.z + dir.z * 1.5, dir.x, dir.z));
    if (room < full) {
      full = room;
      dir.set(this.forward.x * full, endY - mid.y, this.forward.z * full).normalize();
    }
    const flick = reduced ? 1 : 1 + 0.12 * Math.sin(t * 61) + 0.06 * Math.sin(t * 23);
    const startX = mid.x + dir.x * 1.5;
    const startY = mid.y + dir.y * 1.5;
    const startZ = mid.z + dir.z * 1.5;
    const reach = Math.min(1, t / BEAM_GROW);
    const length = full * (1 - (1 - reach) * (1 - reach));
    this.effects.beam(startX, startY, startZ, dir.x, dir.y, dir.z, length, BEAM_WIDTH * (0.6 + 0.4 * fade), KAME_COLOR, (reduced ? 0.5 : 1) * fade * flick);
    this.tip.set(startX + dir.x * length, startY + dir.y * length, startZ + dir.z * length);
    this.beamVisible = true;
    // A esfera continua nas mãos (boca do raio) e uma cabeça de energia vai na ponta.
    this.effects.orb(mid.x + dir.x * 2, mid.y + dir.y * 2, mid.z + dir.z * 2, 10 * (0.7 + 0.3 * fade) * flick, KAME_COLOR, 1.4 * fade);
    if (reach >= 1) this.effects.orb(this.tip.x, this.tip.y, this.tip.z, 12 * fade * flick, KAME_COLOR, 1.2 * fade);
    // Chegou na ponta: explosão; enquanto segura, estouros menores.
    while (t >= this.nextTip && fade > 0.4) {
      const first = this.nextTip <= BEAM_GROW + 1e-6;
      if (first || !this.options.lite || Math.round(this.nextTip / TIP_GAP) % 2 === 0) {
        this.effects.impact(this.tip.x, this.tip.y, this.tip.z, first ? 1 : 0.45, KAME_COLOR);
      }
      if (first && !this.options.stage) this.effects.shockwave(this.tip.x, this.tip.z, KAME_COLOR, 40);
      this.nextTip += TIP_GAP;
    }
    out.shake = Math.max(out.shake, 0.32 * fade);
    out.glow = Math.max(out.glow, 0.55 * fade);
    out.glowColor = KAME_COLOR;
  }

  private superSaiyan(ctx: CelebrationFxContext, out: CelebrationFxResult) {
    if (this.ssjStart < 0) return;
    const focus = ctx.focus!;
    const ramp = smooth(this.ssjStart / 0.6);
    const pulse = this.ssjBurst >= 0 ? Math.exp(-this.ssjBurst * 3) : 0;
    const strength = this.ssjBurst >= 0 ? 0.85 + 0.15 * pulse : 0.4 + 0.42 * ramp;
    this.effects.aura(focus.x, focus.z, FIGURE_HEIGHT * 1.15, SSJ_COLOR, strength);
    // A cabeça acende dourada (o "cabelo de Super Saiyajin"), mais forte depois da explosão.
    focus.figure.headAnchor().getWorldPosition(this.head);
    const headGlow = this.ssjBurst >= 0 ? 0.55 + 0.3 * pulse : 0.2 + 0.25 * ramp;
    this.effects.orb(this.head.x, this.head.y + 4.5, this.head.z, 6.5, SSJ_HAIR, headGlow);
    // Gritando, o chão treme; depois da explosão fica o brilho dourado.
    if (this.ssjBurst < 0) out.shake = Math.max(out.shake, 0.08 + 0.14 * ramp);
    out.glow = Math.max(out.glow, 0.22 * ramp + 0.6 * pulse);
    out.glowColor = SSJ_COLOR;
  }

  private meditate(ctx: CelebrationFxContext, step: number) {
    if (this.zen < 0) return;
    const focus = ctx.focus!;
    // Luz fria e macia por baixo de quem flutua, e brilhos lentos em volta.
    this.effects.orb(focus.x, 4, focus.z, 10, ZEN_COLOR, 0.35 * smooth(this.zen / 0.6));
    if (this.options.lite || this.options.reducedMotion) return;
    this.sparkleIn -= step;
    if (this.sparkleIn <= 0) {
      this.sparkleIn = 0.5;
      this.effects.sparkle(focus.x, FIGURE_HEIGHT * 0.55, focus.z, ZEN_COLOR, 6);
    }
  }

  /** Um tiro: a mão boa primeiro, a outra no segundo. */
  private bang(focus: NonNullable<CelebrationFxContext["focus"]>) {
    const figure = focus.figure;
    const main = figure.handedness > 0 ? "right" : "left";
    const hand = this.bangs % 2 === 0 ? main : main === "right" ? "left" : "right";
    this.bangs += 1;
    this.locate(focus);
    // O "cano" é a ponta do dedo, um pouco à frente da palma.
    figure.handAnchor(hand).getWorldPosition(this.hand).addScaledVector(this.forward, 3);
    this.effects.impact(this.hand.x, this.hand.y, this.hand.z, 0.25, BANG_COLOR);
    this.sound("bang", 0.4);
  }
}
