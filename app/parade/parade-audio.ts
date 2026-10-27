// Trilha da festa do título: uma batucada de axé/samba a 128 BPM, toda
// sintetizada no WebAudio (nenhum arquivo de áudio no export estático).
//
// O som é função do relógio do roteiro, igual à imagem: a cutscene chama
// `update(tempo)` a cada quadro e um agendador com folga (look-ahead) marca as
// notas dos próximos ~0,3 s no relógio do áudio. Num salto (Pular, Rever) o que
// já estava marcado é cortado e o agendador recomeça no instante novo.
//
// A música sobe por camadas junto com os beats do roteiro: surdo e agogô na
// vista aérea, caixa, tamborim e baixo quando o trio chega, metais na multidão,
// virada de repique antes de cada parte, buzina na taça e o estouro (torcida,
// pratos e fogos) no papel picado.

import type { ParadeTimeline } from "./parade-script";

export const PARADE_BPM = 128;
const BEAT = 60 / PARADE_BPM;
const STEP = BEAT / 4;
const BAR = BEAT * 4;
/** Quanto do futuro fica marcado no relógio do áudio. */
const LOOKAHEAD = 0.3;
const MASTER_LEVEL = 0.5;

/**
 * Pulso da batida (0..1, pico no tempo forte) no instante `time` do roteiro.
 * A música é ancorada no mesmo relógio, então serve com ou sem som.
 */
export function paradeBeatPulse(time: number): number {
  if (time < 0) return 0;
  const beat = time / BEAT;
  const phase = beat - Math.floor(beat);
  // Surdo de marcação nos tempos 1 e 3 bate mais forte que o de resposta.
  const strong = Math.floor(beat) % 2 === 0 ? 1 : 0.72;
  return strong * Math.exp(-phase * 5.5);
}

// ------------------------------------------------------------ contexto

let sharedContext: AudioContext | null = null;
/** Festas tocando agora (o contexto compartilhado só dorme quando chega a zero). */
let liveParades = 0;

function paradeContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedContext && sharedContext.state !== "closed") return sharedContext;
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    sharedContext = new Ctor({ latencyHint: "playback" });
  } catch {
    sharedContext = null;
  }
  return sharedContext;
}

/**
 * Chame dentro do clique de "Assistir à festa": os navegadores só liberam o
 * som num gesto, e a cutscene ainda está baixando quando o clique acontece.
 */
export function primeParadeAudio() {
  const audio = paradeContext();
  if (audio && audio.state === "suspended") void audio.resume().catch(() => undefined);
}

/** A mesma chave do botão "Som" da partida (e da gala): quem joga sem som assiste sem som. */
const MUTE_KEY = "futbobo_player_match_muted";

export function readParadeMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function rememberParadeMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Preferência opcional: sem storage vale só nesta festa.
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

type Buffers = { noise: AudioBuffer; crowd: AudioBuffer; cheer: AudioBuffer; fireworks: AudioBuffer; shaper: Float32Array<ArrayBuffer> };

// Os buffers são do contexto compartilhado: feitos uma vez e reaproveitados em todo "Rever".
let buffersFor: { context: BaseAudioContext; buffers: Buffers } | null = null;

/** Buffers longos em 22 kHz: metade da conta, e ruído de multidão não precisa de agudo. */
const LOW_RATE = 22050;

function makeBuffers(context: BaseAudioContext): Buffers {
  if (buffersFor?.context === context) return buffersFor.buffers;
  const random = seededRandom(2026);

  // Ruído branco de 1 s: caixa, ganzá, pratos e estalos tocam trechos dele.
  const noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const white = noise.getChannelData(0);
  for (let index = 0; index < white.length; index += 1) white[index] = random() * 2 - 1;

  // Burburinho da avenida: ruído rosado com ondas lentas de volume por canal,
  // com as pontas cruzadas para o loop não estalar.
  const crowdSeconds = 4;
  const fade = Math.floor(0.5 * LOW_RATE);
  const crowdFrames = crowdSeconds * LOW_RATE;
  const crowd = context.createBuffer(2, crowdFrames, LOW_RATE);
  for (let channel = 0; channel < 2; channel += 1) {
    const raw = new Float32Array(crowdFrames + fade);
    let low = 0;
    let band = 0;
    const phases = [random() * 6.3, random() * 6.3, random() * 6.3];
    for (let index = 0; index < raw.length; index += 1) {
      const n = random() * 2 - 1;
      low += 0.18 * (n - low);
      band += 0.035 * (low - band);
      const t = index / LOW_RATE;
      const swell = 0.62 + 0.16 * Math.sin(t * 1.7 + phases[0]) + 0.12 * Math.sin(t * 4.3 + phases[1]) + 0.1 * Math.sin(t * 9.1 + phases[2]);
      raw[index] = (low - band) * swell;
    }
    const data = crowd.getChannelData(channel);
    for (let index = 0; index < crowdFrames; index += 1) data[index] = raw[index];
    for (let index = 0; index < fade; index += 1) {
      const k = index / fade;
      data[index] = raw[index] * k + raw[crowdFrames + index] * (1 - k);
    }
    normalize(data, 0.8);
  }

  // Grito da torcida no estouro: vozes de "êêê" com vibrato, subindo e caindo.
  const cheerSeconds = 3.4;
  const cheerFrames = Math.floor(cheerSeconds * LOW_RATE);
  const cheer = context.createBuffer(2, cheerFrames, LOW_RATE);
  const left = cheer.getChannelData(0);
  const right = cheer.getChannelData(1);
  for (let voice = 0; voice < 26; voice += 1) {
    const pan = random();
    const base = 190 + random() * 260;
    const rise = 1.25 + random() * 0.35;
    const start = random() * 0.35;
    const length = 1.6 + random() * 1.3;
    const formant = 0.09 + random() * 0.08;
    let phase = 0;
    let filtered = 0;
    let filtered2 = 0;
    const from = Math.floor(start * LOW_RATE);
    const to = Math.min(cheerFrames, Math.floor((start + length) * LOW_RATE));
    for (let index = from; index < to; index += 1) {
      const t = (index - from) / LOW_RATE;
      const u = t / length;
      const pitch = base * (1 + (rise - 1) * Math.min(1, u * 3)) * (1 + 0.025 * Math.sin(t * 34 + voice));
      phase += pitch / LOW_RATE;
      const saw = 2 * (phase - Math.floor(phase)) - 1;
      filtered += formant * (saw - filtered);
      filtered2 += 0.5 * (filtered - filtered2);
      const envelope = Math.min(1, t / 0.08) * Math.pow(1 - u, 1.6);
      const value = (filtered - filtered2 * 0.6 + (random() - 0.5) * 0.25) * envelope;
      left[index] += value * Math.cos(pan * 1.57);
      right[index] += value * Math.sin(pan * 1.57);
    }
  }
  normalize(left, 0.85);
  normalize(right, 0.85);

  // Fogos: estouro grave, assobio de subida e o chiado de estrelinhas caindo.
  const fireSeconds = 3.2;
  const fireFrames = Math.floor(fireSeconds * LOW_RATE);
  const fireworks = context.createBuffer(1, fireFrames, LOW_RATE);
  const fire = fireworks.getChannelData(0);
  let rumble = 0;
  for (let index = 0; index < fireFrames; index += 1) {
    const t = index / LOW_RATE;
    rumble += 0.04 * ((random() * 2 - 1) - rumble);
    const boom = t < 1.4 ? rumble * 9 * Math.exp(-t * 3.2) : 0;
    const thump = t < 0.4 ? Math.sin(2 * Math.PI * (70 - 40 * t) * t) * Math.exp(-t * 9) * 0.9 : 0;
    fire[index] = boom + thump;
  }
  for (let crackle = 0; crackle < 220; crackle += 1) {
    const at = 0.25 + Math.pow(random(), 0.7) * 2.8;
    const from = Math.floor(at * LOW_RATE);
    const amplitude = 0.25 + random() * 0.5;
    for (let index = 0; index < 90 && from + index < fireFrames; index += 1) fire[from + index] += (random() * 2 - 1) * amplitude * Math.exp(-index / 14);
  }
  normalize(fire, 0.9);

  // Curva de saturação da buzina (e do grave dos metais).
  const shaper = new Float32Array(1024);
  for (let index = 0; index < shaper.length; index += 1) {
    const x = (index / (shaper.length - 1)) * 2 - 1;
    shaper[index] = Math.tanh(x * 3.2);
  }

  const buffers = { noise, crowd, cheer, fireworks, shaper };
  buffersFor = { context, buffers };
  return buffers;
}

function normalize(data: Float32Array, peak: number) {
  let max = 0;
  for (let index = 0; index < data.length; index += 1) max = Math.max(max, Math.abs(data[index]));
  if (max <= 0) return;
  const gain = peak / max;
  for (let index = 0; index < data.length; index += 1) data[index] *= gain;
}

// ------------------------------------------------------------ arranjo

/** Graus da progressão (I–V–vi–IV em ré): baixo e acordes dos metais por compasso. */
const PROGRESSION = [
  { bass: 73.42, chord: [293.66, 369.99, 440] },
  { bass: 55, chord: [277.18, 329.63, 440] },
  { bass: 61.74, chord: [293.66, 369.99, 493.88] },
  { bass: 49, chord: [293.66, 392, 493.88] },
];

/** Agogô: sino agudo (1) e grave (0) nas semicolcheias do compasso. */
const AGOGO: Array<[number, 0 | 1]> = [[0, 1], [2, 0], [3, 1], [6, 0], [8, 1], [10, 0], [11, 1], [14, 0]];
/** Tamborim no "teleco-teco". */
const TAMBORIM = new Set([0, 3, 6, 8, 10, 13]);
/** Acento da caixa (semicolcheias). */
const CAIXA_ACCENT = [1, 0.35, 0.55, 0.4, 0.9, 0.35, 0.6, 0.75, 1, 0.35, 0.55, 0.4, 0.9, 0.4, 0.75, 0.55];
/** Baixo sincopado do axé. */
const BASS_STEPS = new Set([0, 3, 6, 8, 11, 14]);
/** Ataques curtos dos metais. */
const BRASS_STEPS = new Set([3, 6, 10]);

type Mix = { surdo: number; caixa: number; agogo: number; tamborim: number; ganza: number; bass: number; brass: number; repique: number; level: number };

type Marks = { avenue: number; crowd: number; deck: number; finale: number; lift: number; burst: number; duration: number };

function marksOf(timeline: ParadeTimeline): Marks {
  const start = (id: string, fallback: number) => timeline.beats.find((beat) => beat.id === id)?.start ?? fallback;
  return {
    avenue: start("avenue", 6),
    crowd: start("crowd", 12),
    deck: start("deck", 17),
    finale: start("finale", 28.5),
    lift: timeline.trophyLiftAt,
    burst: timeline.burstAt,
    duration: timeline.duration,
  };
}

function mixAt(t: number, marks: Marks): Mix {
  const silent: Mix = { surdo: 0, caixa: 0, agogo: 0, tamborim: 0, ganza: 0, bass: 0, brass: 0, repique: 0, level: 1 };
  // Compasso de chamada: só o repique, como abre qualquer bateria.
  if (t < BAR) return { ...silent, repique: 1 };
  if (t >= marks.duration) return { ...silent, surdo: 0.8, agogo: 0.7, ganza: 0.6, tamborim: 0.5, level: 0.42 };
  // Na taça a bateria segura: só a caixa rufando até o estouro.
  if (t >= marks.lift && t < marks.burst) return { ...silent, caixa: 1 };
  const boundaries = [marks.avenue, marks.crowd, marks.deck, marks.lift];
  // Virada de repique nos dois tempos antes de cada parte nova.
  const fill = boundaries.some((mark) => mark - t > 0 && mark - t <= BEAT * 2) ? 1 : 0;
  if (t < marks.avenue) return { ...silent, surdo: 1, agogo: 1, ganza: 0.6, repique: fill };
  if (t < marks.crowd) return { ...silent, surdo: 1, agogo: 1, ganza: 0.8, caixa: 0.75, tamborim: 1, bass: 1, repique: fill };
  if (t < marks.deck) return { surdo: 1, agogo: 1, ganza: 0.8, caixa: 0.85, tamborim: 1, bass: 1, brass: 0.75, repique: fill, level: 1 };
  return { surdo: 1, agogo: 1, ganza: 1, caixa: 1, tamborim: 1, bass: 1, brass: t >= marks.burst ? 1.1 : 0.9, repique: fill, level: 1 };
}

// ---------------------------------------------------------------- som

type Cue = { at: number; play: (when: number) => void };

export class ParadeAudio {
  private context: AudioContext | null;
  private master: GainNode | null = null;
  /** Barramento das notas; um salto troca por outro e silencia o velho. */
  private bus: GainNode | null = null;
  private crowdGain: GainNode | null = null;
  private crowdSource: AudioBufferSourceNode | null = null;
  private buffers: Buffers | null = null;
  private readonly marks: Marks;
  private readonly cues: Cue[];
  private readonly random = seededRandom(91);
  private muted: boolean;
  /** Relógio do áudio menos o tempo do roteiro. */
  private anchor = 0;
  private anchored = false;
  private nextStep = 0;
  private cueIndex = 0;
  private lastTime = 0;
  private crowdTarget = -1;
  private disposed = false;

  constructor(private readonly timeline: ParadeTimeline, options: { muted: boolean }) {
    this.muted = options.muted;
    this.context = paradeContext();
    liveParades += 1;
    this.marks = marksOf(timeline);
    const night = timeline.input.timeOfDay !== "day";
    const cues: Cue[] = [
      { at: 0.12, play: (when) => this.whistle(when, 3) },
      { at: this.marks.avenue, play: (when) => this.whistle(when, 2) },
      { at: this.marks.deck, play: (when) => this.whistle(when, 2) },
      { at: this.marks.lift, play: (when) => this.airHorn(when) },
      {
        at: this.marks.burst,
        play: (when) => {
          this.hit(when, 1.6);
          this.cheer(when, 1);
          if (night) this.fireworks(when + 0.05, 0.9);
          else this.pops(when);
        },
      },
      { at: this.marks.finale, play: (when) => this.whistle(when, 3) },
      { at: this.marks.duration, play: (when) => { this.hit(when, 2.4); this.cheer(when, 0.8); } },
    ];
    if (night) {
      for (const offset of [2.4, 4.1]) cues.push({ at: this.marks.burst + offset, play: (when) => this.fireworks(when, 0.55) });
      for (const offset of [0.6, 2.2, 3.6]) cues.push({ at: this.marks.finale + offset, play: (when) => this.fireworks(when, 0.7) });
    } else {
      cues.push({ at: this.marks.finale + 0.4, play: (when) => this.pops(when) });
    }
    this.cues = cues.sort((a, b) => a.at - b.at);
    this.build();
  }

  private build() {
    const context = this.context;
    if (!context) return;
    try {
      this.buffers = makeBuffers(context);
      this.master = context.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER_LEVEL;
      // Um compressor leve cola a bateria e segura os picos do estouro.
      const glue = context.createDynamicsCompressor();
      glue.threshold.value = -14;
      glue.ratio.value = 3.5;
      glue.attack.value = 0.006;
      glue.release.value = 0.2;
      this.master.connect(glue);
      glue.connect(context.destination);
      this.crowdGain = context.createGain();
      this.crowdGain.gain.value = 0;
      const crowdFilter = context.createBiquadFilter();
      crowdFilter.type = "lowpass";
      crowdFilter.frequency.value = 2400;
      this.crowdGain.connect(crowdFilter);
      crowdFilter.connect(this.master);
      this.freshBus();
    } catch {
      this.master = null;
    }
  }

  private freshBus() {
    const context = this.context;
    if (!context || !this.master) return;
    const old = this.bus;
    if (old) {
      const now = context.currentTime;
      old.gain.cancelScheduledValues(now);
      old.gain.setValueAtTime(old.gain.value, now);
      old.gain.linearRampToValueAtTime(0, now + 0.06);
      window.setTimeout(() => old.disconnect(), 400);
    }
    this.bus = context.createGain();
    this.bus.gain.value = 1;
    this.bus.connect(this.master);
  }

  private ensureCrowd() {
    const context = this.context;
    if (!context || !this.buffers || !this.crowdGain || this.crowdSource) return;
    const source = context.createBufferSource();
    source.buffer = this.buffers.crowd;
    source.loop = true;
    source.connect(this.crowdGain);
    source.start();
    this.crowdSource = source;
  }

  /** Volume do burburinho da avenida no instante `t`. */
  private crowdLevel(t: number) {
    const m = this.marks;
    if (t >= m.duration) return 0.16;
    let level = 0.18 + 0.1 * Math.min(1, t / 6);
    if (t >= m.crowd) level = 0.34;
    if (t >= m.lift) level = 0.42 + 0.2 * Math.min(1, (t - m.lift) / Math.max(0.1, m.burst - m.lift));
    if (t >= m.burst) level = 0.5 * Math.max(0.6, 1 - (t - m.burst) / 6);
    return level;
  }

  /** Chame a cada quadro com o tempo do roteiro; `jumped` depois de Pular/Rever. */
  update(time: number, jumped = false) {
    const context = this.context;
    if (this.disposed || !context || !this.master || !this.buffers) return;
    const running = context.state === "running";
    const drift = Math.abs(context.currentTime - this.anchor - time);
    if (jumped || !this.anchored || !running || drift > 0.12) {
      // Engasgo do quadro (o relógio do roteiro ficou para trás): só reancora,
      // sem remarcar o que já está tocando.
      const resync = !jumped && this.anchored && running;
      // Salto ou contexto que parou (aba escondida): o que já estava marcado sai
      // junto com o barramento velho, senão a batida volta dobrada por ~0,3 s.
      // Só na transição: parado, `anchored` fica falso e nada é recriado por quadro.
      if (jumped || (this.anchored && !running)) this.freshBus();
      this.anchor = context.currentTime - time;
      this.anchored = running;
      const from = Math.ceil(time / STEP - 1e-6);
      this.nextStep = resync ? Math.max(this.nextStep, from) : from;
      if (!resync) {
        this.cueIndex = this.cues.findIndex((cue) => cue.at >= time - 0.02);
        if (this.cueIndex < 0) this.cueIndex = this.cues.length;
      }
    }
    this.lastTime = time;
    if (!running) return;
    this.ensureCrowd();
    const crowd = this.crowdLevel(time);
    if (this.crowdGain && Math.abs(crowd - this.crowdTarget) > 0.004) {
      this.crowdTarget = crowd;
      this.crowdGain.gain.setTargetAtTime(crowd, context.currentTime, 0.25);
    }
    const horizon = time + LOOKAHEAD;
    // Sem som, nada é marcado: o agendador só anda.
    while (this.nextStep * STEP < horizon) {
      const at = this.nextStep * STEP;
      if (!this.muted && at >= time - 0.02) this.step(this.nextStep, this.anchor + Math.max(at, time));
      this.nextStep += 1;
    }
    while (this.cueIndex < this.cues.length && this.cues[this.cueIndex].at < horizon) {
      const cue = this.cues[this.cueIndex];
      if (!this.muted && cue.at >= time - 0.05) cue.play(this.anchor + Math.max(cue.at, time));
      this.cueIndex += 1;
    }
  }

  /** O pulso da batida que está tocando (para alto-falantes e multidão). */
  pulse(time = this.lastTime) {
    return paradeBeatPulse(time);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    const context = this.context;
    if (!context || !this.master) return;
    const now = context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(muted ? 0 : MASTER_LEVEL, now, 0.04);
    // Ao religar, o que estava marcado em silêncio não existe: recomeça daqui.
    if (!muted) this.anchored = false;
  }

  setPaused(paused: boolean) {
    const context = this.context;
    if (!context || this.disposed) return;
    if (paused && context.state === "running") void context.suspend().catch(() => undefined);
    if (!paused && context.state === "suspended") void context.resume().catch(() => undefined);
  }

  dispose() {
    this.disposed = true;
    const context = this.context;
    try {
      this.crowdSource?.stop();
    } catch {
      // Já parado.
    }
    if (context && this.master) {
      const master = this.master;
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0, now + 0.08);
      window.setTimeout(() => master.disconnect(), 200);
    }
    this.master = null;
    this.bus = null;
    this.crowdSource = null;
    liveParades = Math.max(0, liveParades - 1);
    // Ninguém mais tocando: o contexto dorme e não gasta bateria até a próxima festa.
    if (context) {
      window.setTimeout(() => {
        if (liveParades === 0 && context.state === "running") void context.suspend().catch(() => undefined);
      }, 400);
    }
  }

  // ------------------------------------------------------- instrumentos

  private step(step: number, when: number) {
    const t = step * STEP;
    const mix = mixAt(t, this.marks);
    const pos = step % 16;
    const bar = Math.floor(step / 16);
    const chord = PROGRESSION[bar % PROGRESSION.length];
    const level = mix.level;
    // Surdo de marcação no 1 e no 3, o de resposta no 2 e no 4.
    if (mix.surdo > 0 && pos % 4 === 0) {
      const marcacao = pos % 8 === 0;
      this.surdo(when, marcacao ? 1 : 0.7, marcacao ? 1 : 1.35, mix.surdo * level);
    }
    if (mix.caixa > 0) {
      if (t >= this.marks.lift && t < this.marks.burst) {
        // Rufo crescendo até o estouro, em fusas.
        const u = (t - this.marks.lift) / Math.max(0.1, this.marks.burst - this.marks.lift);
        this.caixa(when, 0.35 + 0.65 * u, level);
        this.caixa(when + STEP / 2, 0.3 + 0.6 * u, level);
      } else {
        this.caixa(when, CAIXA_ACCENT[pos] * mix.caixa, level);
      }
    }
    if (mix.ganza > 0) this.ganza(when, (pos % 2 === 0 ? 0.55 : 0.32) * mix.ganza * level);
    if (mix.agogo > 0) {
      const hit = AGOGO.find(([at]) => at === pos);
      if (hit) this.agogo(when, hit[1], mix.agogo * level);
    }
    if (mix.tamborim > 0 && TAMBORIM.has(pos)) this.tamborim(when, mix.tamborim * level * (pos === 0 ? 1 : 0.75));
    if (mix.repique > 0) {
      const chamada = t < BAR;
      // Chamada: o desenho clássico; virada: semicolcheias crescendo.
      if (!chamada || [0, 3, 6, 8, 10, 12, 13, 14].includes(pos)) this.repique(when, chamada ? (pos >= 12 ? 1 : 0.8) : 0.45 + 0.5 * ((pos % 8) / 8), level);
    }
    if (mix.bass > 0 && BASS_STEPS.has(pos)) this.bass(when, chord.bass * (pos === 11 || pos === 14 ? 2 : 1), mix.bass * level);
    if (mix.brass > 0 && BRASS_STEPS.has(pos)) this.brass(when, chord.chord, 0.12, mix.brass * level * (pos === 3 ? 1 : 0.8));
    // Depois do estouro os metais seguram um acorde longo a cada dois compassos.
    if (mix.brass > 1 && pos === 0 && bar % 2 === 0) this.brass(when, chord.chord, 0.55, 0.6 * level);
  }

  private out(gain: GainNode) {
    if (this.bus) gain.connect(this.bus);
  }

  private envelope(when: number, peak: number, attack: number, decay: number) {
    const gain = this.context!.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + attack + decay);
    return gain;
  }

  private noiseSource(when: number, length: number) {
    const source = this.context!.createBufferSource();
    source.buffer = this.buffers!.noise;
    source.start(when, this.random() * 0.8, length + 0.02);
    return source;
  }

  private surdo(when: number, peak: number, pitch: number, level: number) {
    const context = this.context!;
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(118 * pitch, when);
    osc.frequency.exponentialRampToValueAtTime(52 * pitch, when + 0.14);
    const gain = this.envelope(when, 0.95 * peak * level, 0.004, 0.42);
    osc.connect(gain);
    this.out(gain);
    osc.start(when);
    osc.stop(when + 0.5);
    // A pele batida: um toque de ruído grave dá o ataque que o celular consegue tocar.
    const skin = this.noiseSource(when, 0.05);
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    const skinGain = this.envelope(when, 0.22 * peak * level, 0.002, 0.04);
    skin.connect(filter);
    filter.connect(skinGain);
    this.out(skinGain);
  }

  private caixa(when: number, accent: number, level: number) {
    if (accent <= 0.05) return;
    const context = this.context!;
    const source = this.noiseSource(when, 0.09);
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 2600 + accent * 1400;
    filter.Q.value = 0.8;
    const gain = this.envelope(when, 0.34 * accent * level, 0.002, 0.07 + accent * 0.03);
    source.connect(filter);
    filter.connect(gain);
    this.out(gain);
  }

  private ganza(when: number, level: number) {
    const context = this.context!;
    const source = this.noiseSource(when, 0.05);
    const filter = context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 6500;
    const gain = this.envelope(when, 0.13 * level, 0.008, 0.04);
    source.connect(filter);
    filter.connect(gain);
    this.out(gain);
  }

  private agogo(when: number, high: 0 | 1, level: number) {
    const context = this.context!;
    const base = high ? 1046 : 784;
    const gain = this.envelope(when, 0.11 * level, 0.002, 0.22);
    // Sino: fundamental e um parcial inarmônico.
    for (const ratio of [1, 2.76]) {
      const osc = context.createOscillator();
      osc.type = ratio === 1 ? "triangle" : "sine";
      osc.frequency.value = base * ratio;
      osc.connect(gain);
      osc.start(when);
      osc.stop(when + 0.26);
    }
    this.out(gain);
  }

  private tamborim(when: number, level: number) {
    const context = this.context!;
    const osc = context.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(820, when);
    osc.frequency.exponentialRampToValueAtTime(620, when + 0.05);
    const gain = this.envelope(when, 0.16 * level, 0.002, 0.06);
    osc.connect(gain);
    osc.start(when);
    osc.stop(when + 0.09);
    const snap = this.noiseSource(when, 0.03);
    const filter = context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 3500;
    snap.connect(filter);
    filter.connect(gain);
    this.out(gain);
  }

  private repique(when: number, accent: number, level: number) {
    const context = this.context!;
    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(430, when);
    osc.frequency.exponentialRampToValueAtTime(330, when + 0.07);
    const gain = this.envelope(when, 0.3 * accent * level, 0.002, 0.11);
    osc.connect(gain);
    osc.start(when);
    osc.stop(when + 0.15);
    const crack = this.noiseSource(when, 0.04);
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1900;
    crack.connect(filter);
    filter.connect(gain);
    this.out(gain);
  }

  private bass(when: number, frequency: number, level: number) {
    const context = this.context!;
    const osc = context.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = frequency;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(900, when);
    filter.frequency.exponentialRampToValueAtTime(220, when + 0.16);
    const gain = this.envelope(when, 0.2 * level, 0.005, 0.2);
    osc.connect(filter);
    filter.connect(gain);
    this.out(gain);
    osc.start(when);
    osc.stop(when + 0.25);
  }

  /** Metais sintetizados: dois serrotes desafinados por nota e um filtro que abre no ataque. */
  private brass(when: number, chord: number[], length: number, level: number) {
    const context = this.context!;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(500, when);
    filter.frequency.exponentialRampToValueAtTime(3200, when + 0.03);
    filter.frequency.exponentialRampToValueAtTime(1100, when + length);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.075 * level, when + 0.02);
    gain.gain.setValueAtTime(0.075 * level, when + length * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + length + 0.08);
    for (const note of chord) {
      for (const detune of [-7, 7]) {
        const osc = context.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = note;
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(when);
        osc.stop(when + length + 0.12);
      }
    }
    filter.connect(gain);
    this.out(gain);
  }

  /** Apito de samba: o "fiu" com o trinado da bolinha. */
  private whistle(when: number, blasts: number) {
    const context = this.context!;
    for (let index = 0; index < blasts; index += 1) {
      const start = when + index * BEAT * 0.5;
      const long = index === blasts - 1;
      const length = long ? 0.42 : 0.13;
      const osc = context.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 2650;
      const trill = context.createOscillator();
      trill.frequency.value = 31;
      const depth = context.createGain();
      depth.gain.value = 150;
      trill.connect(depth);
      depth.connect(osc.frequency);
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.09, start + 0.015);
      gain.gain.setValueAtTime(0.09, start + length - 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
      osc.connect(gain);
      this.out(gain);
      osc.start(start);
      trill.start(start);
      osc.stop(start + length + 0.02);
      trill.stop(start + length + 0.02);
    }
  }

  /** Buzina de estádio: curta, curta, longa. */
  private airHorn(when: number) {
    const context = this.context!;
    const shaper = context.createWaveShaper();
    shaper.curve = this.buffers!.shaper;
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2600;
    shaper.connect(filter);
    const out = context.createGain();
    out.gain.value = 0.11;
    filter.connect(out);
    this.out(out);
    const parts: Array<[number, number]> = [[0, 0.16], [0.22, 0.16], [0.44, 0.85]];
    for (const [offset, length] of parts) {
      const start = when + offset;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.5, start + 0.02);
      gain.gain.setValueAtTime(0.5, start + length - 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
      for (const frequency of [233, 236.5, 349]) {
        const osc = context.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(frequency * 0.94, start);
        osc.frequency.linearRampToValueAtTime(frequency, start + 0.05);
        osc.connect(gain);
        osc.start(start);
        osc.stop(start + length + 0.02);
      }
      gain.connect(shaper);
    }
  }

  /** O estouro: surdo, prato e um acorde aberto dos metais. */
  private hit(when: number, size: number) {
    const context = this.context!;
    this.surdo(when, 1.2, 0.9, 1);
    const crash = this.noiseSource(when, 0.9);
    const filter = context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 4200;
    const gain = this.envelope(when, 0.28, 0.003, 0.6 * size);
    crash.connect(filter);
    filter.connect(gain);
    this.out(gain);
    this.brass(when, [146.83, ...PROGRESSION[0].chord, 587.33], 0.35 * size, 1.1);
  }

  private cheer(when: number, level: number) {
    const context = this.context!;
    const source = context.createBufferSource();
    source.buffer = this.buffers!.cheer;
    const gain = context.createGain();
    gain.gain.value = 0.55 * level;
    source.connect(gain);
    this.out(gain);
    source.start(when);
  }

  private fireworks(when: number, level: number) {
    const context = this.context!;
    const source = context.createBufferSource();
    source.buffer = this.buffers!.fireworks;
    source.playbackRate.value = 0.9 + this.random() * 0.25;
    const pan = context.createStereoPanner();
    pan.pan.value = this.random() * 1.2 - 0.6;
    const gain = context.createGain();
    gain.gain.value = 0.42 * level;
    source.connect(gain);
    gain.connect(pan);
    if (this.bus) pan.connect(this.bus);
    source.start(when);
  }

  /** De dia: canhões de papel picado estourando em volta do trio. */
  private pops(when: number) {
    const context = this.context!;
    for (let index = 0; index < 4; index += 1) {
      const start = when + index * 0.09 + this.random() * 0.04;
      const source = this.noiseSource(start, 0.12);
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1400 + this.random() * 900;
      const gain = this.envelope(start, 0.42, 0.002, 0.11);
      source.connect(filter);
      filter.connect(gain);
      this.out(gain);
    }
  }
}
