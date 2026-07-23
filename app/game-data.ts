export type PositionKey =
  | "GOL"
  | "LD"
  | "ZAG"
  | "LE"
  | "VOL"
  | "MC"
  | "MEI"
  | "MD"
  | "ME"
  | "PD"
  | "PE"
  | "CA";

export type Position = {
  key: PositionKey;
  name: string;
  zone: "gol" | "defesa" | "meio" | "ataque";
  style: string;
  icon: string;
  color: string;
  goals: number;
  assists: number;
};

export type Confederation = "SOUTH_AMERICA" | "EUROPE" | "NORTH_AMERICA" | "ASIA" | "AFRICA" | "OCEANIA";

export type Country = {
  id: string;
  name: string;
  demonym: string;
  abbr: string;
  confederation: Confederation;
  strength: number;
  primary: string;
  secondary: string;
};

export type League = {
  id: string;
  countryId: string;
  name: string;
  cupName: string;
  prestige: number;
  championsPlaces: number;
  europaPlaces: number;
  conferencePlaces: number;
};

export type ContinentalSlot = "libertadores" | "champions" | "europa" | "conference" | "concacaf";

export type Club = {
  id: string;
  name: string;
  shortName: string;
  abbr: string;
  city: string;
  state?: string;
  countryId: string;
  leagueId: string;
  primary: string;
  secondary: string;
  reputation: number;
  strength: number;
  academy?: number;
};

export type Formation = {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  description: string;
  technical: number;
  physical: number;
  mental: number;
  risk: number;
  archetype: string;
};

export type Effect = {
  ovr?: number;
  potential?: number;
  morale?: number;
  fitness?: number;
  reputation?: number;
  leadership?: number;
  money?: number;
  minutes?: number;
  titleBoost?: number;
  nationalBoost?: number;
  nationalTitleBoost?: number;
  nationalCall?: boolean;
  nationalCaptain?: boolean;
  adaptation?: number;
  fans?: number;
  injuryRisk?: number;
  transfer?: boolean;
  transferAbroad?: boolean;
  loan?: boolean;
  rivalRespect?: number;
  retire?: boolean;
  discipline?: number;
  contractYears?: number;
  salaryBoost?: number;
  clubCaptain?: boolean;
  switchNationalityTo?: string;
  forcedAlternativeTransfer?: boolean;
};

export type GameEvent = {
  id: string;
  icon: string;
  tag: string;
  title: string;
  description: string;
  minAge?: number;
  maxAge?: number;
  minOvr?: number;
  maxOvr?: number;
  needsLowFitness?: boolean;
  needsNational?: boolean;
  needsLibertadores?: boolean;
  needsWorld?: boolean;
  needsAbroad?: boolean;
  needsContinental?: ContinentalSlot;
  needsNationalMain?: boolean;
  needsNationalYouth?: boolean;
  nationalWindow?: "major" | "continental" | "olympics" | "qualifiers";
  needsDomestic?: boolean;
  needsRivalry?: boolean;
  maxContractYears?: number;
  seasonParity?: "even" | "odd";
  oneTime?: boolean;
  rareChance?: number;
  needsConfederation?: Confederation;
  needsPositionZone?: Position["zone"];
  needsSquadRoles?: Array<"promessa" | "reserva" | "rotacao" | "titular" | "estrela">;
  needsCaptainRole?: "club" | "national" | "any";
  choices: Array<{
    label: string;
    hint: string;
    result: string;
    effect: Effect;
    luck?: {
      chance: number;
      successText: string;
      failureText: string;
      successEffect: Effect;
      failureEffect: Effect;
    };
  }>;
};

export const POSITIONS: Position[] = [
  { key: "GOL", name: "Goleiro", zone: "gol", style: "Muralha", icon: "🧤", color: "#f2b705", goals: 0.001, assists: 0.01 },
  { key: "LD", name: "Lateral direito", zone: "defesa", style: "Ala incansável", icon: "↗", color: "#2ca8ff", goals: 0.03, assists: 0.17 },
  { key: "ZAG", name: "Zagueiro", zone: "defesa", style: "Pilar defensivo", icon: "◆", color: "#2ca8ff", goals: 0.045, assists: 0.03 },
  { key: "LE", name: "Lateral esquerdo", zone: "defesa", style: "Apoio por fora", icon: "↖", color: "#2ca8ff", goals: 0.03, assists: 0.17 },
  { key: "VOL", name: "Volante", zone: "meio", style: "Escudo do time", icon: "⬡", color: "#63e36b", goals: 0.055, assists: 0.11 },
  { key: "MC", name: "Meio-campista", zone: "meio", style: "Motor do time", icon: "●", color: "#63e36b", goals: 0.12, assists: 0.21 },
  { key: "MEI", name: "Meia ofensivo", zone: "meio", style: "Maestro", icon: "✦", color: "#63e36b", goals: 0.22, assists: 0.3 },
  { key: "MD", name: "Meia direita", zone: "meio", style: "Construtor aberto", icon: "›", color: "#63e36b", goals: 0.16, assists: 0.25 },
  { key: "ME", name: "Meia esquerda", zone: "meio", style: "Criador pelo lado", icon: "‹", color: "#63e36b", goals: 0.16, assists: 0.25 },
  { key: "PD", name: "Ponta direita", zone: "ataque", style: "Driblador", icon: "⚡", color: "#ff7a45", goals: 0.28, assists: 0.22 },
  { key: "PE", name: "Ponta esquerda", zone: "ataque", style: "Pé invertido", icon: "⚡", color: "#ff7a45", goals: 0.28, assists: 0.22 },
  { key: "CA", name: "Centroavante", zone: "ataque", style: "Matador de área", icon: "◎", color: "#ff7a45", goals: 0.43, assists: 0.11 },
];

// Nações disponíveis para nacionalidade do jogador (Seleção) e para sediar ligas de clubes.
export const COUNTRIES: Country[] = [
  { id: "brasil", name: "Brasil", demonym: "brasileiro", abbr: "BRA", confederation: "SOUTH_AMERICA", strength: 5, primary: "#08783e", secondary: "#f2b705" },
  { id: "argentina", name: "Argentina", demonym: "argentino", abbr: "ARG", confederation: "SOUTH_AMERICA", strength: 5, primary: "#6cabe0", secondary: "#f5f5f5" },
  { id: "uruguai", name: "Uruguai", demonym: "uruguaio", abbr: "URU", confederation: "SOUTH_AMERICA", strength: 3, primary: "#4a9fd6", secondary: "#111111" },
  { id: "chile", name: "Chile", demonym: "chileno", abbr: "CHI", confederation: "SOUTH_AMERICA", strength: 3, primary: "#d71920", secondary: "#274b9f" },
  { id: "colombia", name: "Colômbia", demonym: "colombiano", abbr: "COL", confederation: "SOUTH_AMERICA", strength: 3, primary: "#f2b705", secondary: "#274b9f" },
  { id: "paraguai", name: "Paraguai", demonym: "paraguaio", abbr: "PAR", confederation: "SOUTH_AMERICA", strength: 2, primary: "#d71920", secondary: "#274b9f" },
  { id: "equador", name: "Equador", demonym: "equatoriano", abbr: "EQU", confederation: "SOUTH_AMERICA", strength: 3, primary: "#f2b705", secondary: "#274b9f" },
  { id: "peru", name: "Peru", demonym: "peruano", abbr: "PER", confederation: "SOUTH_AMERICA", strength: 2, primary: "#d71920", secondary: "#f5f5f5" },
  { id: "mexico", name: "México", demonym: "mexicano", abbr: "MEX", confederation: "NORTH_AMERICA", strength: 3, primary: "#08783e", secondary: "#d71920" },
  { id: "eua", name: "Estados Unidos", demonym: "norte-americano", abbr: "EUA", confederation: "NORTH_AMERICA", strength: 3, primary: "#274b9f", secondary: "#d71920" },
  { id: "portugal", name: "Portugal", demonym: "português", abbr: "POR", confederation: "EUROPE", strength: 4, primary: "#08783e", secondary: "#d71920" },
  { id: "espanha", name: "Espanha", demonym: "espanhol", abbr: "ESP", confederation: "EUROPE", strength: 5, primary: "#d71920", secondary: "#f2b705" },
  { id: "franca", name: "França", demonym: "francês", abbr: "FRA", confederation: "EUROPE", strength: 5, primary: "#274b9f", secondary: "#d71920" },
  { id: "inglaterra", name: "Inglaterra", demonym: "inglês", abbr: "ING", confederation: "EUROPE", strength: 4, primary: "#d71920", secondary: "#f5f5f5" },
  { id: "alemanha", name: "Alemanha", demonym: "alemão", abbr: "ALE", confederation: "EUROPE", strength: 5, primary: "#111111", secondary: "#d71920" },
  { id: "italia", name: "Itália", demonym: "italiano", abbr: "ITA", confederation: "EUROPE", strength: 4, primary: "#08783e", secondary: "#f5f5f5" },
  { id: "holanda", name: "Holanda", demonym: "holandês", abbr: "HOL", confederation: "EUROPE", strength: 3, primary: "#ff7a1a", secondary: "#274b9f" },
  { id: "bolivia", name: "Bolívia", demonym: "boliviano", abbr: "BOL", confederation: "SOUTH_AMERICA", strength: 2, primary: "#d52b1e", secondary: "#007934" },
  { id: "venezuela", name: "Venezuela", demonym: "venezuelano", abbr: "VEN", confederation: "SOUTH_AMERICA", strength: 2, primary: "#8c1b3f", secondary: "#f5c400" },
  { id: "canada", name: "Canadá", demonym: "canadense", abbr: "CAN", confederation: "NORTH_AMERICA", strength: 3, primary: "#d80621", secondary: "#ffffff" },
  { id: "costa-rica", name: "Costa Rica", demonym: "costarriquenho", abbr: "CRC", confederation: "NORTH_AMERICA", strength: 2, primary: "#d71920", secondary: "#274b9f" },
  { id: "jamaica", name: "Jamaica", demonym: "jamaicano", abbr: "JAM", confederation: "NORTH_AMERICA", strength: 2, primary: "#009b3a", secondary: "#fed100" },
  { id: "panama", name: "Panamá", demonym: "panamenho", abbr: "PAN", confederation: "NORTH_AMERICA", strength: 2, primary: "#d21034", secondary: "#005293" },
  { id: "belgica", name: "Bélgica", demonym: "belga", abbr: "BEL", confederation: "EUROPE", strength: 4, primary: "#111111", secondary: "#ef3340" },
  { id: "croacia", name: "Croácia", demonym: "croata", abbr: "CRO", confederation: "EUROPE", strength: 4, primary: "#ff0000", secondary: "#ffffff" },
  { id: "dinamarca", name: "Dinamarca", demonym: "dinamarquês", abbr: "DIN", confederation: "EUROPE", strength: 3, primary: "#c60c30", secondary: "#ffffff" },
  { id: "noruega", name: "Noruega", demonym: "norueguês", abbr: "NOR", confederation: "EUROPE", strength: 3, primary: "#ba0c2f", secondary: "#00205b" },
  { id: "suecia", name: "Suécia", demonym: "sueco", abbr: "SUE", confederation: "EUROPE", strength: 3, primary: "#006aa7", secondary: "#fecc02" },
  { id: "suica", name: "Suíça", demonym: "suíço", abbr: "SUI", confederation: "EUROPE", strength: 4, primary: "#d52b1e", secondary: "#ffffff" },
  { id: "austria", name: "Áustria", demonym: "austríaco", abbr: "AUT", confederation: "EUROPE", strength: 3, primary: "#ed2939", secondary: "#ffffff" },
  { id: "polonia", name: "Polônia", demonym: "polonês", abbr: "POL", confederation: "EUROPE", strength: 3, primary: "#dc143c", secondary: "#ffffff" },
  { id: "servia", name: "Sérvia", demonym: "sérvio", abbr: "SER", confederation: "EUROPE", strength: 3, primary: "#c6363c", secondary: "#0c4076" },
  { id: "turquia", name: "Turquia", demonym: "turco", abbr: "TUR", confederation: "EUROPE", strength: 3, primary: "#e30a17", secondary: "#ffffff" },
  { id: "ucrania", name: "Ucrânia", demonym: "ucraniano", abbr: "UCR", confederation: "EUROPE", strength: 3, primary: "#0057b7", secondary: "#ffd700" },
  { id: "republica-tcheca", name: "República Tcheca", demonym: "tcheco", abbr: "TCH", confederation: "EUROPE", strength: 3, primary: "#d7141a", secondary: "#11457e" },
  { id: "escocia", name: "Escócia", demonym: "escocês", abbr: "ESC", confederation: "EUROPE", strength: 3, primary: "#0065bd", secondary: "#ffffff" },
  { id: "pais-de-gales", name: "País de Gales", demonym: "galês", abbr: "GAL", confederation: "EUROPE", strength: 3, primary: "#d30731", secondary: "#00ad36" },
  { id: "irlanda", name: "Irlanda", demonym: "irlandês", abbr: "IRL", confederation: "EUROPE", strength: 2, primary: "#169b62", secondary: "#ff883e" },
  { id: "grecia", name: "Grécia", demonym: "grego", abbr: "GRE", confederation: "EUROPE", strength: 2, primary: "#0d5eaf", secondary: "#ffffff" },
  { id: "romenia", name: "Romênia", demonym: "romeno", abbr: "ROM", confederation: "EUROPE", strength: 2, primary: "#002b7f", secondary: "#fcd116" },
  { id: "hungria", name: "Hungria", demonym: "húngaro", abbr: "HUN", confederation: "EUROPE", strength: 3, primary: "#ce2939", secondary: "#477050" },
  { id: "islandia", name: "Islândia", demonym: "islandês", abbr: "ISL", confederation: "EUROPE", strength: 2, primary: "#02529c", secondary: "#dc1e35" },
  { id: "georgia", name: "Geórgia", demonym: "georgiano", abbr: "GEO", confederation: "EUROPE", strength: 2, primary: "#ff0000", secondary: "#ffffff" },
  { id: "japao", name: "Japão", demonym: "japonês", abbr: "JAP", confederation: "ASIA", strength: 4, primary: "#ffffff", secondary: "#bc002d" },
  { id: "coreia-do-sul", name: "Coreia do Sul", demonym: "sul-coreano", abbr: "COR", confederation: "ASIA", strength: 4, primary: "#ffffff", secondary: "#cd2e3a" },
  { id: "uzbequistao", name: "Uzbequistão", demonym: "uzbeque", abbr: "UZB", confederation: "ASIA", strength: 2, primary: "#1eb53a", secondary: "#0099b5" },
  { id: "australia", name: "Austrália", demonym: "australiano", abbr: "AUS", confederation: "ASIA", strength: 3, primary: "#012169", secondary: "#ffcd00" },
  { id: "arabia-saudita", name: "Arábia Saudita", demonym: "saudita", abbr: "ARS", confederation: "ASIA", strength: 3, primary: "#006c35", secondary: "#ffffff" },
  { id: "ira", name: "Irã", demonym: "iraniano", abbr: "IRA", confederation: "ASIA", strength: 3, primary: "#239f40", secondary: "#da0000" },
  { id: "catar", name: "Catar", demonym: "catari", abbr: "CAT", confederation: "ASIA", strength: 2, primary: "#8a1538", secondary: "#ffffff" },
  { id: "iraque", name: "Iraque", demonym: "iraquiano", abbr: "IRQ", confederation: "ASIA", strength: 2, primary: "#ce1126", secondary: "#007a3d" },
  { id: "marrocos", name: "Marrocos", demonym: "marroquino", abbr: "MAR", confederation: "AFRICA", strength: 4, primary: "#c1272d", secondary: "#006233" },
  { id: "senegal", name: "Senegal", demonym: "senegalês", abbr: "SEN", confederation: "AFRICA", strength: 4, primary: "#00853f", secondary: "#fdef42" },
  { id: "nigeria", name: "Nigéria", demonym: "nigeriano", abbr: "NIG", confederation: "AFRICA", strength: 4, primary: "#008751", secondary: "#ffffff" },
  { id: "egito", name: "Egito", demonym: "egípcio", abbr: "EGI", confederation: "AFRICA", strength: 3, primary: "#ce1126", secondary: "#000000" },
  { id: "argelia", name: "Argélia", demonym: "argelino", abbr: "AGL", confederation: "AFRICA", strength: 3, primary: "#006233", secondary: "#d21034" },
  { id: "gana", name: "Gana", demonym: "ganês", abbr: "GAN", confederation: "AFRICA", strength: 3, primary: "#ce1126", secondary: "#fcd116" },
  { id: "costa-do-marfim", name: "Costa do Marfim", demonym: "marfinense", abbr: "CIV", confederation: "AFRICA", strength: 4, primary: "#f77f00", secondary: "#009e60" },
  { id: "africa-do-sul", name: "África do Sul", demonym: "sul-africano", abbr: "AFS", confederation: "AFRICA", strength: 2, primary: "#007749", secondary: "#ffb81c" },
  { id: "camaroes", name: "Camarões", demonym: "camaronês", abbr: "CAM", confederation: "AFRICA", strength: 3, primary: "#007a5e", secondary: "#ce1126" },
  { id: "tunisia", name: "Tunísia", demonym: "tunisiano", abbr: "TUN", confederation: "AFRICA", strength: 3, primary: "#e70013", secondary: "#ffffff" },
  { id: "mali", name: "Mali", demonym: "maliano", abbr: "MAL", confederation: "AFRICA", strength: 2, primary: "#14b53a", secondary: "#fcd116" },
  { id: "nova-zelandia", name: "Nova Zelândia", demonym: "neozelandês", abbr: "NZL", confederation: "OCEANIA", strength: 2, primary: "#00247d", secondary: "#ffffff" },
];

export function countryById(id: string): Country {
  return COUNTRIES.find((country) => country.id === id) ?? COUNTRIES[0];
}

// Ligas completas para mercado e carreira; força e prestígio determinam o peso de cada clube na simulação.
export const LEAGUES: League[] = [
  { id: "brasileirao", countryId: "brasil", name: "Brasileirão", cupName: "Copa do Brasil", prestige: 4, championsPlaces: 0, europaPlaces: 0, conferencePlaces: 0 },
  { id: "premier", countryId: "inglaterra", name: "Premier League", cupName: "FA Cup", prestige: 5, championsPlaces: 4, europaPlaces: 6, conferencePlaces: 8 },
  { id: "laliga", countryId: "espanha", name: "La Liga", cupName: "Copa del Rey", prestige: 5, championsPlaces: 4, europaPlaces: 6, conferencePlaces: 7 },
  { id: "seriea", countryId: "italia", name: "Serie A", cupName: "Coppa Italia", prestige: 4, championsPlaces: 4, europaPlaces: 6, conferencePlaces: 7 },
  { id: "bundesliga", countryId: "alemanha", name: "Bundesliga", cupName: "DFB-Pokal", prestige: 4, championsPlaces: 4, europaPlaces: 6, conferencePlaces: 7 },
  { id: "ligue1", countryId: "franca", name: "Ligue 1", cupName: "Coupe de France", prestige: 3, championsPlaces: 3, europaPlaces: 5, conferencePlaces: 6 },
  { id: "primeira", countryId: "portugal", name: "Primeira Liga", cupName: "Taça de Portugal", prestige: 3, championsPlaces: 2, europaPlaces: 4, conferencePlaces: 5 },
  { id: "eredivisie", countryId: "holanda", name: "Eredivisie", cupName: "KNVB Beker", prestige: 3, championsPlaces: 2, europaPlaces: 4, conferencePlaces: 5 },
  { id: "liga-argentina", countryId: "argentina", name: "Liga Profesional Argentina", cupName: "Copa Argentina", prestige: 3, championsPlaces: 0, europaPlaces: 0, conferencePlaces: 0 },
  { id: "liga-uruguaia", countryId: "uruguai", name: "Primera División Uruguaia", cupName: "Copa Uruguay", prestige: 2, championsPlaces: 0, europaPlaces: 0, conferencePlaces: 0 },
  { id: "liga-chilena", countryId: "chile", name: "Primera División de Chile", cupName: "Copa Chile", prestige: 2, championsPlaces: 0, europaPlaces: 0, conferencePlaces: 0 },
  { id: "liga-colombiana", countryId: "colombia", name: "Categoría Primera A", cupName: "Copa Colombia", prestige: 2, championsPlaces: 0, europaPlaces: 0, conferencePlaces: 0 },
  { id: "liga-paraguaia", countryId: "paraguai", name: "Primera División de Paraguay", cupName: "Copa Paraguay", prestige: 1, championsPlaces: 0, europaPlaces: 0, conferencePlaces: 0 },
  { id: "liga-equatoriana", countryId: "equador", name: "LigaPro Ecuador", cupName: "Copa Ecuador", prestige: 2, championsPlaces: 0, europaPlaces: 0, conferencePlaces: 0 },
  { id: "liga-peruana", countryId: "peru", name: "Liga 1 Perú", cupName: "Copa Bicentenario", prestige: 1, championsPlaces: 0, europaPlaces: 0, conferencePlaces: 0 },
  { id: "liga-mx", countryId: "mexico", name: "Liga MX", cupName: "Copa MX", prestige: 3, championsPlaces: 4, europaPlaces: 0, conferencePlaces: 0 },
  { id: "mls", countryId: "eua", name: "Major League Soccer", cupName: "US Open Cup", prestige: 2, championsPlaces: 3, europaPlaces: 0, conferencePlaces: 0 },
];

export function leagueById(id: string): League {
  return LEAGUES.find((league) => league.id === id) ?? LEAGUES[0];
}

// PARA ADICIONAR CLUBES MANUALMENTE: copie um objeto dentro da lista do país,
// use um `id` único e mantenha `countryId` e `leagueId` iguais aos IDs definidos acima.
// `reputation` vai de 1 a 5; `strength` ajusta a força esportiva (aprox. 55 a 90).
//
// Série A 2026, conforme a relação oficial da CBF. Os escudos serão substituídos
// por uma fonte de dados licenciada; nesta demo cada clube recebe um monograma.
const BRAZIL_CLUBS: Club[] = [
  { id: "athletico", name: "Athletico Paranaense", shortName: "Athletico-PR", abbr: "CAP", city: "Curitiba", state: "PR", countryId: "brasil", leagueId: "brasileirao", primary: "#d71920", secondary: "#111111", reputation: 4, strength: 76, academy: 4 },
  { id: "atletico-mg", name: "Atlético Mineiro", shortName: "Atlético-MG", abbr: "CAM", city: "Belo Horizonte", state: "MG", countryId: "brasil", leagueId: "brasileirao", primary: "#111111", secondary: "#f5f5f5", reputation: 4, strength: 82, academy: 4 },
  { id: "bahia", name: "Esporte Clube Bahia", shortName: "Bahia", abbr: "BAH", city: "Salvador", state: "BA", countryId: "brasil", leagueId: "brasileirao", primary: "#0057a8", secondary: "#e32636", reputation: 4, strength: 80, academy: 4 },
  { id: "botafogo", name: "Botafogo de Futebol e Regatas", shortName: "Botafogo", abbr: "BOT", city: "Rio de Janeiro", state: "RJ", countryId: "brasil", leagueId: "brasileirao", primary: "#111111", secondary: "#f5f5f5", reputation: 4, strength: 83, academy: 4 },
  { id: "chapecoense", name: "Associação Chapecoense de Futebol", shortName: "Chapecoense", abbr: "CHA", city: "Chapecó", state: "SC", countryId: "brasil", leagueId: "brasileirao", primary: "#08783e", secondary: "#f5f5f5", reputation: 2, strength: 68, academy: 3 },
  { id: "corinthians", name: "Sport Club Corinthians Paulista", shortName: "Corinthians", abbr: "COR", city: "São Paulo", state: "SP", countryId: "brasil", leagueId: "brasileirao", primary: "#111111", secondary: "#f5f5f5", reputation: 4, strength: 78, academy: 5 },
  { id: "coritiba", name: "Coritiba Foot Ball Club", shortName: "Coritiba", abbr: "CFC", city: "Curitiba", state: "PR", countryId: "brasil", leagueId: "brasileirao", primary: "#08783e", secondary: "#f5f5f5", reputation: 2, strength: 69, academy: 3 },
  { id: "cruzeiro", name: "Cruzeiro Esporte Clube", shortName: "Cruzeiro", abbr: "CRU", city: "Belo Horizonte", state: "MG", countryId: "brasil", leagueId: "brasileirao", primary: "#164194", secondary: "#f5f5f5", reputation: 4, strength: 81, academy: 5 },
  { id: "flamengo", name: "Clube de Regatas do Flamengo", shortName: "Flamengo", abbr: "FLA", city: "Rio de Janeiro", state: "RJ", countryId: "brasil", leagueId: "brasileirao", primary: "#d71920", secondary: "#111111", reputation: 5, strength: 88, academy: 5 },
  { id: "fluminense", name: "Fluminense Football Club", shortName: "Fluminense", abbr: "FLU", city: "Rio de Janeiro", state: "RJ", countryId: "brasil", leagueId: "brasileirao", primary: "#7a1538", secondary: "#007a4d", reputation: 4, strength: 79, academy: 5 },
  { id: "gremio", name: "Grêmio Foot-Ball Porto Alegrense", shortName: "Grêmio", abbr: "GRE", city: "Porto Alegre", state: "RS", countryId: "brasil", leagueId: "brasileirao", primary: "#2a9fd6", secondary: "#111111", reputation: 4, strength: 76, academy: 5 },
  { id: "internacional", name: "Sport Club Internacional", shortName: "Internacional", abbr: "INT", city: "Porto Alegre", state: "RS", countryId: "brasil", leagueId: "brasileirao", primary: "#d71920", secondary: "#f5f5f5", reputation: 4, strength: 78, academy: 5 },
  { id: "mirassol", name: "Mirassol Futebol Clube", shortName: "Mirassol", abbr: "MIR", city: "Mirassol", state: "SP", countryId: "brasil", leagueId: "brasileirao", primary: "#f2b705", secondary: "#0a7a3d", reputation: 3, strength: 74, academy: 3 },
  { id: "palmeiras", name: "Sociedade Esportiva Palmeiras", shortName: "Palmeiras", abbr: "PAL", city: "São Paulo", state: "SP", countryId: "brasil", leagueId: "brasileirao", primary: "#08783e", secondary: "#f5f5f5", reputation: 5, strength: 87, academy: 5 },
  { id: "bragantino", name: "Red Bull Bragantino", shortName: "Bragantino", abbr: "RBB", city: "Bragança Paulista", state: "SP", countryId: "brasil", leagueId: "brasileirao", primary: "#f5f5f5", secondary: "#d71920", reputation: 3, strength: 77, academy: 5 },
  { id: "remo", name: "Clube do Remo", shortName: "Remo", abbr: "REM", city: "Belém", state: "PA", countryId: "brasil", leagueId: "brasileirao", primary: "#162c6c", secondary: "#f5f5f5", reputation: 1, strength: 66, academy: 3 },
  { id: "santos", name: "Santos Futebol Clube", shortName: "Santos", abbr: "SAN", city: "Santos", state: "SP", countryId: "brasil", leagueId: "brasileirao", primary: "#f5f5f5", secondary: "#111111", reputation: 4, strength: 75, academy: 5 },
  { id: "sao-paulo", name: "São Paulo Futebol Clube", shortName: "São Paulo", abbr: "SAO", city: "São Paulo", state: "SP", countryId: "brasil", leagueId: "brasileirao", primary: "#f5f5f5", secondary: "#d71920", reputation: 4, strength: 78, academy: 5 },
  { id: "vasco", name: "Club de Regatas Vasco da Gama", shortName: "Vasco", abbr: "VAS", city: "Rio de Janeiro", state: "RJ", countryId: "brasil", leagueId: "brasileirao", primary: "#111111", secondary: "#f5f5f5", reputation: 3, strength: 74, academy: 5 },
  { id: "vitoria", name: "Esporte Clube Vitória", shortName: "Vitória", abbr: "VIT", city: "Salvador", state: "BA", countryId: "brasil", leagueId: "brasileirao", primary: "#d71920", secondary: "#111111", reputation: 3, strength: 72, academy: 4 },
];

// Clubes europeus: nomes reais, sem uso de logos — escudo é sempre o monograma tipográfico do clube.
const EUROPE_CLUBS: Club[] = [
  // Inglaterra — Premier League
  { id: "man-city", name: "Manchester City Football Club", shortName: "Manchester City", abbr: "MCI", city: "Manchester", countryId: "inglaterra", leagueId: "premier", primary: "#6cabe0", secondary: "#f5f5f5", reputation: 5, strength: 90 },
  { id: "liverpool", name: "Liverpool Football Club", shortName: "Liverpool", abbr: "LIV", city: "Liverpool", countryId: "inglaterra", leagueId: "premier", primary: "#d71920", secondary: "#f5f5f5", reputation: 5, strength: 89 },
  { id: "arsenal", name: "Arsenal Football Club", shortName: "Arsenal", abbr: "ARS", city: "Londres", countryId: "inglaterra", leagueId: "premier", primary: "#d71920", secondary: "#111111", reputation: 5, strength: 87 },
  { id: "man-utd", name: "Manchester United Football Club", shortName: "Manchester United", abbr: "MUN", city: "Manchester", countryId: "inglaterra", leagueId: "premier", primary: "#d71920", secondary: "#f2b705", reputation: 4, strength: 82 },
  { id: "chelsea", name: "Chelsea Football Club", shortName: "Chelsea", abbr: "CHE", city: "Londres", countryId: "inglaterra", leagueId: "premier", primary: "#274b9f", secondary: "#f5f5f5", reputation: 4, strength: 80 },
  { id: "tottenham", name: "Tottenham Hotspur Football Club", shortName: "Tottenham", abbr: "TOT", city: "Londres", countryId: "inglaterra", leagueId: "premier", primary: "#f5f5f5", secondary: "#111111", reputation: 4, strength: 79 },
  { id: "newcastle", name: "Newcastle United Football Club", shortName: "Newcastle", abbr: "NEW", city: "Newcastle", countryId: "inglaterra", leagueId: "premier", primary: "#111111", secondary: "#f5f5f5", reputation: 3, strength: 76 },
  { id: "aston-villa", name: "Aston Villa Football Club", shortName: "Aston Villa", abbr: "AVL", city: "Birmingham", countryId: "inglaterra", leagueId: "premier", primary: "#7a1538", secondary: "#4a9fd6", reputation: 3, strength: 75 },
  { id: "everton", name: "Everton Football Club", shortName: "Everton", abbr: "EVE", city: "Liverpool", countryId: "inglaterra", leagueId: "premier", primary: "#274b9f", secondary: "#f5f5f5", reputation: 2, strength: 70 },
  { id: "crystal-palace", name: "Crystal Palace Football Club", shortName: "Crystal Palace", abbr: "CRY", city: "Londres", countryId: "inglaterra", leagueId: "premier", primary: "#274b9f", secondary: "#d71920", reputation: 2, strength: 72 },
  { id: "brentford", name: "Brentford Football Club", shortName: "Brentford", abbr: "BRE", city: "Londres", countryId: "inglaterra", leagueId: "premier", primary: "#d71920", secondary: "#f5f5f5", reputation: 2, strength: 71 },
  { id: "brighton", name: "Brighton & Hove Albion Football Club", shortName: "Brighton", abbr: "BHA", city: "Brighton", countryId: "inglaterra", leagueId: "premier", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 2, strength: 72 },
  { id: "fulham", name: "Fulham Football Club", shortName: "Fulham", abbr: "FUL", city: "Londres", countryId: "inglaterra", leagueId: "premier", primary: "#f5f5f5", secondary: "#111111", reputation: 2, strength: 69 },
  { id: "wolves", name: "Wolverhampton Wanderers Football Club", shortName: "Wolverhampton", abbr: "WOL", city: "Wolverhampton", countryId: "inglaterra", leagueId: "premier", primary: "#f2b705", secondary: "#111111", reputation: 1, strength: 66 },
  { id: "bournemouth", name: "AFC Bournemouth", shortName: "Bournemouth", abbr: "BOU", city: "Bournemouth", countryId: "inglaterra", leagueId: "premier", primary: "#d71920", secondary: "#111111", reputation: 2, strength: 71 },
  { id: "leeds", name: "Leeds United Football Club", shortName: "Leeds United", abbr: "LEE", city: "Leeds", countryId: "inglaterra", leagueId: "premier", primary: "#f5f5f5", secondary: "#274b9f", reputation: 2, strength: 68 },
  { id: "nottingham-forest", name: "Nottingham Forest Football Club", shortName: "Nottingham Forest", abbr: "NFO", city: "Nottingham", countryId: "inglaterra", leagueId: "premier", primary: "#d71920", secondary: "#f5f5f5", reputation: 2, strength: 69 },
  { id: "sunderland", name: "Sunderland Association Football Club", shortName: "Sunderland", abbr: "SUN", city: "Sunderland", countryId: "inglaterra", leagueId: "premier", primary: "#d71920", secondary: "#f5f5f5", reputation: 1, strength: 62 },
  { id: "ipswich", name: "Ipswich Town Football Club", shortName: "Ipswich Town", abbr: "ITW", city: "Ipswich", countryId: "inglaterra", leagueId: "premier", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 1, strength: 60 },
  { id: "coventry", name: "Coventry City Football Club", shortName: "Coventry City", abbr: "COV", city: "Coventry", countryId: "inglaterra", leagueId: "premier", primary: "#4a9fd6", secondary: "#f2b705", reputation: 1, strength: 58 },
  { id: "hull", name: "Hull City Association Football Club", shortName: "Hull City", abbr: "HUL", city: "Hull", countryId: "inglaterra", leagueId: "premier", primary: "#f2b705", secondary: "#111111", reputation: 1, strength: 57 },
  // Espanha — La Liga
  { id: "real-madrid", name: "Real Madrid Club de Fútbol", shortName: "Real Madrid", abbr: "RMA", city: "Madri", countryId: "espanha", leagueId: "laliga", primary: "#f5f5f5", secondary: "#f2b705", reputation: 5, strength: 90 },
  { id: "barcelona", name: "Futbol Club Barcelona", shortName: "Barcelona", abbr: "BAR", city: "Barcelona", countryId: "espanha", leagueId: "laliga", primary: "#274b9f", secondary: "#d71920", reputation: 5, strength: 89 },
  { id: "atletico-madrid", name: "Club Atlético de Madrid", shortName: "Atlético de Madrid", abbr: "ATM", city: "Madri", countryId: "espanha", leagueId: "laliga", primary: "#d71920", secondary: "#274b9f", reputation: 4, strength: 83 },
  { id: "real-sociedad", name: "Real Sociedad de Fútbol", shortName: "Real Sociedad", abbr: "RSO", city: "San Sebastián", countryId: "espanha", leagueId: "laliga", primary: "#111111", secondary: "#4a9fd6", reputation: 3, strength: 74 },
  { id: "sevilla", name: "Sevilla Fútbol Club", shortName: "Sevilla", abbr: "SEV", city: "Sevilha", countryId: "espanha", leagueId: "laliga", primary: "#f5f5f5", secondary: "#d71920", reputation: 3, strength: 73 },
  { id: "athletic-bilbao", name: "Athletic Club", shortName: "Athletic Bilbao", abbr: "ATH", city: "Bilbao", countryId: "espanha", leagueId: "laliga", primary: "#d71920", secondary: "#f5f5f5", reputation: 3, strength: 75 },
  { id: "real-betis", name: "Real Betis Balompié", shortName: "Real Betis", abbr: "BET", city: "Sevilha", countryId: "espanha", leagueId: "laliga", primary: "#08783e", secondary: "#f5f5f5", reputation: 3, strength: 72 },
  { id: "villarreal", name: "Villarreal Club de Fútbol", shortName: "Villarreal", abbr: "VIL", city: "Vila-real", countryId: "espanha", leagueId: "laliga", primary: "#f2b705", secondary: "#274b9f", reputation: 2, strength: 71 },
  { id: "celta-vigo", name: "Real Club Celta de Vigo", shortName: "Celta de Vigo", abbr: "CEL", city: "Vigo", countryId: "espanha", leagueId: "laliga", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 2, strength: 67 },
  { id: "getafe", name: "Getafe Club de Fútbol", shortName: "Getafe", abbr: "GET", city: "Getafe", countryId: "espanha", leagueId: "laliga", primary: "#274b9f", secondary: "#f5f5f5", reputation: 1, strength: 64 },
  { id: "osasuna", name: "Club Atlético Osasuna", shortName: "Osasuna", abbr: "OSA", city: "Pamplona", countryId: "espanha", leagueId: "laliga", primary: "#d71920", secondary: "#274b9f", reputation: 1, strength: 65 },
  { id: "mallorca", name: "Real Club Deportivo Mallorca", shortName: "Mallorca", abbr: "MLL", city: "Palma", countryId: "espanha", leagueId: "laliga", primary: "#d71920", secondary: "#111111", reputation: 1, strength: 63 },
  { id: "valencia", name: "Valencia Club de Fútbol", shortName: "Valencia", abbr: "VAL", city: "Valência", countryId: "espanha", leagueId: "laliga", primary: "#f5f5f5", secondary: "#f2b705", reputation: 3, strength: 74 },
  { id: "espanyol", name: "Reial Club Deportiu Espanyol de Barcelona", shortName: "Espanyol", abbr: "ESP", city: "Barcelona", countryId: "espanha", leagueId: "laliga", primary: "#274b9f", secondary: "#f5f5f5", reputation: 2, strength: 68 },
  { id: "rayo-vallecano", name: "Rayo Vallecano de Madrid", shortName: "Rayo Vallecano", abbr: "RAY", city: "Madri", countryId: "espanha", leagueId: "laliga", primary: "#d71920", secondary: "#f5f5f5", reputation: 2, strength: 66 },
  { id: "deportivo-coruna", name: "Real Club Deportivo de La Coruña", shortName: "Deportivo La Coruña", abbr: "DEP", city: "A Coruña", countryId: "espanha", leagueId: "laliga", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 2, strength: 63 },
  { id: "alaves", name: "Deportivo Alavés", shortName: "Alavés", abbr: "ALA", city: "Vitória-Gasteiz", countryId: "espanha", leagueId: "laliga", primary: "#274b9f", secondary: "#f5f5f5", reputation: 1, strength: 62 },
  { id: "levante", name: "Levante Unión Deportiva", shortName: "Levante", abbr: "LEV", city: "Valência", countryId: "espanha", leagueId: "laliga", primary: "#6cabe0", secondary: "#f2b705", reputation: 1, strength: 60 },
  { id: "elche", name: "Elche Club de Fútbol", shortName: "Elche", abbr: "ELX", city: "Elche", countryId: "espanha", leagueId: "laliga", primary: "#08783e", secondary: "#f5f5f5", reputation: 1, strength: 59 },
  { id: "malaga", name: "Málaga Club de Fútbol", shortName: "Málaga", abbr: "MAL", city: "Málaga", countryId: "espanha", leagueId: "laliga", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 1, strength: 58 },
  { id: "racing-santander", name: "Real Racing Club de Santander", shortName: "Racing de Santander", abbr: "RAC", city: "Santander", countryId: "espanha", leagueId: "laliga", primary: "#111111", secondary: "#f5f5f5", reputation: 1, strength: 57 },
  // Itália — Serie A
  { id: "inter", name: "Football Club Internazionale Milano", shortName: "Inter de Milão", abbr: "IMI", city: "Milão", countryId: "italia", leagueId: "seriea", primary: "#274b9f", secondary: "#111111", reputation: 5, strength: 88 },
  { id: "milan", name: "Associazione Calcio Milan", shortName: "Milan", abbr: "MIL", city: "Milão", countryId: "italia", leagueId: "seriea", primary: "#d71920", secondary: "#111111", reputation: 4, strength: 81 },
  { id: "juventus", name: "Juventus Football Club", shortName: "Juventus", abbr: "JUV", city: "Turim", countryId: "italia", leagueId: "seriea", primary: "#111111", secondary: "#f5f5f5", reputation: 4, strength: 82 },
  { id: "napoli", name: "Società Sportiva Calcio Napoli", shortName: "Napoli", abbr: "NAP", city: "Nápoles", countryId: "italia", leagueId: "seriea", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 4, strength: 80 },
  { id: "roma", name: "Associazione Sportiva Roma", shortName: "Roma", abbr: "ROM", city: "Roma", countryId: "italia", leagueId: "seriea", primary: "#7a1538", secondary: "#f2b705", reputation: 3, strength: 75 },
  { id: "atalanta", name: "Atalanta Bergamasca Calcio", shortName: "Atalanta", abbr: "ATA", city: "Bérgamo", countryId: "italia", leagueId: "seriea", primary: "#111111", secondary: "#4a9fd6", reputation: 3, strength: 76 },
  { id: "lazio", name: "Società Sportiva Lazio", shortName: "Lazio", abbr: "LAZ", city: "Roma", countryId: "italia", leagueId: "seriea", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 3, strength: 72 },
  { id: "fiorentina", name: "ACF Fiorentina", shortName: "Fiorentina", abbr: "FIO", city: "Florença", countryId: "italia", leagueId: "seriea", primary: "#6f42a1", secondary: "#f5f5f5", reputation: 2, strength: 70 },
  { id: "bologna", name: "Bologna Football Club 1909", shortName: "Bologna", abbr: "BOL", city: "Bolonha", countryId: "italia", leagueId: "seriea", primary: "#274b9f", secondary: "#d71920", reputation: 2, strength: 69 },
  { id: "torino", name: "Torino Football Club", shortName: "Torino", abbr: "TOR", city: "Turim", countryId: "italia", leagueId: "seriea", primary: "#7a1538", secondary: "#f5f5f5", reputation: 2, strength: 67 },
  { id: "genoa", name: "Genoa Cricket and Football Club", shortName: "Genoa", abbr: "GEN", city: "Gênova", countryId: "italia", leagueId: "seriea", primary: "#274b9f", secondary: "#d71920", reputation: 1, strength: 64 },
  { id: "udinese", name: "Udinese Calcio", shortName: "Udinese", abbr: "UDI", city: "Údine", countryId: "italia", leagueId: "seriea", primary: "#111111", secondary: "#f5f5f5", reputation: 1, strength: 62 },
  { id: "parma", name: "Parma Calcio 1913", shortName: "Parma", abbr: "PAR", city: "Parma", countryId: "italia", leagueId: "seriea", primary: "#f2b705", secondary: "#274b9f", reputation: 2, strength: 65 },
  { id: "cagliari", name: "Cagliari Calcio", shortName: "Cagliari", abbr: "CAG", city: "Cagliari", countryId: "italia", leagueId: "seriea", primary: "#7a1538", secondary: "#4a9fd6", reputation: 2, strength: 64 },
  { id: "lecce", name: "Unione Sportiva Lecce", shortName: "Lecce", abbr: "LEC", city: "Lecce", countryId: "italia", leagueId: "seriea", primary: "#f2b705", secondary: "#d71920", reputation: 1, strength: 62 },
  { id: "sassuolo", name: "Unione Sportiva Sassuolo Calcio", shortName: "Sassuolo", abbr: "SAS", city: "Sassuolo", countryId: "italia", leagueId: "seriea", primary: "#6cabe0", secondary: "#111111", reputation: 1, strength: 63 },
  { id: "monza", name: "Associazione Calcio Monza", shortName: "Monza", abbr: "MON", city: "Monza", countryId: "italia", leagueId: "seriea", primary: "#d71920", secondary: "#f5f5f5", reputation: 1, strength: 61 },
  { id: "venezia", name: "Venezia Football Club", shortName: "Venezia", abbr: "VEN", city: "Veneza", countryId: "italia", leagueId: "seriea", primary: "#111111", secondary: "#f2b705", reputation: 1, strength: 60 },
  { id: "como", name: "Como 1907", shortName: "Como", abbr: "COM", city: "Como", countryId: "italia", leagueId: "seriea", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 1, strength: 59 },
  { id: "frosinone", name: "Frosinone Calcio", shortName: "Frosinone", abbr: "FRO", city: "Frosinone", countryId: "italia", leagueId: "seriea", primary: "#f2b705", secondary: "#274b9f", reputation: 1, strength: 58 },
  // Alemanha — Bundesliga
  { id: "bayern", name: "Fußball-Club Bayern München", shortName: "Bayern de Munique", abbr: "BAY", city: "Munique", countryId: "alemanha", leagueId: "bundesliga", primary: "#d71920", secondary: "#f5f5f5", reputation: 5, strength: 90 },
  { id: "dortmund", name: "Borussia Dortmund", shortName: "Borussia Dortmund", abbr: "BVB", city: "Dortmund", countryId: "alemanha", leagueId: "bundesliga", primary: "#f2b705", secondary: "#111111", reputation: 4, strength: 82 },
  { id: "leipzig", name: "RasenBallsport Leipzig", shortName: "RB Leipzig", abbr: "RBL", city: "Leipzig", countryId: "alemanha", leagueId: "bundesliga", primary: "#f5f5f5", secondary: "#111111", reputation: 4, strength: 81 },
  { id: "leverkusen", name: "Bayer 04 Leverkusen", shortName: "Bayer Leverkusen", abbr: "B04", city: "Leverkusen", countryId: "alemanha", leagueId: "bundesliga", primary: "#d71920", secondary: "#111111", reputation: 4, strength: 83 },
  { id: "frankfurt", name: "Eintracht Frankfurt", shortName: "Eintracht Frankfurt", abbr: "SGE", city: "Frankfurt", countryId: "alemanha", leagueId: "bundesliga", primary: "#111111", secondary: "#d71920", reputation: 3, strength: 74 },
  { id: "stuttgart", name: "Verein für Bewegungsspiele Stuttgart", shortName: "VfB Stuttgart", abbr: "VFB", city: "Stuttgart", countryId: "alemanha", leagueId: "bundesliga", primary: "#f5f5f5", secondary: "#d71920", reputation: 3, strength: 73 },
  { id: "freiburg", name: "Sport-Club Freiburg", shortName: "Freiburg", abbr: "SCF", city: "Freiburg", countryId: "alemanha", leagueId: "bundesliga", primary: "#111111", secondary: "#d71920", reputation: 2, strength: 69 },
  { id: "werder-bremen", name: "Sportverein Werder Bremen", shortName: "Werder Bremen", abbr: "SVW", city: "Bremen", countryId: "alemanha", leagueId: "bundesliga", primary: "#08783e", secondary: "#f5f5f5", reputation: 2, strength: 67 },
  { id: "mainz", name: "1. Fußball- und Sportverein Mainz 05", shortName: "Mainz 05", abbr: "M05", city: "Mainz", countryId: "alemanha", leagueId: "bundesliga", primary: "#d71920", secondary: "#f5f5f5", reputation: 1, strength: 64 },
  { id: "augsburg", name: "Fußball-Club Augsburg", shortName: "Augsburg", abbr: "FCA", city: "Augsburg", countryId: "alemanha", leagueId: "bundesliga", primary: "#d71920", secondary: "#08783e", reputation: 1, strength: 62 },
  { id: "wolfsburg", name: "Verein für Leibesübungen Wolfsburg", shortName: "Wolfsburg", abbr: "WOB", city: "Wolfsburg", countryId: "alemanha", leagueId: "bundesliga", primary: "#63e36b", secondary: "#f5f5f5", reputation: 2, strength: 66 },
  { id: "hoffenheim", name: "Turn- und Sportgemeinschaft 1899 Hoffenheim", shortName: "Hoffenheim", abbr: "TSG", city: "Sinsheim", countryId: "alemanha", leagueId: "bundesliga", primary: "#274b9f", secondary: "#f5f5f5", reputation: 1, strength: 61 },
  { id: "gladbach", name: "Borussia Verein für Leibesübungen Mönchengladbach", shortName: "Borussia Mönchengladbach", abbr: "BMG", city: "Mönchengladbach", countryId: "alemanha", leagueId: "bundesliga", primary: "#111111", secondary: "#f5f5f5", reputation: 3, strength: 72 },
  { id: "union-berlin", name: "1. Fußballclub Union Berlin", shortName: "Union Berlin", abbr: "FCU", city: "Berlim", countryId: "alemanha", leagueId: "bundesliga", primary: "#d71920", secondary: "#f2b705", reputation: 2, strength: 68 },
  { id: "hamburger-sv", name: "Hamburger Sport-Verein", shortName: "Hamburger SV", abbr: "HSV", city: "Hamburgo", countryId: "alemanha", leagueId: "bundesliga", primary: "#4a9fd6", secondary: "#111111", reputation: 2, strength: 66 },
  { id: "koln", name: "1. Fußball-Club Köln", shortName: "1. FC Köln", abbr: "KOE", city: "Colônia", countryId: "alemanha", leagueId: "bundesliga", primary: "#f5f5f5", secondary: "#d71920", reputation: 2, strength: 65 },
  { id: "schalke", name: "Fußballclub Gelsenkirchen-Schalke 04", shortName: "Schalke 04", abbr: "S04", city: "Gelsenkirchen", countryId: "alemanha", leagueId: "bundesliga", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 2, strength: 64 },
  { id: "paderborn", name: "Sport-Club Paderborn 07", shortName: "SC Paderborn 07", abbr: "SCP", city: "Paderborn", countryId: "alemanha", leagueId: "bundesliga", primary: "#274b9f", secondary: "#111111", reputation: 1, strength: 58 },
  { id: "elversberg", name: "Sportverein 07 Elversberg", shortName: "SV Elversberg", abbr: "SVE", city: "Elversberg", countryId: "alemanha", leagueId: "bundesliga", primary: "#111111", secondary: "#f2b705", reputation: 1, strength: 57 },
  // França — Ligue 1
  { id: "psg", name: "Paris Saint-Germain Football Club", shortName: "Paris Saint-Germain", abbr: "PSG", city: "Paris", countryId: "franca", leagueId: "ligue1", primary: "#274b9f", secondary: "#d71920", reputation: 5, strength: 90 },
  { id: "marseille", name: "Olympique de Marseille", shortName: "Olympique de Marselha", abbr: "OM", city: "Marselha", countryId: "franca", leagueId: "ligue1", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 3, strength: 75 },
  { id: "lyon", name: "Olympique Lyonnais", shortName: "Olympique de Lyon", abbr: "OL", city: "Lyon", countryId: "franca", leagueId: "ligue1", primary: "#274b9f", secondary: "#d71920", reputation: 3, strength: 74 },
  { id: "monaco", name: "Association Sportive de Monaco", shortName: "AS Monaco", abbr: "ASM", city: "Mônaco", countryId: "franca", leagueId: "ligue1", primary: "#d71920", secondary: "#f5f5f5", reputation: 3, strength: 76 },
  { id: "lille", name: "Lille Olympique Sporting Club", shortName: "Lille", abbr: "LIL", city: "Lille", countryId: "franca", leagueId: "ligue1", primary: "#d71920", secondary: "#4a9fd6", reputation: 3, strength: 73 },
  { id: "nice", name: "Olympique Gymnaste Club Nice", shortName: "Nice", abbr: "NIC", city: "Nice", countryId: "franca", leagueId: "ligue1", primary: "#111111", secondary: "#d71920", reputation: 2, strength: 70 },
  { id: "lens", name: "Racing Club de Lens", shortName: "Lens", abbr: "RCL", city: "Lens", countryId: "franca", leagueId: "ligue1", primary: "#f2b705", secondary: "#d71920", reputation: 2, strength: 69 },
  { id: "rennes", name: "Stade Rennais Football Club", shortName: "Rennes", abbr: "REN", city: "Rennes", countryId: "franca", leagueId: "ligue1", primary: "#d71920", secondary: "#111111", reputation: 2, strength: 67 },
  { id: "strasbourg", name: "Racing Club de Strasbourg Alsace", shortName: "Strasbourg", abbr: "RCS", city: "Estrasburgo", countryId: "franca", leagueId: "ligue1", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 1, strength: 64 },
  { id: "nantes", name: "Football Club de Nantes", shortName: "Nantes", abbr: "NAN", city: "Nantes", countryId: "franca", leagueId: "ligue1", primary: "#f2b705", secondary: "#08783e", reputation: 1, strength: 62 },
  { id: "toulouse", name: "Toulouse Football Club", shortName: "Toulouse", abbr: "TFC", city: "Toulouse", countryId: "franca", leagueId: "ligue1", primary: "#6f42a1", secondary: "#f5f5f5", reputation: 1, strength: 61 },
  { id: "brest", name: "Stade Brestois 29", shortName: "Brest", abbr: "BRE", city: "Brest", countryId: "franca", leagueId: "ligue1", primary: "#d71920", secondary: "#f5f5f5", reputation: 1, strength: 60 },
  { id: "paris-fc", name: "Paris Football Club", shortName: "Paris FC", abbr: "PFC", city: "Paris", countryId: "franca", leagueId: "ligue1", primary: "#111111", secondary: "#4a9fd6", reputation: 1, strength: 62 },
  { id: "lorient", name: "Football Club Lorient", shortName: "Lorient", abbr: "LOR", city: "Lorient", countryId: "franca", leagueId: "ligue1", primary: "#f2b705", secondary: "#d71920", reputation: 1, strength: 61 },
  { id: "angers", name: "Angers Sporting Club de l'Ouest", shortName: "Angers SCO", abbr: "SCO", city: "Angers", countryId: "franca", leagueId: "ligue1", primary: "#111111", secondary: "#f5f5f5", reputation: 1, strength: 60 },
  { id: "auxerre", name: "Association de la Jeunesse Auxerroise", shortName: "AJ Auxerre", abbr: "AUX", city: "Auxerre", countryId: "franca", leagueId: "ligue1", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 1, strength: 59 },
  { id: "le-havre", name: "Le Havre Athletic Club", shortName: "Le Havre AC", abbr: "LEH", city: "Le Havre", countryId: "franca", leagueId: "ligue1", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 1, strength: 58 },
  { id: "troyes", name: "Espérance Sportive Troyes Aube Champagne", shortName: "ESTAC Troyes", abbr: "TRO", city: "Troyes", countryId: "franca", leagueId: "ligue1", primary: "#274b9f", secondary: "#f2b705", reputation: 1, strength: 57 },
  { id: "le-mans", name: "Le Mans Football Club", shortName: "Le Mans FC", abbr: "LEM", city: "Le Mans", countryId: "franca", leagueId: "ligue1", primary: "#f5f5f5", secondary: "#274b9f", reputation: 1, strength: 56 },
  // Portugal — Primeira Liga
  { id: "benfica", name: "Sport Lisboa e Benfica", shortName: "Benfica", abbr: "BEN", city: "Lisboa", countryId: "portugal", leagueId: "primeira", primary: "#d71920", secondary: "#f5f5f5", reputation: 4, strength: 84 },
  { id: "porto", name: "Futebol Clube do Porto", shortName: "Porto", abbr: "FCP", city: "Porto", countryId: "portugal", leagueId: "primeira", primary: "#4a9fd6", secondary: "#111111", reputation: 4, strength: 83 },
  { id: "sporting", name: "Sporting Clube de Portugal", shortName: "Sporting", abbr: "SCP", city: "Lisboa", countryId: "portugal", leagueId: "primeira", primary: "#08783e", secondary: "#f5f5f5", reputation: 4, strength: 82 },
  { id: "braga", name: "Sporting Clube de Braga", shortName: "Braga", abbr: "SCB", city: "Braga", countryId: "portugal", leagueId: "primeira", primary: "#d71920", secondary: "#f5f5f5", reputation: 3, strength: 76 },
  { id: "vitoria-guimaraes", name: "Vitória Sport Clube", shortName: "Vitória de Guimarães", abbr: "VSC", city: "Guimarães", countryId: "portugal", leagueId: "primeira", primary: "#f5f5f5", secondary: "#111111", reputation: 2, strength: 68 },
  { id: "famalicao", name: "Futebol Clube de Famalicão", shortName: "Famalicão", abbr: "FAM", city: "Vila Nova de Famalicão", countryId: "portugal", leagueId: "primeira", primary: "#274b9f", secondary: "#f5f5f5", reputation: 2, strength: 65 },
  { id: "rio-ave", name: "Rio Ave Futebol Clube", shortName: "Rio Ave", abbr: "RIO", city: "Vila do Conde", countryId: "portugal", leagueId: "primeira", primary: "#08783e", secondary: "#f5f5f5", reputation: 1, strength: 61 },
  { id: "moreirense", name: "Moreirense Futebol Clube", shortName: "Moreirense", abbr: "MOR", city: "Moreira de Cónegos", countryId: "portugal", leagueId: "primeira", primary: "#08783e", secondary: "#f5f5f5", reputation: 1, strength: 62 },
  { id: "estoril", name: "Grupo Desportivo Estoril Praia", shortName: "Estoril", abbr: "EST", city: "Estoril", countryId: "portugal", leagueId: "primeira", primary: "#f2b705", secondary: "#274b9f", reputation: 1, strength: 60 },
  { id: "casa-pia", name: "Casa Pia Atlético Clube", shortName: "Casa Pia", abbr: "CAP", city: "Lisboa", countryId: "portugal", leagueId: "primeira", primary: "#111111", secondary: "#f5f5f5", reputation: 1, strength: 59 },
  { id: "arouca", name: "Futebol Clube de Arouca", shortName: "Arouca", abbr: "ARO", city: "Arouca", countryId: "portugal", leagueId: "primeira", primary: "#f2b705", secondary: "#274b9f", reputation: 1, strength: 60 },
  { id: "gil-vicente", name: "Gil Vicente Futebol Clube", shortName: "Gil Vicente", abbr: "GIL", city: "Barcelos", countryId: "portugal", leagueId: "primeira", primary: "#d71920", secondary: "#274b9f", reputation: 1, strength: 58 },
  { id: "maritimo", name: "Club Sport Marítimo", shortName: "Marítimo", abbr: "MAR", city: "Funchal", countryId: "portugal", leagueId: "primeira", primary: "#08783e", secondary: "#d71920", reputation: 1, strength: 58 },
  { id: "santa-clara", name: "Clube Desportivo Santa Clara", shortName: "Santa Clara", abbr: "SCL", city: "Ponta Delgada", countryId: "portugal", leagueId: "primeira", primary: "#f2b705", secondary: "#111111", reputation: 1, strength: 58 },
  { id: "estrela-amadora", name: "Clube de Futebol Estrela da Amadora", shortName: "Estrela da Amadora", abbr: "EAM", city: "Amadora", countryId: "portugal", leagueId: "primeira", primary: "#4a9fd6", secondary: "#d71920", reputation: 1, strength: 56 },
  { id: "alverca", name: "Futebol Clube de Alverca", shortName: "FC Alverca", abbr: "ALV", city: "Alverca do Ribatejo", countryId: "portugal", leagueId: "primeira", primary: "#f5f5f5", secondary: "#111111", reputation: 1, strength: 57 },
  { id: "nacional-madeira", name: "Clube Desportivo Nacional", shortName: "Nacional da Madeira", abbr: "NAC", city: "Funchal", countryId: "portugal", leagueId: "primeira", primary: "#111111", secondary: "#f2b705", reputation: 1, strength: 57 },
  { id: "academico-viseu", name: "Académico de Viseu Futebol Clube", shortName: "Académico de Viseu", abbr: "AVI", city: "Viseu", countryId: "portugal", leagueId: "primeira", primary: "#08783e", secondary: "#f5f5f5", reputation: 1, strength: 56 },
  // Holanda — Eredivisie
  { id: "ajax", name: "Amsterdamsche Football Club Ajax", shortName: "Ajax", abbr: "AJA", city: "Amsterdã", countryId: "holanda", leagueId: "eredivisie", primary: "#f5f5f5", secondary: "#d71920", reputation: 3, strength: 77 },
  { id: "psv", name: "Philips Sport Vereniging", shortName: "PSV Eindhoven", abbr: "PSV", city: "Eindhoven", countryId: "holanda", leagueId: "eredivisie", primary: "#d71920", secondary: "#f5f5f5", reputation: 3, strength: 78 },
  { id: "feyenoord", name: "Feyenoord Rotterdam", shortName: "Feyenoord", abbr: "FEY", city: "Roterdã", countryId: "holanda", leagueId: "eredivisie", primary: "#d71920", secondary: "#f5f5f5", reputation: 3, strength: 76 },
  { id: "az-alkmaar", name: "Alkmaar Zaanstreek", shortName: "AZ Alkmaar", abbr: "AZ", city: "Alkmaar", countryId: "holanda", leagueId: "eredivisie", primary: "#d71920", secondary: "#f5f5f5", reputation: 2, strength: 69 },
  { id: "utrecht", name: "Football Club Utrecht", shortName: "FC Utrecht", abbr: "UTR", city: "Utrecht", countryId: "holanda", leagueId: "eredivisie", primary: "#d71920", secondary: "#f5f5f5", reputation: 2, strength: 66 },
  { id: "twente", name: "Football Club Twente", shortName: "FC Twente", abbr: "TWE", city: "Enschede", countryId: "holanda", leagueId: "eredivisie", primary: "#d71920", secondary: "#f5f5f5", reputation: 2, strength: 67 },
  { id: "heerenveen", name: "Sportclub Heerenveen", shortName: "Heerenveen", abbr: "HEE", city: "Heerenveen", countryId: "holanda", leagueId: "eredivisie", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 1, strength: 61 },
  { id: "groningen", name: "Football Club Groningen", shortName: "Groningen", abbr: "GRO", city: "Groningen", countryId: "holanda", leagueId: "eredivisie", primary: "#08783e", secondary: "#f5f5f5", reputation: 1, strength: 60 },
  { id: "sparta-rotterdam", name: "Sparta Rotterdam", shortName: "Sparta Rotterdam", abbr: "SPA", city: "Roterdã", countryId: "holanda", leagueId: "eredivisie", primary: "#d71920", secondary: "#f5f5f5", reputation: 1, strength: 60 },
  { id: "nec-nijmegen", name: "Nijmegen Eendracht Combinatie", shortName: "NEC Nijmegen", abbr: "NEC", city: "Nijmegen", countryId: "holanda", leagueId: "eredivisie", primary: "#d71920", secondary: "#08783e", reputation: 1, strength: 59 },
  { id: "go-ahead-eagles", name: "Go Ahead Eagles", shortName: "Go Ahead Eagles", abbr: "GAE", city: "Deventer", countryId: "holanda", leagueId: "eredivisie", primary: "#d71920", secondary: "#f2b705", reputation: 1, strength: 58 },
  { id: "fortuna-sittard", name: "Fortuna Sittard", shortName: "Fortuna Sittard", abbr: "FOR", city: "Sittard", countryId: "holanda", leagueId: "eredivisie", primary: "#f2b705", secondary: "#08783e", reputation: 1, strength: 57 },
  { id: "willem-ii", name: "Willem II Tilburg", shortName: "Willem II", abbr: "WII", city: "Tilburg", countryId: "holanda", leagueId: "eredivisie", primary: "#d71920", secondary: "#111111", reputation: 1, strength: 59 },
  { id: "pec-zwolle", name: "Prins Hendrik Eendracht Combinatie Zwolle", shortName: "PEC Zwolle", abbr: "PEC", city: "Zwolle", countryId: "holanda", leagueId: "eredivisie", primary: "#4a9fd6", secondary: "#111111", reputation: 1, strength: 58 },
  { id: "cambuur", name: "Sportclub Cambuur Leeuwarden", shortName: "SC Cambuur", abbr: "CAM", city: "Leeuwarden", countryId: "holanda", leagueId: "eredivisie", primary: "#4a9fd6", secondary: "#f2b705", reputation: 1, strength: 57 },
  { id: "excelsior", name: "Excelsior Rotterdam", shortName: "Excelsior", abbr: "EXC", city: "Roterdã", countryId: "holanda", leagueId: "eredivisie", primary: "#d71920", secondary: "#111111", reputation: 1, strength: 58 },
  { id: "ado-den-haag", name: "Alles Door Oefening Den Haag", shortName: "ADO Den Haag", abbr: "ADO", city: "Haia", countryId: "holanda", leagueId: "eredivisie", primary: "#f2b705", secondary: "#08783e", reputation: 1, strength: 57 },
  { id: "telstar", name: "Sportclub Telstar", shortName: "Telstar", abbr: "TEL", city: "Velsen-Zuid", countryId: "holanda", leagueId: "eredivisie", primary: "#f2b705", secondary: "#111111", reputation: 1, strength: 56 },
];

// Clubes sul-americanos fora do Brasil: elegíveis à Libertadores conforme campanha nacional.
const ARGENTINA_CLUBS: Club[] = [
  { id: "boca-juniors", name: "Club Atlético Boca Juniors", shortName: "Boca Juniors", abbr: "BOC", city: "Buenos Aires", countryId: "argentina", leagueId: "liga-argentina", primary: "#0f4a94", secondary: "#f2b705", reputation: 5, strength: 82 },
  { id: "river-plate", name: "Club Atlético River Plate", shortName: "River Plate", abbr: "RIV", city: "Buenos Aires", countryId: "argentina", leagueId: "liga-argentina", primary: "#f5f5f5", secondary: "#d71920", reputation: 5, strength: 83 },
  { id: "racing-club", name: "Racing Club", shortName: "Racing", abbr: "RAC", city: "Avellaneda", countryId: "argentina", leagueId: "liga-argentina", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 3, strength: 74 },
  { id: "independiente", name: "Club Atlético Independiente", shortName: "Independiente", abbr: "IND", city: "Avellaneda", countryId: "argentina", leagueId: "liga-argentina", primary: "#d71920", secondary: "#f5f5f5", reputation: 3, strength: 72 },
  { id: "san-lorenzo", name: "Club Atlético San Lorenzo de Almagro", shortName: "San Lorenzo", abbr: "SLO", city: "Buenos Aires", countryId: "argentina", leagueId: "liga-argentina", primary: "#08783e", secondary: "#111111", reputation: 3, strength: 71 },
  { id: "estudiantes-lp", name: "Club Estudiantes de La Plata", shortName: "Estudiantes", abbr: "EST", city: "La Plata", countryId: "argentina", leagueId: "liga-argentina", primary: "#d71920", secondary: "#f5f5f5", reputation: 3, strength: 71 },
  { id: "talleres", name: "Club Atlético Talleres", shortName: "Talleres", abbr: "TAL", city: "Córdoba", countryId: "argentina", leagueId: "liga-argentina", primary: "#274b9f", secondary: "#f5f5f5", reputation: 3, strength: 73 },
  { id: "velez-sarsfield", name: "Club Atlético Vélez Sarsfield", shortName: "Vélez Sarsfield", abbr: "VEL", city: "Buenos Aires", countryId: "argentina", leagueId: "liga-argentina", primary: "#f5f5f5", secondary: "#111111", reputation: 3, strength: 72 },
  { id: "rosario-central", name: "Club Atlético Rosario Central", shortName: "Rosario Central", abbr: "ROS", city: "Rosário", countryId: "argentina", leagueId: "liga-argentina", primary: "#274b9f", secondary: "#f2b705", reputation: 2, strength: 68 },
  { id: "newells", name: "Club Atlético Newell's Old Boys", shortName: "Newell's Old Boys", abbr: "NOB", city: "Rosário", countryId: "argentina", leagueId: "liga-argentina", primary: "#d71920", secondary: "#111111", reputation: 2, strength: 66 },
  { id: "lanus", name: "Club Atlético Lanús", shortName: "Lanús", abbr: "LAN", city: "Lanús", countryId: "argentina", leagueId: "liga-argentina", primary: "#7a1538", secondary: "#f5f5f5", reputation: 2, strength: 67 },
  { id: "defensa-justicia", name: "Club Social y Deportivo Defensa y Justicia", shortName: "Defensa y Justicia", abbr: "DYJ", city: "Florencio Varela", countryId: "argentina", leagueId: "liga-argentina", primary: "#f2b705", secondary: "#08783e", reputation: 1, strength: 63 },
  { id: "aldosivi", name: "Club Atlético Aldosivi", shortName: "Aldosivi", abbr: "ALD", city: "Mar del Plata", countryId: "argentina", leagueId: "liga-argentina", primary: "#08783e", secondary: "#f2b705", reputation: 1, strength: 57 },
  { id: "deportivo-riestra", name: "Deportivo Riestra", shortName: "Deportivo Riestra", abbr: "RIE", city: "Buenos Aires", countryId: "argentina", leagueId: "liga-argentina", primary: "#111111", secondary: "#f5f5f5", reputation: 1, strength: 58 },
  { id: "instituto", name: "Instituto Atlético Central Córdoba", shortName: "Instituto", abbr: "INS", city: "Córdoba", countryId: "argentina", leagueId: "liga-argentina", primary: "#d71920", secondary: "#f5f5f5", reputation: 1, strength: 61 },
  { id: "union-santa-fe", name: "Club Atlético Unión", shortName: "Unión", abbr: "USF", city: "Santa Fe", countryId: "argentina", leagueId: "liga-argentina", primary: "#d71920", secondary: "#f5f5f5", reputation: 1, strength: 61 },
  { id: "platense", name: "Club Atlético Platense", shortName: "Platense", abbr: "PLA", city: "Vicente López", countryId: "argentina", leagueId: "liga-argentina", primary: "#7a1538", secondary: "#f5f5f5", reputation: 2, strength: 66 },
  { id: "central-cordoba", name: "Club Atlético Central Córdoba", shortName: "Central Córdoba", abbr: "CCA", city: "Santiago del Estero", countryId: "argentina", leagueId: "liga-argentina", primary: "#111111", secondary: "#f5f5f5", reputation: 1, strength: 60 },
  { id: "gimnasia-mendoza", name: "Club Atlético Gimnasia y Esgrima", shortName: "Gimnasia Mendoza", abbr: "GIM", city: "Mendoza", countryId: "argentina", leagueId: "liga-argentina", primary: "#111111", secondary: "#f5f5f5", reputation: 1, strength: 56 },
  { id: "barracas-central", name: "Club Atlético Barracas Central", shortName: "Barracas Central", abbr: "BAR", city: "Buenos Aires", countryId: "argentina", leagueId: "liga-argentina", primary: "#d71920", secondary: "#f5f5f5", reputation: 1, strength: 57 },
  { id: "gimnasia-lp", name: "Club de Gimnasia y Esgrima La Plata", shortName: "Gimnasia LP", abbr: "GLP", city: "La Plata", countryId: "argentina", leagueId: "liga-argentina", primary: "#f5f5f5", secondary: "#274b9f", reputation: 2, strength: 63 },
  { id: "belgrano", name: "Club Atlético Belgrano", shortName: "Belgrano", abbr: "BEL", city: "Córdoba", countryId: "argentina", leagueId: "liga-argentina", primary: "#4a9fd6", secondary: "#111111", reputation: 2, strength: 64 },
  { id: "tigre", name: "Club Atlético Tigre", shortName: "Tigre", abbr: "TIG", city: "Victoria", countryId: "argentina", leagueId: "liga-argentina", primary: "#274b9f", secondary: "#d71920", reputation: 1, strength: 61 },
  { id: "estudiantes-rio-cuarto", name: "Asociación Atlética Estudiantes", shortName: "Estudiantes RC", abbr: "ERC", city: "Río Cuarto", countryId: "argentina", leagueId: "liga-argentina", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 1, strength: 55 },
  { id: "argentinos-juniors", name: "Asociación Atlética Argentinos Juniors", shortName: "Argentinos Juniors", abbr: "ARG", city: "Buenos Aires", countryId: "argentina", leagueId: "liga-argentina", primary: "#d71920", secondary: "#f5f5f5", reputation: 2, strength: 67 },
  { id: "sarmiento-junin", name: "Club Atlético Sarmiento", shortName: "Sarmiento", abbr: "SAR", city: "Junín", countryId: "argentina", leagueId: "liga-argentina", primary: "#08783e", secondary: "#f5f5f5", reputation: 1, strength: 57 },
  { id: "banfield", name: "Club Atlético Banfield", shortName: "Banfield", abbr: "BAN", city: "Banfield", countryId: "argentina", leagueId: "liga-argentina", primary: "#08783e", secondary: "#f5f5f5", reputation: 2, strength: 62 },
  { id: "huracan", name: "Club Atlético Huracán", shortName: "Huracán", abbr: "HUR", city: "Buenos Aires", countryId: "argentina", leagueId: "liga-argentina", primary: "#f5f5f5", secondary: "#d71920", reputation: 2, strength: 65 },
  { id: "independiente-rivadavia", name: "Club Sportivo Independiente Rivadavia", shortName: "Ind. Rivadavia", abbr: "IRV", city: "Mendoza", countryId: "argentina", leagueId: "liga-argentina", primary: "#274b9f", secondary: "#f5f5f5", reputation: 1, strength: 60 },
  { id: "atletico-tucuman", name: "Club Atlético Tucumán", shortName: "Atlético Tucumán", abbr: "ATU", city: "San Miguel de Tucumán", countryId: "argentina", leagueId: "liga-argentina", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 2, strength: 63 },
];

const URUGUAY_CLUBS: Club[] = [
  { id: "nacional-uru", name: "Club Nacional de Football", shortName: "Nacional", abbr: "NAC", city: "Montevidéu", countryId: "uruguai", leagueId: "liga-uruguaia", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 4, strength: 75 },
  { id: "penarol", name: "Club Atlético Peñarol", shortName: "Peñarol", abbr: "PEN", city: "Montevidéu", countryId: "uruguai", leagueId: "liga-uruguaia", primary: "#f2b705", secondary: "#111111", reputation: 4, strength: 75 },
  { id: "defensor-sporting", name: "Defensor Sporting Club", shortName: "Defensor Sporting", abbr: "DEF", city: "Montevidéu", countryId: "uruguai", leagueId: "liga-uruguaia", primary: "#7a1538", secondary: "#f5f5f5", reputation: 2, strength: 65 },
  { id: "danubio", name: "Danubio Fútbol Club", shortName: "Danubio", abbr: "DAN", city: "Montevidéu", countryId: "uruguai", leagueId: "liga-uruguaia", primary: "#f2b705", secondary: "#111111", reputation: 2, strength: 63 },
  { id: "liverpool-uru", name: "Liverpool Fútbol Club", shortName: "Liverpool FC", abbr: "LIV", city: "Montevidéu", countryId: "uruguai", leagueId: "liga-uruguaia", primary: "#111111", secondary: "#f5f5f5", reputation: 2, strength: 62 },
  { id: "cerro-largo", name: "Cerro Largo Fútbol Club", shortName: "Cerro Largo", abbr: "CEL", city: "Melo", countryId: "uruguai", leagueId: "liga-uruguaia", primary: "#08783e", secondary: "#f5f5f5", reputation: 1, strength: 58 },
  { id: "wanderers-uru", name: "Montevideo Wanderers Fútbol Club", shortName: "Montevideo Wanderers", abbr: "MWF", city: "Montevidéu", countryId: "uruguai", leagueId: "liga-uruguaia", primary: "#111111", secondary: "#f5f5f5", reputation: 1, strength: 60 },
  { id: "boston-river", name: "Club Atlético Boston River", shortName: "Boston River", abbr: "BOR", city: "Montevidéu", countryId: "uruguai", leagueId: "liga-uruguaia", primary: "#d71920", secondary: "#08783e", reputation: 1, strength: 58 },
  { id: "plaza-colonia", name: "Club Plaza Colonia de Deportes", shortName: "Plaza Colonia", abbr: "PLC", city: "Colônia do Sacramento", countryId: "uruguai", leagueId: "liga-uruguaia", primary: "#08783e", secondary: "#f5f5f5", reputation: 1, strength: 56 },
  { id: "racing-montevideo", name: "Racing Club de Montevideo", shortName: "Racing Montevideo", abbr: "RCM", city: "Montevidéu", countryId: "uruguai", leagueId: "liga-uruguaia", primary: "#08783e", secondary: "#f5f5f5", reputation: 1, strength: 57 },
  { id: "cerro-uru", name: "Club Atlético Cerro", shortName: "Cerro", abbr: "CER", city: "Montevidéu", countryId: "uruguai", leagueId: "liga-uruguaia", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 1, strength: 56 },
  { id: "juventud-las-piedras", name: "Club Atlético Juventud", shortName: "Juventud", abbr: "JUV", city: "Las Piedras", countryId: "uruguai", leagueId: "liga-uruguaia", primary: "#274b9f", secondary: "#f5f5f5", reputation: 1, strength: 55 },
  { id: "miramar-misiones", name: "Club Sportivo Miramar Misiones", shortName: "Miramar Misiones", abbr: "MIR", city: "Montevidéu", countryId: "uruguai", leagueId: "liga-uruguaia", primary: "#d71920", secondary: "#111111", reputation: 1, strength: 55 },
  { id: "montevideo-city-torque", name: "Montevideo City Torque", shortName: "Montevideo City", abbr: "MCT", city: "Montevidéu", countryId: "uruguai", leagueId: "liga-uruguaia", primary: "#4a9fd6", secondary: "#111111", reputation: 1, strength: 59 },
  { id: "progreso", name: "Club Atlético Progreso", shortName: "Progreso", abbr: "PRO", city: "Montevidéu", countryId: "uruguai", leagueId: "liga-uruguaia", primary: "#f2b705", secondary: "#d71920", reputation: 1, strength: 56 },
  { id: "river-plate-uru", name: "Club Atlético River Plate", shortName: "River Plate-URU", abbr: "RPU", city: "Montevidéu", countryId: "uruguai", leagueId: "liga-uruguaia", primary: "#d71920", secondary: "#f5f5f5", reputation: 1, strength: 58 },
];

const CHILE_CLUBS: Club[] = [
  { id: "colo-colo", name: "Club Social y Deportivo Colo-Colo", shortName: "Colo-Colo", abbr: "CCO", city: "Santiago", countryId: "chile", leagueId: "liga-chilena", primary: "#f5f5f5", secondary: "#111111", reputation: 4, strength: 74 },
  { id: "u-de-chile", name: "Club Universidad de Chile", shortName: "Universidad de Chile", abbr: "UCH", city: "Santiago", countryId: "chile", leagueId: "liga-chilena", primary: "#274b9f", secondary: "#f5f5f5", reputation: 3, strength: 71 },
  { id: "u-catolica", name: "Club Deportivo Universidad Católica", shortName: "Universidad Católica", abbr: "UCA", city: "Santiago", countryId: "chile", leagueId: "liga-chilena", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 3, strength: 71 },
  { id: "palestino", name: "Club Deportivo Palestino", shortName: "Palestino", abbr: "PAL", city: "Santiago", countryId: "chile", leagueId: "liga-chilena", primary: "#111111", secondary: "#d71920", reputation: 2, strength: 65 },
  { id: "cobresal", name: "Club de Deportes Cobresal", shortName: "Cobresal", abbr: "COB", city: "El Salvador", countryId: "chile", leagueId: "liga-chilena", primary: "#d71920", secondary: "#111111", reputation: 1, strength: 61 },
  { id: "huachipato", name: "Club Deportivo Huachipato", shortName: "Huachipato", abbr: "HUA", city: "Talcahuano", countryId: "chile", leagueId: "liga-chilena", primary: "#111111", secondary: "#4a9fd6", reputation: 2, strength: 63 },
  { id: "everton-vina", name: "Everton de Viña del Mar", shortName: "Everton de Viña", abbr: "EVE", city: "Viña del Mar", countryId: "chile", leagueId: "liga-chilena", primary: "#274b9f", secondary: "#f2b705", reputation: 2, strength: 64 },
  { id: "union-espanola", name: "Unión Española", shortName: "Unión Española", abbr: "UES", city: "Santiago", countryId: "chile", leagueId: "liga-chilena", primary: "#d71920", secondary: "#f2b705", reputation: 1, strength: 61 },
  { id: "audax-italiano", name: "Audax Club Sportivo Italiano", shortName: "Audax Italiano", abbr: "AUD", city: "Santiago", countryId: "chile", leagueId: "liga-chilena", primary: "#08783e", secondary: "#f5f5f5", reputation: 1, strength: 59 },
  { id: "nublense", name: "Club Deportivo Ñublense", shortName: "Ñublense", abbr: "NUB", city: "Chillán", countryId: "chile", leagueId: "liga-chilena", primary: "#d71920", secondary: "#111111", reputation: 1, strength: 58 },
  { id: "ohiggins", name: "O'Higgins Fútbol Club", shortName: "O'Higgins", abbr: "OHI", city: "Rancagua", countryId: "chile", leagueId: "liga-chilena", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 2, strength: 63 },
  { id: "coquimbo-unido", name: "Coquimbo Unido", shortName: "Coquimbo Unido", abbr: "COQ", city: "Coquimbo", countryId: "chile", leagueId: "liga-chilena", primary: "#f2b705", secondary: "#111111", reputation: 2, strength: 65 },
  { id: "union-la-calera", name: "Club de Deportes Unión La Calera", shortName: "Unión La Calera", abbr: "ULC", city: "La Calera", countryId: "chile", leagueId: "liga-chilena", primary: "#d71920", secondary: "#f5f5f5", reputation: 1, strength: 59 },
  { id: "deportes-la-serena", name: "Club de Deportes La Serena", shortName: "Deportes La Serena", abbr: "DLS", city: "La Serena", countryId: "chile", leagueId: "liga-chilena", primary: "#d71920", secondary: "#f5f5f5", reputation: 1, strength: 57 },
  { id: "deportes-limache", name: "Club de Deportes Limache", shortName: "Deportes Limache", abbr: "LIM", city: "Limache", countryId: "chile", leagueId: "liga-chilena", primary: "#d71920", secondary: "#111111", reputation: 1, strength: 55 },
  { id: "deportes-concepcion", name: "Club Social y de Deportes Concepción", shortName: "Deportes Concepción", abbr: "DCO", city: "Concepción", countryId: "chile", leagueId: "liga-chilena", primary: "#a675ff", secondary: "#f5f5f5", reputation: 1, strength: 56 },
];

const COLOMBIA_CLUBS: Club[] = [
  { id: "atletico-nacional", name: "Atlético Nacional", shortName: "Atlético Nacional", abbr: "ATN", city: "Medellín", countryId: "colombia", leagueId: "liga-colombiana", primary: "#08783e", secondary: "#f5f5f5", reputation: 4, strength: 76 },
  { id: "millonarios", name: "Millonarios Fútbol Club", shortName: "Millonarios", abbr: "MIL", city: "Bogotá", countryId: "colombia", leagueId: "liga-colombiana", primary: "#274b9f", secondary: "#f5f5f5", reputation: 3, strength: 72 },
  { id: "america-cali", name: "América de Cali", shortName: "América de Cali", abbr: "AME", city: "Cali", countryId: "colombia", leagueId: "liga-colombiana", primary: "#d71920", secondary: "#f5f5f5", reputation: 3, strength: 70 },
  { id: "santa-fe", name: "Independiente Santa Fe", shortName: "Santa Fe", abbr: "ISF", city: "Bogotá", countryId: "colombia", leagueId: "liga-colombiana", primary: "#d71920", secondary: "#111111", reputation: 2, strength: 67 },
  { id: "deportivo-cali", name: "Deportivo Cali", shortName: "Deportivo Cali", abbr: "DCA", city: "Cali", countryId: "colombia", leagueId: "liga-colombiana", primary: "#63e36b", secondary: "#f5f5f5", reputation: 2, strength: 66 },
  { id: "junior-barranquilla", name: "Junior de Barranquilla", shortName: "Junior", abbr: "JUN", city: "Barranquilla", countryId: "colombia", leagueId: "liga-colombiana", primary: "#d71920", secondary: "#111111", reputation: 3, strength: 69 },
  { id: "deportes-tolima", name: "Club Deportes Tolima", shortName: "Deportes Tolima", abbr: "TOL", city: "Ibagué", countryId: "colombia", leagueId: "liga-colombiana", primary: "#7a1538", secondary: "#f2b705", reputation: 2, strength: 68 },
  { id: "once-caldas", name: "Once Caldas Sociedad Anónima", shortName: "Once Caldas", abbr: "ONC", city: "Manizales", countryId: "colombia", leagueId: "liga-colombiana", primary: "#f5f5f5", secondary: "#111111", reputation: 2, strength: 65 },
  { id: "independiente-medellin", name: "Deportivo Independiente Medellín", shortName: "Ind. Medellín", abbr: "DIM", city: "Medellín", countryId: "colombia", leagueId: "liga-colombiana", primary: "#d71920", secondary: "#274b9f", reputation: 2, strength: 66 },
  { id: "deportivo-pasto", name: "Asociación Deportivo Pasto", shortName: "Deportivo Pasto", abbr: "PAS", city: "Pasto", countryId: "colombia", leagueId: "liga-colombiana", primary: "#d71920", secondary: "#274b9f", reputation: 1, strength: 59 },
  { id: "alianza-valledupar", name: "Alianza Fútbol Club", shortName: "Alianza FC", abbr: "ALI", city: "Valledupar", countryId: "colombia", leagueId: "liga-colombiana", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 1, strength: 57 },
  { id: "atletico-bucaramanga", name: "Club Atlético Bucaramanga", shortName: "Bucaramanga", abbr: "BUC", city: "Bucaramanga", countryId: "colombia", leagueId: "liga-colombiana", primary: "#f2b705", secondary: "#08783e", reputation: 2, strength: 66 },
  { id: "boyaca-chico", name: "Boyacá Chicó Fútbol Club", shortName: "Boyacá Chicó", abbr: "CHI", city: "Tunja", countryId: "colombia", leagueId: "liga-colombiana", primary: "#111111", secondary: "#f2b705", reputation: 1, strength: 56 },
  { id: "cucuta-deportivo", name: "Cúcuta Deportivo Fútbol Club", shortName: "Cúcuta Deportivo", abbr: "CUC", city: "Cúcuta", countryId: "colombia", leagueId: "liga-colombiana", primary: "#d71920", secondary: "#111111", reputation: 1, strength: 59 },
  { id: "fortaleza-ceif", name: "Fortaleza CEIF", shortName: "Fortaleza CEIF", abbr: "FOR", city: "Bogotá", countryId: "colombia", leagueId: "liga-colombiana", primary: "#274b9f", secondary: "#d71920", reputation: 1, strength: 61 },
  { id: "jaguares-cordoba", name: "Jaguares de Córdoba Fútbol Club", shortName: "Jaguares", abbr: "JAG", city: "Montería", countryId: "colombia", leagueId: "liga-colombiana", primary: "#4a9fd6", secondary: "#08783e", reputation: 1, strength: 56 },
  { id: "la-equidad", name: "Internacional de Bogotá", shortName: "Internacional Bogotá", abbr: "IBO", city: "Bogotá", countryId: "colombia", leagueId: "liga-colombiana", primary: "#08783e", secondary: "#f5f5f5", reputation: 1, strength: 59 },
  { id: "llaneros", name: "Llaneros Fútbol Club", shortName: "Llaneros", abbr: "LLA", city: "Villavicencio", countryId: "colombia", leagueId: "liga-colombiana", primary: "#f2b705", secondary: "#274b9f", reputation: 1, strength: 55 },
  { id: "aguilas-doradas", name: "Águilas Doradas", shortName: "Águilas Doradas", abbr: "AGD", city: "Rionegro", countryId: "colombia", leagueId: "liga-colombiana", primary: "#f2b705", secondary: "#111111", reputation: 1, strength: 61 },
  { id: "union-magdalena", name: "Unión Magdalena", shortName: "Unión Magdalena", abbr: "UMA", city: "Santa Marta", countryId: "colombia", leagueId: "liga-colombiana", primary: "#274b9f", secondary: "#d71920", reputation: 1, strength: 55 },
];

const PARAGUAY_CLUBS: Club[] = [
  { id: "olimpia", name: "Club Olimpia", shortName: "Olimpia", abbr: "OLI", city: "Assunção", countryId: "paraguai", leagueId: "liga-paraguaia", primary: "#111111", secondary: "#f5f5f5", reputation: 3, strength: 70 },
  { id: "cerro-porteno", name: "Club Cerro Porteño", shortName: "Cerro Porteño", abbr: "CER", city: "Assunção", countryId: "paraguai", leagueId: "liga-paraguaia", primary: "#274b9f", secondary: "#d71920", reputation: 3, strength: 69 },
  { id: "libertad-par", name: "Club Libertad", shortName: "Libertad", abbr: "LIB", city: "Assunção", countryId: "paraguai", leagueId: "liga-paraguaia", primary: "#f5f5f5", secondary: "#111111", reputation: 2, strength: 64 },
  { id: "guarani-par", name: "Club Guaraní", shortName: "Guaraní", abbr: "GUA", city: "Assunção", countryId: "paraguai", leagueId: "liga-paraguaia", primary: "#d71920", secondary: "#f5f5f5", reputation: 2, strength: 62 },
  { id: "nacional-par", name: "Club Nacional", shortName: "Nacional-PAR", abbr: "NAP", city: "Assunção", countryId: "paraguai", leagueId: "liga-paraguaia", primary: "#f2b705", secondary: "#111111", reputation: 1, strength: 58 },
  { id: "sportivo-luqueno", name: "Club Sportivo Luqueño", shortName: "Sportivo Luqueño", abbr: "SLU", city: "Luque", countryId: "paraguai", leagueId: "liga-paraguaia", primary: "#274b9f", secondary: "#f2b705", reputation: 1, strength: 61 },
  { id: "2-de-mayo", name: "Club Sportivo 2 de Mayo", shortName: "2 de Mayo", abbr: "2DM", city: "Pedro Juan Caballero", countryId: "paraguai", leagueId: "liga-paraguaia", primary: "#274b9f", secondary: "#f5f5f5", reputation: 1, strength: 58 },
  { id: "trinidense", name: "Club Sportivo Trinidense", shortName: "Trinidense", abbr: "TRI", city: "Assunção", countryId: "paraguai", leagueId: "liga-paraguaia", primary: "#f2b705", secondary: "#274b9f", reputation: 1, strength: 57 },
  { id: "general-caballero", name: "General Caballero de Juan León Mallorquín", shortName: "General Caballero", abbr: "GCM", city: "Juan León Mallorquín", countryId: "paraguai", leagueId: "liga-paraguaia", primary: "#d71920", secondary: "#f5f5f5", reputation: 1, strength: 56 },
  { id: "ameliano", name: "Club Sportivo Ameliano", shortName: "Sportivo Ameliano", abbr: "AME", city: "Assunção", countryId: "paraguai", leagueId: "liga-paraguaia", primary: "#274b9f", secondary: "#f5f5f5", reputation: 1, strength: 57 },
  { id: "deportivo-recoleta", name: "Deportivo Recoleta", shortName: "Recoleta", abbr: "REC", city: "Assunção", countryId: "paraguai", leagueId: "liga-paraguaia", primary: "#f2b705", secondary: "#08783e", reputation: 1, strength: 55 },
  { id: "atletico-tembetary", name: "Club Atlético Tembetary", shortName: "Tembetary", abbr: "TEM", city: "Ypané", countryId: "paraguai", leagueId: "liga-paraguaia", primary: "#d71920", secondary: "#08783e", reputation: 1, strength: 54 },
];

const ECUADOR_CLUBS: Club[] = [
  { id: "barcelona-sc", name: "Barcelona Sporting Club", shortName: "Barcelona SC", abbr: "BSC", city: "Guayaquil", countryId: "equador", leagueId: "liga-equatoriana", primary: "#f2b705", secondary: "#111111", reputation: 3, strength: 72 },
  { id: "emelec", name: "Club Sport Emelec", shortName: "Emelec", abbr: "EME", city: "Guayaquil", countryId: "equador", leagueId: "liga-equatoriana", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 3, strength: 71 },
  { id: "ldu-quito", name: "Liga Deportiva Universitaria de Quito", shortName: "LDU Quito", abbr: "LDU", city: "Quito", countryId: "equador", leagueId: "liga-equatoriana", primary: "#f5f5f5", secondary: "#111111", reputation: 3, strength: 72 },
  { id: "independiente-valle", name: "Independiente del Valle", shortName: "Ind. del Valle", abbr: "IDV", city: "Sangolquí", countryId: "equador", leagueId: "liga-equatoriana", primary: "#111111", secondary: "#63e36b", reputation: 3, strength: 71 },
  { id: "aucas", name: "Sociedad Deportiva Aucas", shortName: "Aucas", abbr: "AUC", city: "Quito", countryId: "equador", leagueId: "liga-equatoriana", primary: "#f2b705", secondary: "#08783e", reputation: 1, strength: 60 },
  { id: "el-nacional", name: "Club Deportivo El Nacional", shortName: "El Nacional", abbr: "ELN", city: "Quito", countryId: "equador", leagueId: "liga-equatoriana", primary: "#d71920", secondary: "#4a9fd6", reputation: 2, strength: 65 },
  { id: "deportivo-cuenca", name: "Club Deportivo Cuenca", shortName: "Deportivo Cuenca", abbr: "CUE", city: "Cuenca", countryId: "equador", leagueId: "liga-equatoriana", primary: "#d71920", secondary: "#f2b705", reputation: 1, strength: 60 },
  { id: "mushuc-runa", name: "Mushuc Runa Sporting Club", shortName: "Mushuc Runa", abbr: "MUR", city: "Ambato", countryId: "equador", leagueId: "liga-equatoriana", primary: "#08783e", secondary: "#f5f5f5", reputation: 1, strength: 58 },
  { id: "orense", name: "Orense Sporting Club", shortName: "Orense", abbr: "ORE", city: "Machala", countryId: "equador", leagueId: "liga-equatoriana", primary: "#08783e", secondary: "#f2b705", reputation: 1, strength: 57 },
  { id: "u-catolica-ecu", name: "Club Deportivo Universidad Católica", shortName: "Universidad Católica-EQU", abbr: "UCE", city: "Quito", countryId: "equador", leagueId: "liga-equatoriana", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 2, strength: 64 },
  { id: "macara", name: "Club Social y Deportivo Macará", shortName: "Macará", abbr: "MAC", city: "Ambato", countryId: "equador", leagueId: "liga-equatoriana", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 1, strength: 57 },
  { id: "tecnico-universitario", name: "Club Técnico Universitario", shortName: "Técnico Universitario", abbr: "TEC", city: "Ambato", countryId: "equador", leagueId: "liga-equatoriana", primary: "#d71920", secondary: "#f5f5f5", reputation: 1, strength: 56 },
  { id: "libertad-loja", name: "Libertad Fútbol Club", shortName: "Libertad Loja", abbr: "LFC", city: "Loja", countryId: "equador", leagueId: "liga-equatoriana", primary: "#ff7a1a", secondary: "#111111", reputation: 1, strength: 55 },
  { id: "delfin", name: "Delfín Sporting Club", shortName: "Delfín", abbr: "DEL", city: "Manta", countryId: "equador", leagueId: "liga-equatoriana", primary: "#4a9fd6", secondary: "#f2b705", reputation: 1, strength: 59 },
  { id: "manta-fc", name: "Manta Fútbol Club", shortName: "Manta FC", abbr: "MAN", city: "Manta", countryId: "equador", leagueId: "liga-equatoriana", primary: "#4a9fd6", secondary: "#111111", reputation: 1, strength: 55 },
  { id: "vinotinto-ecuador", name: "Vinotinto Ecuador Fútbol Club", shortName: "Vinotinto Ecuador", abbr: "VIN", city: "Quito", countryId: "equador", leagueId: "liga-equatoriana", primary: "#7a1538", secondary: "#4a9fd6", reputation: 1, strength: 54 },
];

const PERU_CLUBS: Club[] = [
  { id: "universitario", name: "Club Universitario de Deportes", shortName: "Universitario", abbr: "UNI", city: "Lima", countryId: "peru", leagueId: "liga-peruana", primary: "#f5f5f5", secondary: "#111111", reputation: 3, strength: 69 },
  { id: "alianza-lima", name: "Club Alianza Lima", shortName: "Alianza Lima", abbr: "ALL", city: "Lima", countryId: "peru", leagueId: "liga-peruana", primary: "#111111", secondary: "#4a9fd6", reputation: 3, strength: 69 },
  { id: "sporting-cristal", name: "Club Sporting Cristal", shortName: "Sporting Cristal", abbr: "SCR", city: "Lima", countryId: "peru", leagueId: "liga-peruana", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 3, strength: 68 },
  { id: "cienciano", name: "Club Sportivo Cienciano", shortName: "Cienciano", abbr: "CIE", city: "Cusco", countryId: "peru", leagueId: "liga-peruana", primary: "#d71920", secondary: "#f2b705", reputation: 1, strength: 59 },
  { id: "melgar", name: "Foot Ball Club Melgar", shortName: "Melgar", abbr: "MEL", city: "Arequipa", countryId: "peru", leagueId: "liga-peruana", primary: "#7a1538", secondary: "#111111", reputation: 2, strength: 62 },
  { id: "sport-boys", name: "Sport Boys Association", shortName: "Sport Boys", abbr: "SBO", city: "Callao", countryId: "peru", leagueId: "liga-peruana", primary: "#f2b8e0", secondary: "#111111", reputation: 1, strength: 58 },
  { id: "cusco-fc", name: "Cusco Fútbol Club", shortName: "Cusco FC", abbr: "CUS", city: "Cusco", countryId: "peru", leagueId: "liga-peruana", primary: "#f2b705", secondary: "#111111", reputation: 1, strength: 60 },
  { id: "sport-huancayo", name: "Club Sport Huancayo", shortName: "Sport Huancayo", abbr: "HUA", city: "Huancayo", countryId: "peru", leagueId: "liga-peruana", primary: "#d71920", secondary: "#f5f5f5", reputation: 1, strength: 59 },
  { id: "alianza-atletico", name: "Club Alianza Atlético Sullana", shortName: "Alianza Atlético", abbr: "AAS", city: "Sullana", countryId: "peru", leagueId: "liga-peruana", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 1, strength: 56 },
  { id: "deportivo-garcilaso", name: "Club Deportivo Garcilaso", shortName: "Deportivo Garcilaso", abbr: "GAR", city: "Cusco", countryId: "peru", leagueId: "liga-peruana", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 1, strength: 57 },
  { id: "adt-tarma", name: "Asociación Deportiva Tarma", shortName: "ADT", abbr: "ADT", city: "Tarma", countryId: "peru", leagueId: "liga-peruana", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 1, strength: 59 },
  { id: "atletico-grau", name: "Club Atlético Grau", shortName: "Atlético Grau", abbr: "AGR", city: "Piura", countryId: "peru", leagueId: "liga-peruana", primary: "#f5f5f5", secondary: "#d71920", reputation: 1, strength: 58 },
  { id: "comerciantes-unidos", name: "Club Social Deportivo y Cultural Comerciantes Unidos", shortName: "Comerciantes Unidos", abbr: "COM", city: "Cutervo", countryId: "peru", leagueId: "liga-peruana", primary: "#a675ff", secondary: "#f2b705", reputation: 1, strength: 55 },
  { id: "juan-pablo-ii", name: "Asociación Deportiva Cultural Juan Pablo II", shortName: "Juan Pablo II", abbr: "JPI", city: "Chongoyape", countryId: "peru", leagueId: "liga-peruana", primary: "#f2b705", secondary: "#4a9fd6", reputation: 1, strength: 54 },
  { id: "los-chankas", name: "Club Deportivo Los Chankas", shortName: "Los Chankas", abbr: "CHA", city: "Andahuaylas", countryId: "peru", leagueId: "liga-peruana", primary: "#a675ff", secondary: "#f5f5f5", reputation: 1, strength: 56 },
  { id: "utc-cajamarca", name: "Universidad Técnica de Cajamarca", shortName: "UTC", abbr: "UTC", city: "Cajamarca", countryId: "peru", leagueId: "liga-peruana", primary: "#d71920", secondary: "#f2b705", reputation: 1, strength: 56 },
  { id: "ayacucho-fc", name: "Ayacucho Fútbol Club", shortName: "Ayacucho FC", abbr: "AYA", city: "Ayacucho", countryId: "peru", leagueId: "liga-peruana", primary: "#ff7a1a", secondary: "#f5f5f5", reputation: 1, strength: 55 },
  { id: "alianza-universidad", name: "Club Social Deportivo Alianza Universidad", shortName: "Alianza Universidad", abbr: "AUH", city: "Huánuco", countryId: "peru", leagueId: "liga-peruana", primary: "#274b9f", secondary: "#d71920", reputation: 1, strength: 54 },
];

// Liga MX: elegível à Copa de Campeões Concacaf conforme campanha nacional.
const MEXICO_CLUBS: Club[] = [
  { id: "club-america", name: "Club América", shortName: "América", abbr: "AME", city: "Cidade do México", countryId: "mexico", leagueId: "liga-mx", primary: "#f2b705", secondary: "#111111", reputation: 4, strength: 78 },
  { id: "chivas", name: "Club Deportivo Guadalajara", shortName: "Chivas", abbr: "CHI", city: "Guadalajara", countryId: "mexico", leagueId: "liga-mx", primary: "#d71920", secondary: "#274b9f", reputation: 3, strength: 73 },
  { id: "cruz-azul", name: "Cruz Azul Fútbol Club", shortName: "Cruz Azul", abbr: "CAZ", city: "Cidade do México", countryId: "mexico", leagueId: "liga-mx", primary: "#274b9f", secondary: "#f5f5f5", reputation: 3, strength: 73 },
  { id: "pumas-unam", name: "Club Universidad Nacional", shortName: "Pumas UNAM", abbr: "PUM", city: "Cidade do México", countryId: "mexico", leagueId: "liga-mx", primary: "#111111", secondary: "#f2b705", reputation: 2, strength: 68 },
  { id: "monterrey", name: "Club de Fútbol Monterrey", shortName: "Monterrey", abbr: "MTY", city: "Monterrey", countryId: "mexico", leagueId: "liga-mx", primary: "#111111", secondary: "#4a9fd6", reputation: 4, strength: 76 },
  { id: "tigres-uanl", name: "Club de Fútbol Tigres de la UANL", shortName: "Tigres UANL", abbr: "TIG", city: "San Nicolás de los Garza", countryId: "mexico", leagueId: "liga-mx", primary: "#f2b705", secondary: "#111111", reputation: 4, strength: 77 },
  { id: "toluca", name: "Deportivo Toluca Fútbol Club", shortName: "Toluca", abbr: "TOL", city: "Toluca", countryId: "mexico", leagueId: "liga-mx", primary: "#d71920", secondary: "#f5f5f5", reputation: 2, strength: 68 },
  { id: "club-leon", name: "Club León", shortName: "León", abbr: "LEO", city: "León", countryId: "mexico", leagueId: "liga-mx", primary: "#111111", secondary: "#63e36b", reputation: 2, strength: 67 },
  { id: "pachuca", name: "Club de Fútbol Pachuca", shortName: "Pachuca", abbr: "PAC", city: "Pachuca", countryId: "mexico", leagueId: "liga-mx", primary: "#274b9f", secondary: "#f5f5f5", reputation: 3, strength: 72 },
  { id: "santos-laguna", name: "Club Santos Laguna", shortName: "Santos Laguna", abbr: "SAN", city: "Torreón", countryId: "mexico", leagueId: "liga-mx", primary: "#08783e", secondary: "#f5f5f5", reputation: 2, strength: 67 },
  { id: "puebla", name: "Club Puebla", shortName: "Puebla", abbr: "PUE", city: "Puebla", countryId: "mexico", leagueId: "liga-mx", primary: "#4a9fd6", secondary: "#f5f5f5", reputation: 1, strength: 61 },
  { id: "queretaro", name: "Querétaro Fútbol Club", shortName: "Querétaro", abbr: "QUE", city: "Querétaro", countryId: "mexico", leagueId: "liga-mx", primary: "#274b9f", secondary: "#111111", reputation: 1, strength: 60 },
  { id: "atlas", name: "Atlas Fútbol Club", shortName: "Atlas", abbr: "ATL", city: "Guadalajara", countryId: "mexico", leagueId: "liga-mx", primary: "#d71920", secondary: "#111111", reputation: 2, strength: 66 },
  { id: "atletico-san-luis", name: "Club Atlético de San Luis", shortName: "Atlético San Luis", abbr: "ASL", city: "San Luis Potosí", countryId: "mexico", leagueId: "liga-mx", primary: "#d71920", secondary: "#274b9f", reputation: 1, strength: 63 },
  { id: "fc-juarez", name: "Fútbol Club Juárez", shortName: "FC Juárez", abbr: "JUA", city: "Ciudad Juárez", countryId: "mexico", leagueId: "liga-mx", primary: "#08783e", secondary: "#111111", reputation: 1, strength: 61 },
  { id: "mazatlan", name: "Mazatlán Fútbol Club", shortName: "Mazatlán FC", abbr: "MAZ", city: "Mazatlán", countryId: "mexico", leagueId: "liga-mx", primary: "#a675ff", secondary: "#111111", reputation: 1, strength: 59 },
  { id: "necaxa", name: "Club Necaxa", shortName: "Necaxa", abbr: "NEC", city: "Aguascalientes", countryId: "mexico", leagueId: "liga-mx", primary: "#d71920", secondary: "#f5f5f5", reputation: 2, strength: 64 },
  { id: "tijuana", name: "Club Tijuana Xoloitzcuintles", shortName: "Tijuana", abbr: "TIJ", city: "Tijuana", countryId: "mexico", leagueId: "liga-mx", primary: "#d71920", secondary: "#111111", reputation: 1, strength: 62 },
];

// MLS: elegível à Copa de Campeões Concacaf conforme campanha nacional.
const MLS_CLUBS: Club[] = [
  { id: "inter-miami", name: "Inter Miami Football Club", shortName: "Inter Miami", abbr: "MIA", city: "Fort Lauderdale", countryId: "eua", leagueId: "mls", primary: "#f2b8e0", secondary: "#111111", reputation: 4, strength: 74 },
  { id: "la-galaxy", name: "Los Angeles Galaxy", shortName: "LA Galaxy", abbr: "LAG", city: "Los Angeles", countryId: "eua", leagueId: "mls", primary: "#274b9f", secondary: "#f2b705", reputation: 3, strength: 70 },
  { id: "lafc", name: "Los Angeles Football Club", shortName: "LAFC", abbr: "LAF", city: "Los Angeles", countryId: "eua", leagueId: "mls", primary: "#111111", secondary: "#f2b705", reputation: 3, strength: 71 },
  { id: "seattle-sounders", name: "Seattle Sounders Football Club", shortName: "Seattle Sounders", abbr: "SEA", city: "Seattle", countryId: "eua", leagueId: "mls", primary: "#63e36b", secondary: "#111111", reputation: 2, strength: 67 },
  { id: "atlanta-united", name: "Atlanta United Football Club", shortName: "Atlanta United", abbr: "ATL", city: "Atlanta", countryId: "eua", leagueId: "mls", primary: "#111111", secondary: "#f2b705", reputation: 3, strength: 69 },
  { id: "nycfc", name: "New York City Football Club", shortName: "NYCFC", abbr: "NYC", city: "Nova York", countryId: "eua", leagueId: "mls", primary: "#4a9fd6", secondary: "#f2b705", reputation: 2, strength: 66 },
  { id: "ny-red-bulls", name: "New York Red Bulls", shortName: "NY Red Bulls", abbr: "NYR", city: "Harrison", countryId: "eua", leagueId: "mls", primary: "#d71920", secondary: "#f5f5f5", reputation: 2, strength: 65 },
  { id: "portland-timbers", name: "Portland Timbers", shortName: "Portland Timbers", abbr: "POR", city: "Portland", countryId: "eua", leagueId: "mls", primary: "#08783e", secondary: "#f5f5f5", reputation: 2, strength: 65 },
  { id: "fc-cincinnati", name: "Football Club Cincinnati", shortName: "FC Cincinnati", abbr: "CIN", city: "Cincinnati", countryId: "eua", leagueId: "mls", primary: "#274b9f", secondary: "#ff7a1a", reputation: 2, strength: 69 },
  { id: "columbus-crew", name: "Columbus Crew", shortName: "Columbus Crew", abbr: "CLB", city: "Columbus", countryId: "eua", leagueId: "mls", primary: "#f2b705", secondary: "#111111", reputation: 2, strength: 68 },
  { id: "austin-fc", name: "Austin Football Club", shortName: "Austin FC", abbr: "ATX", city: "Austin", countryId: "eua", leagueId: "mls", primary: "#63e36b", secondary: "#111111", reputation: 1, strength: 62 },
  { id: "san-jose-earthquakes", name: "San Jose Earthquakes", shortName: "San Jose Earthquakes", abbr: "SJE", city: "San José", countryId: "eua", leagueId: "mls", primary: "#274b9f", secondary: "#111111", reputation: 1, strength: 60 },
  { id: "charlotte-fc", name: "Charlotte Football Club", shortName: "Charlotte FC", abbr: "CLT", city: "Charlotte", countryId: "eua", leagueId: "mls", primary: "#4a9fd6", secondary: "#111111", reputation: 2, strength: 65 },
  { id: "chicago-fire", name: "Chicago Fire Football Club", shortName: "Chicago Fire", abbr: "CHI", city: "Chicago", countryId: "eua", leagueId: "mls", primary: "#d71920", secondary: "#274b9f", reputation: 2, strength: 63 },
  { id: "dc-united", name: "D.C. United", shortName: "D.C. United", abbr: "DCU", city: "Washington", countryId: "eua", leagueId: "mls", primary: "#111111", secondary: "#d71920", reputation: 2, strength: 62 },
  { id: "cf-montreal", name: "Club de Foot Montréal", shortName: "CF Montréal", abbr: "MTL", city: "Montreal", countryId: "eua", leagueId: "mls", primary: "#274b9f", secondary: "#f5f5f5", reputation: 1, strength: 61 },
  { id: "nashville-sc", name: "Nashville Soccer Club", shortName: "Nashville SC", abbr: "NSH", city: "Nashville", countryId: "eua", leagueId: "mls", primary: "#f2b705", secondary: "#274b9f", reputation: 2, strength: 66 },
  { id: "new-england-revolution", name: "New England Revolution", shortName: "New England", abbr: "NER", city: "Foxborough", countryId: "eua", leagueId: "mls", primary: "#274b9f", secondary: "#d71920", reputation: 2, strength: 63 },
  { id: "orlando-city", name: "Orlando City Soccer Club", shortName: "Orlando City", abbr: "ORL", city: "Orlando", countryId: "eua", leagueId: "mls", primary: "#a675ff", secondary: "#f2b705", reputation: 2, strength: 67 },
  { id: "philadelphia-union", name: "Philadelphia Union", shortName: "Philadelphia Union", abbr: "PHI", city: "Chester", countryId: "eua", leagueId: "mls", primary: "#111111", secondary: "#f2b705", reputation: 2, strength: 66 },
  { id: "toronto-fc", name: "Toronto Football Club", shortName: "Toronto FC", abbr: "TOR", city: "Toronto", countryId: "eua", leagueId: "mls", primary: "#d71920", secondary: "#f5f5f5", reputation: 2, strength: 63 },
  { id: "colorado-rapids", name: "Colorado Rapids", shortName: "Colorado Rapids", abbr: "COL", city: "Commerce City", countryId: "eua", leagueId: "mls", primary: "#7a1538", secondary: "#4a9fd6", reputation: 1, strength: 62 },
  { id: "fc-dallas", name: "Football Club Dallas", shortName: "FC Dallas", abbr: "DAL", city: "Frisco", countryId: "eua", leagueId: "mls", primary: "#d71920", secondary: "#274b9f", reputation: 2, strength: 64 },
  { id: "houston-dynamo", name: "Houston Dynamo Football Club", shortName: "Houston Dynamo", abbr: "HOU", city: "Houston", countryId: "eua", leagueId: "mls", primary: "#ff7a1a", secondary: "#111111", reputation: 2, strength: 64 },
  { id: "minnesota-united", name: "Minnesota United Football Club", shortName: "Minnesota United", abbr: "MIN", city: "Saint Paul", countryId: "eua", leagueId: "mls", primary: "#4a9fd6", secondary: "#111111", reputation: 2, strength: 66 },
  { id: "real-salt-lake", name: "Real Salt Lake", shortName: "Real Salt Lake", abbr: "RSL", city: "Sandy", countryId: "eua", leagueId: "mls", primary: "#d71920", secondary: "#274b9f", reputation: 2, strength: 65 },
  { id: "st-louis-city", name: "St. Louis City Soccer Club", shortName: "St. Louis City", abbr: "STL", city: "St. Louis", countryId: "eua", leagueId: "mls", primary: "#d71920", secondary: "#274b9f", reputation: 2, strength: 64 },
  { id: "san-diego-fc", name: "San Diego Football Club", shortName: "San Diego FC", abbr: "SDC", city: "San Diego", countryId: "eua", leagueId: "mls", primary: "#111111", secondary: "#4a9fd6", reputation: 2, strength: 65 },
  { id: "sporting-kansas-city", name: "Sporting Kansas City", shortName: "Sporting KC", abbr: "SKC", city: "Kansas City", countryId: "eua", leagueId: "mls", primary: "#4a9fd6", secondary: "#274b9f", reputation: 2, strength: 63 },
  { id: "vancouver-whitecaps", name: "Vancouver Whitecaps Football Club", shortName: "Vancouver Whitecaps", abbr: "VAN", city: "Vancouver", countryId: "eua", leagueId: "mls", primary: "#f5f5f5", secondary: "#274b9f", reputation: 2, strength: 67 },
];

export const CLUBS: Club[] = [
  ...BRAZIL_CLUBS,
  ...EUROPE_CLUBS,
  ...ARGENTINA_CLUBS,
  ...URUGUAY_CLUBS,
  ...CHILE_CLUBS,
  ...COLOMBIA_CLUBS,
  ...PARAGUAY_CLUBS,
  ...ECUADOR_CLUBS,
  ...PERU_CLUBS,
  ...MEXICO_CLUBS,
  ...MLS_CLUBS,
];

export const FORMATIONS: Formation[] = [
  { id: "artista", icon: "✦", title: "Bola no pé", subtitle: "Técnica acima de tudo", description: "Mais drible, passe e criatividade. O físico demora um pouco mais.", technical: 9, physical: 1, mental: 4, risk: 2, archetype: "O Artista" },
  { id: "guerreiro", icon: "⚡", title: "Corpo de atleta", subtitle: "Explosão e resistência", description: "Você cresce forte, aguenta a pancada e evolui rápido nos treinos.", technical: 2, physical: 9, mental: 3, risk: 4, archetype: "O Guerreiro" },
  { id: "estudioso", icon: "◫", title: "Estudar o jogo", subtitle: "Tática e cabeça fria", description: "Evolução segura, boas decisões e confiança dos treinadores.", technical: 4, physical: 2, mental: 9, risk: 1, archetype: "O Estudioso" },
  { id: "prodigio", icon: "★", title: "Quero ser o melhor", subtitle: "Ambição sem freio", description: "Treino no limite e mais visibilidade, com pressão e risco maiores.", technical: 7, physical: 5, mental: 5, risk: 8, archetype: "O Prodígio" },
];

export const YOUTH_EVENTS = [
  { title: "Primeiro treino", positive: "Você não se escondeu e pediu a bola.", neutral: "O nervosismo apareceu, mas passou rápido." },
  { title: "A bronca do treinador", positive: "Você ouviu, voltou mais cedo e ganhou respeito.", neutral: "A resposta atravessada custou alguns minutos." },
  { title: "Prova na escola", positive: "Treino e estudo ficaram em equilíbrio.", neutral: "Uma semana fora do ritmo cobrou seu preço." },
  { title: "O estirão", positive: "O corpo mudou e seu jogo acompanhou.", neutral: "Você precisou reaprender alguns movimentos." },
  { title: "Clássico da base", positive: "Atuação grande quando todo mundo estava olhando.", neutral: "O jogo foi duro e você saiu mais experiente." },
  { title: "Capitão da categoria", positive: "O grupo passou a ouvir sua voz.", neutral: "Você preferiu liderar com a bola." },
  { title: "Primeira lesão", positive: "Tratamento correto e volta sem sequelas.", neutral: "A ansiedade atrasou um pouco a recuperação." },
  { title: "Olheiro na arquibancada", positive: "Você jogou simples e saiu anotado no caderno.", neutral: "Tentou impressionar demais e perdeu o foco." },
  { title: "Amistoso com o profissional", positive: "Um carrinho, um passe e um olhar do técnico.", neutral: "O ritmo assustou, mas a porta ficou aberta." },
  { title: "Mudança de categoria", positive: "Subiu antes da hora e não sentiu o peso.", neutral: "Demorou algumas semanas para acompanhar." },
  { title: "Decisão no mata-mata", positive: "Você chamou a responsabilidade.", neutral: "O resultado não veio, o aprendizado sim." },
  { title: "A semana da revelação", positive: "Seu nome apareceu na lista do profissional.", neutral: "A espera terminou: chegou a sua oportunidade." },
] as const;

export const PRO_EVENTS: GameEvent[] = [
  { id: "extra-training", icon: "↗", tag: "TREINO", title: "Depois que todos foram embora", description: "O auxiliar deixou a chave do campo com você. Dá para trabalhar um fundamento a mais.", choices: [
    { label: "Treinar finalização", hint: "Técnica ↑ · físico ↓", result: "Cem bolas depois, o chute já sai diferente.", effect: { ovr: 1, fitness: -7, reputation: 1 } },
    { label: "Ficar na academia", hint: "Físico ↑", result: "Você termina a sessão mais forte e mais inteiro.", effect: { fitness: 5, potential: 1 } },
    { label: "Descansar direito", hint: "Condição ↑↑", result: "Nem todo avanço acontece com a chuteira no pé.", effect: { fitness: 10, morale: 2 } },
  ]},
  { id: "rookie-locker", icon: "☰", tag: "VESTIÁRIO", title: "O elenco testa o novato", description: "Sua roupa aparece amarrada no alto do vestiário. Todo mundo espera sua reação.", maxAge: 21, oneTime: true, choices: [
    { label: "Entrar na brincadeira", hint: "Grupo ↑", result: "A resenha vira seu primeiro passe para dentro do grupo.", effect: { morale: 7, reputation: 1 } },
    { label: "Impor respeito", hint: "Liderança ↑ · clima ↓", result: "O recado foi entendido — talvez alto demais.", effect: { leadership: 5, morale: -3 } },
  ]},
  { id: "bench", icon: "▰", tag: "TÉCNICO", title: "Três jogos no banco", description: "A promessa era de minutos, mas seu nome não sai da reserva.", maxOvr: 76, choices: [
    { label: "Pedir uma conversa", hint: "Chance de minutos", result: "O técnico não prometeu nada, mas anotou seu nome.", effect: { reputation: 1, minutes: 7 } },
    { label: "Responder no treino", hint: "OVR ↑ · risco ↑", result: "Você treinou como se fosse uma final.", effect: { ovr: 1, fitness: -9, minutes: 4 } },
    { label: "Esperar o momento", hint: "Moral ↓ · grupo ↑", result: "O vestiário reconhece sua postura profissional.", effect: { morale: -3, leadership: 3 } },
  ]},
  { id: "mentor", icon: "◎", tag: "VESTIÁRIO", title: "Conselho de quem já ganhou", description: "Um veterano chama você depois do treino e oferece ajuda para sobreviver à pressão.", maxAge: 25, oneTime: true, choices: [
    { label: "Aprender os atalhos", hint: "Evolução futura ↑", result: "O jogo parece um pouco mais lento depois da conversa.", effect: { potential: 2, ovr: 1 } },
    { label: "Aprender sobre a carreira", hint: "Longevidade ↑", result: "Você começa a cuidar melhor do corpo e da cabeça.", effect: { fitness: 8, morale: 4 } },
  ]},
  { id: "derby", icon: "⚔", tag: "CLÁSSICO", title: "A cidade para por noventa minutos", description: "Clássico lotado. Uma boa atuação muda a forma como a torcida olha para você.", minOvr: 64, needsRivalry: true, choices: [
    { label: "Jogar para o time", hint: "Seguro · reputação ↑", result: "Sem firula: você foi útil em cada bola.", effect: { reputation: 4, morale: 3 } },
    { label: "Buscar o lance do jogo", hint: "Alto risco · alto retorno", result: "A arquibancada levantou antes mesmo da bola chegar.", effect: { ovr: 1, reputation: 7, fitness: -5, injuryRisk: 4 } },
    { label: "Provocar o rival", hint: "Torcida ↑ · disciplina ↓", result: "Seu nome ecoa no estádio — dos dois lados.", effect: { reputation: 8, morale: 5, fitness: -3, discipline: -10 } },
  ]},
  { id: "bad-interview", icon: "●", tag: "MÍDIA", title: "Microfone depois do erro", description: "A derrota passou pelos seus pés e a primeira pergunta vem sem carinho.", choices: [
    { label: "Assumir a culpa", hint: "Respeito ↑", result: "A resposta dói agora e rende respeito depois.", effect: { morale: -4, reputation: 5, leadership: 3 } },
    { label: "Defender o grupo", hint: "Vestiário ↑", result: "Ninguém fica sozinho na derrota.", effect: { morale: 4, leadership: 4 } },
    { label: "Não dar entrevista", hint: "Sem exposição", result: "O silêncio evita a manchete, mas não a dúvida.", effect: { reputation: -1 } },
  ]},
  { id: "new-role", icon: "↔", tag: "TÁTICA", title: "O treinador enxerga outra função", description: "Ele quer você começando mais longe da sua posição de origem.", choices: [
    { label: "Aceitar o desafio", hint: "Versatilidade ↑ · OVR agora ↓", result: "Você sofre no começo e aprende algo que poucos dominam.", effect: { ovr: -1, potential: 3, minutes: 8 } },
    { label: "Defender sua posição", hint: "Confiança ↑ · minutos ↓", result: "A convicção ficou clara. A escalação, nem tanto.", effect: { morale: 4, minutes: -6 } },
    { label: "Propor um meio-termo", hint: "Equilíbrio", result: "Um ajuste tático mantém você perto de onde rende mais.", effect: { potential: 1, minutes: 3 } },
  ]},
  { id: "injury", icon: "+", tag: "DEPARTAMENTO MÉDICO", title: "O corpo mandou parar", description: "Uma fisgada encerra o treino. A pressa para voltar pode custar caro.", needsLowFitness: true, choices: [
    { label: "Tratar até zerar a dor", hint: "Tempo fora · recuperação segura", result: "Você volta sem medo de acelerar.", effect: { fitness: 18, ovr: -1, morale: -2 } },
    { label: "Acelerar o retorno", hint: "Minutos agora · risco de recaída", result: "Você volta cedo, ainda ouvindo o corpo reclamar.", effect: { fitness: 5, minutes: 5, injuryRisk: 12 } },
  ]},
  { id: "national-u20", icon: "★", tag: "SELEÇÃO", title: "A Seleção Sub-20 chamou", description: "Seu nome apareceu na convocação da categoria de base do seu país.", minOvr: 68, maxAge: 20, oneTime: true, choices: [
    { label: "Representar seu país", hint: "Convocado · reputação ↑↑", result: "O hino arrepia e seu nome ganha o país.", effect: { reputation: 10, fitness: -9, nationalBoost: 12, nationalCall: true } },
    { label: "Ficar no clube", hint: "Condição ↑ · seleção ↓", result: "Você ganha fôlego no clube e perde espaço no radar.", effect: { fitness: 12, nationalBoost: -8 } },
  ]},
  { id: "renewal", icon: "✎", tag: "CONTRATO", title: "A caneta está na mesa", description: "Seu contrato entra no último ano e o clube quer uma resposta.", minAge: 20, maxContractYears: 1, choices: [
    { label: "Renovar por identificação", hint: "3 anos · torcida ↑ · salário +8%", result: "A arquibancada trata a assinatura como um gol.", effect: { reputation: 7, morale: 5, money: 2, contractYears: 3, salaryBoost: 8 } },
    { label: "Exigir valorização", hint: "3 anos · salário +25% · pressão ↑", result: "O salário cresce junto com a cobrança.", effect: { money: 10, morale: -3, contractYears: 3, salaryBoost: 25 } },
    { label: "Esperar outras propostas", hint: "Mercado ↑ · risco", result: "Cada rodada agora também acontece fora de campo.", effect: { transfer: true, reputation: -2 } },
  ]},
  { id: "rival-offer", icon: "⇄", tag: "MERCADO", title: "Um rival ligou para seu empresário", description: "A proposta é grande e a repercussão seria ainda maior.", minAge: 21, minOvr: 72, choices: [
    { label: "Ouvir a proposta", hint: "Transferência possível", result: "A reunião termina com mais perguntas do que respostas.", effect: { transfer: true, money: 6 } },
    { label: "Recusar publicamente", hint: "Torcida ↑↑", result: "Seu nome vira canto na arquibancada.", effect: { reputation: 12, morale: 6 } },
    { label: "Usar na negociação", hint: "Dinheiro ↑ · confiança ↓", result: "A diretoria melhora a oferta e guarda a memória.", effect: { money: 8, reputation: -3 } },
  ]},
  { id: "fight", icon: "!", tag: "CAMPO", title: "Confusão depois da falta", description: "Um adversário chega forte em seu companheiro e o jogo esquenta.", choices: [
    { label: "Separar a confusão", hint: "Liderança ↑", result: "A cabeça fria evita uma noite pior.", effect: { leadership: 6, reputation: 2 } },
    { label: "Defender o companheiro", hint: "Grupo ↑ · suspensão possível", result: "O elenco fecha com você; o árbitro também anota.", effect: { morale: 8, fitness: -4, minutes: -3, discipline: -12 } },
    { label: "Sair de perto", hint: "Seguro", result: "Você preserva o jogo e escuta algumas cobranças depois.", effect: { morale: -2 } },
  ]},
  { id: "sponsorship", icon: "$", tag: "FORA DE CAMPO", title: "Sua primeira campanha", description: "Duas marcas querem associar a imagem ao seu momento.", minOvr: 70, oneTime: true, choices: [
    { label: "Marca nacional", hint: "Dinheiro ↑↑ · exposição ↑", result: "Seu rosto aparece por todo o país.", effect: { money: 14, reputation: 7, morale: -2 } },
    { label: "Marca da sua cidade", hint: "Torcida ↑ · dinheiro ↑", result: "A campanha parece uma homenagem às suas raízes.", effect: { money: 7, reputation: 8, morale: 4 } },
    { label: "Focar só no futebol", hint: "Evolução futura ↑", result: "A decisão surpreende e abre espaço para treinar.", effect: { potential: 2, fitness: 5 } },
  ]},
  { id: "rumor", icon: "?", tag: "MÍDIA", title: "Seu nome domina a janela", description: "Um perfil grande publica que sua saída está acertada. Ninguém falou com você.", minOvr: 72, choices: [
    { label: "Responder nas redes", hint: "Exposição ↑", result: "A postagem vira notícia antes do treino acabar.", effect: { reputation: 5, morale: -3 } },
    { label: "Deixar o clube falar", hint: "Profissionalismo ↑", result: "A nota oficial esfria o assunto.", effect: { leadership: 3, reputation: 2 } },
    { label: "Pedir reunião", hint: "Controle ↑ · mercado", result: "Agora você sabe exatamente quem está interessado.", effect: { transfer: true, morale: 3 } },
  ]},
  { id: "senior-national", icon: "SEL", tag: "SELEÇÃO", title: "Convocado para a Seleção principal", description: "O telefone toca durante o almoço. Você está na lista principal do seu país.", minOvr: 78, oneTime: true, choices: [
    { label: "Chegar para disputar vaga", hint: "Convocado · reputação ↑↑", result: "Você chega à concentração com os olhos de quem quer ficar.", effect: { reputation: 16, morale: 5, fitness: -7, nationalBoost: 20, nationalCall: true } },
    { label: "Aprender com o grupo", hint: "Convocado · evolução futura", result: "A primeira convocação vira uma aula de alto nível.", effect: { potential: 3, reputation: 10, nationalBoost: 12, nationalCall: true } },
  ]},
  { id: "divided-locker", icon: "╱", tag: "CRISE", title: "O vestiário se dividiu", description: "Resultados ruins criaram dois lados. Todos querem saber onde você está.", minAge: 23, choices: [
    { label: "Tentar unir o grupo", hint: "Liderança ↑↑", result: "A conversa não resolve tudo, mas muda o tom.", effect: { leadership: 10, morale: 5 } },
    { label: "Focar apenas no campo", hint: "OVR ↑ · grupo ↓", result: "Seu futebol cresce enquanto o silêncio pesa.", effect: { ovr: 1, morale: -5 } },
    { label: "Apoiar o treinador", hint: "Minutos ↑ · risco", result: "O técnico agradece. Parte do elenco não esquece.", effect: { minutes: 8, morale: -6 } },
  ]},
  { id: "title-run", icon: "🏆", tag: "RETA FINAL", title: "A liga está ao alcance", description: "Quatro rodadas. Três pontos de diferença. O campeonato inteiro acompanha cada passo.", minOvr: 76, choices: [
    { label: "Assumir a responsabilidade", hint: "Título ↑ · cansaço ↑", result: "A bola passa por você quando o jogo aperta.", effect: { titleBoost: 18, fitness: -12, reputation: 8 } },
    { label: "Confiar no coletivo", hint: "Título ↑ · grupo ↑", result: "O time joga leve e todo mundo entrega um pouco mais.", effect: { titleBoost: 10, morale: 10, leadership: 5 } },
    { label: "Tirar o peso do discurso", hint: "Condição ↑ · pressão ↓", result: "Você transforma a ansiedade em rotina.", effect: { titleBoost: 5, fitness: 8, morale: 6 } },
  ]},
  { id: "coach-fired", icon: "×", tag: "BASTIDORES", title: "O técnico caiu", description: "A demissão chega antes do treino. O novo comandante já está a caminho.", choices: [
    { label: "Agradecer publicamente", hint: "Respeito ↑", result: "A mensagem é curta e elegante.", effect: { reputation: 4, leadership: 3 } },
    { label: "Ficar em silêncio", hint: "Neutro", result: "Você espera o próximo capítulo sem alimentar manchetes.", effect: { morale: 1 } },
    { label: "Conversar com o novo técnico", hint: "Minutos ↑", result: "Você sai da sala sabendo o que precisa entregar.", effect: { minutes: 7, potential: 1 } },
  ]},
  { id: "big-club", icon: "↑", tag: "MERCADO", title: "Um gigante quer você", description: "O projeto oferece títulos, salário e uma disputa pesada por posição.", minOvr: 76, choices: [
    { label: "Aceitar o desafio", hint: "Transferência · pressão ↑", result: "A carreira ganha uma nova camisa e outro peso.", effect: { transfer: true, money: 12, reputation: 6, minutes: -5 } },
    { label: "Virar referência onde está", hint: "Torcida ↑↑ · liderança ↑", result: "Você escolhe construir algo que tenha seu rosto.", effect: { reputation: 12, leadership: 8, morale: 6 } },
  ]},
  { id: "scandal", icon: "#", tag: "MÍDIA", title: "Uma história fora de contexto", description: "Um vídeo antigo volta a circular e cresce mais rápido que a verdade.", minAge: 22, choices: [
    { label: "Explicar tudo", hint: "Risco · transparência", result: "A entrevista divide opiniões, mas coloca sua voz na história.", effect: { reputation: 3, morale: -4 } },
    { label: "Contratar assessoria", hint: "Dinheiro ↓ · dano controlado", result: "A crise termina sem virar temporada.", effect: { money: -5, reputation: 1 } },
    { label: "Ignorar", hint: "Moral ↑ · reputação ↓", result: "Você protege a cabeça e deixa a internet falar sozinha.", effect: { morale: 5, reputation: -5 } },
  ]},
  { id: "captain", icon: "C", tag: "LIDERANÇA", title: "A braçadeira espera sua resposta", description: "O treinador quer você como capitão do clube.", minAge: 24, minOvr: 78, oneTime: true, choices: [
    { label: "Aceitar a responsabilidade", hint: "Liderança ↑↑ · pressão", result: "A faixa aperta o braço e alarga sua história.", effect: { leadership: 15, reputation: 10, morale: -2, clubCaptain: true } },
    { label: "Indicar um veterano", hint: "Grupo ↑ · humildade", result: "Sua escolha fortalece o vestiário.", effect: { morale: 8, leadership: 5 } },
  ]},
  { id: "peak-injury", icon: "+", tag: "DECISÃO MÉDICA", title: "Dor na semana mais importante", description: "Você sente que algo não está certo. O jogo pode definir a temporada.", minOvr: 80, needsLowFitness: true, choices: [
    { label: "Jogar no sacrifício", hint: "Título ↑↑ · lesão ↑↑", result: "Você entra no gramado sem contar a verdade para o corpo.", effect: { titleBoost: 20, fitness: -20, injuryRisk: 20, reputation: 8 } },
    { label: "Confiar no tratamento", hint: "Recuperação segura", result: "A decisão é difícil, mas protege os próximos anos.", effect: { fitness: 18, morale: -3 } },
  ]},
  { id: "fan-pressure", icon: "▥", tag: "TORCIDA", title: "A arquibancada perdeu a paciência", description: "Vaias aparecem antes do primeiro toque na bola.", choices: [
    { label: "Pedir a bola mesmo assim", hint: "OVR ↑ · risco", result: "A coragem muda o barulho aos poucos.", effect: { ovr: 1, reputation: 5, fitness: -7 } },
    { label: "Simplificar o jogo", hint: "Seguro · moral ↑", result: "O básico bem feito reconstrói a confiança.", effect: { morale: 7, reputation: 2 } },
    { label: "Responder após o jogo", hint: "Exposição ↑↑", result: "A frase vira combustível para a próxima rodada.", effect: { reputation: 7, morale: -4 } },
  ]},
  { id: "family", icon: "⌂", tag: "VIDA", title: "A família pede mais de você", description: "A rotina de concentração e viagens começou a cobrar distância.", minAge: 22, choices: [
    { label: "Reservar tempo para casa", hint: "Moral ↑↑ · treino ↓", result: "Você volta ao clube com a cabeça no lugar.", effect: { morale: 12, fitness: 3, ovr: -1 } },
    { label: "Foco total na temporada", hint: "OVR ↑ · moral ↓", result: "O desempenho sobe, a saudade também.", effect: { ovr: 1, morale: -8 } },
    { label: "Buscar equilíbrio", hint: "Estável", result: "A agenda muda e ninguém precisa desaparecer.", effect: { morale: 5, fitness: 4 } },
  ]},
  { id: "record", icon: "∞", tag: "MARCA HISTÓRICA", title: "Um recorde está a uma temporada", description: "Você pode entrar para a história do clube, mas o time também tem suas urgências.", minAge: 27, minOvr: 78, choices: [
    { label: "Perseguir a marca", hint: "Estatísticas ↑ · coletivo ↓", result: "Cada jogo vira uma contagem regressiva.", effect: { reputation: 9, titleBoost: -5, minutes: 8 } },
    { label: "Priorizar o time", hint: "Título ↑ · liderança ↑", result: "O recorde espera; o vestiário não.", effect: { titleBoost: 10, leadership: 7 } },
  ]},
  { id: "return-home", icon: "↩", tag: "MERCADO", title: "O clube que revelou você quer sua volta", description: "A proposta não é a maior, mas vem carregada de memória.", minAge: 30, oneTime: true, choices: [
    { label: "Voltar para fechar o ciclo", hint: "Torcida ↑↑ · transferência", result: "O portão parece menor. A história, muito maior.", effect: { transfer: true, reputation: 15, morale: 10 } },
    { label: "Seguir no auge", hint: "Ambição ↑", result: "A volta fica guardada para outro capítulo.", effect: { morale: 4, money: 5 } },
  ]},
  { id: "late-injury", icon: "+", tag: "LONGEVIDADE", title: "O corpo já não recupera igual", description: "Uma lesão comum exige uma escolha diferente nesta fase da carreira.", minAge: 32, choices: [
    { label: "Recuperar sem prazo", hint: "Condição ↑↑ · OVR ↓", result: "Você escolhe voltar inteiro, não voltar rápido.", effect: { fitness: 20, ovr: -1, minutes: -6 } },
    { label: "Aceitar papel reduzido", hint: "Liderança ↑ · minutos ↓", result: "Sua voz passa a pesar tanto quanto suas pernas.", effect: { leadership: 10, morale: 5, minutes: -10 } },
  ]},
  { id: "ambassador", icon: "◇", tag: "LEGADO", title: "Um futuro no clube", description: "A diretoria oferece um papel de embaixador quando você parar de jogar.", minAge: 34, minOvr: 76, oneTime: true, choices: [
    { label: "Aceitar o vínculo", hint: "Legado ↑↑", result: "Sua relação com o clube ganha uma data depois da carreira.", effect: { reputation: 12, morale: 8, leadership: 6 } },
    { label: "Manter o futuro aberto", hint: "Liberdade ↑", result: "Você prefere decidir só quando tirar as chuteiras.", effect: { morale: 4 } },
  ]},
  { id: "last-season", icon: "⌛", tag: "DECISÃO", title: "É a última temporada?", description: "A pergunta aparece em toda entrevista e começa a aparecer dentro de você.", minAge: 35, oneTime: true, choices: [
    { label: "Anunciar a despedida", hint: "Homenagens ↑ · pressão ↓", result: "Cada estádio começa a tratar o jogo como memória.", effect: { reputation: 14, morale: 9 } },
    { label: "Jogar sem data para parar", hint: "Foco ↑ · físico ↓", result: "Você deixa o futebol dar a última palavra.", effect: { fitness: -5, ovr: 1 } },
    { label: "Parar agora", hint: "Encerrar carreira", result: "Você escolhe o momento em vez de esperar por ele.", effect: { retire: true, reputation: 8 } },
  ]},
  { id: "decisive-penalty", icon: "◎", tag: "MOMENTO DECISIVO", title: "A bola está na marca", description: "Último minuto. O estádio inteiro prende a respiração.", minOvr: 72, choices: [
    { label: "Tentar uma cavadinha", hint: "42% · OVR +3 ou −3", result: "Você escolhe transformar um pênalti em memória.", effect: {}, luck: { chance: 42, successText: "A bola sobe devagar, o goleiro cai e o estádio explode. Nasceu um lance para sempre.", failureText: "O goleiro fica parado e encaixa. O silêncio parece não acabar.", successEffect: { ovr: 3, morale: 18, reputation: 15, titleBoost: 18, fans: 16 }, failureEffect: { ovr: -3, morale: -20, reputation: -10, titleBoost: -12, fans: -15 } } },
    { label: "Esperar o goleiro", hint: "67% · ganho menor", result: "Um segundo parece durar uma temporada inteira.", effect: {}, luck: { chance: 67, successText: "Você espera até o limite e desloca o goleiro com frieza.", failureText: "A hesitação entrega o canto e o goleiro alcança.", successEffect: { leadership: 6, reputation: 7, titleBoost: 9, morale: 6 }, failureEffect: { morale: -9, reputation: -3, titleBoost: -4 } } },
    { label: "Entregar ao capitão", hint: "Coletivo · seguro", result: "A responsabilidade muda de pé, não de peso.", effect: { morale: 4, leadership: 2, titleBoost: 3 } },
  ]},
  { id: "mysterious", icon: "?", tag: "RISCO", title: "O suplemento sem rótulo", description: "Alguém garante que todo mundo usa. Ninguém quer colocar o nome na embalagem.", minAge: 20, maxAge: 32, oneTime: true, choices: [
    { label: "Recusar na hora", hint: "Profissionalismo ↑", result: "Você perde um atalho e preserva a carreira.", effect: { reputation: 5, leadership: 3 } },
    { label: "Pedir análise do clube", hint: "Seguro · relação médica ↑", result: "O produto some antes do resultado chegar.", effect: { morale: 3, fitness: 3 } },
  ]},
  { id: "shirt-number", icon: "10", tag: "IDENTIDADE", title: "A camisa que você sempre quis", description: "O número ficou livre e o roupeiro pergunta se você quer assumir o peso.", minOvr: 77, oneTime: true, choices: [
    { label: "Assumir a camisa", hint: "Reputação ↑ · pressão ↑", result: "O número parece maior quando aparece nas suas costas.", effect: { reputation: 8, morale: -2 } },
    { label: "Manter seu número", hint: "Identidade ↑", result: "Você decide que sua história não precisa de outro símbolo.", effect: { morale: 7, reputation: 3 } },
  ]},
  { id: "club-crisis", icon: "↓", tag: "CRISE", title: "O clube entrou na zona de pressão", description: "Resultados ruins, cobrança na porta e uma proposta chegando por fora.", minAge: 23, choices: [
    { label: "Ficar e liderar a reação", hint: "Liderança ↑↑ · título ↓", result: "Você fica quando seria mais fácil sair.", effect: { leadership: 12, reputation: 8, titleBoost: -10 } },
    { label: "Buscar novos ares", hint: "Transferência", result: "A decisão divide a torcida e abre outra porta.", effect: { transfer: true, morale: 4, reputation: -3 } },
  ]},
  { id: "young-prospect", icon: "★", tag: "ELENCO", title: "Chegou uma promessa para sua posição", description: "O clube apresenta um garoto que lembra muito você alguns anos atrás.", minAge: 26, choices: [
    { label: "Virar mentor", hint: "Liderança ↑↑ · minutos ↓", result: "Você ensina o que ninguém colocou em contrato.", effect: { leadership: 12, minutes: -5, reputation: 5 } },
    { label: "Competir por cada minuto", hint: "OVR ↑ · físico ↓", result: "O treino ganha intensidade de jogo grande.", effect: { ovr: 1, fitness: -10, minutes: 4 } },
  ]},
  { id: "libertadores-away", icon: "LIB", tag: "LIBERTADORES", title: "Noventa minutos contra um continente", description: "O estádio ferve, o gramado prende e cada dividida parece valer uma taça.", needsLibertadores: true, choices: [
    { label: "Esfriar o jogo", hint: "Liderança ↑ · título ↑", result: "Você transforma barulho em relógio e conduz o time para fora da pressão.", effect: { leadership: 6, titleBoost: 9, fans: 4 } },
    { label: "Responder na intensidade", hint: "Torcida ↑↑ · físico ↓", result: "A atuação vira daqueles vídeos que a torcida revê por anos.", effect: { titleBoost: 12, fitness: -12, reputation: 7, fans: 9 } },
  ]},
  { id: "altitude", icon: "▲", tag: "LIBERTADORES", title: "A bola corre onde falta ar", description: "A viagem para a altitude muda o corpo, o passe e o plano do treinador.", needsLibertadores: true, choices: [
    { label: "Dosar o ritmo", hint: "Seguro · físico ↑", result: "Você escolhe os momentos e termina inteiro.", effect: { fitness: 7, titleBoost: 5 } },
    { label: "Pressionar desde o início", hint: "Título ↑↑ · risco físico", result: "O time surpreende antes que o pulmão cobre a conta.", effect: { titleBoost: 14, fitness: -15, injuryRisk: 8 } },
  ]},
  { id: "world-stage", icon: "MUN", tag: "MUNDIAL", title: "O planeta está olhando", description: "Depois do título continental, chegou a camisa que domina o outro lado do mundo.", needsWorld: true, choices: [
    { label: "Jogar sem complexo", hint: "Mundial ↑↑ · reputação ↑", result: "O primeiro duelo mostra que o escudo não entra sozinho em campo.", effect: { titleBoost: 18, reputation: 12, fans: 10, fitness: -8 } },
    { label: "Fechar espaços e sobreviver", hint: "Mundial ↑ · seguro", result: "Cada minuto vivo aumenta a crença do time.", effect: { titleBoost: 11, leadership: 7, morale: 5 } },
  ]},
  { id: "cup-semi", icon: "COPA", tag: "COPA NACIONAL", title: "Uma noite de mata-mata", description: "O primeiro jogo deixou tudo aberto. Um lance pode valer calendário e milhões.", choices: [
    { label: "Atacar a vaga", hint: "Copa ↑↑ · risco ↑", result: "Você joga a partida como se não existisse amanhã.", effect: { titleBoost: 14, fitness: -10, injuryRisk: 5, fans: 6 } },
    { label: "Controlar a eliminatória", hint: "Liderança ↑ · Copa ↑", result: "A ansiedade fica na arquibancada; dentro do campo, você dita o ritmo.", effect: { titleBoost: 8, leadership: 6 } },
  ]},
  { id: "supporters-meeting", icon: "▥", tag: "TORCIDA", title: "A organizada pediu conversa", description: "A fase pesa e três representantes esperam o elenco depois do treino.", choices: [
    { label: "Falar de frente", hint: "Torcida ↑↑ · pressão", result: "Você não promete taça, promete que ninguém vai se esconder.", effect: { fans: 12, leadership: 8, morale: -3 } },
    { label: "Deixar a diretoria responder", hint: "Seguro · torcida ↓", result: "A reunião acaba sem sua voz e a distância aumenta.", effect: { fans: -7, morale: 2 } },
  ]},
  { id: "community-project", icon: "♡", tag: "LEGADO", title: "Um campo novo no seu bairro", description: "Uma ONG quer seu nome e sua presença num projeto para crianças.", minAge: 21, oneTime: true, choices: [
    { label: "Financiar e participar", hint: "Dinheiro ↓ · torcida ↑↑", result: "A inauguração lembra por que o sonho começou.", effect: { money: -6, fans: 16, reputation: 8, morale: 8 } },
    { label: "Apenas divulgar", hint: "Torcida ↑ · exposição", result: "A campanha cresce, mesmo com você vendo tudo de longe.", effect: { fans: 6, reputation: 4 } },
  ]},
  { id: "new-agent", icon: "§", tag: "CARREIRA", title: "Um empresário promete o próximo nível", description: "Ele fala em salário, exposição e uma lista de clubes interessados.", minAge: 20, choices: [
    { label: "Trocar de empresário", hint: "Mercado ↑ · dinheiro ↓", result: "O telefone toca mais; a comissão também pesa.", effect: { transfer: true, money: -4, reputation: 4 } },
    { label: "Manter quem veio com você", hint: "Lealdade · torcida ↑", result: "A carreira segue com menos holofote e mais confiança.", effect: { morale: 7, fans: 5, leadership: 3 } },
  ]},
  { id: "documentary", icon: "▶", tag: "MÍDIA", title: "Uma série quer filmar sua temporada", description: "Câmeras no treino, em casa e no vestiário podem transformar você em personagem nacional.", minOvr: 76, choices: [
    { label: "Abrir todas as portas", hint: "Fama ↑↑ · privacidade ↓", result: "O país conhece sua rotina — e começa a opinar sobre ela.", effect: { reputation: 13, money: 8, morale: -6, fans: 5 } },
    { label: "Mostrar só o campo", hint: "Reputação ↑ · foco", result: "A série encontra drama no futebol, não na sua casa.", effect: { reputation: 6, morale: 3 } },
    { label: "Recusar", hint: "Foco ↑ · dinheiro ↓", result: "As câmeras vão embora e o treino volta a ser só treino.", effect: { fitness: 5, potential: 1 } },
  ]},
  { id: "penalty-dispute", icon: "◎", tag: "VESTIÁRIO", title: "Dois jogadores, uma cobrança", description: "O batedor oficial segura a bola. A torcida grita seu nome.", minOvr: 74, choices: [
    { label: "Pedir a bola", hint: "Protagonismo · torcida ↑", result: "Você chama a responsabilidade diante de todo mundo.", effect: { reputation: 7, fans: 8, titleBoost: 5, morale: 4 } },
    { label: "Respeitar a hierarquia", hint: "Grupo ↑ · liderança ↑", result: "O gesto é pequeno para a arquibancada e enorme no elenco.", effect: { leadership: 7, morale: 6 } },
  ]},
  { id: "experimental-surgery", icon: "+", tag: "APOSTA MÉDICA", title: "Um procedimento pode mudar seu corpo", description: "O especialista promete uma recuperação acima do normal, mas o método ainda divide opiniões.", minAge: 22, maxAge: 31, oneTime: true, choices: [
    { label: "Aceitar o procedimento", hint: "55% · renascer ou piorar muito", result: "Você assina sabendo que não existe garantia.", effect: { money: -5 }, luck: { chance: 55, successText: "A recuperação surpreende até os médicos. Seu corpo volta mais forte e sem medo.", failureText: "A resposta do corpo é ruim. Meses de tratamento viram um passo doloroso para trás.", successEffect: { ovr: 3, fitness: 28, potential: 2, morale: 12 }, failureEffect: { ovr: -5, fitness: -25, morale: -18, reputation: -4 } } },
    { label: "Seguir o tratamento tradicional", hint: "Seguro · recuperação lenta", result: "Você troca o atalho por um caminho conhecido.", effect: { fitness: 13, morale: 3, minutes: -4 } },
  ]},
  { id: "position-reinvention", icon: "↝", tag: "REINVENÇÃO", title: "Uma posição pode salvar sua carreira", description: "O treinador vê uma função inesperada para você. A mudança pode abrir um novo teto ou tirar seu espaço.", minAge: 24, choices: [
    { label: "Mudar completamente", hint: "50% · OVR +4 ou −3", result: "Você começa do zero em detalhes que pareciam automáticos.", effect: {}, luck: { chance: 50, successText: "A função encaixa como se sempre tivesse sido sua. O time passa a girar ao seu redor.", failureText: "A adaptação nunca chega. Você perde confiança e minutos importantes.", successEffect: { ovr: 4, potential: 2, minutes: 10, reputation: 9 }, failureEffect: { ovr: -3, minutes: -12, morale: -14, reputation: -4 } } },
    { label: "Ajustar só alguns movimentos", hint: "Evolução pequena · seguro", result: "Você amplia o repertório sem abandonar sua identidade.", effect: { potential: 1, minutes: 3, leadership: 2 } },
  ]},
  { id: "play-through-pain", icon: "⚡", tag: "SACRIFÍCIO", title: "A dor antes do jogo decisivo", description: "O exame não proíbe sua entrada, mas também não promete que você terminará inteiro.", minOvr: 74, choices: [
    { label: "Tomar a infiltração e jogar", hint: "46% · herói ou lesão grave", result: "Você esconde a dor sob a meia e entra.", effect: { titleBoost: 5 }, luck: { chance: 46, successText: "O corpo aguenta e você decide a partida no limite. A torcida nunca esquecerá.", failureText: "A perna trava cedo. O sacrifício vira uma lesão que atravessa a temporada.", successEffect: { ovr: 2, titleBoost: 20, fans: 18, reputation: 12, morale: 10 }, failureEffect: { ovr: -4, fitness: -30, injuryRisk: 25, morale: -16, titleBoost: -9 } } },
    { label: "Ficar fora e tratar", hint: "Protege a carreira · moral ↓", result: "Você assiste do banco e escolhe preservar os próximos anos.", effect: { fitness: 17, morale: -5, minutes: -7 } },
  ]},
  { id: "viral-dribble", icon: "▶", tag: "FAMA", title: "O drible que pode rodar o mundo", description: "No fim do treino, um produtor desafia você a repetir um lance absurdo diante das câmeras.", minAge: 18, maxAge: 29, choices: [
    { label: "Tentar diante das câmeras", hint: "40% · fama ou vexame", result: "A gravação começa e não há segunda tomada.", effect: {}, luck: { chance: 40, successText: "O lance sai perfeito e invade milhões de telas. Seu nome deixa de ser só futebol.", failureText: "A tentativa dá errado de um jeito impossível de esconder. A internet não perdoa.", successEffect: { reputation: 15, fans: 14, money: 10, morale: 8 }, failureEffect: { reputation: -8, fans: -9, morale: -13 } } },
    { label: "Recusar e voltar ao treino", hint: "Foco · condição ↑", result: "Você deixa a câmera esperando e termina a sessão.", effect: { fitness: 7, leadership: 2 } },
  ]},
  { id: "radical-bulk", icon: "◆", tag: "PREPARAÇÃO", title: "Um plano físico radical", description: "O preparador propõe ganhar força em poucas semanas. A explosão pode vir acompanhada de perda de mobilidade.", maxAge: 29, choices: [
    { label: "Seguir o plano completo", hint: "54% · OVR +3 ou −2", result: "Dieta, carga e sono passam a controlar sua rotina.", effect: { morale: -3 }, luck: { chance: 54, successText: "A potência aparece sem roubar velocidade. Você volta irreconhecível.", failureText: "O peso novo trava seus movimentos e sobrecarrega o corpo.", successEffect: { ovr: 3, fitness: 14, potential: 1 }, failureEffect: { ovr: -2, fitness: -18, injuryRisk: 12, morale: -8 } } },
    { label: "Evoluir aos poucos", hint: "Condição ↑ · seguro", result: "O progresso é discreto, mas o corpo acompanha.", effect: { fitness: 9, potential: 1 } },
  ]},
  { id: "lib-final-gamble", icon: "LIB", tag: "FINAL DA LIBERTADORES", title: "Uma troca pode decidir a América", description: "O treinador pergunta se você aceita atuar no limite, fora da zona de conforto, durante a final.", minOvr: 78, needsLibertadores: true, choices: [
    { label: "Aceitar a missão impossível", hint: "34% · noite histórica ou desastre", result: "O plano inteiro passa por sua coragem.", effect: {}, luck: { chance: 34, successText: "A mudança desmonta o adversário. Sua atuação entra para a história da Libertadores.", failureText: "O rival encontra o espaço deixado por você. A final escapa diante do continente.", successEffect: { ovr: 4, titleBoost: 28, reputation: 18, fans: 20, morale: 14 }, failureEffect: { ovr: -3, titleBoost: -18, morale: -19, reputation: -7, fans: -8 } } },
    { label: "Manter sua função", hint: "Libertadores ↑ · seguro", result: "Você escolhe fazer muito bem aquilo que trouxe o time até aqui.", effect: { titleBoost: 10, leadership: 5, morale: 5 } },
  ]},
  { id: "world-final-gamble", icon: "MUN", tag: "MUNDIAL", title: "O último ataque contra o mundo", description: "O gigante europeu recua. O treinador oferece a você a bola e uma liberdade que pode custar o jogo.", minOvr: 82, needsWorld: true, choices: [
    { label: "Ir para tudo ou nada", hint: "22% · glória máxima ou queda", result: "Você avança deixando o medo e a defesa para trás.", effect: {}, luck: { chance: 22, successText: "O impossível acontece. Seu lance derruba o favorito e muda o tamanho da sua carreira.", failureText: "A bola é perdida, o contra-ataque vem e o sonho termina do outro lado do campo.", successEffect: { ovr: 5, titleBoost: 35, reputation: 22, fans: 25, morale: 18 }, failureEffect: { ovr: -3, titleBoost: -20, reputation: -8, fans: -10, morale: -18 } } },
    { label: "Levar o jogo até o fim", hint: "Mundial ↑ · mais seguro", result: "O time fecha os espaços e espera uma chance menos cruel.", effect: { titleBoost: 12, leadership: 8, fitness: -6 } },
  ]},
  { id: "agent-ultimatum", icon: "§", tag: "EMPRESÁRIO", title: "Uma promessa grande demais", description: "Seu agente diz que pode dobrar seu valor e abrir o mercado, mas exige controle total sobre a carreira.", minAge: 21, choices: [
    { label: "Entregar a carreira ao agente", hint: "45% · mercado explode ou some", result: "Você assina uma procuração que parece pequena demais para tanto poder.", effect: { money: -4 }, luck: { chance: 45, successText: "As portas se abrem. Clubes, marcas e imprensa passam a disputar sua atenção.", failureText: "As promessas evaporam e você descobre cláusulas que afastam interessados.", successEffect: { transfer: true, money: 18, reputation: 12, morale: 5 }, failureEffect: { money: -10, reputation: -9, morale: -15, fans: -5 } } },
    { label: "Manter o controle", hint: "Estabilidade · liderança ↑", result: "Você recusa o brilho rápido e preserva a própria voz.", effect: { leadership: 6, morale: 5, fans: 3 } },
  ]},
  { id: "captain-guarantee", icon: "C", tag: "PROMESSA", title: "A promessa impossível no túnel", description: "Antes de uma sequência brutal, o elenco pede uma frase. Você pode prometer algo que talvez ninguém consiga cumprir.", minAge: 24, choices: [
    { label: "Prometer o título", hint: "38% · impacto enorme", result: "Você coloca a própria palavra no centro da temporada.", effect: {}, luck: { chance: 38, successText: "A promessa vira combustível e o grupo acredita até o último minuto.", failureText: "A sequência desmorona e suas palavras voltam como cobrança.", successEffect: { titleBoost: 24, leadership: 14, fans: 12, morale: 13 }, failureEffect: { titleBoost: -13, leadership: -6, fans: -14, morale: -16, reputation: -7 } } },
    { label: "Pedir trabalho, não promessa", hint: "Liderança ↑ · seguro", result: "O discurso não vira manchete, mas organiza o vestiário.", effect: { leadership: 7, morale: 6, titleBoost: 5 } },
  ]},
  { id: "solo-training-camp", icon: "⌁", tag: "ENTRETEMPORADA", title: "Trinta dias longe do clube", description: "Uma equipe particular oferece um ciclo secreto de treino. Você voltaria diferente — para melhor ou pior.", minAge: 19, maxAge: 28, oneTime: true, choices: [
    { label: "Sumir por um mês e apostar", hint: "48% · salto ou regressão", result: "Você troca as férias por um laboratório de futebol.", effect: { money: -6, morale: -4 }, luck: { chance: 48, successText: "O método destrava movimentos e decisões que pareciam inalcançáveis.", failureText: "A carga é errada, o corpo chega pesado e os fundamentos perdem naturalidade.", successEffect: { ovr: 4, potential: 2, fitness: 8 }, failureEffect: { ovr: -4, potential: -2, fitness: -14, morale: -10 } } },
    { label: "Treinar com o clube", hint: "Condição ↑ · sem surpresa", result: "Você escolhe estrutura conhecida e progresso controlado.", effect: { fitness: 10, morale: 3 } },
  ]},
  { id: "short-vacation", icon: "⌛", tag: "CALENDÁRIO", title: "Doze dias até a reapresentação", description: "A temporada foi longa e o próximo ano já bate na porta.", choices: [
    { label: "Descansar de verdade", hint: "Físico ↑↑ · OVR estável", result: "Você desliga o telefone e deixa o corpo respirar.", effect: { fitness: 16, morale: 8 } },
    { label: "Treinar nas férias", hint: "OVR ↑ · desgaste", result: "Você volta na frente — mas sem ter parado.", effect: { ovr: 1, fitness: -8, potential: 1 } },
    { label: "Viajar com o elenco", hint: "Grupo ↑ · físico ↑", result: "A amizade também sustenta temporadas difíceis.", effect: { morale: 10, fitness: 6, leadership: 3 } },
  ]},
  { id: "new-language", icon: "☰", tag: "EUROPA", title: "Uma língua nova todos os dias", description: "As instruções do treinador ainda soam estranhas. O elenco espera você se virar sozinho.", needsAbroad: true, oneTime: true, choices: [
    { label: "Contratar aulas particulares", hint: "Adaptação ↑↑ · dinheiro ↓", result: "Cada treino fica um pouco mais claro.", effect: { adaptation: 18, money: -3 } },
    { label: "Aprender no dia a dia", hint: "Adaptação ↑ · mais lento", result: "Você entende primeiro pelos gestos, depois pelas palavras.", effect: { adaptation: 8, morale: 2 } },
  ]},
  { id: "cold-weather", icon: "❄", tag: "EUROPA", title: "O inverno que o corpo não conhecia", description: "Treinar sob zero graus é uma novidade que ninguém avisou.", needsAbroad: true, choices: [
    { label: "Ajustar a rotina ao clima", hint: "Adaptação ↑ · físico ↑", result: "Aquecimento mais longo, roupas certas, corpo protegido.", effect: { adaptation: 10, fitness: 5 } },
    { label: "Treinar igual sempre treinou", hint: "Risco de lesão", result: "O orgulho ignora o termômetro — o corpo cobra depois.", effect: { fitness: -8, injuryRisk: 6 } },
  ]},
  { id: "bench-abroad", icon: "▰", tag: "EUROPA", title: "O banco também tem sotaque", description: "A concorrência por posição na Europa é outro nível. Seu nome não sai da lista de reservas.", needsAbroad: true, maxOvr: 84, choices: [
    { label: "Insistir no dia a dia", hint: "Chance de minutos", result: "Cada treino vira uma audição silenciosa.", effect: { reputation: 1, minutes: 6, fitness: -4 } },
    { label: "Pedir um projeto menor na Europa", hint: "Minutos ↑ · novo clube europeu", result: "Você troca a vitrine por bola rolando de verdade em outra equipe.", effect: { transfer: true, transferAbroad: true, minutes: 10, reputation: -2 } },
  ]},
  { id: "eu-passport", icon: "◇", tag: "EUROPA", title: "O passaporte que facilita tudo", description: "Depois de meses de papelada, o documento europeu finalmente sai.", needsAbroad: true, oneTime: true, choices: [
    { label: "Comemorar o novo status", hint: "Adaptação ↑ · burocracia a menos", result: "Viagens, contratos e a vida diária ficam mais simples.", effect: { adaptation: 12, morale: 5 } },
  ]},
  { id: "european-press", icon: "●", tag: "EUROPA", title: "A imprensa local não perdoa", description: "Um jornal publica que você não vale o que custou. A resposta vem em campo ou fora dele.", needsAbroad: true, minAge: 20, choices: [
    { label: "Responder com atuação", hint: "OVR ↑ · pressão", result: "O silêncio da bola calou o texto.", effect: { ovr: 1, reputation: 5, fitness: -6 } },
    { label: "Ignorar e focar no grupo", hint: "Moral ↑", result: "Você aprende que nem toda manchete merece resposta.", effect: { morale: 6, adaptation: 4 } },
  ]},
  { id: "euro-derby", icon: "⚔", tag: "EUROPA", title: "Seu primeiro clássico europeu", description: "A cidade inteira muda de cor. Você nunca viu uma rivalidade tão antiga de tão perto.", needsAbroad: true, minOvr: 70, choices: [
    { label: "Abraçar a rivalidade", hint: "Torcida ↑↑ · físico ↓", result: "Você entende, em noventa minutos, séculos de história.", effect: { fans: 10, reputation: 6, fitness: -6 } },
    { label: "Tratar como um jogo normal", hint: "Seguro", result: "A frieza rende uma boa atuação e pouca conexão com a torcida.", effect: { reputation: 3, adaptation: 5 } },
  ]},
  { id: "champions-debut", icon: "★", tag: "CHAMPIONS", title: "As luzes da Champions acendem", description: "O hino toca antes do jogo e o peito aperta de um jeito diferente.", needsAbroad: true, needsContinental: "champions", oneTime: true, choices: [
    { label: "Jogar sem medo do palco", hint: "Reputação ↑↑ · risco", result: "Você decide não guardar nada para depois.", effect: { titleBoost: 10, reputation: 10, fitness: -6 } },
    { label: "Jogar dentro do combinado", hint: "Seguro · confiança do técnico", result: "Fazer o simples bem feito também é vencer a noite.", effect: { titleBoost: 6, leadership: 4 } },
  ]},
  { id: "europa-league-night", icon: "UEL", tag: "EUROPA LEAGUE", title: "Uma quinta-feira que vale uma temporada", description: "A viagem é longa, o estádio é hostil e a Europa League virou o caminho mais curto para mudar de patamar.", needsAbroad: true, needsContinental: "europa", choices: [
    { label: "Tratar como a grande chance", hint: "Título ↑↑ · desgaste", result: "Você joga como se não existisse competição menor.", effect: { titleBoost: 12, reputation: 7, fitness: -8 } },
    { label: "Controlar o calendário", hint: "Título ↑ · físico preservado", result: "O time avança sem transformar cada partida em desespero.", effect: { titleBoost: 6, fitness: 5, leadership: 3 } },
  ]},
  { id: "conference-breakthrough", icon: "UECL", tag: "CONFERENCE", title: "A Europa começa por uma porta menor", description: "A Conference League não traz o maior holofote, mas pode entregar a primeira taça continental da sua carreira.", needsAbroad: true, needsContinental: "conference", maxOvr: 84, choices: [
    { label: "Caçar a primeira taça", hint: "Título ↑↑ · torcida ↑", result: "Você abraça a competição e puxa o elenco junto.", effect: { titleBoost: 14, fans: 8, fitness: -7 } },
    { label: "Usar os jogos para evoluir", hint: "Minutos ↑ · evolução futura", result: "Cada viagem vira experiência e espaço no time.", effect: { minutes: 8, potential: 1, reputation: 3 } },
  ]},
  { id: "homesickness", icon: "⌂", tag: "EUROPA", title: "A saudade que ninguém vê no campo", description: "As ligações para casa ficam mais longas e o fuso horário nunca ajuda.", needsAbroad: true, choices: [
    { label: "Trazer a família para perto", hint: "Moral ↑↑ · dinheiro ↓", result: "A casa nova finalmente parece uma casa.", effect: { morale: 14, adaptation: 8, money: -4 } },
    { label: "Visitar casa na pausa", hint: "Moral ↑ · adaptação ↓", result: "Duas semanas recarregam o coração e atrasam a rotina nova.", effect: { morale: 9, adaptation: -4 } },
    { label: "Focar no trabalho", hint: "OVR ↑ · moral ↓", result: "Você empurra a saudade para depois da temporada.", effect: { ovr: 1, morale: -6 } },
  ]},
  { id: "loan-spell", icon: "⇄", tag: "EUROPA", title: "Um empréstimo pode salvar sua temporada", description: "Sem espaço no elenco principal, o clube sugere sair para jogar de verdade em outro lugar da Europa.", needsAbroad: true, maxOvr: 82, minAge: 20, choices: [
    { label: "Aceitar um projeto menor", hint: "Empréstimo · minutos ↑↑", result: "Você sai por empréstimo: troca o banco por protagonismo sem romper com o clube.", effect: { transfer: true, transferAbroad: true, loan: true, minutes: 12, reputation: 2 } },
    { label: "Brigar pelo seu espaço", hint: "OVR ↑ · risco", result: "Ficar é uma aposta em você mesmo.", effect: { ovr: 1, fitness: -8, minutes: 3 } },
  ]},
  { id: "european-exit", icon: "↩", tag: "EUROPA", title: "A Europa não deu certo como sonhado", description: "Meses depois da mudança, a adaptação ainda não veio e o telefone toca com uma saída para o Brasil.", needsAbroad: true, minAge: 21, choices: [
    { label: "Voltar para o Brasil", hint: "Transferência · moral ↑", result: "Nem toda aventura precisa terminar em taça para valer a pena.", effect: { transfer: true, morale: 8, reputation: -3 } },
    { label: "Insistir mais uma temporada", hint: "Adaptação ↑ · paciência", result: "Você aposta que o próximo ano é diferente.", effect: { adaptation: 15, morale: -2 } },
  ]},
  { id: "youth-or-club", icon: "★", tag: "SELEÇÃO", title: "O clube pede para poupar você da base da Seleção", description: "O departamento médico do clube sugere recusar a convocação de base para preservar sua temporada.", needsNationalYouth: true, choices: [
    { label: "Defender a Seleção mesmo assim", hint: "Convocado · físico ↓", result: "Vestir a camisa da base pesa mais que qualquer planilha de carga.", effect: { nationalBoost: 12, fitness: -8, reputation: 4, nationalCall: true } },
    { label: "Seguir o pedido do clube", hint: "Físico ↑ · Seleção ↓", result: "O clube agradece; a comissão técnica da Seleção anota a ausência.", effect: { fitness: 10, nationalBoost: -8 } },
  ]},
  { id: "olympics-call", icon: "◎", tag: "OLIMPÍADAS", title: "Uma vaga na lista olímpica", description: "Os Jogos Olímpicos caem no meio da pré-temporada. Nem todo clube libera de bom grado.", needsNationalYouth: true, nationalWindow: "olympics", minAge: 21, oneTime: true, choices: [
    { label: "Aceitar disputar os Jogos", hint: "Convocado · título ↑↑", result: "Uma medalha olímpica não aparece duas vezes na vida.", effect: { nationalTitleBoost: 14, nationalBoost: 10, fitness: -10, nationalCall: true } },
    { label: "Priorizar a pré-temporada", hint: "Físico ↑ · Seleção ↓", result: "O ciclo olímpico segue sem o seu nome desta vez.", effect: { fitness: 10, nationalBoost: -6 } },
  ]},
  { id: "injured-for-country", icon: "+", tag: "SELEÇÃO", title: "Jogar mesmo sentindo dor", description: "A convocação chegou, mas o corpo avisa que algo não está bem antes da viagem.", needsNationalMain: true, needsLowFitness: true, choices: [
    { label: "Viajar e jogar assim mesmo", hint: "Seleção ↑↑ · lesão ↑↑", result: "A camisa da Seleção pesa mais que a dor no momento da escolha.", effect: { nationalTitleBoost: 12, fitness: -18, injuryRisk: 15, reputation: 6 } },
    { label: "Comunicar o departamento médico", hint: "Seguro · desfalque", result: "Você entrega a vaga a outro companheiro e cuida do corpo.", effect: { fitness: 14, nationalBoost: -4 } },
  ]},
  { id: "national-penalty", icon: "◎", tag: "SELEÇÃO", title: "Pênaltis pela Seleção", description: "O jogo termina empatado e o técnico monta a lista de batedores. Seu nome está nela.", needsNationalMain: true, nationalWindow: "major", minOvr: 76, choices: [
    { label: "Bater com confiança", hint: "38% · herói ou vilão nacional", result: "Você pede a bola sabendo o tamanho do momento.", effect: { nationalCall: true }, luck: { chance: 38, successText: "A cobrança entra e o país inteiro celebra o seu nome.", failureText: "O goleiro adivinha o canto. O silêncio do país dói mais que qualquer vaia de clube.", successEffect: { reputation: 16, nationalTitleBoost: 22, fans: 10, morale: 12 }, failureEffect: { reputation: -10, nationalTitleBoost: -16, morale: -18 } } },
    { label: "Pedir para não bater", hint: "Convocado · sem protagonismo", result: "Você entrega a responsabilidade a um companheiro mais experiente.", effect: { leadership: 4, morale: 2, nationalCall: true } },
  ]},
  { id: "continental-final", icon: "★", tag: "FINAL CONTINENTAL", title: "A final que o continente inteiro assiste", description: "Depois de semanas de torneio, sua Seleção chegou à decisão.", needsNationalMain: true, nationalWindow: "continental", minOvr: 78, choices: [
    { label: "Assumir o protagonismo", hint: "Título da Seleção ↑↑ · cansaço", result: "Você quer a bola nos momentos que decidem histórias.", effect: { nationalTitleBoost: 20, fitness: -12, reputation: 10, nationalCall: true } },
    { label: "Jogar pelo coletivo", hint: "Título da Seleção ↑ · seguro", result: "Onze jogando juntos pesa mais que um nome só.", effect: { nationalTitleBoost: 12, leadership: 6, nationalCall: true } },
  ]},
  { id: "qualifiers-pressure", icon: "ELIM", tag: "ELIMINATÓRIAS", title: "A vaga no Mundial não vem fácil", description: "As eliminatórias estão apertadas e cada convocação pesa mais que o normal.", needsNationalMain: true, nationalWindow: "qualifiers", choices: [
    { label: "Assumir a responsabilidade em campo", hint: "Classificação ↑ · físico ↓", result: "Você entende que essas partidas valem mais do que os noventa minutos mostram.", effect: { nationalTitleBoost: 10, fitness: -8, reputation: 4, nationalCall: true } },
    { label: "Confiar no trabalho da comissão técnica", hint: "Convocado · abordagem segura", result: "Você faz sua parte sem carregar o peso do grupo inteiro.", effect: { nationalTitleBoost: 5, morale: 3, nationalCall: true } },
  ]},
  { id: "surprise-call", icon: "?", tag: "SELEÇÃO", title: "Uma convocação que ninguém esperava", description: "Seu nome aparece numa lista que parecia distante demais para esta fase da carreira.", minAge: 17, maxAge: 29, oneTime: true, choices: [
    { label: "Abraçar a surpresa", hint: "Convocado · pressão ↑", result: "Você decide aproveitar cada segundo dessa chance inesperada.", effect: { nationalBoost: 16, reputation: 8, morale: 6, nationalCall: true } },
    { label: "Manter os pés no chão", hint: "Convocado · postura segura", result: "Você trata a convocação como trabalho, não como troféu.", effect: { nationalBoost: 10, leadership: 3, nationalCall: true } },
  ]},
  { id: "painful-cut", icon: "×", tag: "SELEÇÃO", title: "Fora da lista pela primeira vez em anos", description: "Depois de temporadas como presença certa, seu nome não aparece na convocação mais recente.", needsNationalMain: true, minAge: 26, choices: [
    { label: "Cobrar uma resposta de si mesmo", hint: "OVR ↑ · moral ↓", result: "O corte dói, mas vira combustível para o próximo ciclo.", effect: { ovr: 1, morale: -8, fitness: -3 } },
    { label: "Aceitar o momento com calma", hint: "Moral ↑ · Seleção ↓", result: "Nem toda carreira de Seleção é uma linha reta para cima.", effect: { morale: 4, nationalBoost: -6 } },
  ]},
  { id: "generation-change", icon: "↔", tag: "SELEÇÃO", title: "A nova geração bate na porta", description: "A comissão técnica começa a testar nomes mais jovens na sua posição.", needsNationalMain: true, minAge: 30, choices: [
    { label: "Virar referência para os novatos", hint: "Liderança ↑↑ · minutos ↓", result: "Você ensina o que nenhuma camisa traz escrito.", effect: { leadership: 12, nationalBoost: -5, reputation: 6 } },
    { label: "Disputar cada convocação", hint: "OVR ↑ · físico ↓", result: "Você decide que a idade não vai escolher por você.", effect: { ovr: 1, fitness: -10, nationalBoost: 4 } },
  ]},
  { id: "national-captain", icon: "C", tag: "SELEÇÃO", title: "A braçadeira da Seleção", description: "O técnico anuncia você como capitão para o próximo ciclo de convocações.", needsNationalMain: true, minAge: 25, minOvr: 80, oneTime: true, choices: [
    { label: "Aceitar a braçadeira", hint: "Capitão · liderança ↑↑", result: "Vestir a faixa da Seleção muda o peso de cada jogo.", effect: { leadership: 16, reputation: 14, nationalBoost: 10, nationalCaptain: true } },
    { label: "Indicar um companheiro mais velho", hint: "Convocado · humildade", result: "Sua escolha fortalece o vestiário da Seleção.", effect: { morale: 8, leadership: 6, nationalCall: true } },
  ]},
];

export const FIRST_MATCH_EVENT: GameEvent = {
  id: "debut",
  icon: "▶",
  tag: "ESTREIA PROFISSIONAL",
  title: "Seu nome está na súmula",
  description: "Aos 39 do segundo tempo, o treinador olha para o banco e chama você. O jogo está empatado.",
  oneTime: true,
  choices: [
    { label: "Jogar simples e seguro", hint: "Confiança do técnico ↑", result: "Primeiro toque, passe certo. No segundo, você já pertence ao jogo.", effect: { morale: 6, minutes: 8, reputation: 3 } },
    { label: "Partir para cima", hint: "Alto risco · momento inesquecível", result: "Você recebe aberto, corta para dentro e faz o estádio levantar.", effect: { ovr: 1, morale: 10, reputation: 9, fitness: -5 } },
    { label: "Pedir a bola decisiva", hint: "Liderança ↑ · pressão ↑", result: "O novato aponta para o espaço e chama a responsabilidade.", effect: { leadership: 6, reputation: 7, morale: 4 } },
  ],
};
