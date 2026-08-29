import { CLUBS, LEAGUES } from "../game-data";
import type { Club, League } from "../game-data";

type ClubSeed = readonly [
  id: string,
  name: string,
  shortName: string,
  abbr: string,
  city: string,
  primary: string,
  secondary: string,
  reputation: number,
  strength: number,
  academy?: number,
];

function clubsFor(countryId: string, leagueId: string, seeds: readonly ClubSeed[]): Club[] {
  return seeds.map(([id, name, shortName, abbr, city, primary, secondary, reputation, strength, academy]) => ({
    id,
    name,
    shortName,
    abbr,
    city,
    countryId,
    leagueId,
    primary,
    secondary,
    reputation,
    strength,
    academy,
  }));
}

export const EXTRA_SECOND_DIVISION_LEAGUES: League[] = [
  { id: "segunda-division", countryId: "espanha", name: "Segunda División", cupName: "Copa del Rey", prestige: 2, championsPlaces: 0, europaPlaces: 0, conferencePlaces: 0 },
  { id: "serie-b-italia", countryId: "italia", name: "Serie B", cupName: "Coppa Italia", prestige: 2, championsPlaces: 0, europaPlaces: 0, conferencePlaces: 0 },
  { id: "2-bundesliga", countryId: "alemanha", name: "2. Bundesliga", cupName: "DFB-Pokal", prestige: 2, championsPlaces: 0, europaPlaces: 0, conferencePlaces: 0 },
  { id: "ligue-2", countryId: "franca", name: "Ligue 2", cupName: "Coupe de France", prestige: 2, championsPlaces: 0, europaPlaces: 0, conferencePlaces: 0 },
  { id: "liga-portugal-2", countryId: "portugal", name: "Liga Portugal 2", cupName: "Taça de Portugal", prestige: 2, championsPlaces: 0, europaPlaces: 0, conferencePlaces: 0 },
];

const SPAIN_SECOND_DIVISION = clubsFor("espanha", "segunda-division", [
  ["real-valladolid", "Real Valladolid", "Valladolid", "VLL", "Valladolid", "#6f2c91", "#ffffff", 3, 72, 72],
  ["granada", "Granada CF", "Granada", "GRA", "Granada", "#c8102e", "#ffffff", 3, 71, 71],
  ["almeria", "UD Almería", "Almería", "ALM", "Almería", "#d71920", "#ffffff", 3, 72, 72],
  ["cadiz", "Cádiz CF", "Cádiz", "CAD", "Cádiz", "#f6d32d", "#0046ad", 3, 70, 69],
  ["las-palmas", "UD Las Palmas", "Las Palmas", "LPA", "Las Palmas", "#f4d03f", "#00529f", 3, 73, 73],
  ["eibar", "SD Eibar", "Eibar", "EIB", "Eibar", "#234b9b", "#b5242a", 3, 72, 71],
  ["sporting-gijon", "Sporting de Gijón", "Sporting Gijón", "SGI", "Gijón", "#d71920", "#ffffff", 3, 71, 72],
  ["real-zaragoza", "Real Zaragoza", "Zaragoza", "ZAR", "Zaragoza", "#ffffff", "#1f4e99", 3, 71, 72],
  ["huesca", "SD Huesca", "Huesca", "HUE", "Huesca", "#1f4e99", "#c8102e", 2, 68, 68],
  ["albacete", "Albacete Balompié", "Albacete", "ALB", "Albacete", "#ffffff", "#111111", 2, 68, 69],
  ["burgos", "Burgos CF", "Burgos", "BUR", "Burgos", "#111111", "#ffffff", 2, 68, 68],
  ["mirandes", "CD Mirandés", "Mirandés", "MIR", "Miranda de Ebro", "#d71920", "#111111", 2, 69, 71],
  ["cordoba", "Córdoba CF", "Córdoba", "COR", "Córdoba", "#ffffff", "#168c5b", 2, 67, 68],
  ["castellon", "CD Castellón", "Castellón", "CAS", "Castellón", "#111111", "#ffffff", 2, 67, 67],
  ["cultural-leonesa", "Cultural Leonesa", "Cultural", "CUL", "León", "#ffffff", "#d71920", 2, 65, 67],
  ["fc-andorra", "FC Andorra", "Andorra", "AND", "Andorra la Vella", "#234b9b", "#f2b705", 2, 66, 68],
  ["leganes", "CD Leganés", "Leganés", "LEG", "Leganés", "#ffffff", "#234b9b", 3, 70, 69],
  ["tenerife", "CD Tenerife", "Tenerife", "TEN", "Santa Cruz de Tenerife", "#ffffff", "#234b9b", 3, 68, 69],
  ["real-oviedo", "Real Oviedo", "Oviedo", "OVI", "Oviedo", "#164194", "#ffffff", 3, 72, 73],
  ["ceuta", "AD Ceuta", "Ceuta", "CEU", "Ceuta", "#ffffff", "#d71920", 1, 64, 65],
  ["eldense", "CD Eldense", "Eldense", "ELD", "Elda", "#d71920", "#234b9b", 1, 65, 65],
  ["cartagena", "FC Cartagena", "Cartagena", "CAR", "Cartagena", "#111111", "#ffffff", 2, 65, 66],
]);

const ITALY_SECOND_DIVISION = clubsFor("italia", "serie-b-italia", [
  ["sampdoria", "UC Sampdoria", "Sampdoria", "SAM", "Genova", "#1d5aa6", "#ffffff", 4, 72, 73],
  ["palermo", "Palermo FC", "Palermo", "PAL", "Palermo", "#f19ac2", "#111111", 4, 73, 74],
  ["bari", "SSC Bari", "Bari", "BAR", "Bari", "#ffffff", "#d71920", 3, 70, 72],
  ["spezia", "Spezia Calcio", "Spezia", "SPZ", "La Spezia", "#ffffff", "#111111", 3, 71, 70],
  ["cesena", "Cesena FC", "Cesena", "CES", "Cesena", "#111111", "#ffffff", 2, 68, 70],
  ["catanzaro", "US Catanzaro", "Catanzaro", "CAT", "Catanzaro", "#f2b705", "#d71920", 2, 70, 69],
  ["modena", "Modena FC", "Modena", "MOD", "Modena", "#f2b705", "#234b9b", 2, 68, 68],
  ["reggiana", "AC Reggiana", "Reggiana", "REG", "Reggio Emilia", "#8b1b1b", "#ffffff", 2, 67, 68],
  ["sudtirol", "FC Südtirol", "Südtirol", "SUD", "Bolzano", "#ffffff", "#d71920", 2, 67, 67],
  ["mantova", "Mantova 1911", "Mantova", "MAN", "Mantova", "#ffffff", "#d71920", 2, 67, 68],
  ["empoli", "Empoli FC", "Empoli", "EMP", "Empoli", "#1e5aa8", "#ffffff", 3, 72, 73],
  ["cremonese", "US Cremonese", "Cremonese", "CRE", "Cremona", "#d71920", "#bfc2c7", 3, 72, 71],
  ["pisa", "Pisa SC", "Pisa", "PIS", "Pisa", "#111111", "#1d5aa6", 3, 71, 72],
  ["salernitana", "US Salernitana", "Salernitana", "SAL", "Salerno", "#7c1d2d", "#ffffff", 3, 69, 68],
  ["cosenza", "Cosenza Calcio", "Cosenza", "COS", "Cosenza", "#234b9b", "#d71920", 2, 66, 67],
  ["carrarese", "Carrarese Calcio", "Carrarese", "CRR", "Carrara", "#53a8e2", "#f2b705", 1, 65, 66],
  ["juve-stabia", "SS Juve Stabia", "Juve Stabia", "JST", "Castellammare di Stabia", "#f2b705", "#234b9b", 2, 68, 69],
  ["cittadella", "AS Cittadella", "Cittadella", "CIT", "Cittadella", "#8b1b1b", "#ffffff", 2, 66, 67],
  ["pescara", "Delfino Pescara", "Pescara", "PES", "Pescara", "#55a6d9", "#ffffff", 2, 67, 69],
  ["avellino", "US Avellino", "Avellino", "AVE", "Avellino", "#168c5b", "#ffffff", 2, 67, 68],
]);

const GERMANY_SECOND_DIVISION = clubsFor("alemanha", "2-bundesliga", [
  ["hertha-berlin", "Hertha BSC", "Hertha", "HER", "Berlin", "#1b5da7", "#ffffff", 4, 73, 74],
  ["hannover-96", "Hannover 96", "Hannover", "H96", "Hannover", "#111111", "#168c5b", 3, 72, 72],
  ["nurnberg", "1. FC Nürnberg", "Nürnberg", "FCN", "Nürnberg", "#8b1b2b", "#ffffff", 3, 70, 71],
  ["fortuna-dusseldorf", "Fortuna Düsseldorf", "Düsseldorf", "F95", "Düsseldorf", "#d71920", "#ffffff", 3, 73, 72],
  ["kaiserslautern", "1. FC Kaiserslautern", "Kaiserslautern", "FCK", "Kaiserslautern", "#d71920", "#ffffff", 3, 72, 73],
  ["bochum", "VfL Bochum", "Bochum", "BOC", "Bochum", "#1557a2", "#ffffff", 3, 71, 70],
  ["darmstadt", "SV Darmstadt 98", "Darmstadt", "D98", "Darmstadt", "#1b5da7", "#ffffff", 3, 70, 69],
  ["karlsruhe", "Karlsruher SC", "Karlsruhe", "KSC", "Karlsruhe", "#1b5da7", "#ffffff", 3, 71, 70],
  ["greuther-furth", "Greuther Fürth", "Fürth", "SGF", "Fürth", "#168c5b", "#ffffff", 2, 68, 68],
  ["holstein-kiel", "Holstein Kiel", "Kiel", "KIE", "Kiel", "#1557a2", "#d71920", 3, 70, 69],
  ["arminia-bielefeld", "Arminia Bielefeld", "Bielefeld", "DSC", "Bielefeld", "#1557a2", "#111111", 3, 69, 71],
  ["preussen-munster", "Preußen Münster", "Münster", "PRM", "Münster", "#111111", "#168c5b", 2, 67, 68],
  ["magdeburg", "1. FC Magdeburg", "Magdeburg", "FCM", "Magdeburg", "#1b5da7", "#ffffff", 2, 70, 70],
  ["dynamo-dresden", "Dynamo Dresden", "Dresden", "SGD", "Dresden", "#f2b705", "#111111", 3, 69, 71],
  ["eintracht-braunschweig", "Eintracht Braunschweig", "Braunschweig", "EBS", "Braunschweig", "#f2b705", "#1b5da7", 2, 67, 67],
  ["hansa-rostock", "Hansa Rostock", "Rostock", "HAN", "Rostock", "#1b5da7", "#ffffff", 2, 67, 68],
  ["st-pauli", "FC St. Pauli", "St. Pauli", "STP", "Hamburg", "#5b3225", "#ffffff", 4, 73, 72],
  ["heidenheim", "1. FC Heidenheim", "Heidenheim", "HDH", "Heidenheim", "#d71920", "#1b5da7", 3, 72, 70],
]);

const FRANCE_SECOND_DIVISION = clubsFor("franca", "ligue-2", [
  ["saint-etienne", "AS Saint-Étienne", "Saint-Étienne", "ASSE", "Saint-Étienne", "#168c5b", "#ffffff", 4, 73, 75],
  ["montpellier", "Montpellier HSC", "Montpellier", "MHS", "Montpellier", "#f58220", "#234b9b", 3, 71, 70],
  ["reims", "Stade de Reims", "Reims", "REI", "Reims", "#d71920", "#ffffff", 3, 72, 71],
  ["metz", "FC Metz", "Metz", "MET", "Metz", "#8b1b2b", "#ffffff", 3, 72, 72],
  ["guingamp", "EA Guingamp", "Guingamp", "GUI", "Guingamp", "#d71920", "#111111", 3, 70, 69],
  ["amiens", "Amiens SC", "Amiens", "AMI", "Amiens", "#ffffff", "#111111", 2, 68, 68],
  ["bastia", "SC Bastia", "Bastia", "BAS", "Bastia", "#1557a2", "#ffffff", 3, 69, 70],
  ["grenoble", "Grenoble Foot 38", "Grenoble", "GRE", "Grenoble", "#1557a2", "#ffffff", 2, 68, 68],
  ["caen", "SM Caen", "Caen", "CAE", "Caen", "#1557a2", "#d71920", 3, 67, 69],
  ["nancy", "AS Nancy", "Nancy", "NAN", "Nancy", "#d71920", "#ffffff", 2, 67, 68],
  ["annecy", "FC Annecy", "Annecy", "ANN", "Annecy", "#d71920", "#ffffff", 2, 67, 67],
  ["laval", "Stade Lavallois", "Laval", "LAV", "Laval", "#f58220", "#111111", 2, 68, 68],
  ["rodez", "Rodez AF", "Rodez", "ROD", "Rodez", "#d71920", "#f2b705", 2, 67, 67],
  ["pau", "Pau FC", "Pau", "PAU", "Pau", "#f2b705", "#234b9b", 2, 67, 68],
  ["clermont", "Clermont Foot", "Clermont", "CLE", "Clermont-Ferrand", "#8b1b2b", "#234b9b", 3, 69, 69],
  ["dunkerque", "USL Dunkerque", "Dunkerque", "DUN", "Dunkerque", "#1557a2", "#ffffff", 2, 69, 69],
  ["red-star", "Red Star FC", "Red Star", "RSC", "Saint-Ouen", "#168c5b", "#ffffff", 2, 68, 69],
  ["boulogne", "US Boulogne", "Boulogne", "USB", "Boulogne-sur-Mer", "#d71920", "#111111", 2, 66, 67],
]);

const PORTUGAL_SECOND_DIVISION = clubsFor("portugal", "liga-portugal-2", [
  ["boavista", "Boavista FC", "Boavista", "BOA", "Porto", "#111111", "#ffffff", 4, 70, 71],
  ["pacos-ferreira", "FC Paços de Ferreira", "Paços Ferreira", "PAÇ", "Paços de Ferreira", "#f2b705", "#168c5b", 3, 68, 69],
  ["belenenses", "CF Os Belenenses", "Belenenses", "BEL", "Lisboa", "#1557a2", "#ffffff", 3, 67, 69],
  ["uniao-leiria", "UD Leiria", "União Leiria", "LEI", "Leiria", "#d71920", "#ffffff", 2, 69, 69],
  ["penafiel", "FC Penafiel", "Penafiel", "PEN", "Penafiel", "#d71920", "#111111", 2, 67, 67],
  ["feirense", "CD Feirense", "Feirense", "FEI", "Santa Maria da Feira", "#1557a2", "#ffffff", 2, 67, 68],
  ["leixoes", "Leixões SC", "Leixões", "LEI", "Matosinhos", "#d71920", "#ffffff", 2, 68, 69],
  ["oliveirense", "UD Oliveirense", "Oliveirense", "OLI", "Oliveira de Azeméis", "#d71920", "#1557a2", 2, 65, 66],
  ["chaves", "GD Chaves", "Chaves", "CHA", "Chaves", "#1557a2", "#d71920", 3, 69, 69],
  ["tondela", "CD Tondela", "Tondela", "TON", "Tondela", "#168c5b", "#f2b705", 3, 69, 70],
  ["farense", "SC Farense", "Farense", "FAR", "Faro", "#111111", "#ffffff", 3, 69, 68],
  ["portimonense", "Portimonense SC", "Portimonense", "POR", "Portimão", "#111111", "#ffffff", 3, 68, 68],
  ["vizela", "FC Vizela", "Vizela", "VIZ", "Vizela", "#1557a2", "#ffffff", 2, 68, 68],
  ["torreense", "SCU Torreense", "Torreense", "TOR", "Torres Vedras", "#8b1b2b", "#ffffff", 2, 68, 69],
  ["mafra", "CD Mafra", "Mafra", "MAF", "Mafra", "#f2b705", "#168c5b", 2, 66, 67],
  ["academica-coimbra", "Académica de Coimbra", "Académica", "AAC", "Coimbra", "#111111", "#ffffff", 3, 67, 71],
  ["varzim", "Varzim SC", "Varzim", "VAR", "Póvoa de Varzim", "#111111", "#ffffff", 2, 65, 67],
  ["felgueiras", "FC Felgueiras", "Felgueiras", "FEL", "Felgueiras", "#1557a2", "#d71920", 1, 65, 66],
]);

export const EXTRA_SECOND_DIVISION_CLUBS: Club[] = [
  ...SPAIN_SECOND_DIVISION,
  ...ITALY_SECOND_DIVISION,
  ...GERMANY_SECOND_DIVISION,
  ...FRANCE_SECOND_DIVISION,
  ...PORTUGAL_SECOND_DIVISION,
];

export function installSecondDivisions() {
  for (const league of EXTRA_SECOND_DIVISION_LEAGUES) {
    if (!LEAGUES.some((candidate) => candidate.id === league.id)) LEAGUES.push(league);
  }
  for (const club of EXTRA_SECOND_DIVISION_CLUBS) {
    if (!CLUBS.some((candidate) => candidate.id === club.id)) CLUBS.push(club);
  }
}

export type ExtraPromotion = {
  topLeagueId: string;
  playoff: boolean;
};

type PromotionRule = {
  topLeagueId: string;
  automaticPlaces: number;
  playoffFrom: number;
  playoffTo: number;
  playoffBaseChance: number;
  playoffPositionBonus: number;
};

const PROMOTION_RULES: Record<string, PromotionRule> = {
  "segunda-division": { topLeagueId: "laliga", automaticPlaces: 2, playoffFrom: 3, playoffTo: 6, playoffBaseChance: 0.30, playoffPositionBonus: 0.08 },
  "serie-b-italia": { topLeagueId: "seriea", automaticPlaces: 2, playoffFrom: 3, playoffTo: 8, playoffBaseChance: 0.22, playoffPositionBonus: 0.055 },
  "2-bundesliga": { topLeagueId: "bundesliga", automaticPlaces: 2, playoffFrom: 3, playoffTo: 3, playoffBaseChance: 0.47, playoffPositionBonus: 0 },
  "ligue-2": { topLeagueId: "ligue1", automaticPlaces: 2, playoffFrom: 3, playoffTo: 5, playoffBaseChance: 0.27, playoffPositionBonus: 0.085 },
  "liga-portugal-2": { topLeagueId: "primeira", automaticPlaces: 2, playoffFrom: 3, playoffTo: 3, playoffBaseChance: 0.44, playoffPositionBonus: 0 },
};

export function resolveExtraSecondDivisionPromotion(
  leagueId: string,
  leaguePosition: number,
  playoffRoll: number,
  playerImpact: number,
): ExtraPromotion | null {
  const rule = PROMOTION_RULES[leagueId];
  if (!rule) return null;
  if (leaguePosition <= rule.automaticPlaces) return { topLeagueId: rule.topLeagueId, playoff: false };
  if (leaguePosition < rule.playoffFrom || leaguePosition > rule.playoffTo) return null;

  const positionBonus = (rule.playoffTo - leaguePosition) * rule.playoffPositionBonus;
  const playerBonus = Math.max(0, playerImpact) * 0.012;
  const playoffChance = Math.max(0.18, Math.min(0.74, rule.playoffBaseChance + positionBonus + playerBonus));
  return playoffRoll < playoffChance ? { topLeagueId: rule.topLeagueId, playoff: true } : null;
}

installSecondDivisions();
