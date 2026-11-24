// Som da despedida, todo sintetizado no WebAudio (nenhum arquivo): o ronco do
// estádio, as palmas no ritmo da arquibancada, o coro "ôôô" que sobe quando ele
// para no círculo central e um tema de piano por baixo de tudo.
//
// Como a imagem, o som é função do relógio: `update(tempo)` a cada quadro e
// cada deixa entra quando o tempo cruza o instante dela. Num salto (Pular,
// Rever) o que toca para e só o que é longo volta, já no ponto certo.

import { FAREWELL_MARKS, crowdLevel, seededRandom, type FarewellTimeline } from "./farewell-script";

type Voice = { stop: (fade: number) => void; end: number };
type Cue = { at: number; length: number; sustained: boolean; play: (offset: number) => Voice | null };

const RATE = 22050;
const M = FAREWELL_MARKS;

let sharedContext: AudioContext | null = null;
let liveInstances = 0;

function farewellContext(): AudioContext | null {
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
export function primeFarewellAudio() {
  const audio = farewellContext();
  if (audio && audio.state === "suspended") void audio.resume().catch(() => undefined);
}

// ------------------------------------------------------------- buffers

const onePole = (cutoff: number) => 1 - Math.exp((-2 * Math.PI * cutoff) / RATE);

/** Ruído em banda com decaimento: uma palma. */
function clapGrain(random: () => number, seconds: number, high: number, low: number, decay: number) {
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

/**
 * Palmas de estádio. `rhythm` vazio: aplauso livre (cada um no seu ritmo).
 * Com ritmo: a arquibancada inteira bate junto o padrão (em batidas de
 * `beat` s), cada um um pouco adiantado ou atrasado.
 */
function renderClaps(context: BaseAudioContext, seconds: number, clappers: number, seed: number, rhythm: number[] = [], beat = 0.25) {
  const frames = Math.ceil(seconds * RATE);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const random = seededRandom(seed);
  const claps = Array.from({ length: 12 }, () => clapGrain(random, 0.026, 2000 + random() * 2600, 360 + random() * 520, 0.0035 + random() * 0.005));
  const bar = rhythm.length ? (Math.max(...rhythm) + 2) * beat : 0;
  for (let clapper = 0; clapper < clappers; clapper += 1) {
    const pan = random();
    const gl = Math.cos(pan * Math.PI * 0.5);
    const gr = Math.sin(pan * Math.PI * 0.5);
    const amplitude = 0.2 + random() * 0.8;
    const lag = (random() - 0.5) * 0.05;
    const hit = (time: number, level: number) => {
      const clap = claps[Math.floor(random() * claps.length)];
      const start = Math.floor(time * RATE);
      if (start < 0 || start >= frames) return;
      const end = Math.min(clap.length, frames - start);
      for (let index = 0; index < end; index += 1) {
        left[start + index] += clap[index] * level * gl;
        right[start + index] += clap[index] * level * gr;
      }
    };
    if (rhythm.length) {
      for (let from = 0; from < seconds; from += bar) {
        for (const step of rhythm) hit(from + step * beat + lag + (random() - 0.5) * 0.018, amplitude * (0.85 + random() * 0.3));
      }
    } else {
      const period = 1 / (4.2 * (0.8 + random() * 0.45));
      const stop = seconds - 1.4 * (0.1 + random() * 0.9);
      for (let time = random() * 0.3; time < stop; time += period * (0.86 + random() * 0.28)) hit(time, Math.min(1, time / 0.35) * amplitude * (0.8 + random() * 0.4));
    }
  }
  return stereo(context, left, right);
}

function renderNoise(context: BaseAudioContext, seconds: number) {
  const frames = Math.ceil(seconds * context.sampleRate);
  const buffer = context.createBuffer(1, frames, context.sampleRate);
  const channel = buffer.getChannelData(0);
  const random = seededRandom(5309);
  for (let index = 0; index < frames; index += 1) channel[index] = random() * 2 - 1;
  return buffer;
}

// -------------------------------------------------------------- notas

const NOTE = (semitonesFromA4: number) => 440 * 2 ** (semitonesFromA4 / 12);
/** Ré maior: Ré, Lá, Si menor, Sol (I, V, vi, IV): o tema simples de piano. */
const PROGRESSION: number[][] = [
  [-7, -3, 0, 5],
  [0, 4, 7, 12],
  [2, 5, 9, 14],
  [-2, 2, 5, 10],
];
/** Coro da arquibancada ("ôôô"): Ré maior aberto, grave. */
const CHOIR = [NOTE(-19), NOTE(-12), NOTE(-7), NOTE(-3), NOTE(0)];

export class FarewellAudio {
  private readonly context: AudioContext | null;
  private readonly cues: Cue[] = [];
  private readonly voices = new Set<Voice>();
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly builders = new Map<string, () => AudioBuffer>();
  private output: GainNode | null = null;
  private mix: GainNode | null = null;
  private crowd: { gain: GainNode; source: AudioBufferSourceNode; level: number } | null = null;
  private lastTime = -1;
  private muted: boolean;
  private disposed = false;
  private warmTimer = 0;

  constructor(private readonly timeline: FarewellTimeline, options: { muted: boolean }) {
    this.context = farewellContext();
    this.muted = options.muted;
    if (!this.context) return;
    liveInstances += 1;
    const context = this.context;
    const output = context.createGain();
    output.gain.value = this.muted ? 0 : 0.9;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -15;
    compressor.ratio.value = 3.2;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.3;
    const mix = context.createGain();
    mix.gain.value = 0.85;
    mix.connect(compressor);
    compressor.connect(output);
    output.connect(context.destination);
    this.output = output;
    this.mix = mix;
    const seed = timeline.seed;
    this.builders.set("noise", () => renderNoise(context, 3));
    this.builders.set("applause", () => renderClaps(context, 7, 120, seed + 17));
    // "Pá, pá, pá-pá-pá": o ritmo de palmas que a arquibancada puxa (em colcheias).
    this.builders.set("chant", () => renderClaps(context, 6.4, 90, seed + 29, [0, 2, 4, 5, 6], 0.2));
    this.buildCues();
    this.warm();
  }

  update(time: number, jumped = false) {
    const context = this.context;
    if (!context || this.disposed) return;
    const previous = this.lastTime;
    this.lastTime = time;
    if (context.state !== "running") return;
    this.ensureCrowd(context);
    this.updateCrowd(context, time);
    for (const voice of this.voices) if (voice.end < context.currentTime) this.voices.delete(voice);
    if (jumped || previous < 0 || time < previous || time - previous > 0.5) {
      this.stopVoices(0.12);
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
    this.stopVoices(0.08);
    if (this.crowd) {
      this.crowd.gain.gain.setTargetAtTime(0, context.currentTime, 0.05);
      try {
        this.crowd.source.stop(context.currentTime + 0.3);
      } catch {
        // Já parado.
      }
    }
    const output = this.output;
    window.setTimeout(() => output?.disconnect(), 360);
    liveInstances = Math.max(0, liveInstances - 1);
    window.setTimeout(() => {
      if (liveInstances === 0 && context.state === "running") void context.suspend().catch(() => undefined);
    }, 500);
  }

  // ------------------------------------------------------------ roteiro

  private buildCues() {
    const duration = this.timeline.duration;
    const add = (at: number, length: number, sustained: boolean, play: (offset: number) => Voice | null) => this.cues.push({ at, length, sustained, play });
    // Abertura: o tema de piano entra com a imagem do estádio.
    add(0.15, 9.6, true, (offset) => this.theme(offset, 0.11, 1.2));
    // Ele aparece no túnel: o aplauso nasce.
    add(M.walkStart, 7, true, (offset) => this.playBuffer("applause", offset, 0.34));
    // Mão no peito: pancada, coro e as palmas no ritmo da arquibancada.
    add(M.roar, 3, false, () => this.boom(0.6));
    add(M.roar, 6.2, true, (offset) => this.choir(offset, 6.2, 0.075));
    add(M.roar + 0.4, 6.4, true, (offset) => this.playBuffer("chant", offset, 0.38));
    add(M.kiss + 0.3, 7, true, (offset) => this.playBuffer("applause", offset + 0.4, 0.3));
    // "Obrigado": o estádio inteiro, o coro mais alto e o tema de volta, cheio.
    add(M.sky, 3, false, () => this.boom(0.7));
    add(M.sky, 7, true, (offset) => this.choir(offset, 7, 0.1));
    add(M.sky + 0.1, 7, true, (offset) => this.playBuffer("applause", offset, 0.42));
    add(M.title, 6, true, (offset) => this.theme(offset, 0.13, 1.5));
    add(duration + 0.3, 6.4, true, (offset) => this.playBuffer("chant", offset, 0.2));
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

  /** Ronco do estádio (ruído filtrado em laço): segue o nível da torcida do roteiro. */
  private ensureCrowd(context: AudioContext) {
    if (this.crowd || !this.mix) return;
    const noise = this.buffer("noise");
    if (!noise) return;
    const source = context.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const band = context.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 540;
    band.Q.value = 0.45;
    const air = context.createBiquadFilter();
    air.type = "lowpass";
    air.frequency.value = 2600;
    const gain = context.createGain();
    gain.gain.value = 0;
    source.connect(band);
    band.connect(air);
    air.connect(gain);
    gain.connect(this.mix);
    source.start();
    this.crowd = { gain, source, level: 0 };
  }

  private updateCrowd(context: AudioContext, time: number) {
    if (!this.crowd) return;
    const level = 0.05 + 0.2 * crowdLevel(time);
    if (Math.abs(level - this.crowd.level) < 0.003) return;
    this.crowd.level = level;
    this.crowd.gain.gain.setTargetAtTime(level, context.currentTime, 0.35);
  }

  // ------------------------------------------------------------- vozes

  private start(cue: Cue, offset: number) {
    try {
      const voice = cue.play(Math.max(0, offset));
      if (voice) this.voices.add(voice);
    } catch {
      // Um som que falha não pode derrubar a despedida.
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

  private playBuffer(name: string, offset: number, level: number): Voice | null {
    const context = this.context;
    const buffer = this.buffer(name);
    if (!context || !buffer || !this.mix || offset >= buffer.duration) return null;
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + (offset > 0.05 ? 0.2 : 0.06));
    source.connect(gain);
    gain.connect(this.mix);
    source.start(now, offset);
    return this.voice([source], gain, now + buffer.duration - offset);
  }

  /** Pancada grave (bumbo de cinema). */
  private boom(level: number): Voice | null {
    const context = this.context;
    if (!context || !this.mix) return null;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(88, now);
    oscillator.frequency.exponentialRampToValueAtTime(36, now + 0.55);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    oscillator.connect(gain);
    gain.connect(this.mix);
    oscillator.start(now);
    oscillator.stop(now + 1.3);
    return this.voice([oscillator], gain, now + 1.3);
  }

  /**
   * Tema de piano: arpejo de Ré, Lá, Si menor e Sol (uma nota a cada `step`/4 s),
   * notas de seno com harmônico e decaimento de corda. A partir de `offset`.
   */
  private theme(offset: number, level: number, step: number): Voice | null {
    const context = this.context;
    if (!context || !this.mix) return null;
    const now = context.currentTime;
    const bus = context.createGain();
    bus.gain.value = level;
    const tone = context.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 3200;
    bus.connect(tone);
    tone.connect(this.mix);
    const sources: OscillatorNode[] = [];
    const noteLength = step / 4;
    const total = PROGRESSION.length * step * 2;
    for (let index = 0; index < PROGRESSION.length * 8; index += 1) {
      const at = index * noteLength - offset;
      if (at < -0.05) continue;
      const chord = PROGRESSION[Math.floor(index / 8) % PROGRESSION.length];
      const semitone = chord[index % 4] + (index % 8 >= 4 ? 0 : -12) + 12;
      const frequency = NOTE(semitone - 12);
      const start = now + Math.max(0, at);
      for (const [ratio, weight] of [[1, 1], [2, 0.32], [3, 0.08]] as const) {
        const oscillator = context.createOscillator();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency * ratio;
        const env = context.createGain();
        env.gain.setValueAtTime(0.0001, start);
        env.gain.exponentialRampToValueAtTime(0.22 * weight, start + 0.012);
        env.gain.exponentialRampToValueAtTime(0.0001, start + 1.8 / ratio);
        oscillator.connect(env);
        env.connect(bus);
        oscillator.start(start);
        oscillator.stop(start + 1.9);
        sources.push(oscillator);
      }
    }
    if (!sources.length) return null;
    return this.voice(sources, bus, now + Math.max(0.1, total - offset) + 1.9);
  }

  /** Coro da arquibancada: serras desafinadas passando por dois formantes de "ô". */
  private choir(offset: number, length: number, level: number): Voice | null {
    const context = this.context;
    if (!context || !this.mix || offset >= length - 0.2) return null;
    const now = context.currentTime;
    const remaining = length - offset;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + (offset > 0.1 ? 0.3 : 1.1));
    gain.gain.setTargetAtTime(0.0001, now + Math.max(0.4, remaining - 1.4), 0.45);
    const formants = [
      { frequency: 480, q: 4, weight: 1 },
      { frequency: 860, q: 5, weight: 0.55 },
    ].map(({ frequency, q, weight }) => {
      const band = context.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = frequency;
      band.Q.value = q;
      const amount = context.createGain();
      amount.gain.value = weight;
      band.connect(amount);
      amount.connect(gain);
      return band;
    });
    gain.connect(this.mix);
    const sources: OscillatorNode[] = [];
    for (const note of CHOIR) {
      for (const detune of [-14, -5, 6, 15]) {
        const oscillator = context.createOscillator();
        oscillator.type = "sawtooth";
        oscillator.frequency.value = note;
        oscillator.detune.value = detune;
        const voiceGain = context.createGain();
        voiceGain.gain.value = 0.05;
        oscillator.connect(voiceGain);
        for (const band of formants) voiceGain.connect(band);
        oscillator.start(now);
        oscillator.stop(now + remaining + 0.6);
        sources.push(oscillator);
      }
    }
    return this.voice(sources, gain, now + remaining + 0.6);
  }
}
