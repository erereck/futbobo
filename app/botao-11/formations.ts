import type { Formation } from "./types";

export const FORMATIONS: Formation[] = [
  {
    id: "433",
    name: "4-3-3",
    shape: "4-3-3",
    slots: [
      { role: "GK", lane: 0.5, depth: 0.055 },
      { role: "LB", lane: 0.12, depth: 0.25 },
      { role: "CB", lane: 0.37, depth: 0.22 },
      { role: "CB", lane: 0.63, depth: 0.22 },
      { role: "RB", lane: 0.88, depth: 0.25 },
      { role: "CM", lane: 0.24, depth: 0.48 },
      { role: "DM", lane: 0.5, depth: 0.42 },
      { role: "CM", lane: 0.76, depth: 0.48 },
      { role: "LW", lane: 0.14, depth: 0.73 },
      { role: "ST", lane: 0.5, depth: 0.78 },
      { role: "RW", lane: 0.86, depth: 0.73 },
    ],
  },
  {
    id: "442",
    name: "4-4-2",
    shape: "4-4-2",
    slots: [
      { role: "GK", lane: 0.5, depth: 0.055 },
      { role: "LB", lane: 0.12, depth: 0.25 },
      { role: "CB", lane: 0.37, depth: 0.22 },
      { role: "CB", lane: 0.63, depth: 0.22 },
      { role: "RB", lane: 0.88, depth: 0.25 },
      { role: "LW", lane: 0.12, depth: 0.51 },
      { role: "CM", lane: 0.38, depth: 0.46 },
      { role: "CM", lane: 0.62, depth: 0.46 },
      { role: "RW", lane: 0.88, depth: 0.51 },
      { role: "ST", lane: 0.37, depth: 0.76 },
      { role: "ST", lane: 0.63, depth: 0.76 },
    ],
  },
  {
    id: "352",
    name: "3-5-2",
    shape: "3-5-2",
    slots: [
      { role: "GK", lane: 0.5, depth: 0.055 },
      { role: "CB", lane: 0.22, depth: 0.23 },
      { role: "CB", lane: 0.5, depth: 0.19 },
      { role: "CB", lane: 0.78, depth: 0.23 },
      { role: "LW", lane: 0.08, depth: 0.48 },
      { role: "CM", lane: 0.31, depth: 0.47 },
      { role: "DM", lane: 0.5, depth: 0.4 },
      { role: "CM", lane: 0.69, depth: 0.47 },
      { role: "RW", lane: 0.92, depth: 0.48 },
      { role: "ST", lane: 0.37, depth: 0.76 },
      { role: "ST", lane: 0.63, depth: 0.76 },
    ],
  },
  {
    id: "4231",
    name: "4-2-3-1",
    shape: "4-2-3-1",
    slots: [
      { role: "GK", lane: 0.5, depth: 0.055 },
      { role: "LB", lane: 0.12, depth: 0.25 },
      { role: "CB", lane: 0.37, depth: 0.22 },
      { role: "CB", lane: 0.63, depth: 0.22 },
      { role: "RB", lane: 0.88, depth: 0.25 },
      { role: "DM", lane: 0.35, depth: 0.42 },
      { role: "DM", lane: 0.65, depth: 0.42 },
      { role: "LW", lane: 0.16, depth: 0.65 },
      { role: "AM", lane: 0.5, depth: 0.61 },
      { role: "RW", lane: 0.84, depth: 0.65 },
      { role: "ST", lane: 0.5, depth: 0.8 },
    ],
  },
];

export function getFormation(id: string): Formation {
  return FORMATIONS.find((formation) => formation.id === id) ?? FORMATIONS[0];
}
