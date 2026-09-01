import type { Formation } from "./types";

export const FORMATIONS_11: Formation[] = [
  {
    id: "433",
    name: "Equilíbrio",
    shape: "4-3-3",
    slots: [
      { role: "GK", lane: 0.50, depth: 0.035 },
      { role: "RB", lane: 0.84, depth: 0.25 },
      { role: "CB", lane: 0.61, depth: 0.20 },
      { role: "CB", lane: 0.39, depth: 0.20 },
      { role: "LB", lane: 0.16, depth: 0.25 },
      { role: "CM", lane: 0.72, depth: 0.49 },
      { role: "DM", lane: 0.50, depth: 0.43 },
      { role: "CM", lane: 0.28, depth: 0.49 },
      { role: "RW", lane: 0.83, depth: 0.78 },
      { role: "ST", lane: 0.50, depth: 0.86 },
      { role: "LW", lane: 0.17, depth: 0.78 },
    ],
  },
  {
    id: "442",
    name: "Clássica",
    shape: "4-4-2",
    slots: [
      { role: "GK", lane: 0.50, depth: 0.035 },
      { role: "RB", lane: 0.84, depth: 0.24 },
      { role: "CB", lane: 0.61, depth: 0.19 },
      { role: "CB", lane: 0.39, depth: 0.19 },
      { role: "LB", lane: 0.16, depth: 0.24 },
      { role: "RW", lane: 0.84, depth: 0.52 },
      { role: "CM", lane: 0.61, depth: 0.48 },
      { role: "CM", lane: 0.39, depth: 0.48 },
      { role: "LW", lane: 0.16, depth: 0.52 },
      { role: "ST", lane: 0.62, depth: 0.82 },
      { role: "ST", lane: 0.38, depth: 0.82 },
    ],
  },
  {
    id: "352",
    name: "Pressão",
    shape: "3-5-2",
    slots: [
      { role: "GK", lane: 0.50, depth: 0.035 },
      { role: "CB", lane: 0.72, depth: 0.20 },
      { role: "CB", lane: 0.50, depth: 0.16 },
      { role: "CB", lane: 0.28, depth: 0.20 },
      { role: "RW", lane: 0.90, depth: 0.50 },
      { role: "CM", lane: 0.68, depth: 0.48 },
      { role: "DM", lane: 0.50, depth: 0.40 },
      { role: "CM", lane: 0.32, depth: 0.48 },
      { role: "LW", lane: 0.10, depth: 0.50 },
      { role: "ST", lane: 0.61, depth: 0.82 },
      { role: "ST", lane: 0.39, depth: 0.82 },
    ],
  },
  {
    id: "4231",
    name: "Controle",
    shape: "4-2-3-1",
    slots: [
      { role: "GK", lane: 0.50, depth: 0.035 },
      { role: "RB", lane: 0.84, depth: 0.24 },
      { role: "CB", lane: 0.61, depth: 0.19 },
      { role: "CB", lane: 0.39, depth: 0.19 },
      { role: "LB", lane: 0.16, depth: 0.24 },
      { role: "DM", lane: 0.63, depth: 0.43 },
      { role: "DM", lane: 0.37, depth: 0.43 },
      { role: "RW", lane: 0.82, depth: 0.66 },
      { role: "AM", lane: 0.50, depth: 0.64 },
      { role: "LW", lane: 0.18, depth: 0.66 },
      { role: "ST", lane: 0.50, depth: 0.86 },
    ],
  },
];

export function formationById(id: string) {
  return FORMATIONS_11.find((formation) => formation.id === id) ?? FORMATIONS_11[0];
}
