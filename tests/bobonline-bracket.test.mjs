import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./helpers/ts-loader.mjs";

// Chave do Bobonline (design §4.3-§4.4): montagem, folgas, avanço por ramo, W.O., revanche e nomes das fases.
const B = loadTs("app/bobonline/tournament/bracket.ts");
const { createRng, hashSeed } = loadTs("app/botao/rng.ts");

const SIZES = { x1: 2, t4: 4, t8: 8 };
const humans = (count) => Array.from({ length: count }, (_, index) => ({ id: `h${index}`, kind: "human", teamHash: `t${index}` }));
const cpus = (count) => Array.from({ length: count }, (_, index) => ({ id: `cpu:${index}`, kind: "cpu", teamHash: `c${index}` }));
const kindOf = (bracket, id) => bracket.entrants.find((entrant) => entrant.id === id)?.kind;
const joinOrder = (id) => (id.startsWith("h") ? Number(id.slice(1)) : 100 + Number(id.split(":")[1]));

function result(match, winner, extra = {}) {
  const base = { matchId: `K7MPX3-${match.id}-${match.replay}`, winner, homeGoals: winner === "home" ? 2 : 0, awayGoals: winner === "away" ? 2 : 0, homePens: null, awayPens: null, decision: "goal-limit", ...extra };
  return { ...base, resultHash: B.bracketResultHash(base), reportedBy: "host", at: 1000 };
}

/** O que toda chave recém-montada garante. */
function assertFreshBracket(bracket, entrants) {
  const rounds = Math.log2(bracket.size);
  assert.equal(bracket.rounds, rounds);
  assert.equal(bracket.matches.length, bracket.size - 1);
  assert.deepEqual(bracket.entrants, entrants, "a chave guarda os entrantes na ordem de entrada");
  for (let round = 1; round <= rounds; round += 1) {
    const games = bracket.matches.filter((match) => match.round === round);
    assert.deepEqual(games.map((match) => match.id), games.map((_, index) => `r${round}m${index}`));
  }
  const firstRound = bracket.matches.filter((match) => match.round === 1);
  const seated = firstRound.flatMap((match) => [match.home?.entrantId, match.away?.entrantId]).filter(Boolean);
  assert.deepEqual([...seated].sort(), entrants.map((entrant) => entrant.id).sort(), "cada entrante aparece uma vez na rodada 1");
  for (const match of firstRound) {
    assert.ok(match.home || match.away, `${match.id}: folga contra folga`);
    assert.ok(match.home, `${match.id}: o lado presente fica em casa`);
    if (!match.away) {
      assert.equal(match.kind, "bye");
      assert.equal(match.status, "done");
      assert.equal(match.result.walkover, "bye");
      assert.equal(match.result.winner, "home");
      assert.equal(match.result.decision, "walkover");
      continue;
    }
    assert.equal(match.status, "waiting");
    const home = kindOf(bracket, match.home.entrantId);
    const away = kindOf(bracket, match.away.entrantId);
    assert.equal(match.kind, B.matchKind(bracket, match));
    if (home !== away) assert.equal(home, "human", "cpu-human: o humano é o mandante");
    if (home === "human" && away === "human") {
      assert.equal(match.kind, "duel");
      assert.ok(joinOrder(match.home.entrantId) < joinOrder(match.away.entrantId), "duelo: menor joinOrder em casa");
      assert.equal(match.authority, match.home.entrantId);
    }
    if (match.kind === "cpu-human") assert.equal(match.authority, match.home.entrantId);
    if (match.kind === "cpu-cpu") assert.equal(match.authority, null);
    assert.equal(B.authorityFor(bracket, match, joinOrder), match.authority);
  }
}

/** Joga a chave inteira com resultados aleatórios, em ordem aleatória entre ramos (sem barreira de rodada). */
function playOut(bracket, seed) {
  const rng = createRng(hashSeed(seed, "jogar"));
  let current = bracket;
  for (let guard = 0; guard < 20 && !B.championOf(current); guard += 1) {
    const ready = current.matches.filter((match) => match.status !== "done" && match.home && match.away);
    assert.ok(ready.length > 0, "sempre há jogo pronto até sair o campeão");
    const match = rng.pick(ready);
    const winner = rng.chance(0.5) ? "home" : "away";
    const before = current;
    current = B.advanceBracket(current, match.id, result(match, winner), joinOrder);
    assert.notEqual(current, before);
    assert.equal(before.matches.find((item) => item.id === match.id).status, match.status, "advanceBracket não muta a chave antiga");
    const done = current.matches.find((item) => item.id === match.id);
    assert.equal(done.status, "done");
    assert.equal(B.winnerOf(done), (winner === "home" ? match.home : match.away).entrantId);
    // O vencedor aparece no próximo jogo (ou é campeão).
    if (match.round < current.rounds) {
      const next = current.matches.find((item) => item.id === `r${match.round + 1}m${Math.floor(match.index / 2)}`);
      assert.ok([next.home?.entrantId, next.away?.entrantId].includes(B.winnerOf(done)));
      if (next.home && next.away) {
        assert.equal(next.kind, B.matchKind(current, next));
        const homeKind = kindOf(current, next.home.entrantId);
        const awayKind = kindOf(current, next.away.entrantId);
        if (homeKind !== awayKind) assert.equal(homeKind, "human");
        if (homeKind === "human" && awayKind === "human") assert.ok(joinOrder(next.home.entrantId) < joinOrder(next.away.entrantId));
        assert.equal(next.authority, B.authorityFor(current, next, joinOrder));
        assert.equal(next.status, "waiting");
      }
    }
  }
  return current;
}

test("tamanhos 2/4/8 com 2..8 humanos, CPU completando ou não: sem folga contra folga, até o campeão", () => {
  let runs = 0;
  for (const format of ["x1", "t4", "t8"]) {
    const size = SIZES[format];
    for (let count = 2; count <= Math.min(8, size); count += 1) {
      for (const fill of [true, false]) {
        if (format === "x1" && !fill && count < 2) continue;
        const entrants = fill ? [...humans(count), ...cpus(size - count)] : humans(count);
        for (let seed = 1; seed <= 6; seed += 1) {
          const bracket = B.createBracket({ format, entrants, seed: seed * 7919 });
          assert.deepEqual(B.createBracket({ format, entrants, seed: seed * 7919 }), bracket, "determinística por seed");
          assert.ok(bracket.size <= size && bracket.size >= 2);
          // Encolhe só quando menos da metade das vagas teria gente (senão haveria folga contra folga).
          if (fill || count >= size / 2) assert.equal(bracket.size, size);
          else assert.ok(count >= bracket.size / 2 && count <= bracket.size);
          assertFreshBracket(bracket, entrants);
          // Humanos espalhados: com no máximo um humano por jogo possível, ninguém se cruza na rodada 1.
          if (fill && count <= size / 2) {
            assert.equal(bracket.matches.filter((match) => match.round === 1 && match.kind === "duel").length, 0);
          }
          if (fill && count > size / 2) {
            assert.equal(bracket.matches.filter((match) => match.round === 1 && match.kind === "cpu-cpu").length, 0);
          }
          const final = playOut(bracket, seed + count);
          const champion = B.championOf(final);
          assert.ok(entrants.some((entrant) => entrant.id === champion));
          assert.equal(B.eliminatedIn(final, champion), null);
          assert.equal(B.nextMatchFor(final, champion), null);
          for (const entrant of entrants) {
            if (entrant.id === champion) continue;
            const out = B.eliminatedIn(final, entrant.id);
            assert.ok(out, `${entrant.id} caiu em algum jogo`);
            assert.equal(B.loserOf(out), entrant.id);
          }
          runs += 1;
        }
      }
    }
  }
  assert.equal(runs, 132);
});

test("dois humanos num torneio de 8 com CPU só se cruzam na final", () => {
  for (let seed = 1; seed <= 40; seed += 1) {
    const bracket = B.createBracket({ format: "t8", entrants: [...humans(2), ...cpus(6)], seed });
    const halfOf = (id) => {
      const match = bracket.matches.find((item) => item.round === 1 && (item.home?.entrantId === id || item.away?.entrantId === id));
      return match.index < 2 ? "cima" : "baixo";
    };
    assert.notEqual(halfOf("h0"), halfOf("h1"));
  }
});

test("avanço por ramo: o próximo jogo fica pronto quando os dois lados chegam, sem esperar a rodada", () => {
  const entrants = [...humans(3), ...cpus(5)];
  let bracket = B.createBracket({ format: "t8", entrants, seed: 99 });
  const r1 = bracket.matches.filter((match) => match.round === 1);
  // Termina r1m0 e r1m1 (alimentam r2m0); r1m2 e r1m3 continuam em jogo.
  for (const match of r1.slice(0, 2)) bracket = B.advanceBracket(bracket, match.id, result(match, "home"));
  const semi = B.matchById(bracket, "r2m0");
  assert.ok(semi.home && semi.away);
  assert.ok(semi.kind);
  assert.equal(B.matchById(bracket, "r1m2").status, "waiting");
  assert.equal(B.matchById(bracket, "r2m1").home, null);
  assert.equal(B.matchById(bracket, "r2m1").away, null);

  // Um "done" nunca volta nem é sobrescrito; jogo inexistente ou sem lado devolve a mesma chave.
  assert.equal(B.advanceBracket(bracket, r1[0].id, result(r1[0], "away")), bracket);
  assert.equal(B.advanceBracket(bracket, "r9m9", result(r1[0], "home")), bracket);
  assert.equal(B.advanceBracket(bracket, "r3m0", result(r1[0], "home")), bracket);

  // previousMatchOf: o jogo que trouxe cada lado (para a espera da tela de resultado).
  for (const side of [semi.home, semi.away]) {
    const previous = B.previousMatchOf(bracket, side.entrantId, semi);
    assert.ok(previous && previous.round === 1 && B.winnerOf(previous) === side.entrantId);
  }
  assert.equal(B.previousMatchOf(bracket, "h9", semi), null);
  assert.equal(B.previousMatchOf(bracket, semi.home.entrantId, B.matchById(bracket, "r1m0")), null);
  const [top, bottom] = B.feedersOf(bracket, semi);
  assert.deepEqual([top.id, bottom.id], ["r1m0", "r1m1"]);

  // nextMatchFor: quem venceu já está no jogo seguinte; quem perdeu não tem próximo.
  const winner = B.winnerOf(B.matchById(bracket, "r1m0"));
  const loser = B.loserOf(B.matchById(bracket, "r1m0"));
  assert.equal(B.nextMatchFor(bracket, winner).id, "r2m0");
  assert.equal(B.nextMatchFor(bracket, loser), null);
  assert.equal(B.eliminatedIn(bracket, loser).id, "r1m0");
  const waiting = B.matchById(bracket, "r1m3");
  assert.equal(B.nextMatchFor(bracket, waiting.home.entrantId).id, "r1m3");
});

test("folgas: sobem na hora e o vencedor fica escalado no jogo seguinte", () => {
  // Torneio de 4 sem CPU com 3 humanos: um tem folga e já espera na final.
  const bracket = B.createBracket({ format: "t4", entrants: humans(3), seed: 5, now: 777 });
  const bye = bracket.matches.find((match) => match.kind === "bye");
  assert.ok(bye);
  assert.equal(bye.result.at, 777);
  assert.equal(bye.result.reportedBy, "host");
  assert.equal(bye.result.resultHash, B.bracketResultHash(bye.result));
  assert.equal(B.loserOf(bye), null);
  const final = B.matchById(bracket, "r2m0");
  assert.ok([final.home?.entrantId, final.away?.entrantId].includes(bye.home.entrantId));
  assert.equal(B.nextMatchFor(bracket, bye.home.entrantId).id, "r2m0");
  assert.equal(B.previousMatchOf(bracket, bye.home.entrantId, final).kind, "bye");

  // Torneio de 4 com 2 humanos e sem CPU: as duas semis são folga, a final já nasce com os dois.
  const twoOnly = B.createBracket({ format: "t4", entrants: humans(2), seed: 3 });
  assert.equal(twoOnly.size, 4);
  const onlyFinal = B.matchById(twoOnly, "r2m0");
  assert.equal(onlyFinal.kind, "duel");
  assert.equal(onlyFinal.home.entrantId, "h0");
  assert.equal(onlyFinal.authority, "h0");

  // Torneio de 8 com 3 humanos e sem CPU: encolhe para semifinal + final (nada de folga contra folga).
  const shrunk = B.createBracket({ format: "t8", entrants: humans(3), seed: 4 });
  assert.equal(shrunk.size, 4);
  assert.equal(shrunk.rounds, 2);
  assert.equal(B.roundName(shrunk.size, 1), "Semifinal");
  assert.throws(() => B.createBracket({ format: "t4", entrants: humans(5), seed: 1 }), /entrantes/);
});

test("cpu-human: o humano fica em casa e é a autoridade, também nas rodadas seguintes", () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    let bracket = B.createBracket({ format: "t8", entrants: [...humans(1), ...cpus(7)], seed });
    const first = bracket.matches.find((match) => match.round === 1 && match.kind === "cpu-human");
    assert.equal(first.home.entrantId, "h0");
    assert.equal(first.authority, "h0");
    // O humano vence; o adversário seguinte (CPU) vem do outro jogo, que estava em "cima" na chave.
    for (const match of bracket.matches.filter((item) => item.round === 1)) {
      bracket = B.advanceBracket(bracket, match.id, result(match, "home"));
    }
    const semi = B.nextMatchFor(bracket, "h0");
    assert.equal(semi.round, 2);
    assert.equal(semi.kind, "cpu-human");
    assert.equal(semi.home.entrantId, "h0", "humano em casa mesmo vindo do jogo de baixo");
    assert.equal(semi.authority, "h0");
    const cpuMatch = bracket.matches.find((match) => match.round === 2 && match.id !== semi.id);
    assert.equal(cpuMatch.kind, "cpu-cpu");
    assert.equal(cpuMatch.authority, null);
  }
});

test("W.O. duplo: o vencedor do sorteio avança; W.O. comum também", () => {
  let bracket = B.createBracket({ format: "t4", entrants: humans(4), seed: 12 });
  const semi = B.matchById(bracket, "r1m0");
  const coin = createRng(hashSeed(4242, "sorteio")).chance(0.5) ? "home" : "away";
  bracket = B.advanceBracket(bracket, semi.id, result(semi, coin, { decision: "walkover", walkover: "double", homeGoals: 0, awayGoals: 0 }));
  const advanced = (coin === "home" ? semi.home : semi.away).entrantId;
  assert.equal(B.winnerOf(B.matchById(bracket, "r1m0")), advanced);
  assert.equal(B.nextMatchFor(bracket, advanced).id, "r2m0");
  const other = B.matchById(bracket, "r1m1");
  bracket = B.advanceBracket(bracket, other.id, result(other, "away", { decision: "walkover", walkover: "abandon", homeGoals: 0, awayGoals: 3 }));
  const final = B.matchById(bracket, "r2m0");
  assert.equal(final.kind, "duel");
  bracket = B.advanceBracket(bracket, "r2m0", result(final, "home"));
  assert.equal(B.championOf(bracket), final.home.entrantId);
  assert.equal(B.eliminatedIn(bracket, final.away.entrantId).id, "r2m0");
});

test("X1: revanche troca mandante e visitante, sobe o replay e reabre o jogo", () => {
  let bracket = B.createBracket({ format: "x1", entrants: [humans(2)[1], humans(2)[0]], seed: 8 });
  const first = B.matchById(bracket, "r1m0");
  assert.equal(bracket.size, 2);
  assert.equal(first.kind, "duel");
  assert.equal(first.home.entrantId, "h1", "sem joinOrderOf, vale a ordem de entrada da lista");
  const ordered = B.createBracket({ format: "x1", entrants: humans(2), seed: 8, joinOrderOf: joinOrder });
  assert.equal(B.matchById(ordered, "r1m0").home.entrantId, "h0");

  assert.equal(B.rematchMatch(bracket, "r1m0"), bracket, "revanche só depois do fim");
  bracket = B.advanceBracket(bracket, "r1m0", result(first, "away"));
  assert.equal(B.championOf(bracket), "h0");
  const rematch = B.rematchMatch(bracket, "r1m0");
  const again = B.matchById(rematch, "r1m0");
  assert.equal(again.replay, 1);
  assert.equal(again.home.entrantId, "h0");
  assert.equal(again.away.entrantId, "h1");
  assert.equal(again.authority, "h0");
  assert.equal(again.kind, "duel");
  assert.equal(again.status, "waiting");
  assert.equal(again.result, null);
  assert.equal(B.championOf(rematch), null);
  assert.equal(B.authorityFor(rematch, again, joinOrder), "h0", "depois da troca, a autoridade é o novo mandante");
  const third = B.rematchMatch(B.advanceBracket(rematch, "r1m0", result(again, "home")), "r1m0");
  assert.equal(B.matchById(third, "r1m0").replay, 2);
  assert.equal(B.matchById(third, "r1m0").home.entrantId, "h1");
  // Torneio não tem revanche.
  let t4 = B.createBracket({ format: "t4", entrants: humans(4), seed: 1 });
  t4 = B.advanceBracket(t4, "r1m0", result(B.matchById(t4, "r1m0"), "home"));
  assert.equal(B.rematchMatch(t4, "r1m0"), t4);
});

test("roundName e roundPhrase", () => {
  assert.equal(B.roundName(2, 1), "X1");
  assert.equal(B.roundName(4, 1), "Semifinal");
  assert.equal(B.roundName(4, 2), "Final");
  assert.equal(B.roundName(8, 1), "Quartas de final");
  assert.equal(B.roundName(8, 2), "Semifinal");
  assert.equal(B.roundName(8, 3), "Final");
  assert.equal(B.roundPhrase(8, 1), "nas quartas de final");
  assert.equal(B.roundPhrase(8, 2), "na semifinal");
  assert.equal(B.roundPhrase(8, 3), "na final");
  assert.equal(B.roundPhrase(4, 1), "na semifinal");
  assert.equal(B.roundPhrase(2, 1), "na final");
  assert.equal(B.matchIdFor(3, 0), "r3m0");
});

test("hash do resultado ignora quem relatou e quando", () => {
  const match = B.matchById(B.createBracket({ format: "x1", entrants: humans(2), seed: 1 }), "r1m0");
  const a = result(match, "home");
  const b = { ...a, reportedBy: "h1", at: 99999 };
  assert.equal(B.bracketResultHash(a), B.bracketResultHash(b));
  assert.notEqual(B.bracketResultHash(a), B.bracketResultHash({ ...a, homeGoals: 3 }));
  assert.match(B.bracketResultHash(a), /^[0-9a-f]{8}$/);
});
