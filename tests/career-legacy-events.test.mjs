import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs, stubBrowser } from "./helpers/ts-loader.mjs";

stubBrowser();
const { CLUBS } = loadTs("app/game-data.ts");
const { LEGACY_EVENTS } = loadTs("app/career-drama-legacy.ts");
const { ALL_PRO_EVENTS, initialState } = loadTs("app/career/state.ts");
const { eligibleEvents } = loadTs("app/career/events.ts");

// Eventos antigos cujas escolhas foram reescritas (os IDs ficam: estão nos saves).
const REWRITTEN_IDS = [
  "coach-fired",
  "mysterious",
  "mega-conflito-diretoria-tecnico",
  "mega-vazamento-tatico",
  "backstage-visualizacao-antes-da-final",
  "backstage-pulseira-de-sono-monitorado",
  "backstage-votacao-do-hino-do-vestiario",
  "backstage-prospecto-comparado-a-voce",
  "backstage-coordenador-de-base-pede-opiniao",
  "drama-mid-thirties-body-check",
  "drama-back-line-communication",
  "new-keeper-camera",
];

// Rótulo da dica -> campo do Effect. Toda seta precisa bater com o sinal do efeito.
const HINT_FIELDS = {
  grupo: "morale",
  moral: "morale",
  "liderança": "leadership",
  "físico": "fitness",
  ovr: "ovr",
  minutos: "minutes",
  "título": "titleBoost",
  torcida: "fans",
  "reputação": "reputation",
  disciplina: "discipline",
  "equilíbrio": "lifeBalance",
  imprensa: "mediaRelation",
  dinheiro: "money",
  seguidores: "followers",
  "impacto social": "charity",
  "lesão": "injuryRisk",
};

const careerState = (extra = {}) => ({
  ...initialState(123),
  phase: "career",
  currentClubId: CLUBS[0].id,
  currentLeagueId: CLUBS[0].leagueId,
  academyClubId: CLUBS[0].id,
  contractYears: 2,
  squadRole: "titular",
  ...extra,
});

const seasonsAt = (clubId, count) =>
  Array.from({ length: count }, (_, index) => ({ season: 2030 + index, clubId, age: 25 + index }));

function hintProblems(event) {
  const problems = [];
  for (const choice of event.choices) {
    const where = `${event.id} / ${choice.label}`;
    if (choice.luck) {
      const shown = Number(/^(\d+)%/.exec(choice.hint)?.[1]);
      if (shown !== choice.luck.chance) problems.push(`${where}: dica mostra ${shown}%, chance é ${choice.luck.chance}%`);
      continue;
    }
    for (const segment of choice.hint.split("·").map((part) => part.trim())) {
      const arrow = /(↑+|↓+)$/.exec(segment);
      if (!arrow) continue;
      const label = segment.slice(0, -arrow[1].length).trim().toLowerCase();
      const field = HINT_FIELDS[label];
      if (!field) {
        problems.push(`${where}: rótulo sem campo conhecido "${label}"`);
        continue;
      }
      const value = choice.effect[field] ?? 0;
      const up = arrow[1].startsWith("↑");
      if (up ? value <= 0 : value >= 0) problems.push(`${where}: "${segment}" mas ${field} = ${value}`);
    }
  }
  return problems;
}

test("IDs são únicos em todo o catálogo de eventos profissionais", () => {
  const seen = new Set();
  const duplicates = [];
  for (const event of ALL_PRO_EVENTS) {
    if (seen.has(event.id)) duplicates.push(event.id);
    seen.add(event.id);
  }
  assert.deepEqual(duplicates, []);
  for (const event of LEGACY_EVENTS) assert.ok(seen.has(event.id), `${event.id} fora do ALL_PRO_EVENTS`);
});

test("eventos novos e reescritos têm escolhas completas e dicas honestas", () => {
  const rewritten = REWRITTEN_IDS.map((id) => ALL_PRO_EVENTS.find((event) => event.id === id));
  rewritten.forEach((event, index) => assert.ok(event, `${REWRITTEN_IDS[index]} sumiu do catálogo`));
  for (const event of [...LEGACY_EVENTS, ...rewritten]) {
    assert.ok(event.title.trim() && event.description.trim(), event.id);
    assert.ok(event.choices.length >= 2, `${event.id}: menos de duas escolhas`);
    for (const choice of event.choices) {
      assert.ok(choice.label.trim() && choice.hint.trim() && choice.result.trim(), `${event.id}: escolha incompleta`);
      if (choice.luck) assert.ok(choice.luck.successText.trim() && choice.luck.failureText.trim(), `${event.id}: sorte sem texto`);
    }
  }
  assert.deepEqual([...LEGACY_EVENTS, ...rewritten].flatMap(hintProblems), []);
});

test("toda chance de sorte do catálogo fica entre 1% e 99%", () => {
  for (const event of ALL_PRO_EVENTS) {
    for (const choice of event.choices) {
      if (!choice.luck) continue;
      assert.ok(choice.luck.chance >= 1 && choice.luck.chance <= 99, `${event.id}: ${choice.luck.chance}%`);
    }
  }
});

test("um veterano de 41 anos com 80 de geral ainda recebe decisões de fim de carreira", () => {
  const ids = eligibleEvents(careerState({ age: 41, overall: 80, potential: 84 })).map((event) => event.id);
  const veteranIds = LEGACY_EVENTS.filter((event) => (event.minAge ?? 0) >= 36).map((event) => event.id);
  assert.ok(veteranIds.length >= 5, "poucos eventos de veterano");
  assert.ok(ids.some((id) => veteranIds.includes(id)), "nenhum evento de veterano elegível aos 41");
  // Os de 36+ não aparecem para um jogador no meio da carreira.
  const midCareer = eligibleEvents(careerState({ age: 27, overall: 80 })).map((event) => event.id);
  assert.equal(midCareer.some((id) => veteranIds.includes(id)), false);
});

test("eventos de lealdade exigem temporadas seguidas no clube atual", () => {
  const clubId = CLUBS[0].id;
  const otherClubId = CLUBS[1].id;
  const loyalty = LEGACY_EVENTS.filter((event) => event.minClubSeasons !== undefined);
  assert.ok(loyalty.length >= 2);
  const eligibleWith = (history) => eligibleEvents(careerState({ age: 31, overall: 80, history })).map((event) => event.id);
  const longStay = eligibleWith(seasonsAt(clubId, 8));
  for (const event of loyalty) assert.ok(longStay.includes(event.id), `${event.id} deveria aparecer após 8 temporadas`);
  // Oito temporadas, mas a última foi em outro clube: a contagem recomeça.
  const justArrived = eligibleWith([...seasonsAt(clubId, 7), { season: 2037, clubId: otherClubId, age: 32 }]);
  for (const event of loyalty) assert.equal(justArrived.includes(event.id), false, `${event.id} com zero temporadas no clube`);
});

test("apostas: só o desfecho descoberto carrega banimento", () => {
  const betting = LEGACY_EVENTS.filter((event) => event.tag === "INTEGRIDADE");
  assert.ok(betting.length >= 1);
  const yellow = LEGACY_EVENTS.find((event) => event.id === "legacy-betting-yellow-card");
  const accept = yellow.choices.find((choice) => choice.luck);
  assert.equal(accept.luck.failureEffect.banSeasons, 2);
  assert.equal(accept.luck.successEffect.banSeasons, undefined);
  assert.match(accept.hint, /banimento de 2 anos/);
  for (const event of betting) {
    for (const choice of event.choices) {
      assert.equal(choice.effect.banSeasons, undefined, `${event.id}: banimento garantido sem sorteio`);
      if (!choice.luck?.failureEffect.banSeasons) continue;
      assert.match(choice.hint, /banimento/, `${event.id}: dica não avisa do banimento`);
    }
  }
});
