// Utilitários de cor do renderizador de personagens. Tudo trabalha com hex
// (#rrggbb) para que misturas possam ser encadeadas sem reinterpretar strings.

type Rgb = [number, number, number];

const cache = new Map<string, Rgb>();

function parse(color: string): Rgb {
  const cached = cache.get(color);
  if (cached) return cached;
  let rgb: Rgb = [0, 0, 0];
  const hex = color.trim().replace("#", "");
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    const value = Number.parseInt(hex, 16);
    rgb = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  } else if (/^[0-9a-f]{3}$/i.test(hex)) {
    rgb = [0, 1, 2].map((index) => Number.parseInt(hex[index] + hex[index], 16)) as Rgb;
  } else {
    const match = color.match(/rgba?\(([^)]+)\)/i);
    if (match) {
      const parts = match[1].split(",").map((part) => Number.parseFloat(part));
      rgb = [parts[0] || 0, parts[1] || 0, parts[2] || 0];
    }
  }
  if (cache.size > 600) cache.clear();
  cache.set(color, rgb);
  return rgb;
}

function toHex([red, green, blue]: Rgb) {
  return `#${[red, green, blue]
    .map((channel) => Math.round(Math.max(0, Math.min(255, channel))).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function mix(from: string, to: string, amount: number) {
  const a = parse(from);
  const b = parse(to);
  const t = Math.max(0, Math.min(1, amount));
  return toHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

export const darken = (color: string, amount: number) => mix(color, "#000000", amount);
export const lighten = (color: string, amount: number) => mix(color, "#ffffff", amount);

export function alpha(color: string, opacity: number) {
  const [red, green, blue] = parse(color);
  return `rgba(${Math.round(red)},${Math.round(green)},${Math.round(blue)},${Math.max(0, Math.min(1, opacity))})`;
}

/** Luminância relativa aproximada (0 = preto, 1 = branco). */
export function luminance(color: string) {
  const [red, green, blue] = parse(color).map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Contorno quente e escuro derivado da própria cor, como num desenho animado. */
export function ink(color: string, strength = 0.6) {
  return mix(color, "#160d0b", strength);
}

/** Cor legível por cima de um fundo. */
export function readableOn(background: string) {
  return luminance(background) > 0.42 ? "#14100e" : "#ffffff";
}
