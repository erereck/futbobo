import type { GameEvent } from "./game-data";

// ============================================================================
// RIVALIDADES
// ============================================================================

export type Rivalry = {
  id: string;
  clubIds: [string, string];
  name: string;
  nickname: string;
  intensity: 1 | 2 | 3 | 4 | 5;
  headlines: string[];
};

export const RIVALRIES: Rivalry[] = [
  { id: "fla-flu", clubIds: ["flamengo", "fluminense"], name: "Flamengo x Fluminense", nickname: "Fla-Flu", intensity: 5, headlines: [
    "Fla-Flu no Maracanã: a cidade inteira muda de cor por um dia",
    "Um gol no clássico vale mais do que três numa rodada qualquer",
    "Ninguém dorme direito na véspera do Fla-Flu, dos dois lados da rivalidade",
  ]},
  { id: "fla-vasco", clubIds: ["flamengo", "vasco"], name: "Flamengo x Vasco da Gama", nickname: "Clássico dos Milhões", intensity: 4, headlines: [
    "Clássico dos Milhões lota o Maracanã e divide o Rio de Janeiro",
    "Vasco busca provar que a força da rivalidade não envelheceu",
    "Flamengo tenta ampliar a vantagem no maior clássico da torcida cruz-maltina",
  ]},
  { id: "cor-pal", clubIds: ["corinthians", "palmeiras"], name: "Corinthians x Palmeiras", nickname: "Derby Paulista", intensity: 5, headlines: [
    "O Derby Paulista paralisa São Paulo mais uma vez",
    "Corinthians e Palmeiras se encaram sem espaço para empate emocional",
    "Cada Derby Paulista parece decidir mais do que só três pontos",
  ]},
  { id: "cor-sao", clubIds: ["corinthians", "sao-paulo"], name: "Corinthians x São Paulo", nickname: "Majestoso", intensity: 4, headlines: [
    "O Majestoso chega mais uma vez com ares de decisão",
    "Corinthians e São Paulo protagonizam outro capítulo do Majestoso",
    "Tradição e rivalidade se encontram em mais um Majestoso lotado",
  ]},
  { id: "pal-sao", clubIds: ["palmeiras", "sao-paulo"], name: "Palmeiras x São Paulo", nickname: "Choque-Rei", intensity: 4, headlines: [
    "Choque-Rei promete duelo equilibrado no Estado",
    "Palmeiras e São Paulo dividem a atenção da capital paulista",
    "Nenhum dos dois lados admite favoritismo no Choque de Craques",
  ]},
  { id: "gre-int", clubIds: ["gremio", "internacional"], name: "Grêmio x Internacional", nickname: "Grenal", intensity: 5, headlines: [
    "Grenal para Porto Alegre e divide famílias inteiras",
    "Grêmio e Internacional entram em campo como se fosse o único jogo do ano",
    "O Grenal não perdoa nem favoritos nem tabelas",
  ]},
  { id: "cam-cru", clubIds: ["atletico-mg", "cruzeiro"], name: "Atlético Mineiro x Cruzeiro", nickname: "Clássico Mineiro", intensity: 5, headlines: [
    "Clássico Mineiro transforma Belo Horizonte em uma cidade só de nervos",
    "Atlético e Cruzeiro disputam mais do que pontos no Clássico Mineiro",
    "A torcida mineira já separou a agenda para o clássico do ano",
  ]},
  { id: "bah-vit", clubIds: ["bahia", "vitoria"], name: "Bahia x Vitória", nickname: "Ba-Vi", intensity: 4, headlines: [
    "Ba-Vi divide Salvador em duas cidades dentro da mesma cidade",
    "Bahia e Vitória fazem o clássico baiano com o Fonte Nova em festa",
    "O Ba-Vi lembra a todos que rivalidade também é tradição",
  ]},
  { id: "san-sao", clubIds: ["santos", "sao-paulo"], name: "Santos x São Paulo", nickname: "San-São", intensity: 3, headlines: [
    "Clássico da Vila reúne história e ambição em partes iguais",
    "Santos recebe o São Paulo com a Vila Belmiro pedindo um resultado",
    "O Clássico da Vila lembra rivalidades antigas do futebol paulista",
  ]},
  { id: "bot-vas", clubIds: ["botafogo", "vasco"], name: "Botafogo x Vasco da Gama", nickname: "Clássico da Amizade", intensity: 3, headlines: [
    "O apelido é Amizade, mas o clima em campo não tem nada de amistoso",
    "Botafogo e Vasco disputam mais um capítulo de uma rivalidade antiga",
    "Torcidas leva a ironia do nome na brincadeira, o time leva o jogo a sério",
  ]},
  { id: "fla-bot", clubIds: ["flamengo", "botafogo"], name: "Flamengo x Botafogo", nickname: "Clássico da Rivalidade", intensity: 3, headlines: [
    "Clássico da Rivalidade promete arquibancadas divididas",
    "Botafogo tenta quebrar a hegemonia recente do rival rubro-negro",
    "Flamengo x Botafogo nunca é só mais um jogo no calendário carioca",
  ]},
  { id: "cor-san", clubIds: ["corinthians", "santos"], name: "Corinthians x Santos", nickname: "Clássico Alvinegro", intensity: 3, headlines: [
    "Clássico Alvinegro aproxima duas torcidas gigantes de capital e litoral",
    "Corinthians recebe o Santos num duelo que sempre rende discussão",
    "O clássico entre Timão e Peixe segue rendendo boas histórias",
  ]},
  { id: "ath-cfc", clubIds: ["athletico", "coritiba"], name: "Athletico Paranaense x Coritiba", nickname: "Atletiba", intensity: 5, headlines: [
    "Atletiba divide Curitiba em duas torcidas que não se misturam",
    "Athletico e Coritiba entram em campo com a cidade inteira parada",
    "O Atletiba mantém viva uma das rivalidades mais antigas do país",
  ]},
  { id: "fla-cor", clubIds: ["flamengo", "corinthians"], name: "Flamengo x Corinthians", nickname: "Clássico Nacional", intensity: 3, headlines: [
    "As duas maiores torcidas do país se encontram no Clássico Nacional",
    "Flamengo e Corinthians fazem o duelo entre gigantes de torcidas nacionais",
    "O Clássico Nacional atrai atenção de ponta a ponta do Brasil",
  ]},
  { id: "flu-vas", clubIds: ["fluminense", "vasco"], name: "Fluminense x Vasco da Gama", nickname: "Clássico dos Campeões", intensity: 3, headlines: [
    "Clássico dos Campeões reacende uma rivalidade de décadas",
    "Fluminense e Vasco medem forças num duelo cheio de história",
    "O clássico entre tricolores e cruz-maltinos nunca sai de moda",
  ]},
  { id: "rma-bar", clubIds: ["real-madrid", "barcelona"], name: "Real Madrid x Barcelona", nickname: "El Clásico", intensity: 5, headlines: [
    "El Clásico paralisa o mundo inteiro por noventa minutos",
    "Real Madrid e Barcelona disputam o clássico mais assistido do planeta",
    "Nem título de liga é preciso para El Clásico valer temporada inteira",
  ]},
  { id: "rma-atm", clubIds: ["real-madrid", "atletico-madrid"], name: "Real Madrid x Atlético de Madrid", nickname: "Derbi Madrileño", intensity: 4, headlines: [
    "Derbi Madrileño divide a capital espanhola em duas torcidas apaixonadas",
    "Atlético de Madrid tenta provar que a cidade não é só do Real",
    "O Derbi Madrileño ganha ares de final antecipada",
  ]},
  { id: "mci-mun", clubIds: ["man-city", "man-utd"], name: "Manchester City x Manchester United", nickname: "Derby de Manchester", intensity: 4, headlines: [
    "Derby de Manchester decide o orgulho da cidade por uma tarde",
    "Manchester City e United fazem o clássico mais assistido da Inglaterra",
    "Cada Derby de Manchester carrega uma década de provocações acumuladas",
  ]},
  { id: "mun-liv", clubIds: ["man-utd", "liverpool"], name: "Manchester United x Liverpool", nickname: "Clássico do Noroeste Inglês", intensity: 5, headlines: [
    "United e Liverpool disputam a rivalidade mais tradicional da Inglaterra",
    "O Clássico do Noroeste Inglês reacende décadas de disputa por hegemonia",
    "Manchester United x Liverpool sempre parece maior do que qualquer tabela",
  ]},
  { id: "ars-tot", clubIds: ["arsenal", "tottenham"], name: "Arsenal x Tottenham", nickname: "Derby do Norte de Londres", intensity: 4, headlines: [
    "Derby do Norte de Londres divide a cidade em vermelho e branco",
    "Arsenal e Tottenham fazem o clássico mais barulhento da capital inglesa",
    "Vencer o Derby do Norte de Londres vale mais do que três pontos",
  ]},
  { id: "che-ars", clubIds: ["chelsea", "arsenal"], name: "Chelsea x Arsenal", nickname: "Clássico de Londres", intensity: 3, headlines: [
    "Chelsea e Arsenal disputam mais um capítulo do Clássico de Londres",
    "O Clássico de Londres promete equilíbrio e muita marcação",
    "Torcidas rivais tomam conta de Stamford Bridge no Clássico de Londres",
  ]},
  { id: "int-mil", clubIds: ["inter", "milan"], name: "Inter de Milão x Milan", nickname: "Derby della Madonnina", intensity: 5, headlines: [
    "Derby della Madonnina divide Milão ao meio outra vez",
    "Inter e Milan fazem o clássico mais tradicional da Itália",
    "O Derby della Madonnina nunca perde a intensidade, seja qual for a fase",
  ]},
  { id: "juv-int", clubIds: ["juventus", "inter"], name: "Juventus x Inter de Milão", nickname: "Derby d'Italia", intensity: 4, headlines: [
    "Derby d'Italia opõe as duas torcidas mais numerosas do país",
    "Juventus e Inter disputam a rivalidade nacional mais antiga da Serie A",
    "O Derby d'Italia costuma pesar direto na briga pelo título",
  ]},
  { id: "juv-mil", clubIds: ["juventus", "milan"], name: "Juventus x Milan", nickname: "Clássico Italiano", intensity: 4, headlines: [
    "Juventus e Milan protagonizam mais um Clássico Italiano de gigantes",
    "O Clássico Italiano reúne duas das históricas mais vencedoras do país",
    "Cada duelo entre Juventus e Milan carrega peso de decisão de título",
  ]},
  { id: "rom-nap", clubIds: ["roma", "napoli"], name: "Roma x Napoli", nickname: "Clássico do Sul", intensity: 3, headlines: [
    "Clássico do Sul coloca duas torcidas apaixonadas frente a frente",
    "Roma recebe o Napoli num duelo que sempre rende clima quente",
    "O Clássico do Sul segue como um dos mais vibrantes da Itália",
  ]},
  { id: "bay-bvb", clubIds: ["bayern", "dortmund"], name: "Bayern de Munique x Borussia Dortmund", nickname: "Der Klassiker", intensity: 5, headlines: [
    "Der Klassiker decide o rumo do Campeonato Alemão outra vez",
    "Bayern e Dortmund fazem o clássico que resume o futebol da Alemanha",
    "Der Klassiker reúne o time mais vencedor contra o maior desafiante do país",
  ]},
  { id: "psg-om", clubIds: ["psg", "marseille"], name: "Paris Saint-Germain x Olympique de Marselha", nickname: "Le Classique", intensity: 5, headlines: [
    "Le Classique divide a França entre a capital e o sul do país",
    "PSG e Marselha protagonizam a rivalidade mais intensa da Ligue 1",
    "Le Classique promete Parc des Princes lotado e clima de decisão",
  ]},
  { id: "por-ben", clubIds: ["porto", "benfica"], name: "Porto x Benfica", nickname: "O Clássico", intensity: 5, headlines: [
    "O Clássico português decide boa parte do título nacional",
    "Porto e Benfica disputam a rivalidade mais antiga de Portugal",
    "O Clássico entre dragões e águias segue rendendo capítulos históricos",
  ]},
  { id: "por-scp", clubIds: ["porto", "sporting"], name: "Porto x Sporting", nickname: "Dérbi das Antas", intensity: 3, headlines: [
    "Dérbi das Antas reúne tradição e ambição nos dois lados",
    "Porto recebe o Sporting em mais um capítulo de uma rivalidade antiga",
    "O Dérbi das Antas costuma render um dos jogos mais disputados do ano",
  ]},
  { id: "ben-scp", clubIds: ["benfica", "sporting"], name: "Benfica x Sporting", nickname: "Clássico de Lisboa", intensity: 4, headlines: [
    "Clássico de Lisboa divide a capital portuguesa por uma tarde inteira",
    "Benfica e Sporting fazem o duelo mais tradicional da capital",
    "O Clássico de Lisboa segue como um dos mais aguardados de Portugal",
  ]},
  { id: "aja-fey", clubIds: ["ajax", "feyenoord"], name: "Ajax x Feyenoord", nickname: "De Klassieker", intensity: 4, headlines: [
    "De Klassieker reacende a rivalidade mais forte da Holanda",
    "Ajax e Feyenoord disputam o clássico que resume o futebol holandês",
    "De Klassieker promete Johan Cruyff Arena tomada por tensão",
  ]},
];

export function findRivalry(clubIdA: string, clubIdB: string): Rivalry | undefined {
  return RIVALRIES.find(
    (rivalry) =>
      (rivalry.clubIds[0] === clubIdA && rivalry.clubIds[1] === clubIdB) ||
      (rivalry.clubIds[0] === clubIdB && rivalry.clubIds[1] === clubIdA),
  );
}

// ============================================================================
// CONQUISTAS
// ============================================================================

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
  | "retired";

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
];

const BOOLEAN_METRIC_FIELDS = new Set<MetricField>(["wasCaptain", "nationalCaptain", "retired"]);

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

// ============================================================================
// MANCHETES
// ============================================================================

export type NewsCategory = "season" | "title" | "transfer" | "national" | "setback" | "milestone" | "rivalry" | "contract";

export type NewsTemplate = {
  id: string;
  category: NewsCategory;
  template: string;
};

export const NEWS_TEMPLATES: NewsTemplate[] = [
  { id: "season-01", category: "season", template: "Temporada {season}: {player} vira peça-chave do {club}" },
  { id: "season-02", category: "season", template: "{club} inicia a temporada {season} apostando todas as fichas em {player}" },
  { id: "season-03", category: "season", template: "Com {player} em alta, {club} sonha grande na temporada {season}" },
  { id: "season-04", category: "season", template: "{season} começa e {player} já é notícia diária no {club}" },
  { id: "season-05", category: "season", template: "Pré-temporada movimentada: {player} chega afiado para {season}" },
  { id: "season-06", category: "season", template: "{club} define {player} como titular absoluto para a temporada {season}" },
  { id: "season-07", category: "season", template: "Torcida do {club} projeta temporada histórica com {player} em campo" },
  { id: "title-01", category: "title", template: "{club} é campeão! {player} decide mais uma vez" },
  { id: "title-02", category: "title", template: "Título confirmado: {player} entra para a galeria de ídolos do {club}" },
  { id: "title-03", category: "title", template: "{competition} tem dono: {player} e o {club} erguem a taça" },
  { id: "title-04", category: "title", template: "Festa no {club}: {player} celebra o título da {competition}" },
  { id: "title-05", category: "title", template: "{player} lidera o {club} ao título da {competition} e vira símbolo da temporada" },
  { id: "title-06", category: "title", template: "Depois de anos de espera, {club} volta a ser campeão com {player} em campo" },
  { id: "title-07", category: "title", template: "{competition}: {club} bate recorde e {player} vira nome da conquista" },
  { id: "transfer-01", category: "transfer", template: "Confirmado: {player} é o novo reforço do {club}" },
  { id: "transfer-02", category: "transfer", template: "{club} anuncia a contratação de {player} em negócio milionário" },
  { id: "transfer-03", category: "transfer", template: "{player} assina com o {club} e vira a nova esperança da torcida" },
  { id: "transfer-04", category: "transfer", template: "Depois de meses de especulação, {player} fecha com o {club}" },
  { id: "transfer-05", category: "transfer", template: "{club} vence a concorrência e garante a contratação de {player}" },
  { id: "transfer-06", category: "transfer", template: "{player} desembarca no {club} prometendo virar a página da temporada" },
  { id: "transfer-07", category: "transfer", template: "Negócio fechado: {player} troca de camisa rumo ao {club}" },
  { id: "national-01", category: "national", template: "{player} é convocado para defender a Seleção" },
  { id: "national-02", category: "national", template: "Estreia com a camisa da Seleção: {player} entra para a história" },
  { id: "national-03", category: "national", template: "{player} vira presença constante na lista de convocados" },
  { id: "national-04", category: "national", template: "Seleção confirma {player} para a próxima janela de jogos" },
  { id: "national-05", category: "national", template: "{player} comemora mais uma convocação e mira a titularidade" },
  { id: "national-06", category: "national", template: "Comissão técnica aposta em {player} para o próximo ciclo" },
  { id: "national-07", category: "national", template: "{player} se firma na Seleção e vira dor de cabeça para adversários" },
  { id: "setback-01", category: "setback", template: "{player} vive fase difícil e vê o {club} pressionado" },
  { id: "setback-02", category: "setback", template: "Lesão tira {player} de sequência importante do {club}" },
  { id: "setback-03", category: "setback", template: "Queda de rendimento preocupa torcida do {club} em relação a {player}" },
  { id: "setback-04", category: "setback", template: "{player} perde espaço no {club} depois de sequência de resultados ruins" },
  { id: "setback-05", category: "setback", template: "Cobrança aumenta sobre {player} após tropeços do {club}" },
  { id: "setback-06", category: "setback", template: "{club} vive momento de crise e {player} vira alvo de críticas" },
  { id: "setback-07", category: "setback", template: "{player} enfrenta má fase e torcida do {club} cobra reação" },
  { id: "milestone-01", category: "milestone", template: "{player} chega a marca histórica pelo {club}" },
  { id: "milestone-02", category: "milestone", template: "Recorde batido: {player} entra para a lista de ídolos do {club}" },
  { id: "milestone-03", category: "milestone", template: "{player} celebra jogo de número redondo com a camisa do {club}" },
  { id: "milestone-04", category: "milestone", template: "Marco na carreira: {player} atinge feito raro no {club}" },
  { id: "milestone-05", category: "milestone", template: "{player} se torna um dos maiores nomes da história do {club}" },
  { id: "milestone-06", category: "milestone", template: "Estatística rara: {player} alcança número que poucos chegaram no {club}" },
  { id: "milestone-07", category: "milestone", template: "{club} celebra marca histórica de {player} antes da partida" },
  { id: "rivalry-01", category: "rivalry", template: "Clássico contra o {rival}: {player} promete noite especial" },
  { id: "rivalry-02", category: "rivalry", template: "{player} decide o clássico e vira ídolo na rivalidade contra o {rival}" },
  { id: "rivalry-03", category: "rivalry", template: "Vaia ou aplauso: {player} sabe o que representa enfrentar o {rival}" },
  { id: "rivalry-04", category: "rivalry", template: "{club} x {rival}: {player} é a principal esperança da torcida" },
  { id: "rivalry-05", category: "rivalry", template: "{player} entra para a história dos clássicos contra o {rival}" },
  { id: "rivalry-06", category: "rivalry", template: "Depois do apito final, {player} vira assunto na rivalidade com o {rival}" },
  { id: "rivalry-07", category: "rivalry", template: "{rival} teme o retrospecto de {player} em clássicos decisivos" },
  { id: "contract-01", category: "contract", template: "{player} renova contrato com o {club} até {season}" },
  { id: "contract-02", category: "contract", template: "Depois de meses de negociação, {player} assina nova renovação com o {club}" },
  { id: "contract-03", category: "contract", template: "{club} garante a permanência de {player} com contrato longo" },
  { id: "contract-04", category: "contract", template: "{player} vira prioridade da diretoria do {club} na hora de renovar" },
  { id: "contract-05", category: "contract", template: "Sem acordo à vista, futuro de {player} no {club} vira incógnita" },
  { id: "contract-06", category: "contract", template: "{club} oferece nova proposta para blindar {player} do mercado" },
  { id: "contract-07", category: "contract", template: "{player} aceita nova proposta e segue no {club} por mais temporadas" },
];

export function fillNewsTemplate(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => tokens[key] ?? match);
}

// ============================================================================
// EVENTOS DA MEGA EXPANSÃO
// ============================================================================

export const MEGA_EVENTS: GameEvent[] = [
  { id: "mega-departamento-de-dados", icon: "◧", tag: "ANALYTICS", title: "Os números não perdoam", description: "O departamento de dados do clube europeu questiona seu estilo de jogo com base em métricas que você nunca tinha visto antes.", needsAbroad: true, choices: [
    { label: "Adaptar-se ao relatório", hint: "Adaptação ↑ · estilo muda", result: "Você aceita ajustar detalhes que os números apontaram.", effect: { adaptation: 10, potential: 1 } },
    { label: "Confiar no próprio instinto", hint: "Moral ↑ · atrito com o staff", result: "Você prefere seguir jogando do seu jeito, mesmo contrariando a planilha.", effect: { morale: 6, reputation: -2 } },
  ]},
  { id: "mega-hostil-fora-de-casa", icon: "▲", tag: "EUROPA", title: "O estádio mais hostil do campeonato", description: "A viagem leva você a um campo pequeno e barulhento, onde a torcida da casa não dá um segundo de sossego.", needsAbroad: true, choices: [
    { label: "Isolar o barulho e jogar seu jogo", hint: "Seguro", result: "Você trata o caos das arquibancadas como parte do trabalho.", effect: { reputation: 4, adaptation: 5 } },
    { label: "Responder às provocações", hint: "Torcida ↑ · risco", result: "Você decide calar o estádio com atuação, não com paciência.", effect: { fans: 6, morale: -3, reputation: 2 } },
  ]},
  { id: "mega-agente-local-pressiona", icon: "§", tag: "EMPRESÁRIO", title: "Um agente local promete um clube maior", description: "Recém-chegado à Europa, outro empresário se aproxima garantindo que pode te tirar dali em poucos meses.", needsAbroad: true, minAge: 21, choices: [
    { label: "Ouvir a proposta", hint: "50% · abre mercado ou gera desconfiança", result: "Você aceita uma primeira conversa, sem assinar nada ainda.", effect: {}, luck: { chance: 50, successText: "As portas se abrem rápido demais para acreditar — contratos e clubes maiores entram em contato.", failureText: "A conversa vaza para dentro do vestiário e o clube atual passa a desconfiar de você.", successEffect: { transfer: true, reputation: 5 }, failureEffect: { reputation: -6, morale: -5 } } },
    { label: "Recusar e manter o foco", hint: "Moral ↑", result: "Você prefere não misturar o presente com promessas incertas.", effect: { morale: 5, adaptation: 4 } },
  ]},
  { id: "mega-emprestimo-conversa-informal", icon: "⇄", tag: "BASTIDORES", title: "Uma conversa de corredor sobre empréstimo", description: "Sem espaço no time principal, o diretor esportivo comenta de forma informal sobre um possível empréstimo para outro clube da Europa.", needsAbroad: true, maxOvr: 83, choices: [
    { label: "Topar a ideia", hint: "Empréstimo · nova camisa europeia", result: "Você prefere jogar de verdade em outro lugar a esquentar o banco.", effect: { transfer: true, transferAbroad: true, loan: true, minutes: 10, adaptation: -3 } },
    { label: "Pedir mais tempo no elenco atual", hint: "OVR ↑ · risco de continuar reserva", result: "Você aposta que a paciência ainda pode virar o jogo.", effect: { ovr: 1, fitness: -6, minutes: 2 } },
  ]},
  { id: "mega-marca-global-europa", icon: "$", tag: "PATROCÍNIO", title: "Uma marca global bate à porta", description: "Um contrato internacional de patrocínio pode colocar seu nome em vitrines de vários países ao mesmo tempo.", needsAbroad: true, minOvr: 74, oneTime: true, choices: [
    { label: "Assinar o contrato global", hint: "Dinheiro ↑↑↑ · exposição", result: "Sua imagem passa a viajar mais rápido que qualquer transferência.", effect: { money: 20, reputation: 8, morale: -3 } },
    { label: "Priorizar marcas locais", hint: "Adaptação ↑ · dinheiro médio", result: "Você escolhe crescer devagar dentro do novo país.", effect: { money: 8, adaptation: 6 } },
  ]},
  { id: "mega-tabloide-europeu", icon: "●", tag: "IMPRENSA", title: "O tabloide inventou uma crise", description: "Uma matéria sem fontes garante que você está insatisfeito e prestes a pedir para sair do clube.", needsAbroad: true, minAge: 20, choices: [
    { label: "Desmentir publicamente", hint: "Reputação ↑ · exposição", result: "Você decide não deixar a história crescer sozinha.", effect: { reputation: 5, morale: -2 } },
    { label: "Deixar o clube desmentir", hint: "Profissionalismo ↑", result: "A nota oficial resolve o assunto sem seu nome na entrevista.", effect: { leadership: 3, adaptation: 3 } },
  ]},
  { id: "mega-classico-decisivo-br", icon: "⚔", tag: "CLÁSSICO", title: "O clássico que define o returno", description: "A rivalidade histórica do seu clube chega numa rodada decisiva na briga pelo título nacional.", minOvr: 74, needsDomestic: true, needsRivalry: true, choices: [
    { label: "Pedir a braçadeira no discurso pré-jogo", hint: "Liderança ↑↑ · pressão", result: "Você assume a palavra antes mesmo de assumir a bola.", effect: { leadership: 10, titleBoost: 8, morale: -2 } },
    { label: "Deixar o futebol falar", hint: "Título ↑ · seguro", result: "Você prefere responder dentro de campo, sem discurso extra.", effect: { titleBoost: 10, reputation: 4 } },
    { label: "Provocar a torcida rival antes do jogo", hint: "35% · vira símbolo ou vira alvo", result: "Você publica uma provocação nas redes horas antes da bola rolar.", effect: {}, luck: { chance: 35, successText: "A provocação vira símbolo de confiança e a torcida do seu clube abraça a ousadia.", failureText: "O resultado não acompanha a provocação e a rivalidade cobra caro por isso.", successEffect: { fans: 14, reputation: 10, titleBoost: 10 }, failureEffect: { fans: -10, reputation: -8, morale: -10 } } },
  ]},
  { id: "mega-torcida-do-bairro", icon: "♡", tag: "TORCIDA", title: "O bairro onde você cresceu monta uma festa", description: "Moradores organizam uma recepção especial antes do jogo em casa, com faixas e direito a churrasco na rua.", minAge: 19, oneTime: true, choices: [
    { label: "Participar e agradecer", hint: "Fãs ↑↑ · moral ↑", result: "Você volta às origens antes de entrar em campo.", effect: { fans: 10, morale: 8 } },
    { label: "Manter distância da exposição", hint: "Foco ↑", result: "Você prefere guardar energia só para o jogo.", effect: { fitness: 4, potential: 1 } },
  ]},
  { id: "mega-diretoria-cobra-resultado", icon: "!", tag: "DIRETORIA", title: "A diretoria quer resposta imediata", description: "Resultados ruins fazem a cúpula do clube chamar os principais jogadores para uma reunião fechada.", minAge: 23, choices: [
    { label: "Assumir compromisso público", hint: "Pressão ↑ · liderança ↑", result: "Você garante à diretoria que o time vai reagir.", effect: { leadership: 8, reputation: 4, morale: -3 } },
    { label: "Pedir paciência e trabalho", hint: "Moral ↑ · título ↓", result: "Você defende tempo para reconstruir o time em vez de respostas rápidas.", effect: { morale: 6, titleBoost: -5 } },
  ]},
  { id: "mega-reforco-ameaca-posicao", icon: "↔", tag: "ELENCO", title: "O reforço badalado chegou para sua posição", description: "A diretoria trouxe um nome caro exatamente para o seu setor do campo.", minAge: 22, choices: [
    { label: "Disputar a posição no treino", hint: "OVR ↑ · físico ↓", result: "Você decide que a titularidade se conquista todo dia.", effect: { ovr: 1, fitness: -8, minutes: 3 } },
    { label: "Aceitar dividir minutos", hint: "Grupo ↑ · minutos ↓", result: "Você escolhe cooperar em vez de competir abertamente.", effect: { morale: 5, minutes: -6, leadership: 3 } },
  ]},
  { id: "mega-copa-do-brasil-decisao", icon: "COPA", tag: "COPA DO BRASIL", title: "O jogo da volta que decide milhões", description: "O placar do primeiro confronto deixou tudo em aberto na competição de mata-mata nacional.", needsDomestic: true, choices: [
    { label: "Buscar o resultado no ataque", hint: "Título ↑↑ · risco físico", result: "Você decide que esperar não é uma opção.", effect: { titleBoost: 14, fitness: -10, injuryRisk: 6 } },
    { label: "Jogar por trás, no contra-ataque", hint: "Título ↑ · seguro", result: "Você prefere deixar o adversário se expor primeiro.", effect: { titleBoost: 8, leadership: 5 } },
  ]},
  { id: "mega-empresta-para-time-menor", icon: "⇄", tag: "MERCADO", title: "Um empréstimo para voltar a jogar", description: "Sem espaço no elenco principal no Brasil, o clube sugere um empréstimo informal para outra equipe da elite nacional só para você recuperar ritmo de jogo.", maxOvr: 78, minAge: 19, needsDomestic: true, choices: [
    { label: "Aceitar o empréstimo", hint: "Minutos ↑↑ · transferência temporária", result: "Você troca o banco por bola rolando de verdade em outro time.", effect: { transfer: true, loan: true, minutes: 12, reputation: 1 } },
    { label: "Brigar pelo seu espaço", hint: "OVR ↑ · risco", result: "Você aposta que ainda pode reconquistar o lugar no time atual.", effect: { ovr: 1, fitness: -7, minutes: 2 } },
  ]},
  { id: "mega-sub17-mundial", icon: "★", tag: "SUB-17", title: "A Copa do Mundo da categoria", description: "Sua seleção de base embarca para o Mundial Sub-17, com câmeras do planeta inteiro observando os garotos.", needsNationalYouth: true, seasonParity: "odd", minAge: 16, maxAge: 17, oneTime: true, choices: [
    { label: "Jogar solto, sem medo do palco", hint: "Convocado · reputação ↑↑", result: "Você trata o Mundial como uma vitrine e não como um teste.", effect: { reputation: 12, nationalBoost: 14, nationalCall: true, fitness: -6 } },
    { label: "Focar em aprender com o torneio", hint: "Convocado · evolução futura", result: "Você usa cada jogo para crescer, mais do que para aparecer.", effect: { potential: 3, nationalBoost: 8, nationalCall: true } },
  ]},
  { id: "mega-clube-limita-carga-base", icon: "▤", tag: "BASTIDORES", title: "O clube pede para dosar sua presença na base", description: "O departamento de performance do clube sugere reduzir jogos pela seleção de base para preservar seu desenvolvimento físico.", needsNationalYouth: true, minAge: 17, choices: [
    { label: "Seguir defendendo a seleção de base", hint: "Convocado · físico ↓", result: "Você não abre mão da camisa da seleção enquanto pode vesti-la.", effect: { nationalBoost: 10, fitness: -7, nationalCall: true } },
    { label: "Aceitar o pedido do clube", hint: "Físico ↑ · seleção ↓", result: "Você prioriza a recuperação sugerida pelo clube.", effect: { fitness: 9, nationalBoost: -6 } },
  ]},
  { id: "mega-amistoso-base-na-europa", icon: "✈", tag: "EXCURSÃO", title: "Uma excursão da base pela Europa", description: "A seleção de base viaja para amistosos contra seleções europeias, uma vitrine e tanto para quem ainda não tem nome grande.", needsNationalYouth: true, nationalWindow: "qualifiers", minAge: 17, maxAge: 20, choices: [
    { label: "Aproveitar a vitrine ao máximo", hint: "Reputação ↑↑ · pressão", result: "Você joga cada minuto como se fosse uma final.", effect: { reputation: 9, nationalBoost: 8, nationalCall: true, fitness: -5 } },
    { label: "Jogar dentro do combinado", hint: "Convocado · seguro", result: "Você segue o plano de jogo sem tentar aparecer demais.", effect: { nationalBoost: 6, leadership: 2, nationalCall: true } },
  ]},
  { id: "mega-lesao-na-base", icon: "+", tag: "DEPARTAMENTO MÉDICO", title: "Uma lesão em plena convocação de base", description: "O corpo pede parada bem na semana em que a seleção de base mais precisava de você.", needsNationalYouth: true, needsLowFitness: true, choices: [
    { label: "Insistir e jogar mesmo assim", hint: "Seleção ↑ · lesão ↑↑", result: "Você não quer perder a chance por conta da dor.", effect: { nationalBoost: 8, fitness: -16, injuryRisk: 14, nationalCall: true } },
    { label: "Comunicar e voltar para o clube", hint: "Seguro · seleção ↓", result: "Você prefere cuidar do corpo mesmo perdendo a convocação.", effect: { fitness: 14, nationalBoost: -6 } },
  ]},
  { id: "mega-vice-capitania-selecao", icon: "C", tag: "SELEÇÃO", title: "A comissão técnica oferece a vice-capitania", description: "O técnico quer você como segunda liderança da Seleção, um degrau abaixo da braçadeira principal.", needsNationalMain: true, minAge: 24, minOvr: 76, choices: [
    { label: "Aceitar o papel de vice", hint: "Liderança ↑↑ · reputação ↑", result: "Você aceita o peso extra dentro do grupo da Seleção.", effect: { leadership: 10, reputation: 6, nationalBoost: 6, nationalCall: true } },
    { label: "Preferir focar só no jogo", hint: "Convocado · sem título extra", result: "Você prefere que a braçadeira fique com outra pessoa.", effect: { nationalBoost: 5, morale: 3, nationalCall: true } },
  ]},
  { id: "mega-imprensa-internacional-selecao", icon: "●", tag: "IMPRENSA", title: "A imprensa internacional duvida da Seleção", description: "Veículos estrangeiros publicam que seu país não tem nível para brigar por título, e seu nome é citado direto na matéria.", needsNationalMain: true, minAge: 22, choices: [
    { label: "Responder com atuação", hint: "Reputação ↑ · pressão", result: "Você decide calar a crítica jogando, não discutindo.", effect: { reputation: 6, nationalTitleBoost: 8, fitness: -5 } },
    { label: "Ignorar e focar no grupo", hint: "Moral ↑", result: "Você trata a opinião de fora como ruído.", effect: { morale: 6, leadership: 2 } },
  ]},
  { id: "mega-treino-fechado-selecao", icon: "☰", tag: "SELEÇÃO", title: "Um treino fechado antes da decisão", description: "O técnico isola o grupo dias antes da fase decisiva do torneio continental para acertar os últimos detalhes táticos.", needsNationalMain: true, nationalWindow: "continental", choices: [
    { label: "Puxar a intensidade do treino", hint: "Título da Seleção ↑ · físico ↓", result: "Você trata cada treinamento como se já fosse a decisão.", effect: { nationalTitleBoost: 10, fitness: -8, nationalCall: true } },
    { label: "Guardar energia para o jogo", hint: "Físico ↑ · seguro", result: "Você prefere chegar inteiro para o momento que importa.", effect: { fitness: 8, nationalTitleBoost: 4, nationalCall: true } },
  ]},
  { id: "mega-bronca-publica-tecnico-selecao", icon: "!", tag: "SELEÇÃO", title: "O técnico da Seleção critica publicamente o time", description: "Depois de uma atuação ruim, a entrevista coletiva do treinador soa como um recado direto para o grupo.", needsNationalMain: true, minAge: 25, choices: [
    { label: "Responder em campo no próximo jogo", hint: "Reputação ↑ · pressão", result: "Você decide que a resposta certa vem dentro de campo.", effect: { reputation: 5, nationalTitleBoost: 6, fitness: -4 } },
    { label: "Conversar com o técnico em particular", hint: "Liderança ↑", result: "Você prefere resolver o desconforto longe das câmeras.", effect: { leadership: 6, morale: 3 } },
  ]},
  { id: "mega-provocacao-nas-redes-classico", icon: "#", tag: "CLÁSSICO", title: "A provocação que viralizou antes do clássico", description: "Um vídeo seu de anos atrás voltou a circular bem na semana do maior jogo do calendário.", minAge: 20, choices: [
    { label: "Assumir e prometer decidir em campo", hint: "Fãs ↑↑ · pressão", result: "Você transforma a polêmica em combustível.", effect: { fans: 10, reputation: 6, morale: -4 } },
    { label: "Pedir desculpas publicamente", hint: "Moral ↑ · torcida rival menos hostil", result: "Você prefere esfriar o assunto antes do apito inicial.", effect: { morale: 5, reputation: 2 } },
  ]},
  { id: "mega-documentario-da-rivalidade", icon: "▶", tag: "MÍDIA", title: "Um documentário sobre a rivalidade do seu clube", description: "Uma produtora quer sua participação para contar a história do maior clássico que você já viveu.", minOvr: 74, oneTime: true, choices: [
    { label: "Contar tudo o que sentiu nos clássicos", hint: "Fãs ↑↑ · exposição", result: "Você abre detalhes que a torcida nunca tinha ouvido.", effect: { fans: 14, reputation: 8, morale: -3 } },
    { label: "Falar só de dentro de campo", hint: "Reputação ↑ · foco", result: "Você mantém o foco no futebol, não na sua vida pessoal.", effect: { reputation: 5, morale: 2 } },
  ]},
  { id: "mega-classico-europeu-decisivo", icon: "⚔", tag: "EUROPA", title: "O clássico decide a temporada europeia", description: "A rivalidade centenária do seu clube na Europa chega numa rodada que pode definir tudo.", needsAbroad: true, needsRivalry: true, minOvr: 78, choices: [
    { label: "Assumir o papel de protagonista", hint: "40% · virar lenda local ou vilão da torcida", result: "Você pede a responsabilidade no jogo mais observado do ano.", effect: {}, luck: { chance: 40, successText: "Você decide o clássico e a torcida grava seu nome na história do clube.", failureText: "O erro decisivo é seu, e a rivalidade cobra caro por muito tempo.", successEffect: { ovr: 3, titleBoost: 20, fans: 18, reputation: 14 }, failureEffect: { ovr: -2, titleBoost: -14, fans: -14, reputation: -8, morale: -12 } } },
    { label: "Jogar dentro do plano do treinador", hint: "Título ↑ · seguro", result: "Você confia mais no coletivo do que num lance individual.", effect: { titleBoost: 9, adaptation: 5, leadership: 4 } },
  ]},
  { id: "mega-conflito-diretoria-tecnico", icon: "×", tag: "BASTIDORES", title: "Diretoria e comissão técnica em rota de colisão", description: "Rumores de bastidor dizem que o técnico não dura mais duas rodadas — e o grupo sente o clima pesado.", minAge: 21, choices: [
    { label: "Apoiar publicamente o técnico", hint: "Grupo ↑ · risco político", result: "Você decide defender quem te colocou em campo.", effect: { morale: 6, leadership: 5, reputation: -2 } },
    { label: "Manter neutralidade", hint: "Seguro", result: "Você prefere não se envolver na disputa de bastidores.", effect: { morale: 2 } },
  ]},
  { id: "mega-vazamento-tatico", icon: "◧", tag: "VAZAMENTO", title: "O esquema tático vazou antes do jogo", description: "Prints de uma reunião interna circulam nas redes horas antes da partida decisiva.", choices: [
    { label: "Cobrar apuração interna", hint: "Liderança ↑ · clima tenso", result: "Você exige saber quem colocou o plano de jogo em risco.", effect: { leadership: 7, morale: -3 } },
    { label: "Focar só na partida", hint: "OVR ↑ · seguro", result: "Você decide não perder energia com o vazamento.", effect: { ovr: 1, fitness: -4 } },
  ]},
  { id: "mega-crise-de-vestiario-profunda", icon: "╱", tag: "CRISE", title: "Uma crise que já dura semanas", description: "Grupos rivais dentro do elenco disputam espaço, e cada resultado ruim reabre a mesma ferida.", minAge: 24, choices: [
    { label: "Convocar uma reunião só dos jogadores", hint: "Liderança ↑↑ · risco", result: "Você tenta resolver internamente antes que vire notícia.", effect: { leadership: 12, morale: 6, reputation: -2 } },
    { label: "Deixar a comissão técnica resolver", hint: "Seguro · grupo ↓", result: "Você prefere não se meter na política do vestiário.", effect: { morale: -4 } },
  ]},
  { id: "mega-entrevista-que-virou-caso", icon: "●", tag: "IMPRENSA", title: "Uma frase sua virou manchete por uma semana", description: "Uma resposta dada sem pensar demais ganhou vida própria na imprensa esportiva.", minAge: 20, choices: [
    { label: "Esclarecer em nova entrevista", hint: "Reputação ↑ · exposição", result: "Você tenta explicar o contexto antes que a história cresça mais.", effect: { reputation: 4, morale: -2 } },
    { label: "Deixar o assunto morrer sozinho", hint: "Moral ↑", result: "Você aposta que o barulho passa em poucos dias.", effect: { morale: 5 } },
  ]},
  { id: "mega-capa-de-revista-esportiva", icon: "▶", tag: "MÍDIA", title: "Uma revista esportiva quer você na capa", description: "A proposta é generosa e a exposição, gigante — mas nem todo mundo lida bem com tanta câmera.", minOvr: 75, oneTime: true, choices: [
    { label: "Aceitar e aproveitar o momento", hint: "Fama ↑↑ · dinheiro ↑", result: "Você decide surfar a onda enquanto ela dura.", effect: { reputation: 10, money: 10, morale: -2, fans: 6 } },
    { label: "Recusar e manter o perfil discreto", hint: "Foco ↑", result: "Você prefere deixar a bola falar por você.", effect: { fitness: 4, potential: 1 } },
  ]},
  { id: "mega-empresario-quer-controle-total", icon: "§", tag: "EMPRESÁRIO", title: "Seu empresário quer decidir tudo sozinho", description: "Ele promete cuidar de contratos, mídia e até da vida pessoal — sem consultar você antes de cada decisão.", minAge: 21, choices: [
    { label: "Dar mais autonomia a ele", hint: "45% · mercado explode ou sai do controle", result: "Você assina uma procuração ampla, confiando no faro dele.", effect: {}, luck: { chance: 45, successText: "As portas se abrem rápido demais para acreditar — contratos, marcas e um mercado aquecido.", failureText: "Decisões tomadas sem sua palavra geram desconforto com o clube e com a torcida.", successEffect: { money: 14, reputation: 10, transfer: true }, failureEffect: { money: -8, reputation: -10, morale: -12 } } },
    { label: "Manter cada decisão nas suas mãos", hint: "Liderança ↑ · mais devagar", result: "Você prefere um crescimento mais lento, mas sob seu controle.", effect: { leadership: 5, morale: 4 } },
  ]},
  { id: "mega-empresario-pressiona-saida", icon: "§", tag: "EMPRESÁRIO", title: "Seu empresário insiste numa saída que você não pediu", description: "Ele já tem um novo destino combinado e só espera sua assinatura no papel.", minAge: 22, choices: [
    { label: "Confiar no plano dele", hint: "Transferência · risco", result: "Você decide seguir o faro comercial do seu empresário.", effect: { transfer: true, money: 6, reputation: -2 } },
    { label: "Dizer que decide sozinho", hint: "Liderança ↑ · atrito com o empresário", result: "Você deixa claro quem manda na própria carreira.", effect: { leadership: 6, morale: 3 } },
  ]},
  { id: "mega-nascimento-do-filho", icon: "⌂", tag: "FAMÍLIA", title: "Seu filho nasceu na véspera de uma final", description: "A alegria mais importante da vida chega bem no meio da semana mais decisiva da temporada.", minAge: 22, oneTime: true, choices: [
    { label: "Ficar perto da família nos primeiros dias", hint: "Moral ↑↑ · minutos ↓", result: "Você escolhe estar presente no que realmente importa.", effect: { morale: 16, minutes: -6, fitness: 2 } },
    { label: "Viajar para a decisão e voltar depois", hint: "Título ↑ · culpa", result: "Você decide não abrir mão do jogo mais importante do ano.", effect: { titleBoost: 10, morale: -6 } },
  ]},
  { id: "mega-doenca-na-familia", icon: "⌂", tag: "FAMÍLIA", title: "Uma notícia difícil chega de casa", description: "Um parente próximo precisa de cuidados, e a distância dos jogos nunca pesou tanto quanto agora.", minAge: 23, choices: [
    { label: "Pedir uma pausa para cuidar da família", hint: "Moral ↑ · minutos ↓", result: "Você decide que a família vem antes da tabela de jogos.", effect: { morale: 10, minutes: -8, fitness: 2 } },
    { label: "Seguir jogando e ajudar à distância", hint: "OVR ↑ · moral ↓", result: "Você tenta equilibrar o impossível entre carreira e casa.", effect: { ovr: 1, morale: -9 } },
  ]},
  { id: "mega-lesao-grave-recuperacao", icon: "+", tag: "DEPARTAMENTO MÉDICO", title: "O diagnóstico veio pior do que o esperado", description: "A lesão vai exigir meses fora, e o método de recuperação escolhido agora pode mudar o resto da carreira.", minAge: 22, maxAge: 32, needsLowFitness: true, oneTime: true, choices: [
    { label: "Tentar um tratamento experimental", hint: "50% · volta renovado ou sequela", result: "Você aceita um método ainda pouco testado, em busca de uma recuperação mais rápida.", effect: {}, luck: { chance: 50, successText: "O corpo responde melhor do que qualquer médico previu. Você volta como se a lesão nunca tivesse existido.", failureText: "A recuperação trava, e uma sequência de recaídas assombra a temporada seguinte.", successEffect: { ovr: 2, fitness: 22, potential: 1 }, failureEffect: { ovr: -4, fitness: -22, injuryRisk: 15, morale: -14 } } },
    { label: "Seguir o protocolo tradicional", hint: "Seguro · mais tempo fora", result: "Você escolhe o caminho mais lento, mas mais conhecido.", effect: { fitness: 16, morale: -3, minutes: -8 } },
  ]},
  { id: "mega-cirurgia-preventiva", icon: "+", tag: "DEPARTAMENTO MÉDICO", title: "Uma cirurgia preventiva é sugerida", description: "O departamento médico recomenda operar agora uma lesão que ainda não dói, para evitar um problema maior no futuro.", minAge: 27, choices: [
    { label: "Fazer a cirurgia agora", hint: "Tempo fora · segurança futura", result: "Você prefere resolver o problema antes que ele resolva por você.", effect: { fitness: 14, minutes: -10, injuryRisk: -8 } },
    { label: "Adiar e monitorar", hint: "Minutos ↑ · risco futuro", result: "Você decide manter os jogos em dia e acompanhar de perto.", effect: { minutes: 5, injuryRisk: 6 } },
  ]},
  { id: "mega-marca-propria-de-chuteiras", icon: "$", tag: "PATROCÍNIO", title: "Sua própria linha de chuteiras", description: "Uma marca esportiva propõe lançar um produto assinado com o seu nome.", minOvr: 82, minAge: 26, oneTime: true, choices: [
    { label: "Investir tempo no lançamento", hint: "Dinheiro ↑↑↑ · foco dividido", result: "Você mergulha nos detalhes da campanha e do produto.", effect: { money: 22, reputation: 6, fitness: -4 } },
    { label: "Ceder a imagem e focar em campo", hint: "Dinheiro ↑ · sem desgaste", result: "Você deixa a marca cuidar do lançamento sozinha.", effect: { money: 12, potential: 1 } },
  ]},
  { id: "mega-bracadeira-em-plena-crise", icon: "C", tag: "LIDERANÇA", title: "A braçadeira pesa mais numa crise", description: "O time afunda na tabela e o técnico entrega a faixa de capitão bem no pior momento da temporada.", minAge: 26, minOvr: 78, oneTime: true, choices: [
    { label: "Aceitar liderar a reação", hint: "Liderança ↑↑ · pressão", result: "Você assume a braçadeira sabendo o tamanho do desafio.", effect: { leadership: 14, reputation: 6, morale: -4, clubCaptain: true } },
    { label: "Sugerir dividir a responsabilidade", hint: "Grupo ↑", result: "Você prefere espalhar o peso entre os mais experientes.", effect: { morale: 8, leadership: 6 } },
  ]},
  { id: "mega-fase-de-seca-prolongada", icon: "↓", tag: "FORMA", title: "Os gols e as boas atuações sumiram", description: "Há semanas nada sai como antes, e a torcida começa a notar cada erro com mais intensidade.", minOvr: 70, choices: [
    { label: "Voltar ao básico sem forçar", hint: "Moral ↑ · recuperação lenta", result: "Você decide simplificar o jogo até a confiança voltar.", effect: { morale: 8, fitness: 5 } },
    { label: "Buscar o próprio jogo à força", hint: "60% · sair da crise ou piorar", result: "Você tenta resolver tudo sozinho, num único lance de coragem.", effect: {}, luck: { chance: 60, successText: "Um lance de sorte destrava tudo, e a confiança volta rápido.", failureText: "A insistência não encontra resposta, e a fase ruim se estende por mais rodadas.", successEffect: { ovr: 1, morale: 10, reputation: 5 }, failureEffect: { morale: -10, reputation: -6, fitness: -5 } } },
  ]},
  { id: "mega-ultimo-ano-de-contrato-carreira", icon: "✎", tag: "CONTRATO", title: "O último ano de contrato pesa diferente agora", description: "A cada renovação adiada, a pergunta sobre até quando você vai jogar fica mais alta.", minAge: 33, maxContractYears: 1, choices: [
    { label: "Renovar por mais uma temporada", hint: "Torcida ↑ · mais um ano", result: "Você decide que ainda tem história para escrever ali.", effect: { reputation: 6, morale: 5, money: 2, contractYears: 1 } },
    { label: "Deixar em aberto e sentir a temporada", hint: "Liberdade ↑", result: "Você prefere não se comprometer antes da hora.", effect: { morale: 4 } },
  ]},
  { id: "mega-convite-para-comissao-tecnica", icon: "◇", tag: "LEGADO", title: "Um convite para o outro lado do campo", description: "A diretoria sugere que você comece a se preparar para ser auxiliar técnico assim que pendurar as chuteiras.", minAge: 34, oneTime: true, choices: [
    { label: "Aceitar aprender desde já", hint: "Liderança ↑↑ · legado", result: "Você começa a observar o jogo com outros olhos, ainda em atividade.", effect: { leadership: 10, reputation: 8, morale: 5 } },
    { label: "Focar só em jogar por enquanto", hint: "Foco ↑", result: "Você prefere decidir o futuro só depois de pendurar as chuteiras.", effect: { fitness: 4, morale: 3 } },
  ]},
  { id: "mega-concacaf-viagem-longa", icon: "CCC", tag: "CONCACAF", title: "Uma viagem que atravessa o continente", description: "A Copa de Campeões Concacaf leva o elenco para um estádio a milhares de quilômetros, em pleno meio de semana.", needsContinental: "concacaf", choices: [
    { label: "Tratar como a grande chance", hint: "Título ↑↑ · desgaste", result: "Você entende que essa vitrine pode mudar o rumo da sua carreira.", effect: { titleBoost: 12, reputation: 6, fitness: -8 } },
    { label: "Administrar o desgaste da viagem", hint: "Título ↑ · físico preservado", result: "Você prioriza chegar inteiro para os compromissos do campeonato nacional.", effect: { titleBoost: 6, fitness: 5, leadership: 3 } },
  ]},
  { id: "mega-concacaf-final", icon: "CCC", tag: "CONCACAF", title: "A final que decide o representante continental", description: "Vencer aqui abre a porta para o Mundial de Clubes e para uma vitrine que poucos colegas da liga já tiveram.", needsContinental: "concacaf", minOvr: 74, choices: [
    { label: "Assumir o protagonismo", hint: "Título ↑↑ · pressão", result: "Você pede a bola nos momentos que decidem histórias continentais.", effect: { titleBoost: 18, reputation: 10, fitness: -8 } },
    { label: "Jogar pelo coletivo", hint: "Título ↑ · seguro", result: "Você confia no plano de jogo construído durante toda a campanha.", effect: { titleBoost: 10, leadership: 6 } },
  ]},
];
