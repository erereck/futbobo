// Fases da demo do Scorebobo: curva de dificuldade (goleiro, defesa, passes) e
// variedade (chute, falta, tabela, ponta, contra-ataque, final).
//
// Coordenadas em metros: x atravessa o campo, z vai do meio-campo (0) à linha
// do gol (52,5); a marca do pênalti fica em z = 41,5 e a área começa em z = 36.
// `hero.pos` é onde o herói pisa: a bola fica meio metro à frente, rumo ao gol.

import type { ScoreLevel, Vec2 } from "../types";

/** Onde o herói fica para a bola estar em `ball` (meio metro atrás, olhando o gol). */
function behind(ball: Vec2): Vec2 {
  const dx = -ball.x;
  const dz = 52.5 - ball.z;
  const l = Math.hypot(dx, dz) || 1;
  return { x: ball.x - (dx / l) * 0.5, z: ball.z - (dz / l) * 0.5 };
}

/** Barreira a 9,15 m da bola, de frente para `aimX` na linha do gol, `count` jogadores ombro a ombro. */
function wall(ball: Vec2, aimX: number, count: number, firstNumber: number): ScoreLevel["defenders"] {
  const dx = aimX - ball.x;
  const dz = 52.5 - ball.z;
  const l = Math.hypot(dx, dz) || 1;
  const dir = { x: dx / l, z: dz / l };
  const side = { x: dir.z, z: -dir.x };
  const center = { x: ball.x + dir.x * 9.15, z: ball.z + dir.z * 9.15 };
  return Array.from({ length: count }, (_, i) => {
    const off = (i - (count - 1) / 2) * 0.62;
    return {
      id: `wall${i + 1}`,
      name: ["Ribeiro", "Toledo", "Matos", "Viana", "Paiva"][i] ?? `Barreira ${i + 1}`,
      number: firstNumber + i,
      pos: { x: Math.round((center.x + side.x * off) * 100) / 100, z: Math.round((center.z + side.z * off) * 100) / 100 },
      behavior: "wall" as const,
    };
  });
}

const FREE_KICK_BALL = { x: -7, z: 28.5 };

export const SCORE_LEVELS: ScoreLevel[] = [
  {
    id: "primeiro-toque",
    name: "Primeiro toque",
    situation: "Entrada da área, só o goleiro pela frente",
    objective: "Marque um gol",
    stars: [{ kind: "firstAttempt" }, { kind: "topCorner" }],
    attempts: 3,
    sky: "day",
    clock: "12'",
    score: { home: 0, away: 0 },
    hero: { id: "hero", name: "Você", number: 10, pos: behind({ x: 0, z: 34 }) },
    mates: [],
    defenders: [],
    keeper: { name: "Bastos", number: 1, skill: 0.28 },
    tutorial: {
      hint: "Arraste da bola até o canto do gol e solte. Traço rápido = chute forte; traço curvo = bola com efeito.",
      demo: [
        { x: 0, z: 34 },
        { x: -0.4, z: 38 },
        { x: -0.2, z: 42 },
        { x: 0.9, z: 46.5 },
        { x: 2.1, z: 50 },
        { x: 2.8, z: 52.5 },
      ],
    },
  },
  {
    id: "curva-no-angulo",
    name: "Curva no ângulo",
    situation: "Falta a 25 m, barreira de quatro",
    objective: "Marque de falta, direto",
    // Rolar para o lado e chutar de perto não é cobrança de falta.
    require: [{ kind: "maxPasses", max: 0 }],
    stars: [{ kind: "curve", min: 2 }, { kind: "topCorner" }],
    attempts: 3,
    sky: "sunset",
    clock: "78'",
    score: { home: 1, away: 1 },
    hero: { id: "hero", name: "Você", number: 10, pos: behind(FREE_KICK_BALL) },
    mates: [
      { id: "m9", name: "Tavares", number: 9, pos: { x: 4, z: 35.5 } },
      { id: "m11", name: "Cunha", number: 11, pos: { x: -14, z: 36 } },
    ],
    defenders: [
      ...wall(FREE_KICK_BALL, -1.4, 4, 4),
      { id: "d5", name: "Prado", number: 3, pos: { x: 5, z: 37 }, behavior: "markNearest" },
    ],
    keeper: { name: "Moura", number: 1, skill: 0.62, pos: { x: 1, z: 51.6 } },
  },
  {
    id: "tabela-na-area",
    name: "Tabela na área",
    situation: "Lance pela esquerda, o centroavante pedindo a bola",
    objective: "Passe e marque",
    require: [{ kind: "minPasses", min: 1 }],
    stars: [{ kind: "firstAttempt" }, { kind: "curve", min: 1.2 }],
    attempts: 3,
    sky: "day",
    clock: "34'",
    score: { home: 0, away: 0 },
    hero: { id: "hero", name: "Você", number: 8, pos: behind({ x: -12, z: 30 }) },
    mates: [
      { id: "m9", name: "Tavares", number: 9, pos: { x: -3, z: 33.5 }, run: [{ x: -2.5, z: 38 }, { x: -2, z: 42 }] },
      { id: "m7", name: "Lima", number: 7, pos: { x: 14, z: 31 }, run: [{ x: 12, z: 39 }] },
    ],
    defenders: [
      { id: "d3", name: "Prado", number: 3, pos: { x: -11.7, z: 32.7 }, behavior: "press" },
      { id: "d4", name: "Vidal", number: 4, pos: { x: -2, z: 35.8 }, behavior: "markNearest" },
      { id: "d2", name: "Rocha", number: 2, pos: { x: 5.5, z: 40.5 }, behavior: "hold" },
    ],
    keeper: { name: "Moura", number: 1, skill: 0.72 },
  },
  {
    id: "pela-ponta",
    name: "Pela ponta",
    situation: "Abra na ponta, cruze, e o centroavante sobe",
    objective: "Gol de cabeça",
    require: [{ kind: "header" }],
    stars: [{ kind: "firstAttempt" }, { kind: "topCorner" }],
    attempts: 3,
    sky: "night",
    clock: "61'",
    score: { home: 0, away: 1 },
    hero: { id: "hero", name: "Você", number: 8, pos: behind({ x: -6, z: 24 }) },
    mates: [
      { id: "m11", name: "Cunha", number: 11, pos: { x: -21, z: 29 }, run: [{ x: -23.5, z: 37 }, { x: -24.5, z: 43 }] },
      { id: "m9", name: "Tavares", number: 9, pos: { x: 8, z: 31 }, run: [{ x: 10, z: 36 }, { x: 6.5, z: 41 }, { x: 2, z: 44.5 }, { x: -1, z: 46.5 }] },
    ],
    defenders: [
      { id: "d2", name: "Rocha", number: 2, pos: { x: -18, z: 33.5 }, behavior: "markNearest" },
      { id: "d4", name: "Vidal", number: 4, pos: { x: 7, z: 34 }, behavior: "markNearest" },
      { id: "d3", name: "Prado", number: 3, pos: { x: -3.5, z: 41.5 }, behavior: "hold" },
      { id: "d6", name: "Neves", number: 6, pos: { x: -5.5, z: 27.2 }, behavior: "press" },
    ],
    keeper: { name: "Galvão", number: 1, skill: 0.76 },
  },
  {
    id: "contra-ataque",
    name: "Contra-ataque",
    situation: "Três contra três, a defesa adiantada",
    objective: "Marque no contra-ataque",
    stars: [{ kind: "minPasses", min: 2 }, { kind: "curve", min: 1.5 }],
    attempts: 3,
    sky: "sunset",
    clock: "83'",
    score: { home: 2, away: 2 },
    hero: { id: "hero", name: "Você", number: 10, pos: behind({ x: 0, z: 14 }) },
    mates: [
      { id: "m11", name: "Cunha", number: 11, pos: { x: -14, z: 18 }, run: [{ x: -14.5, z: 30 }, { x: -12, z: 40 }] },
      { id: "m7", name: "Lima", number: 7, pos: { x: 13, z: 17 }, run: [{ x: 12, z: 30 }, { x: 5.5, z: 42.5 }] },
    ],
    defenders: [
      { id: "d2", name: "Rocha", number: 2, pos: { x: -7.5, z: 31 }, behavior: "hold" },
      { id: "d4", name: "Vidal", number: 4, pos: { x: 0, z: 30 }, behavior: "hold" },
      { id: "d3", name: "Prado", number: 3, pos: { x: 7.5, z: 31 }, behavior: "hold" },
      { id: "d8", name: "Duarte", number: 8, pos: { x: 3, z: 10 }, behavior: "press" },
    ],
    keeper: { name: "Galvão", number: 1, skill: 0.65 },
  },
  {
    id: "final-da-copa",
    name: "Final da Copa",
    situation: "Acréscimos, empate, defesa fechada: a última bola é sua",
    objective: "Faça o gol do título",
    // A banana direta ainda vale (e o goleiro lê a curva); a estrela premia a jogada trocada.
    stars: [{ kind: "minPasses", min: 1 }, { kind: "topCorner" }],
    attempts: 3,
    sky: "night",
    clock: "90+3'",
    score: { home: 1, away: 1 },
    hero: { id: "hero", name: "Você", number: 10, pos: behind({ x: 9, z: 29 }) },
    mates: [
      { id: "m9", name: "Tavares", number: 9, pos: { x: -2, z: 37 }, run: [{ x: -3.5, z: 41.5 }, { x: -3, z: 44.5 }] },
      { id: "m8", name: "Baptista", number: 8, pos: { x: -11, z: 30 }, run: [{ x: -10.5, z: 36.5 }, { x: -8, z: 40 }] },
    ],
    defenders: [
      { id: "d6", name: "Neves", number: 6, pos: { x: 6.3, z: 32.4 }, behavior: "press" },
      { id: "d4", name: "Vidal", number: 4, pos: { x: -0.8, z: 38.6 }, behavior: "markNearest" },
      { id: "d2", name: "Rocha", number: 2, pos: { x: -9.2, z: 32.8 }, behavior: "markNearest" },
      { id: "d3", name: "Prado", number: 3, pos: { x: 3.8, z: 41 }, behavior: "hold" },
      { id: "d5", name: "Lopes", number: 5, pos: { x: -6.5, z: 46 }, behavior: "hold" },
    ],
    keeper: { name: "Ferraz", number: 1, skill: 0.8 },
  },
];
