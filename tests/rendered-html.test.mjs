import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const outputRoot = new URL("../out/", import.meta.url);

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
  assert.match(html, /og-v5\.png/);
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
    "Escolha sua base",
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
    "DESTAQUE ABRIU ESTA PORTA",
    "VITRINE EUROPEIA",
    "CONSEQUÊNCIAS DA ESCOLHA",
    "Ver propostas profissionais",
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
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
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
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /mobile-action-dock/);
  assert.match(page, /career-phase-\$\{game\.phase\}/);
  assert.match(styles, /@media \(max-width: 540px\)/);
  assert.match(styles, /\.career-shell \{[\s\S]*height: 100%/);
  assert.match(styles, /\.mobile-action-dock \{[\s\S]*position: fixed/);
  assert.match(styles, /\.event-card \{[\s\S]*position: absolute/);
});

test("aplica o equilíbrio levemente mais favorável sem liberar títulos fáceis", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
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

test("valoriza os prêmios individuais e deixa a Bola de Ouro rara, mas alcançável", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /const europeanBallonEligible =[\s\S]*nextOverall >= 84[\s\S]*performanceScore >= 75/);
  assert.match(page, /const ballonChance = clamp\(20 \+ Math\.max\(0, ballonScore - 76\) \* 4, 20, 85\)/);
  assert.match(page, /Jogador do Ano do \$\{leagueLabel\}/);
  assert.match(page, /MVP da Champions League/);
  assert.match(page, /FIFPRO World XI/);
  assert.match(page, /function AwardReveal/);
  assert.match(page, /function AwardCeremony/);
  assert.match(page, /OS TRÊS FINALISTAS/);
  assert.match(page, /Revelar vencedor/);
  assert.match(page, /season-awards-showcase/);
  assert.match(page, /award-cabinet-feature/);
  assert.match(styles, /\.award-finalists/);
  assert.match(styles, /\.award-reveal-card\.award-legendary/);
  assert.match(styles, /\.award-cabinet-feature\.award-legendary/);
});

test("registra o Hall da Fama local e resume a carreira por clube", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const systems = await readFile(new URL("../app/career-systems.ts", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /HALL_OF_FAME_KEY/);
  assert.match(page, /futbobo:hall-of-fame:v1/);
  assert.match(page, /careerHallEntry/);
  assert.match(page, /clubCareerSummary/);
  assert.match(page, /PASSAGEM POR CLUBES/);
  assert.match(page, /PRÊMIOS INDIVIDUAIS/);
  assert.match(page, /final-individual-awards/);
  assert.match(page, /HALL DA FAMA LOCAL/);
  assert.match(styles, /\.career-club-summary/);
  assert.match(styles, /\.final-awards-list/);
  assert.match(styles, /grid-template-columns: 64px minmax\(84px,1fr\) minmax\(112px,auto\)/);
  assert.match(styles, /@media \(max-width: 420px\)[\s\S]*\.career-club-list > article/);
  assert.match(styles, /\.hall-ranking/);
  assert.match(systems, /O Imortal/);
  assert.match(systems, /No debate do GOAT/);
  assert.match(systems, /Carreira anônima/);
});

test("mantém o gramado contínuo atrás da meta do treinador", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(styles, /\.event-stage \{[\s\S]*repeating-linear-gradient/);
  assert.match(styles, /\.event-art \{[^}]*background: transparent/);
  assert.match(styles, /\.event-stage \.market-strip \{[^}]*background: rgba\(7,23,16,.9\)/);
});

test("deixa o fim de temporada rolar sem o rodapé cobrir o conteúdo", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /futbobo-viewport-locked/);
  assert.match(page, /game\.phase === "consequence" \|\|\s+game\.phase === "transfer"/);
  assert.match(page, /window\.scrollTo\(0, 0\)/);
  assert.match(styles, /body\.futbobo-viewport-locked[\s\S]*position: fixed/);
  assert.match(styles, /\.app-shell-season-result \{[\s\S]*height: auto;[\s\S]*overflow: visible;/);
  assert.match(styles, /\.career-shell\.career-phase-season-result \{[\s\S]*min-height: 100dvh;[\s\S]*overflow: visible;/);
  assert.match(styles, /\.career-phase-season-result > \.result-stage \{[\s\S]*overflow: visible;/);
  assert.match(styles, /\.career-phase-season-result \.mobile-action-dock \{[\s\S]*position: static;/);
});

test("protege o OVR jovem e permite explosões raras de talento", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
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

test("prioriza clubes europeus quando a carreira já está na Europa", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /isEuropeanClub\(current\) && !opts\.forceDomestic/);
  assert.match(page, /clubConfederation\(club\) === "EUROPE"/);
  assert.match(page, /forceForeign: true/);
  assert.match(page, /brazilReturnChance = state\.age >= 34 \? 0\.78 : state\.age >= 30 \? 0\.12 : 0\.035/);
  assert.match(page, /const brazilCount = state\.age >= 34 \? 2 : 1/);
  assert.match(page, /isEuropeanClub\(current\) && confederation !== "EUROPE"/);
  assert.match(page, /MERCADO EUROPEU/);
  assert.match(page, /Retorno raro ao Brasil/);
  assert.match(styles, /\.european-market-card/);
  assert.match(styles, /\.offer-homecoming-tag/);
});

test("mostra de cinco a dez propostas na janela de transferências", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /performanceScore >= 90 \? 5/);
  assert.match(page, /selectOffers\(state, 5, salt/);
  assert.match(page, /const expandedOffers = Array\.from\(new Set\(\[\.\.\.baseOffers, \.\.\.foreignPool\]\)\)\.slice\(0, 10\)/);
  assert.match(page, /expandedOfferCount: Math\.max\(0, game\.transferOffers\.length - 5\)/);
  assert.match(page, /index >= 5 \? "DESTAQUE ABRIU ESTA PORTA"/);
});

test("garante uma proposta europeia compatível até para carreiras em baixa", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /function guaranteedEuropeanOffer/);
  assert.match(page, /function ensureEuropeanOffer/);
  assert.match(page, /baseOffers = ensureEuropeanOffer\(state, salt \+ 941, baseOffers\)/);
  assert.match(page, /Math\.abs\(competitiveStrength\(a\) - targetStrength\)/);
  assert.match(page, /PORTA DE ENTRADA NA EUROPA/);
  assert.match(page, /Uma chance europeia compatível com o seu momento/);
  assert.match(styles, /\.offer-european-door/);
});

test("gera temporadas com mais gols e assistências sem igualar todas as posições", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const data = await readFile(new URL("../app/game-data.ts", import.meta.url), "utf8");

  assert.match(page, /const productionMomentum = clamp\(/);
  assert.match(page, /roleProductionBonus/);
  assert.match(page, /position\.goals \* quality \* productionMomentum/);
  assert.match(page, /position\.assists \* quality \* productionMomentum/);
  assert.match(data, /key: "CA"[\s\S]*goals: 0\.43, assists: 0\.11/);
  assert.match(data, /key: "MEI"[\s\S]*goals: 0\.22, assists: 0\.3/);
  assert.match(data, /key: "PD"[\s\S]*goals: 0\.28, assists: 0\.22/);
});

test("impede ficar no clube depois de um pedido de transferência aceito", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /if \(!clubId && \(current\.transferRequested \|\| current\.renewalDenied\)\) return current/);
  assert.match(page, /\{!game\.transferRequested && !game\.renewalDenied && <button className="offer-card stay-card"/);
  assert.match(page, /SAÍDA SEM VOLTA/);
  assert.match(page, /Seu pedido foi aceito — não há volta/);
  assert.match(page, /transferStatus: null, transferRequested: false/);
  assert.match(styles, /\.transfer-lock-card/);
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
  assert.ok(clubEntries.length >= 332, "a base deve manter pelo menos 332 clubes");
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
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const clubAssets = await readdir(new URL("../public/assets/clubs/", import.meta.url));
  const flagAssets = await readdir(new URL("../public/assets/flags/", import.meta.url));
  const competitionAssets = await walk(new URL("../public/assets/competitions/", import.meta.url));
  const assetManifest = JSON.parse(await readFile(new URL("../public/assets/football-assets.json", import.meta.url), "utf8"));
  const mappedClubs = Object.values(assetManifest.clubs);
  const providerIds = mappedClubs.map((club) => club.providerId);

  assert.match(page, /LocalBadgeImage/);
  assert.match(page, /assets\/clubs\/\$\{club\.id\}\.png/);
  assert.match(page, /VERIFIED_CLUB_ASSET_IDS\.has\(club\.id\)/);
  assert.match(page, /assets\/flags\/\$\{country\.id\}\.png/);
  assert.match(page, /function CompetitionBadge/);
  assert.match(styles, /\.badge-image-club/);
  assert.match(styles, /\.badge-image-flag/);
  assert.match(styles, /\.badge-image-competition/);
  assert.ok(clubAssets.filter((name) => name.endsWith(".png")).length >= 150, "a maioria dos clubes precisa ter escudo local");
  assert.equal(flagAssets.filter((name) => name.endsWith(".png")).length, 17, "todas as seleções precisam ter bandeira");
  assert.ok(competitionAssets.filter((file) => file.pathname.endsWith(".png")).length >= 12, "as principais competições precisam ter emblema");
  assert.equal(new Set(providerIds).size, providerIds.length, "um mesmo escudo não pode representar clubes diferentes");
  assert.ok(mappedClubs.every((club) => !/women|femin|u-?\d\d|under-?\d\d/i.test(club.providerName)), "escudos precisam representar equipes principais masculinas");
});

test("prioriza destinos sul-americanos e norte-americanos por proximidade geográfica", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /function regionAffinity/);
  assert.match(page, /originConfederation === "SOUTH_AMERICA"/);
  assert.match(page, /club\.countryId === originCountryId\) return -12/);
  assert.match(page, /targetConfederation === "SOUTH_AMERICA"\) return -3/);
  assert.match(page, /targetConfederation === "NORTH_AMERICA"\) return -1/);
  assert.match(page, /function prioritizeCurrentCountry/);
  assert.match(page, /confederation === "NORTH_AMERICA"\) requirement -= state\.age >= 29 \? 10 : 4/);
});

test("adiciona a Copa de Campeões Concacaf sem quebrar o gabinete de troféus", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /concacafChampions: number/);
  assert.match(page, /concacaf: \{ id: "concacafChampions", name: "Copa de Campeões Concacaf", icon: "CCC" \}/);
  assert.match(page, /concacafChampions: saved\.trophyCabinet\?\.concacafChampions \?\? 0/);
});

test("clube pode recusar renovar contrato após temporada ruim, forçando escolha de novo clube", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /const renewalDenied = nonRenewalChance > 0 && seeded\(/);
  assert.match(page, /nonRenewalRiskFactors >= 2/);
  assert.match(page, /RENOVAÇÃO RECUSADA/);
  assert.match(page, /O clube optou por não renovar/);
  assert.match(page, /if \(!clubId && \(current\.transferRequested \|\| current\.renewalDenied\)\) return current/);
});

test("convites raros de outras seleções respeitam proximidade geográfica e nunca se repetem", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

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
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /function randomAcademyClubs\(seed: number\)/);
  assert.match(page, /randomClubSelection\(DOMESTIC_CLUBS, 4/);
  assert.match(page, /randomClubSelection\([\s\S]*DOMESTIC_CLUBS,[\s\S]*2,[\s\S]*\[state\.academyClubId\]/);
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

test("expõe um laboratório Monte Carlo que reutiliza a simulação completa da carreira", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(page, /function simulateMonteCarloCareer/);
  assert.match(page, /function runMonteCarloCareers/);
  assert.match(page, /state = simulateSeason\(state, event, effect, choice\.label, resultText, luckOutcome\)/);
  assert.match(page, /__FUTBOBO_MONTE_CARLO__/);
  assert.match(page, /params\.get\("montecarlo"\)/);
  assert.match(page, /data-testid="monte-carlo-report"/);
  assert.match(styles, /\.monte-carlo-shell/);
});

test("adiciona o pacote de eventos de drama com filtros de carreira", async () => {
  const gameData = await readFile(new URL("../app/game-data.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
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
