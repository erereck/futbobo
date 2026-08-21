import { CLUBS } from "../game-data";

export function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}


export function seeded(seed: number, salt = 0) {
  let value = (seed + salt * 2654435761) >>> 0;
  value += 0x6d2b79f5;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function pick<T>(items: T[], seed: number, salt = 0): T {
  return items[Math.floor(seeded(seed, salt) * items.length) % items.length];
}

export function clubById(id: string) {
  return CLUBS.find((club) => club.id === id) ?? CLUBS[0];
}
