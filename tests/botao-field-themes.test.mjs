import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs, stubBrowser } from "./helpers/ts-loader.mjs";

// Campos da mesa: tema pedido pelo setup, sorteio raro das duas quadras de futsal (a rua nunca sai no
// sorteio), variação da rua determinística, clima do 3D e o bairro montando sem erro nas três ruas.

stubBrowser();
// O estádio pinta texturas num canvas: no Node, um canvas 2D falso que aceita tudo e não desenha nada.
const fakeCanvasContext = () =>
  new Proxy(function () {}, {
    get: (target, key) => (key === Symbol.toPrimitive ? () => 0 : key === "data" ? new Uint8ClampedArray(4) : fakeCanvasContext()),
    set: () => true,
    apply: () => fakeCanvasContext(),
  });
globalThis.document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => fakeCanvasContext() }) };
// Grão da grama (gramado clássico) usa Path2D.
globalThis.Path2D ??= class {
  moveTo() {}
  lineTo() {}
};

const {
  FUTSAL_FIELD_CHANCE,
  FUTSAL_FIELD_THEMES,
  NORMAL_FIELD_THEMES,
  STREET_VARIANTS,
  fieldThemeForMatch,
  isFutsalTheme,
  streetVariantForMatch,
} = loadTs("app/botao/field-themes.ts");

const ALL_THEMES = [...NORMAL_FIELD_THEMES, ...FUTSAL_FIELD_THEMES, "street"];
let counter = 0;

/** Setup mínimo: o seletor de campo só lê a chave da partida e os pedidos. */
function setup(overrides = {}) {
  counter += 1;
  return {
    matchId: `teste-${counter}`,
    seed: 1000 + counter,
    competitionName: "Copa de teste",
    stageName: "Final",
    neutralVenue: true,
    userIsHost: true,
    player: { name: "Você", number: 10, position: "CA", overall: 80 },
    userTeam: { id: "casa", name: "Casa", shortName: "Casa", abbr: "CAS", primary: "#1d4e89", secondary: "#ffffff", strength: 80 },
    cpuTeam: { id: "fora", name: "Fora", shortName: "Fora", abbr: "FOR", primary: "#c0392b", secondary: "#f1c40f", strength: 78 },
    difficulty: 3,
    rules: { goalLimit: 3, halfSeconds: 120, halves: 1, extraHalves: 1, extraSeconds: 45, penalties: true, penaltyRounds: 5, clockScale: 1 },
    ...overrides,
  };
}

/** Troca o `crypto` global por um que devolve os sorteios dados, na ordem. */
function withRolls(rolls, run) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  let index = 0;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      getRandomValues(array) {
        array[0] = Math.floor(rolls[index++ % rolls.length] * 4294967296);
        return array;
      },
    },
  });
  try {
    return run();
  } finally {
    Object.defineProperty(globalThis, "crypto", original);
  }
}

test("isFutsalTheme reconhece só as duas quadras", () => {
  assert.equal(isFutsalTheme("futsal-blue"), true);
  assert.equal(isFutsalTheme("futsal-orange"), true);
  for (const theme of [...NORMAL_FIELD_THEMES, "street"]) assert.equal(isFutsalTheme(theme), false, theme);
});

test("STREET_VARIANTS tem as três ruas com rótulo em português", () => {
  assert.deepEqual(STREET_VARIANTS.map((variant) => variant.id), [0, 1, 2]);
  assert.deepEqual(STREET_VARIANTS.map((variant) => variant.label), ["Rua do bairro", "Terrão", "Quadra da praça"]);
  assert.deepEqual(STREET_VARIANTS.map((variant) => variant.mood), ["day", "sunset", "night"]);
});

test("o tema pedido pelo setup vence sempre (inclusive a rua com variação)", () => {
  for (const theme of ALL_THEMES) {
    const requested = setup({ fieldTheme: theme });
    assert.equal(fieldThemeForMatch(requested), theme);
    // Mesma instância: mesma resposta (cache), sem sortear de novo.
    assert.equal(fieldThemeForMatch(requested), theme);
  }
  for (const variant of [0, 1, 2]) {
    const street = setup({ fieldTheme: "street", streetVariant: variant });
    assert.equal(fieldThemeForMatch(street), "street");
    assert.equal(streetVariantForMatch(street), variant);
  }
});

test("pedido ignorado quando não é um tema conhecido", () => {
  const odd = setup({ fieldTheme: "lava" });
  const theme = fieldThemeForMatch(odd);
  assert.notEqual(theme, "lava");
  assert.ok(ALL_THEMES.includes(theme));
});

test("tema pedido não contamina o sorteio guardado da mesma partida", () => {
  const key = { matchId: "mesma-partida", seed: 77 };
  const automatic = fieldThemeForMatch(setup(key));
  assert.equal(fieldThemeForMatch(setup({ ...key, fieldTheme: "street" })), "street");
  // Setup reconstruído sem pedido (replay): volta o que o sorteio tinha dado.
  assert.equal(fieldThemeForMatch(setup(key)), automatic);
});

test("sorteio: 2% futsal azul, 2% futsal laranja, o resto na rotação dos gramados", () => {
  const futsalBlue = withRolls([0], () => fieldThemeForMatch(setup()));
  const futsalOrange = withRolls([FUTSAL_FIELD_CHANCE + 0.001], () => fieldThemeForMatch(setup()));
  assert.equal(futsalBlue, "futsal-blue");
  assert.equal(futsalOrange, "futsal-orange");
  // A quadra rara não consome a rotação: os quatro gramados seguem a ordem.
  window.localStorage.setItem("futbobo-botao-field-rotation-v1", "0");
  const rotation = withRolls([0.5], () => [0, 1, 2, 3, 4].map(() => fieldThemeForMatch(setup())));
  assert.deepEqual(rotation, ["classic", "vertical", "checker", "diagonal", "classic"]);
  assert.equal(withRolls([FUTSAL_FIELD_CHANCE * 2 + 0.001], () => fieldThemeForMatch(setup())), "vertical");
});

test("sorteio de verdade nunca dá rua e só dá gramado ou uma das duas quadras", () => {
  const seen = new Set();
  for (let index = 0; index < 3000; index += 1) seen.add(fieldThemeForMatch(setup()));
  assert.equal(seen.has("street"), false);
  for (const theme of seen) assert.ok([...NORMAL_FIELD_THEMES, ...FUTSAL_FIELD_THEMES].includes(theme), theme);
  for (const theme of NORMAL_FIELD_THEMES) assert.ok(seen.has(theme), theme);
});

test("streetVariantForMatch é determinística, fica em 0..2 e usa as três ruas", () => {
  const counts = [0, 0, 0];
  for (const seed of [0, 1, 2, -1, -987654, 2 ** 31 - 1, 2 ** 32 + 5, 20260725, 3.7]) {
    const variant = streetVariantForMatch(setup({ seed }));
    assert.ok([0, 1, 2].includes(variant), `seed ${seed}`);
    assert.equal(streetVariantForMatch(setup({ seed })), variant, `seed ${seed}`);
  }
  for (let seed = 0; seed < 600; seed += 1) counts[streetVariantForMatch(setup({ seed }))] += 1;
  for (const count of counts) assert.ok(count > 120, `distribuição ${counts}`);
  // Pedido inválido cai na semente.
  assert.equal(streetVariantForMatch(setup({ seed: 42, streetVariant: 7 })), streetVariantForMatch(setup({ seed: 42 })));
});

test("clima do 3D: estádio igual ao de sempre, uma hora do dia por rua", () => {
  const { STADIUM_MOOD, sceneMoodForMatch } = loadTs("app/botao/three/stadium.ts");
  assert.equal(STADIUM_MOOD.background, "#0a1219");
  assert.equal(STADIUM_MOOD.exposure, 1.08);
  assert.equal(STADIUM_MOOD.sunIntensity, 2.35);
  assert.equal(STADIUM_MOOD.hemisphereIntensity, 1.05);
  assert.deepEqual([...STADIUM_MOOD.sunOffset], [-170, 430, 210]);
  for (const theme of [...NORMAL_FIELD_THEMES, ...FUTSAL_FIELD_THEMES]) assert.equal(sceneMoodForMatch(setup({ fieldTheme: theme })), STADIUM_MOOD, theme);
  const moods = [0, 1, 2].map((variant) => sceneMoodForMatch(setup({ fieldTheme: "street", streetVariant: variant })));
  assert.equal(new Set(moods.map((mood) => mood.background)).size, 3);
  for (const mood of moods) assert.notEqual(mood, STADIUM_MOOD);
});

test("bairro monta nas três ruas (normal e desempenho) dentro do orçamento de draw calls", () => {
  const { Stadium } = loadTs("app/botao/three/stadium.ts");
  const drawCalls = (stadium) => {
    let meshes = 0;
    let shadows = 0;
    stadium.group.traverse((object) => {
      if (!object.isMesh && !object.isPoints) return;
      meshes += 1;
      if (object.castShadow) shadows += 1;
      assert.ok(object.geometry.getAttribute("position")?.count > 0, `malha vazia: ${object.material.type}`);
    });
    return { meshes, shadows };
  };
  const stadiumCalls = drawCalls(new Stadium(setup({ fieldTheme: "classic" }), 4, {}));
  for (const variant of [0, 1, 2]) {
    for (const performance of [false, true]) {
      const stadium = new Stadium(setup({ fieldTheme: "street", streetVariant: variant }), 4, { performance });
      const { meshes, shadows } = drawCalls(stadium);
      assert.ok(meshes <= stadiumCalls.meshes, `rua ${variant}${performance ? " (desempenho)" : ""}: ${meshes} draw calls`);
      assert.ok(shadows <= 6, `rua ${variant}: ${shadows} na sombra`);
      if (performance) assert.equal(shadows, 0);
      // Toda a API que a visão chama continua funcionando sem placas de LED.
      stadium.wave();
      stadium.setTension(0.7);
      stadium.crowdReact("ooh", "user");
      stadium.crowdReact("ooh", "cpu", "QUASE!");
      stadium.crowdReact("groan", "cpu");
      stadium.crowdReact("cheer", "user", null);
      stadium.goalShow("user", "#1d4e89");
      stadium.celebrate("user");
      stadium.cameraFlashes("user", 3.2);
      stadium.goal("top").ripple(150, 1);
      stadium.goal("bottom").wobble();
      for (let frame = 0; frame < 30; frame += 1) stadium.update(1 / 30, frame / 30);
      stadium.goalShow("cpu", "#c0392b", "fim");
      stadium.update(0.5, 2);
      assert.equal(typeof stadium.shadowsChanged(), "boolean");
      assert.deepEqual(stadium.fanAnchor("user"), { x: 0, z: -300 });
      stadium.dispose();
    }
  }
});

test("quadra laranja monta como a azul (sem bandeirinha de escanteio)", () => {
  const { Stadium } = loadTs("app/botao/three/stadium.ts");
  const count = (theme) => {
    let meshes = 0;
    new Stadium(setup({ fieldTheme: theme }), 4, {}).group.traverse((object) => {
      if (object.isMesh || object.isPoints) meshes += 1;
    });
    return meshes;
  };
  assert.equal(count("futsal-orange"), count("futsal-blue"));
  assert.equal(count("futsal-orange"), count("classic") - 1);
});

test("efeitos da rua: pedrisco e poeira sem grama", () => {
  const { Effects } = loadTs("app/botao/three/effects.ts");
  const effects = new Effects({ surface: "street" });
  effects.kickPuff(0, 0, 1, 1, 0);
  effects.kickPuff(40, 40, 0.3);
  effects.slideTrail(10, 10, 0, 1, 1 / 60);
  effects.slideTrail(10, 14, 0, 1, 1 / 60);
});
