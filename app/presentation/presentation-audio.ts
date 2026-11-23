// Som da apresentação, todo sintetizado no WebAudio (nenhum arquivo): o
// burburinho da sala, um clique de obturador para cada flash do roteiro, o
// "uau" e as palmas quando a camisa sobe e um acorde de hino no "Bem-vindo".
//
// Como a imagem, o som é função do relógio: `update(tempo)` a cada quadro, e
// cada deixa entra quando o tempo cruza o instante dela. Num salto (Pular,
// Rever) o que toca para e só o que é longo volta, já no ponto certo.

import { MARKS, PHOTOGRAPHERS, flashClock, type PresentationTimeline } from "./presentation-script";

type Voice = { stop: (fade: number) => void; end: number };
type Cue = { at: number; length: number; sustained: boolean; play: (offset: number) => Voice | null };

// ------------------------------------------------------------ contexto

let sharedContext: AudioContext | null = null;
let liveInstances = 0;

function presentationContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedContext && sharedContext.state !== "closed") return sharedContext;
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    sharedContext = new Ctor();
  } catch {
    sharedContext = null;
  }
  return sharedContext;
}

/** Dentro de um clique: Safari e Chrome só liberam o som num gesto. */
export function primePresentationAudio() {
  const audio = presentationContext();
  if (audio && audio.state === "suspended") void audio.resume().catch(() => undefined);
}

/** A mesma chave do botão "Som" da partida e da gala: quem joga sem som assiste sem som. */
const MUTE_KEY = "futbobo_player_match_muted";

export function readPresentationMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberPresentationMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Preferência opcional: sem storage vale só agora.
  }
}

// ------------------------------------------------------------- buffers

const RATE = 22050;

function seededRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const onePole = (cutoff: number) => 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);

/** Ruído em banda com decaimento: palma e obturador. */
function grain(random: () => number, seconds: number, high: number, low: number, decay: number) {
  const out = new Float32Array(Math.ceil(seconds * RATE));
  const kHigh = onePole(high);
  const kLow = onePole(low);
  const fall = Math.exp(-1 / (decay * RATE));
  let a = 0;
  let b = 0;
  let level = 1;
  let max = 0;
  for (let index = 0; index < out.length; index += 1) {
    a += kHigh * (random() * 2 - 1 - a);
    b += kLow * (a - b);
    out[index] = (a - b) * level * Math.min(1, index / 6);
    level *= fall;
    max = Math.max(max, Math.abs(out[index]));
  }
  if (max > 0) for (let index = 0; index < out.length; index += 1) out[index] /= max;
  return out;
}

function stereo(context: BaseAudioContext, left: Float32Array<ArrayBuffer>, right: Float32Array<ArrayBuffer>, peak = 0.9) {
  let max = 0;
  for (let index = 0; index < left.length; index += 1) max = Math.max(max, Math.abs(left[index]), Math.abs(right[index]));
  const gain = max > 0 ? peak / max : 1;
  for (let index = 0; index < left.length; index += 1) {
    left[index] *= gain;
    right[index] *= gain;
  }
  const buffer = context.createBuffer(2, left.length, RATE);
  buffer.copyToChannel(left, 0);
  buffer.copyToChannel(right, 1);
  return buffer;
}

/** Obturador de câmera profissional: o "tchc" do espelho e o fecho, colados. */
function renderShutter(context: BaseAudioContext, seed: number) {
  const random = seededRandom(seed);
  const length = Math.ceil(0.09 * RATE);
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const open = grain(random, 0.02, 7200, 1300, 0.0028);
  const close = grain(random, 0.025, 5200, 900, 0.004);
  const at = Math.floor(0.048 * RATE);
  for (let index = 0; index < open.length; index += 1) left[index] += open[index];
  for (let index = 0; index < close.length && at + index < length; index += 1) left[at + index] += close[index] * 0.75;
  right.set(left);
  return stereo(context, left, right, 0.8);
}

/** Plateia de imprensa e convidados batendo palmas, cada um no seu ritmo. */
function renderApplause(context: BaseAudioContext, seconds: number, clappers: number, seed: number) {
  const frames = Math.ceil(seconds * RATE);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const random = seededRandom(seed);
  const claps = Array.from({ length: 10 }, () => grain(random, 0.024, 2200 + random() * 2600, 380 + random() * 520, 0.0035 + random() * 0.0045));
  for (let clapper = 0; clapper < clappers; clapper += 1) {
    const pan = random();
    const gl = Math.cos(pan * Math.PI * 0.5);
    const gr = Math.sin(pan * Math.PI * 0.5);
    const amplitude = 0.25 + random() * 0.75;
    const period = 1 / (4.4 * (0.8 + random() * 0.45));
    const stop = seconds - 1.6 * (0.1 + random() * 0.9);
    for (let time = random() * 0.3; time < stop; time += period * (0.86 + random() * 0.28)) {
      const clap = claps[Math.floor(random() * claps.length)];
      const start = Math.floor(time * RATE);
      const level = Math.min(1, time / 0.3) * amplitude * (0.8 + random() * 0.4);
      const end = Math.min(clap.length, frames - start);
      for (let index = 0; index < end; index += 1) {
        left[start + index] += clap[index] * level * gl;
        right[start + index] += clap[index] * level * gr;
      }
    }
  }
  return stereo(context, left, right);
}

function renderNoise(context: BaseAudioContext, seconds: number) {
  const frames = Math.ceil(seconds * context.sampleRate);
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const channel = buffer.getChannelData(0);
  const random = seededRandom(4111);
  for (let index = 0; index < frames; index += 1) channel[index] = random() * 2 - 1;
  return buffer;
}

// -------------------------------------------------------------- mixagem

/** Hino: Mi maior aberto (quinta e oitava no grave, terça no alto). */
const ANTHEM = [164.81, 246.94, 329.63, 415.3, 493.88, 659.25];

export class PresentationAudio {
  private readonly context: AudioContext | null;
  private readonly cues: Cue[] = [];
  private readonly voices = new Set<Voice>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly builders = new Map<string, () => AudioBuffer>();
  private output: GainNode | null = null;
  private mix: GainNode | null = null;
  private room: { gain: GainNode; source: AudioBufferSourceNode; level: number } | null = null;
  private lastTime = -1;
  private lastClick = -1;
  private muted: boolean;
  private disposed = false;
  private warmTimer = 0;
  private clickIndex = 0;

  constructor(private readonly timeline: PresentationTimeline, options: { muted: boolean }) {
    this.context = presentationContext();
    this.muted = options.muted;
    if (!this.context) return;
    liveInstances += 1;
    const context = this.context;
    const output = context.createGain();
    output.gain.value = this.muted ? 0 : 0.9;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.25;
    const mix = context.createGain();
    mix.gain.value = 0.85;
    mix.connect(compressor);
    compressor.connect(output);
    output.connect(context.destination);
    this.output = output;
    this.mix = mix;
    const seed = timeline.seed;
    this.builders.set("noise", () => renderNoise(context, 2.5));
    for (let index = 0; index < 4; index += 1) this.builders.set(`shutter${index}`, () => renderShutter(context, seed + 41 + index * 13));
    this.builders.set("applause", () => renderApplause(context, 6.5, 60, seed + 17));
    this.buildCues();
    this.warm();
  }

  /** `jumped`: o tempo saltou (Pular, Rever) em vez de correr. */
  update(time: number, jumped = false) {
    const context = this.context;
    if (!context || this.disposed) return;
    const previous = this.lastTime;
    this.lastTime = time;
    if (context.state !== "running") return;
    this.ensureRoom(context);
    this.updateRoom(context, time);
    for (const voice of this.voices) if (voice.end < context.currentTime) this.voices.delete(voice);
    if (jumped || previous < 0 || time < previous || time - previous > 0.5) {
      this.stopVoices(0.12);
      for (const cue of this.cues) {
        if (cue.sustained && time >= cue.at && time < cue.at + cue.length - 0.2) this.start(cue, time - cue.at);
      }
      this.lastClick = flashClock(time);
      return;
    }
    for (const cue of this.cues) {
      if (cue.at > previous && cue.at <= time) this.start(cue, time - cue.at);
    }
    this.clicks(time);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    const context = this.context;
    if (!context || !this.output) return;
    this.output.gain.setTargetAtTime(muted ? 0 : 0.9, context.currentTime, 0.04);
  }

  /** Aba escondida: o relógio para, e o som junto. */
  setPaused(paused: boolean) {
    const context = this.context;
    if (!context || this.disposed) return;
    if (paused && context.state === "running") void context.suspend().catch(() => undefined);
    if (!paused && context.state === "suspended") void context.resume().catch(() => undefined);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    window.clearTimeout(this.warmTimer);
    const context = this.context;
    if (!context) return;
    this.stopVoices(0.06);
    if (this.room) {
      this.room.gain.gain.setTargetAtTime(0, context.currentTime, 0.03);
      try {
        this.room.source.stop(context.currentTime + 0.2);
      } catch {
        // Já parado.
      }
    }
    const output = this.output;
    window.setTimeout(() => output?.disconnect(), 260);
    liveInstances = Math.max(0, liveInstances - 1);
    // Ninguém mais tocando: o contexto dorme e não gasta bateria.
    window.setTimeout(() => {
      if (liveInstances === 0 && context.state === "running") void context.suspend().catch(() => undefined);
    }, 400);
  }

  // ------------------------------------------------------------ roteiro

  private buildCues() {
    const duration = this.timeline.duration;
    const add = (at: number, length: number, sustained: boolean, play: (offset: number) => Voice | null) => this.cues.push({ at, length, sustained, play });
    // Abertura: um acorde baixo entra com a imagem.
    add(0.05, 4, false, () => this.chord(0.07, 3.6, 0.9, 1));
    // A camisa estendida e o corte para a foto.
    add(MARKS.offer, 0.7, false, () => this.whoosh(0.14, 0.6, -1));
    add(MARKS.cut - 0.12, 0.6, false, () => this.whoosh(0.22, 0.5, 1));
    // A camisa sobe: pancada, brilho, o "uau" da sala e as palmas.
    add(MARKS.storm, 3, false, () => this.group([this.boom(0.7), this.chord(0.12, 2.8, 0.05, 2)]));
    add(MARKS.storm + 0.1, 6.4, true, (offset) => this.playBuffer("applause", offset, 0.42));
    // Festa e "Bem-vindo": o acorde do hino abre por cima.
    add(MARKS.cheer, 3.5, true, (offset) => this.playBuffer("applause", offset + 1.2, 0.5));
    add(MARKS.title, 4, false, () => this.group([this.boom(0.55), this.chord(0.16, 3.6, 0.04, 2)]));
    add(duration + 0.2, 3, false, () => this.chord(0.08, 2.8, 0.3, 1));
  }

  /** Um clique por flash do roteiro (o mesmo instante que acende a luz). */
  private clicks(time: number) {
    const schedule = this.timeline.flashes;
    const now = flashClock(time);
    let from = this.lastClick;
    this.lastClick = now;
    if (from < 0) return;
    // O laço de fundo recomeçou: conta só a parte nova.
    if (now < from) from = now - 0.05;
    const all = schedule.all;
    let played = 0;
    for (let index = 0; index < all.length && played < 3; index += 1) {
      const at = all[index];
      if (at <= from) continue;
      if (at > now) break;
      const unit = schedule.unitOf[index];
      // Fotógrafos do set mais altos e espalhados; imprensa do fundo mais baixa e no meio.
      const near = unit < PHOTOGRAPHERS;
      const pan = near ? (unit < PHOTOGRAPHERS / 2 ? -0.6 : 0.6) + (this.clickIndex % 3) * 0.1 - 0.1 : ((this.clickIndex % 5) - 2) * 0.15;
      this.clickIndex += 1;
      this.shutter(near ? 0.32 : 0.12, pan);
      played += 1;
    }
  }

  // ----------------------------------------------------------- camadas

  private warm() {
    const pending = [...this.builders.keys()];
    const next = () => {
      if (this.disposed) return;
      const name = pending.shift();
      if (!name) return;
      this.buffer(name);
      this.warmTimer = window.setTimeout(next, 16);
    };
    this.warmTimer = window.setTimeout(next, 30);
  }

  private buffer(name: string) {
    const ready = this.buffers.get(name);
    if (ready) return ready;
    const build = this.builders.get(name);
    if (!build) return null;
    const created = build();
    this.buffers.set(name, created);
    return created;
  }

  /** Burburinho da sala (ruído filtrado em laço): sobe com a tempestade de flashes. */
  private ensureRoom(context: AudioContext) {
    if (this.room || !this.mix) return;
    const noise = this.buffer("noise");
    if (!noise) return;
    const source = context.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const band = context.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 460;
    band.Q.value = 0.6;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(band);
    band.connect(gain);
    gain.connect(this.mix);
    source.start();
    this.room = { gain, source, level: 0 };
  }

  private updateRoom(context: AudioContext, time: number) {
    if (!this.room) return;
    const level = time < MARKS.storm ? 0.08 : time < this.timeline.duration ? 0.13 : 0.06;
    if (Math.abs(level - this.room.level) < 0.002) return;
    this.room.level = level;
    this.room.gain.gain.setTargetAtTime(level, context.currentTime, 0.4);
  }

  // ------------------------------------------------------------- vozes

  private start(cue: Cue, offset: number) {
    try {
      const voice = cue.play(Math.max(0, offset));
      if (voice) this.voices.add(voice);
    } catch {
      // Um som que falha não pode derrubar a apresentação.
    }
  }

  private stopVoices(fade: number) {
    for (const voice of this.voices) voice.stop(fade);
    this.voices.clear();
  }

  private voice(sources: AudioScheduledSourceNode[], gain: GainNode, end: number): Voice {
    const context = this.context as AudioContext;
    return {
      end,
      stop: (fade) => {
        const now = context.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.setTargetAtTime(0, now, Math.max(0.01, fade / 3));
        for (const source of sources) {
          try {
            source.stop(now + fade + 0.05);
          } catch {
            // Já parado.
          }
        }
      },
    };
  }

  private group(voices: Array<Voice | null>): Voice | null {
    const list = voices.filter((voice): voice is Voice => voice !== null);
    if (!list.length) return null;
    return { end: Math.max(...list.map((voice) => voice.end)), stop: (fade) => list.forEach((voice) => voice.stop(fade)) };
  }

  private playBuffer(name: string, offset: number, level: number): Voice | null {
    const context = this.context;
    const buffer = this.buffer(name);
    if (!context || !buffer || !this.mix || offset >= buffer.duration) return null;
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.setValueAtTime(offset > 0.05 ? 0.0001 : level, now);
    if (offset > 0.05) gain.gain.exponentialRampToValueAtTime(level, now + 0.18);
    source.connect(gain);
    gain.connect(this.mix);
    source.start(now, offset);
    return this.voice([source], gain, now + buffer.duration - offset);
  }

  private shutter(level: number, pan: number) {
    const context = this.context;
    const buffer = this.buffer(`shutter${this.clickIndex % 4}`);
    if (!context || !buffer || !this.mix) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 0.94 + (this.clickIndex % 7) * 0.02;
    const gain = context.createGain();
    gain.gain.value = level;
    source.connect(gain);
    if (typeof context.createStereoPanner === "function") {
      const panner = context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      gain.connect(panner);
      panner.connect(this.mix);
    } else gain.connect(this.mix);
    source.start();
  }

  private noiseSource(context: AudioContext) {
    const buffer = this.buffer("noise");
    if (!buffer) return null;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  private whoosh(level: number, duration: number, direction: number): Voice | null {
    const context = this.context;
    if (!context || !this.mix) return null;
    const source = this.noiseSource(context);
    if (!source) return null;
    const now = context.currentTime;
    const band = context.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 1.3;
    band.frequency.setValueAtTime(300, now);
    band.frequency.exponentialRampToValueAtTime(2400, now + duration * 0.45);
    band.frequency.exponentialRampToValueAtTime(500, now + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + duration * 0.45);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(band);
    if (typeof context.createStereoPanner === "function") {
      const panner = context.createStereoPanner();
      panner.pan.setValueAtTime(-0.6 * direction, now);
      panner.pan.linearRampToValueAtTime(0.6 * direction, now + duration);
      band.connect(panner);
      panner.connect(gain);
    } else band.connect(gain);
    gain.connect(this.mix);
    source.start(now);
    source.stop(now + duration + 0.05);
    return this.voice([source], gain, now + duration);
  }

  /** Pancada grave (bumbo de cinema). */
  private boom(level: number): Voice | null {
    const context = this.context;
    if (!context || !this.mix) return null;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(92, now);
    oscillator.frequency.exponentialRampToValueAtTime(38, now + 0.5);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
    oscillator.connect(gain);
    gain.connect(this.mix);
    oscillator.start(now);
    oscillator.stop(now + 1.2);
    return this.voice([oscillator], gain, now + 1.2);
  }

  /** Acorde do hino: cordas sintéticas que crescem (`attack`) e somem devagar. `bright` 1..2 abre o filtro. */
  private chord(level: number, hold: number, attack: number, bright: number): Voice | null {
    const context = this.context;
    if (!context || !this.mix) return null;
    const now = context.currentTime;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(600 * bright, now);
    filter.frequency.linearRampToValueAtTime(1500 * bright, now + Math.max(0.2, attack) + 0.6);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + Math.max(0.02, attack));
    gain.gain.setTargetAtTime(0.0001, now + hold * 0.55, hold * 0.22);
    filter.connect(gain);
    gain.connect(this.mix);
    const sources: OscillatorNode[] = [];
    for (const note of ANTHEM) {
      for (const detune of [-6, 5]) {
        const oscillator = context.createOscillator();
        oscillator.type = "sawtooth";
        oscillator.frequency.value = note;
        oscillator.detune.value = detune;
        const voice = context.createGain();
        voice.gain.value = 0.06;
        oscillator.connect(voice);
        voice.connect(filter);
        oscillator.start(now);
        oscillator.stop(now + hold + 0.4);
        sources.push(oscillator);
      }
    }
    return this.voice(sources, gain, now + hold + 0.4);
  }
}
