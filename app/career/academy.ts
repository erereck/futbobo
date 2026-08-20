import { CLUBS, LEAGUES, POSITIONS, countryById, leagueById } from "../game-data";
import type { Club, ContinentalSlot, Country, PositionKey } from "../game-data";
import { clubById, seeded } from "./shared";
import type { GameState } from "./model";

export function randomClubSelection(pool: Club[], count: number, seed: number, salt: number, excludedIds: string[] = []) {
  return pool
    .filter((club) => !excludedIds.includes(club.id))
    .map((club, index) => ({ club, order: seeded(seed, salt + index * 37 + CLUBS.indexOf(club) * 11) }))
    .sort((a, b) => a.order - b.order)
    .slice(0, count)
    .map(({ club }) => club);
}

export const REGIONAL_ACADEMY_ROUTES: Record<string, string[]> = {
  bolivia: ["argentina", "chile", "peru"],
  venezuela: ["colombia", "equador"],
  canada: ["eua"],
  "costa-rica": ["eua", "mexico"],
  jamaica: ["eua", "mexico"],
  panama: ["eua", "mexico"],
  croacia: ["italia", "alemanha"],
  dinamarca: ["alemanha", "holanda"],
  noruega: ["alemanha", "holanda"],
  suecia: ["alemanha", "holanda"],
  polonia: ["alemanha"],
  servia: ["italia", "alemanha"],
  ucrania: ["alemanha", "italia"],
  "republica-tcheca": ["alemanha"],
  "pais-de-gales": ["inglaterra"],
  irlanda: ["inglaterra"],
  grecia: ["italia"],
  romenia: ["italia", "alemanha"],
  hungria: ["alemanha", "italia"],
  islandia: ["holanda", "inglaterra"],
  georgia: ["alemanha", "italia"],
  albania: ["italia"],
  bosnia: ["italia", "alemanha"],
  bulgaria: ["turquia", "italia"],
  finlandia: ["alemanha", "holanda"],
  israel: ["turquia"],
  kosovo: ["alemanha", "italia"],
  montenegro: ["italia"],
  "macedonia-do-norte": ["turquia", "italia"],
  "irlanda-do-norte": ["inglaterra", "escocia"],
  eslovaquia: ["alemanha", "austria"],
  eslovenia: ["italia", "austria"],
  chipre: ["turquia", "grecia"],
  "el-salvador": ["mexico", "eua"],
  guatemala: ["mexico", "eua"],
  honduras: ["mexico", "eua"],
  haiti: ["eua", "mexico"],
  "trinidad-e-tobago": ["eua", "mexico"],
  curacao: ["holanda", "eua"],
  "emirados-arabes": ["arabia-saudita"],
  jordania: ["arabia-saudita"],
  oma: ["arabia-saudita"],
  bahrein: ["arabia-saudita"],
  kuwait: ["arabia-saudita"],
  tailandia: ["japao", "coreia-do-sul"],
  vietna: ["japao", "coreia-do-sul"],
  indonesia: ["japao", "coreia-do-sul"],
  india: ["arabia-saudita", "japao"],
  "coreia-do-norte": ["coreia-do-sul", "china"],
  angola: ["portugal", "franca"],
  "burkina-faso": ["franca"],
  "cabo-verde": ["portugal"],
  "congo-rd": ["franca", "belgica"],
  gabao: ["franca"],
  guine: ["franca", "portugal"],
  zambia: ["franca", "portugal"],
  zimbabue: ["franca", "portugal"],
  mocambique: ["portugal"],
  fiji: ["japao", "eua"],
  "ilhas-salomao": ["japao", "eua"],
  taiti: ["franca", "eua"],
  armenia: ["turquia", "alemanha"],
  azerbaijao: ["turquia", "alemanha"],
  cazaquistao: ["turquia", "alemanha"],
  luxemburgo: ["belgica", "franca"],
  siria: ["arabia-saudita", "turquia"],
  libano: ["arabia-saudita", "turquia"],
  palestina: ["arabia-saudita", "turquia"],
  malasia: ["australia", "japao"],
  filipinas: ["australia", "japao"],
  benim: ["egito", "africa-do-sul"],
  uganda: ["africa-do-sul", "egito"],
  tanzania: ["africa-do-sul", "egito"],
  quenia: ["africa-do-sul", "egito"],
  "guine-equatorial": ["egito", "africa-do-sul"],
  suriname: ["eua", "mexico"],
  nicaragua: ["mexico", "eua"],
  "republica-dominicana": ["eua", "mexico"],
  "papua-nova-guine": ["australia", "nova-zelandia"],
  vanuatu: ["australia", "nova-zelandia"],
  "nova-caledonia": ["australia", "nova-zelandia"],
  vaticano: ["italia"],
  "san-marino": ["italia"],
  andorra: ["espanha", "franca"],
  liechtenstein: ["suica", "austria"],
  malta: ["italia", "inglaterra"],
  gibraltar: ["espanha", "inglaterra"],
  "ilhas-faroe": ["inglaterra", "escocia"],
  moldavia: ["romenia", "ucrania", "italia"],
  estonia: ["alemanha"],
  letonia: ["alemanha"],
  lituania: ["alemanha"],
  nepal: ["japao", "india"],
  butao: ["japao", "india"],
  mongolia: ["china", "japao"],
  bangladesh: ["japao", "india"],
};

export const PLAYABLE_ACADEMY_COUNTRIES = Array.from(new Set(LEAGUES.map((league) => league.countryId)));

export const CONFEDERATION_ACADEMY_ROUTES: Record<Country["confederation"], string[]> = {
  SOUTH_AMERICA: ["argentina", "brasil", "colombia", "uruguai", "chile"],
  NORTH_AMERICA: ["eua", "mexico"],
  EUROPE: ["franca", "alemanha", "portugal", "italia", "inglaterra", "grecia", "republica-tcheca"],
  ASIA: ["japao", "coreia-do-sul", "arabia-saudita", "china", "australia"],
  AFRICA: ["egito", "africa-do-sul", "marrocos", "franca", "portugal"],
  OCEANIA: ["australia", "japao", "eua"],
};

export function sortedCountries(countries: Country[]) {
  return [...countries].sort((a, b) => {
    if (a.id === "brasil") return -1;
    if (b.id === "brasil") return 1;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

export function defaultAcademyCountry(countryId: string) {
  if (PLAYABLE_ACADEMY_COUNTRIES.includes(countryId)) return countryId;
  const regionalCountries = REGIONAL_ACADEMY_ROUTES[countryId] ?? [];
  const confederationCountries = CONFEDERATION_ACADEMY_ROUTES[countryById(countryId).confederation] ?? [];
  return [...regionalCountries, ...confederationCountries]
    .find((candidate) => PLAYABLE_ACADEMY_COUNTRIES.includes(candidate)) ?? "franca";
}

export function academyClubPool(countryId: string) {
  const localClubs = CLUBS.filter((club) => club.countryId === countryId);
  if (localClubs.length >= 4) return localClubs;
  const regionalCountries = REGIONAL_ACADEMY_ROUTES[countryId] ?? [];
  if (regionalCountries.length) {
    return CLUBS.filter((club) =>
      regionalCountries.includes(club.countryId) &&
      club.reputation <= 3 &&
      club.strength <= 78,
    );
  }
  return CLUBS.filter((club) =>
    countryById(club.countryId).confederation === "EUROPE" &&
    club.reputation <= 3 &&
    club.strength <= 78,
  );
}

export function hasLocalAcademyRoute(countryId: string) {
  return PLAYABLE_ACADEMY_COUNTRIES.includes(countryId);
}

export function randomAcademyClubs(seed: number, countryId: string) {
  return randomClubSelection(academyClubPool(countryId), 4, seed, 1709 + countryId.length * 41);
}

export function academyRouteCopy(academyCountryId: string, nationalityId: string) {
  const academyCountry = countryById(academyCountryId);
  const nationality = countryById(nationalityId);
  if (academyCountryId === nationalityId) {
    return {
      label: `BASE NACIONAL · ${academyCountry.abbr}`,
      title: `Seu futebol começa em ${academyCountry.name}`,
      text: `As quatro portas sorteadas pertencem à liga de ${academyCountry.name}. Você cresce perto da sua cultura antes de decidir se quer cruzar fronteiras.`,
    };
  }
  const recommendedCountryId = defaultAcademyCountry(nationalityId);
  const isRecommendedRoute = academyCountryId === recommendedCountryId;
  return {
    label: `${isRecommendedRoute ? "ROTA RECOMENDADA" : "ROTA INTERNACIONAL"} · ${academyCountry.abbr}`,
    title: isRecommendedRoute ? "Uma liga próxima abriu a porta" : `Novo capítulo: ${academyCountry.name}`,
    text: `${nationality.name} não tem liga jogável no momento. Sua formação acontece no futebol de ${academyCountry.name}, mas a Seleção e a identidade da carreira continuam sendo de ${nationality.name}.`,
  };
}

export function continentalNationalTournament(country: Country) {
  if (country.confederation === "EUROPE") return "Eurocopa";
  if (country.confederation === "NORTH_AMERICA") return "Copa Ouro";
  if (country.confederation === "ASIA") return "Copa da Ásia";
  if (country.confederation === "AFRICA") return "Copa Africana";
  if (country.confederation === "OCEANIA") return "Copa das Nações da OFC";
  return "Copa América";
}

export function revelationOfferPool(state: GameState) {
  if (hasLocalAcademyRoute(state.academyCountryId)) return academyClubPool(state.academyCountryId);
  const academyCountryId = clubById(state.academyClubId).countryId;
  const sameCountry = CLUBS.filter((club) => club.countryId === academyCountryId && club.reputation <= 4);
  const routePool = academyClubPool(state.academyCountryId);
  return Array.from(new Map([...sameCountry, ...routePool].map((club) => [club.id, club])).values());
}

export function isOutsideCountry(club: Club, countryId: string) {
  return club.countryId !== countryId;
}

export function isOutsideAcademyHome(state: Pick<GameState, "academyCountryId">, club: Club) {
  return isOutsideCountry(club, state.academyCountryId);
}

export function clubConfederation(club: Club) {
  return countryById(club.countryId).confederation;
}

export const DOMESTIC_SUPER_CUP_NAMES: Record<string, string> = {
  brasileirao: "Supercopa Rei",
  premier: "FA Community Shield",
  laliga: "Supercopa da Espanha",
  seriea: "Supercoppa Italiana",
  bundesliga: "DFL-Supercup",
  ligue1: "Trophée des Champions",
  primeira: "Supertaça Cândido de Oliveira",
  eredivisie: "Johan Cruyff Shield",
  "liga-argentina": "Trofeo de Campeones",
  "liga-uruguaia": "Supercopa Uruguaya",
  "liga-chilena": "Supercopa de Chile",
  "liga-colombiana": "Superliga Colombiana",
  "liga-paraguaia": "Supercopa Paraguay",
  "liga-equatoriana": "Supercopa Ecuador",
  "liga-peruana": "Supercopa Peruana",
  "liga-mx": "Campeón de Campeones",
  proleague: "Supercopa da Bélgica",
  superlig: "Supercopa da Turquia",
  "saudi-pro-league": "Supercopa da Arábia Saudita",
  "j1-league": "Supercopa do Japão",
  "k-league": "Supercopa da Coreia",
  csl: "Supercopa da China",
  "egypt-premier": "Supercopa do Egito",
  "botola-pro": "Supercopa do Marrocos",
  "super-league-greece": "Supercopa da Grécia",
  "liga-boliviana": "Supercopa da Bolívia",
  "liga-futve": "Supercopa da Venezuela",
  "chance-liga": "Supercopa da Tchéquia",
};

export function isEuropeanClub(club: Club) {
  return clubConfederation(club) === "EUROPE";
}

export function initialContinentalSlot(club: Club): ContinentalSlot | null {
  if (club.leagueId === "brasileirao-b" || club.leagueId === "championship") return null;
  const confederation = clubConfederation(club);
  if (confederation === "SOUTH_AMERICA") return club.reputation >= 4 ? "libertadores" : club.reputation >= 3 ? "sudamericana" : null;
  if (confederation === "NORTH_AMERICA") return club.reputation >= 4 ? "concacaf" : null;
  if (confederation === "ASIA") return club.reputation >= 4 ? "asian" : null;
  if (confederation === "AFRICA") return club.reputation >= 4 ? "african" : null;
  // Só a Europa entra nas competições da UEFA. Antes qualquer confederação sem
  // caso próprio caía aqui, e clube asiático de reputação alta ganhava Champions.
  if (confederation !== "EUROPE") return null;
  if (club.reputation >= 5) return "champions";
  if (club.reputation >= 4) return "europa";
  return null;
}

export function continentalSlotAfterSeason(
  club: Club,
  league: ReturnType<typeof leagueById>,
  leagueChampion: boolean,
  cupChampion: boolean,
  leaguePosition: number,
): ContinentalSlot | null {
  const isSecondDivision = league.id === "brasileirao-b" || league.id === "championship";
  if (isSecondDivision) {
    if (!cupChampion) return null;
    return league.id === "brasileirao-b" ? "libertadores" : "europa";
  }
  const confederation = clubConfederation(club);
  if (confederation === "SOUTH_AMERICA") {
    if (leagueChampion || cupChampion || leaguePosition <= 6) return "libertadores";
    if (leaguePosition <= 12) return "sudamericana";
    return null;
  }
  if (confederation === "NORTH_AMERICA") return leagueChampion || cupChampion || leaguePosition <= (league.championsPlaces || 4) ? "concacaf" : null;
  if (confederation === "ASIA") return leagueChampion || cupChampion || leaguePosition <= (league.championsPlaces || 3) ? "asian" : null;
  if (confederation === "AFRICA") return leagueChampion || cupChampion || leaguePosition <= (league.championsPlaces || 2) ? "african" : null;
  if (confederation !== "EUROPE") return null;
  if (leagueChampion || leaguePosition <= league.championsPlaces) return "champions";
  if (cupChampion || leaguePosition <= league.europaPlaces) return "europa";
  if (leaguePosition <= league.conferencePlaces) return "conference";
  return null;
}

export // Proximidade geográfica: destinos do mesmo continente do clube atual aparecem com muito mais frequência.
function regionAffinity(originCountryId: string, club: Club) {
  if (club.countryId === originCountryId) return -12;
  const originConfederation = countryById(originCountryId).confederation;
  const targetConfederation = clubConfederation(club);
  if (originConfederation === "SOUTH_AMERICA") {
    if (targetConfederation === "SOUTH_AMERICA") return -3;
    if (targetConfederation === "NORTH_AMERICA") return -1;
    return 0;
  }
  if (originConfederation === "NORTH_AMERICA") {
    if (targetConfederation === "NORTH_AMERICA") return -3;
    if (targetConfederation === "SOUTH_AMERICA") return -1;
    return 0;
  }
  if (originConfederation === targetConfederation) return -2;
  return 1;
}

export function initialAdaptation(originCountryId: string, destinationCountryId: string) {
  if (originCountryId === destinationCountryId) return 100;
  const originConfederation = countryById(originCountryId).confederation;
  const destinationConfederation = countryById(destinationCountryId).confederation;
  if (originConfederation === destinationConfederation) return 72;
  if (
    (originConfederation === "SOUTH_AMERICA" && destinationConfederation === "NORTH_AMERICA") ||
    (originConfederation === "NORTH_AMERICA" && destinationConfederation === "SOUTH_AMERICA")
  ) return 56;
  if (
    (originCountryId === "brasil" && destinationCountryId === "portugal") ||
    (originCountryId === "portugal" && destinationCountryId === "brasil")
  ) return 62;
  if (destinationCountryId === "espanha" && originConfederation === "SOUTH_AMERICA") return 58;
  return 34;
}

export function foreignEligible(state: GameState, club: Club, originCountryId: string) {
  if (!isOutsideCountry(club, originCountryId)) return false;
  if (state.age > 38) return false;
  const league = leagueById(club.leagueId);
  const confederation = clubConfederation(club);
  let requirement = 58 + league.prestige * 5 + club.reputation * 3 - Math.min(10, state.reputation / 12) - Math.min(6, state.nationalLevel / 18);
  if (confederation === "SOUTH_AMERICA") requirement -= 6;
  if (confederation === "NORTH_AMERICA") requirement -= state.age >= 29 ? 10 : 4;
  if (state.age > 33) requirement += confederation === "EUROPE" ? (state.age - 33) * 4 : (state.age - 33) * 1.5;
  return state.overall >= requirement;
}

export function positionByKey(key: PositionKey) {
  return POSITIONS.find((position) => position.key === key) ?? POSITIONS[6];
}
