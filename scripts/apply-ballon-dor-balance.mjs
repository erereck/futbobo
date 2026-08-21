import fs from "node:fs";

function replaceOnce(source, from, to, label) {
  if (source.includes(to)) return source;
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(from, index + from.length) >= 0) throw new Error(`Ambiguous ${label}`);
  return source.slice(0, index) + to + source.slice(index + from.length);
}

{
  const path = "app/career/simulation.ts";
  let source = fs.readFileSync(path, "utf8");

  source = replaceOnce(
    source,
    'import { worldFinalOpponentForSeason } from "./world-club-competitions";\n',
    'import { worldFinalOpponentForSeason } from "./world-club-competitions";\nimport { evaluateBallonDor } from "./ballon-dor";\n',
    "Ballon evaluator import",
  );

  const start = source.indexOf("  const europeanBallonEligible =");
  const end = source.indexOf("  if (wonBallonDor) {", start);
  if (start < 0 || end < 0) throw new Error("Ballon block not found");

  const replacement = `  const hasBallonProductionAward =\n    hasGoalsOrAssistsAward ||\n    (isKeeper && hasGoalkeeperAward) ||\n    (position.zone === "defesa" && awards.includes("Melhor Defensor") && performanceScore >= 92);\n  const supportingAwardBonus = Math.min(10, awards.reduce((bonus, award) => (\n    bonus +\n    (\n      award === "FIFPRO World XI" ||\n      award === "Melhor da UEFA" ||\n      award.includes("MVP") ||\n      award.includes("Jogador do Ano")\n        ? 2.5\n        : award.includes("Craque") ||\n            award.includes("Chuteira") ||\n            award.includes("Artilheiro") ||\n            award === "Rei da América"\n          ? 1.4\n          : 0\n    )\n  ), 0));\n  const previousBallonDor = affected.awardCabinet["Bola de Ouro"] ?? 0;\n  const ballonEvaluation = evaluateBallonDor({\n    league,\n    inEurope,\n    positionZone: position.zone,\n    isKeeper,\n    overall: nextOverall,\n    performanceScore,\n    reputation: affected.reputation,\n    appearances,\n    goals,\n    assists,\n    cleanSheets,\n    goalsConceded,\n    titleCount,\n    majorClubTitleCount,\n    majorNationalTitle,\n    playsContinental: playsContinental ?? "",\n    continentalChampion,\n    mundialChampion,\n    worldCupGoals,\n    worldCupAssists,\n    supportingAwardBonus,\n    hasProductionAward: hasBallonProductionAward,\n    previousBallonDor,\n  });\n  const europeanBallonEligible = inEurope && ballonEvaluation.eligible;\n  const americanBallonEligible = !inEurope && ballonEvaluation.eligible;\n  const ballonScore = ballonEvaluation.score;\n  const historicBallonSeason = ballonEvaluation.historicSeason;\n  const ballonChance = ballonEvaluation.chance;\n  const wonBallonDor =\n    (europeanBallonEligible || americanBallonEligible) &&\n    seeded(state.seed, state.season * 109) * 100 < ballonChance;\n`;
  source = source.slice(0, start) + replacement + source.slice(end);

  const nominationStart = source.indexOf('  addLostNomination(\n    "Bola de Ouro",');
  const nominationEnd = source.indexOf('  addLostNomination(\n    `Jogador do Ano do ${leagueLabel}`', nominationStart);
  if (nominationStart < 0 || nominationEnd < 0) throw new Error("Ballon nomination block not found");
  const nominationReplacement = `  addLostNomination(\n    "Bola de Ouro",\n    ballonEvaluation.eligible,\n    historicBallonSeason ? 92 : clamp(18 + Math.max(0, ballonScore - 70) * 2.6, 18, 82),\n    313,\n  );\n`;
  source = source.slice(0, nominationStart) + nominationReplacement + source.slice(nominationEnd);

  fs.writeFileSync(path, source);
}

{
  const path = "tests/rendered-html.test.mjs";
  let source = fs.readFileSync(path, "utf8");

  const worldCupStart = source.indexOf("  assert.match(page, /worldCupGoals >= 8");
  const worldCupSecond = source.indexOf("  assert.match(page, /worldCupBallonChanceFloor/);", worldCupStart);
  if (worldCupStart < 0 || worldCupSecond < 0) throw new Error("World Cup Ballon assertions not found");
  const worldCupEnd = source.indexOf("\n", worldCupSecond);
  const worldCupReplacement = `  const ballon = await readFile(new URL("../app/career/ballon-dor.ts", import.meta.url), "utf8");\n  assert.match(ballon, /input\\.worldCupGoals >= 8/);\n  assert.match(ballon, /const worldCupFloor = input\\.previousBallonDor === 0 \\? 62/);`;
  source = source.slice(0, worldCupStart) + worldCupReplacement + source.slice(worldCupEnd);

  const testStart = source.indexOf('test("valoriza os prêmios individuais e deixa a Bola de Ouro rara, mas alcançável"');
  const testEnd = source.indexOf('\ntest("registra o Hall da Fama local', testStart);
  if (testStart < 0 || testEnd < 0) throw new Error("Ballon test block not found");

  const newTest = `test("valoriza os prêmios individuais e calibra a Bola de Ouro pelo tamanho do palco", async () => {\n  const page = await readCareerSource();\n  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");\n  const ballon = await readFile(new URL("../app/career/ballon-dor.ts", import.meta.url), "utf8");\n\n  assert.match(page, /evaluateBallonDor/);\n  assert.match(page, /hasBallonProductionAward/);\n  assert.match(ballon, /stage === "minor"/);\n  assert.match(ballon, /input\\.league\\.prestige >= 5/);\n  assert.match(ballon, /input\\.league\\.prestige === 4/);\n  assert.match(ballon, /input\\.league\\.prestige === 3/);\n  assert.match(ballon, /input\\.overall >= 88/);\n  assert.match(ballon, /globalBreakthrough/);\n  assert.match(ballon, /repeatMultiplier/);\n  assert.match(ballon, /Math\\.max\\(0\\.0004, 0\\.006 \\* 0\\.55 \\*\\* \\(previous - 7\\)\\)/);\n  assert.match(ballon, /stage === "minor" && !globalBreakthrough \\? historicFloor \\* 0\\.18/);\n  assert.match(ballon, /input\\.isKeeper \\? -5/);\n  assert.match(ballon, /input\\.positionZone === "defesa" \\? -3/);\n  assert.match(page, /const leagueGoldenBootLine = 28 \\+ Math\\.floor\\([\\s\\S]*\\* 9\\)/);\n  assert.match(page, /const leagueAssistKingLine = 18 \\+ Math\\.floor\\([\\s\\S]*\\* 7\\)/);\n  assert.match(page, /goals >= europeanGoldenShoeLine/);\n  assert.match(page, /FIFPRO World XI/);\n  assert.match(styles, /\\.award-card/);\n});\n`;

  source = source.slice(0, testStart) + newTest + source.slice(testEnd);
  fs.writeFileSync(path, source);
}
