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
    "ballon import",
  );

  const start = source.indexOf("  const europeanBallonEligible =");
  const end = source.indexOf("  if (wonBallonDor) {", start);
  if (start < 0 || end < 0) throw new Error("Ballon block not found");
  const replacement = `  const hasBallonProductionAward =\n    hasGoalsOrAssistsAward ||\n    (isKeeper && hasGoalkeeperAward) ||\n    (position.zone === "defesa" && awards.includes("Melhor Defensor") && performanceScore >= 92);\n  const supportingAwardBonus = Math.min(10, awards.reduce((bonus, award) => (\n    bonus +\n    (\n      award === "FIFPRO World XI" ||\n      award === "Melhor da UEFA" ||\n      award.includes("MVP") ||\n      award.includes("Jogador do Ano")\n        ? 2.5\n        : award.includes("Craque") ||\n            award.includes("Chuteira") ||\n            award.includes("Artilheiro") ||\n            award === "Rei da América"\n          ? 1.4\n          : 0\n    )\n  ), 0));\n  const previousBallonDor = affected.awardCabinet["Bola de Ouro"] ?? 0;\n  const ballonEvaluation = evaluateBallonDor({\n    league,\n    inEurope,\n    positionZone: position.zone,\n    isKeeper,\n    overall: nextOverall,\n    performanceScore,\n    reputation: affected.reputation,\n    appearances,\n    goals,\n    assists,\n    cleanSheets,\n    goalsConceded,\n    titleCount,\n    majorClubTitleCount,\n    majorNationalTitle,\n    playsContinental: playsContinental ?? "",\n    continentalChampion,\n    mundialChampion,\n    worldCupGoals,\n    worldCupAssists,\n    supportingAwardBonus,\n    hasProductionAward: hasBallonProductionAward,\n    previousBallonDor,\n  });\n  const europeanBallonEligible = inEurope && ballonEvaluation.eligible;\n  const americanBallonEligible = !inEurope && ballonEvaluation.eligible;\n  const ballonScore = ballonEvaluation.score;\n  const historicBallonSeason = ballonEvaluation.historicSeason;\n  const ballonChance = ballonEvaluation.chance;\n  const wonBallonDor =\n    (europeanBallonEligible || americanBallonEligible) &&\n    seeded(state.seed, state.season * 109) * 100 < ballonChance;\n`;
  source = source.slice(0, start) + replacement + source.slice(end);

  const oldNomination = `  addLostNomination(\n    "Bola de Ouro",\n    hasGoalsOrAssistsAward &&\n      (majorClubTitleCount > 0 || majorNationalTitle) &&\n      (\n        (inEurope && nextOverall >= 81 && performanceScore >= 68 && affected.reputation >= 48 && appearances >= 20) ||\n        (!inEurope && nextOverall >= 85 && performanceScore >= 76 && affected.reputation >= 60 && Boolean(continentalChampion || mundialChampion))\n      ),\n    historicBallonSeason ? 100 : clamp(24 + Math.max(0, ballonScore - 66) * 4.2, 24, 88),\n    313,\n  );`;
  const newNomination = `  addLostNomination(\n    "Bola de Ouro",\n    ballonEvaluation.eligible,\n    historicBallonSeason ? 92 : clamp(18 + Math.max(0, ballonScore - 70) * 2.6, 18, 82),\n    313,\n  );`;
  source = replaceOnce(source, oldNomination, newNomination, "Ballon nomination");
  fs.writeFileSync(path, source);
}

{
  const path = "app/botao/render.ts";
  let source = fs.readFileSync(path, "utf8");
  source = replaceOnce(
    source,
    'import { readableInk } from "./kits";\n',
    'import { readableInk } from "./kits";\nimport { fieldThemeForMatch, type BotaoFieldTheme } from "./field-themes";\n',
    "field theme import",
  );
  const start = source.indexOf("function drawField(");
  const end = source.indexOf("\nfunction drawDisc(", start);
  if (start < 0 || end < 0) throw new Error("drawField block not found");
  const drawField = `function drawFieldSurface(ctx: CanvasRenderingContext2D, theme: BotaoFieldTheme, width: number, height: number) {\n  const gradients: Record<BotaoFieldTheme, [string, string, string]> = {\n    classic: ["#145c3a", "#12522f", "#0f4629"],\n    "checker-night": ["#0b432f", "#0d5138", "#092f25"],\n    "diagonal-sun": ["#2f7d48", "#226b3d", "#185533"],\n    "futsal-blue": ["#0e69ae", "#0b5593", "#08386d"],\n  };\n  const palette = gradients[theme];\n  const gradient = ctx.createLinearGradient(0, 0, 0, height);\n  gradient.addColorStop(0, palette[0]);\n  gradient.addColorStop(0.5, palette[1]);\n  gradient.addColorStop(1, palette[2]);\n  ctx.fillStyle = gradient;\n  ctx.fillRect(0, 0, width, height);\n\n  if (theme === "classic") {\n    ctx.fillStyle = "rgba(255, 255, 255, 0.028)";\n    const stripe = height / 10;\n    for (let index = 0; index < 10; index += 2) ctx.fillRect(0, index * stripe, width, stripe);\n    return;\n  }\n\n  if (theme === "checker-night") {\n    const columns = 8;\n    const rows = 12;\n    const cellW = width / columns;\n    const cellH = height / rows;\n    for (let row = 0; row < rows; row += 1) {\n      for (let column = 0; column < columns; column += 1) {\n        ctx.fillStyle = (row + column) % 2 === 0 ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.055)";\n        ctx.fillRect(column * cellW, row * cellH, cellW, cellH);\n      }\n    }\n    const glow = ctx.createRadialGradient(width / 2, height / 2, 18, width / 2, height / 2, height * 0.68);\n    glow.addColorStop(0, "rgba(120,255,185,.055)");\n    glow.addColorStop(1, "rgba(0,0,0,.12)");\n    ctx.fillStyle = glow;\n    ctx.fillRect(0, 0, width, height);\n    return;\n  }\n\n  if (theme === "diagonal-sun") {\n    ctx.save();\n    ctx.globalAlpha = 0.07;\n    ctx.fillStyle = "#e8ffd8";\n    const band = 42;\n    for (let x = -height; x < width + height; x += band * 2) {\n      ctx.beginPath();\n      ctx.moveTo(x, 0);\n      ctx.lineTo(x + band, 0);\n      ctx.lineTo(x + band + height, height);\n      ctx.lineTo(x + height, height);\n      ctx.closePath();\n      ctx.fill();\n    }\n    ctx.globalAlpha = 0.055;\n    ctx.strokeStyle = "#f4ffe9";\n    ctx.lineWidth = 7;\n    for (const radius of [height * 0.27, height * 0.43, height * 0.59]) {\n      ctx.beginPath();\n      ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);\n      ctx.stroke();\n    }\n    ctx.restore();\n    return;\n  }\n\n  // Quadra rara: piso azul polido, sem textura de grama. As dimensões e a\n  // física continuam idênticas — é um easter egg puramente visual de 2%.\n  ctx.save();\n  for (let y = 18; y < height; y += 24) {\n    ctx.strokeStyle = y % 48 === 18 ? "rgba(255,255,255,.025)" : "rgba(2,19,43,.06)";\n    ctx.lineWidth = 1;\n    ctx.beginPath();\n    ctx.moveTo(0, y);\n    ctx.lineTo(width, y);\n    ctx.stroke();\n  }\n  const shine = ctx.createLinearGradient(0, 0, width, height);\n  shine.addColorStop(0, "rgba(255,255,255,.12)");\n  shine.addColorStop(0.32, "rgba(255,255,255,.015)");\n  shine.addColorStop(0.7, "rgba(0,0,0,.045)");\n  shine.addColorStop(1, "rgba(255,255,255,.055)");\n  ctx.fillStyle = shine;\n  ctx.fillRect(0, 0, width, height);\n  ctx.restore();\n}\n\nfunction drawField(ctx: CanvasRenderingContext2D, userColor: string, cpuColor: string, seed: number, matchId: string) {\n  const { width, height } = FIELD;\n  const theme = fieldThemeForMatch(seed, matchId);\n  ctx.save();\n  ctx.fillStyle = theme === "futsal-blue" ? "#071d39" : theme === "checker-night" ? "#061d16" : "#0b2517";\n  roundRect(ctx, -VIEW_PAD_X, -VIEW_PAD_Y, VIEW_WIDTH, VIEW_HEIGHT, 14);\n  ctx.fill();\n\n  drawFieldSurface(ctx, theme, width, height);\n\n  const lineColor = theme === "futsal-blue" ? "rgba(247,252,255,.72)" : "rgba(245,247,242,.34)";\n  ctx.strokeStyle = lineColor;\n  ctx.lineWidth = theme === "futsal-blue" ? 2 : 1.6;\n  if (theme === "futsal-blue") {\n    ctx.shadowColor = "rgba(130,220,255,.22)";\n    ctx.shadowBlur = 4;\n  }\n  ctx.strokeRect(1, 1, width - 2, height - 2);\n\n  ctx.beginPath();\n  ctx.moveTo(0, height / 2);\n  ctx.lineTo(width, height / 2);\n  ctx.stroke();\n\n  ctx.beginPath();\n  ctx.arc(width / 2, height / 2, FIELD.centerRadius, 0, Math.PI * 2);\n  ctx.stroke();\n  ctx.shadowBlur = 0;\n  ctx.beginPath();\n  ctx.arc(width / 2, height / 2, 3, 0, Math.PI * 2);\n  ctx.fillStyle = theme === "futsal-blue" ? "rgba(250,253,255,.8)" : "rgba(245,247,242,.4)";\n  ctx.fill();\n\n  const areaX = (width - FIELD.areaWidth) / 2;\n  ctx.strokeStyle = theme === "futsal-blue" ? "rgba(247,252,255,.62)" : "rgba(245,247,242,.28)";\n  ctx.strokeRect(areaX, 0, FIELD.areaWidth, FIELD.areaDepth);\n  ctx.strokeRect(areaX, height - FIELD.areaDepth, FIELD.areaWidth, FIELD.areaDepth);\n\n  ctx.fillStyle = theme === "futsal-blue" ? "rgba(250,253,255,.75)" : "rgba(245,247,242,.34)";\n  for (const spotY of [FIELD.penaltyDistance, height - FIELD.penaltyDistance]) {\n    ctx.beginPath();\n    ctx.arc(width / 2, spotY, 2.4, 0, Math.PI * 2);\n    ctx.fill();\n  }\n\n  drawGoal(ctx, 0, -1, cpuColor);\n  drawGoal(ctx, height, 1, userColor);\n  ctx.restore();\n}\n`;
  source = source.slice(0, start) + drawField + source.slice(end);
  source = source.replace("  drawField(ctx, userColors.primary, cpuColors.primary);", "  drawField(ctx, userColors.primary, cpuColors.primary, state.setup.seed, state.setup.matchId);");
  source = source.replace("  drawField(ctx, setup.userTeam.primary, setup.cpuTeam.primary);", "  drawField(ctx, setup.userTeam.primary, setup.cpuTeam.primary, setup.seed, setup.matchId);");
  fs.writeFileSync(path, source);
}

{
  const path = "tests/rendered-html.test.mjs";
  let source = fs.readFileSync(path, "utf8");
  source = source.replace(
    '  assert.match(page, /worldCupGoals >= 8 \\? 24/);\n  assert.match(page, /worldCupBallonChanceFloor/);',
    '  const ballon = await readFile(new URL("../app/career/ballon-dor.ts", import.meta.url), "utf8");\n  assert.match(ballon, /input\\.worldCupGoals >= 8/);\n  assert.match(ballon, /const worldCupFloor = input\\.previousBallonDor === 0 \\? 62/);',
  );

  const testStart = source.indexOf('test("valoriza os prêmios individuais e deixa a Bola de Ouro rara, mas alcançável"');
  const testEnd = source.indexOf('\ntest("registra o Hall da Fama local', testStart);
  if (testStart < 0 || testEnd < 0) throw new Error("Ballon test block not found");
  const newTest = `test("valoriza os prêmios individuais e calibra a Bola de Ouro pelo tamanho do palco", async () => {\n  const page = await readCareerSource();\n  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");\n  const ballon = await readFile(new URL("../app/career/ballon-dor.ts", import.meta.url), "utf8");\n\n  assert.match(page, /evaluateBallonDor/);\n  assert.match(page, /hasBallonProductionAward/);\n  assert.match(ballon, /stage === "minor"/);\n  assert.match(ballon, /input\\.league\\.prestige >= 5/);\n  assert.match(ballon, /input\\.league\\.prestige === 4/);\n  assert.match(ballon, /input\\.league\\.prestige === 3/);\n  assert.match(ballon, /input\\.overall >= 88/);\n  assert.match(ballon, /input\\.performanceScore >= 88/);\n  assert.match(ballon, /globalBreakthrough \\|\\| \\(domesticMiracle && input\\.titleCount >= 2\\)/);\n  assert.match(ballon, /const firstChance = clamp\\(4 \\+ Math\\.max\\(0, score - 76\\) \\* 1\\.65, 4, 46\\)/);\n  assert.match(ballon, /stage === "minor" && !globalBreakthrough \\? historicFloor \\* 0\\.18/);\n  assert.match(ballon, /input\\.worldCupGoals >= 8/);\n  assert.match(page, /Jogador do Ano do \\${leagueLabel}/);\n  assert.match(page, /MVP da Champions League/);\n  assert.match(page, /FIFPRO World XI/);\n  assert.match(page, /function AwardReveal/);\n  assert.match(page, /function AwardCeremony/);\n  assert.match(page, /OS TRÊS FINALISTAS/);\n  assert.match(page, /Revelar vencedor/);\n  assert.match(page, /season-awards-showcase/);\n  assert.match(page, /award-cabinet-feature/);\n  assert.match(styles, /\\.award-finalists/);\n  assert.match(styles, /\\.award-reveal-card\\.award-legendary/);\n  assert.match(styles, /\\.award-cabinet-feature\\.award-legendary/);\n});\n`;
  source = source.slice(0, testStart) + newTest + source.slice(testEnd + 1);

  const insertAt = source.indexOf('\ntest("registra o Hall da Fama local');
  const fieldTest = `\ntest("rotaciona quatro visuais de campo e mantém a quadra azul em dois por cento", async () => {\n  const themes = await readFile(new URL("../app/botao/field-themes.ts", import.meta.url), "utf8");\n  const render = await readFile(new URL("../app/botao/render.ts", import.meta.url), "utf8");\n  assert.match(themes, /classic: 0\\.78/);\n  assert.match(themes, /"checker-night": 0\\.12/);\n  assert.match(themes, /"diagonal-sun": 0\\.08/);\n  assert.match(themes, /"futsal-blue": 0\\.02/);\n  assert.match(render, /fieldThemeForMatch/);\n  assert.match(render, /theme === "futsal-blue"/);\n  assert.match(render, /theme === "checker-night"/);\n  assert.match(render, /theme === "diagonal-sun"/);\n  assert.match(render, /setup\\.seed, setup\\.matchId/);\n});\n`;
  source = source.slice(0, insertAt) + fieldTest + source.slice(insertAt);
  fs.writeFileSync(path, source);
}
