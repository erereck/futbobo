import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DATA_FILE = path.join(ROOT, "app", "game-data.ts");
const ASSET_ROOT = path.join(ROOT, "public", "assets");
const API_ROOT = "https://www.thesportsdb.com/api/v1/json/123";
const repairOnly = process.argv.includes("--repair");
const refresh = process.argv.includes("--refresh") || repairOnly;
const missingOnly = process.argv.includes("--missing");

const LEAGUE_SEARCH_NAMES = {
  brasileirao: "Brazilian Serie A",
  premier: "English Premier League",
  laliga: "Spanish La Liga",
  seriea: "Italian Serie A",
  bundesliga: "German Bundesliga",
  ligue1: "French Ligue 1",
  primeira: "Portuguese Primeira Liga",
  eredivisie: "Dutch Eredivisie",
  "liga-argentina": "Argentinian Primera Division",
  "liga-uruguaia": "Uruguayan Primera Division",
  "liga-chilena": "Chilean Primera Division",
  "liga-colombiana": "Colombian Primera A",
  "liga-paraguaia": "Paraguayan Primera Division",
  "liga-equatoriana": "Ecuadorian Serie A",
  "liga-peruana": "Peruvian Primera Division",
  "liga-mx": "Mexican Primera League",
  mls: "American Major League Soccer",
  proleague: "Belgian Jupiler League",
  superlig: "Turkish Super Lig",
  "austria-bundesliga": "Austrian Bundesliga",
  "swiss-super-league": "Swiss Super League",
  "premiership-sco": "Scottish Premier League",
};

const COUNTRY_NAMES = {
  brasil: ["brazil"],
  argentina: ["argentina"],
  uruguai: ["uruguay"],
  chile: ["chile"],
  colombia: ["colombia"],
  paraguai: ["paraguay"],
  equador: ["ecuador"],
  peru: ["peru"],
  mexico: ["mexico"],
  eua: ["united states", "usa"],
  portugal: ["portugal"],
  espanha: ["spain"],
  franca: ["france"],
  inglaterra: ["england"],
  alemanha: ["germany"],
  italia: ["italy"],
  holanda: ["netherlands", "holland"],
  belgica: ["belgium"],
  turquia: ["turkey"],
  austria: ["austria"],
  suica: ["switzerland"],
  escocia: ["scotland"],
};

const FLAG_CODES = {
  brasil: "br",
  argentina: "ar",
  uruguai: "uy",
  chile: "cl",
  colombia: "co",
  paraguai: "py",
  equador: "ec",
  peru: "pe",
  mexico: "mx",
  eua: "us",
  portugal: "pt",
  espanha: "es",
  franca: "fr",
  inglaterra: "gb-eng",
  alemanha: "de",
  italia: "it",
  holanda: "nl",
  belgica: "be",
  turquia: "tr",
  austria: "at",
  suica: "ch",
  escocia: "gb-sct",
};

const TEAM_QUERY_OVERRIDES = {
  athletico: "Athletico Paranaense",
  "atletico-mg": "Atletico Mineiro",
  "bragantino": "Red Bull Bragantino",
  gremio: "Gremio",
  "man-city": "Manchester City",
  "man-utd": "Manchester United",
  "nottingham-forest": "Nottingham Forest",
  "real-betis": "Real Betis",
  inter: "Inter Milan",
  milan: "AC Milan",
  napoli: "Napoli",
  roma: "AS Roma",
  lecce: "Lecce",
  sassuolo: "Sassuolo",
  bayern: "Bayern Munich",
  "werder-bremen": "Werder Bremen",
  mainz: "Mainz",
  "union-berlin": "Union Berlin",
  schalke: "Schalke",
  paderborn: "Paderborn",
  psg: "Paris Saint Germain",
  monaco: "Monaco",
  rennes: "Rennes",
  "paris-fc": "Paris FC",
  "athletic-bilbao": "Athletic Club",
  "deportivo-coruna": "Deportivo La Coruna",
  "gladbach": "Borussia Monchengladbach",
  "vitoria-guimaraes": "Vitoria Guimaraes",
  "nacional-madeira": "Nacional Madeira",
  psv: "PSV",
  utrecht: "Utrecht",
  twente: "Twente",
  "sparta-rotterdam": "Sparta Rotterdam",
  "nec-nijmegen": "NEC",
  "willem-ii": "Willem II",
  "pec-zwolle": "PEC Zwolle",
  telstar: "Telstar",
  "racing-club": "Racing Club",
  independiente: "Independiente",
  "san-lorenzo": "San Lorenzo",
  "newells": "Newells Old Boys",
  "nacional-uru": "Nacional Montevideo",
  "colo-colo": "Colo Colo",
  "u-catolica": "Universidad Catolica Chile",
  "u-de-chile": "Universidad de Chile",
  nublense: "Nublense",
  "atletico-nacional": "Atletico Nacional Medellin",
  junior: "Junior",
  "deportes-tolima": "Deportes Tolima",
  "once-caldas": "Once Caldas",
  "deportivo-pasto": "Deportivo Pasto",
  trinidense: "Sportivo Trinidense",
  "general-caballero": "General Caballero",
  "u-catolica-ecu": "Universidad Catolica Ecuador",
  "universitario": "Universitario de Deportes",
  "club-america": "Club America",
  "chivas": "Guadalajara",
  "pumas-unam": "Pumas UNAM",
  "tigres-uanl": "Tigres",
  toluca: "Toluca",
  pachuca: "Pachuca",
  "club-leon": "Leon",
  "inter-miami": "Inter Miami",
  "nycfc": "New York City FC",
  lafc: "Los Angeles FC",
  "seattle-sounders": "Seattle Sounders",
  "club-brugge": "Club Brugge",
  gent: "KAA Gent",
  "standard-liege": "Standard Liege",
  "union-sg": "Union Saint-Gilloise",
  "sint-truiden": "Sint-Truiden",
  "oh-leuven": "OH Leuven",
  "rwd-molenbeek": "RWD Molenbeek",
  fenerbahce: "Fenerbahce",
  besiktas: "Besiktas",
  basaksehir: "Istanbul Basaksehir",
  "adana-demirspor": "Adana Demirspor",
  kasimpasa: "Kasimpasa",
  genclerbirligi: "Genclerbirligi",
  goztepe: "Goztepe",
  rizespor: "Caykur Rizespor",
  "sturm-graz": "Sturm Graz",
  salzburg: "Red Bull Salzburg",
  "rapid-wien": "Rapid Wien",
  "austria-wien": "Austria Wien",
  "wolfsberger-ac": "Wolfsberger AC",
  "austria-klagenfurt": "Austria Klagenfurt",
  "grazer-ak": "Grazer AK",
  "wsg-tirol": "WSG Tirol",
  "blau-weiss-linz": "Blau Weiss Linz",
  "young-boys": "BSC Young Boys",
  servette: "Servette FC",
  grasshoppers: "Grasshopper Club Zurich",
  "st-gallen": "St Gallen",
  "lausanne-sport": "Lausanne Sport",
  "dundee-united": "Dundee United",
  "st-mirren": "St Mirren",
  "ross-county": "Ross County",
  "st-johnstone": "St Johnstone",
};

const TEAM_ID_OVERRIDES = {
  "man-city": "133613",
  "man-utd": "133612",
  "real-madrid": "133738",
  "rayo-vallecano": "133728",
  malaga: "133736",
  nice: "133712",
  stuttgart: "133660",
  koln: "133654",
  internacional: "134281",
  palmeiras: "134465",
  mallorca: "133733",
  nantes: "133861",
  "river-plate": "135171",
  "independiente-medellin": "137613",
};

const GLOBAL_COMPETITIONS = {
  libertadores: "4501",
  mundial: "4503",
  championsLeague: "4480",
  europaLeague: "4481",
  conferenceLeague: "5071",
  concacafChampions: "4721",
};

const STOP_WORDS = new Set([
  "1",
  "1907",
  "club",
  "clube",
  "football",
  "futebol",
  "futbol",
  "calcio",
  "association",
  "associacao",
  "sociedade",
  "sport",
  "sporting",
  "deportivo",
  "deportiva",
  "desportivo",
  "desportiva",
  "atletico",
  "athletic",
  "fc",
  "cf",
  "ac",
  "sc",
  "afc",
  "cd",
  "ec",
  "sa",
  "the",
  "do",
  "da",
  "de",
  "del",
  "la",
  "el",
]);

const source = await readFile(DATA_FILE, "utf8");
const clubs = [...source.matchAll(/\{ id: "([^"]+)", name: "([^"]+)", shortName: "([^"]+)", abbr: "([^"]+)", city: "[^"]+"[^}]*countryId: "([^"]+)", leagueId: "([^"]+)"/g)]
  .map((match) => ({
    id: match[1],
    name: match[2],
    shortName: match[3],
    abbr: match[4],
    countryId: match[5],
    leagueId: match[6],
  }));
const leagues = [...source.matchAll(/\{ id: "([^"]+)", countryId: "([^"]+)", name: "([^"]+)", cupName: "([^"]+)"/g)]
  .map((match) => ({ id: match[1], countryId: match[2], name: match[3], cupName: match[4] }));

if (!clubs.length || !leagues.length) throw new Error("Não foi possível ler os clubes e ligas de app/game-data.ts.");

await Promise.all([
  mkdir(path.join(ASSET_ROOT, "clubs"), { recursive: true }),
  mkdir(path.join(ASSET_ROOT, "flags"), { recursive: true }),
  mkdir(path.join(ASSET_ROOT, "competitions", "leagues"), { recursive: true }),
  mkdir(path.join(ASSET_ROOT, "competitions", "cups"), { recursive: true }),
]);

let lastApiRequest = 0;
let manifest = {
  generatedAt: new Date().toISOString(),
  providers: {
    clubsAndCompetitions: "TheSportsDB",
    flags: "FlagCDN",
  },
  clubs: {},
  flags: {},
  competitions: {},
};
if (missingOnly || repairOnly) {
  try {
    manifest = JSON.parse(await readFile(path.join(ASSET_ROOT, "football-assets.json"), "utf8"));
    manifest.generatedAt = new Date().toISOString();
  } catch {
    throw new Error("Rode a sincronização completa antes de usar --missing.");
  }
}
const queuedDownloads = [];

function plain(value = "") {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function meaningful(value = "") {
  return plain(value)
    .split(" ")
    .filter((token) => token && !STOP_WORDS.has(token))
    .join(" ");
}

function variants(team) {
  return [
    team.strTeam,
    team.strTeamShort,
    ...(team.strTeamAlternate ?? "").split(","),
  ].filter(Boolean);
}

function similarity(a, b) {
  const left = meaningful(a);
  const right = meaningful(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.replaceAll(" ", "") === right.replaceAll(" ", "")) return 0.96;
  if (left.includes(right) || right.includes(left)) return 0.84;
  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union ? intersection / union : 0;
}

function teamScore(club, team, enforceCountry = false) {
  const names = [club.name, club.shortName, TEAM_QUERY_OVERRIDES[club.id]].filter(Boolean);
  const bestNameScore = Math.max(...names.flatMap((name) => variants(team).map((variant) => similarity(name, variant))), 0);
  const acceptedCountries = COUNTRY_NAMES[club.countryId] ?? [];
  const countryMatches = acceptedCountries.includes(plain(team.strCountry));
  if (enforceCountry && team.strCountry && !countryMatches) return -1;
  return bestNameScore + (countryMatches ? 0.12 : 0);
}

async function apiJson(endpoint, attempt = 0) {
  const elapsed = Date.now() - lastApiRequest;
  if (elapsed < 2050) await new Promise((resolve) => setTimeout(resolve, 2050 - elapsed));
  const response = await fetch(`${API_ROOT}/${endpoint}`, {
    headers: { "User-Agent": "Futbobo asset sync (github.com/erereck/futbobo)" },
  });
  lastApiRequest = Date.now();
  if (response.status === 429 && attempt < 5) {
    const backoff = 4000 * (attempt + 1);
    console.log(`\n429 recebido, aguardando ${backoff}ms antes de tentar de novo (${attempt + 1}/5)...`);
    await new Promise((resolve) => setTimeout(resolve, backoff));
    return apiJson(endpoint, attempt + 1);
  }
  if (!response.ok) throw new Error(`TheSportsDB respondeu ${response.status} em ${endpoint}`);
  return response.json();
}

async function fileExists(file) {
  try {
    return (await stat(file)).size > 0;
  } catch {
    return false;
  }
}

function queueImage(url, destination, metadataTarget, metadata) {
  if (!url) return;
  queuedDownloads.push({ url, destination });
  Object.assign(metadataTarget, metadata, { source: url });
}

async function downloadImage({ url, destination }) {
  if (!refresh && await fileExists(destination)) return "cached";
  const response = await fetch(url, {
    headers: { "User-Agent": "Futbobo asset sync (github.com/erereck/futbobo)" },
  });
  if (!response.ok) return "failed";
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) return "failed";
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 100) return "failed";
  await writeFile(destination, bytes);
  return "downloaded";
}

function chooseTeam(club, candidates, enforceCountry = false) {
  return candidates
    .filter((team) => (
      team?.strSport === "Soccer"
      && team.strBadge
      && team.strGender !== "Female"
      && !/\b(women|feminino|femenino|u-?\d{2}|under-?\d{2})\b/i.test(team.strTeam)
    ))
    .map((team) => ({ team, score: teamScore(club, team, enforceCountry) }))
    .sort((a, b) => b.score - a.score)[0];
}

function findCompetitionId(teamRows, wantedName) {
  const wanted = meaningful(wantedName);
  for (const team of teamRows) {
    const entries = [
      [team.strLeague, team.idLeague],
      ...Array.from({ length: 6 }, (_, index) => [team[`strLeague${index + 2}`], team[`idLeague${index + 2}`]]),
    ];
    const exact = entries.find(([name, id]) => id && meaningful(name) === wanted);
    if (exact) return exact[1];
    const close = entries.find(([name, id]) => id && (meaningful(name).includes(wanted) || wanted.includes(meaningful(name))));
    if (close) return close[1];
  }
  return null;
}

if (missingOnly || repairOnly) {
  const remaining = [];
  for (const club of clubs) {
    if (
      (repairOnly && TEAM_ID_OVERRIDES[club.id])
      || (missingOnly && !await fileExists(path.join(ASSET_ROOT, "clubs", `${club.id}.png`)))
    ) remaining.push(club);
  }
  for (let index = 0; index < remaining.length; index += 1) {
    const club = remaining[index];
    const providerId = TEAM_ID_OVERRIDES[club.id];
    if (providerId) {
      process.stdout.write(`Confirmando ${index + 1}/${remaining.length}: ${club.shortName}... `);
      const payload = await apiJson(`lookupteam.php?id=${providerId}`);
      const exactChoice = chooseTeam(club, payload.teams ?? [], true);
      if (exactChoice?.team) {
        manifest.clubs[club.id] = {};
        queueImage(
          exactChoice.team.strBadge,
          path.join(ASSET_ROOT, "clubs", `${club.id}.png`),
          manifest.clubs[club.id],
          { providerId: exactChoice.team.idTeam, providerName: exactChoice.team.strTeam },
        );
        console.log("ok");
        continue;
      }
      console.log("não encontrado");
    }
    const queries = [...new Set([
      TEAM_QUERY_OVERRIDES[club.id],
      club.shortName,
      meaningful(club.shortName),
    ].filter(Boolean))];
    let choice;
    for (const query of queries) {
      process.stdout.write(`Recuperando ${index + 1}/${remaining.length}: ${club.shortName} (${query})... `);
      const payload = await apiJson(`searchteams.php?t=${encodeURIComponent(query)}`);
      choice = chooseTeam(club, payload.teams ?? [], true);
      if (choice?.score >= 0.2) {
        console.log("ok");
        break;
      }
      console.log("não encontrado");
      choice = undefined;
    }
    if (!choice?.team?.strBadge) continue;
    manifest.clubs[club.id] = {};
    queueImage(
      choice.team.strBadge,
      path.join(ASSET_ROOT, "clubs", `${club.id}.png`),
      manifest.clubs[club.id],
      { providerId: choice.team.idTeam, providerName: choice.team.strTeam },
    );
  }

  let downloaded = 0;
  let failed = 0;
  for (let index = 0; index < queuedDownloads.length; index += 8) {
    const results = await Promise.all(queuedDownloads.slice(index, index + 8).map(downloadImage));
    downloaded += results.filter((result) => result === "downloaded").length;
    failed += results.filter((result) => result === "failed").length;
  }
  await writeFile(path.join(ASSET_ROOT, "football-assets.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`${repairOnly ? "Auditoria" : "Segunda passagem"}: ${downloaded} escudos atualizados; ${failed} falhas.`);
  process.exit(0);
}

const matched = new Map();
const leagueTeams = new Map();

for (const club of clubs.filter((item) => TEAM_ID_OVERRIDES[item.id])) {
  const payload = await apiJson(`lookupteam.php?id=${TEAM_ID_OVERRIDES[club.id]}`);
  const choice = chooseTeam(club, payload.teams ?? [], true);
  if (choice?.team) matched.set(club.id, choice.team);
}

for (const league of leagues) {
  const searchName = LEAGUE_SEARCH_NAMES[league.id];
  if (!searchName) continue;
  process.stdout.write(`Buscando ${league.name}... `);
  const payload = await apiJson(`search_all_teams.php?l=${encodeURIComponent(searchName.replaceAll(" ", "_"))}`);
  const teams = (payload.teams ?? []).filter((team) => team.strSport === "Soccer");
  leagueTeams.set(league.id, teams);
  const leagueClubs = clubs.filter((club) => club.leagueId === league.id);
  for (const club of leagueClubs) {
    if (matched.has(club.id)) continue;
    const choice = chooseTeam(club, teams);
    if (choice?.score >= 0.48) matched.set(club.id, choice.team);
  }
  console.log(`${matched.size}/${clubs.length} escudos identificados`);
}

const unmatched = clubs.filter((club) => !matched.has(club.id));
for (let index = 0; index < unmatched.length; index += 1) {
  const club = unmatched[index];
  const query = TEAM_QUERY_OVERRIDES[club.id] ?? club.name;
  process.stdout.write(`Completando ${index + 1}/${unmatched.length}: ${club.shortName}... `);
  const payload = await apiJson(`searchteams.php?t=${encodeURIComponent(query)}`);
  const choice = chooseTeam(club, payload.teams ?? [], true);
  if (choice?.score >= 0.42) {
    matched.set(club.id, choice.team);
    console.log("ok");
  } else {
    console.log("fallback");
  }
}

for (const club of clubs) {
  const team = matched.get(club.id);
  if (!team?.strBadge) continue;
  manifest.clubs[club.id] = {};
  queueImage(
    team.strBadge,
    path.join(ASSET_ROOT, "clubs", `${club.id}.png`),
    manifest.clubs[club.id],
    { providerId: team.idTeam, providerName: team.strTeam },
  );
}

for (const [countryId, code] of Object.entries(FLAG_CODES)) {
  const url = `https://flagcdn.com/w160/${code}.png`;
  manifest.flags[countryId] = {};
  queueImage(url, path.join(ASSET_ROOT, "flags", `${countryId}.png`), manifest.flags[countryId], { code });
}

const competitionLookups = [];
for (const league of leagues) {
  const teams = leagueTeams.get(league.id) ?? [];
  const leagueProviderId = teams.find((team) => team.idLeague)?.idLeague;
  const cupProviderId = findCompetitionId(teams, league.cupName);
  if (leagueProviderId) competitionLookups.push({ key: `league:${league.id}`, providerId: leagueProviderId, path: path.join("leagues", `${league.id}.png`) });
  if (cupProviderId) competitionLookups.push({ key: `cup:${league.id}`, providerId: cupProviderId, path: path.join("cups", `${league.id}.png`) });
}
for (const [key, providerId] of Object.entries(GLOBAL_COMPETITIONS)) {
  competitionLookups.push({ key, providerId, path: `${key}.png` });
}

const uniqueLookups = [...new Map(competitionLookups.map((lookup) => [`${lookup.key}:${lookup.providerId}`, lookup])).values()];
for (const lookup of uniqueLookups) {
  process.stdout.write(`Baixando competição ${lookup.key}... `);
  const payload = await apiJson(`lookupleague.php?id=${lookup.providerId}`);
  const competition = payload.leagues?.[0];
  if (competition?.strBadge) {
    manifest.competitions[lookup.key] = {};
    queueImage(
      competition.strBadge,
      path.join(ASSET_ROOT, "competitions", lookup.path),
      manifest.competitions[lookup.key],
      { providerId: lookup.providerId, providerName: competition.strLeague },
    );
    console.log("ok");
  } else {
    console.log("fallback");
  }
}

let downloaded = 0;
let cached = 0;
let failed = 0;
for (let index = 0; index < queuedDownloads.length; index += 8) {
  const results = await Promise.all(queuedDownloads.slice(index, index + 8).map(downloadImage));
  downloaded += results.filter((result) => result === "downloaded").length;
  cached += results.filter((result) => result === "cached").length;
  failed += results.filter((result) => result === "failed").length;
}

await writeFile(path.join(ASSET_ROOT, "football-assets.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log("");
console.log(`Clubes com escudo: ${Object.keys(manifest.clubs).length}/${clubs.length}`);
console.log(`Bandeiras: ${Object.keys(manifest.flags).length}/${Object.keys(FLAG_CODES).length}`);
console.log(`Competições: ${Object.keys(manifest.competitions).length}/${competitionLookups.length}`);
console.log(`Arquivos baixados: ${downloaded}; em cache: ${cached}; falhas: ${failed}`);
