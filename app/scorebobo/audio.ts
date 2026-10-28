// Som do Scorebobo, todo sintetizado no WebAudio: nenhum arquivo, nem um byte
// a mais no export estático.
//
// O estádio tem três camadas: a cama da torcida (um buffer de vozes geradas,
// em loop), os cantos que crescem de tempos em tempos e as reações (ooh,
// lamento, explosão do gol). Por cima, os sons de jogo vêm dos `SimEvent`s.
// Com o tempo congelado a torcida fica abafada e lenta — o "tempo parado" se
// ouve antes de se ver.
//
// O contexto só nasce num gesto do usuário (política de autoplay) e todo o
// módulo vira no-op sem WebAudio.

import type { GameState, Phase, SimEvent } from "./types";

// ------------------------------------------------------------ contexto

type Graph = {
  context: AudioContext;
  /** Volume final (o mudo mexe aqui). */
  output: GainNode;
  /** Efeitos de jogo e interface, secos. */
  sfx: GainNode;
  /** Torcida e estádio: passam pelo filtro do "tempo congelado". */
  crowd: GainNode;
  crowdFilter: BiquadFilterNode;
  /** Envio para o reverb do estádio. */
  verb: GainNode;
  noise: AudioBuffer;
};

const OUTPUT_LEVEL = 0.9;
let graph: Graph | null = null;
let muted = false;

function createGraph(): Graph | null {
  if (typeof window === "undefined") return null;
  if (graph && graph.context.state !== "closed") return graph;
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    const context = new Ctor({ latencyHint: "interactive" });
    const output = context.createGain();
    output.gain.value = muted ? 0 : OUTPUT_LEVEL;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 10;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.22;
    compressor.connect(output);
    output.connect(context.destination);

    const sfx = context.createGain();
    sfx.gain.value = 0.85;
    sfx.connect(compressor);

    const crowdFilter = context.createBiquadFilter();
    crowdFilter.type = "lowpass";
    crowdFilter.frequency.value = 9000;
    crowdFilter.Q.value = 0.5;
    const crowd = context.createGain();
    crowd.gain.value = 0.9;
    crowd.connect(crowdFilter);
    crowdFilter.connect(compressor);

    // Estádio é um lugar grande e aberto: reverb longo, escuro e baixo.
    const convolver = context.createConvolver();
    convolver.buffer = impulseResponse(context, 2.6);
    const verbReturn = context.createGain();
    verbReturn.gain.value = 0.32;
    const verb = context.createGain();
    verb.connect(convolver);
    convolver.connect(verbReturn);
    verbReturn.connect(crowdFilter);

    graph = { context, output, sfx, crowd, crowdFilter, verb, noise: whiteNoise(context, 2) };
  } catch {
    graph = null;
  }
  return graph;
}

/** Chame dentro de um clique/toque: Safari e Chrome só liberam o som num gesto. */
export function primeScoreboboAudio() {
  const ready = createGraph();
  if (ready && ready.context.state === "suspended") void ready.context.resume().catch(() => undefined);
}

export function setScoreboboMuted(value: boolean) {
  muted = value;
  if (!graph) return;
  graph.output.gain.setTargetAtTime(value ? 0 : OUTPUT_LEVEL, graph.context.currentTime, 0.05);
}

/** Só toca com o contexto rodando: som atrasado (depois de destravar) soaria errado. */
function live(): Graph | null {
  if (!graph || muted || graph.context.state !== "running") return null;
  return graph;
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

function whiteNoise(context: BaseAudioContext, seconds: number) {
  const length = Math.ceil(seconds * context.sampleRate);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  const random = seededRandom(91);
  for (let index = 0; index < length; index += 1) data[index] = random() * 2 - 1;
  return buffer;
}

function impulseResponse(context: BaseAudioContext, seconds: number) {
  const rate = context.sampleRate;
  const length = Math.ceil(seconds * rate);
  const buffer = context.createBuffer(2, length, rate);
  const random = seededRandom(7);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = buffer.getChannelData(channel);
    let low = 0;
    for (let index = 0; index < length; index += 1) {
      const t = index / rate;
      // Primeiras reflexões das arquibancadas, depois a cauda que escurece.
      const early = t < 0.09 && random() < 0.004 ? 1.6 : 0;
      low += (random() * 2 - 1 - low) * (0.5 - 0.42 * Math.min(1, t / seconds));
      data[index] = (low + early * (random() - 0.5)) * Math.pow(1 - t / seconds, 2.4);
    }
  }
  return buffer;
}

/** Coeficientes de um passa-faixa (RBJ), para gerar vozes no buffer. */
function bandpass(frequency: number, q: number, rate: number) {
  const w = (2 * Math.PI * frequency) / rate;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  return { b0: alpha / a0, b2: -alpha / a0, a1: (-2 * Math.cos(w)) / a0, a2: (1 - alpha) / a0 };
}

const CROWD_RATE = 22050;
const BED_SECONDS = 7;
const BED_SEED = 20261;
const BED_LENGTH = Math.ceil(BED_SECONDS * CROWD_RATE);
/** Amostras por pedaço da cama (~0,7 ms no desktop): a fatia ociosa para entre um e outro. */
const BED_CHUNK = 16384;
/** Os dois canais da cama, prontos para `copyToChannel`. */
type BedChannels = [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>];

/**
 * A cama da torcida: dezenas de "vozes" (ruído num formante, picotado em
 * sílabas) mais o rumor grave do estádio. Gerada uma vez, em loop sem emenda.
 *
 * Gerador: devolve a vez a cada pedaço, para caber no tempo ocioso do menu. Os
 * laços, o estado dos filtros e a ordem dos sorteios são os do cálculo de uma
 * vez só, então as amostras saem idênticas.
 */
function* crowdBedSteps(out: BedChannels, seed: number): Generator<void, void, void> {
  const length = BED_LENGTH;
  const fade = Math.ceil(0.6 * CROWD_RATE);
  const total = length + fade;
  const random = seededRandom(seed);
  for (let channel = 0; channel < 2; channel += 1) {
    const mix = new Float32Array(total);
    for (let voice = 0; voice < 14; voice += 1) {
      const { b0, b2, a1, a2 } = bandpass(320 + random() * 1200, 2.2 + random() * 2, CROWD_RATE);
      const level = 0.35 + random() * 0.65;
      let x1 = 0;
      let x2 = 0;
      let y1 = 0;
      let y2 = 0;
      let envelope = 0;
      let target = 0;
      let left = 0;
      for (let chunk = 0; chunk < total; chunk += BED_CHUNK) {
        const end = Math.min(total, chunk + BED_CHUNK);
        for (let index = chunk; index < end; index += 1) {
          if (left <= 0) {
            // Sílaba: 0,1–0,4 s, às vezes silêncio (a voz respira).
            left = Math.ceil((0.1 + random() * 0.3) * CROWD_RATE);
            target = random() < 0.3 ? 0 : 0.3 + random() * 0.7;
          }
          left -= 1;
          envelope += (target - envelope) * 0.0035;
          const x0 = random() * 2 - 1;
          const y0 = b0 * x0 + b2 * x2 - a1 * y1 - a2 * y2;
          x2 = x1;
          x1 = x0;
          y2 = y1;
          y1 = y0;
          mix[index] += y0 * envelope * level;
        }
        yield;
      }
    }
    // Rumor grave: muita gente longe, sem sílaba nenhuma.
    let low = 0;
    let lower = 0;
    for (let chunk = 0; chunk < total; chunk += BED_CHUNK) {
      const end = Math.min(total, chunk + BED_CHUNK);
      for (let index = chunk; index < end; index += 1) {
        low += (random() * 2 - 1 - low) * 0.09;
        lower += (low - lower) * 0.2;
        mix[index] += lower * 1.6;
      }
      yield;
    }
    const data = out[channel];
    let peak = 0;
    for (let chunk = 0; chunk < length; chunk += BED_CHUNK) {
      const end = Math.min(length, chunk + BED_CHUNK);
      for (let index = chunk; index < end; index += 1) {
        let value = mix[index];
        if (index < fade) {
          const k = index / fade;
          value = value * k + mix[length + index] * (1 - k);
        }
        data[index] = value;
        peak = Math.max(peak, Math.abs(value));
      }
      yield;
    }
    const gain = peak > 0 ? 0.8 / peak : 1;
    for (let index = 0; index < length; index += 1) data[index] *= gain;
    yield;
  }
}

/** As amostras prontas da cama (valem para qualquer contexto) e o cálculo em andamento. */
let bedSamples: BedChannels | null = null;
let bedJob: { out: BedChannels; steps: Generator<void, void, void> } | null = null;
let bedWarming = false;

/** Avança a cama até `deadline` (relógio do `performance.now`). true quando ficou pronta. */
function advanceBed(deadline: number): boolean {
  if (bedSamples) return true;
  if (!bedJob) {
    const out: BedChannels = [new Float32Array(BED_LENGTH), new Float32Array(BED_LENGTH)];
    bedJob = { out, steps: crowdBedSteps(out, BED_SEED) };
  }
  do {
    if (bedJob.steps.next().done) {
      bedSamples = bedJob.out;
      bedJob = null;
      return true;
    }
  } while (performance.now() < deadline);
  return false;
}

/** O buffer da cama neste contexto: termina na hora o que o tempo ocioso não fez e só copia. */
function crowdBedBuffer(context: BaseAudioContext) {
  advanceBed(Infinity);
  const samples = bedSamples!;
  const buffer = context.createBuffer(2, BED_LENGTH, CROWD_RATE);
  buffer.copyToChannel(samples[0], 0);
  buffer.copyToChannel(samples[1], 1);
  return buffer;
}

/**
 * Gera a cama da torcida em fatias de ~8 ms no tempo ocioso (chame com o menu
 * aberto): a primeira fase abre sem os ~200 ms de cálculo no meio da montagem.
 */
export function warmScoreboboAudio() {
  if (typeof window === "undefined" || bedSamples || bedWarming) return;
  if (!(window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)) return;
  bedWarming = true;
  const idle = typeof window.requestIdleCallback === "function";
  const slice = (deadline?: IdleDeadline) => {
    const budget = deadline ? Math.max(4, Math.min(10, deadline.timeRemaining())) : 8;
    if (advanceBed(performance.now() + budget)) {
      bedWarming = false;
      return;
    }
    if (idle) window.requestIdleCallback(slice, { timeout: 1000 });
    else window.setTimeout(slice, 30);
  };
  if (idle) window.requestIdleCallback(slice, { timeout: 1000 });
  else window.setTimeout(slice, 30);
}

// ------------------------------------------------------------ átomos

type ToneOptions = {
  frequency: number;
  end?: number;
  /** Quando a glissada termina (padrão: a duração toda). */
  glide?: number;
  duration: number;
  type?: OscillatorType;
  gain: number;
  attack?: number;
  delay?: number;
  destination?: AudioNode;
  detune?: number;
};

function tone(audio: Graph, options: ToneOptions) {
  const { context } = audio;
  const start = context.currentTime + (options.delay ?? 0);
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = options.type ?? "sine";
  oscillator.frequency.setValueAtTime(options.frequency, start);
  if (options.detune) oscillator.detune.value = options.detune;
  if (options.end) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, options.end), start + (options.glide ?? options.duration));
  const attack = options.attack ?? 0.006;
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(options.gain, start + attack);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);
  oscillator.connect(envelope);
  envelope.connect(options.destination ?? audio.sfx);
  oscillator.start(start);
  oscillator.stop(start + options.duration + 0.05);
}

type NoiseOptions = {
  duration: number;
  gain: number;
  type: BiquadFilterType;
  frequency: number;
  end?: number;
  q?: number;
  attack?: number;
  delay?: number;
  destination?: AudioNode;
  rate?: number;
};

function noise(audio: Graph, options: NoiseOptions) {
  const { context } = audio;
  const start = context.currentTime + (options.delay ?? 0);
  const source = context.createBufferSource();
  source.buffer = audio.noise;
  source.playbackRate.value = options.rate ?? 1;
  // Cada estalo começa num ponto diferente do ruído: dois chutes nunca soam iguais.
  const offset = Math.random() * 1.5;
  const filter = context.createBiquadFilter();
  filter.type = options.type;
  filter.frequency.setValueAtTime(options.frequency, start);
  if (options.end) filter.frequency.exponentialRampToValueAtTime(options.end, start + options.duration);
  filter.Q.value = options.q ?? 0.8;
  const envelope = context.createGain();
  const attack = options.attack ?? 0.003;
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(options.gain, start + attack);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(options.destination ?? audio.sfx);
  source.start(start, offset, options.duration + 0.05);
  return envelope;
}

/** Envia uma cópia para o reverb também (apito, trave e buzina ecoam no estádio). */
function wet(audio: Graph, amount: number): AudioNode {
  const split = audio.context.createGain();
  const send = audio.context.createGain();
  send.gain.value = amount;
  split.connect(audio.sfx);
  split.connect(send);
  send.connect(audio.verb);
  return split;
}

type VowelOptions = {
  voices: number;
  pitch: number;
  /** Curva de afinação relativa: [início, pico, fim]. */
  contour: [number, number, number];
  formants: [number, number];
  /** Quanto as vozes se espalham em afinação (0,45 = "oooh" solto; 0,035 = canto afinado). */
  spread?: number;
  attack: number;
  peakAt: number;
  duration: number;
  gain: number;
  delay?: number;
  /** Início já marcado no relógio do contexto (sílaba de canto montada perto da hora); vale mais que `delay`. */
  at?: number;
};

/** Sorteios de uma `crowdVowel`: três por voz (afinação, atraso, desafinação) e um do sopro. */
const vowelDraws = (voices: number) => voices * 3 + 1;

/**
 * Muitas vozes num vogal: um "oooh", um lamento, um "uuuh" do canto. Serras
 * desafinadas entre si passando por dois formantes, mais um pouco de sopro.
 * `random` troca o `Math.random` por sorteios feitos antes (mesma ordem).
 */
function crowdVowel(audio: Graph, options: VowelOptions, random: () => number = Math.random) {
  const { context } = audio;
  const start = options.at ?? context.currentTime + (options.delay ?? 0);
  const end = start + options.duration;
  const bus = context.createGain();
  bus.gain.setValueAtTime(0.0001, start);
  bus.gain.exponentialRampToValueAtTime(options.gain, start + options.attack);
  bus.gain.setTargetAtTime(options.gain * 0.75, start + options.peakAt, options.duration * 0.12);
  bus.gain.exponentialRampToValueAtTime(0.0001, end);
  const formantA = context.createBiquadFilter();
  formantA.type = "bandpass";
  formantA.frequency.value = options.formants[0];
  formantA.Q.value = 3.2;
  const formantB = context.createBiquadFilter();
  formantB.type = "bandpass";
  formantB.frequency.value = options.formants[1];
  formantB.Q.value = 4;
  const voiceMix = context.createGain();
  voiceMix.gain.value = 1 / Math.sqrt(options.voices);
  voiceMix.connect(formantA);
  voiceMix.connect(formantB);
  const formantMix = context.createGain();
  formantMix.gain.value = 2.4;
  formantA.connect(formantMix);
  formantB.connect(formantMix);
  formantMix.connect(bus);
  bus.connect(audio.crowd);
  const send = context.createGain();
  send.gain.value = 0.55;
  bus.connect(send);
  send.connect(audio.verb);
  for (let index = 0; index < options.voices; index += 1) {
    const oscillator = context.createOscillator();
    oscillator.type = "sawtooth";
    const spread = options.spread ?? 0.45;
    // No canto, um terço canta uma oitava acima (a arquibancada não é só de barítonos).
    const octave = spread < 0.1 && index % 3 === 2 ? 2 : 1;
    const base = options.pitch * octave * (1 + (random() - 0.5) * spread);
    const lag = random() * 0.12;
    oscillator.frequency.setValueAtTime(base * options.contour[0], start + lag);
    oscillator.frequency.exponentialRampToValueAtTime(base * options.contour[1], start + options.peakAt + lag);
    oscillator.frequency.exponentialRampToValueAtTime(base * options.contour[2], end);
    oscillator.detune.value = (random() - 0.5) * 40;
    oscillator.connect(voiceMix);
    oscillator.start(start + lag);
    oscillator.stop(end + 0.05);
  }
  // Sopro: a parte de ruído de quem grita.
  const breath = context.createBufferSource();
  breath.buffer = audio.noise;
  breath.loop = true;
  const breathGain = context.createGain();
  breathGain.gain.value = 0.25;
  breath.connect(breathGain);
  breathGain.connect(formantA);
  breathGain.connect(formantB);
  breath.start(start, random());
  breath.stop(end + 0.05);
}

// ------------------------------------------------------------ interface

export type UiSound = "click" | "select" | "back" | "error" | "pause" | "unlock" | "toggle";

export function playUiSound(kind: UiSound) {
  const audio = live();
  if (!audio) return;
  switch (kind) {
    case "click":
      tone(audio, { frequency: 1500, end: 900, duration: 0.05, gain: 0.08 });
      break;
    case "toggle":
      tone(audio, { frequency: 900, end: 1300, duration: 0.07, gain: 0.07, type: "triangle" });
      break;
    case "select":
      tone(audio, { frequency: 660, duration: 0.09, gain: 0.1, type: "triangle" });
      tone(audio, { frequency: 990, duration: 0.16, gain: 0.1, type: "triangle", delay: 0.07 });
      noise(audio, { duration: 0.32, gain: 0.05, type: "bandpass", frequency: 1800, end: 7000, q: 0.7, attack: 0.12 });
      break;
    case "back":
      tone(audio, { frequency: 760, end: 420, duration: 0.1, gain: 0.08, type: "triangle" });
      break;
    case "pause":
      tone(audio, { frequency: 520, duration: 0.08, gain: 0.08, type: "triangle" });
      tone(audio, { frequency: 390, duration: 0.12, gain: 0.08, type: "triangle", delay: 0.06 });
      break;
    case "error":
      tone(audio, { frequency: 170, end: 120, duration: 0.14, gain: 0.09, type: "square" });
      break;
    case "unlock":
      [523, 659, 784, 1046].forEach((frequency, index) => tone(audio, { frequency, duration: 0.3, gain: 0.08, type: "triangle", delay: index * 0.07 }));
      break;
  }
}

/** Estrela acesa no resultado: um sino que sobe a cada estrela. */
export function playStarSound(index: number) {
  const audio = live();
  if (!audio) return;
  const base = [784, 988, 1175][Math.max(0, Math.min(2, index))];
  const bell = wet(audio, 0.5);
  tone(audio, { frequency: base, duration: 1.1, gain: 0.16, destination: bell });
  tone(audio, { frequency: base * 2.01, duration: 0.7, gain: 0.06, destination: bell });
  tone(audio, { frequency: base * 3.02, duration: 0.4, gain: 0.03, destination: bell });
  noise(audio, { duration: 0.18, gain: 0.05, type: "highpass", frequency: 5000, attack: 0.002 });
  if (index === 2) {
    // A terceira estrela ganha o arpejo de festa.
    [1318, 1568, 2093].forEach((frequency, step) => tone(audio, { frequency, duration: 0.5, gain: 0.05, type: "triangle", delay: 0.12 + step * 0.06, destination: bell }));
  }
}

// ------------------------------------------------------------ estádio

/** Cantos de arquibancada: notas (MIDI) e durações (s). "Ô-lê, ô-lê, ô-lê, ô-lá". */
const CHANTS: Array<Array<[number, number]>> = [
  [[57, 0.32], [54, 0.5], [57, 0.32], [54, 0.5], [57, 0.32], [54, 0.5], [57, 0.32], [59, 0.95]],
  [[52, 0.28], [52, 0.28], [55, 0.28], [57, 0.62], [55, 0.28], [52, 0.85]],
  [[55, 0.42], [55, 0.42], [57, 0.42], [59, 0.9], [57, 0.42], [55, 1.0]],
];

const midi = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

/**
 * Uma sílaba de canto monta uns ~15 nós de áudio: o canto inteiro de uma vez
 * pesava um quadro. Cada sílaba nasce só este tanto (s) antes da hora dela:
 * folga maior que um engasgo de quadro (gol com shader compilando no celular),
 * para nenhuma entrar atrasada e sem o ataque; uma sílaba dura 0,28 a 1 s, então
 * o canto ainda se espalha por vários quadros.
 */
const CHANT_LOOKAHEAD = 1;
/** Drone calado (ganho já em 1e-4) por este tempo (s): solta os osciladores. */
const DRONE_RELEASE = 1;

type Syllable = { options: VowelOptions; draws: number[] };

let bedCache: { context: BaseAudioContext; buffer: AudioBuffer } | null = null;

export class ScoreboboAudio {
  private bed: AudioBufferSourceNode | null = null;
  private bedGain: GainNode | null = null;
  private bedTone: BiquadFilterNode | null = null;
  private drone: { gain: GainNode; filter: BiquadFilterNode; oscillators: OscillatorNode[] } | null = null;
  private droneLevel = 0;
  /** Desde quando (relógio do contexto) o drone está calado; -1 tocando. */
  private droneQuietSince = -1;
  /** Sílabas do canto em andamento que ainda não montaram (em ordem de início). */
  private syllables: Syllable[] = [];
  private phase: Phase | null = null;
  /** 0..1: a torcida esquenta com chute, área e gol e esfria sozinha. */
  private excitement = 0.25;
  private chantTimer = 7;
  private chantIndex = 0;
  private disposed = false;
  private suspendTimer = 0;
  private readonly targets = new Map<AudioParam, number>();

  /** Monta o estádio. Chame depois de `primeScoreboboAudio` (dentro de um gesto). */
  enter() {
    const audio = createGraph();
    if (!audio || this.bed || this.disposed) return;
    const { context } = audio;
    const tone = context.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2600;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.32, context.currentTime + 1.6);
    const source = context.createBufferSource();
    // Um buffer por contexto, das amostras que o menu já gerou no tempo ocioso; as outras fases reaproveitam.
    if (!bedCache || bedCache.context !== context) bedCache = { context, buffer: crowdBedBuffer(context) };
    source.buffer = bedCache.buffer;
    source.loop = true;
    source.connect(tone);
    tone.connect(gain);
    gain.connect(audio.crowd);
    source.start(context.currentTime, Math.random() * 6);
    this.bed = source;
    this.bedGain = gain;
    this.bedTone = tone;
  }

  /** Por quadro: torcida, cantos, tensão do traço e câmera lenta. */
  update(state: GameState, dt: number) {
    const audio = graph;
    if (!audio || this.disposed || !this.bedGain || !this.bedTone || !this.bed) return;
    const { context } = audio;
    const now = context.currentTime;
    this.mountSyllables(now + CHANT_LOOKAHEAD);
    if (state.phase !== this.phase) this.onPhase(state.phase);

    // A bola chegando na área levanta a torcida.
    if (state.phase === "flight") {
      const z = state.ball.pos.z;
      if (z > 36) this.excitement = Math.min(1, this.excitement + dt * 0.35 * ((z - 36) / 16));
    }
    this.excitement = Math.max(0.2, this.excitement - dt * 0.05);

    const frozen = state.phase === "aim";
    const slow = state.timeScale < 0.75 && (state.phase === "outcome" || state.phase === "flight");
    const level = (frozen ? 0.18 : 0.26) + this.excitement * 0.22;
    this.glide(this.bedGain.gain, level, now, 0.25);
    this.glide(this.bedTone.frequency, frozen ? 900 : 1500 + this.excitement * 2600, now, 0.2);
    // Tempo congelado e câmera lenta: o estádio inteiro abafa e afunda.
    const rate = frozen ? 0.82 : slow ? 0.62 : 1;
    this.glide(this.bed.playbackRate, rate, now, 0.18);
    this.glide(audio.crowdFilter.frequency, frozen ? 1300 : slow ? 700 : 9000, now, 0.12);

    // Cantos: de tempos em tempos a arquibancada puxa um, mais forte se animada.
    this.chantTimer -= dt;
    if (this.chantTimer <= 0 && state.phase !== "replay" && state.phase !== "done") {
      this.chant(0.5 + this.excitement * 0.5);
      this.chantTimer = 13 + Math.random() * 9;
    }

    if (this.drone) {
      const target = this.droneLevel;
      this.glide(this.drone.gain.gain, target > 0 ? 0.05 + target * 0.09 : 0.0001, now, target > 0 ? 0.08 : 0.12);
      this.glide(this.drone.filter.frequency, 160 + target * 1500, now, 0.06);
      this.glide(this.drone.oscillators[0].frequency, 55 * (1 + target * 0.12), now, 0.1);
      this.glide(this.drone.oscillators[1].frequency, 55.6 * (1 + target * 0.12), now, 0.1);
      // Calado há 1 s (8 constantes de tempo: inaudível): solta tudo; o próximo traço monta de novo.
      if (target > 0) this.droneQuietSince = -1;
      else if (this.droneQuietSince < 0) this.droneQuietSince = now;
      else if (now - this.droneQuietSince > DRONE_RELEASE) this.releaseDrone(now);
    }
  }

  /** Para e desliga o drone (e esquece os alvos dele no `glide`). */
  private releaseDrone(now: number) {
    const drone = this.drone;
    if (!drone) return;
    this.drone = null;
    this.droneQuietSince = -1;
    for (const oscillator of drone.oscillators) {
      oscillator.stop(now);
      this.targets.delete(oscillator.frequency);
    }
    this.targets.delete(drone.gain.gain);
    this.targets.delete(drone.filter.frequency);
    drone.gain.disconnect();
  }

  /** Monta as sílabas do canto que começam até `until` (relógio do contexto). */
  private mountSyllables(until: number) {
    const audio = graph;
    if (!audio || !this.syllables.length) return;
    const now = audio.context.currentTime;
    while (this.syllables.length && (this.syllables[0].options.at ?? 0) <= until) {
      const { options, draws } = this.syllables.shift()!;
      // Laço parado sem pausa (fase que falhou): sílaba que já teria acabado não toca atrasada.
      if ((options.at ?? 0) + options.duration <= now) continue;
      let next = 0;
      crowdVowel(audio, options, () => draws[next++]);
    }
  }

  /**
   * Só agenda a curva quando o alvo muda de verdade: um setTargetAtTime por
   * quadro enche a linha do tempo do parâmetro à toa.
   */
  private glide(param: AudioParam, value: number, now: number, tau: number) {
    const last = this.targets.get(param);
    if (last !== undefined && Math.abs(last - value) <= Math.max(1e-4, Math.abs(value) * 0.01)) return;
    this.targets.set(param, value);
    param.setTargetAtTime(value, now, tau);
  }

  private onPhase(phase: Phase) {
    const previous = this.phase;
    this.phase = phase;
    const audio = live();
    if (!audio) return;
    if (phase === "aim" && previous && previous !== "aim") {
      // O tempo congela: um "vuum" que desce, como o mundo freando.
      noise(audio, { duration: 0.55, gain: 0.07, type: "bandpass", frequency: 3200, end: 380, q: 1.4, attack: 0.04 });
      tone(audio, { frequency: 240, end: 70, duration: 0.5, gain: 0.06, type: "triangle" });
    }
    if (phase === "flight" && previous === "aim") {
      noise(audio, { duration: 0.35, gain: 0.05, type: "bandpass", frequency: 500, end: 2600, q: 1.2, attack: 0.05 });
    }
    if (phase === "done") this.setDrawing(null);
  }

  /** Tensão enquanto o dedo desenha: `intensity` 0..1 (tamanho do traço). null para. */
  setDrawing(intensity: number | null) {
    if (intensity === null) {
      this.droneLevel = 0;
      return;
    }
    const audio = graph;
    if (!audio) return;
    this.droneLevel = Math.max(0.02, Math.min(1, intensity));
    if (this.drone) return;
    const { context } = audio;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 200;
    filter.Q.value = 6;
    const gain = context.createGain();
    gain.gain.value = 0.0001;
    filter.connect(gain);
    gain.connect(audio.sfx);
    const oscillators = [55, 55.6, 27.5, 220].map((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index < 2 ? "sawtooth" : index === 2 ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      const level = context.createGain();
      level.gain.value = index === 3 ? 0.08 : index === 2 ? 0.7 : 0.45;
      oscillator.connect(level);
      level.connect(filter);
      oscillator.start();
      return oscillator;
    });
    this.drone = { gain, filter, oscillators };
  }

  handleEvents(events: SimEvent[]) {
    if (!events.length) return;
    const audio = live();
    if (!audio) return;
    for (const event of events) {
      switch (event.type) {
        case "whistle":
          this.whistle(audio, false);
          break;
        case "kick":
          this.kick(audio, event.power, event.kind);
          if (event.kind === "shot" || event.kind === "volley" || event.kind === "header" || event.kind === "chip") {
            this.excitement = Math.min(1, this.excitement + 0.3);
            // A arquibancada puxa o ar junto com o chute.
            crowdVowel(audio, { voices: 7, pitch: 200, contour: [0.9, 1.25, 1.3], formants: [480, 900], attack: 0.5, peakAt: 0.9, duration: 1.2, gain: 0.22 + this.excitement * 0.12 });
          }
          break;
        case "receive":
          this.touch(audio, event.aerial);
          break;
        case "control":
          tone(audio, { frequency: 1320, duration: 0.08, gain: 0.05, type: "triangle" });
          break;
        case "intercept":
          this.touch(audio, false);
          this.groan(audio, 0.7);
          break;
        case "save":
          this.glove(audio, event.caught);
          this.ooh(audio, 1);
          break;
        case "post":
          this.clang(audio, event.part);
          this.ooh(audio, 1.15);
          break;
        case "net":
          this.swish(audio);
          break;
        case "goal":
          // Anulado: apito e o estádio murchando, no lugar da explosão.
          if (event.valid === false) {
            this.whistle(audio, false);
            this.groan(audio, 1.1);
            break;
          }
          this.roar(audio, event.topCorner || event.curve > 2 || event.volley || event.distance > 22 ? 1 : 0.85);
          break;
        case "miss":
          if (event.reason === "wide" || event.reason === "over") this.ooh(audio, 0.85);
          else this.groan(audio, 0.8);
          break;
      }
    }
  }

  /** Fim de fase: três apitos, como no fim do jogo. */
  finalWhistle() {
    const audio = live();
    if (audio) this.whistle(audio, true);
  }

  setPaused(paused: boolean) {
    const audio = graph;
    if (!audio || this.disposed) return;
    window.clearTimeout(this.suspendTimer);
    if (paused) {
      // Sem quadros na pausa: o resto do canto monta já, como antes (o contexto dorme e volta do mesmo ponto).
      this.mountSyllables(Infinity);
      // Um respiro antes de dormir: o clique do botão de pausa ainda toca.
      this.suspendTimer = window.setTimeout(() => {
        if (audio.context.state === "running") void audio.context.suspend().catch(() => undefined);
      }, 160);
    } else if (audio.context.state === "suspended") {
      void audio.context.resume().catch(() => undefined);
    }
  }

  dispose() {
    if (this.disposed) return;
    // Quem sai no meio de um canto ainda ouve o fim dele, como antes.
    this.mountSyllables(Infinity);
    this.disposed = true;
    window.clearTimeout(this.suspendTimer);
    const audio = graph;
    if (!audio) return;
    const now = audio.context.currentTime;
    this.bedGain?.gain.setTargetAtTime(0.0001, now, 0.15);
    try {
      this.bed?.stop(now + 0.8);
    } catch {
      // Já parado.
    }
    if (this.drone) {
      this.drone.gain.gain.setTargetAtTime(0.0001, now, 0.05);
      for (const oscillator of this.drone.oscillators) oscillator.stop(now + 0.4);
    }
    audio.crowdFilter.frequency.setTargetAtTime(9000, now, 0.1);
    this.bed = null;
    this.drone = null;
  }

  // ------------------------------------------------------------ sons

  private kick(audio: Graph, power: number, kind: string) {
    const p = Math.max(0.15, Math.min(1, power));
    const soft = kind === "header";
    // Couro na chuteira: o grave que cai rápido mais o estalo.
    tone(audio, { frequency: soft ? 170 : 130 + p * 30, end: 42, duration: 0.16 + p * 0.06, gain: (soft ? 0.25 : 0.35) + p * 0.4, attack: 0.002 });
    noise(audio, { duration: 0.05, gain: 0.12 + p * 0.25, type: "bandpass", frequency: soft ? 900 : 1500 + p * 900, q: 0.9, attack: 0.001 });
    noise(audio, { duration: 0.02, gain: 0.08 + p * 0.12, type: "highpass", frequency: 4200, attack: 0.001 });
    if (p > 0.7 && !soft) noise(audio, { duration: 0.4, gain: 0.04 * p, type: "bandpass", frequency: 1800, end: 600, q: 2, attack: 0.03, delay: 0.02 });
  }

  private touch(audio: Graph, aerial: boolean) {
    tone(audio, { frequency: aerial ? 190 : 150, end: 60, duration: 0.1, gain: 0.22, attack: 0.002 });
    noise(audio, { duration: 0.04, gain: 0.08, type: "bandpass", frequency: 1100, attack: 0.001 });
  }

  private glove(audio: Graph, caught: boolean) {
    noise(audio, { duration: 0.07, gain: 0.5, type: "bandpass", frequency: 1700, q: 0.9, attack: 0.001 });
    tone(audio, { frequency: 110, end: 55, duration: 0.09, gain: 0.3, attack: 0.002 });
    if (caught) noise(audio, { duration: 0.18, gain: 0.18, type: "lowpass", frequency: 600, attack: 0.01, delay: 0.05 });
  }

  private clang(audio: Graph, part: "post" | "bar") {
    const base = part === "bar" ? 380 : 440;
    const ring = wet(audio, 0.7);
    // Parciais inarmônicos de um tubo de metal, cada um morrendo no seu tempo.
    [[1, 1.6, 0.3], [2.76, 1.1, 0.16], [5.4, 0.7, 0.1], [8.93, 0.4, 0.06]].forEach(([ratio, decay, gain]) => {
      tone(audio, { frequency: base * ratio, duration: decay, gain, destination: ring, attack: 0.001 });
    });
    noise(audio, { duration: 0.06, gain: 0.35, type: "highpass", frequency: 2600, attack: 0.001 });
  }

  private swish(audio: Graph) {
    noise(audio, { duration: 0.55, gain: 0.32, type: "bandpass", frequency: 6000, end: 1600, q: 0.8, attack: 0.008 });
    noise(audio, { duration: 0.3, gain: 0.2, type: "lowpass", frequency: 320, attack: 0.01 });
  }

  private whistle(audio: Graph, final: boolean) {
    const blasts: Array<[number, number]> = final ? [[0, 0.22], [0.32, 0.22], [0.64, 0.75]] : [[0, 0.16], [0.24, 0.62]];
    const ring = wet(audio, 0.45);
    for (const [at, length] of blasts) {
      const { context } = audio;
      const start = context.currentTime + at;
      const oscillator = context.createOscillator();
      oscillator.frequency.value = 2850;
      // O trinado da bolinha dentro do apito.
      const trill = context.createOscillator();
      trill.type = "square";
      trill.frequency.value = 27;
      const depth = context.createGain();
      depth.gain.value = 170;
      trill.connect(depth);
      depth.connect(oscillator.frequency);
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(0.11, start + 0.015);
      envelope.gain.setValueAtTime(0.11, start + length - 0.04);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + length);
      oscillator.connect(envelope);
      envelope.connect(ring);
      oscillator.start(start);
      trill.start(start);
      oscillator.stop(start + length + 0.05);
      trill.stop(start + length + 0.05);
      noise(audio, { duration: length, gain: 0.03, type: "bandpass", frequency: 3000, q: 2, attack: 0.01, delay: at, destination: ring });
    }
  }

  private ooh(audio: Graph, strength: number) {
    crowdVowel(audio, { voices: 9, pitch: 215, contour: [0.95, 1.18, 0.82], formants: [430, 820], attack: 0.18, peakAt: 0.45, duration: 1.9, gain: 0.34 * strength });
    this.excitement = Math.min(1, this.excitement + 0.15);
  }

  private groan(audio: Graph, strength: number) {
    crowdVowel(audio, { voices: 8, pitch: 175, contour: [1.05, 1, 0.72], formants: [650, 1080], attack: 0.25, peakAt: 0.4, duration: 1.7, gain: 0.26 * strength });
    this.excitement = Math.max(0.2, this.excitement - 0.2);
  }

  private roar(audio: Graph, strength: number) {
    this.excitement = 1;
    const { context } = audio;
    // A explosão: ruído largo que incha, segura e vai baixando por segundos.
    const start = context.currentTime;
    const roar = context.createBufferSource();
    roar.buffer = audio.noise;
    roar.loop = true;
    const body = context.createBiquadFilter();
    body.type = "bandpass";
    body.frequency.value = 1100;
    body.Q.value = 0.55;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(0.5 * strength, start + 0.18);
    envelope.gain.setTargetAtTime(0.34 * strength, start + 0.6, 0.8);
    envelope.gain.setTargetAtTime(0.0001, start + 3.2, 1.3);
    roar.connect(body);
    body.connect(envelope);
    envelope.connect(audio.crowd);
    const send = context.createGain();
    send.gain.value = 0.6;
    envelope.connect(send);
    send.connect(audio.verb);
    roar.start(start, Math.random());
    roar.stop(start + 8);
    // "GOOOOL": milhares de vozes num "ô" aberto que sobe.
    crowdVowel(audio, { voices: 12, pitch: 240, contour: [0.85, 1.12, 1.02], formants: [620, 1150], attack: 0.22, peakAt: 0.9, duration: 4.4, gain: 0.42 * strength });
    // Buzinas: três toques de ar comprimido na arquibancada.
    const horn = wet(audio, 0.5);
    [[0.45, 0.24], [0.78, 0.24], [1.1, 0.9]].forEach(([at, length]) => {
      tone(audio, { frequency: 233, duration: length, gain: 0.07, type: "sawtooth", attack: 0.03, delay: at, destination: horn });
      tone(audio, { frequency: 311, duration: length, gain: 0.05, type: "sawtooth", attack: 0.03, delay: at, destination: horn, detune: 8 });
    });
    // Rojão estourando lá longe.
    for (let index = 0; index < 5; index += 1) {
      noise(audio, { duration: 0.25, gain: 0.06, type: "lowpass", frequency: 900, attack: 0.002, delay: 1.4 + index * 0.33 + Math.random() * 0.1, destination: horn });
    }
  }

  private chant(strength: number) {
    const audio = live();
    if (!audio) return;
    const melody = CHANTS[this.chantIndex % CHANTS.length];
    this.chantIndex += 1;
    const now = audio.context.currentTime;
    let at = 0.1;
    for (const [note, length] of melody) {
      // Cada sílaba é uma onda de vozes; a torcida sempre arrasta um pouco.
      const options: VowelOptions = {
        voices: 6,
        pitch: midi(note),
        contour: [0.99, 1, 0.985],
        formants: [560, 980],
        spread: 0.035,
        attack: Math.min(0.12, length * 0.35),
        peakAt: length * 0.5,
        duration: length * 1.15,
        gain: 0.14 * strength,
        at: now + at,
      };
      // Os sorteios saem agora, na ordem de sempre; os nós só nascem perto da hora (no `update`).
      const draws = Array.from({ length: vowelDraws(options.voices) }, () => Math.random());
      this.syllables.push({ options, draws });
      at += length;
    }
    this.mountSyllables(now + CHANT_LOOKAHEAD);
  }
}
