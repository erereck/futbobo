import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const outputRoot = new URL("../out/", import.meta.url);
const careerSourceFiles = [
  "../app/page.tsx",
  "../app/components/career/CareerGame.tsx",
  "../app/components/career/CareerPrimitives.tsx",
  "../app/components/career/TransferMarketScreen.tsx",
  "../app/components/career/PlayerCreationV2.tsx",
  "../app/components/career/CareerExtraStats.tsx",
  "../app/components/career/CareerReworkPanels.tsx",
  "../app/components/career/CareerTimeline.tsx",
  "../app/components/career/CareerWorld.tsx",
  "../app/components/shell/FutboboShell.tsx",
  "../app/components/shell/ShellUtilityScreens.tsx",
  "../app/career/model.ts",
  "../app/career/shared.ts",
  "../app/career/sponsors.ts",
  "../app/career/state.ts",
  "../app/career/academy.ts",
  "../app/career/performance.ts",
  "../app/career/transfer-market.ts",
  "../app/career/events.ts",
  "../app/career/simulation.ts",
];

async function readCareerSource() {
  return (await Promise.all(careerSourceFiles.map((file) => readFile(new URL(file, import.meta.url), "utf8")))).join("\n");
}

test("mantém a rota da carreira pequena e separa o monólito por domínio", async () => {
  const route = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const architecture = await readFile(new URL("../app/career/README.md", import.meta.url), "utf8");
  assert.ok(route.split("\n").length <= 10);
  assert.match(route, /import FutboboShell from "\.\/components\/shell\/FutboboShell"/);
  for (const moduleName of ["model", "shared", "sponsors", "state", "academy", "performance", "transfer-market", "events", "simulation"]) {
    assert.ok(architecture.includes("`" + moduleName + ".ts`"));
  }
});

test("mostra a versao comunitaria no rodape do menu inicial", async () => {
  const pageSource = await readCareerSource();
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(pageSource, /className="welcome-version"/);
  assert.match(pageSource, /v92 · DONO DA ÁREA/);
  assert.match(styles, /\.welcome-version/);
});

test("aplica o redesign Matchday Editorial com fontes offline e layouts realmente responsivos", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const premium = await readFile(new URL("../app/premium.css", import.meta.url), "utf8");
  const botao = await readFile(new URL("../app/botao/botao.css", import.meta.url), "utf8");
  const fonts = await readdir(new URL("../public/fonts/", import.meta.url));

  assert.match(layout, /import "\.\/premium\.css"/);
  assert.match(layout, /localFont/);
  assert.match(layout, /--font-barlow-condensed/);
  assert.match(layout, /--font-manrope/);
  assert.match(premium, /Matchday Editorial redesign/);
  assert.match(premium, /grid-template-columns: 264px minmax\(0,1fr\)/);
  assert.match(premium, /grid-template-columns: repeat\(12,minmax\(0,1fr\)\)/);
  assert.match(premium, /@media \(max-width: 540px\)/);
  assert.match(premium, /height: 100dvh/);
  assert.match(premium, /scrollbar-gutter: stable/);
  assert.match(premium, /\.career-tab-profile \.trophy-gallery \{/);
  assert.match(premium, /\.career-tab-legacy \.legacy-grid \.metric \{/);
  assert.match(premium, /\.career-shell > \.result-stage \.mobile-action-dock \{/);
  assert.match(botao, /grid-template-columns: minmax\(220px,\.72fr\) minmax\(340px,440px\) minmax\(220px,\.72fr\)/);
  assert.match(botao, /width: min\(100%, 400px, calc\(\(100dvh - 160px\) \* 316 \/ 516\)\)/);
  assert.match(botao, /aspect-ratio: 316 \/ 516/);
  assert.deepEqual(fonts.sort(), [
    "barlow-condensed-600.woff2",
    "barlow-condensed-700.woff2",
    "barlow-condensed-800.woff2",
    "barlow-condensed-900.woff2",
    "manrope-latin.woff2",
  ]);
});

test("adiciona desafio diario, avaliacao e departamento medico sem alterar a navegacao da carreira", async () => {
  const page = await readCareerSource();
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /const CHALLENGE_SAVE_KEY = "futbobo:challenge-save:v1"/);
  assert.match(page, /function dailyChallenge/);
  assert.match(page, /Todos começam iguais\./);
  assert.match(page, /function seasonAverageRating/);
  assert.match(page, /AVALIAÇÃO MÉDIA/);
  assert.match(page, /type MedicalRecord/);
  assert.match(page, /DEPARTAMENTO MÉDICO/);
  assert.match(page, /medicalHistory: medicalRecord/);
  assert.match(styles, /\.welcome-layout/);
  assert.match(styles, /@media \(min-width: 900px\)/);
  assert.match(styles, /\.season-rating-card/);
  assert.match(styles, /\.medical-department/);
  assert.match(page, /<nav className="bottom-nav"/);
});

test("fecha a Copa do Mundo com estatisticas completas e impacto forte na Bola de Ouro", async () => {
  const page = await readCareerSource();
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /type TournamentStats/);
  assert.match(page, /function simulatedWorldCupStats/);
  assert.match(page, /groupAppearances/);
  assert.match(page, /knockoutAppearances/);
  assert.match(page, /RELATÓRIO DA COPA DO MUNDO/);
  assert.match(page, /FASE DE GRUPOS · SIMULADA/);
  const ballon = await readFile(new URL("../app/career/ballon-dor.ts", import.meta.url), "utf8");
  assert.match(ballon, /input\.worldCupGoals >= 8/);
  assert.match(ballon, /const worldCupFloor = input\.previousBallonDor === 0 \? 62/);
  assert.match(page, /worldCupBallonSurge \? 68/);
  assert.match(page, /Artilheiro da Copa do Mundo/);
  assert.match(styles, /\.world-cup-stat-report/);
  assert.match(styles, /\.world-cup-ballon-surge/);
});

test("fecha as seis novas ligas com acesso e torneio asiatico", async () => {
  const gameData = await readFile(new URL("../app/game-data.ts", import.meta.url), "utf8");
  const page = await readCareerSource();
  const sync = await readFile(new URL("../scripts/sync-football-assets.mjs", import.meta.url), "utf8");

  for (const leagueId of [
    "saudi-pro-league",
    "j1-league",
    "k-league",
    "csl",
    "brasileirao-b",
    "championship",
  ]) {
    assert.match(gameData, new RegExp(`id: "${leagueId}"`));
    assert.match(sync, new RegExp(`"${leagueId}"|${leagueId}:`));
  }
  assert.match(page, /currentLeagueId/);
  assert.match(page, /league\.id === "brasileirao-b" && leaguePosition <= 4/);
  assert.match(page, /championshipPlayoffPromotion/);
  assert.match(page, /isSecondDivision[\s\S]*cupChampion/);
  assert.match(page, /AFC Champions League Elite/);
  assert.match(sync, /afcChampions\.png/);
  assert.match(sync, /china: "cn"/);
  await readFile(new URL("../public/assets/flags/china.png", import.meta.url));
  await readFile(new URL("../public/assets/competitions/afcChampions.png", import.meta.url));
  for (const leagueId of [
    "saudi-pro-league",
    "j1-league",
    "k-league",
    "csl",
    "brasileirao-b",
    "championship",
  ]) {
    await readFile(new URL(`../public/assets/competitions/leagues/${leagueId}.png`, import.meta.url));
    await readFile(new URL(`../public/assets/competitions/cups/${leagueId}.png`, import.meta.url));
  }
});

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    return entry.isDirectory() ? walk(target) : [target];
  }));
  return nested.flat();
}

test("exporta uma página estática pronta para o GitHub Pages", async () => {
  const html = await readFile(new URL("index.html", outputRoot), "utf8");
  assert.match(html, /<html lang="pt-BR"/);
  assert.match(html, /Futbobo/);
  assert.match(html, /Sua carreira, seu legado/i);
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /og-v6\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("inclui o conteúdo central do jogo no bundle", async () => {
  const files = await walk(outputRoot);
  const scripts = files.filter((file) => file.pathname.endsWith(".js"));
  const bundle = (await Promise.all(scripts.map((file) => readFile(file, "utf8")))).join("\n");

  for (const content of [
    "Athletico-PR",
    "Flamengo",
    "Palmeiras",
    "Remo",
    "Goleiro",
    "Centroavante",
    "País da base",
    "Brasileirão",
    "Copa do Brasil",
    "Libertadores",
    "Mundial de Clubes",
    "Premier League",
    "Real Madrid",
    "Champions League",
    "Europa League",
    "Conference League",
    "Copa de Campeões Concacaf",
    "Liga Profesional Argentina",
    "Liga MX",
    "Major League Soccer",
    "Copa do Mundo",
    "Copa América",
    "Eurocopa",
    "Jogos Olímpicos",
    "CENTRAL DA SELEÇÃO",
    "Pedir transferência",
    "Aposentar",
    "Pendurar as chuteiras agora",
    "Rota alternativa",
    "VITRINE EUROPEIA",
    "CONSEQUÊNCIAS DA ESCOLHA",
    "META DO TREINADOR",
    "CONTRATO E ELENCO",
    "ÍNDICE DE LEGADO",
    "CONQUISTAS",
    "Fla-Flu",
  ]) {
    assert.match(bundle, new RegExp(content, "i"));
  }
});

test("mantém o novo equilíbrio de progressão, mercado e clubes brasileiros", async () => {
  const gameData = await readFile(new URL("../app/game-data.ts", import.meta.url), "utf8");
  const page = await readCareerSource();
  const brazilBlock = gameData.slice(
    gameData.indexOf("const BRAZIL_CLUBS"),
    gameData.indexOf("const EUROPE_CLUBS"),
  );

  assert.equal((brazilBlock.match(/reputation: 5/g) ?? []).length, 2);
  assert.equal((brazilBlock.match(/strength: \d+/g) ?? []).length, 20);
  assert.match(page, /brasileirao: 0\.42/);
  assert.match(page, /cupLoadFactor/);
  assert.match(page, /continentalLoadFactor/);
  assert.match(page, /}, 5000\);/);
  assert.match(page, /overall - 1/);
  assert.match(page, /function selectTransferOffers/);
  assert.match(page, /extraMarketOffers/);
  assert.match(page, /europeanDevelopmentBonus/);
  assert.match(page, /retirement-confirm/);
});

test("mantém a carreira encaixada na tela mobile com ações fixas", async () => {
  const page = await readCareerSource();
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /mobile-action-dock/);
  assert.match(page, /career-phase-\$\{game\.phase\}/);
  assert.match(styles, /@media \(max-width: 540px\)/);
  assert.match(styles, /\.career-shell \{[\s\S]*height: 100%/);
  assert.match(styles, /\.mobile-action-dock \{[\s\S]*position: fixed/);
  assert.match(styles, /\.event-stage \{[\s\S]*grid-template-rows: auto auto minmax\(0, 1fr\)[\s\S]*overflow-y: hidden !important/);
  assert.match(styles, /\.event-card \{[\s\S]*position: relative/);
});

test("aplica o equilíbrio levemente mais favorável sem liberar títulos fáceis", async () => {
  const page = await readCareerSource();
  const systems = await readFile(new URL("../app/career-systems.ts", import.meta.url), "utf8");

  assert.match(page, /fateRoll < 0\.18/);
  assert.match(page, /roleScore >= 5 \? 33[\s\S]*roleScore >= -5 \? 19 : 11/);
  assert.match(page, /affected\.age <= 19\) development = growthRoll < 0\.32 \? 0/);
  assert.match(page, /seriousInjuryChance = 0\.038/);
  assert.match(page, /playerImpact \* 0\.36/);
  assert.match(page, /,\s*1,\s*27,/);
  assert.match(page, /,\s*1,\s*20\);/);
  assert.match(systems, /penalty: role === "promessa" \? 3 : 6/);
  assert.match(page, /Bola de Ouro/);
});

test("valoriza os prêmios individuais e calibra a Bola de Ouro pelo tamanho do palco", async () => {
  const page = await readCareerSource();
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const ballon = await readFile(new URL("../app/career/ballon-dor.ts", import.meta.url), "utf8");

  assert.match(page, /evaluateBallonDor/);
  assert.match(page, /hasBallonProductionAward/);
  assert.match(ballon, /stage === "minor"/);
  assert.match(ballon, /input\.league\.prestige >= 5/);
  assert.match(ballon, /input\.league\.prestige === 4/);
  assert.match(ballon, /input\.league\.prestige === 3/);
  assert.match(ballon, /input\.overall >= 88/);
  assert.match(ballon, /globalBreakthrough/);
  assert.match(ballon, /repeatMultiplier/);
  assert.match(ballon, /Math\.max\(0\.0004, 0\.006 \* 0\.55 \*\* \(previous - 7\)\)/);
  assert.match(ballon, /stage === "minor" && !globalBreakthrough \? historicFloor \* 0\.18/);
  assert.match(ballon, /input\.isKeeper \? -5/);
  assert.match(ballon, /input\.positionZone === "defesa" \? -3/);
  assert.match(page, /const leagueGoldenBootLine = 28 \+ Math\.floor\([\s\S]*\* 9\)/);
  assert.match(page, /const leagueAssistKingLine = 18 \+ Math\.floor\([\s\S]*\* 7\)/);
  assert.match(page, /goals >= europeanGoldenShoeLine/);
  assert.match(page, /FIFPRO World XI/);
  assert.match(styles, /\.award-card/);
});

test("registra o Hall da Fama local e resume a carreira por clube", async () => {
  const page = await readCareerSource();
  const systems = await readFile(new URL("../app/career-systems.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /HALL_OF_FAME_KEY/);
  assert.match(page, /futbobo:hall-of-fame:v1/);
  assert.match(page, /careerHallEntry/);
  assert.match(page, /snapshot\?: GameState/);
  assert.match(page, /snapshot: \{ \.\.\.game, phase: "summary" \}/);
  assert.match(page, /function archivedCareerState/);
  assert.match(page, /function openHallCareer/);
  assert.match(page, /setHallPreview\(archive\.state\)/);
  assert.match(page, /aria-label=\{`Ver carreira completa de \$\{entry\.name\}`\}/);
  assert.match(page, /Voltar ao ranking/);
  assert.match(page, /clubCareerSummary/);
  assert.match(page, /ARQUIVO POR CLUBE/);
  assert.match(page, /club-archive-tabs/);
  assert.match(page, /club-season-ledger/);
  assert.match(page, /PRÊMIOS INDIVIDUAIS/);
  assert.match(page, /final-individual-awards/);
  assert.match(page, /HALL DA FAMA LOCAL/);
  assert.match(styles, /\.career-club-summary/);
  assert.match(styles, /\.final-awards-list/);
  assert.match(styles, /grid-template-columns: 64px minmax\(84px,1fr\) minmax\(112px,auto\)/);
  assert.match(styles, /@media \(max-width: 420px\)[\s\S]*\.career-club-list > article/);
  assert.match(styles, /\.hall-ranking/);
  assert.match(styles, /\.hall-career-link/);
  assert.match(styles, /\.summary-preview-bar/);
  assert.match(systems, /O Imortal/);
  assert.match(systems, /No debate do GOAT/);
  assert.match(systems, /Carreira anônima/);
});

test("reserva espaço real para os escudos no Hall da Fama mobile", async () => {
  const page = await readCareerSource();
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(styles, /\.hall-ranking > article \{[^}]*grid-template-columns: 24px 64px minmax\(0,1fr\) auto/);
  assert.match(styles, /\.hall-ranking > article > \.club-badge \{ justify-self: center; \}/);
  assert.match(page, /className="hall-score"/);
  assert.doesNotMatch(styles, /\.hall-ranking > article > span \{/);
  assert.match(styles, /\.welcome-hall article \{[^}]*grid-template-columns: 22px 58px minmax\(0,1fr\) auto/);
  assert.match(page, /className="welcome-hall-copy"/);
  assert.doesNotMatch(styles, /\.welcome-hall article > span \{/);
});

test("mantém o gramado contínuo atrás da meta do treinador", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(styles, /\.event-stage \{[\s\S]*repeating-linear-gradient/);
  assert.match(styles, /\.event-art \{[^}]*background: transparent/);
  assert.match(styles, /\.event-stage \.market-strip \{[^}]*background: rgba\(7,23,16,.9\)/);
});

test("deixa o fim de temporada rolar sem o rodapé cobrir o conteúdo", async () => {
  const page = await readCareerSource();
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /futbobo-viewport-locked/);
  assert.match(page, /game\.phase === "consequence" \|\|\s+game\.phase === "transfer"/);
  assert.match(page, /window\.scrollTo\(0, 0\)/);
  assert.match(styles, /body\.futbobo-viewport-locked[\s\S]*position: fixed/);
  assert.match(styles, /\.app-shell-season-result \{[\s\S]*height: auto;[\s\S]*overflow: visible;/);
  assert.match(styles, /\.career-shell\.career-phase-season-result \{[\s\S]*min-height: 100dvh;[\s\S]*overflow: visible;/);
  assert.match(styles, /\.career-phase-season-result > \.result-stage \{[\s\S]*overflow: visible;/);
  assert.match(styles, /\.career-phase-season-result \.mobile-action-dock \{[\s\S]*position: static;/);
  assert.match(page, /className="season-result-section-heading"><span>DESEMPENHO<\/span>/);
  assert.match(page, /className="season-result-section-heading"><span>BASTIDORES<\/span>/);
  assert.match(page, /className="season-result-section season-campaigns"/);
  assert.match(page, /competitions\.filter\(\(competition\) => !competition\.champion\)/);
  assert.match(styles, /\.season-compact-grid \{[^}]*grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles, /\.career-phase-season-result \.result-symbol \{[\s\S]*width: 76px;[\s\S]*height: 76px;/);
});

test("mostra o resultado da última temporada antes de concluir a aposentadoria", async () => {
  const page = await readCareerSource();

  assert.match(page, /current\.phase === "consequence"[\s\S]*current\.pendingBotaoMatches\.length \? "botao-final" : "season-result"/);
  assert.match(page, /function continueAfterConsequence\(\) \{[\s\S]*current\.pendingBotaoMatches\.length \? "botao-final" : "season-result"/);
  assert.match(page, /function continueAfterResult\(\) \{[\s\S]*if \(game\.retireAfterSeason\) \{[\s\S]*phase: "summary"/);
  assert.match(page, /Ver resultado da última temporada/);
  assert.match(page, /game\.retireAfterSeason \? "Concluir carreira"/);
});

test("classifica para supercopas e recopás e exibe uma galeria completa de títulos", async () => {
  const page = await readCareerSource();
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const assetSync = await readFile(new URL("../scripts/sync-football-assets.mjs", import.meta.url), "utf8");

  assert.match(page, /domesticSuperCup/);
  assert.match(page, /recopaSudamericana/);
  assert.match(page, /uefaSuperCup/);
  assert.match(page, /campeonesCup/);
  assert.match(page, /previousClubSeason\?\.clubId === club\.id/);
  assert.match(page, /wonLastSeason\(\["domesticLeague", "domesticCup"\]\)/);
  assert.match(page, /wonLastSeason\(\["championsLeague", "europaLeague"\]\)/);
  assert.match(page, /wonLastSeason\(\["libertadores", "sudamericana"\]\)/);
  assert.match(page, /function TrophyGallery/);
  assert.match(page, /ÚLTIMAS VOLTAS OLÍMPICAS/);
  assert.match(page, /<TrophyGallery state=\{game\}/);
  assert.match(page, /<TrophyGallery state=\{displayGame\} final/);
  assert.match(page, /className="season-title-parade"/);
  assert.match(page, /TAÇAS DA TEMPORADA/);
  assert.match(styles, /\.trophy-gallery-hero/);
  assert.match(styles, /\.recent-titles/);
  assert.match(styles, /\.season-title-parade/);
  assert.match(assetSync, /SUPER_CUP_SEARCH_NAMES/);
  assert.match(assetSync, /recopaSudamericana: "5665"/);
  assert.match(assetSync, /uefaSuperCup: "4512"/);
});

test("protege o OVR jovem e permite explosões raras de talento", async () => {
  const page = await readCareerSource();
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /affected\.age <= 29\) development = growthRoll < 0\.58 \? 0/);
  assert.match(page, /rareEarlyDeclineChance = affected\.age <= 29 \? 0\.015 : 0\.04/);
  assert.match(page, /affected\.age <= 33\) development = growthRoll < 0\.08 \? -2/);
  assert.match(page, /const breakoutThreshold = isKeeper \? 70/);
  assert.match(page, /const breakoutChance = clamp\(12[\s\S]*12, 55\)/);
  assert.match(page, /hugeBreakout \? 5 : 3/);
  assert.match(page, /EXPLOSÃO DE TALENTO/);
  assert.match(styles, /\.breakout-result/);
  assert.match(styles, /@keyframes breakout-glow/);
});

test("mantém o mercado europeu coerente e reserva uma rota alternativa explicada", async () => {
  const page = await readCareerSource();

  assert.match(page, /regionAffinity\(context\.sourceClub\.countryId, club\)/);
  assert.match(page, /const domesticBonus = club\.countryId === context\.sourceClub\.countryId \? 4\.8 : 0/);
  assert.match(page, /club\.countryId === "arabia-saudita"/);
  assert.match(page, /club\.countryId === state\.academyCountryId/);
  assert.match(page, /reason: "alternative-route"/);
  assert.match(page, /isOutsideAcademyHome\(affected, club\)/);
});

test("mostra de cinco a dez propostas na janela de transferências", async () => {
  const page = await readCareerSource();

  assert.match(page, /clamp\(options\.count \?\? \(transferMarketProfile\(state\)\.extraMarketOffers \+ 6\), 5, 10\)/);
  assert.match(page, /selected = \[\.\.\.selected\.slice\(0, Math\.max\(0, wanted - 1\)\), alternative\]/);
  assert.match(page, /reason: "alternative-route"/);
});

test("bloqueia propostas europeias absurdas sem matar escolhas alternativas", async () => {
  const page = await readCareerSource();

  assert.match(page, /state\.overall < 67 && isEuropeanClub\(club\) && !isEuropeanClub\(context\.sourceClub\)/);
  assert.match(page, /role === "reserva" && strengthGap > 8 && !context\.standout/);
  assert.match(page, /const noise = seeded[\s\S]*\* 2\.4/);
  assert.match(page, /Rota alternativa/);
});

test("oculta a reputação dos clubes no mercado e varia salários por negociação", async () => {
  const page = await readCareerSource();
  const systems = await readFile(new URL("../app/career-systems.ts", import.meta.url), "utf8");

  assert.doesNotMatch(page, /reputação \{club\.reputation\}\/5/);
  assert.match(systems, /club: Pick<Club, "id" \| "reputation" \| "countryId">/);
  assert.match(systems, /salaryHash = Math\.imul\(salaryHash \^ club\.id\.charCodeAt\(index\), 16_777_619\)/);
  assert.match(systems, /const negotiationFactor = 0\.87 \+ negotiationRoll \* 0\.28/);
  assert.match(systems, /salaryBase \* negotiationFactor/);
});

test("gera temporadas com mais gols e assistências sem igualar todas as posições", async () => {
  const page = await readCareerSource();
  const data = await readFile(new URL("../app/game-data.ts", import.meta.url), "utf8");

  assert.match(page, /const productionMomentum = clamp\(/);
  assert.match(page, /roleProductionBonus/);
  assert.match(page, /position\.goals \* quality \* finishingFactor \* productionMomentum/);
  assert.match(page, /position\.assists \* quality \* creationFactor \* productionMomentum/);
  assert.match(data, /key: "CA"[\s\S]*goals: 0\.43, assists: 0\.11/);
  assert.match(data, /key: "MEI"[\s\S]*goals: 0\.22, assists: 0\.3/);
  assert.match(data, /key: "PD"[\s\S]*goals: 0\.28, assists: 0\.22/);
});

test("impede ficar no clube depois de um pedido de transferência aceito", async () => {
  const page = await readCareerSource();

  assert.match(page, /if \(!offer && \(current\.transferRequested \|\| current\.renewalDenied \|\| current\.forcedClubExit \|\| current\.forcedAlternativeTransfer\)\) return current/);
  assert.match(page, /const canStay = !state\.transferRequested && !state\.renewalDenied && !state\.forcedClubExit/);
  assert.match(page, /Permanecer não é mais uma opção/);
  assert.match(page, /transferRequested: false, transferStatus: null/);
});

test("expande o mercado para ligas e clubes das Américas", async () => {
  const data = await readFile(new URL("../app/game-data.ts", import.meta.url), "utf8");

  for (const leagueId of [
    "liga-argentina",
    "liga-uruguaia",
    "liga-chilena",
    "liga-colombiana",
    "liga-paraguaia",
    "liga-equatoriana",
    "liga-peruana",
    "liga-mx",
    "mls",
    "proleague",
    "superlig",
    "austria-bundesliga",
    "swiss-super-league",
    "premiership-sco",
  ]) {
    assert.match(data, new RegExp(`id: "${leagueId}"`));
  }

  for (const clubId of [
    "boca-juniors",
    "river-plate",
    "nacional-uru",
    "penarol",
    "colo-colo",
    "atletico-nacional",
    "olimpia",
    "barcelona-sc",
    "universitario",
    "club-america",
    "chivas",
    "inter-miami",
    "la-galaxy",
    "club-brugge",
    "anderlecht",
    "galatasaray",
    "fenerbahce",
    "salzburg",
    "sturm-graz",
    "young-boys",
    "basel",
    "celtic",
    "rangers",
  ]) {
    assert.match(data, new RegExp(`id: "${clubId}"`));
  }

  assert.match(data, /confederation: "NORTH_AMERICA"/);
  assert.match(data, /"colombia"|"chile"|"paraguai"|"equador"|"peru"/);

  const countryIds = new Set(
    [...data.matchAll(/\{ id: "([^"]+)", name: "[^"]+", demonym: "[^"]+", abbr: "[^"]+", confederation:/g)]
      .map((match) => match[1]),
  );
  const leagueEntries = [...data.matchAll(/\{ id: "([^"]+)", countryId: "([^"]+)", name: "[^"]+", cupName:/g)];
  const leagueIds = new Set(leagueEntries.map((match) => match[1]));
  const clubEntries = [...data.matchAll(/\{ id: "([^"]+)", name: "[^"]+", shortName: "[^"]+", abbr: "[^"]+", city: "[^"]+"[^}]*countryId: "([^"]+)", leagueId: "([^"]+)"[^}]*reputation: (\d)/g)];
  const clubIds = clubEntries.map((match) => match[1]);

  assert.equal(new Set(clubIds).size, clubIds.length, "IDs de clubes precisam ser únicos");
  assert.ok(clubEntries.length >= 402, "a base deve manter pelo menos 402 clubes");
  const clubsWithStrength = [...data.matchAll(/\{ id: "[^"]+", name: "[^"]+", shortName: "[^"]+", abbr: "[^"]+", city: "[^"]+"[^}]*countryId: "[^"]+", leagueId: "[^"]+"[^}]*reputation: \d[^}]*strength: \d+/g)];
  assert.equal(clubsWithStrength.length, clubEntries.length, "todo clube precisa ter strength explícito");
  assert.match(data, /export type Club = \{[\s\S]*?strength: number;/);
  const clubCountByLeague = new Map();
  const modestClubCountByLeague = new Map();
  for (const match of clubEntries) {
    const leagueId = match[3];
    clubCountByLeague.set(leagueId, (clubCountByLeague.get(leagueId) ?? 0) + 1);
    if (match[4] === "1") {
      modestClubCountByLeague.set(leagueId, (modestClubCountByLeague.get(leagueId) ?? 0) + 1);
    }
  }
  for (const [, leagueId, countryId] of leagueEntries) {
    if (countryId === "brasil") continue;
    assert.ok((clubCountByLeague.get(leagueId) ?? 0) >= 10, `${leagueId} precisa ter ao menos 10 clubes`);
    assert.ok((modestClubCountByLeague.get(leagueId) ?? 0) >= 1, `${leagueId} precisa ter clube modesto`);
  }
  for (const [, leagueId, countryId] of leagueEntries) assert.ok(countryIds.has(countryId), `país ausente na liga ${leagueId}`);
  for (const [, clubId, countryId, leagueId] of clubEntries) {
    assert.ok(countryIds.has(countryId), `país ausente no clube ${clubId}`);
    assert.ok(leagueIds.has(leagueId), `liga ausente no clube ${clubId}`);
  }

  const completeEuropeanLeagues = new Map([
    ["premier", 20],
    ["laliga", 20],
    ["seriea", 20],
    ["bundesliga", 18],
    ["ligue1", 18],
    ["primeira", 18],
    ["eredivisie", 18],
    ["proleague", 16],
    ["superlig", 18],
    ["austria-bundesliga", 12],
    ["swiss-super-league", 12],
    ["premiership-sco", 12],
  ]);
  for (const [leagueId, officialSize] of completeEuropeanLeagues) {
    assert.ok((clubCountByLeague.get(leagueId) ?? 0) >= officialSize, `${leagueId} precisa ter a liga completa`);
  }
  const completeAmericanLeagues = new Map([
    ["brasileirao", 20],
    ["liga-argentina", 30],
    ["liga-uruguaia", 16],
    ["liga-chilena", 16],
    ["liga-colombiana", 20],
    ["liga-paraguaia", 12],
    ["liga-equatoriana", 16],
    ["liga-peruana", 18],
    ["liga-mx", 18],
    ["mls", 30],
  ]);
  for (const [leagueId, officialSize] of completeAmericanLeagues) {
    assert.ok((clubCountByLeague.get(leagueId) ?? 0) >= officialSize, `${leagueId} precisa ter a liga completa`);
  }
  for (const clubId of [
    "coventry",
    "malaga",
    "frosinone",
    "elversberg",
    "le-mans",
    "academico-viseu",
    "ado-den-haag",
  ]) {
    assert.ok(clubIds.includes(clubId), `expansão europeia precisa manter ${clubId}`);
  }
});

test("usa escudos, bandeiras e emblemas locais com fallback visual", async () => {
  const gameData = await readFile(new URL("../app/game-data.ts", import.meta.url), "utf8");
  const page = await readCareerSource();
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const clubAssets = await readdir(new URL("../public/assets/clubs/", import.meta.url));
  const flagAssets = await readdir(new URL("../public/assets/flags/", import.meta.url));
  const competitionAssets = await walk(new URL("../public/assets/competitions/", import.meta.url));
  const assetManifest = JSON.parse(await readFile(new URL("../public/assets/football-assets.json", import.meta.url), "utf8"));
  const assetSync = await readFile(new URL("../scripts/sync-football-assets.mjs", import.meta.url), "utf8");
  const mappedClubs = Object.values(assetManifest.clubs);
  const providerIds = mappedClubs.map((club) => club.providerId).filter(Boolean);
  const externalSources = mappedClubs.map((club) => club.externalSource).filter(Boolean);
  const gameClubIds = [...gameData.matchAll(/\{ id: "([^"]+)", name: "[^"]+", shortName:/g)].map((match) => match[1]);
  const localClubIds = new Set(clubAssets.filter((name) => name.endsWith(".png")).map((name) => name.slice(0, -4)));

  assert.match(page, /LocalBadgeImage/);
  assert.match(page, /assets\/clubs\/\$\{club\.id\}\.png/);
  assert.match(page, /VERIFIED_CLUB_ASSET_IDS\.has\(club\.id\)/);
  assert.match(page, /assets\/flags\/\$\{country\.id\}\.png/);
  assert.match(page, /function CompetitionBadge/);
  assert.match(assetSync, /writeVerifiedClubAssetIds/);
  assert.match(assetSync, /VERIFIED_ASSETS_FILE/);
  assert.match(assetSync, /auditManifestClubMappings/);
  assert.match(assetSync, /nameScore < 0\.42/);
  assert.match(styles, /\.badge-image-club/);
  assert.match(styles, /\.badge-image-flag/);
  assert.match(styles, /\.badge-image-competition/);
  assert.ok(gameClubIds.length >= 500, "a base completa precisa ser auditada pelo teste");
  assert.deepEqual(
    gameClubIds.filter((clubId) => !assetManifest.clubs[clubId] || !localClubIds.has(clubId)),
    [],
    "todos os clubes da base precisam ter escudo local verificado",
  );
  assert.equal(assetManifest.clubs.liverpool.providerId, "133602", "Liverpool precisa usar o escudo do clube inglês");
  assert.equal(flagAssets.filter((name) => name.endsWith(".png")).length, 139, "todas as seleções precisam ter bandeira");
  assert.ok(competitionAssets.filter((file) => file.pathname.endsWith(".png")).length >= 12, "as principais competições precisam ter emblema");
  assert.equal(new Set(providerIds).size, providerIds.length, "um mesmo escudo não pode representar clubes diferentes");
  assert.equal(new Set(externalSources).size, externalSources.length, "assets externos não podem representar clubes diferentes");
  assert.ok(mappedClubs.every((club) => !/women|femin|u-?\d\d|under-?\d\d/i.test(club.providerName)), "escudos precisam representar equipes principais masculinas");
});

test("prioriza destinos sul-americanos e norte-americanos por proximidade geográfica", async () => {
  const page = await readCareerSource();

  assert.match(page, /function regionAffinity/);
  assert.match(page, /originConfederation === "SOUTH_AMERICA"/);
  assert.match(page, /club\.countryId === originCountryId\) return -12/);
  assert.match(page, /targetConfederation === "SOUTH_AMERICA"\) return -3/);
  assert.match(page, /targetConfederation === "NORTH_AMERICA"\) return -1/);
  assert.match(page, /function prioritizeCurrentCountry/);
  assert.match(page, /confederation === "NORTH_AMERICA"\) requirement -= state\.age >= 29 \? 10 : 4/);
});

test("adiciona a Copa de Campeões Concacaf sem quebrar o gabinete de troféus", async () => {
  const page = await readCareerSource();

  assert.match(page, /concacafChampions: number/);
  assert.match(page, /concacaf: \{ id: "concacafChampions", name: "Copa de Campeões Concacaf", icon: "CCC" \}/);
  assert.match(page, /concacafChampions: saved\.trophyCabinet\?\.concacafChampions \?\? 0/);
});

test("clube pode recusar renovar contrato após temporada ruim, forçando escolha de novo clube", async () => {
  const page = await readCareerSource();

  assert.match(page, /const renewalDenied = nonRenewalChance > 0 && seeded\(/);
  assert.match(page, /nonRenewalRiskFactors >= 2/);
  assert.match(page, /CONTRATO ENCERRADO/);
  assert.match(page, /O clube optou por não renovar/);
  assert.match(page, /if \(!offer && \(current\.transferRequested \|\| current\.renewalDenied \|\| current\.forcedClubExit \|\| current\.forcedAlternativeTransfer\)\) return current/);
});

test("centraliza propostas reais, empréstimos e histórico de transferências sem poluir a janela", async () => {
  const page = await readCareerSource();
  const screen = await readFile(new URL("../app/components/career/TransferMarketScreen.tsx", import.meta.url), "utf8");
  const architecture = await readFile(new URL("../app/career/README.md", import.meta.url), "utf8");

  for (const contract of ["type TransferOffer", "type TransferRecord", "type LoanAgreement", "transferMarketOffers", "transferHistory", "activeLoan"]) assert.match(page, new RegExp(contract));
  for (const rule of ["buildMarketContext", "clubPositionNeed", "generateTransferOffers", "applyAcceptedTransfer", "completeLoanReturn", "resolveTransferRequest"]) assert.match(page, new RegExp(`function ${rule}`));
  assert.match(page, /transferFee: actualTransferFee/);
  assert.match(page, /transferHistory: isRenewal \? state\.transferHistory : \[\.\.\.state\.transferHistory, transferRecord\(state, offer\)\]/);
  assert.match(page, /contractYears: isLoan \? Math\.max\(2, state\.contractYears\) : offer\.contractYears/);
  assert.match(page, /transferMarketOffers: Array\.isArray\(saved\.transferMarketOffers\)/);
  assert.match(screen, /Proposta de \$\{formatMoney\(offer\.transferFee\)\}/);
  assert.match(screen, /<details className=\{styles\.details\}>/);
  assert.doesNotMatch(screen, /Valor estimado na liga/);
  assert.match(architecture, /fonte futura para rankings mundiais/);
});

test("atributos influenciam a simulação, premiações têm suspense e o escândalo força exílio", async () => {
  const page = await readCareerSource();
  const gameData = await readFile(new URL("../app/game-data.ts", import.meta.url), "utf8");
  const drama = await readFile(new URL("../app/career-drama.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /type PlayerAttributes = Record<AttributeKey, number>/);
  assert.match(page, /const finishingSkill = attributes\.finishing/);
  assert.match(page, /const creationSkill = attributes\.passing/);
  assert.match(page, /keeperSkill \/ 270/);
  assert.match(page, /ATRIBUTOS DE CAMPO/);
  assert.match(page, /game\.attributes\[key\]/);
  assert.match(page, /type AwardNomination/);
  assert.match(page, /won: false/);
  assert.match(page, /O VENCEDOR É/);
  assert.match(page, /Você chegou à final/);
  assert.match(gameData, /rareChance\?: number/);
  assert.match(gameData, /forcedAlternativeTransfer\?: boolean/);
  assert.match(drama, /id: "drama-drug-scandal"/);
  assert.match(drama, /rareChance: 0\.004/);
  assert.match(page, /function selectAlternativeExileOffers/);
  assert.match(page, /Só projetos de reconstrução estão disponíveis/);
  assert.match(styles, /\.football-attributes-card/);
  assert.match(styles, /\.award-near-miss/);
});

test("convites raros de outras seleções respeitam proximidade geográfica e nunca se repetem", async () => {
  const page = await readCareerSource();

  assert.match(page, /const NATIONALITY_SWITCH_EVENT_ID = "dynamic-nationality-switch"/);
  assert.match(page, /function pickNationalitySwitchTarget/);
  assert.match(page, /const NEARBY_NATIONAL_TEAMS/);
  assert.match(page, /seeded\(state\.seed, salt \+ 19\) < 0\.82/);
  assert.match(page, /function maybeOfferNationalitySwitch/);
  assert.match(page, /if \(state\.nationalitySwitchInviteUsed\) return null/);
  assert.match(page, /const pendingCareerEventId = current\.nextEventId/);
  assert.match(page, /currentEventId: pendingCareerEventId \|\| selectNextEvent/);
  assert.match(page, /Não é possível voltar atrás/);
  assert.match(page, /nationalitySwitched: affected\.nationalitySwitched \|\| Boolean\(nationalitySwitchRecord\)/);
});

test("integra o novo campo de posições, base sorteada, roleta e simulação por mérito", async () => {
  const page = await readCareerSource();
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /function randomAcademyClubs\(seed: number, countryId: string\)/);
  assert.match(page, /randomClubSelection\(academyClubPool\(countryId\), 4/);
  assert.match(page, /randomClubSelection\([\s\S]*revelationOfferPool\(state\),[\s\S]*2,[\s\S]*\[state\.academyClubId\]/);
  assert.match(page, /POSITION_FIELD_SPOTS/);
  assert.match(styles, /\.position-grid \{[\s\S]*grid-template-columns: repeat\(5/);
  assert.match(page, /const inSeasonMeritApps/);
  assert.match(page, /previousFormApps/);
  assert.match(page, /Math\.round\(baseApps[\s\S]*inSeasonMeritApps \+ previousFormApps/);
  assert.match(page, /const nextFitness = clamp\(/);
  assert.match(page, /const nextMorale = clamp\(/);
  assert.match(page, /setLuckSpin\(\{ event: currentEvent, choiceIndex, succeeded \}\)/);
  assert.match(styles, /@keyframes roulette-spin/);
  assert.match(page, /function attemptPositionChange/);
  assert.match(page, /positionChangeCooldownSeason/);
  assert.match(styles, /\.club-badge\.has-image/);
  assert.match(styles, /\.nation-badge\.has-image/);
});

test("liga a nacionalidade à base local, regional ou europeia", async () => {
  const page = await readCareerSource();
  const data = await readFile(new URL("../app/game-data.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(data, /id: "uzbequistao"[\s\S]*confederation: "ASIA"/);
  assert.match(data, /id: "canada"[\s\S]*confederation: "NORTH_AMERICA"/);
  assert.match(data, /export type Confederation = "SOUTH_AMERICA" \| "EUROPE" \| "NORTH_AMERICA" \| "ASIA" \| "AFRICA" \| "OCEANIA"/);
  assert.match(page, /const REGIONAL_ACADEMY_ROUTES/);
  assert.match(page, /const CONFEDERATION_ACADEMY_ROUTES/);
  assert.match(page, /canada: \["eua"\]/);
  assert.match(page, /if \(localClubs\.length >= 4\) return localClubs/);
  assert.match(page, /countryById\(club\.countryId\)\.confederation === "EUROPE"/);
  assert.match(page, /club\.reputation <= 3/);
  assert.match(page, /academyClubId: ""/);
  assert.match(page, /Uma liga próxima abriu a porta/);
  assert.match(page, /ROTA RECOMENDADA/);
  assert.match(page, /defaultAcademyCountry\(game\.nationality\)/);
  assert.match(page, /Copa da Ásia/);
  assert.match(page, /Copa Africana de Nações/);
  assert.match(page, /BUSCAR ENTRE \{COUNTRIES\.length\} SELEÇÕES/);
  assert.match(page, /filteredCountries\.map/);
  assert.match(styles, /\.academy-route-card\.international/);
  assert.match(styles, /\.nation-search/);
});

test("expõe um laboratório Monte Carlo que reutiliza a simulação completa da carreira", async () => {
  const page = await readCareerSource();
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /function simulateMonteCarloCareer/);
  assert.match(page, /function runMonteCarloCareers/);
  assert.match(page, /state = simulateSeason\(state, event, effect, choice\.label, resultText, luckOutcome\)/);
  assert.match(page, /__FUTBOBO_MONTE_CARLO__/);
  assert.match(page, /params\.get\("montecarlo"\)/);
  assert.match(page, /data-testid="monte-carlo-report"/);
  assert.match(page, /averagePeakOverall/);
  assert.match(page, /positionBreakdown/);
  assert.match(page, /careersWithFiveBallonDor/);
  assert.match(page, /repeatBallonMultiplier/);
  assert.match(page, /previousBallonDor === 0[\s\S]*Math\.max\(0\.03, Number\(rawBallonChance\.toFixed\(3\)\)\)/);
  assert.match(page, /affected\.awardCabinet\["Ídolo da Torcida"\] > 0/);
  assert.match(styles, /\.monte-carlo-shell/);
});

test("adiciona o pacote de eventos de drama com filtros de carreira", async () => {
  const gameData = await readFile(new URL("../app/game-data.ts", import.meta.url), "utf8");
  const page = await readCareerSource();
  const drama = await readFile(new URL("../app/career-drama.ts", import.meta.url), "utf8");

  assert.match(gameData, /needsConfederation\?: Confederation/);
  assert.match(gameData, /needsPositionZone\?: Position\["zone"\]/);
  assert.match(gameData, /needsSquadRoles\?: Array<"promessa" \| "reserva" \| "rotacao" \| "titular" \| "estrela">/);
  assert.match(gameData, /needsCaptainRole\?: "club" \| "national" \| "any"/);
  assert.match(page, /CAREER_DRAMA_EVENTS/);
  assert.match(page, /event\.needsConfederation && clubConfederation\(club\) !== event\.needsConfederation/);
  assert.match(page, /event\.needsPositionZone && positionByKey\(state\.position\)\.zone !== event\.needsPositionZone/);
  assert.match(page, /event\.needsSquadRoles && !event\.needsSquadRoles\.includes\(state\.squadRole\)/);

  const dramaEventIds = [...drama.matchAll(/id: "(drama-[^"]+)"/g)].map((match) => match[1]);
  assert.ok(dramaEventIds.length >= 45, "o pacote de drama precisa ter ao menos 45 eventos");
  assert.equal(new Set(dramaEventIds).size, dramaEventIds.length, "IDs de drama precisam ser únicos");
  for (const tag of ["IDADE", "POSIÇÃO", "REGIÃO", "ELENCO", "CAPITÃO", "SELEÇÃO", "LESÃO", "IMPRENSA", "FAMÍLIA", "EMPRESÁRIO", "APOSENTADORIA"]) {
    assert.match(drama, new RegExp(`tag: "${tag}"`));
  }
  assert.ok((drama.match(/luck: \{/g) ?? []).length >= 6, "precisa manter escolhas de sorte");
});

test("adiciona central estatística, empréstimos, rivais, personagens, agente livre e traits", async () => {
  const page = await readCareerSource();
  const gameData = await readFile(new URL("../app/game-data.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /CENTRAL ESTATÍSTICA/);
  assert.match(page, /function createCareerRivals/);
  assert.match(page, /DYNAMIC_RIVAL_EVENT_ID/);
  assert.match(page, /SETTINGS_KEY = "futbobo:settings:v1"/);
  assert.match(page, /function addCustomCharacter/);
  assert.match(page, /function becomeFreeAgent/);
  assert.match(page, /loanParentClubId/);
  assert.match(page, /selectCareerTraits/);
  assert.match(page, /SPECIAL_TRAITS/);
  assert.match(gameData, /loan\?: boolean/);
  assert.match(styles, /\.statistics-screen/);
  assert.match(styles, /\.update-notice/);
  assert.match(styles, /\.settings-sheet/);
  assert.match(styles, /grid-template-columns: repeat\(6, 1fr\)/);
});

test("mantem os cards da Central inteiros e libera rolagem no celular", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(styles, /\.career-tab-stats > \.statistics-screen\s*\{[^}]*grid-auto-rows: max-content/);
  assert.match(styles, /\.career-tab-stats > \.statistics-screen\s*\{[^}]*overflow-y: auto/);
  assert.match(styles, /\.career-tab-stats > \.statistics-screen > \*\s*\{[^}]*min-height: max-content/);
  assert.match(styles, /scroll-padding-bottom: calc\(env\(safe-area-inset-bottom\) \+ 92px\)/);
});

test("adiciona vida fora do campo, redes sociais e patrocinadores persistentes", async () => {
  const page = await readCareerSource();
  const gameData = await readFile(new URL("../app/game-data.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  for (const brand of ["Nike", "adidas", "Puma", "New Balance", "Under Armour", "Mizuno", "Umbro"]) {
    assert.match(page, new RegExp(`name: "${brand}"`));
  }
  assert.match(page, /type SponsorDeal/);
  assert.match(page, /type SocialPost/);
  assert.match(page, /function sponsorOfferPool/);
  assert.match(page, /function buildSponsorEvent/);
  assert.match(page, /function buildSponsorDutyEvent/);
  assert.match(page, /function buildSocialEvent/);
  assert.match(page, /function buildLifeEvent/);
  assert.match(page, /activeSponsor: sponsorExpired \? null : affected\.activeSponsor/);
  assert.match(page, /money: Math\.max\(0, affected\.money \+ affected\.annualSalary \+ sponsorIncome - seasonLivingCost\)/);
  assert.match(page, /socialFeed: \[\.\.\.milestonePosts, seasonSocialPost/);
  assert.match(page, /VIDA FORA DO CAMPO/);
  assert.match(page, /PATROCINADOR PESSOAL/);
  assert.match(page, /LINHA DO TEMPO/);
  assert.match(page, /setUpdateNoticePage\("previous"\)/);
  assert.match(page, /v91 · DUELO LOCAL/);
  assert.match(page, /A resenha cabe na mesma mesa/);
  assert.match(gameData, /followers\?: number/);
  assert.match(gameData, /sponsorBrand\?: string/);
  assert.match(styles, /\.life-screen/);
  assert.match(styles, /\.sponsor-hub/);
  assert.match(styles, /\.social-post-list/);
  assert.match(styles, /\.previous-update-button/);
});

test("integra o futebol de botão às finais da carreira e ao mata-mata do Mundial", async () => {
  const page = await readCareerSource();
  const adapter = await readFile(new URL("../app/botao/adapter.ts", import.meta.url), "utf8");
  const engine = await readFile(new URL("../app/botao/engine.ts", import.meta.url), "utf8");
  const match = await readFile(new URL("../app/botao/BotaoMatch.tsx", import.meta.url), "utf8");
  const renderer = await readFile(new URL("../app/botao/render.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/botao/botao.css", import.meta.url), "utf8");

  assert.match(page, /\| "botao-final"/);
  assert.match(page, /\| "botao-result"/);
  assert.match(page, /pendingBotaoMatches: PendingBotaoMatch\[\]/);
  assert.match(page, /competition\.id !== "domesticLeague"/);
  assert.match(page, /worldKnockoutStages = \["16 avos", "Oitavas", "Quartas", "Semifinal", "Vice", "CAMPEÃO"\]/);
  assert.match(page, /<BotaoMatch/);
  assert.match(page, /simulateBotaoMatch\(currentBotaoSetup\)/);
  assert.match(page, /function applyBotaoMatchResult/);
  assert.match(page, /playerGoals/);
  assert.match(page, /worldQualifiedSeason/);
  assert.match(page, /finalMatchMode: "play-key-matches"/);
  assert.match(page, /finalMatchMode: AppSettings\["finalMatchMode"\] = "play-key-matches"/);
  assert.match(page, /DECIDIDO NO FUTEBOL DE BOTÃO/);
  assert.match(page, /seasonClubTitles/);
  assert.match(page, /seasonNationalTitles/);
  assert.match(page, /seasonBotaoWins/);
  assert.match(page, /seasonBotaoLosses/);
  assert.match(page, /DISPUTADAS/);
  assert.match(page, /GANHAS/);
  assert.match(page, /PERDIDAS/);
  assert.doesNotMatch(page, /className="played-finals-card"/);
  assert.match(adapter, /function buildNationalMatchSetup/);
  assert.match(adapter, /function pickNationalOpponent/);
  assert.match(adapter, /excludedCountryIds/);
  assert.match(adapter, /isGlobalFinal/);
  assert.match(adapter, /candidate\.strength >= \(isGlobalFinal \? 4 : 2\)/);
  assert.match(page, /previousOpponentIds/);
  assert.match(engine, /function createMatch/);
  assert.match(engine, /export function awardInactivityPenalty/);
  assert.match(engine, /const inRegulation = state\.period <= state\.setup\.rules\.halves/);
  assert.match(engine, /state\.phase === "kickoff" && state\.clockPausedForKickoff/);
  assert.match(match, /const USER_DECISION_SECONDS = 10/);
  assert.match(match, /const USER_WARNING_SECONDS = 3/);
  assert.match(match, /botao-inactivity-countdown/);
  assert.match(match, /const \[paused, setPaused\] = useState\(false\)/);
  assert.match(match, /pausedRef\.current/);
  assert.match(match, /commitWhenRunning/);
  assert.match(match, /uprightLabels: desktopLandscape/);
  assert.match(match, /Partida pausada/);
  assert.match(renderer, /ctx\.rotate\(-Math\.PI \/ 2\)/);
  assert.match(renderer, /assets\/botao\/match-ball\.png/);
  assert.match(renderer, /ctx\.drawImage\(\s*sprite/);
  assert.match(renderer, /const diameter = ball\.radius \* 2\.2/);
  assert.match(renderer, /const textureInset = 18/);
  assert.match(renderer, /function liveSpinAngle/);
  assert.match(renderer, /function replayBallSpin/);
  assert.match(styles, /\.botao-pause-overlay/);
  assert.match(styles, /\.botao-pause-toggle/);
  assert.doesNotMatch(renderer, /drawGoalLabels/);
  assert.doesNotMatch(page, /o sorteio da temporada para aqui/i);
  assert.doesNotMatch(page, /Dificuldade \{currentBotaoSetup/);
  assert.doesNotMatch(page, /decis.o\(ões\) restante/);
  assert.match(styles, /\.botao-career-lobby/);
  assert.match(styles, /\.botao-inactivity-countdown/);
  assert.match(styles, /\.botao-career-lobby \.botao-actions > \.botao-primary/);
});

test("fecha o patch de mercado, economia, personalização e futebol de botão", async () => {
  const page = await readCareerSource();
  const data = await readFile(new URL("../app/game-data.ts", import.meta.url), "utf8");
  const drama = await readFile(new URL("../app/career-drama.ts", import.meta.url), "utf8");
  const adapter = await readFile(new URL("../app/botao/adapter.ts", import.meta.url), "utf8");
  const engine = await readFile(new URL("../app/botao/engine.ts", import.meta.url), "utf8");
  const match = await readFile(new URL("../app/botao/BotaoMatch.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /const SECOND_DIVISION_LEAGUES = new Set\(\["brasileirao-b", "championship"\]\)/);
  assert.match(page, /sourceLeagueId: league\.id/);
  assert.match(page, /SECOND_DIVISION_LEAGUES\.has\(context\.sourceLeagueId\) && club\.countryId !== context\.sourceClub\.countryId/);
  assert.match(page, /domesticReturnCountryId = event\.id === "european-exit" \|\| event\.id === "return-home"[\s\S]*nextBase\.academyCountryId/);
  assert.doesNotMatch(page, /const brazilReturnChance/);
  assert.doesNotMatch(page, /Retorno raro ao Brasil/);
  assert.match(adapter, /args\.competitionId === "domesticCup" && leagueId === "brasileirao-b"/);
  assert.match(adapter, /candidate\.leagueId === "brasileirao"/);
  assert.match(adapter, /args\.competitionId === "libertadores"/);
  assert.match(adapter, /candidate\.countryId !== club\.countryId/);

  assert.doesNotMatch(match, /onGiveUp/);
  assert.doesNotMatch(match, />\s*Sair\s*</);
  assert.match(engine, /persistentSquadNumbers\(\s*setup\.userTeam\.id,\s*\[setup\.player\.number\]/);

  assert.match(drama, /id: "drama-billie-eilish-photo"/);
  assert.match(drama, /followers: 10_000_000/);
  assert.match(page, /id: "corruption" as const/);
  assert.match(page, /seeded\(game\.seed, game\.season \* 1877/);
  assert.match(page, /forcedFreeAgentUntilSeason = current\.season \+ corruptionBanYears/);
  assert.match(page, /seasonNetIncome \* 0\.18/);
  assert.match(page, /spendableMoney/);

  assert.match(page, /type CustomClubDefinition/);
  assert.match(data, /customBadge\?: string/);
  assert.match(page, /function applyCustomClubDefinitions/);
  assert.match(page, /Escudo por link HTTPS/);
  assert.match(page, /readCustomClubBadge/);
  assert.match(page, /function exportSavedData/);
  assert.match(page, /async function importSavedData/);

  assert.match(page, /function isIdolAtClub/);
  assert.match(page, /state\.fanSupport >= 94/);
  assert.match(page, /const forcedClubExit = !isIdolAtClub/);
  assert.match(page, /VENDA OBRIGATÓRIA/);

  assert.match(page, /botaoGoalLimit\?: 0 \| 3 \| 5/);
  assert.match(page, /botaoHalfSeconds\?: 90 \| 120 \| 180/);
  assert.match(page, /stageOrder = \["16 avos de final", "Oitavas de final"/);
  assert.match(page, /useState\(false\).*updateNoticeOpen|updateNoticeOpen, setUpdateNoticeOpen\] = useState\(false\)/);
  assert.match(page, /Ver novidades do jogo/);
  assert.match(page, /window\.scrollTo\(\{ top: 0, behavior: "smooth" \}\)/);
  assert.match(styles, /\.custom-club-settings/);
  assert.match(styles, /\.botao-rule-settings/);
});

test("mostra o minuto de cada gol no resultado do futebol de botão", async () => {
  const page = await readCareerSource();
  const standalone = await readFile(new URL("../app/botao/page.tsx", import.meta.url), "utf8");
  const adapter = await readFile(new URL("../app/botao/adapter.ts", import.meta.url), "utf8");
  const engine = await readFile(new URL("../app/botao/engine.ts", import.meta.url), "utf8");

  assert.match(adapter, /export function formatGoalMinute/);
  assert.match(adapter, /90 \+ segmentIndex \* segmentMinutes/);
  assert.match(adapter, /inExtraTime \? " · PR" : ""/);
  assert.match(page, /Gols da partida/);
  assert.match(page, /formatGoalMinute\(entry, setup\.rules\)/);
  assert.match(standalone, /Gols da partida/);
  assert.match(standalone, /matchGoals = result\.timeline\.map\(\(entry, timelineIndex\)/);
  assert.match(standalone, /\.filter\(\(\{ entry \}\) => isMatchGoal\(entry\)\)/);
  assert.match(engine, /inactivityPenalty && scored \? "goal"/);
});

test("mantém vivo o rebote do goleiro que ainda segue em direção ao gol", async () => {
  const engine = await readFile(new URL("../app/botao/engine.ts", import.meta.url), "utf8");

  assert.match(engine, /function collide\([^)]*\): boolean/);
  assert.match(engine, /const keeperBallPair =/);
  assert.match(engine, /if \(collide\(state, a, b, events\) && keeperBallPair\) savedByKeeper = true/);
  assert.match(engine, /if \(savedByKeeper\) \{/);
  assert.match(engine, /const movingAwayFromGoal = goalY === 0 \? ball\.vy > STOP_SPEED : ball\.vy < -STOP_SPEED/);
  assert.match(engine, /if \(movingAwayFromGoal \|\| keeperStoppedBall\)/);
  assert.match(engine, /if \(crossed\) return \{ scored: inGoalMouth\(ball\.x\) \}/);
  assert.ok(
    engine.indexOf("if (savedByKeeper)") < engine.indexOf("const crossed ="),
    "o afastamento do goleiro precisa ser resolvido antes da linha do gol",
  );
});

test("usa uma central de carreira própria no computador sem alterar o layout mobile", async () => {
  const page = await readCareerSource();
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /desktop-career-nav-brand/);
  assert.match(page, /CENTRAL DO JOGADOR/);
  assert.match(styles, /grid-template-columns: 294px minmax\(0, 1fr\)/);
  assert.match(styles, /\.career-shell > \.bottom-nav \{/);
  assert.match(styles, /\.career-shell > \.event-stage \{/);
  assert.match(styles, /grid-template-columns: minmax\(270px, \.82fr\) minmax\(430px, 1\.18fr\)/);
  assert.match(styles, /\.career-tab-profile > \.panel-screen \{/);
  assert.match(styles, /\.career-tab-life > \.life-screen/);
  assert.match(styles, /\.career-tab-stats > \.statistics-screen/);
  assert.match(styles, /\.career-tab-history > \.panel-screen \.timeline-list/);
  assert.match(styles, /@media \(max-width: 540px\)/);
});

test("não comprime a cerimônia de prêmios no resultado desktop", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(styles, /\.career-shell > \.result-stage > \* \{ flex-shrink: 0; \}/);
  assert.match(styles, /\.career-shell > \.result-stage \.season-awards-showcase \{/);
  assert.match(styles, /min-height: max-content/);
});

test("organiza o arquivo final da carreira em faixas largas no desktop", async () => {
  const premium = await readFile(new URL("../app/premium.css", import.meta.url), "utf8");

  assert.match(premium, /\.app-shell-summary \.summary-screen \{[\s\S]*max-width: 1480px/);
  assert.match(premium, /\.app-shell-summary \.share-card \{[\s\S]*grid-column: 1 \/ 9/);
  assert.match(premium, /\.app-shell-summary \.trophy-gallery-final \{[\s\S]*grid-column: 1 \/ -1/);
  assert.match(premium, /repeat\(auto-fit,minmax\(300px,1fr\)\)/);
  assert.match(premium, /trophy-groups > section:not\(\.has-titles\) \{ display: none/);
  assert.match(premium, /\.app-shell-summary \.summary-confetti \{ display: none/);
  assert.match(premium, /\.app-shell-summary \.summary-screen > \.career-club-summary \{ grid-column: 1 \/ -1/);
  assert.match(premium, /\.club-archive-layout/);
});

test("compartilha a carreira como pôster rico com fallback local", async () => {
  const page = await readCareerSource();
  const premium = await readFile(new URL("../app/premium.css", import.meta.url), "utf8");

  assert.match(page, /canvas\.width = 1080/);
  assert.match(page, /canvas\.height = 1350/);
  assert.match(page, /navigator\.canShare\?\.\(\{ files: \[file\] \}\)/);
  assert.match(page, /Bola de Ouro · \$\{worldXi\}× World XI/);
  assert.match(page, /Compartilhar pôster da carreira/);
  assert.match(page, /share-honours/);
  assert.match(premium, /\.share-honours/);
});

test("fecha a rodada de polimento com controles semânticos e leitura acessível", async () => {
  const page = await readCareerSource();
  const premium = await readFile(new URL("../app/premium.css", import.meta.url), "utf8");
  const botao = await readFile(new URL("../app/botao/botao.css", import.meta.url), "utf8");
  const worldCup = await readFile(new URL("../app/copa/world-cup.css", import.meta.url), "utf8");

  assert.doesNotMatch(page, /role="button"/);
  assert.doesNotMatch(page, /Nenhuma seleção encontrada/);
  assert.match(page, /type="button"[\s\S]*hall-career-link/);
  assert.match(page, /aria-busy=\{shareBusy\}/);
  assert.match(page, /Montando o pôster da carreira/);
  assert.match(premium, /v88 — final craft pass/);
  assert.match(premium, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(botao, /v88 — matchday interaction polish/);
  assert.match(worldCup, /v88 — tournament broadcast polish/);
});

test("registra W.O. ao atualizar ou fechar uma partida iniciada", async () => {
  const page = await readCareerSource();
  const adapter = await readFile(new URL("../app/botao/adapter.ts", import.meta.url), "utf8");
  const types = await readFile(new URL("../app/botao/types.ts", import.meta.url), "utf8");

  assert.match(types, /walkover\?: boolean/);
  assert.match(adapter, /export function walkoverBotaoResult/);
  assert.match(adapter, /goalsFor: 0/);
  assert.match(adapter, /goalsAgainst: 3/);
  assert.match(page, /futbobo:botao-in-progress:v1/);
  assert.match(page, /function restoreSavedGame/);
  assert.match(page, /applyBotaoMatchResult\(walkoverBotaoResult\(setup\), setup\)/);
  assert.match(page, /function startCurrentBotaoMatch/);
  assert.match(page, /onClick=\{startCurrentBotaoMatch\}/);
  assert.match(page, /DERROTA POR W\.O\./);

  const startMatch = page.indexOf("function startCurrentBotaoMatch");
  const markerWrite = page.indexOf("localStorage.setItem(BOTAO_IN_PROGRESS_KEY", startMatch);
  const openField = page.indexOf("setBotaoMatchStarted(true)", startMatch);
  assert.ok(markerWrite > startMatch && markerWrite < openField, "o marcador deve ser salvo antes de abrir o campo");
});

test("cria origens persistentes que mudam a carreira e abrem capitulos proprios", async () => {
  const page = await readCareerSource();
  const stories = await readFile(new URL("../app/player-stories.ts", import.meta.url), "utf8");
  const chapters = await readFile(new URL("../app/story-chapters.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /version: 7/);
  assert.match(page, /phase: "story"/);
  assert.match(page, /function selectPlayerStory\(storyId: PlayerStoryId\)/);
  assert.match(page, /function buildStorySeasonDecision/);
  assert.match(page, /function buildStoryFollowup/);
  assert.match(page, /const signatureWasSeen/);
  assert.match(page, /story-followup-\$\{followup\.key\}/);
  assert.match(page, /usedTitles\.has\(beat\.title\)/);
  assert.match(page, /STORY_CHAPTER_BEATS\[state\.playerStoryId\]/);
  assert.match(page, /if \(unusedOriginChapters\.length\)/);
  assert.match(page, /entry\.title === saved\.pendingStoryDecision\?\.title/);
  assert.match(page, /const pendingStoryDecision = buildStorySeasonDecision/);
  assert.match(page, /pendingStoryDecision,/);
  assert.match(page, /function resolveStoryDecision/);
  assert.match(page, /DYNAMIC_STORY_EVENT_ID/);
  assert.match(page, /Esta decisão vira parte permanente da história/);
  assert.match(page, /A HISTÓRIA POR TRÁS DA CARREIRA/);
  assert.match(stories, /"academy-destroyer"/);
  assert.match(stories, /"humble-roots"/);
  assert.match(stories, /"football-bloodline"/);
  assert.match(stories, /"disillusioned"/);
  assert.match(stories, /"academy-reject"/);
  assert.match(stories, /"migrant-dream"/);
  assert.equal((chapters.match(/key: "[^"]+"/g) ?? []).length, 33, "cada origem precisa de três capítulos adicionais próprios");
  assert.match(chapters, /Um ex-colega inventou a origem perfeita para você/);
  assert.match(chapters, /A prova caiu na manhã seguinte à final/);
  assert.match(chapters, /Querem colocar seu nome na rua onde você cresceu/);
  assert.match(styles, /\.player-story-grid/);
  assert.match(styles, /\.story-decision-modal/);
});

test("grava replays vetoriais leves dos gols sem reexecutar a partida", async () => {
  const types = await readFile(new URL("../app/botao/types.ts", import.meta.url), "utf8");
  const match = await readFile(new URL("../app/botao/BotaoMatch.tsx", import.meta.url), "utf8");
  const replay = await readFile(new URL("../app/botao/GoalReplay.tsx", import.meta.url), "utf8");
  const render = await readFile(new URL("../app/botao/render.ts", import.meta.url), "utf8");
  const page = await readCareerSource();
  const standalone = await readFile(new URL("../app/botao/page.tsx", import.meta.url), "utf8");

  assert.match(types, /export type BotaoGoalReplay/);
  assert.match(types, /positions: number\[\]/);
  assert.match(types, /replays\?: BotaoGoalReplay\[\]/);
  assert.match(match, /const REPLAY_SAMPLE_MS = 80/);
  assert.match(match, /const REPLAY_MAX_FRAMES_PER_TURN = 42/);
  assert.match(match, /const REPLAY_MAX_TURNS = 3/);
  assert.match(match, /const REPLAY_COORDINATE_SCALE = 4/);
  assert.match(match, /replayPreviousTurnsRef/);
  assert.match(match, /turnStarts/);
  assert.match(match, /Math\.round\(body\.x \* REPLAY_COORDINATE_SCALE\)/);
  assert.match(match, /goalReplaysRef\.current/);
  assert.match(match, /replays: goalReplaysRef\.current/);
  assert.match(replay, /requestAnimationFrame/);
  assert.match(replay, /Os dois toques anteriores e o gol/);
  assert.match(replay, /const blend =/);
  assert.match(replay, /LANCE \{activeTurn \+ 1\}/);
  assert.match(render, /export function drawReplayFrame/);
  const replayRendererStart = render.indexOf("export function drawReplayFrame");
  assert.ok(
    render.indexOf("drawDisc(ctx, rendered", replayRendererStart)
      < render.indexOf("drawBall(ctx, ball,", replayRendererStart),
    "a bola precisa ser desenhada por cima dos botões no replay",
  );
  assert.match(page, /Ver replay/);
  assert.match(standalone, /Ver replay/);
});

test("coloca convocados de OVR baixo no banco e preserva o placar anterior", async () => {
  const types = await readFile(new URL("../app/botao/types.ts", import.meta.url), "utf8");
  const adapter = await readFile(new URL("../app/botao/adapter.ts", import.meta.url), "utf8");
  const engine = await readFile(new URL("../app/botao/engine.ts", import.meta.url), "utf8");
  const page = await readCareerSource();

  assert.match(types, /export type BotaoMatchEntry/);
  assert.match(types, /beforePlayerEntry\?: boolean/);
  assert.match(adapter, /export function nationalMatchRole/);
  assert.match(adapter, /64 \+ safeStrength \* 3\.5/);
  assert.match(adapter, /function reserveEntry/);
  assert.match(adapter, /args\.rules\.halfSeconds \/ 2/);
  assert.match(engine, /period: setup\.entry\?\.period \?\? 1/);
  assert.match(engine, /timeline: setup\.entry\?\.timeline/);
  assert.match(page, /VOCÊ COMEÇA NO BANCO/);
  assert.match(page, /antes da sua entrada/);
});

test("entrega um APK offline sem criar uma segunda versão do jogo", async () => {
  const page = await readCareerSource();
  const android = await readFile(new URL("../app/android-app.ts", import.meta.url), "utf8");
  const dialog = await readFile(new URL("../app/AndroidInstallDialog.tsx", import.meta.url), "utf8");
  const capacitor = await readFile(new URL("../capacitor.config.ts", import.meta.url), "utf8");
  const nextConfig = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");
  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");

  assert.match(capacitor, /appId: "com\.futbobo\.game"/);
  assert.match(capacitor, /webDir: "out"/);
  assert.match(nextConfig, /CAPACITOR_BUILD/);
  assert.match(android, /releases\/latest\/download\/futbobo\.apk/);
  assert.match(android, /ANDROID_APP_VERSION = packageJson\.version/);
  assert.match(android, /checkForAndroidUpdate/);
  assert.match(android, /navigator\.onLine/);
  assert.match(dialog, /Baixar APK offline/);
  assert.match(dialog, /100% offline/);
  assert.match(page, /<AndroidInstallDialog/);
  assert.match(packageJson, /"android:publish"/);
});

test("modera o melhor da partida e transforma o destaque em coletiva", async () => {
  const engine = await readFile(new URL("../app/botao/engine.ts", import.meta.url), "utf8");
  const page = await readCareerSource();
  const styles = await readFile(new URL("../app/botao/botao.css", import.meta.url), "utf8");

  assert.match(engine, /const contributions = state\.playerGoals \+ state\.playerAssists/);
  assert.match(engine, /const decisiveSingleContribution/);
  assert.match(engine, /contributions >= 3/);
  assert.match(engine, /contributions >= 2/);
  assert.match(page, /function buildPressConference/);
  assert.match(page, /pendingPressConference:/);
  assert.match(page, /Ir para a coletiva de imprensa/);
  assert.match(page, /function answerPressConference/);
  assert.match(page, /COLETIVA · PERGUNTA/);
  assert.match(styles, /\.press-conference-backdrop/);
});

test("cria momentos engraçados e específicos com espaço próprio na carreira", async () => {
  const moments = await readFile(new URL("../app/futbobo-moments.ts", import.meta.url), "utf8");
  const page = await readCareerSource();
  const ids = [...moments.matchAll(/id: "(funny-[^"]+)"/g)].map((match) => match[1]);

  assert.equal(ids.length, 22, "o pacote precisa manter variedade suficiente para várias carreiras");
  assert.equal(new Set(ids).size, ids.length, "cada momento precisa ter identidade própria");
  assert.equal((moments.match(/oneTime: true/g) ?? []).length, ids.length, "momentos específicos não devem se repetir na mesma carreira");
  assert.match(moments, /Seu companheiro quer abrir um canal de gameplay com você/);
  assert.match(moments, /O papagaio do vizinho aprendeu sua comemoração/);
  assert.match(moments, /campeonato de futebol de botão na concentração/);
  assert.match(page, /import \{ FUTBOBO_MOMENTS \} from "\.\.\/futbobo-moments"/);
  assert.match(page, /event\.id\.startsWith\("funny-"\)/);
  assert.match(page, /< 0\.22/);
});

test("mantem menu desktop e mesa de decisoes mobile dentro da viewport", async () => {
  const styles = await readFile(new URL("../app/premium.css", import.meta.url), "utf8");

  assert.match(styles, /\.app-shell-welcome \.welcome-main \.hero-pitch \{/);
  assert.match(styles, /grid-template-rows: max-content minmax\(0,1fr\) max-content max-content/);
  assert.match(styles, /\.app-shell-welcome \.welcome-layout \{[\s\S]*?height: auto;[\s\S]*?overflow: hidden;/);
  assert.match(styles, /\.career-phase-career\.career-tab-event > \.event-stage \{[\s\S]*?grid-template-rows: max-content max-content minmax\(0,1fr\)/);
  assert.match(styles, /\.career-phase-career\.career-tab-event > \.career-status-strip \{[\s\S]*?overflow: hidden;/);
  assert.match(styles, /\.career-phase-career\.career-tab-event \.choice-list \{[\s\S]*?grid-auto-rows: minmax\(44px,1fr\)/);
  assert.match(styles, /@media \(max-width: 540px\) and \(max-height: 700px\)/);
  assert.match(styles, /v89 — mobile decision deck/);
  assert.match(styles, /\.app-shell-career \.career-phase-career\.career-tab-event \{[\s\S]*?padding-bottom: calc\(66px \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(styles, /\.career-phase-career\.career-tab-event > \.event-stage \{[\s\S]*?align-content: stretch;/);
  assert.match(styles, /\.career-phase-career\.career-tab-event > \.event-stage \{[\s\S]*?padding-bottom: 0;/);
  assert.match(styles, /\.career-phase-career\.career-tab-event \.objective-card > small \{[\s\S]*?display: block;/);
  assert.match(styles, /\.career-phase-career\.career-tab-event \.event-card \{[\s\S]*?grid-template-rows: minmax\(0, 1fr\) max-content;[\s\S]*?border-radius: 18px;/);
  assert.match(styles, /\.career-phase-career\.career-tab-event \.choice-list,[\s\S]*?align-self: end;[\s\S]*?grid-auto-rows: minmax\(44px, max-content\);/);
  assert.match(styles, /\.career-phase-career\.career-tab-event \.decision-button \{[\s\S]*?border-radius: 10px;/);
  assert.match(styles, /--decision-edge: 12px;/);
  assert.match(styles, /\.career-phase-career\.career-tab-event \.objective-card \{[\s\S]*?margin: var\(--decision-edge\) var\(--decision-edge\) 0;/);
  assert.match(styles, /\.career-phase-career\.career-tab-event \.event-heading p \{[\s\S]*?display: block;/);
  assert.match(styles, /\.career-phase-career\.career-tab-event \.decision-button small \{[\s\S]*?display: block;/);
});

test("oferece uma Copa do Mundo independente que respeita as regras atuais e campo horizontal apenas no PC", async () => {
  const home = await readCareerSource();
  const cup = await readFile(new URL("../app/copa/page.tsx", import.meta.url), "utf8");
  const match = await readFile(new URL("../app/botao/BotaoMatch.tsx", import.meta.url), "utf8");
  const render = await readFile(new URL("../app/botao/render.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/botao/botao.css", import.meta.url), "utf8");

  assert.match(home, /href="\/copa"/);
  assert.match(home, /Jogar uma Copa do Mundo/);
  assert.match(cup, /const KNOCKOUT_STAGES = \["16 avos", "Oitavas", "Quartas", "Semifinal", "Final"\]/);
  assert.match(cup, /usedOpponents: \[\.\.\.campaign\.usedOpponents, opponentId\]/);
  assert.match(cup, /buildNationalMatchSetup/);
  assert.match(cup, /<BotaoMatch/);
  assert.match(cup, /Uma Copa inteira/);
  assert.match(cup, /SETTINGS_KEY = "futbobo:settings:v1"/);
  assert.match(cup, /function currentCupRules/);
  assert.match(cup, /goalLimit: \[0, 3, 5\]\.includes\(goalLimit\)/);
  assert.match(cup, /rules: currentCupRules\(groupStage\)/);

  assert.match(match, /const \[desktopLandscape, setDesktopLandscape\]/);
  assert.match(match, /futbobo_botao_landscape/);
  assert.match(match, /context\.setTransform\(0, scale, -scale, 0/);
  assert.match(match, /toFieldPoint\(event\.clientX, event\.clientY, canvas\.getBoundingClientRect\(\), desktopLandscape\)/);
  assert.match(match, /botao-desktop-only/);
  assert.match(match, /compactMobileTable/);
  assert.match(match, /Encolher mesa/);
  assert.match(render, /rotated = false/);
  assert.match(styles, /\.botao-desktop-only,\s*\.botao-mobile-size-toggle \{ display: none; \}/);
  assert.match(styles, /\.botao-mobile-size-toggle \{ display: inline-flex;/);
  assert.match(styles, /\.botao-root-landscape \.botao-canvas \{ aspect-ratio: 516 \/ 316; \}/);
  assert.match(styles, /v90 — desktop landscape is a real table-first mode/);
  assert.match(styles, /\.botao-root-landscape \{[\s\S]*?grid-template-columns: minmax\(0,1fr\) clamp\(244px,19vw,320px\);[\s\S]*?grid-template-rows: minmax\(0,1fr\) max-content;/);
  assert.match(styles, /\.botao-root-landscape \.botao-table-wrapper \{[\s\S]*?grid-column: 1;[\s\S]*?grid-row: 1 \/ 3;[\s\S]*?width: min\(100%,calc\(\(100dvh - 32px\) \* 516 \/ 316\)\);/);
  assert.match(styles, /\.botao-root-landscape \.botao-hud \{[\s\S]*?grid-column: 2;[\s\S]*?grid-row: 1;/);
  assert.match(styles, /\.botao-root-landscape \.botao-controls \{[\s\S]*?grid-column: 2;[\s\S]*?grid-row: 2;/);
});

test("corrige competicoes, bola de ouro, rivais e numeros persistentes", async () => {
  const page = await readCareerSource();
  const adapter = await readFile(new URL("../app/botao/adapter.ts", import.meta.url), "utf8");
  const engine = await readFile(new URL("../app/botao/engine.ts", import.meta.url), "utf8");
  const match = await readFile(new URL("../app/botao/BotaoMatch.tsx", import.meta.url), "utf8");

  assert.match(page, /const BALLON_DOR_EXCLUDED_TROPHIES = new Set/);
  assert.match(page, /"domesticSuperCup"/);
  assert.match(page, /"recopaSudamericana"/);
  assert.match(page, /const playerIsEuropean/);
  assert.match(page, /const genuinelyStruggling/);
  assert.match(page, /seeded\(seed, 1901\) < 0\.25/);
  assert.match(page, /clamp\(rival\.overall \+ development, 48, 96\)/);
  assert.match(adapter, /const eliteFinal = new Set/);
  assert.match(adapter, /candidate\.reputation >= 4/);
  assert.match(adapter, /args\.competitionId\.includes\("jogos-ol"\)/);
  assert.match(adapter, /isGlobalFinal \? 4 : 2/);
  assert.match(engine, /const SQUAD_NUMBER_POOL = \[1, 10, 9, 8, 7, 11/);
  assert.match(engine, /hashSeed\("futbobo-squad-numbers", teamId\)/);
  assert.match(engine, /persistentSquadNumbers\(\s*setup\.userTeam\.id,\s*\[setup\.player\.number\]/);
  assert.match(match, /state\.setup\.stageName === "Final" \? "CAMPEÃO!" : "CLASSIFICADO!"/);
});

test("expande personagens e transforma o Mundial em campanha jogavel", async () => {
  const page = await readCareerSource();
  const appearance = await readFile(new URL("../app/player-appearance.ts", import.meta.url), "utf8");
  const editor = await readFile(new URL("../app/PlayerAppearanceEditor.tsx", import.meta.url), "utf8");
  const adapter = await readFile(new URL("../app/botao/adapter.ts", import.meta.url), "utf8");

  assert.match(appearance, /"Mini afro"/);
  assert.match(appearance, /export const KIT_PATTERN_NAMES/);
  assert.match(appearance, /customSkinColor/);
  assert.match(appearance, /SUB_SAHARAN_COUNTRIES/);
  assert.match(appearance, /export function teamKitPattern/);
  assert.match(editor, /COR PERSONALIZADA/);
  assert.doesNotMatch(editor, /label="Uniforme"/);
  assert.match(page, /function rollShirtNumber/);
  assert.match(page, /Math\.round\(game\.managerTrust\)\}%/);
  assert.match(page, /overallVisibility/);
  assert.match(page, /worldCampaign: true/);
  assert.match(page, /\["Playoff Mundial", "Quartas de final", "Semifinal", "Final"\]/);
  assert.match(adapter, /function pickClubWorldOpponent/);
  assert.match(adapter, /roll < \.5 \? "SOUTH_AMERICA" : roll < \.65 \? "NORTH_AMERICA" : roll < \.9 \? "ASIA"/);
});

test("vencer uma copa nacional jogavel recalcula a vaga continental", async () => {
  const page = await readCareerSource();

  assert.match(page, /function continentalSlotAfterSeason/);
  assert.match(page, /league\.id === "brasileirao-b" \? "libertadores" : "europa"/);
  assert.match(page, /competitionId === "domesticCup"[\s\S]*continentalSlotAfterSeason/);
  assert.match(page, /continentalSlot: resolvedContinentalSlot/);
});

test("personagens aleatorios reservam cores fantasia para tres por cento dos casos", async () => {
  const appearance = await readFile(new URL("../app/player-appearance.ts", import.meta.url), "utf8");

  assert.match(appearance, /NATURAL_HAIR_COLOR_INDICES/);
  assert.match(appearance, /COLORED_HAIR_COLOR_INDICES/);
  assert.match(appearance, /random\(\) < 0\.03 \? COLORED_HAIR_COLOR_INDICES : NATURAL_HAIR_COLOR_INDICES/);
});

test("expande o mapa com Egito, Africa do Sul, Australia e vinte novas selecoes", async () => {
  const gameData = await readFile(new URL("../app/game-data.ts", import.meta.url), "utf8");
  const page = await readCareerSource();
  const adapter = await readFile(new URL("../app/botao/adapter.ts", import.meta.url), "utf8");

  assert.match(gameData, /id: "egypt-premier"[\s\S]*name: "Egyptian Premier League"/);
  assert.match(gameData, /id: "south-africa-premiership"[\s\S]*name: "Betway Premiership"/);
  assert.match(gameData, /id: "a-league"[\s\S]*name: "A-League Men"/);
  assert.equal((gameData.match(/leagueId: "egypt-premier"/g) ?? []).length, 21);
  assert.equal((gameData.match(/leagueId: "south-africa-premiership"/g) ?? []).length, 16);
  assert.equal((gameData.match(/leagueId: "a-league"/g) ?? []).length, 12);

  for (const countryId of [
    "armenia", "azerbaijao", "cazaquistao", "luxemburgo", "siria", "libano",
    "palestina", "malasia", "filipinas", "benim", "uganda", "tanzania", "quenia",
    "guine-equatorial", "suriname", "nicaragua", "republica-dominicana",
    "papua-nova-guine", "vanuatu", "nova-caledonia",
  ]) {
    assert.match(gameData, new RegExp(`id: "${countryId}"`));
  }

  assert.match(gameData, /\| "african"/);
  assert.match(page, /african: \{ id: "cafChampions", name: "CAF Champions League", icon: "CAF" \}/);
  assert.match(page, /confederation === "AFRICA"[\s\S]*?"african"/);
  assert.match(page, /cafChampions: saved\.trophyCabinet\?\.cafChampions \?\? 0/);
  assert.match(adapter, /roll < \.95 \? "AFRICA" : "OCEANIA"/);
});

test("abre cinco novas ligas completas e transforma a Arabia no mercado de salarios gigantes", async () => {
  const gameData = await readFile(new URL("../app/game-data.ts", import.meta.url), "utf8");
  const page = await readCareerSource();
  const careerSystems = await readFile(new URL("../app/career-systems.ts", import.meta.url), "utf8");

  const expectedLeagueSizes = new Map([
    ["botola-pro", 16],
    ["super-league-greece", 14],
    ["liga-boliviana", 16],
    ["liga-futve", 14],
    ["chance-liga", 16],
  ]);
  for (const [leagueId, expectedSize] of expectedLeagueSizes) {
    assert.match(gameData, new RegExp(`id: "${leagueId}"`));
    assert.equal((gameData.match(new RegExp(`leagueId: "${leagueId}"`, "g")) ?? []).length, expectedSize);
  }

  assert.match(page, /"botola-pro": 0\.42/);
  assert.match(page, /"super-league-greece": 0\.58/);
  assert.match(page, /"liga-boliviana": 0\.24/);
  assert.match(page, /"liga-futve": 0\.22/);
  assert.match(page, /"chance-liga": 0\.55/);
  assert.match(page, /AFRICA: \["egito", "africa-do-sul", "marrocos"/);
  assert.match(careerSystems, /club\.countryId === "arabia-saudita" \? 7\.4 : 2\.8/);
});

test("abre a carreira para microestados e novos azarões internacionais", async () => {
  const gameData = await readFile(new URL("../app/game-data.ts", import.meta.url), "utf8");
  const page = await readCareerSource();
  const assetSync = await readFile(new URL("../scripts/sync-football-assets.mjs", import.meta.url), "utf8");

  for (const countryId of [
    "vaticano", "san-marino", "andorra", "liechtenstein", "malta", "gibraltar",
    "ilhas-faroe", "moldavia", "estonia", "letonia", "lituania", "nepal", "butao",
    "mongolia", "bangladesh",
  ]) {
    assert.match(gameData, new RegExp(`id: "${countryId}"`));
    assert.match(page, new RegExp(`(?:"${countryId}"|${countryId}): \\[`));
    assert.match(assetSync, new RegExp(`(?:"${countryId}"|${countryId}): "`));
  }
});

test("recorta estampas do uniforme dentro da camisa", async () => {
  const appearance = await readFile(new URL("../app/player-appearance.ts", import.meta.url), "utf8");
  const drawKit = appearance.slice(appearance.indexOf("function drawKit"), appearance.indexOf("function drawBeard"));

  assert.match(drawKit, /ctx\.rect\(-22 \* scale, 7 \* scale, 44 \* scale, 27 \* scale\);/);
  assert.match(drawKit, /ctx\.clip\(\);/);
  assert.match(drawKit, /ctx\.rotate\(-\.56\)/, "a faixa diagonal continua existindo dentro do recorte");
  assert.match(drawKit, /ctx\.restore\(\);\s*\}/);
});

test("publica metadados completos para buscadores no dominio oficial", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const robots = await readFile(new URL("../app/robots.ts", import.meta.url), "utf8");
  const sitemap = await readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8");
  const manifest = await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8");

  assert.match(layout, /Simulador de Carreira de Jogador de Futebol/);
  assert.match(layout, /"@type": "VideoGame"/);
  assert.match(layout, /alternates:[\s\S]*canonical: "\/"/);
  assert.match(layout, /637 clubes, 36 ligas, 139 seleções/);
  assert.match(robots, /https:\/\/futbobo\.top\/sitemap\.xml/);
  assert.match(sitemap, /https:\/\/futbobo\.top\/copa\//);
  assert.match(sitemap, /https:\/\/futbobo\.top\/botao\//);
  assert.match(manifest, /"start_url": "\/"/);
  assert.doesNotMatch(manifest, /\/futbobo\//);
});

test("abre um X1 local real e reorganiza o menu por tipo de gameplay", async () => {
  const home = await readCareerSource();
  const match = await readFile(new URL("../app/botao/BotaoMatch.tsx", import.meta.url), "utf8");
  const versus = await readFile(new URL("../app/x1/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/premium.css", import.meta.url), "utf8");
  const versusStyles = await readFile(new URL("../app/x1/x1.css", import.meta.url), "utf8");

  assert.match(home, /className="welcome-mode-menu"/);
  assert.match(home, /className="mode-menu-grid"/);
  assert.match(home, /Voltar ao vestiário/);
  assert.match(home, /Resolver no sofá/);
  assert.match(home, /Carregar carreira/);
  assert.match(home, /DESAFIO FUTBOBO/);
  assert.match(home, /href="\/copa"/);
  assert.match(home, /href="\/x1"/);
  assert.match(match, /controlMode\?: "cpu" \| "local"/);
  assert.match(match, /const activeSide = localMatch \? state\.turn : "user"/);
  assert.match(match, /if \(localMatch\) return;/);
  assert.match(match, /hideUserMarker: localMatch/);
  assert.match(match, /TOQUE NA TELA/);
  assert.match(versus, /controlMode="local"/);
  assert.match(versus, /localControl: true/);
  assert.match(versus, /Relâmpago/);
  assert.match(versus, /Maratona/);
  assert.match(versus, /setRulePresetId/);
  assert.match(versus, /Dois jogadores\./);
  assert.doesNotMatch(versus, /setFirstName|setSecondName/);
  assert.match(versus, /Passe o aparelho/);
  assert.match(styles, /\.mode-menu-grid/);
  assert.match(versusStyles, /\.x1-versus-builder/);
});

test("dá ao goleiro uma carreira própria da base ao fim da trajetória", async () => {
  const page = await readCareerSource();
  const keeperEvents = await readFile(new URL("../app/goalkeeper-events.ts", import.meta.url), "utf8");
  const systems = await readFile(new URL("../app/career-systems.ts", import.meta.url), "utf8");
  const exclusiveEventIds = keeperEvents.match(/id: "keeper-/g) ?? [];

  assert.ok(exclusiveEventIds.length >= 18, `esperava pelo menos 18 eventos exclusivos, recebeu ${exclusiveEventIds.length}`);
  assert.match(keeperEvents, /GOALKEEPER_YOUTH_EVENTS/);
  assert.match(keeperEvents, /A disputa pelo gol virou um campeonato à parte/);
  assert.match(keeperEvents, /O país inteiro espera uma defesa/);
  assert.match(keeperEvents, /O clube contratou quem dizem ser seu sucessor/);
  assert.match(page, /state\.position === "GOL" && unseenGoalkeeperEvents\.length/);
  assert.match(page, /< 0\.64/);
  assert.match(page, /state\.position === "GOL" \? GOALKEEPER_YOUTH_EVENTS : YOUTH_EVENTS/);
  assert.match(page, /Melhor Goleiro do/);
  assert.match(page, /Muralha da Temporada/);
  assert.match(page, /isKeeper && hasGoalkeeperAward \? 72/);
  assert.match(systems, /metric: "goalsConceded"/);
  assert.match(systems, /metrics\.cleanSheets \* 2\.2/);
});

test("mantém World Players persistentes, compactos e determinísticos por carreira", async () => {
  const model = await readFile(new URL("../app/career/world-player-model.ts", import.meta.url), "utf8");
  const domain = await readFile(new URL("../app/career/world-players.ts", import.meta.url), "utf8");
  const state = await readFile(new URL("../app/career/state.ts", import.meta.url), "utf8");
  const simulation = await readFile(new URL("../app/career/simulation.ts", import.meta.url), "utf8");

  assert.match(model, /export type WorldPlayer = \{/);
  assert.match(model, /birthSeason: number/);
  assert.match(model, /clubHistory: WorldPlayerClubSpell\[\]/);
  assert.match(model, /honors: WorldPlayerHonor\[\]/);
  assert.match(model, /population: WorldPopulationBucket\[\]/);
  assert.match(domain, /stablePlayerId\(universe\.seed, season, serial\)/);
  assert.match(domain, /lastAdvancedSeason >= context\.season/);
  assert.match(domain, /index < 42/);
  assert.match(domain, /context\.season - player\.retiredSeason > 6/);
  assert.match(state, /worldPlayers: normalizeWorldPlayerUniverse/);
  assert.match(simulation, /advanceWorldPlayerUniverse\(nextBase\.worldPlayers/);
});

test("liga rivais e premiações ao mundo sem substituir seus sistemas atuais", async () => {
  const domain = await readFile(new URL("../app/career/world-players.ts", import.meta.url), "utf8");

  assert.match(domain, /export function syncRivalsToWorldPlayers/);
  assert.match(domain, /rivalLinks\[rival\.id\]/);
  assert.match(domain, /export function resolveWorldPlayerByName/);
  assert.match(domain, /export function ensureKnownWorldPlayer/);
  assert.match(domain, /export function recordWorldPlayerHonor/);
  assert.match(domain, /if \(player\.honors\.some\(\(item\) => item\.id === id\)\) return universe/);
  assert.match(domain, /nomination\.winner/);
});

test("World Players usam o mesmo motor central de mercado", async () => {
  const market = await readFile(new URL("../app/career/transfer-market.ts", import.meta.url), "utf8");
  const domain = await readFile(new URL("../app/career/world-players.ts", import.meta.url), "utf8");

  assert.match(market, /export type MarketPlayerProfile/);
  assert.match(market, /export function rankMarketDestinations/);
  assert.match(market, /marketPositionNeed/);
  assert.match(domain, /rankMarketDestinations\(/);
  assert.match(domain, /status: loan \? "loaned" : "active"/);
  assert.match(domain, /moveType: loan \? "loan" : contractExpired \? "free-agent" : "permanent"/);
  assert.match(domain, /moveType: "loan-return"/);
});

test("mantém a janela de transferências rolável dentro do shell travado", async () => {
  const screen = await readFile(new URL("../app/components/career/TransferMarketScreen.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/components/career/TransferMarketScreen.module.css", import.meta.url), "utf8");

  assert.match(screen, /styles\.screen} transfer-stage screen-enter/);
  assert.match(styles, /min-height: 0/);
  assert.match(styles, /overflow-y: auto/);
  assert.match(styles, /touch-action: pan-y/);
  assert.match(styles, /-webkit-overflow-scrolling: touch/);
});

test("abre a Europa, organiza o Mundo e sincroniza o Mundial com o campeão anterior", async () => {
  const market = await readFile(new URL("../app/career/transfer-market.ts", import.meta.url), "utf8");
  const competitions = await readFile(new URL("../app/career/world-club-competitions.ts", import.meta.url), "utf8");
  const simulation = await readFile(new URL("../app/career/simulation.ts", import.meta.url), "utf8");
  const world = await readFile(new URL("../app/components/career/CareerWorld.tsx", import.meta.url), "utf8");
  const shell = await readFile(new URL("../app/components/shell/FutboboShell.tsx", import.meta.url), "utf8");

  assert.match(market, /state\.overall >= 72/);
  assert.match(market, /const doorCount = 1 \+ Number/);
  assert.match(competitions, /const feederSeason = season - 1/);
  assert.match(competitions, /worldFinalOpponentForSeason/);
  assert.match(competitions, /config\.id === "conference-league"/);
  assert.match(simulation, /worldFinalOpponentForSeason\(affected/);
  assert.match(world, /"now" \| "national" \| "clubs" \| "players" \| "archive"/);
  assert.match(world, /worldUniverseStatLeaders\(state, "assists", 16\)/);
  assert.match(world, /slice\(0, 10\)/);
  assert.match(shell, /"hall-career"/);
  assert.match(shell, /initialHallEntry=\{selectedHallEntry\}/);
});

test("coloca o protagonista no universo e impede campeões continentais duplicados", async () => {
  const players = await readFile(new URL("../app/career/world-player-world.ts", import.meta.url), "utf8");
  const competitions = await readFile(new URL("../app/career/world-club-competitions.ts", import.meta.url), "utf8");
  const records = await readFile(new URL("../app/career/official-football-records.ts", import.meta.url), "utf8");
  const world = await readFile(new URL("../app/components/career/CareerWorld.tsx", import.meta.url), "utf8");

  assert.match(players, /playerId: "protagonist", highlight: true/);
  assert.match(players, /worldUniverseBallonDorLeaders/);
  assert.match(world, /styles\.protagonistRow/);
  assert.match(world, /Maiores ladrões de bola/);
  assert.match(world, /Donos do zero/);
  assert.match(competitions, /reservedWinners: Map<number, Set<string>>/);
  assert.match(competitions, /CONMEBOL Libertadores/);
  assert.match(competitions, /CONMEBOL Sudamericana/);
  assert.match(competitions, /HISTORIC_WORLD_TITLES/);
  assert.match(records, /WORLD_ARCHIVE_DUPLICATE_IDS/);
  assert.match(world, /archiveFootballRankingsForState/);
});

test("fecha a v93 com iconografia vetorial própria e remove símbolos improvisados da navegação", async () => {
  const icons = await readFile(new URL("../app/components/FutboboIcon.tsx", import.meta.url), "utf8");
  const career = await readFile(new URL("../app/components/career/CareerGame.tsx", import.meta.url), "utf8");
  const shell = await readFile(new URL("../app/components/shell/FutboboShell.tsx", import.meta.url), "utf8");

  assert.match(icons, /viewBox="0 0 24 24"/);
  assert.match(icons, /strokeWidth="1\.8"/);
  assert.match(career, /FutboboIcon name="history"/);
  assert.doesNotMatch(career, /<span>│<\/span>Histórico/);
  assert.match(shell, /FutboboIcon name="settings"/);
  assert.match(shell, /FutboboIcon name="medal"/);
});

test("encerra a viagem de transferência com uma saída suave", async () => {
  const transfer = await readFile(new URL("../app/components/career/TransferMarketScreen.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/components/career/TransferMarketScreen.module.css", import.meta.url), "utf8");

  assert.match(transfer, /setJourneyLeaving\(true\)/);
  assert.match(transfer, /fadeDelay \+ fadeDuration/);
  assert.match(transfer, /styles\.travelLeaving/);
  assert.match(styles, /@keyframes travelBackdropOut/);
  assert.match(styles, /@keyframes travelCardOut/);
  assert.match(styles, /\.travelLeaving \.travelCard/);
});
