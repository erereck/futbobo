// Fases da demo do Scorebobo: curva de dificuldade (goleiro, defesa, passes) e
// variedade (chute, pênalti, tabela, cavadinha, triangulação, voleio, ponta,
// falta, contra-ataque, chute de fora, falta de longe, final).
//
// Coordenadas em metros: x atravessa o campo, z vai do meio-campo (0) à linha
// do gol (52,5); a marca do pênalti fica em z = 41,5 e a área começa em z = 36.
// `hero.pos` é onde o herói pisa: a bola fica meio metro à frente, rumo ao gol.

import type { ScoreLevel, Vec2 } from "../types";
import { hypot } from "./math";

/** Onde o herói fica para a bola estar em `ball` (meio metro atrás, olhando o gol). */
function behind(ball: Vec2): Vec2 {
  const dx = -ball.x;
  const dz = 52.5 - ball.z;
  const l = hypot(dx, dz) || 1;
  return { x: ball.x - (dx / l) * 0.5, z: ball.z - (dz / l) * 0.5 };
}

/** Barreira a 9,15 m da bola, de frente para `aimX` na linha do gol, `count` jogadores ombro a ombro. */
function wall(ball: Vec2, aimX: number, count: number, firstNumber: number): ScoreLevel["defenders"] {
  const dx = aimX - ball.x;
  const dz = 52.5 - ball.z;
  const l = hypot(dx, dz) || 1;
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
const PENALTY_SPOT = { x: 0, z: 41.5 };
const FRONT_FREE_KICK = { x: -1.2, z: 31.4 };

// A ordem é a trilha de desbloqueio: cada fase um pouco mais difícil que a
// anterior (medida com jogadas sintéticas), as bolas paradas espalhadas e a
// final por último. Mudar a ordem pede migração em storage.ts (TRACK_VERSION).

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
    id: "na-marca-da-cal",
    name: "Na marca da cal",
    situation: "Pênalti no fim, empate no placar: é com você",
    objective: "Converta o pênalti",
    // Pênalti é chute direto: rolar para quem está na meia-lua não vale.
    require: [{ kind: "maxPasses", max: 0 }],
    // Uma cobrança só: de 11 m o goleiro quase não alcança o canto, e com três
    // bolas a fase saía de graça. As estrelas pedem o ângulo, com efeito.
    stars: [{ kind: "topCorner" }, { kind: "curve", min: 1 }],
    attempts: 1,
    sky: "night",
    clock: "88'",
    score: { home: 1, away: 1 },
    hero: { id: "hero", name: "Você", number: 10, pos: behind(PENALTY_SPOT) },
    // Todo mundo fora da área e da meia-lua, esperando o rebote.
    mates: [
      { id: "m9", name: "Tavares", number: 9, pos: { x: -7.2, z: 35.4 } },
      { id: "m8", name: "Baptista", number: 8, pos: { x: 8.4, z: 35.2 } },
    ],
    defenders: [
      { id: "d4", name: "Vidal", number: 4, pos: { x: -9.6, z: 35.6 }, behavior: "hold" },
      { id: "d3", name: "Prado", number: 3, pos: { x: 10.8, z: 35.5 }, behavior: "hold" },
    ],
    // Na linha até a bola sair.
    keeper: { name: "Brandão", number: 1, skill: 0.9, pos: { x: 0, z: 52.2 } },
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
    id: "cara-a-cara",
    name: "Cara a cara",
    situation: "Saiu sozinho, e o goleiro vem fechando o ângulo",
    objective: "Vença o goleiro",
    // Rasteiro no canto ele ainda pega muitos: a cavadinha por cima dele (ou a bola colocada, com curva) é o caminho.
    stars: [{ kind: "curve", min: 1 }, { kind: "topCorner" }],
    attempts: 3,
    sky: "day",
    clock: "64'",
    score: { home: 1, away: 1 },
    // Arranca de uns 22 m: dá tempo de o goleiro se arrumar.
    hero: { id: "hero", name: "Você", number: 10, pos: behind({ x: -1.4, z: 29.7 }) },
    mates: [],
    // Vem na cobertura, atrasado (no celular em pé, fora do quadro da mira): só pressão.
    defenders: [{ id: "d2", name: "Rocha", number: 2, pos: { x: -7, z: 30 }, behavior: "press" }],
    // Saindo do gol para abafar: fica ali até a bola sair.
    keeper: { name: "Sampaio", number: 1, skill: 0.95, pos: { x: -0.5, z: 48 } },
  },
  {
    id: "triangulacao",
    name: "Triangulação",
    situation: "Três no toque contra a defesa armada",
    objective: "Troque dois passes e marque",
    require: [{ kind: "minPasses", min: 2 }],
    stars: [{ kind: "minPasses", min: 3 }, { kind: "curve", min: 1.2 }],
    attempts: 3,
    sky: "sunset",
    clock: "52'",
    score: { home: 1, away: 0 },
    hero: { id: "hero", name: "Você", number: 10, pos: behind({ x: -1, z: 27 }) },
    mates: [
      { id: "m9", name: "Tavares", number: 9, pos: { x: -8, z: 32.5 }, run: [{ x: -7, z: 38 }, { x: -4.5, z: 42 }] },
      { id: "m7", name: "Lima", number: 7, pos: { x: 7, z: 31.5 }, run: [{ x: 6, z: 37.5 }, { x: 3.5, z: 42.5 }] },
    ],
    defenders: [
      { id: "d6", name: "Neves", number: 6, pos: { x: -0.6, z: 30.6 }, behavior: "press" },
      { id: "d2", name: "Rocha", number: 2, pos: { x: -10.5, z: 36.5 }, behavior: "markNearest" },
      // Marcação por fora e o zagueiro da área mais atrás: a terceira troca (a estrela) passa.
      { id: "d4", name: "Vidal", number: 4, pos: { x: 8, z: 36 }, behavior: "markNearest" },
      { id: "d3", name: "Prado", number: 3, pos: { x: -1.5, z: 43 }, behavior: "hold" },
    ],
    keeper: { name: "Moura", number: 1, skill: 0.6 },
  },
  {
    id: "de-voleio",
    name: "De voleio",
    situation: "Lançamento de trás para quem entra na área",
    objective: "Gol de voleio",
    require: [{ kind: "volley" }],
    stars: [{ kind: "firstAttempt" }, { kind: "topCorner" }],
    attempts: 3,
    sky: "night",
    clock: "70'",
    score: { home: 0, away: 0 },
    // Longe o bastante para o passe sair por cima (lançamento) e cair no pé de quem chega.
    hero: { id: "hero", name: "Você", number: 8, pos: behind({ x: -11, z: 10.5 }) },
    mates: [
      { id: "m9", name: "Tavares", number: 9, pos: { x: 6, z: 33 }, run: [{ x: 7, z: 38.5 }, { x: 5.5, z: 42.5 }] },
      // Fundo o bastante para o passe até ele também sair por cima (de perto saía rasteiro, sem voleio).
      { id: "m11", name: "Cunha", number: 11, pos: { x: -14, z: 35 }, run: [{ x: -12, z: 42.5 }] },
    ],
    defenders: [
      { id: "d4", name: "Vidal", number: 4, pos: { x: 2, z: 37 }, behavior: "hold" },
      { id: "d3", name: "Prado", number: 3, pos: { x: -4.5, z: 37.5 }, behavior: "hold" },
      // Fica por fora, na sobra: marcando o Cunha, cortava quase todo lançamento para ele.
      { id: "d2", name: "Rocha", number: 2, pos: { x: -17, z: 40 }, behavior: "hold" },
      { id: "d8", name: "Duarte", number: 8, pos: { x: -6, z: 18 }, behavior: "press" },
    ],
    keeper: { name: "Galvão", number: 1, skill: 0.6 },
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
    id: "falta-frontal",
    name: "Falta frontal",
    situation: "Na meia-lua, com três na barreira",
    objective: "Marque de falta, direto",
    require: [{ kind: "maxPasses", max: 0 }],
    stars: [{ kind: "firstAttempt" }, { kind: "topCorner" }],
    attempts: 3,
    sky: "day",
    clock: "86'",
    score: { home: 0, away: 1 },
    hero: { id: "hero", name: "Você", number: 10, pos: behind(FRONT_FREE_KICK) },
    mates: [
      { id: "m9", name: "Tavares", number: 9, pos: { x: 5.5, z: 37.4 } },
      { id: "m11", name: "Cunha", number: 11, pos: { x: -8, z: 37.8 } },
    ],
    // Barreira de três e goleiro mais fraco: com mais gente nela a falta virava muro no meio da trilha.
    defenders: [
      ...wall(FRONT_FREE_KICK, -1.6, 3, 4),
      { id: "d3", name: "Prado", number: 3, pos: { x: 6.5, z: 38.8 }, behavior: "markNearest" },
    ],
    keeper: { name: "Teixeira", number: 1, skill: 0.5, pos: { x: 1.3, z: 51.7 } },
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
    id: "area-lotada",
    name: "Área lotada",
    situation: "A defesa fechou a área: o jeito é arriscar de fora",
    objective: "Gol de fora da área",
    require: [{ kind: "outsideBox" }],
    // Rolar para o meia e bater de primeira também vale (e vale estrela).
    stars: [{ kind: "firstTime" }, { kind: "curve", min: 1.5 }],
    attempts: 3,
    sky: "day",
    clock: "39'",
    score: { home: 0, away: 0 },
    hero: { id: "hero", name: "Você", number: 10, pos: behind({ x: -4, z: 27 }) },
    mates: [
      { id: "m8", name: "Baptista", number: 8, pos: { x: 7, z: 28 } },
      { id: "m9", name: "Tavares", number: 9, pos: { x: 1, z: 42.5 } },
    ],
    defenders: [
      { id: "d6", name: "Neves", number: 6, pos: { x: -8, z: 30.5 }, behavior: "press" },
      // Recuado na área: o chute de fora tem por onde passar.
      { id: "d5", name: "Lopes", number: 5, pos: { x: -1, z: 40.5 }, behavior: "hold" },
      { id: "d3", name: "Prado", number: 3, pos: { x: -6, z: 40.5 }, behavior: "hold" },
      { id: "d2", name: "Rocha", number: 2, pos: { x: 5, z: 40 }, behavior: "hold" },
      { id: "d4", name: "Vidal", number: 4, pos: { x: 1.6, z: 43.6 }, behavior: "markNearest" },
    ],
    keeper: { name: "Rezende", number: 1, skill: 0.4 },
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
