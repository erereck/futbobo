import type { Club } from "./game-data";

// Elencos da primeira divisão na temporada 2026/27.
// As forças e reputações são valores de balanceamento do Futbobo, não avaliações oficiais.
// A cidade representa a origem do clube; times ucranianos podem jogar em sedes alternativas.
type ClubSeed = readonly [
  id: string, name: string, shortName: string, abbr: string, city: string,
  primary: string, secondary: string, reputation: number, strength: number, academy: number,
];

function clubsFor(countryId: string, leagueId: string, seeds: readonly ClubSeed[]): Club[] {
  return seeds.map(([id, name, shortName, abbr, city, primary, secondary, reputation, strength, academy]) => ({
    id, name, shortName, abbr, city, countryId, leagueId, primary, secondary, reputation, strength, academy,
  }));
}

export const RUSSIA_UKRAINE_CLUBS: Club[] = [
  ...clubsFor("russia", "russian-premier-league", [
    ["zenit-spb", "FC Zenit Saint Petersburg", "Zenit", "ZEN", "São Petersburgo", "#00a3e0", "#ffffff", 5, 83, 5],
    ["krasnodar-ru", "FC Krasnodar", "Krasnodar", "KRA", "Krasnodar", "#168f5a", "#111111", 4, 79, 4],
    ["spartak-moscow", "FC Spartak Moscow", "Spartak Moscou", "SPA", "Moscou", "#cf102d", "#ffffff", 5, 80, 5],
    ["cska-moscow", "PFC CSKA Moscow", "CSKA Moscou", "CSK", "Moscou", "#d71920", "#234b9b", 5, 79, 5],
    ["dynamo-moscow", "FC Dynamo Moscow", "Dínamo Moscou", "DMO", "Moscou", "#1e60b8", "#ffffff", 4, 76, 4],
    ["lokomotiv-moscow", "FC Lokomotiv Moscow", "Lokomotiv Moscou", "LOK", "Moscou", "#168f5a", "#d71920", 4, 74, 4],
    ["baltika-kaliningrad", "FC Baltika Kaliningrad", "Baltika", "BAL", "Kaliningrado", "#235aa6", "#ffffff", 2, 68, 3],
    ["rubin-kazan", "FC Rubin Kazan", "Rubin Kazan", "RUB", "Kazan", "#99223d", "#ffffff", 3, 69, 3],
    ["rodina-moscow", "FC Rodina Moscow", "Rodina", "ROD", "Moscou", "#172d57", "#ffffff", 1, 64, 2],
    ["akhmat-grozny", "FC Akhmat Grozny", "Akhmat", "AKH", "Grozny", "#168f5a", "#ffffff", 2, 66, 3],
    ["rostov-ru", "FC Rostov", "Rostov", "ROS", "Rostov-no-Don", "#e6ba26", "#235aa6", 3, 67, 3],
    ["krylya-sovetov", "PFC Krylia Sovetov Samara", "Krylya Sovetov", "KRS", "Samara", "#247ac0", "#ffffff", 2, 65, 3],
    ["akron-tolyatti", "FC Akron Tolyatti", "Akron", "AKR", "Tolyatti", "#d71920", "#111111", 1, 63, 2],
    ["orenburg-ru", "FC Orenburg", "Orenburg", "ORE", "Orenburg", "#1b71bf", "#ffffff", 1, 64, 2],
    ["dynamo-makhachkala", "FC Dynamo Makhachkala", "Dínamo Makhachkala", "DMA", "Makhachkala", "#1c75bc", "#ffffff", 1, 62, 2],
    ["fakel-voronezh", "FC Fakel Voronezh", "Fakel", "FAK", "Voronezh", "#17488f", "#ffffff", 1, 62, 2],
  ]),
  ...clubsFor("ucrania", "ukrainian-premier-league", [
    ["shakhtar-donetsk", "FC Shakhtar Donetsk", "Shakhtar Donetsk", "SHA", "Donetsk", "#ef711d", "#111111", 5, 80, 5],
    ["polissya-zhytomyr", "FC Polissya Zhytomyr", "Polissya", "POL", "Zhytomyr", "#167f46", "#ffffff", 3, 72, 3],
    ["dynamo-kyiv", "FC Dynamo Kyiv", "Dínamo Kyiv", "DKY", "Kyiv", "#1c64ad", "#ffffff", 5, 78, 5],
    ["kharkiv-ua", "FC Kharkiv", "Kharkiv", "KHA", "Kharkiv", "#f2b705", "#235aa6", 3, 70, 4],
    ["karpaty-lviv", "FC Karpaty Lviv", "Karpaty Lviv", "KAR", "Lviv", "#14884a", "#ffffff", 3, 70, 4],
    ["lnz-cherkasy", "FC LNZ Cherkasy", "LNZ Cherkasy", "LNZ", "Cherkasy", "#7a2b91", "#ffffff", 3, 70, 3],
    ["zorya-luhansk", "FC Zorya Luhansk", "Zorya Luhansk", "ZOR", "Luhansk", "#111111", "#ffffff", 3, 69, 4],
    ["bukovyna-chernivtsi", "FC Bukovyna Chernivtsi", "Bukovyna", "BUK", "Chernivtsi", "#f4cb29", "#111111", 2, 65, 3],
    ["kolos-kovalivka", "FC Kolos Kovalivka", "Kolos", "KOL", "Kovalivka", "#ffffff", "#111111", 2, 68, 3],
    ["epicentr-kamianets", "FC Epicentr", "Epicentr", "EPI", "Kamianets-Podilskyi", "#2463b7", "#ffffff", 1, 64, 2],
    ["chornomorets-odesa", "FC Chornomorets Odesa", "Chornomorets", "CHO", "Odesa", "#2052ab", "#111111", 3, 66, 3],
    ["livyi-bereh-kyiv", "FC Livyi Bereh Kyiv", "Livyi Bereh", "LBE", "Kyiv", "#f2bc23", "#178044", 1, 63, 2],
    ["veres-rivne", "NK Veres Rivne", "Veres Rivne", "VER", "Rivne", "#d71920", "#111111", 2, 64, 3],
    ["obolon-kyiv", "FC Obolon Kyiv", "Obolon", "OBO", "Kyiv", "#248351", "#ffffff", 2, 64, 3],
    ["kudrivka", "FC Kudrivka", "Kudrivka", "KUD", "Kudrivka", "#1d55a0", "#ffffff", 1, 62, 2],
    ["kryvbas-kryvyi-rih", "FC Kryvbas Kryvyi Rih", "Kryvbas", "KRY", "Kryvyi Rih", "#d71920", "#ffffff", 3, 68, 3],
  ]),
];
