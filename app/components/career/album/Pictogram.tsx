import type { Effect } from "../../../game-data";

/** Pictogramas das figurinhas-escolha: traço branco sobre a faixa colorida, grade 48×48. */
export type PictogramName =
  | "fans" | "press" | "heart" | "energy" | "captain" | "whistle" | "clock" | "money"
  | "rise" | "flag" | "trophy" | "suitcase" | "dice" | "ball";

const FILL = "rgba(255,255,255,.16)";

export function Pictogram({ name, className }: { name: PictogramName; className?: string }) {
  const common = { viewBox: "0 0 48 48", fill: "none", stroke: "#fff", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className, "aria-hidden": true };
  switch (name) {
    case "fans":
      return <svg {...common}><circle cx="13" cy="20" r="4" /><circle cx="24" cy="16" r="4.5" fill={FILL} /><circle cx="35" cy="20" r="4" /><path d="M6 40c.6-6 3.4-10 7-10s6.4 4 7 10M17 40c.6-7 3.5-12 7-12s6.4 5 7 12M28 40c.6-6 3.4-10 7-10s6.4 4 7 10" /><path d="M9 11l4 4M39 11l-4 4M24 5v5" /></svg>;
    case "press":
      return <svg {...common}><rect x="17" y="6" width="14" height="22" rx="7" fill={FILL} /><path d="M12 22c0 7 5.4 12 12 12s12-5 12-12M24 34v8M17 42h14" /><path d="M17 15h5M17 20h5" /></svg>;
    case "heart":
      return <svg {...common}><path d="M24 40S8 30.5 8 19.5C8 13.8 12.2 10 17 10c3.2 0 5.6 1.7 7 4.2C25.4 11.7 27.8 10 31 10c4.8 0 9 3.8 9 9.5C40 30.5 24 40 24 40Z" fill={FILL} /><path d="M15 20c0-2 1.5-3.6 3.5-3.8" /></svg>;
    case "energy":
      return <svg {...common}><rect x="9" y="14" width="27" height="20" rx="3" fill={FILL} /><path d="M36 21h3v6h-3" /><path d="M24 17l-6 8h6l-2 6 7-9h-6l1-5Z" fill="#fff" stroke="none" /></svg>;
    case "captain":
      return <svg {...common}><path d="M9 17c5-3 25-3 30 0v14c-5 3-25 3-30 0Z" fill={FILL} /><path d="M29 20.5c-1.2-1.5-3-2.5-5-2.5-3.6 0-6 2.7-6 6s2.4 6 6 6c2 0 3.8-1 5-2.5" /></svg>;
    case "whistle":
      return <svg {...common}><path d="M8 22h17l12-6v5l-5 3a11 11 0 1 1-24-2Z" fill={FILL} /><circle cx="19" cy="27" r="3" /><path d="M24 12v4M30 11l-2 4M18 11l2 4" /></svg>;
    case "clock":
      return <svg {...common}><circle cx="24" cy="26" r="15" fill={FILL} /><path d="M24 17v9l6 4M20 6h8M24 6v5M37 13l3-3" /></svg>;
    case "money":
      return <svg {...common}><rect x="6" y="14" width="36" height="20" rx="3" fill={FILL} /><circle cx="24" cy="24" r="5" /><path d="M11 19v.01M37 29v.01M12 39h24" /></svg>;
    case "rise":
      return <svg {...common}><path d="M7 41h34" /><path d="M11 41V31h7v10M21 41V24h7v17M31 41V16h7v25" fill={FILL} /><path d="M10 22l9-8 6 5 12-11M31 8h6v6" /></svg>;
    case "flag":
      return <svg {...common}><path d="M12 43V6" /><path d="M12 8c6-3 10 3 16 0s9-1 9-1v17s-3-2-9 1-10-3-16 0Z" fill={FILL} /><path d="M20 14l2 2 4-4" /></svg>;
    case "trophy":
      return <svg {...common}><path d="M15 7h18v10c0 6-4 10-9 10s-9-4-9-10Z" fill={FILL} /><path d="M15 11H8c0 6 3 9 7 9M33 11h7c0 6-3 9-7 9M24 27v7M16 41h16M19 34h10v7H19Z" /></svg>;
    case "suitcase":
      return <svg {...common}><rect x="7" y="15" width="34" height="24" rx="3" fill={FILL} /><path d="M18 15v-4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4M7 25h34M15 39v3M33 39v3" /></svg>;
    case "dice":
      return <svg {...common}><rect x="7" y="16" width="19" height="19" rx="3.5" fill={FILL} transform="rotate(-12 16.5 25.5)" /><rect x="22" y="9" width="19" height="19" rx="3.5" transform="rotate(14 31.5 18.5)" /><circle cx="12.5" cy="23" r="1.4" fill="#fff" stroke="none" /><circle cx="19.5" cy="29" r="1.4" fill="#fff" stroke="none" /><circle cx="28" cy="14.5" r="1.4" fill="#fff" stroke="none" /><circle cx="35" cy="22.5" r="1.4" fill="#fff" stroke="none" /><circle cx="31.5" cy="18.5" r="1.4" fill="#fff" stroke="none" /></svg>;
    case "ball":
    default:
      return <svg {...common}><circle cx="24" cy="24" r="16" fill={FILL} /><path d="M24 16l6 4.4-2.3 7.1h-7.4L18 20.4Z" fill="#fff" stroke="none" /><path d="M24 8v8M30 20.4l8.6-3.4M27.7 27.5l5.4 7.5M20.3 27.5 15 35M18 20.4 9.4 17" /></svg>;
  }
}

const KEY_TO_PICTOGRAM: Partial<Record<keyof Effect, PictogramName>> = {
  fans: "fans",
  reputation: "press",
  morale: "heart",
  fitness: "energy",
  physicalBoost: "energy",
  leadership: "captain",
  minutes: "clock",
  money: "money",
  ovr: "rise",
  potential: "rise",
  titleBoost: "trophy",
  nationalBoost: "flag",
  nationalTitleBoost: "flag",
  nationalCall: "flag",
  nationalCaptain: "flag",
  adaptation: "suitcase",
  clubCaptain: "captain",
};

type ChoiceLike = { effect: Effect; luck?: unknown };

/** Efeitos fora da escala 0–100 (dinheiro, seguidores) ganham peso fixo para não engolir os outros. */
const SCALED_KEYS: Record<string, [PictogramName, (value: number) => number]> = {
  sponsorValue: ["money", (value) => (value > 0 ? 9 : 0)],
  followers: ["fans", (value) => (value > 0 ? 6 : 0)],
  socialSentiment: ["heart", (value) => value],
  mediaRelation: ["press", (value) => value],
  discipline: ["whistle", (value) => value],
};

/** Desenhos candidatos de uma escolha, do efeito que mais pesa para o que menos pesa. */
function rankedPictograms(choice: ChoiceLike): PictogramName[] {
  if (choice.luck) return ["dice"];
  const scored = new Map<PictogramName, number>();
  for (const [key, raw] of Object.entries(choice.effect ?? {})) {
    const scaled = SCALED_KEYS[key];
    const name = scaled?.[0] ?? KEY_TO_PICTOGRAM[key as keyof Effect];
    if (!name) continue;
    const value = typeof raw === "number" ? raw : raw === true ? 10 : 0;
    const weighted = scaled ? scaled[1](value) : value;
    const score = weighted > 0 ? weighted : Math.abs(weighted) * 0.4;
    if (score > (scored.get(name) ?? 0)) scored.set(name, score);
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

/** O efeito que mais pesa na escolha vira o desenho da figurinha. Sorte vira dados. */
export function pictogramForChoice(choice: ChoiceLike): PictogramName {
  return rankedPictograms(choice)[0] ?? "ball";
}

/** Um desenho por figurinha do capítulo: se duas escolhas mexem no mesmo, a segunda usa o próximo efeito dela. */
export function pictogramsForChoices(choices: ChoiceLike[]): PictogramName[] {
  const used = new Set<PictogramName>();
  return choices.map((choice) => {
    const ranked = rankedPictograms(choice);
    const name = ranked.find((candidate) => !used.has(candidate)) ?? ranked[0] ?? "ball";
    used.add(name);
    return name;
  });
}
