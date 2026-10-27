// Som da gala da Bola de Ouro, todo sintetizado no WebAudio: nenhum arquivo,
// nem um byte a mais no export estático.
//
// O som é função do relógio do roteiro, igual à imagem: a cerimônia chama
// `update(tempo)` a cada quadro e cada deixa entra quando o tempo cruza o seu
// instante. Num salto (Pular, Rever) o que está tocando para e só as deixas
// longas (aplauso, rufar, batida do coração) voltam, já no ponto certo.

import type { CeremonyTimeline } from "./ballon-dor-script";

type Voice = { stop: (fade: number) => void; end: number };

type Cue = {
  at: number;
  length: number;
  /** Deixas longas retomam no meio depois de um salto; as curtas (impacto, whoosh) não. */
  sustained: boolean;
  play: (offset: number) => Voice | null;
};

type Layer = { gain: GainNode; filter: BiquadFilterNode; sources: AudioScheduledSourceNode[]; level: number; cutoff: number };

// ------------------------------------------------------------ contexto

let sharedContext: AudioContext | null = null;
let liveInstances = 0;

function ceremonyContext(): AudioContext | null {
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

/**
 * Chame dentro do clique de "Assistir": Safari e Chrome só liberam o som num
 * gesto, e a cerimônia ainda está baixando quando o clique acontece.
 */
export function primeCeremonyAudio() {
  const audio = ceremonyContext();
  if (audio && audio.state === "suspended") void audio.resume().catch(() => undefined);
}

/** A mesma chave do botão "Som" da partida: quem joga sem som assiste sem som. */
const MUTE_KEY = "futbobo_player_match_muted";

export function readCeremonyMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberCeremonyMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Preferência opcional: sem storage vale só nesta cerimônia.
  }
}

// ------------------------------------------------------- buffers prontos

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Coeficiente de um passa-baixa de um polo para a frequência de corte. */
function onePole(cutoff: number, sampleRate: number) {
  return 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
}

/**
 * Plateia e percussão são geradas a 22 kHz: palma e caixa quase não têm
 * nada acima de 11 kHz e o buffer sai em menos da metade do tempo. O
 * WebAudio reamostra sozinho na hora de tocar.
 */
const BUFFER_RATE = 22050;

function stereoBuffer(context: BaseAudioContext, left: Float32Array<ArrayBuffer>, right: Float32Array<ArrayBuffer>, rate: number, peak = 0.9) {
  let max = 0;
  for (let index = 0; index < left.length; index += 1) max = Math.max(max, Math.abs(left[index]), Math.abs(right[index]));
  const gain = max > 0 ? peak / max : 1;
  for (let index = 0; index < left.length; index += 1) {
    left[index] *= gain;
    right[index] *= gain;
  }
  const buffer = context.createBuffer(2, left.length, rate);
  buffer.copyToChannel(left, 0);
  buffer.copyToChannel(right, 1);
  return buffer;
}

/** Ruído em banda (diferença de dois passa-baixas) com decaimento: o átomo de palma, caixa e obturador. */
function noiseGrain(random: () => number, seconds: number, high: number, low: number, decay: number) {
  const length = Math.ceil(seconds * BUFFER_RATE);
  const grain = new Float32Array(length);
  const kHigh = onePole(high, BUFFER_RATE);
  const kLow = onePole(low, BUFFER_RATE);
  const fall = Math.exp(-1 / (decay * BUFFER_RATE));
  let bandHigh = 0;
  let bandLow = 0;
  let level = 1;
  let max = 0;
  for (let index = 0; index < length; index += 1) {
    const noise = random() * 2 - 1;
    bandHigh += kHigh * (noise - bandHigh);
    bandLow += kLow * (bandHigh - bandLow);
    grain[index] = (bandHigh - bandLow) * level * Math.min(1, index / 8);
    level *= fall;
    max = Math.max(max, Math.abs(grain[index]));
  }
  if (max > 0) for (let index = 0; index < length; index += 1) grain[index] /= max;
  return grain;
}

function mixGrain(left: Float32Array, right: Float32Array, grain: Float32Array, at: number, gainLeft: number, gainRight: number) {
  const start = Math.floor(at * BUFFER_RATE);
  const end = Math.min(grain.length, left.length - start);
  for (let index = 0; index < end; index += 1) {
    left[start + index] += grain[index] * gainLeft;
    right[start + index] += grain[index] * gainRight;
  }
}

/**
 * Plateia batendo palmas: cada pessoa toca um estalo de um banco de palmas, no
 * seu ritmo e no seu lugar do estéreo, e cada uma para numa hora diferente.
 */
function renderApplause(context: BaseAudioContext, seconds: number, options: { clappers: number; rate: number; attack: number; release: number; seed: number }) {
  const frames = Math.ceil(seconds * BUFFER_RATE);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const random = seededRandom(options.seed);
  const claps = Array.from({ length: 12 }, () => noiseGrain(random, 0.024, 2200 + random() * 2600, 380 + random() * 520, 0.0035 + random() * 0.0045));
  for (let clapper = 0; clapper < options.clappers; clapper += 1) {
    const pan = random();
    const gainLeft = Math.cos(pan * Math.PI * 0.5);
    const gainRight = Math.sin(pan * Math.PI * 0.5);
    const amplitude = 0.22 + random() * 0.78;
    const period = 1 / (options.rate * (0.8 + random() * 0.45));
    const stop = seconds - options.release * (0.1 + random() * 0.9);
    for (let time = random() * options.attack; time < stop; time += period * (0.86 + random() * 0.28)) {
      const level = Math.min(1, time / Math.max(0.01, options.attack)) * amplitude * (0.8 + random() * 0.4);
      mixGrain(left, right, claps[Math.floor(random() * claps.length)], time, level * gainLeft, level * gainRight);
    }
  }
  return stereoBuffer(context, left, right, BUFFER_RATE);
}

/** Coração acelerando: duas batidas graves por ciclo ("tum-tum"), cada vez mais rápidas. */
function renderHeartbeat(context: BaseAudioContext, seconds: number) {
  const frames = Math.ceil(seconds * BUFFER_RATE);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const thump = new Float32Array(Math.floor(0.32 * BUFFER_RATE));
  let phase = 0;
  for (let index = 0; index < thump.length; index += 1) {
    const time = index / BUFFER_RATE;
    phase += (2 * Math.PI * (36 + 34 * Math.exp(-time / 0.035))) / BUFFER_RATE;
    thump[index] = Math.sin(phase) * Math.min(1, time / 0.003) * Math.exp(-time / 0.085);
  }
  let time = 0.08;
  while (time < seconds - 0.2) {
    const progress = time / seconds;
    const amplitude = 0.55 + 0.45 * progress;
    mixGrain(left, right, thump, time, amplitude, amplitude);
    mixGrain(left, right, thump, time + 0.2, amplitude * 0.68, amplitude * 0.68);
    time += 60 / (70 + 62 * progress * progress);
  }
  return stereoBuffer(context, left, right, BUFFER_RATE, 0.95);
}

/** Rufar de caixa em crescendo, mão esquerda e direita levemente separadas no estéreo. */
function renderDrumroll(context: BaseAudioContext, seconds: number, seed: number) {
  const frames = Math.ceil(seconds * BUFFER_RATE);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const random = seededRandom(seed);
  // Cada golpe: esteira (ruído) mais o corpo da caixa (tom de 188 Hz).
  const hits = Array.from({ length: 6 }, () => {
    const grain = noiseGrain(random, 0.09, 6800, 260, 0.022);
    for (let index = 0; index < grain.length; index += 1) {
      const time = index / BUFFER_RATE;
      grain[index] = grain[index] * 0.8 + Math.sin(2 * Math.PI * 188 * time) * Math.exp(-time / 0.014) * 0.55;
    }
    return grain;
  });
  let time = 0;
  let hand = 0;
  while (time < seconds) {
    const progress = time / seconds;
    const amplitude = (0.08 + 0.92 * Math.pow(progress, 2.1)) * (0.86 + random() * 0.24) * (hand % 2 ? 0.9 : 1);
    const pan = hand % 2 ? 0.62 : 0.38;
    mixGrain(left, right, hits[Math.floor(random() * hits.length)], time, amplitude * (1 - pan), amplitude * pan);
    hand += 1;
    time += (1 / (11 + 15 * Math.pow(progress, 1.4))) * (0.92 + random() * 0.16);
  }
  return stereoBuffer(context, left, right, BUFFER_RATE, 0.92);
}

/** Fotógrafos na beira do palco: cliques de obturador espalhados. */
function renderShutters(context: BaseAudioContext, seconds: number, seed: number) {
  const frames = Math.ceil(seconds * BUFFER_RATE);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const random = seededRandom(seed);
  const click = noiseGrain(random, 0.012, 9000, 1400, 0.0025);
  for (let shot = 0; shot < 16; shot += 1) {
    const at = 0.05 + random() * (seconds - 0.3);
    const amplitude = 0.35 + random() * 0.65;
    const pan = random();
    mixGrain(left, right, click, at, amplitude * (1 - pan), amplitude * pan);
    mixGrain(left, right, click, at + 0.045 + random() * 0.02, amplitude * 0.6 * (1 - pan), amplitude * 0.6 * pan);
  }
  return stereoBuffer(context, left, right, BUFFER_RATE, 0.7);
}

/** Resposta de sala para o reverb: o salão do teatro. Precisa da taxa do contexto (regra do ConvolverNode). */
function renderImpulse(context: BaseAudioContext, seconds: number) {
  const sampleRate = context.sampleRate;
  const frames = Math.ceil(seconds * sampleRate);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const random = seededRandom(9127);
  const darken = onePole(5200, sampleRate);
  let lastLeft = 0;
  let lastRight = 0;
  let envelope = 1;
  for (let index = 0; index < frames; index += 1) {
    if ((index & 127) === 0) envelope = Math.pow(1 - index / frames, 3.2);
    lastLeft += darken * ((random() * 2 - 1) - lastLeft);
    lastRight += darken * ((random() * 2 - 1) - lastRight);
    left[index] = lastLeft * envelope;
    right[index] = lastRight * envelope;
  }
  return stereoBuffer(context, left, right, sampleRate, 0.5);
}

function renderNoise(context: BaseAudioContext, seconds: number) {
  const frames = Math.ceil(seconds * context.sampleRate);
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const channel = buffer.getChannelData(0);
  const random = seededRandom(4111);
  for (let index = 0; index < frames; index += 1) channel[index] = random() * 2 - 1;
  return buffer;
}

// ------------------------------------------------------------- mixagem

/** Acorde do pad (Ré com sétima maior e nona): quente, de gala, sem tensão. */
const PAD_NOTES = [146.83, 220, 277.18, 329.63, 440];
/** Metais da fanfarra (Ré maior aberto). */
const FANFARE_NOTES = [146.83, 220, 293.66, 369.99, 440, 587.33];

export class CeremonyAudio {
  private readonly context: AudioContext | null;
  private readonly cues: Cue[] = [];
  private readonly voices = new Set<Voice>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly builders = new Map<string, () => AudioBuffer>();
  private output: GainNode | null = null;
  private mix: GainNode | null = null;
  private send: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private pad: Layer | null = null;
  private murmur: Layer | null = null;
  private lastTime = -1;
  private muted: boolean;
  private disposed = false;
  private warmTimer = 0;

  constructor(private readonly timeline: CeremonyTimeline, options: { muted: boolean }) {
    this.context = ceremonyContext();
    this.muted = options.muted;
    if (!this.context) return;
    liveInstances += 1;
    this.buildGraph(this.context);
    this.registerBuffers(this.context);
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
    this.ensureLayers(context);
    this.updateLayers(context, time);
    for (const voice of this.voices) if (voice.end < context.currentTime) this.voices.delete(voice);
    if (jumped || previous < 0 || time < previous || time - previous > 0.5) {
      this.stopVoices(0.12);
      // Só o que é longo volta, já no ponto certo; um impacto atrasado soaria errado.
      for (const cue of this.cues) {
        if (cue.sustained && time >= cue.at && time < cue.at + cue.length - 0.2) this.start(cue, time - cue.at);
      }
      return;
    }
    for (const cue of this.cues) {
      if (cue.at > previous && cue.at <= time) this.start(cue, time - cue.at);
    }
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    const context = this.context;
    if (!context || !this.output) return;
    this.output.gain.setTargetAtTime(muted ? 0 : 0.9, context.currentTime, 0.04);
  }

  /** Aba escondida: o relógio da cerimônia para, e o som junto. */
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
    for (const layer of [this.pad, this.murmur]) {
      if (!layer) continue;
      layer.gain.gain.setTargetAtTime(0, context.currentTime, 0.03);
      for (const source of layer.sources) {
        try {
          source.stop(context.currentTime + 0.2);
        } catch {
          // Já parado.
        }
      }
    }
    const output = this.output;
    window.setTimeout(() => output?.disconnect(), 260);
    liveInstances = Math.max(0, liveInstances - 1);
    // Ninguém mais tocando: o contexto dorme e não gasta bateria até a próxima gala.
    window.setTimeout(() => {
      if (liveInstances === 0 && context.state === "running") void context.suspend().catch(() => undefined);
    }, 400);
  }

  // ------------------------------------------------------------ montagem

  private buildGraph(context: AudioContext) {
    const output = context.createGain();
    output.gain.value = this.muted ? 0 : 0.9;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 12;
    compressor.ratio.value = 3.5;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.25;
    const mix = context.createGain();
    mix.gain.value = 0.85;
    mix.connect(compressor);
    compressor.connect(output);
    output.connect(context.destination);
    // O reverb só ganha a resposta de sala no aquecimento (`warm`): até lá, a gala soa seca.
    const send = context.createGain();
    const convolver = context.createConvolver();
    const wet = context.createGain();
    wet.gain.value = 0.34;
    send.connect(convolver);
    convolver.connect(wet);
    wet.connect(compressor);
    this.output = output;
    this.mix = mix;
    this.send = send;
    this.convolver = convolver;
  }

  private registerBuffers(context: AudioContext) {
    const seed = this.timeline.input.seed;
    const timeline = this.timeline;
    const duelStart = timeline.duelCuts[0]?.at ?? timeline.thirdRevealAt + 3;
    this.builders.set("noise", () => renderNoise(context, 2.5));
    this.builders.set("roll-short", () => renderDrumroll(context, 1.5, seed + 3));
    this.builders.set("applause-third", () => renderApplause(context, 3.4, { clappers: 46, rate: 4.2, attack: 0.35, release: 1.6, seed: seed + 11 }));
    this.builders.set("heartbeat", () => renderHeartbeat(context, Math.max(1, timeline.winnerRevealAt - duelStart)));
    this.builders.set("drumroll", () => renderDrumroll(context, Math.max(1, timeline.winnerRevealAt - duelStart - 2.4), seed + 5));
    this.builders.set("applause-winner", () => renderApplause(context, 12, { clappers: 78, rate: 4.8, attack: 0.25, release: 5, seed: seed + 17 }));
    this.builders.set("cheer", () => renderApplause(context, 4.2, { clappers: 30, rate: 5.2, attack: 0.2, release: 2.2, seed: seed + 23 }));
    this.builders.set("applause-polite", () => renderApplause(context, 3.8, { clappers: 26, rate: 3.4, attack: 0.5, release: 2, seed: seed + 29 }));
    this.builders.set("shutters", () => renderShutters(context, 3.6, seed + 31));
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

  /** Gera os buffers um por tarefa, para nenhum travar o quadro da revelação. */
  private warm() {
    const pending = ["impulse", ...this.builders.keys()];
    const next = () => {
      if (this.disposed) return;
      const name = pending.shift();
      if (!name) return;
      if (name === "impulse") {
        try {
          if (this.convolver && this.context) this.convolver.buffer = renderImpulse(this.context, 2.6);
        } catch {
          // Sem reverb a gala só fica mais seca.
        }
      } else {
        this.buffer(name);
      }
      this.warmTimer = window.setTimeout(next, 16);
    };
    this.warmTimer = window.setTimeout(next, 30);
  }

  private buildCues() {
    const timeline = this.timeline;
    const add = (at: number, length: number, sustained: boolean, play: (offset: number) => Voice | null) => {
      this.cues.push({ at, length, sustained, play });
    };
    const beats = timeline.beats;
    const third = beats.find((beat) => beat.id === "third");
    const reaction = beats.find((beat) => beat.id === "reaction");
    const duelStart = timeline.duelCuts[0]?.at ?? timeline.thirdRevealAt + 3;

    // Abertura: pancada grave e brilho, a cortina sobe.
    add(0.05, 3, false, () => this.group([this.boom(0.55), this.shimmer(0.32, 220)]));

    // Cortes de câmera ganham um whoosh; os do duelo, mais secos e com pancada.
    beats.forEach((beat, index) => {
      if (index === 0 || beat.id === "duel" || beat.id === "end") return;
      add(beat.start, 0.7, false, () => this.whoosh(beat.id === "reveal" ? 0.32 : 0.22, 0.65, index % 2 ? 1 : -1));
      if (beat.id === "nominee") add(beat.start + 0.3, 1.2, false, () => this.chime(0.11));
    });
    timeline.duelCuts.forEach((cut, index) => {
      add(cut.at, 0.4, false, () => this.group([this.whoosh(0.2, 0.38, index % 2 ? 1 : -1), this.thud(0.42 + index * 0.06)]));
    });

    // Terceiro lugar: sobe a tensão, rufar curto, pancada e aplauso.
    if (third) {
      add(third.start, timeline.thirdRevealAt - third.start, true, (offset) => this.riser(offset, timeline.thirdRevealAt - third.start, 0.16));
      add(timeline.thirdRevealAt - 1.4, 1.4, true, (offset) => this.playBuffer("roll-short", offset, 0.34, 0.15));
    }
    add(timeline.thirdRevealAt, 3, false, () => this.group([this.boom(0.45), this.shimmer(0.24, 196)]));
    add(timeline.thirdRevealAt + 0.2, 3.4, true, (offset) => this.playBuffer("applause-third", offset, 0.5, 0.25));

    // Duelo: coração e rufar até o envelope abrir.
    add(duelStart, timeline.winnerRevealAt - duelStart, true, (offset) => this.playBuffer("heartbeat", offset, 0.62, 0.05));
    add(duelStart + 2.4, timeline.winnerRevealAt - duelStart - 2.4, true, (offset) => this.playBuffer("drumroll", offset, 0.46, 0.18));
    add(timeline.winnerRevealAt - 0.9, 0.9, true, (offset) => this.riser(offset, 0.9, 0.12));

    // O nome: pancada, prato, brilho e acorde. Depois, o teatro inteiro.
    add(timeline.winnerRevealAt, 4, false, () => this.group([this.boom(0.9), this.crash(0.42), this.shimmer(0.5, 293.66), this.fanfare(0.24, 0.9)]));
    add(timeline.winnerRevealAt + 0.08, 12, true, (offset) => this.group([this.playBuffer("applause-winner", offset, 0.72, 0.3), this.roar(offset, 12, 0.5)]));

    // O troféu: brilho na entrega, fanfarra e grito quando sobe.
    add(timeline.trophyHandoffAt, 1.5, false, () => this.sparkle(0.16));
    add(timeline.trophyLiftAt, 3, false, () => this.group([this.fanfare(timeline.userWon ? 0.3 : 0.2, 1.6), this.shimmer(0.3, 440)]));
    add(timeline.trophyLiftAt + 0.05, 4.2, true, (offset) => this.group([
      this.playBuffer("cheer", offset, timeline.userWon ? 0.62 : 0.45, 0.3),
      this.roar(offset, 4.2, timeline.userWon ? 0.75 : 0.45),
    ]));

    // Reação: foto oficial com flashes, ou o aplauso educado de quem perdeu.
    if (reaction) {
      if (timeline.userWon) add(reaction.start + 0.15, 3.6, true, (offset) => this.playBuffer("shutters", offset, 0.5, 0.1));
      else add(reaction.start + 0.3, 3.8, true, (offset) => this.playBuffer("applause-polite", offset, 0.42, 0.25));
    }

    // Cartão final: um acorde suave fecha a noite.
    add(timeline.duration + 0.15, 3, false, () => this.shimmer(0.16, 293.66));
  }

  // ------------------------------------------------------- camadas contínuas

  private ensureLayers(context: AudioContext) {
    if (this.pad || !this.mix) return;
    const now = context.currentTime;

    const padGain = context.createGain();
    padGain.gain.value = 0;
    const padFilter = context.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 700;
    padFilter.Q.value = 0.6;
    const padSources: AudioScheduledSourceNode[] = [];
    for (const note of PAD_NOTES) {
      for (const detune of [-7, 6]) {
        const oscillator = context.createOscillator();
        oscillator.type = "sawtooth";
        oscillator.frequency.value = note;
        oscillator.detune.value = detune;
        const voiceGain = context.createGain();
        voiceGain.gain.value = 0.05;
        oscillator.connect(voiceGain);
        voiceGain.connect(padFilter);
        oscillator.start(now);
        padSources.push(oscillator);
      }
    }
    // O filtro respira devagar: o pad nunca fica parado.
    const lfo = context.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoDepth = context.createGain();
    lfoDepth.gain.value = 180;
    lfo.connect(lfoDepth);
    lfoDepth.connect(padFilter.frequency);
    lfo.start(now);
    padSources.push(lfo);
    padFilter.connect(padGain);
    this.route(padGain, 0.5);
    this.pad = { gain: padGain, filter: padFilter, sources: padSources, level: 0, cutoff: 700 };

    const noise = this.buffer("noise");
    if (!noise) return;
    const murmurSource = context.createBufferSource();
    murmurSource.buffer = noise;
    murmurSource.loop = true;
    const band = context.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 420;
    band.Q.value = 0.55;
    const murmurFilter = context.createBiquadFilter();
    murmurFilter.type = "lowpass";
    murmurFilter.frequency.value = 1400;
    const murmurGain = context.createGain();
    murmurGain.gain.value = 0;
    murmurSource.connect(band);
    band.connect(murmurFilter);
    murmurFilter.connect(murmurGain);
    this.route(murmurGain, 0.4);
    murmurSource.start(now);
    this.murmur = { gain: murmurGain, filter: murmurFilter, sources: [murmurSource], level: 0, cutoff: 1400 };
  }

  private updateLayers(context: AudioContext, time: number) {
    const timeline = this.timeline;
    const beat = timeline.beats.find((item) => time < item.end) ?? timeline.beats[timeline.beats.length - 1];
    const revealed = beat.revealAt !== undefined && time >= beat.revealAt;
    // Pad: cresce na abertura, encolhe no suspense, abre depois do nome.
    const padLevel = time < 3 ? 0.16 * (time / 3)
      : beat.id === "third" ? (revealed ? 0.13 : 0.1)
      : beat.id === "duel" ? 0.06
      : beat.id === "reveal" ? (revealed ? 0.19 : 0.04)
      : beat.id === "end" ? 0.11
      : 0.16;
    // Burburinho da plateia: alto na entrada, silêncio absoluto no envelope.
    const murmurLevel = beat.id === "establish" ? 0.2
      : beat.id === "nominee" ? 0.12
      : beat.id === "presenter" ? 0.05
      : beat.id === "third" || beat.id === "duel" ? 0.02
      : beat.id === "reveal" ? (revealed ? 0.05 : 0.008)
      : 0.07;
    const cutoff = time >= timeline.winnerRevealAt ? 1500 : 700;
    const now = context.currentTime;
    if (this.pad && Math.abs(this.pad.level - padLevel) > 0.002) {
      this.pad.level = padLevel;
      this.pad.gain.gain.setTargetAtTime(padLevel, now, 0.45);
    }
    if (this.pad && this.pad.cutoff !== cutoff) {
      this.pad.cutoff = cutoff;
      this.pad.filter.frequency.setTargetAtTime(cutoff, now, 0.8);
    }
    if (this.murmur && Math.abs(this.murmur.level - murmurLevel) > 0.002) {
      this.murmur.level = murmurLevel;
      this.murmur.gain.gain.setTargetAtTime(murmurLevel, now, 0.35);
    }
  }

  // ---------------------------------------------------------- vozes soltas

  private start(cue: Cue, offset: number) {
    try {
      const voice = cue.play(Math.max(0, offset));
      if (voice) this.voices.add(voice);
    } catch {
      // Um som que falha não pode derrubar a cerimônia.
    }
  }

  private stopVoices(fade: number) {
    for (const voice of this.voices) voice.stop(fade);
    this.voices.clear();
  }

  private route(node: AudioNode, wet: number) {
    const context = this.context;
    if (!context || !this.mix) return;
    node.connect(this.mix);
    if (wet > 0 && this.send) {
      const sendGain = context.createGain();
      sendGain.gain.value = wet;
      node.connect(sendGain);
      sendGain.connect(this.send);
    }
  }

  private voice(sources: AudioScheduledSourceNode[], gain: GainNode, end: number): Voice {
    const context = this.context as AudioContext;
    return {
      end,
      stop: (fade) => {
        const now = context.currentTime;
        const param = gain.gain;
        param.cancelScheduledValues(now);
        param.setValueAtTime(param.value, now);
        param.setTargetAtTime(0, now, Math.max(0.01, fade / 3));
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

  private noiseSource(context: AudioContext) {
    const buffer = this.buffer("noise");
    if (!buffer) return null;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  private playBuffer(name: string, offset: number, level: number, wet: number): Voice | null {
    const context = this.context;
    const buffer = this.buffer(name);
    if (!context || !buffer || offset >= buffer.duration) return null;
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    // Retomando no meio (depois de um salto) entra com fade, sem estalo.
    gain.gain.setValueAtTime(offset > 0.05 ? 0.0001 : level, now);
    if (offset > 0.05) gain.gain.exponentialRampToValueAtTime(level, now + 0.18);
    source.connect(gain);
    this.route(gain, wet);
    source.start(now, offset);
    return this.voice([source], gain, now + buffer.duration - offset);
  }

  private whoosh(level: number, duration: number, direction: number): Voice | null {
    const context = this.context;
    if (!context) return null;
    const source = this.noiseSource(context);
    if (!source) return null;
    const now = context.currentTime;
    const band = context.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 1.3;
    band.frequency.setValueAtTime(260, now);
    band.frequency.exponentialRampToValueAtTime(2600, now + duration * 0.45);
    band.frequency.exponentialRampToValueAtTime(480, now + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + duration * 0.45);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(band);
    let tail: AudioNode = band;
    if (typeof context.createStereoPanner === "function") {
      const panner = context.createStereoPanner();
      panner.pan.setValueAtTime(-0.7 * direction, now);
      panner.pan.linearRampToValueAtTime(0.7 * direction, now + duration);
      band.connect(panner);
      tail = panner;
    }
    tail.connect(gain);
    this.route(gain, 0.2);
    source.start(now, Math.random() * 1.5);
    source.stop(now + duration + 0.05);
    return this.voice([source], gain, now + duration);
  }

  private thud(level: number): Voice | null {
    const context = this.context;
    if (!context) return null;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(96, now);
    oscillator.frequency.exponentialRampToValueAtTime(42, now + 0.28);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    oscillator.connect(gain);
    this.route(gain, 0.15);
    oscillator.start(now);
    oscillator.stop(now + 0.4);
    return this.voice([oscillator], gain, now + 0.4);
  }

  private boom(level: number): Voice | null {
    const context = this.context;
    if (!context) return null;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(68, now);
    oscillator.frequency.exponentialRampToValueAtTime(29, now + 1.6);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
    oscillator.connect(gain);
    const sources: AudioScheduledSourceNode[] = [oscillator];
    const noise = this.noiseSource(context);
    if (noise) {
      const low = context.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.setValueAtTime(420, now);
      low.frequency.exponentialRampToValueAtTime(70, now + 0.7);
      const noiseGain = context.createGain();
      noiseGain.gain.setValueAtTime(level * 0.9, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
      noise.connect(low);
      low.connect(noiseGain);
      noiseGain.connect(gain);
      noise.start(now);
      noise.stop(now + 0.85);
      sources.push(noise);
    }
    this.route(gain, 0.35);
    oscillator.start(now);
    oscillator.stop(now + 2.3);
    return this.voice(sources, gain, now + 2.3);
  }

  private crash(level: number): Voice | null {
    const context = this.context;
    if (!context) return null;
    const source = this.noiseSource(context);
    if (!source) return null;
    const now = context.currentTime;
    const high = context.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 2600;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);
    source.connect(high);
    high.connect(gain);
    this.route(gain, 0.7);
    source.start(now);
    source.stop(now + 2.9);
    return this.voice([source], gain, now + 2.9);
  }

  /** Sininhos em série harmônica: o brilho dourado de cada revelação. */
  private shimmer(level: number, root: number): Voice | null {
    const context = this.context;
    if (!context) return null;
    const now = context.currentTime;
    const gain = context.createGain();
    gain.gain.value = level;
    const sources: AudioScheduledSourceNode[] = [];
    [2, 3, 4, 5, 6, 8].forEach((harmonic, index) => {
      const start = now + index * 0.045;
      const length = 2.6 + index * 0.2;
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = root * harmonic;
      oscillator.detune.value = (index % 2 ? 4 : -4);
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(1 / (index + 2), start + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + length);
      oscillator.connect(envelope);
      envelope.connect(gain);
      oscillator.start(start);
      oscillator.stop(start + length + 0.05);
      sources.push(oscillator);
    });
    this.route(gain, 0.8);
    return this.voice(sources, gain, now + 4);
  }

  private chime(level: number): Voice | null {
    const context = this.context;
    if (!context) return null;
    const now = context.currentTime;
    const gain = context.createGain();
    gain.gain.value = level;
    const sources: AudioScheduledSourceNode[] = [];
    for (const [frequency, amount] of [[1318.5, 1], [1975.5, 0.45], [2637, 0.2]] as const) {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(amount, now + 0.006);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      oscillator.connect(envelope);
      envelope.connect(gain);
      oscillator.start(now);
      oscillator.stop(now + 1.25);
      sources.push(oscillator);
    }
    this.route(gain, 0.6);
    return this.voice(sources, gain, now + 1.25);
  }

  private sparkle(level: number): Voice | null {
    const context = this.context;
    if (!context) return null;
    const now = context.currentTime;
    const gain = context.createGain();
    gain.gain.value = level;
    const sources: AudioScheduledSourceNode[] = [];
    const notes = [1174.66, 1479.98, 1760, 2349.32, 2959.96, 3520];
    const random = seededRandom(this.timeline.input.seed + 41);
    for (let index = 0; index < 10; index += 1) {
      const start = now + index * 0.07 + random() * 0.03;
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = notes[Math.floor(random() * notes.length)];
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(0.5, start + 0.005);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      oscillator.connect(envelope);
      envelope.connect(gain);
      oscillator.start(start);
      oscillator.stop(start + 0.55);
      sources.push(oscillator);
    }
    this.route(gain, 0.8);
    return this.voice(sources, gain, now + 1.4);
  }

  /** Metais sintetizados: serra com filtro que abre no ataque. */
  private fanfare(level: number, hold: number): Voice | null {
    const context = this.context;
    if (!context) return null;
    const now = context.currentTime;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(500, now);
    filter.frequency.exponentialRampToValueAtTime(3200, now + 0.09);
    filter.frequency.exponentialRampToValueAtTime(1300, now + 0.7);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.04);
    gain.gain.setValueAtTime(level, now + hold);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + hold + 1.6);
    const sources: AudioScheduledSourceNode[] = [];
    for (const note of FANFARE_NOTES) {
      for (const detune of [-5, 5]) {
        const oscillator = context.createOscillator();
        oscillator.type = "sawtooth";
        oscillator.frequency.value = note;
        oscillator.detune.value = detune;
        const voiceGain = context.createGain();
        voiceGain.gain.value = 0.09;
        oscillator.connect(voiceGain);
        voiceGain.connect(filter);
        oscillator.start(now);
        oscillator.stop(now + hold + 1.7);
        sources.push(oscillator);
      }
    }
    filter.connect(gain);
    this.route(gain, 0.45);
    return this.voice(sources, gain, now + hold + 1.7);
  }

  /**
   * Grito da plateia: ruído em banda média que cresce, ondula e some no fim.
   * Feito ao vivo (e não no buffer das palmas) para não custar quadro nenhum.
   */
  private roar(offset: number, length: number, level: number): Voice | null {
    const context = this.context;
    if (!context || offset >= length) return null;
    const source = this.noiseSource(context);
    if (!source) return null;
    const now = context.currentTime;
    const band = context.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 560;
    band.Q.value = 0.6;
    const low = context.createBiquadFilter();
    low.type = "lowpass";
    low.frequency.value = 1300;
    const gain = context.createGain();
    // Envelope a partir de `offset`: sobe em 0,7 s, segura e cai nos últimos 45%.
    const peak = level * 1.4;
    const fallStart = length * 0.55;
    const at = (time: number) => now + Math.max(0, time - offset);
    const envelope = (time: number) => peak * Math.min(1, time / 0.7) * Math.min(1, Math.max(0, (length - time) / (length - fallStart)));
    gain.gain.setValueAtTime(Math.max(0.0001, envelope(offset)), now);
    if (offset < 0.7) gain.gain.linearRampToValueAtTime(peak, at(0.7));
    if (offset < fallStart) gain.gain.setValueAtTime(peak, at(fallStart));
    gain.gain.linearRampToValueAtTime(0, at(length));
    // Ondulação lenta: a plateia respira junto.
    const wobble = context.createOscillator();
    wobble.frequency.value = 0.6;
    const wobbleDepth = context.createGain();
    wobbleDepth.gain.value = peak * 0.22;
    wobble.connect(wobbleDepth);
    wobbleDepth.connect(gain.gain);
    source.connect(band);
    band.connect(low);
    low.connect(gain);
    this.route(gain, 0.35);
    const end = now + length - offset;
    source.start(now, Math.random() * 2);
    wobble.start(now);
    source.stop(end + 0.05);
    wobble.stop(end + 0.05);
    return this.voice([source, wobble], gain, end);
  }

  /** Ruído que sobe de tom até a revelação; `offset` retoma no meio. */
  private riser(offset: number, length: number, level: number): Voice | null {
    const context = this.context;
    if (!context || offset >= length) return null;
    const source = this.noiseSource(context);
    if (!source) return null;
    const now = context.currentTime;
    const remaining = length - offset;
    const progress = offset / length;
    const band = context.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 2;
    band.frequency.setValueAtTime(300 * Math.pow(5000 / 300, progress), now);
    band.frequency.exponentialRampToValueAtTime(5000, now + remaining);
    const gain = context.createGain();
    gain.gain.setValueAtTime(Math.max(0.0001, level * (0.08 + 0.92 * progress * progress)), now);
    gain.gain.exponentialRampToValueAtTime(level, now + remaining);
    gain.gain.setTargetAtTime(0, now + remaining, 0.015);
    source.connect(band);
    band.connect(gain);
    this.route(gain, 0.3);
    source.start(now);
    source.stop(now + remaining + 0.1);
    return this.voice([source], gain, now + remaining + 0.1);
  }
}
