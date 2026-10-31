import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  GOLDEN_FORMAT,
  GOLDEN_SCENARIOS,
  GOLDEN_SIMS,
  goldenDigest,
  runGoldenScenario,
  runGoldenSim,
} from "../scripts/engine-identity.mjs";
import { loadTs } from "./helpers/ts-loader.mjs";

// Guarda rápida do motor do botão (sem git): reexecuta os cenários gravados antes das mudanças do
// Bobonline e exige o mesmo hash em cada checkpoint. A prova completa é scripts/engine-identity.mjs.
const golden = JSON.parse(readFileSync(new URL("./fixtures/botao-engine-golden.json", import.meta.url), "utf8"));
const revs = JSON.parse(readFileSync(new URL("./fixtures/botao-engine-revs.json", import.meta.url), "utf8"));
const engine = {
  E: loadTs("app/botao/engine.ts"),
  C: loadTs("app/botao/cpu.ts"),
  S: loadTs("app/botao/simulate.ts"),
};
const { BOTAO_ENGINE_REV } = loadTs("app/botao/match-codec.ts");

test("golden e tabela de revisões batem com BOTAO_ENGINE_REV", () => {
  assert.equal(golden.format, GOLDEN_FORMAT);
  assert.equal(golden.engineRev, BOTAO_ENGINE_REV, "golden gravado com outra revisão do motor");
  assert.equal(revs[String(BOTAO_ENGINE_REV)], golden.digest, "a revisão atual não aponta para este golden (física mudou sem subir a revisão?)");
  assert.equal(goldenDigest(golden), golden.digest, "digest do golden não confere com o conteúdo");
  assert.equal(golden.scenarios.length, GOLDEN_SCENARIOS);
  assert.equal(golden.sims.length, GOLDEN_SIMS);
  assert.ok(golden.scenarios.filter((scenario) => scenario.cpuSkill === 1).length >= 10);
  // A tabela só cresce: cada revisão guarda o digest do seu golden.
  for (const [rev, digest] of Object.entries(revs)) {
    assert.match(rev, /^\d+$/);
    assert.match(digest, /^[0-9a-f]{8}$/);
  }
});

for (const scenario of golden.scenarios) {
  test(`motor idêntico ao golden: ${scenario.id}`, () => {
    const run = runGoldenScenario(engine, scenario);
    const limit = Math.max(run.checkpoints.length, scenario.checkpoints.length);
    for (let index = 0; index < limit; index += 1) {
      if (run.checkpoints[index] !== scenario.checkpoints[index]) {
        assert.fail(
          `${scenario.id} diverge no checkpoint ${index} (${run.labels[index] ?? "fim antecipado"}): ` +
            `${run.checkpoints[index]} em vez de ${scenario.checkpoints[index]}`,
        );
      }
    }
    assert.equal(run.result, scenario.result, `${scenario.id}: resultado diferente`);
  });
}

for (const sim of golden.sims) {
  test(`simulateBotaoMatch idêntico ao golden: ${sim.id}`, () => {
    assert.equal(runGoldenSim(engine, sim), sim.result);
  });
}
