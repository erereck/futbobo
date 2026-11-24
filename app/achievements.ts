// Conquistas do Futbobo: definições e regra de desbloqueio. Ficam fora do mega-expansion.ts
// (eventos, rivalidades e manchetes da carreira) para o menu inicial mostrar a lista de conquistas
// sem baixar todos os textos da carreira. O mega-expansion reexporta tudo daqui.

export type AchievementRarity = "comum" | "raro" | "épico" | "lendário";

export type MetricField =
  | "appearances"
  | "goals"
  | "assists"
  | "cleanSheets"
  | "trophies"
  | "continentalTitles"
  | "worldTitles"
  | "nationalCaps"
  | "nationalTrophies"
  | "ballonDor"
  | "clubsPlayed"
  | "seasonsAbroad"
  | "seasons"
  | "age"
  | "wasCaptain"
  | "nationalCaptain"
  | "yellowCards"
  | "redCards"
  | "retired"
  /** Virou lenda de um clube: 7 temporadas seguidas, 3 títulos e a torcida aos pés. */
  | "clubLegend";

export type ComparisonOperator = "gte" | "lte" | "gt" | "lt" | "eq";

export type AchievementCondition = {
  field: MetricField;
  operator: ComparisonOperator;
  value: number | boolean;
};

export type AchievementDefinition = {
  id: string;
  icon: string;
  title: string;
  description: string;
  rarity: AchievementRarity;
  match: "all" | "any";
  conditions: AchievementCondition[];
};

export type AchievementMetrics = Partial<Record<MetricField, number | boolean>>;

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: "estreia-profissional", icon: "▶", title: "Estreante", description: "Fez sua primeira partida como profissional.", rarity: "comum", match: "all", conditions: [{ field: "appearances", operator: "gte", value: 1 }] },
  { id: "cem-jogos", icon: "■", title: "Cem Vezes em Campo", description: "Chegou a 100 partidas na carreira.", rarity: "comum", match: "all", conditions: [{ field: "appearances", operator: "gte", value: 100 }] },
  { id: "duzentos-e-cinquenta-jogos", icon: "■", title: "Peça Fundamental", description: "Alcançou 250 partidas disputadas.", rarity: "raro", match: "all", conditions: [{ field: "appearances", operator: "gte", value: 250 }] },
  { id: "quinhentos-jogos", icon: "■", title: "Veterano de Guerra", description: "Chegou às 500 partidas na carreira.", rarity: "épico", match: "all", conditions: [{ field: "appearances", operator: "gte", value: 500 }] },
  { id: "mil-jogos", icon: "■", title: "Oitocentas Batalhas", description: "Disputou 800 partidas como profissional.", rarity: "lendário", match: "all", conditions: [{ field: "appearances", operator: "gte", value: 800 }] },
  { id: "primeiros-gols", icon: "⚽", title: "Balançou a Rede", description: "Marcou 10 gols na carreira.", rarity: "comum", match: "all", conditions: [{ field: "goals", operator: "gte", value: 10 }] },
  { id: "artilheiro-em-ascensao", icon: "⚽", title: "Artilheiro em Ascensão", description: "Chegou a 50 gols na carreira.", rarity: "raro", match: "all", conditions: [{ field: "goals", operator: "gte", value: 50 }] },
  { id: "maquina-de-gols", icon: "⚽", title: "Máquina de Gols", description: "Marcou 150 gols como profissional.", rarity: "épico", match: "all", conditions: [{ field: "goals", operator: "gte", value: 150 }] },
  { id: "lenda-artilheira", icon: "⚽", title: "Lenda Artilheira", description: "Atingiu a marca de 300 gols na carreira.", rarity: "lendário", match: "all", conditions: [{ field: "goals", operator: "gte", value: 300 }] },
  { id: "primeiras-assistencias", icon: "🎯", title: "Olho Apurado", description: "Deu 10 assistências na carreira.", rarity: "comum", match: "all", conditions: [{ field: "assists", operator: "gte", value: 10 }] },
  { id: "garcom-oficial", icon: "🎯", title: "Garçom Oficial", description: "Chegou a 50 assistências na carreira.", rarity: "raro", match: "all", conditions: [{ field: "assists", operator: "gte", value: 50 }] },
  { id: "rei-das-assistencias", icon: "🎯", title: "Rei das Assistências", description: "Distribuiu 120 assistências na carreira.", rarity: "épico", match: "all", conditions: [{ field: "assists", operator: "gte", value: 120 }] },
  { id: "primeira-defesa-limpa", icon: "🧤", title: "Primeira Muralha", description: "Fechou o gol em 10 partidas.", rarity: "comum", match: "all", conditions: [{ field: "cleanSheets", operator: "gte", value: 10 }] },
  { id: "muralha-em-construcao", icon: "🧤", title: "Muralha em Construção", description: "Alcançou 50 jogos sem sofrer gols.", rarity: "raro", match: "all", conditions: [{ field: "cleanSheets", operator: "gte", value: 50 }] },
  { id: "muro-intransponivel", icon: "🧤", title: "Muro Intransponível", description: "Chegou a 120 jogos sem sofrer gols.", rarity: "épico", match: "all", conditions: [{ field: "cleanSheets", operator: "gte", value: 120 }] },
  { id: "decisivo-nos-dois-lados", icon: "✦", title: "Decisivo dos Dois Lados", description: "Provou ser decisivo tanto fazendo quanto criando gols.", rarity: "épico", match: "all", conditions: [
    { field: "goals", operator: "gte", value: 200 },
    { field: "assists", operator: "gte", value: 150 },
  ]},
  { id: "primeiro-titulo", icon: "🏆", title: "Primeira Taça", description: "Conquistou o primeiro título da carreira.", rarity: "comum", match: "all", conditions: [{ field: "trophies", operator: "gte", value: 1 }] },
  { id: "colecionador-de-tacas", icon: "🏆", title: "Colecionador de Taças", description: "Chegou a 5 títulos na carreira.", rarity: "raro", match: "all", conditions: [{ field: "trophies", operator: "gte", value: 5 }] },
  { id: "armario-cheio", icon: "🏆", title: "Armário Cheio", description: "Conquistou 10 títulos na carreira.", rarity: "épico", match: "all", conditions: [{ field: "trophies", operator: "gte", value: 10 }] },
  { id: "dinastia-pessoal", icon: "🏆", title: "Uma Dinastia Pessoal", description: "Acumulou 20 títulos ao longo da carreira.", rarity: "lendário", match: "all", conditions: [{ field: "trophies", operator: "gte", value: 20 }] },
  { id: "campeao-continental", icon: "★", title: "Campeão Continental", description: "Venceu uma competição continental de clubes.", rarity: "raro", match: "all", conditions: [{ field: "continentalTitles", operator: "gte", value: 1 }] },
  { id: "rei-do-continente", icon: "★", title: "Rei do Continente", description: "Venceu 3 competições continentais de clubes.", rarity: "épico", match: "all", conditions: [{ field: "continentalTitles", operator: "gte", value: 3 }] },
  { id: "campeao-mundial", icon: "MUN", title: "Campeão do Mundo", description: "Conquistou um título mundial de clubes.", rarity: "lendário", match: "all", conditions: [{ field: "worldTitles", operator: "gte", value: 1 }] },
  { id: "primeira-convocacao", icon: "SEL", title: "Vestiu a Camisa da Seleção", description: "Recebeu a primeira convocação para a Seleção.", rarity: "comum", match: "all", conditions: [{ field: "nationalCaps", operator: "gte", value: 1 }] },
  { id: "presenca-frequente-na-selecao", icon: "SEL", title: "Presença Frequente", description: "Somou 20 jogos pela Seleção.", rarity: "raro", match: "all", conditions: [{ field: "nationalCaps", operator: "gte", value: 20 }] },
  { id: "titular-da-selecao", icon: "SEL", title: "Titular da Seleção", description: "Alcançou 50 jogos pela Seleção.", rarity: "épico", match: "all", conditions: [{ field: "nationalCaps", operator: "gte", value: 50 }] },
  { id: "centenario-de-selecao", icon: "SEL", title: "Centenário de Seleção", description: "Chegou a 100 jogos pela Seleção.", rarity: "lendário", match: "all", conditions: [{ field: "nationalCaps", operator: "gte", value: 100 }] },
  { id: "campeao-pela-selecao", icon: "SEL", title: "Campeão pela Seleção", description: "Venceu um título com a camisa da Seleção.", rarity: "épico", match: "all", conditions: [{ field: "nationalTrophies", operator: "gte", value: 1 }] },
  { id: "bicampeao-pela-selecao", icon: "SEL", title: "Bicampeão pela Seleção", description: "Venceu dois títulos com a camisa da Seleção.", rarity: "lendário", match: "all", conditions: [{ field: "nationalTrophies", operator: "gte", value: 2 }] },
  { id: "finalmente-a-bola-de-ouro", icon: "🥇", title: "Bola de Ouro", description: "Foi eleito o melhor jogador do mundo.", rarity: "lendário", match: "all", conditions: [{ field: "ballonDor", operator: "gte", value: 1 }] },
  { id: "colecao-de-bolas-de-ouro", icon: "🥇", title: "Coleção de Bolas de Ouro", description: "Venceu a Bola de Ouro três vezes na carreira.", rarity: "lendário", match: "all", conditions: [{ field: "ballonDor", operator: "gte", value: 3 }] },
  { id: "primeira-mudanca-de-camisa", icon: "🧳", title: "Mala Pronta", description: "Já defendeu 3 clubes diferentes.", rarity: "comum", match: "all", conditions: [{ field: "clubsPlayed", operator: "gte", value: 3 }] },
  { id: "viajante-do-futebol", icon: "🧳", title: "Viajante do Futebol", description: "Já vestiu a camisa de 5 clubes diferentes.", rarity: "raro", match: "all", conditions: [{ field: "clubsPlayed", operator: "gte", value: 5 }] },
  { id: "passagem-por-oito-clubes", icon: "🧳", title: "Uma Carreira, Muitos Escudos", description: "Já defendeu 8 clubes diferentes.", rarity: "épico", match: "all", conditions: [{ field: "clubsPlayed", operator: "gte", value: 8 }] },
  { id: "primeira-temporada-fora", icon: "✈", title: "Aventura no Exterior", description: "Completou a primeira temporada jogando fora do país de origem.", rarity: "comum", match: "all", conditions: [{ field: "seasonsAbroad", operator: "gte", value: 1 }] },
  { id: "europeu-de-carteirinha", icon: "✈", title: "Europeu de Carteirinha", description: "Somou 5 temporadas jogando no exterior.", rarity: "raro", match: "all", conditions: [{ field: "seasonsAbroad", operator: "gte", value: 5 }] },
  { id: "decada-no-exterior", icon: "✈", title: "Uma Década no Exterior", description: "Completou 10 temporadas jogando fora do país de origem.", rarity: "épico", match: "all", conditions: [{ field: "seasonsAbroad", operator: "gte", value: 10 }] },
  { id: "bracadeira-no-braco", icon: "C", title: "Braçadeira no Braço", description: "Foi capitão do clube.", rarity: "raro", match: "all", conditions: [{ field: "wasCaptain", operator: "eq", value: true }] },
  { id: "capitao-da-selecao", icon: "C", title: "Capitão da Seleção", description: "Foi escolhido capitão da Seleção nacional.", rarity: "épico", match: "all", conditions: [{ field: "nationalCaptain", operator: "eq", value: true }] },
  { id: "ficha-limpa", icon: "🟩", title: "Ficha Limpa", description: "Somou 200 jogos sem nenhum cartão vermelho.", rarity: "épico", match: "all", conditions: [
    { field: "redCards", operator: "eq", value: 0 },
    { field: "appearances", operator: "gte", value: 200 },
  ]},
  { id: "disciplinado-em-campo", icon: "🟨", title: "Disciplinado em Campo", description: "Manteve poucos cartões amarelos mesmo com 100 jogos disputados.", rarity: "raro", match: "all", conditions: [
    { field: "yellowCards", operator: "lte", value: 5 },
    { field: "appearances", operator: "gte", value: 100 },
  ]},
  { id: "temperamento-forte", icon: "🟥", title: "Temperamento Forte", description: "Já viu o cartão vermelho 5 vezes ou mais na carreira.", rarity: "comum", match: "all", conditions: [{ field: "redCards", operator: "gte", value: 5 }] },
  { id: "ainda-em-campo-aos-35", icon: "⏳", title: "Ainda em Campo aos 35", description: "Segue jogando profissionalmente aos 35 anos.", rarity: "raro", match: "all", conditions: [
    { field: "age", operator: "gte", value: 35 },
    { field: "retired", operator: "eq", value: false },
  ]},
  { id: "carreira-de-quinze-temporadas", icon: "⏳", title: "Quinze Temporadas de Carreira", description: "Completou 15 temporadas como profissional.", rarity: "épico", match: "all", conditions: [{ field: "seasons", operator: "gte", value: 15 }] },
  { id: "carreira-de-vinte-temporadas", icon: "⏳", title: "Vinte Temporadas de Carreira", description: "Completou 20 temporadas como profissional.", rarity: "lendário", match: "all", conditions: [{ field: "seasons", operator: "gte", value: 20 }] },
  { id: "eterno-do-futebol", icon: "⏳", title: "Eterno do Futebol", description: "Seguiu jogando profissionalmente aos 38 anos.", rarity: "lendário", match: "all", conditions: [{ field: "age", operator: "gte", value: 38 }] },
  { id: "imortal", icon: "∞", title: "Imortal", description: "Passou dos 42 anos ainda em campo, com nível para continuar.", rarity: "lendário", match: "all", conditions: [
    { field: "age", operator: "gte", value: 42 },
    { field: "retired", operator: "eq", value: false },
  ]},
  { id: "lenda-do-clube", icon: "★", title: "Lenda do Clube", description: "Sete temporadas seguidas no mesmo clube, três títulos por ele e a torcida aos pés.", rarity: "épico", match: "all", conditions: [{ field: "clubLegend", operator: "eq", value: true }] },
  // ---- BASTIDORES DA CARREIRA ----
  { id: "referencia-completa", icon: "✦", title: "Referência Completa", description: "Somou 100 gols e 100 assistências na carreira.", rarity: "raro", match: "all", conditions: [
    { field: "goals", operator: "gte", value: 100 },
    { field: "assists", operator: "gte", value: 100 },
  ]},
  { id: "capitao-em-dois-fronts", icon: "C", title: "Capitão em Dois Fronts", description: "Foi capitão do clube e da Seleção na mesma carreira.", rarity: "épico", match: "all", conditions: [
    { field: "wasCaptain", operator: "eq", value: true },
    { field: "nationalCaptain", operator: "eq", value: true },
  ]},
  { id: "bastidor-de-confianca", icon: "🧳", title: "Bastidor de Confiança", description: "Foi capitão em algum clube depois de já ter defendido 6 camisas diferentes.", rarity: "raro", match: "all", conditions: [
    { field: "clubsPlayed", operator: "gte", value: 6 },
    { field: "wasCaptain", operator: "eq", value: true },
  ]},
  { id: "onze-escudos-diferentes", icon: "🧳", title: "Uma Carreira, Onze Escudos", description: "Já defendeu 11 clubes diferentes.", rarity: "lendário", match: "all", conditions: [{ field: "clubsPlayed", operator: "gte", value: 11 }] },
  { id: "cidadao-do-mundo-do-futebol", icon: "✈", title: "Cidadão do Mundo", description: "Completou 15 temporadas jogando fora do país de origem.", rarity: "lendário", match: "all", conditions: [{ field: "seasonsAbroad", operator: "gte", value: 15 }] },
  { id: "mil-jogos-de-bastidores", icon: "■", title: "Mil Jogos, Mil Bastidores", description: "Disputou 1000 partidas como profissional.", rarity: "lendário", match: "all", conditions: [{ field: "appearances", operator: "gte", value: 1000 }] },
  { id: "o-dono-do-premio", icon: "🥇", title: "O Dono do Prêmio", description: "Venceu a Bola de Ouro cinco vezes na carreira.", rarity: "lendário", match: "all", conditions: [{ field: "ballonDor", operator: "gte", value: 5 }] },
  { id: "cabeca-no-lugar", icon: "🟩", title: "Cabeça no Lugar", description: "Completou 12 temporadas de carreira levando no máximo 1 cartão vermelho.", rarity: "raro", match: "all", conditions: [
    { field: "seasons", operator: "gte", value: 12 },
    { field: "redCards", operator: "lte", value: 1 },
  ]},
];

const BOOLEAN_METRIC_FIELDS = new Set<MetricField>(["wasCaptain", "nationalCaptain", "retired", "clubLegend"]);

function readMetric(metrics: AchievementMetrics, field: MetricField): number | boolean {
  const value = metrics[field];
  if (BOOLEAN_METRIC_FIELDS.has(field)) return Boolean(value);
  return typeof value === "number" ? value : 0;
}

function compareMetric(actual: number | boolean, operator: ComparisonOperator, expected: number | boolean): boolean {
  if (typeof actual === "boolean" || typeof expected === "boolean") {
    return operator === "eq" ? actual === expected : false;
  }
  switch (operator) {
    case "gte": return actual >= expected;
    case "lte": return actual <= expected;
    case "gt": return actual > expected;
    case "lt": return actual < expected;
    case "eq": return actual === expected;
    default: return false;
  }
}

function achievementIsUnlocked(definition: AchievementDefinition, metrics: AchievementMetrics): boolean {
  const results = definition.conditions.map((condition) =>
    compareMetric(readMetric(metrics, condition.field), condition.operator, condition.value),
  );
  return definition.match === "any" ? results.some(Boolean) : results.every(Boolean);
}

export function getUnlockedAchievements(metrics: AchievementMetrics, unlockedIds: string[]): AchievementDefinition[] {
  const alreadyUnlocked = new Set(unlockedIds);
  return ACHIEVEMENTS.filter(
    (definition) => !alreadyUnlocked.has(definition.id) && achievementIsUnlocked(definition, metrics),
  );
}
