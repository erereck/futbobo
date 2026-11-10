import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Lei do Ex na partida: com a escolha na tela nada anda (relógio, física, CPU, 7 s, pausa do gol,
// festa e câmera do 3D); a pausa do gol começa depois da escolha; "não comemorar" vira o gesto de
// respeito no 3D e a figurinha no 2D. Guardas de fonte (a partida é um componente React com canvas).

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const match = source("app/botao/BotaoMatch.tsx");
const view = source("app/botao/three/Botao3DView.ts");
const css = source("app/botao/botao.css");

test("a escolha congela o laço como a pausa (relógio, 7 s, física, rastro e replay)", () => {
  assert.match(match, /const pausedNow = pausedRef\.current \|\| awaitingFirstTouchRef\.current \|\| formerClubPromptRef\.current;/);
  // A mesa fica no quadro do gol: o 2D desenha uma vez, o 3D não desenha (e não acumula tempo).
  assert.match(match, /if \(formerClubPromptRef\.current\) \{\s*const drawn = promptFrameDrawnRef\.current;[\s\S]{0,160}if \(view3dInstance \|\| drawn\) \{\s*render3dBudgetRef\.current = 0;\s*render3dElapsedRef\.current = 0;\s*return;/);
});

test("a pausa do gol só começa depois da escolha (e o apito final espera)", () => {
  const goalEffect = match.slice(match.indexOf("// -------------------------------------------------------- gol e intervalo"), match.indexOf("// -------------------------------------------------------------- vez da CPU"));
  assert.match(goalEffect, /if \(formerClubPromptRef\.current\) return;\s*const resumeGoal/);
  assert.match(goalEffect, /\[signature, handleEvents, showFlash, paused, setup\.managerMode, formerClubGoalPrompt\]\);/);
  assert.match(goalEffect, /respectGoalRef\.current\s*\? \(goalView \? GOAL_PAUSE_3D_MS : GOAL_PAUSE_MS\) \+ RESPECT_EXTRA_MS/);
  const finishEffect = match.slice(match.indexOf("// ------------------------------------------------------------------- fim"), match.indexOf("// -------------------------------------------------------------- interação"));
  assert.match(finishEffect, /formerClubPromptRef\.current\s*\)\s*return;/);
  assert.match(finishEffect, /\[signature, showFlash, localMatch, formerClubGoalPrompt, setup\.managerMode\]/);
});

test("\"não comemorar\": gesto de respeito no 3D, figurinha no 2D; comemorar segue igual", () => {
  const choose = match.slice(match.indexOf("const chooseFormerClubCelebration"), match.indexOf("// Assinatura do motor"));
  assert.match(choose, /showFlash\("COMEMOROU!", "goal", 1050\);/);
  assert.match(choose, /view\.restrainGoalCelebration\(current\);/);
  assert.match(choose, /setRespectNote\(clubName\);/);
  assert.match(view, /restrainGoalCelebration\(state: BotaoMatchState\) \{[\s\S]{0,200}this\.startGoalShow\(state, goal\.side, false, null, true\);/);
  assert.match(view, /aspect: this\.camera\.aspect,\s*restrained,\s*\}\);/);
  // Só fora do online e do X1 local (o Bobonline não tem ex-clube nem pode parar o relógio dos dois aparelhos).
  assert.match(match, /const formerClubPrompt = !localMatch && !online && mine && event\.byUser && Boolean\(setup\.formerClub\);/);
});

test("a figurinha do 2D é papel do Álbum (dentro do .botao-root) e respeita movimento reduzido", () => {
  const block = css.slice(css.indexOf("/* v97 — Álbum: Lei do Ex no 2D."));
  assert.ok(block.length > 0);
  assert.match(block, /\.botao-root \.botao-respect-note \{[^}]*background: var\(--album-grain\), var\(--album-paper\);/);
  assert.match(block, /\.botao-root \.botao-respect-note \{[^}]*pointer-events: none;/);
  assert.match(block, /@media \(prefers-reduced-motion: reduce\) \{\s*\.botao-root \.botao-respect-note,\s*\.botao-root \.botao-respect-hands \{ animation: none; \}/);
});
