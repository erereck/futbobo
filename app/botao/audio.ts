// Som sintetizado no WebAudio. Nenhum arquivo de áudio: o modo continua
// autocontido e não pesa um byte no bundle estático.
//
// O contexto só nasce no primeiro toque do usuário (política de autoplay dos
// navegadores) e todo o módulo vira no-op se o navegador não tiver suporte.

type BotaoSoundName = "flick" | "hit" | "post" | "goal" | "concede" | "whistle" | "save";

let context: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

function ensureContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
    master = context.createGain();
    master.gain.value = 0.42;
    master.connect(context.destination);
  } catch {
    context = null;
  }
  return context;
}

/** Chame no primeiro gesto do usuário para destravar o áudio. */
export function unlockAudio() {
  const audio = ensureContext();
  if (audio && audio.state === "suspended") void audio.resume();
}

export function setBotaoMuted(value: boolean) {
  muted = value;
  if (master) master.gain.value = value ? 0 : 0.42;
}

export function isBotaoMuted() {
  return muted;
}

function tone(options: {
  frequency: number;
  endFrequency?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}) {
  const audio = ensureContext();
  if (!audio || !master || muted) return;
  const start = audio.currentTime + (options.delay ?? 0);
  const oscillator = audio.createOscillator();
  const envelope = audio.createGain();
  oscillator.type = options.type ?? "triangle";
  oscillator.frequency.setValueAtTime(options.frequency, start);
  if (options.endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, options.endFrequency), start + options.duration);
  }
  const peak = options.gain ?? 0.3;
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(peak, start + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + options.duration);
  oscillator.connect(envelope);
  envelope.connect(master);
  oscillator.start(start);
  oscillator.stop(start + options.duration + 0.02);
}

/** Estalo curto de plástico batendo em plástico. */
function knock(intensity: number) {
  const audio = ensureContext();
  if (!audio || !master || muted) return;
  const duration = 0.06;
  const frames = Math.floor(audio.sampleRate * duration);
  const buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < frames; index += 1) {
    const decay = Math.pow(1 - index / frames, 7);
    channel[index] = (Math.random() * 2 - 1) * decay;
  }
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 900 + intensity * 1500;
  filter.Q.value = 1.1;
  const envelope = audio.createGain();
  envelope.gain.value = 0.18 + intensity * 0.5;
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(master);
  source.start();
}

export function playBotaoSound(name: BotaoSoundName, intensity = 0.5) {
  switch (name) {
    case "flick":
      knock(0.25 + intensity * 0.5);
      break;
    case "hit":
      knock(intensity);
      break;
    case "post":
      tone({ frequency: 1180, endFrequency: 620, duration: 0.22, type: "square", gain: 0.16 });
      break;
    case "save":
      tone({ frequency: 300, endFrequency: 150, duration: 0.18, type: "sawtooth", gain: 0.16 });
      break;
    case "goal":
      tone({ frequency: 523, duration: 0.16, gain: 0.26 });
      tone({ frequency: 659, duration: 0.16, gain: 0.26, delay: 0.12 });
      tone({ frequency: 784, duration: 0.32, gain: 0.28, delay: 0.24 });
      break;
    case "concede":
      tone({ frequency: 392, endFrequency: 196, duration: 0.42, type: "sawtooth", gain: 0.18 });
      break;
    case "whistle":
      tone({ frequency: 2100, endFrequency: 2400, duration: 0.16, type: "sine", gain: 0.14 });
      tone({ frequency: 2200, endFrequency: 1900, duration: 0.2, type: "sine", gain: 0.14, delay: 0.17 });
      break;
  }
}
