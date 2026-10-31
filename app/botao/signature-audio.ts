// Sons longos que só o 3D e a partida online tocam (comemorações de assinatura,
// drama do pênalti e o toque da vez): num arquivo próprio, fora do pacote das
// rotas offline, que só baixam os sons curtos de audio.ts.

import { botaoAudioOutput, tone } from "./audio";

type SignatureSoundName = "kameCharge" | "kameBeam" | "aura" | "bang" | "drumroll" | "tick";

/** Um segundo de ruído branco, criado uma vez por contexto (os sons daqui reaproveitam). */
let noiseBuffer: AudioBuffer | null = null;

function sharedNoise(audio: AudioContext) {
  if (noiseBuffer && noiseBuffer.sampleRate === audio.sampleRate) return noiseBuffer;
  const frames = audio.sampleRate;
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < frames; index += 1) channel[index] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

/**
 * Ruído filtrado com envelope: `attack` (s) até o pico e queda exponencial até
 * o fim. O filtro pode varrer de `frequency` a `endFrequency`.
 */
function noise(options: {
  duration: number;
  gain: number;
  filter: BiquadFilterType;
  frequency: number;
  endFrequency?: number;
  q?: number;
  attack?: number;
  delay?: number;
}) {
  const out = botaoAudioOutput();
  if (!out) return;
  const { audio, master } = out;
  const start = audio.currentTime + (options.delay ?? 0);
  const end = start + options.duration;
  const source = audio.createBufferSource();
  source.buffer = sharedNoise(audio);
  source.loop = options.duration > 0.95;
  const filter = audio.createBiquadFilter();
  filter.type = options.filter;
  filter.frequency.setValueAtTime(options.frequency, start);
  if (options.endFrequency) filter.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFrequency), end);
  filter.Q.value = options.q ?? 0.9;
  const envelope = audio.createGain();
  const attack = Math.max(0.004, Math.min(options.attack ?? 0.006, options.duration * 0.9));
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.gain), start + attack);
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(master);
  // Começa num ponto qualquer do ruído (sem passar do fim do buffer): dois estouros seguidos não soam iguais.
  source.start(start, Math.random() * (source.loop ? 0.5 : Math.max(0, 0.98 - options.duration)));
  source.stop(end + 0.02);
}

/** Tom que cresce até o fim (carga de energia): sobe em `duration` e solta em 0,08 s. */
function swell(options: { frequency: number; endFrequency: number; duration: number; type: OscillatorType; gain: number; delay?: number }) {
  const out = botaoAudioOutput();
  if (!out) return;
  const { audio, master } = out;
  const start = audio.currentTime + (options.delay ?? 0);
  const end = start + options.duration;
  const oscillator = audio.createOscillator();
  const envelope = audio.createGain();
  oscillator.type = options.type;
  oscillator.frequency.setValueAtTime(options.frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, end);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(options.gain, end);
  envelope.gain.exponentialRampToValueAtTime(0.0001, end + 0.08);
  oscillator.connect(envelope);
  envelope.connect(master);
  oscillator.start(start);
  oscillator.stop(end + 0.1);
}

/** 0..1 (NaN vira 0): rampa exponencial não aceita volume zero nem negativo. */
const unit = (value: number) => (value > 0 ? Math.min(1, value) : 0);

/** Rufar de caixa (~1,6 s) crescendo, com a torcida murmurando por baixo, terminando num acento na hora da batida. */
function drumroll(volume: number) {
  if (!(volume > 0)) return;
  const roll = 1.6;
  const hits = 26;
  for (let index = 0; index < hits; index += 1) {
    const at = (index / hits) * (roll - 0.06);
    // Duas baquetas: uma batida mais forte, outra mais fraca.
    const level = volume * (0.22 + 0.4 * (index / hits)) * (index % 2 ? 0.82 : 1);
    noise({ duration: 0.05, gain: level, filter: "bandpass", frequency: 1900, q: 0.8, delay: at });
  }
  // Murmúrio da arquibancada subindo junto (ruído grave e largo, crescendo até a batida).
  noise({ duration: roll, gain: volume * 0.16, filter: "bandpass", frequency: 380, endFrequency: 760, q: 0.45, attack: roll * 0.9 });
  noise({ duration: 0.32, gain: volume * 0.95, filter: "bandpass", frequency: 1500, q: 0.6, delay: roll });
  tone({ frequency: 120, endFrequency: 70, duration: 0.3, type: "sine", gain: volume * 0.8, delay: roll });
}

export function playSignatureSound(name: SignatureSoundName, intensity = 0.5) {
  switch (name) {
    case "kameCharge": {
      // Zumbido de energia subindo junto com a esfera (~0,8 s, até o disparo).
      const level = 0.4 + unit(intensity);
      swell({ frequency: 110, endFrequency: 440, duration: 0.8, type: "sawtooth", gain: 0.06 * level });
      swell({ frequency: 220, endFrequency: 990, duration: 0.8, type: "triangle", gain: 0.06 * level });
      noise({ duration: 0.85, gain: 0.1 * level, filter: "bandpass", frequency: 400, endFrequency: 3200, q: 1.4, attack: 0.75 });
      break;
    }
    case "kameBeam": {
      // Estrondo grave, sopro largo que vai fechando e o zumbido do raio segurando.
      const level = 0.4 + unit(intensity);
      tone({ frequency: 120, endFrequency: 38, duration: 0.55, type: "sine", gain: 0.32 * level });
      noise({ duration: 0.95, gain: 0.26 * level, filter: "lowpass", frequency: 3600, endFrequency: 260, q: 0.7, attack: 0.012 });
      tone({ frequency: 196, endFrequency: 174, duration: 0.8, type: "sawtooth", gain: 0.05 * level, delay: 0.04 });
      tone({ frequency: 392, endFrequency: 349, duration: 0.7, type: "triangle", gain: 0.05 * level, delay: 0.04 });
      break;
    }
    case "aura": {
      // Explosão de poder: sopro abrindo, grave subindo e um brilho agudo.
      const level = 0.4 + unit(intensity);
      noise({ duration: 0.7, gain: 0.2 * level, filter: "lowpass", frequency: 220, endFrequency: 2600, q: 0.8, attack: 0.03 });
      tone({ frequency: 70, endFrequency: 150, duration: 0.6, type: "sine", gain: 0.28 * level });
      tone({ frequency: 880, endFrequency: 1320, duration: 0.5, type: "triangle", gain: 0.04 * level, delay: 0.05 });
      break;
    }
    case "bang":
      // Estalo curto com um soco grave: "pá!".
      noise({ duration: 0.09, gain: 0.2 + 0.4 * unit(intensity), filter: "bandpass", frequency: 1500, q: 0.7 });
      tone({ frequency: 240, endFrequency: 70, duration: 0.1, type: "square", gain: 0.05 + 0.1 * unit(intensity) });
      break;
    case "drumroll":
      drumroll(unit(intensity));
      break;
    case "tick":
      tone({ frequency: 1650, duration: 0.04, type: "sine", gain: 0.03 + 0.08 * unit(intensity) });
      break;
  }
}
