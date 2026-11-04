import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as m from "../app/conceitos/v2/systems.ts";

test("Na Bola: every sequence terminates within three touches and cannot play after the whistle", () => {
  let endings = 0;
  function explore(s) {
    assert.ok(s.clock >= 87 && s.clock <= 90);
    assert.equal(s.touches, 3 - s.chain.length);
    assert.ok(s.trust >= 0 && s.trust <= 100);
    if (s.result) {
      endings++;
      assert.strictEqual(m.playPitch(s, "goal"), s);
      return;
    }
    assert.strictEqual(m.playPitch(s, s.holder), s);
    for (const target of ["nico", "caio", "davi", "goal"])
      if (target !== s.holder) explore(m.playPitch(s, target));
  }
  for (let match = 1; match <= 20; match++) explore({ ...m.newPitch(), match });
  assert.ok(endings > 100);
  const afterPass = m.playPitch(m.newPitch(), "nico");
  assert.equal(afterPass.holder, "nico");
  assert.ok(
    m.pitchChance(afterPass, "goal") > m.pitchChance(m.newPitch(), "goal"),
  );
});

test("Estrada: all three destinations are reachable, costs matter and closed branches stay closed", () => {
  const endings = new Set();
  function explore(s) {
    assert.ok(s.energy >= 0 && s.energy <= 6);
    if (s.done) {
      endings.add(s.at);
      assert.strictEqual(m.travel(s, "base"), s);
      return;
    }
    for (const node of m.ROUTE_NODES)
      if (!m.routeReason(s, node.id)) explore(m.travel(s, node.id));
  }
  explore(m.newRoute());
  assert.deepEqual(endings, new Set(["titular", "voltar", "renovar"]));
  const recife = m.travel(m.newRoute(), "recife");
  assert.equal(recife.club, "sport");
  assert.strictEqual(m.travel(recife, "disputa"), recife);
  const tired = { ...m.travel(m.newRoute(), "disputa"), energy: 0 };
  assert.ok(m.routeReason(tired, "classico"));
  assert.equal(m.travel(tired, "recuperar").energy, 3);
});

test("Contrato: 468 offers trade salary, freedom and minutes; no negotiation can loop forever", () => {
  let signed = 0,
    closed = 0,
    counters = 0;
  for (let club = 0; club < 3; club++)
    for (let salary = 18; salary <= 54; salary += 3)
      for (let years = 1; years <= 3; years++)
        for (const starter of [false, true])
          for (const release of [false, true]) {
            let s = m.changeTerms(m.newContract(club), {
              salary,
              years,
              starter,
              release,
            });
            const initial = s;
            for (
              let i = 0;
              i < 4 && !["signed", "closed"].includes(s.status);
              i++
            ) {
              s = m.negotiate(s);
              if (s.status === "counter") counters++;
            }
            assert.ok(s.rounds <= 3);
            assert.ok(["signed", "closed"].includes(s.status));
            if (s.status === "signed") {
              signed++;
              assert.deepEqual(s.signed, s.terms);
              assert.ok(m.contractWeight(s) <= m.CONTRACT_CLUBS[club].cap);
            } else closed++;
            assert.strictEqual(m.negotiate(s), s);
            assert.equal(initial.rounds, 0);
          }
  assert.ok(signed > 0 && closed > 0 && counters > 0);
  const s = m.newContract(1);
  assert.ok(
    m.contractWeight(m.changeTerms(s, { starter: true })) > m.contractWeight(s),
  );
});

test("Entrelinhas: information, tone and the later promise change relationships and concrete outcomes", () => {
  const topics = ["chance", "rotacao", "saida"];
  const endings = new Set();
  for (const heard of [[], ["coach"], ["captain"], ["coach", "captain"]])
    for (const topic of topics)
      for (let tone = 0; tone < 3; tone++) {
        let s = m.newDialogue();
        for (const who of heard) s = m.listen(s, who);
        const spoken = m.speak({ ...s, topic, tone });
        assert.equal(spoken.scene, 1);
        const kept = m.keepPromise(spoken, true),
          broken = m.keepPromise(spoken, false);
        assert.ok(kept.trust > broken.trust);
        assert.notEqual(kept.outcome, broken.outcome);
        assert.strictEqual(m.keepPromise(kept, true), kept);
        endings.add(kept.outcome);
      }
  assert.equal(endings.size, 3);
  const informed = m.speak({
    ...m.listen(m.newDialogue(), "coach"),
    topic: "rotacao",
  });
  const uninformed = m.speak({ ...m.newDialogue(), topic: "rotacao" });
  assert.ok(informed.trust > uninformed.trust);
});

test("Na Mão: order creates combos, time is limited and a spent season cannot resolve twice", () => {
  const plan = (slots) => ({ ...m.newPlan(), slots });
  const good = m.commitPlan(plan(["treino", "classico", "descanso"]));
  const reversed = m.commitPlan(plan(["descanso", "classico", "treino"]));
  assert.ok(good.result.goals > reversed.result.goals);
  assert.ok(good.fitness > reversed.fitness);
  const tooMuch = plan(["treino", "classico", "midia"]);
  assert.equal(m.planCost(tooMuch), 5);
  assert.strictEqual(m.commitPlan(tooMuch), tooMuch);
  assert.strictEqual(m.commitPlan(good), good);
  const next = m.nextPlan(good);
  assert.equal(next.fitness, good.fitness);
  assert.equal(next.season, 2027);
  assert.deepEqual(next.slots, [null, null, null]);
  const moved = m.placeCard(plan(["treino", "descanso", null]), "treino", 1);
  assert.deepEqual(moved.slots, ["descanso", "treino", null]);
});

test("Pulso: promises affect the next event; all binary runs finish in seven gestures or fewer", () => {
  let count = 0;
  function explore(s) {
    assert.equal(s.log.length, s.turn);
    assert.ok(s.values.every((v) => v >= 0 && v <= 8));
    if (s.done) {
      count++;
      assert.strictEqual(m.swipePulse(s, "left"), s);
      return;
    }
    for (const side of ["left", "right"]) explore(m.swipePulse(s, side));
  }
  explore(m.newPulse());
  assert.ok(count > 30);
  let s = m.swipePulse(m.newPulse(), "left");
  assert.equal(m.pulseEvent(s).id, "lista");
  s = m.swipePulse(s, "right");
  assert.equal(m.pulseEvent(s).id, "perna");
});

test("six independent save formats round-trip and discard corrupted or invented data", () => {
  for (const [id, initial] of Object.entries(m.STUDY_INITIALIZERS)) {
    const start = initial();
    assert.deepEqual(
      m.restoreStudy(id, JSON.stringify({ version: 2, run: start })),
      start,
    );
    for (const raw of [
      null,
      "{",
      "null",
      "[]",
      JSON.stringify({ version: 1, run: start }),
      JSON.stringify({
        version: 2,
        run: {
          ...start,
          values: "corrupt",
          slots: "corrupt",
          heard: "corrupt",
          club: 99,
          match: -10,
          visited: ["base", "titular"],
        },
      }),
    ])
      assert.deepEqual(m.restoreStudy(id, raw), start);
  }
  const route = m.travel(m.newRoute(), "recife");
  assert.deepEqual(
    m.restoreStudy(
      "estrada",
      JSON.stringify({
        version: 2,
        run: { ...route, energy: 999, club: "fake" },
      }),
    ),
    route,
  );
  const pulse = m.swipePulse(m.newPulse(), "right");
  assert.deepEqual(
    m.restoreStudy(
      "pulso",
      JSON.stringify({ version: 2, run: { ...pulse, values: [99, 99, 99] } }),
    ),
    pulse,
  );
});

test("exports six new playable routes and reuses local club imagery", async () => {
  const gallery = await readFile(
    new URL("../out/conceitos/index.html", import.meta.url),
    "utf8",
  );
  for (const id of Object.keys(m.STUDY_INITIALIZERS)) {
    assert.ok(gallery.includes(`/conceitos/${id}/`));
    const html = await readFile(
      new URL(`../out/conceitos/${id}/index.html`, import.meta.url),
      "utf8",
    );
    assert.ok(html.includes("Caio") || html.includes("CAIO"));
    assert.ok(html.includes("#jogo") || html.includes("Jogar"));
    assert.ok(
      !html.includes("/concept-art/"),
      "the new world is drawn from game objects, not campaign art",
    );
  }
  for (const club of ["flamengo", "sport", "santos", "fluminense"])
    assert.ok(
      (
        await readFile(
          new URL(`../public/assets/clubs/${club}.png`, import.meta.url),
        )
      ).length > 0,
    );
});
