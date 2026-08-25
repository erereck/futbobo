import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const gameDataPath = path.join(root, "app", "game-data.ts");
const syncPath = path.join(root, "scripts", "sync-football-assets.mjs");

function replaceOnce(source, needle, replacement, label) {
  if (!source.includes(needle)) throw new Error(`Anchor not found: ${label}`);
  return source.replace(needle, replacement);
}

let gameData = await readFile(gameDataPath, "utf8");

if (!gameData.includes('id: "danish-superliga"')) {
  const leagueAnchor = '  { id: "premiership-sco", countryId: "escocia", name: "Scottish Premiership", cupName: "Scottish Cup", prestige: 2, championsPlaces: 1, europaPlaces: 1, conferencePlaces: 2 },';
  gameData = replaceOnce(
    gameData,
    leagueAnchor,
    `  { id: "danish-superliga", countryId: "dinamarca", name: "Superliga Dinamarquesa", cupName: "DBU Pokalen", prestige: 2, championsPlaces: 1, europaPlaces: 3, conferencePlaces: 5 },
  { id: "eliteserien", countryId: "noruega", name: "Eliteserien", cupName: "Copa da Noruega", prestige: 2, championsPlaces: 2, europaPlaces: 3, conferencePlaces: 5 },
  { id: "allsvenskan", countryId: "suecia", name: "Allsvenskan", cupName: "Svenska Cupen", prestige: 2, championsPlaces: 1, europaPlaces: 3, conferencePlaces: 5 },
  { id: "ekstraklasa", countryId: "polonia", name: "Ekstraklasa", cupName: "Copa da Polônia", prestige: 2, championsPlaces: 1, europaPlaces: 3, conferencePlaces: 5 },
  { id: "hnl", countryId: "croacia", name: "HNL", cupName: "Copa da Croácia", prestige: 2, championsPlaces: 1, europaPlaces: 3, conferencePlaces: 5 },
  { id: "serbian-superliga", countryId: "servia", name: "SuperLiga Sérvia", cupName: "Copa da Sérvia", prestige: 2, championsPlaces: 1, europaPlaces: 3, conferencePlaces: 5 },
${leagueAnchor}`,
    "league insertion",
  );
}

if (!gameData.includes("const DENMARK_CLUBS: Club[]")) {
  const clubAnchor = "const CZECH_CLUBS: Club[] = [";
  gameData = replaceOnce(
    gameData,
    clubAnchor,
    `// Expansão Norte/Leste Europeu — Denmark
const DENMARK_CLUBS: Club[] = [
  { id: "copenhagen", name: "Football Club København", shortName: "FC København", abbr: "FCK", city: "Copenhague", countryId: "dinamarca", leagueId: "danish-superliga", primary: "#ffffff", secondary: "#1f4fa3", reputation: 4, strength: 79, academy: 5 },
  { id: "midtjylland", name: "Football Club Midtjylland", shortName: "FC Midtjylland", abbr: "FCM", city: "Herning", countryId: "dinamarca", leagueId: "danish-superliga", primary: "#111111", secondary: "#d71920", reputation: 4, strength: 77, academy: 5 },
  { id: "brondby", name: "Brøndbyernes Idrætsforening", shortName: "Brøndby IF", abbr: "BIF", city: "Brøndby", countryId: "dinamarca", leagueId: "danish-superliga", primary: "#f2b705", secondary: "#274b9f", reputation: 3, strength: 74, academy: 5 },
  { id: "nordsjaelland", name: "Football Club Nordsjælland", shortName: "FC Nordsjælland", abbr: "FCN", city: "Farum", countryId: "dinamarca", leagueId: "danish-superliga", primary: "#d71920", secondary: "#f2b705", reputation: 3, strength: 72, academy: 5 },
  { id: "agf", name: "Aarhus Gymnastikforening", shortName: "AGF", abbr: "AGF", city: "Aarhus", countryId: "dinamarca", leagueId: "danish-superliga", primary: "#ffffff", secondary: "#111111", reputation: 3, strength: 71, academy: 4 },
  { id: "randers", name: "Randers Football Club", shortName: "Randers FC", abbr: "RFC", city: "Randers", countryId: "dinamarca", leagueId: "danish-superliga", primary: "#4a9fd6", secondary: "#ffffff", reputation: 2, strength: 67, academy: 4 },
  { id: "silkeborg", name: "Silkeborg Idrætsforening", shortName: "Silkeborg IF", abbr: "SIL", city: "Silkeborg", countryId: "dinamarca", leagueId: "danish-superliga", primary: "#d71920", secondary: "#ffffff", reputation: 2, strength: 67, academy: 4 },
  { id: "viborg", name: "Viborg Fodsports Forening", shortName: "Viborg FF", abbr: "VFF", city: "Viborg", countryId: "dinamarca", leagueId: "danish-superliga", primary: "#08783e", secondary: "#ffffff", reputation: 2, strength: 66, academy: 4 },
  { id: "ob-odense", name: "Odense Boldklub", shortName: "OB", abbr: "OB", city: "Odense", countryId: "dinamarca", leagueId: "danish-superliga", primary: "#274b9f", secondary: "#ffffff", reputation: 2, strength: 65, academy: 4 },
  { id: "sonderjyske", name: "Sønderjyske Fodbold", shortName: "Sønderjyske", abbr: "SON", city: "Haderslev", countryId: "dinamarca", leagueId: "danish-superliga", primary: "#4a9fd6", secondary: "#ffffff", reputation: 1, strength: 62, academy: 3 },
  { id: "vejle", name: "Vejle Boldklub", shortName: "Vejle BK", abbr: "VEJ", city: "Vejle", countryId: "dinamarca", leagueId: "danish-superliga", primary: "#d71920", secondary: "#ffffff", reputation: 2, strength: 62, academy: 4 },
  { id: "fredericia", name: "Fodbold Club Fredericia", shortName: "FC Fredericia", abbr: "FRE", city: "Fredericia", countryId: "dinamarca", leagueId: "danish-superliga", primary: "#d71920", secondary: "#111111", reputation: 1, strength: 59, academy: 3 },
];

// Expansão Norte/Leste Europeu — Norway
const NORWAY_CLUBS: Club[] = [
  { id: "bodo-glimt", name: "Fotballklubben Bodø/Glimt", shortName: "Bodø/Glimt", abbr: "BOD", city: "Bodø", countryId: "noruega", leagueId: "eliteserien", primary: "#f2b705", secondary: "#111111", reputation: 4, strength: 79, academy: 5 },
  { id: "viking", name: "Viking Fotballklubb", shortName: "Viking FK", abbr: "VIK", city: "Stavanger", countryId: "noruega", leagueId: "eliteserien", primary: "#274b9f", secondary: "#ffffff", reputation: 3, strength: 75, academy: 4 },
  { id: "brann", name: "Sportsklubben Brann", shortName: "SK Brann", abbr: "BRA", city: "Bergen", countryId: "noruega", leagueId: "eliteserien", primary: "#d71920", secondary: "#ffffff", reputation: 3, strength: 74, academy: 4 },
  { id: "molde", name: "Molde Fotballklubb", shortName: "Molde FK", abbr: "MOL", city: "Molde", countryId: "noruega", leagueId: "eliteserien", primary: "#4a9fd6", secondary: "#ffffff", reputation: 4, strength: 74, academy: 5 },
  { id: "rosenborg", name: "Rosenborg Ballklub", shortName: "Rosenborg BK", abbr: "RBK", city: "Trondheim", countryId: "noruega", leagueId: "eliteserien", primary: "#111111", secondary: "#ffffff", reputation: 4, strength: 72, academy: 5 },
  { id: "tromso", name: "Tromsø Idrettslag", shortName: "Tromsø IL", abbr: "TRO", city: "Tromsø", countryId: "noruega", leagueId: "eliteserien", primary: "#d71920", secondary: "#ffffff", reputation: 2, strength: 69, academy: 4 },
  { id: "valerenga", name: "Vålerenga Fotball", shortName: "Vålerenga", abbr: "VIF", city: "Oslo", countryId: "noruega", leagueId: "eliteserien", primary: "#274b9f", secondary: "#d71920", reputation: 3, strength: 68, academy: 5 },
  { id: "fredrikstad", name: "Fredrikstad Fotballklubb", shortName: "Fredrikstad FK", abbr: "FFK", city: "Fredrikstad", countryId: "noruega", leagueId: "eliteserien", primary: "#d71920", secondary: "#ffffff", reputation: 2, strength: 68, academy: 4 },
  { id: "lillestrom", name: "Lillestrøm Sportsklubb", shortName: "Lillestrøm SK", abbr: "LSK", city: "Lillestrøm", countryId: "noruega", leagueId: "eliteserien", primary: "#f2b705", secondary: "#111111", reputation: 3, strength: 67, academy: 4 },
  { id: "sarpsborg-08", name: "Sarpsborg 08 Fotballforening", shortName: "Sarpsborg 08", abbr: "S08", city: "Sarpsborg", countryId: "noruega", leagueId: "eliteserien", primary: "#274b9f", secondary: "#ffffff", reputation: 2, strength: 66, academy: 3 },
  { id: "hamkam", name: "Hamarkameratene", shortName: "HamKam", abbr: "HAM", city: "Hamar", countryId: "noruega", leagueId: "eliteserien", primary: "#08783e", secondary: "#ffffff", reputation: 2, strength: 64, academy: 4 },
  { id: "kfum-oslo", name: "KFUM-Kameratene Oslo", shortName: "KFUM Oslo", abbr: "KFU", city: "Oslo", countryId: "noruega", leagueId: "eliteserien", primary: "#d71920", secondary: "#ffffff", reputation: 1, strength: 64, academy: 4 },
  { id: "kristiansund", name: "Kristiansund Ballklubb", shortName: "Kristiansund BK", abbr: "KBK", city: "Kristiansund", countryId: "noruega", leagueId: "eliteserien", primary: "#274b9f", secondary: "#ffffff", reputation: 2, strength: 63, academy: 3 },
  { id: "sandefjord", name: "Sandefjord Fotball", shortName: "Sandefjord", abbr: "SAN", city: "Sandefjord", countryId: "noruega", leagueId: "eliteserien", primary: "#274b9f", secondary: "#d71920", reputation: 1, strength: 62, academy: 3 },
  { id: "aalesund", name: "Aalesunds Fotballklubb", shortName: "Aalesund", abbr: "AAF", city: "Ålesund", countryId: "noruega", leagueId: "eliteserien", primary: "#f58220", secondary: "#274b9f", reputation: 2, strength: 61, academy: 4 },
  { id: "start", name: "Idrettsklubben Start", shortName: "IK Start", abbr: "STA", city: "Kristiansand", countryId: "noruega", leagueId: "eliteserien", primary: "#f2b705", secondary: "#111111", reputation: 2, strength: 60, academy: 4 },
];

// Expansão Norte/Leste Europeu — Sweden
const SWEDEN_CLUBS: Club[] = [
  { id: "malmo", name: "Malmö Fotbollförening", shortName: "Malmö FF", abbr: "MFF", city: "Malmö", countryId: "suecia", leagueId: "allsvenskan", primary: "#4a9fd6", secondary: "#ffffff", reputation: 4, strength: 78, academy: 5 },
  { id: "hammarby", name: "Hammarby Idrottsförening Fotbollförening", shortName: "Hammarby IF", abbr: "HAM", city: "Estocolmo", countryId: "suecia", leagueId: "allsvenskan", primary: "#08783e", secondary: "#ffffff", reputation: 3, strength: 73, academy: 5 },
  { id: "djurgarden", name: "Djurgårdens Idrottsförening Fotbollförening", shortName: "Djurgårdens IF", abbr: "DIF", city: "Estocolmo", countryId: "suecia", leagueId: "allsvenskan", primary: "#274b9f", secondary: "#d71920", reputation: 3, strength: 72, academy: 5 },
  { id: "aik", name: "Allmänna Idrottsklubben Fotboll", shortName: "AIK", abbr: "AIK", city: "Solna", countryId: "suecia", leagueId: "allsvenskan", primary: "#111111", secondary: "#f2b705", reputation: 4, strength: 72, academy: 5 },
  { id: "mjallby", name: "Mjällby Allmänna Idrottsförening", shortName: "Mjällby AIF", abbr: "MAIF", city: "Hällevik", countryId: "suecia", leagueId: "allsvenskan", primary: "#f2b705", secondary: "#111111", reputation: 2, strength: 71, academy: 4 },
  { id: "elfsborg", name: "Idrottsföreningen Elfsborg", shortName: "IF Elfsborg", abbr: "IFE", city: "Borås", countryId: "suecia", leagueId: "allsvenskan", primary: "#f2b705", secondary: "#111111", reputation: 3, strength: 70, academy: 5 },
  { id: "hacken", name: "Bollklubben Häcken", shortName: "BK Häcken", abbr: "BKH", city: "Gothenburg", countryId: "suecia", leagueId: "allsvenskan", primary: "#f2b705", secondary: "#111111", reputation: 3, strength: 70, academy: 5 },
  { id: "ifk-goteborg", name: "Idrottsföreningen Kamraterna Göteborg", shortName: "IFK Göteborg", abbr: "IFK", city: "Gothenburg", countryId: "suecia", leagueId: "allsvenskan", primary: "#274b9f", secondary: "#ffffff", reputation: 4, strength: 69, academy: 5 },
  { id: "gais", name: "Göteborgs Atlet- och Idrottssällskap", shortName: "GAIS", abbr: "GAI", city: "Gothenburg", countryId: "suecia", leagueId: "allsvenskan", primary: "#08783e", secondary: "#111111", reputation: 2, strength: 67, academy: 4 },
  { id: "sirius", name: "Idrottsklubben Sirius Fotboll", shortName: "IK Sirius", abbr: "SIR", city: "Uppsala", countryId: "suecia", leagueId: "allsvenskan", primary: "#274b9f", secondary: "#111111", reputation: 2, strength: 65, academy: 4 },
  { id: "halmstad", name: "Halmstads Bollklubb", shortName: "Halmstads BK", abbr: "HBK", city: "Halmstad", countryId: "suecia", leagueId: "allsvenskan", primary: "#274b9f", secondary: "#ffffff", reputation: 2, strength: 64, academy: 4 },
  { id: "brommapojkarna", name: "Idrottsföreningen Brommapojkarna", shortName: "IF Brommapojkarna", abbr: "BP", city: "Estocolmo", countryId: "suecia", leagueId: "allsvenskan", primary: "#d71920", secondary: "#111111", reputation: 2, strength: 64, academy: 5 },
  { id: "kalmar", name: "Kalmar Fotbollförening", shortName: "Kalmar FF", abbr: "KFF", city: "Kalmar", countryId: "suecia", leagueId: "allsvenskan", primary: "#d71920", secondary: "#ffffff", reputation: 2, strength: 63, academy: 4 },
  { id: "degerfors", name: "Degerfors Idrottsförening", shortName: "Degerfors IF", abbr: "DEG", city: "Degerfors", countryId: "suecia", leagueId: "allsvenskan", primary: "#d71920", secondary: "#ffffff", reputation: 2, strength: 62, academy: 4 },
  { id: "vasteras", name: "Västerås Sportklubb Fotboll", shortName: "Västerås SK", abbr: "VSK", city: "Västerås", countryId: "suecia", leagueId: "allsvenskan", primary: "#08783e", secondary: "#ffffff", reputation: 1, strength: 61, academy: 4 },
  { id: "orgryte", name: "Örgryte Idrottssällskap", shortName: "Örgryte IS", abbr: "OIS", city: "Gothenburg", countryId: "suecia", leagueId: "allsvenskan", primary: "#d71920", secondary: "#274b9f", reputation: 2, strength: 60, academy: 4 },
];

// Expansão Norte/Leste Europeu — Poland
const POLAND_CLUBS: Club[] = [
  { id: "lech-poznan", name: "Kolejowy Klub Sportowy Lech Poznań", shortName: "Lech Poznań", abbr: "LPO", city: "Poznań", countryId: "polonia", leagueId: "ekstraklasa", primary: "#274b9f", secondary: "#ffffff", reputation: 4, strength: 77, academy: 5 },
  { id: "legia-warsaw", name: "Legia Warszawa", shortName: "Legia Varsóvia", abbr: "LEG", city: "Varsóvia", countryId: "polonia", leagueId: "ekstraklasa", primary: "#08783e", secondary: "#ffffff", reputation: 5, strength: 76, academy: 5 },
  { id: "jagiellonia", name: "Jagiellonia Białystok", shortName: "Jagiellonia", abbr: "JAG", city: "Białystok", countryId: "polonia", leagueId: "ekstraklasa", primary: "#f2b705", secondary: "#d71920", reputation: 4, strength: 74, academy: 5 },
  { id: "rakow", name: "Raków Częstochowa", shortName: "Raków", abbr: "RAK", city: "Częstochowa", countryId: "polonia", leagueId: "ekstraklasa", primary: "#d71920", secondary: "#274b9f", reputation: 4, strength: 74, academy: 5 },
  { id: "gornik-zabrze", name: "Górnik Zabrze", shortName: "Górnik Zabrze", abbr: "GOR", city: "Zabrze", countryId: "polonia", leagueId: "ekstraklasa", primary: "#d71920", secondary: "#274b9f", reputation: 4, strength: 71, academy: 5 },
  { id: "pogon-szczecin", name: "Pogoń Szczecin", shortName: "Pogoń Szczecin", abbr: "POG", city: "Szczecin", countryId: "polonia", leagueId: "ekstraklasa", primary: "#274b9f", secondary: "#8c1b3f", reputation: 3, strength: 70, academy: 4 },
  { id: "cracovia", name: "Miejski Klub Sportowy Cracovia", shortName: "Cracovia", abbr: "CRA", city: "Cracóvia", countryId: "polonia", leagueId: "ekstraklasa", primary: "#d71920", secondary: "#ffffff", reputation: 3, strength: 69, academy: 5 },
  { id: "widzew-lodz", name: "Widzew Łódź", shortName: "Widzew Łódź", abbr: "WID", city: "Łódź", countryId: "polonia", leagueId: "ekstraklasa", primary: "#d71920", secondary: "#ffffff", reputation: 4, strength: 69, academy: 5 },
  { id: "piast-gliwice", name: "Gliwicki Klub Sportowy Piast Gliwice", shortName: "Piast Gliwice", abbr: "PIA", city: "Gliwice", countryId: "polonia", leagueId: "ekstraklasa", primary: "#274b9f", secondary: "#d71920", reputation: 3, strength: 68, academy: 4 },
  { id: "gks-katowice", name: "GKS Katowice", shortName: "GKS Katowice", abbr: "GKS", city: "Katowice", countryId: "polonia", leagueId: "ekstraklasa", primary: "#f2b705", secondary: "#08783e", reputation: 3, strength: 67, academy: 4 },
  { id: "motor-lublin", name: "Motor Lublin", shortName: "Motor Lublin", abbr: "MOT", city: "Lublin", countryId: "polonia", leagueId: "ekstraklasa", primary: "#f2b705", secondary: "#ffffff", reputation: 2, strength: 67, academy: 4 },
  { id: "lechia-gdansk", name: "Klub Sportowy Lechia Gdańsk", shortName: "Lechia Gdańsk", abbr: "LGD", city: "Gdańsk", countryId: "polonia", leagueId: "ekstraklasa", primary: "#08783e", secondary: "#ffffff", reputation: 3, strength: 66, academy: 5 },
  { id: "korona-kielce", name: "Korona Kielce", shortName: "Korona Kielce", abbr: "KOR", city: "Kielce", countryId: "polonia", leagueId: "ekstraklasa", primary: "#f2b705", secondary: "#d71920", reputation: 2, strength: 66, academy: 4 },
  { id: "radomiak-radom", name: "Radomiak Radom", shortName: "Radomiak Radom", abbr: "RAD", city: "Radom", countryId: "polonia", leagueId: "ekstraklasa", primary: "#08783e", secondary: "#ffffff", reputation: 2, strength: 65, academy: 4 },
  { id: "zaglebie-lubin", name: "Zagłębie Lubin", shortName: "Zagłębie Lubin", abbr: "ZAG", city: "Lubin", countryId: "polonia", leagueId: "ekstraklasa", primary: "#f58220", secondary: "#ffffff", reputation: 3, strength: 65, academy: 5 },
  { id: "wisla-plock", name: "Wisła Płock", shortName: "Wisła Płock", abbr: "WPL", city: "Płock", countryId: "polonia", leagueId: "ekstraklasa", primary: "#274b9f", secondary: "#ffffff", reputation: 2, strength: 63, academy: 4 },
  { id: "arka-gdynia", name: "Arka Gdynia", shortName: "Arka Gdynia", abbr: "ARK", city: "Gdynia", countryId: "polonia", leagueId: "ekstraklasa", primary: "#f2b705", secondary: "#274b9f", reputation: 3, strength: 62, academy: 4 },
  { id: "bruk-bet-termalica", name: "Bruk-Bet Termalica Nieciecza", shortName: "Bruk-Bet Termalica", abbr: "BBT", city: "Nieciecza", countryId: "polonia", leagueId: "ekstraklasa", primary: "#f58220", secondary: "#274b9f", reputation: 1, strength: 60, academy: 3 },
];

// Expansão Norte/Leste Europeu — Croatia
const CROATIA_CLUBS: Club[] = [
  { id: "dinamo-zagreb", name: "Građanski Nogometni Klub Dinamo Zagreb", shortName: "Dinamo Zagreb", abbr: "DIN", city: "Zagreb", countryId: "croacia", leagueId: "hnl", primary: "#274b9f", secondary: "#ffffff", reputation: 5, strength: 79, academy: 5 },
  { id: "hajduk-split", name: "Hrvatski Nogometni Klub Hajduk Split", shortName: "Hajduk Split", abbr: "HAJ", city: "Split", countryId: "croacia", leagueId: "hnl", primary: "#ffffff", secondary: "#274b9f", reputation: 5, strength: 76, academy: 5 },
  { id: "rijeka", name: "Hrvatski Nogometni Klub Rijeka", shortName: "HNK Rijeka", abbr: "RIJ", city: "Rijeka", countryId: "croacia", leagueId: "hnl", primary: "#4a9fd6", secondary: "#ffffff", reputation: 4, strength: 75, academy: 5 },
  { id: "osijek", name: "Nogometni Klub Osijek", shortName: "NK Osijek", abbr: "OSI", city: "Osijek", countryId: "croacia", leagueId: "hnl", primary: "#274b9f", secondary: "#ffffff", reputation: 3, strength: 70, academy: 5 },
  { id: "varazdin", name: "Nogometni Klub Varaždin", shortName: "Varaždin", abbr: "VAR", city: "Varaždin", countryId: "croacia", leagueId: "hnl", primary: "#274b9f", secondary: "#ffffff", reputation: 2, strength: 67, academy: 4 },
  { id: "istra-1961", name: "Nogometni Klub Istra 1961", shortName: "Istra 1961", abbr: "IST", city: "Pula", countryId: "croacia", leagueId: "hnl", primary: "#08783e", secondary: "#f2b705", reputation: 2, strength: 65, academy: 4 },
  { id: "lokomotiva-zagreb", name: "Nogometni Klub Lokomotiva Zagreb", shortName: "Lokomotiva", abbr: "LOK", city: "Zagreb", countryId: "croacia", leagueId: "hnl", primary: "#274b9f", secondary: "#ffffff", reputation: 2, strength: 65, academy: 5 },
  { id: "slaven-belupo", name: "Nogometni Klub Slaven Belupo", shortName: "Slaven Belupo", abbr: "SLA", city: "Koprivnica", countryId: "croacia", leagueId: "hnl", primary: "#274b9f", secondary: "#d71920", reputation: 2, strength: 63, academy: 4 },
  { id: "gorica-cro", name: "Hrvatski Nogometni Klub Gorica", shortName: "HNK Gorica", abbr: "GOR", city: "Velika Gorica", countryId: "croacia", leagueId: "hnl", primary: "#d71920", secondary: "#111111", reputation: 2, strength: 62, academy: 4 },
  { id: "vukovar-1991", name: "Hrvatski Nogometni Klub Vukovar 1991", shortName: "Vukovar 1991", abbr: "VUK", city: "Vukovar", countryId: "croacia", leagueId: "hnl", primary: "#274b9f", secondary: "#ffffff", reputation: 1, strength: 58, academy: 3 },
];

// Expansão Norte/Leste Europeu — Serbia
const SERBIA_CLUBS: Club[] = [
  { id: "red-star-belgrade", name: "Fudbalski Klub Crvena zvezda", shortName: "Estrela Vermelha", abbr: "CZV", city: "Belgrado", countryId: "servia", leagueId: "serbian-superliga", primary: "#d71920", secondary: "#ffffff", reputation: 5, strength: 80, academy: 5 },
  { id: "partizan", name: "Fudbalski Klub Partizan", shortName: "Partizan", abbr: "PAR", city: "Belgrado", countryId: "servia", leagueId: "serbian-superliga", primary: "#111111", secondary: "#ffffff", reputation: 5, strength: 76, academy: 5 },
  { id: "tsc-backa-topola", name: "Fudbalski Klub TSC", shortName: "TSC Bačka Topola", abbr: "TSC", city: "Bačka Topola", countryId: "servia", leagueId: "serbian-superliga", primary: "#274b9f", secondary: "#ffffff", reputation: 3, strength: 71, academy: 5 },
  { id: "vojvodina", name: "Fudbalski Klub Vojvodina", shortName: "Vojvodina", abbr: "VOJ", city: "Novi Sad", countryId: "servia", leagueId: "serbian-superliga", primary: "#d71920", secondary: "#ffffff", reputation: 4, strength: 70, academy: 5 },
  { id: "cukaricki", name: "Fudbalski Klub Čukarički", shortName: "Čukarički", abbr: "CUK", city: "Belgrado", countryId: "servia", leagueId: "serbian-superliga", primary: "#111111", secondary: "#ffffff", reputation: 3, strength: 69, academy: 5 },
  { id: "radnicki-1923", name: "Fudbalski Klub Radnički 1923", shortName: "Radnički 1923", abbr: "R23", city: "Kragujevac", countryId: "servia", leagueId: "serbian-superliga", primary: "#d71920", secondary: "#ffffff", reputation: 3, strength: 68, academy: 4 },
  { id: "novi-pazar", name: "Fudbalski Klub Novi Pazar", shortName: "Novi Pazar", abbr: "NPA", city: "Novi Pazar", countryId: "servia", leagueId: "serbian-superliga", primary: "#274b9f", secondary: "#ffffff", reputation: 3, strength: 67, academy: 4 },
  { id: "ofk-beograd", name: "Omladinski Fudbalski Klub Beograd", shortName: "OFK Beograd", abbr: "OFK", city: "Belgrado", countryId: "servia", leagueId: "serbian-superliga", primary: "#4a9fd6", secondary: "#ffffff", reputation: 3, strength: 66, academy: 5 },
  { id: "mladost-lucani", name: "Fudbalski Klub Mladost Lučani", shortName: "Mladost Lučani", abbr: "MLA", city: "Lučani", countryId: "servia", leagueId: "serbian-superliga", primary: "#274b9f", secondary: "#ffffff", reputation: 2, strength: 65, academy: 4 },
  { id: "radnicki-nis", name: "Fudbalski Klub Radnički Niš", shortName: "Radnički Niš", abbr: "RNI", city: "Niš", countryId: "servia", leagueId: "serbian-superliga", primary: "#d71920", secondary: "#ffffff", reputation: 3, strength: 65, academy: 4 },
  { id: "zeleznicar-pancevo", name: "Fudbalski Klub Železničar Pančevo", shortName: "Železničar", abbr: "ZEL", city: "Pančevo", countryId: "servia", leagueId: "serbian-superliga", primary: "#274b9f", secondary: "#d71920", reputation: 2, strength: 64, academy: 4 },
  { id: "spartak-subotica", name: "Fudbalski Klub Spartak Subotica", shortName: "Spartak Subotica", abbr: "SPS", city: "Subotica", countryId: "servia", leagueId: "serbian-superliga", primary: "#274b9f", secondary: "#ffffff", reputation: 2, strength: 63, academy: 4 },
  { id: "napredak", name: "Fudbalski Klub Napredak Kruševac", shortName: "Napredak", abbr: "NAP", city: "Kruševac", countryId: "servia", leagueId: "serbian-superliga", primary: "#d71920", secondary: "#ffffff", reputation: 2, strength: 62, academy: 4 },
  { id: "javor", name: "Fudbalski Klub Javor Ivanjica", shortName: "Javor-Matis", abbr: "JAV", city: "Ivanjica", countryId: "servia", leagueId: "serbian-superliga", primary: "#d71920", secondary: "#111111", reputation: 2, strength: 61, academy: 3 },
  { id: "radnik-surdulica", name: "Fudbalski Klub Radnik Surdulica", shortName: "Radnik Surdulica", abbr: "RAD", city: "Surdulica", countryId: "servia", leagueId: "serbian-superliga", primary: "#274b9f", secondary: "#ffffff", reputation: 1, strength: 60, academy: 3 },
  { id: "imt-belgrade", name: "Fudbalski Klub IMT", shortName: "IMT", abbr: "IMT", city: "Belgrado", countryId: "servia", leagueId: "serbian-superliga", primary: "#d71920", secondary: "#ffffff", reputation: 1, strength: 59, academy: 4 },
];

${clubAnchor}`,
    "club arrays insertion",
  );
}

if (!gameData.includes("  ...DENMARK_CLUBS,")) {
  const spreadAnchor = "  ...CZECH_CLUBS,\n];";
  gameData = replaceOnce(
    gameData,
    spreadAnchor,
    `  ...DENMARK_CLUBS,
  ...NORWAY_CLUBS,
  ...SWEDEN_CLUBS,
  ...POLAND_CLUBS,
  ...CROATIA_CLUBS,
  ...SERBIA_CLUBS,
${spreadAnchor}`,
    "club spreads insertion",
  );
}

await writeFile(gameDataPath, gameData, "utf8");

let sync = await readFile(syncPath, "utf8");

if (!sync.includes('"danish-superliga": "Danish Superliga"')) {
  sync = replaceOnce(
    sync,
    '  "premiership-sco": "Scottish Premier League",',
    `  "premiership-sco": "Scottish Premier League",
  "danish-superliga": "Danish Superliga",
  eliteserien: "Norwegian Eliteserien",
  allsvenskan: "Swedish Allsvenskan",
  ekstraklasa: "Polish Ekstraklasa",
  hnl: "Croatian HNL",
  "serbian-superliga": "Serbian SuperLiga",`,
    "TheSportsDB league map",
  );
}

if (!sync.includes('noruega: ["norway"]')) {
  sync = replaceOnce(
    sync,
    '  dinamarca: ["denmark"],',
    `  dinamarca: ["denmark"],
  noruega: ["norway"],
  suecia: ["sweden"],
  polonia: ["poland"],
  croacia: ["croatia"],
  servia: ["serbia"],`,
    "country aliases",
  );
}

if (!sync.includes('"danish-superliga": "den.1"')) {
  sync = replaceOnce(
    sync,
    '  "chance-liga": "cze.1",',
    `  "chance-liga": "cze.1",
  "danish-superliga": "den.1",
  eliteserien: "nor.1",
  allsvenskan: "swe.1",
  ekstraklasa: "pol.1",
  hnl: "cro.1",
  "serbian-superliga": "srb.1",`,
    "ESPN league map",
  );
}

await writeFile(syncPath, sync, "utf8");

console.log("Northern Europe expansion applied.");
console.log("Added 6 leagues and 88 clubs.");
