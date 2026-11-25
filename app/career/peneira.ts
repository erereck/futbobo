// Peneira: o caminho alternativo para a base. Em vez de escolher o clube, o
// jogador faz três jogos de botão (rua, quadra de futsal e campo) com a peneira
// e os olheiros somam a nota de cada um. A soma decide quantos clubes chamam:
// 1, 2 ou 3 — e com 3, um deles é um gigante europeu de fora do país.
//
// Tudo aqui é puro e determinístico (seed da peneira): a tela só despacha. Os
// times inventados saem do mesmo sorteio de várzea do Bobonline no Brasil e de
// nomes no estilo de cada país no resto; o jogo 3 é contra um clube de verdade.

import { randomBobTeam, TEAM_COLOR_PAIRS } from "../bobonline/teams/generator";
import { deriveAbbr, deriveShortName } from "../bobonline/teams/model";
import { createRng, hashSeed, type Rng } from "../botao/rng";
import { CLUBS, COUNTRIES, type Club } from "../game-data";
import { isEuropeanClub } from "./academy";
import type { GameState, Peneira, PeneiraMatch, PeneiraMatchResult, PeneiraOpponent, PeneiraStage } from "./model";

export const PENEIRA_STAGES: readonly PeneiraStage[] = ["street", "futsal", "field"];

/** Como cada jogo aparece na tela. */
export const PENEIRA_STAGE_INFO: Record<PeneiraStage, { label: string; venue: string; blurb: string }> = {
  street: { label: "Rua", venue: "Campo de rua", blurb: "Chinelo de trave, a vizinhança inteira olhando." },
  futsal: { label: "Quadra", venue: "Quadra de futsal", blurb: "Espaço curto: toque rápido e decisão na hora." },
  field: { label: "Campo", venue: "Campo oficial", blurb: "Contra a base de um clube de verdade, com os olheiros na beira." },
};

/** Força do seu botão na peneira: um moleque talentoso, não o OVR 42 da ficha. */
export const PENEIRA_PLAYER_OVERALL = 70;
/** O time da peneira (os outros garotos testados com você). */
export const PENEIRA_TEAM_STRENGTH = 67;
/** Adversários em escada: rua fácil, quadra média, a base de um clube mais dura. */
const OPPONENT_STRENGTH: Record<PeneiraStage, number> = { street: 63, futsal: 68, field: 73 };

/** Nota total (3 jogos, máximo 30) que garante cada número de propostas. */
export const PENEIRA_THRESHOLDS = { two: 19.5, three: 23.5 } as const;

const GRASS_THEMES = ["classic", "vertical", "checker", "diagonal"] as const;

// ------------------------------------------------------------ nomes de time

type NameStyle = { prefixes?: readonly string[]; suffixes?: readonly string[] };

const NAME_STYLES = {
  pt: { prefixes: ["Grupo Desportivo", "Clube Desportivo", "União", "Académico", "Atlético", "Sporting", "Juventude"] },
  es: { prefixes: ["Club Atlético", "Deportivo", "Juventud", "Unión", "Sportivo", "Defensores de", "Racing", "Estrella de"] },
  en: { suffixes: ["Rovers", "United", "Athletic", "Wanderers", "Town", "Albion", "Rangers", "Juniors"] },
  it: { prefixes: ["Polisportiva", "Virtus", "Atletico", "Sporting", "Juventina", "Audax"] },
  fr: { prefixes: ["Étoile de", "Union Sportive", "Racing Club", "Olympique", "Stade", "Jeunesse de"] },
  de: { prefixes: ["SV", "FC", "SpVgg", "Rot-Weiß", "Eintracht", "TSV"] },
  nl: { prefixes: ["VV", "SC", "Sparta", "Quick", "RKVV"] },
  ar: { prefixes: ["Al Nasr", "Al Ittihad", "Al Shabab", "Al Ahli", "Al Wahda", "Al Najma"] },
  fa: { prefixes: ["Esteghlal", "Shahrdari", "Sanat Naft", "Mes", "Paykan", "Foolad"] },
  generic: { prefixes: ["Dínamo", "Lokomotiv", "Estrela", "Juventude"], suffixes: ["FC", "Academy", "Juniors", "City"] },
} satisfies Record<string, NameStyle>;

const COUNTRY_STYLE: Record<string, keyof typeof NAME_STYLES> = {
  portugal: "pt",
  argentina: "es", espanha: "es", uruguai: "es", chile: "es", colombia: "es", paraguai: "es", equador: "es",
  peru: "es", mexico: "es", bolivia: "es", venezuela: "es",
  inglaterra: "en", eua: "en", escocia: "en", australia: "en", "nova-zelandia": "en", "africa-do-sul": "en",
  italia: "it",
  franca: "fr", belgica: "fr", suica: "fr", marrocos: "fr", tunisia: "fr",
  catar: "ar", "emirados-arabes": "ar",
  ira: "fa",
  alemanha: "de", austria: "de",
  holanda: "nl",
};

function countryCities(countryId: string): string[] {
  const cities = new Set<string>();
  for (const club of CLUBS) if (club.countryId === countryId && club.city) cities.add(club.city);
  return [...cities];
}

/** Time inventado de um país que não é o Brasil: prefixo ou sufixo do jeito de lá + uma cidade de lá. */
function foreignTeamName(rng: Rng, countryId: string): string {
  const style: NameStyle = NAME_STYLES[COUNTRY_STYLE[countryId] ?? "generic"];
  const cities = countryCities(countryId);
  const country = COUNTRIES.find((item) => item.id === countryId);
  const realNames = new Set(CLUBS.map((club) => club.name.toLocaleLowerCase("pt-BR")));
  for (let draw = 0; draw < 12; draw += 1) {
    const city = cities.length ? rng.pick(cities) : country?.name ?? "Bairro";
    const usePrefix = style.prefixes && (!style.suffixes || rng.chance(0.5));
    const name = usePrefix ? `${rng.pick(style.prefixes!)} ${city}` : `${city} ${rng.pick(style.suffixes!)}`;
    if (name.length <= 26 && !realNames.has(name.toLocaleLowerCase("pt-BR"))) return name;
  }
  return `${country?.name ?? "Bairro"} Juniors`;
}

/** Adversário inventado dos jogos 1 e 2: várzea no Brasil, nome no estilo do país no resto. */
export function generatedOpponent(countryId: string, seed: number, stage: PeneiraStage): PeneiraOpponent {
  const strength = OPPONENT_STRENGTH[stage];
  if (countryId === "brasil") {
    const team = randomBobTeam(hashSeed(seed, "peneira", stage));
    return { id: `peneira-${stage}-${team.id}`, name: team.name, shortName: team.shortName, abbr: team.abbr, primary: team.primary, secondary: team.secondary, strength, crest: team.crest };
  }
  const rng = createRng(hashSeed(seed, "peneira", stage, countryId));
  const name = foreignTeamName(rng, countryId);
  const [primary, secondary] = rng.pick(TEAM_COLOR_PAIRS);
  return {
    id: `peneira-${stage}-${hashSeed(seed, stage, name).toString(36)}`,
    name,
    shortName: deriveShortName(name),
    abbr: deriveAbbr(name).toUpperCase(),
    primary,
    secondary,
    strength,
    crest: rng.int(0, 3) as 0 | 1 | 2 | 3,
  };
}

/** Jogo 3: a base de um clube de verdade do país, da metade de baixo para o meio da tabela de força. */
export function fieldOpponent(countryId: string, seed: number): PeneiraOpponent {
  const pool = CLUBS.filter((club) => club.countryId === countryId).sort((a, b) => a.strength - b.strength);
  const usable = pool.length ? pool.slice(0, Math.max(1, Math.ceil(pool.length * 0.7))) : CLUBS.slice(0, 10);
  const club = createRng(hashSeed(seed, "peneira", "field", countryId)).pick(usable);
  return {
    id: club.id,
    clubId: club.id,
    name: club.name,
    shortName: club.shortName,
    abbr: club.abbr,
    primary: club.primary,
    secondary: club.secondary,
    strength: OPPONENT_STRENGTH.field,
  };
}

/** Os três jogos com campo e adversário já sorteados (a mesma seed dá a mesma peneira). */
export function createPeneira(countryId: string, seed: number): Peneira {
  const rng = createRng(hashSeed(seed, "peneira", "campos"));
  const matches: PeneiraMatch[] = [
    { stage: "street", opponent: generatedOpponent(countryId, seed, "street"), fieldTheme: "street", streetVariant: rng.int(0, 2) as 0 | 1 | 2, started: false, result: null },
    { stage: "futsal", opponent: generatedOpponent(countryId, seed, "futsal"), fieldTheme: rng.chance(0.5) ? "futsal-orange" : "futsal-blue", started: false, result: null },
    { stage: "field", opponent: fieldOpponent(countryId, seed), fieldTheme: rng.pick(GRASS_THEMES), started: false, result: null },
  ];
  return { countryId, seed, matches, offers: null, chosenClubId: null };
}

/** Próximo jogo sem resultado (3 = acabou). */
export function peneiraCurrentIndex(peneira: Peneira): number {
  const index = peneira.matches.findIndex((match) => !match.result);
  return index < 0 ? peneira.matches.length : index;
}

// ------------------------------------------------------------ nota

const round1 = (value: number) => Math.round(value * 10) / 10;

/**
 * Nota do olheiro (3..10) pelo que O SEU botão fez: gol pesa mais, assistência
 * um pouco menos, craque do jogo e o resultado do time completam. Perder jogando
 * bem ainda dá nota boa; W.O. é a pior nota possível.
 */
export function peneiraRating(result: Pick<PeneiraMatchResult, "outcome" | "goalsFor" | "goalsAgainst" | "playerGoals" | "playerAssists" | "manOfTheMatch" | "walkover">): number {
  if (result.walkover) return 3;
  let rating = 5.6;
  rating += Math.min(4, Math.max(0, result.playerGoals)) * 1.05;
  rating += Math.min(4, Math.max(0, result.playerAssists)) * 0.7;
  if (result.manOfTheMatch) rating += 0.6;
  rating += result.outcome === "win" ? 0.6 : result.outcome === "draw" ? 0.2 : -0.3;
  rating += Math.max(-0.6, Math.min(0.4, (result.goalsFor - result.goalsAgainst) * 0.15));
  return round1(Math.max(3, Math.min(10, rating)));
}

export function peneiraTotal(peneira: Peneira): number {
  return round1(peneira.matches.reduce((sum, match) => sum + (match.result?.rating ?? 0), 0));
}

export function peneiraOfferCount(total: number): 1 | 2 | 3 {
  return total >= PENEIRA_THRESHOLDS.three ? 3 : total >= PENEIRA_THRESHOLDS.two ? 2 : 1;
}

/** O que o olheiro escreve na prancheta depois de cada jogo. */
export function peneiraScoutNote(result: PeneiraMatchResult, stage: PeneiraStage): string {
  if (result.walkover) return "Saiu no meio do jogo. O olheiro riscou o nome da lista.";
  const r = result.rating;
  const where = stage === "street" ? "na rua" : stage === "futsal" ? "na quadra" : "no campo";
  if (result.playerGoals >= 3) return `Três gols ${where}. O olheiro parou de anotar e ficou só olhando.`;
  if (r >= 9) return `Jogou ${where} como quem já é profissional. Nome sublinhado duas vezes.`;
  if (r >= 8) return `Decidiu ${where}. O olheiro ligou para alguém no intervalo.`;
  if (r >= 7) return `Jogo firme ${where}: chamou a atenção, mas ainda dá para mais.`;
  if (r >= 6) return `Correto ${where}. Ninguém anotou nada de ruim, nem de muito bom.`;
  if (r >= 4.5) return `Sumiu ${where}. O olheiro olhou mais para o relógio que para você.`;
  return `Dia ruim ${where}. Ainda tem jogo para virar a impressão.`;
}

// ------------------------------------------------------------ propostas

function pickFrom(rng: Rng, pool: Club[], taken: Set<string>): Club | null {
  const free = pool.filter((club) => !taken.has(club.id));
  if (!free.length) return null;
  const club = rng.pick(free);
  taken.add(club.id);
  return club;
}

/** Gigante europeu (força 86+) de outro país; quem já é de um país com gigantes vai para outro. */
function isPeneiraGiant(club: Club, countryId: string): boolean {
  return club.strength >= 86 && club.countryId !== countryId && isEuropeanClub(club);
}

export function bigInternationalPool(countryId: string): Club[] {
  return CLUBS.filter((club) => isPeneiraGiant(club, countryId));
}

/**
 * Clubes que chamam, do melhor para o "seguro": com 3, o gigante de fora vem
 * primeiro e os outros dois são da elite do país; com
 * menos, faixas de força conforme a nota. Com 1 ou 2, quem jogou muito contra
 * o clube do jogo 3 pode ser chamado por ele mesmo.
 */
export function peneiraOffers(peneira: Peneira): string[] {
  const total = peneiraTotal(peneira);
  const count = peneiraOfferCount(total);
  const rng = createRng(hashSeed(peneira.seed, "peneira", "propostas", Math.round(total * 10)));
  const national = CLUBS.filter((club) => club.countryId === peneira.countryId).sort((a, b) => b.strength - a.strength);
  const fallback = national.length ? national : CLUBS.filter((club) => club.strength < 80).sort((a, b) => b.strength - a.strength);
  const size = fallback.length;
  // Elite: os ~12% mais fortes do país (no Brasil, a turma da Série A de cima).
  const elite = fallback.slice(0, Math.min(size, Math.max(3, Math.ceil(size * 0.12))));
  const third = Math.max(1, Math.ceil(size / 3));
  const top = fallback.slice(0, third);
  const middle = fallback.slice(third, third * 2).length ? fallback.slice(third, third * 2) : top;
  const low = fallback.slice(third * 2).length ? fallback.slice(third * 2) : middle;
  const taken = new Set<string>();
  const picks: Array<Club | null> = [];

  const fieldMatch = peneira.matches[2];
  const fieldClub = fieldMatch?.opponent.clubId ? CLUBS.find((club) => club.id === fieldMatch.opponent.clubId) ?? null : null;
  const impressedField = Boolean(fieldClub && fieldMatch?.result && fieldMatch.result.rating >= 8.5);
  const rivalOr = (pool: Club[]) => (impressedField && fieldClub && !taken.has(fieldClub.id) ? (taken.add(fieldClub.id), fieldClub) : pickFrom(rng, pool, taken));

  if (count === 3) {
    picks.push(pickFrom(rng, bigInternationalPool(peneira.countryId), taken));
    picks.push(pickFrom(rng, elite, taken));
    picks.push(pickFrom(rng, elite, taken) ?? pickFrom(rng, top, taken));
  } else if (count === 2) {
    const strong = total >= 22;
    picks.push(pickFrom(rng, strong ? elite : top, taken));
    picks.push(rivalOr(strong ? top : middle));
  } else {
    picks.push(pickFrom(rng, total >= 15 ? middle : low, taken));
  }
  const ids = picks.filter((club): club is Club => club !== null).map((club) => club.id);
  // Pool vazio (país com poucos clubes): completa com quem sobrou no país.
  while (ids.length < count) {
    const extra = pickFrom(rng, fallback, taken);
    if (!extra) break;
    ids.push(extra.id);
  }
  return ids;
}

/** Proposta especial na tela: o gigante de fora e o clube que você enfrentou. */
export function peneiraOfferTag(peneira: Peneira, clubId: string): "giant" | "rival" | null {
  const club = CLUBS.find((item) => item.id === clubId);
  if (!club) return null;
  if (isPeneiraGiant(club, peneira.countryId)) return "giant";
  if (peneira.matches[2]?.opponent.clubId === clubId) return "rival";
  return null;
}

/** Grava o resultado de um jogo (nota calculada aqui) e, no último, as propostas. */
export function recordPeneiraResult(peneira: Peneira, index: number, result: Omit<PeneiraMatchResult, "rating">): Peneira {
  if (index < 0 || index >= peneira.matches.length || peneira.matches[index].result) return peneira;
  const scored: PeneiraMatchResult = { ...result, rating: peneiraRating(result) };
  const matches = peneira.matches.map((match, at) => (at === index ? { ...match, started: true, result: scored } : match));
  const next: Peneira = { ...peneira, matches };
  return matches.every((match) => match.result) ? { ...next, offers: peneiraOffers(next) } : next;
}

/** Bônus escondido: quem entra pela peneira já chega conhecido pelo treinador (+33% de confiança). */
export const PENEIRA_TRUST_MULTIPLIER = 1.33;
/** Primeiro contrato no gigante europeu da peneira, se você não trocar de clube ao sair da base. */
export const PENEIRA_GIANT_CONTRACT_YEARS = 7;
/** No gigante da peneira você vira titular com até 3 de overall abaixo da média do time. */
export const PENEIRA_GIANT_STARTER_MARGIN = 3;

export function peneiraTrustBonus(trust: number): number {
  return Math.max(0, Math.min(100, Math.round(trust * PENEIRA_TRUST_MULTIPLIER)));
}

/** O gigante europeu que te tirou da peneira (e que você escolheu), ou "". */
export function peneiraGiantClubId(state: Pick<GameState, "peneira" | "peneiraClubId">): string {
  const { peneira, peneiraClubId } = state;
  if (!peneira || !peneiraClubId || peneira.chosenClubId !== peneiraClubId) return "";
  return peneiraOfferTag(peneira, peneiraClubId) === "giant" ? peneiraClubId : "";
}

/**
 * Primeiro contrato profissional: o clube da peneira chega com +33% de
 * confiança; se for o gigante europeu, o vínculo é sempre de 7 anos.
 */
export function peneiraSigningTerms(state: Pick<GameState, "peneira" | "peneiraClubId">, clubId: string, baseTrust: number, contractYears: number) {
  const fromPeneira = Boolean(state.peneiraClubId) && clubId === state.peneiraClubId;
  const giant = fromPeneira && clubId === peneiraGiantClubId(state);
  return {
    managerTrust: fromPeneira ? peneiraTrustBonus(baseTrust) : baseTrust,
    contractYears: giant ? PENEIRA_GIANT_CONTRACT_YEARS : contractYears,
    giant,
  };
}

/** Duração mostrada na proposta do primeiro contrato (a mesma que vale ao assinar). */
export function peneiraContractYears(state: Pick<GameState, "peneira" | "peneiraClubId">, clubId: string, contractYears: number): number {
  return peneiraSigningTerms(state, clubId, 0, contractYears).contractYears;
}
