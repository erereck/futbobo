import { playerStoryById } from "../player-stories";
import type { BotaoMatchResult } from "../botao/types";
import type { Club } from "../game-data";
import type { GameState, PendingBotaoMatch, PressAnswer, PressConference, PressQuestion, TransferOffer } from "./model";
import { pick, seeded } from "./shared";

type AnswerDraft = Omit<PressAnswer, "tone"> & { tone: PressAnswer["tone"] };

function ordered<T>(items: T[], state: GameState, salt: number) {
  return items
    .map((item, index) => ({ item, order: seeded(state.seed, salt + index * 47) }))
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item);
}

function visibleAnswers(state: GameState, salt: number, answers: AnswerDraft[]) {
  return ordered(answers, state, salt).slice(0, 3);
}

function question(
  state: GameState,
  id: string,
  salt: number,
  contexts: string[],
  prompts: string[],
  answers: AnswerDraft[],
): PressQuestion {
  return {
    id,
    context: pick(contexts, state.seed, salt + 3),
    question: pick(prompts, state.seed, salt + 7),
    answers: visibleAnswers(state, salt + 11, answers),
  };
}

const INDIVIDUAL_ANSWERS: AnswerDraft[] = [
  { label: "Foi uma noite que eu nunca vou esquecer", tone: "bold", toneLabel: "Assume o protagonismo", result: "A confiança vira manchete e a torcida abraça o protagonista.", effect: { morale: 7, fans: 5, followers: 45_000 } },
  { label: "Eu entrei em campo para decidir", tone: "bold", toneLabel: "Resposta forte", result: "A frase circula como declaração de estrela.", effect: { reputation: 6, followers: 58_000, morale: 3 } },
  { label: "O prêmio pertence ao time inteiro", tone: "team", toneLabel: "Valoriza o grupo", result: "O elenco recebe a fala como um gesto real.", effect: { leadership: 7, minutes: 4, fans: 3 } },
  { label: "Sem quem correu por mim, eu não estaria aqui", tone: "team", toneLabel: "Divide os méritos", result: "O vestiário percebe que o discurso combina com o campo.", effect: { leadership: 6, minutes: 3, mediaRelation: 3 } },
  { label: "Ainda consigo jogar muito melhor", tone: "calm", toneLabel: "Mantém os pés no chão", result: "A ambição aumenta o respeito e também a cobrança.", effect: { reputation: 5, morale: -2, mediaRelation: 2 } },
  { label: "Amanhã esse jogo já vira passado", tone: "calm", toneLabel: "Foco no próximo jogo", result: "A comissão gosta da recusa em viver de um único lance.", effect: { discipline: 4, minutes: 4, morale: 2 } },
];

const TEAM_ANSWERS: AnswerDraft[] = [
  { label: "A gente se encontrou dentro do jogo", tone: "team", toneLabel: "Exalta o coletivo", result: "A fala fortalece a sensação de unidade.", effect: { leadership: 6, morale: 4, minutes: 2 } },
  { label: "Todo mundo aceitou fazer o trabalho difícil", tone: "team", toneLabel: "Reconhece o esforço", result: "Os jogadores menos celebrados se sentem lembrados.", effect: { leadership: 7, fans: 2 } },
  { label: "Eu pedi a bola quando a partida apertou", tone: "bold", toneLabel: "Chama a responsabilidade", result: "A torcida gosta da coragem; o holofote cresce.", effect: { reputation: 6, followers: 42_000, morale: 3 } },
  { label: "Partida grande pede jogador sem medo", tone: "bold", toneLabel: "Aumenta a temperatura", result: "A declaração vira combustível para o próximo adversário.", effect: { reputation: 7, discipline: -2, fans: 4 } },
  { label: "O plano funcionou e eu fiz a minha parte", tone: "calm", toneLabel: "Resposta tática", result: "A comissão recebe o comentário como sinal de maturidade.", effect: { minutes: 5, mediaRelation: 4 } },
  { label: "Não existe atuação individual sem estrutura", tone: "calm", toneLabel: "Analisa o jogo", result: "A imprensa destaca sua leitura da partida.", effect: { mediaRelation: 5, leadership: 4 } },
];

const OPPONENT_ANSWERS: AnswerDraft[] = [
  { label: "Nós entendemos onde eles eram vulneráveis", tone: "calm", toneLabel: "Leitura tática", result: "A resposta agrada à comissão.", effect: { minutes: 6, leadership: 3, mediaRelation: 3 } },
  { label: "Eles mudaram o jogo e nós mudamos junto", tone: "calm", toneLabel: "Reconhece o duelo", result: "A análise soa segura sem diminuir o rival.", effect: { mediaRelation: 5, leadership: 3 } },
  { label: "Em decisão, personalidade pesa mais", tone: "bold", toneLabel: "Provoca o adversário", result: "A frase vira corte de vídeo e esquenta o reencontro.", effect: { reputation: 6, followers: 65_000, discipline: -2 } },
  { label: "Quando aceleramos, eles não acompanharam", tone: "bold", toneLabel: "Resposta provocadora", result: "A torcida adora; o adversário guarda a frase.", effect: { fans: 6, followers: 54_000, mediaRelation: -3 } },
  { label: "Respeito total; eles nos levaram ao limite", tone: "team", toneLabel: "Respeita o rival", result: "A fala baixa a temperatura depois da partida.", effect: { mediaRelation: 6, leadership: 4, fans: 2 } },
  { label: "O placar não conta o tamanho da dificuldade", tone: "team", toneLabel: "Evita soberba", result: "A resposta é tratada como postura de líder.", effect: { leadership: 5, discipline: 3 } },
];

const FUTURE_ANSWERS: AnswerDraft[] = [
  { label: "Nós vamos buscar tudo que estiver em jogo", tone: "bold", toneLabel: "Eleva a promessa", result: "A ambição aumenta a conexão com a arquibancada.", effect: { fans: 7, reputation: 5, morale: 2 } },
  { label: "Quero deixar meu nome gravado aqui", tone: "bold", toneLabel: "Fala como ídolo", result: "A torcida transforma a frase em faixa.", effect: { fans: 9, followers: 52_000, morale: 3 } },
  { label: "O calendário vai dizer quem nós somos", tone: "calm", toneLabel: "Evita promessas", result: "A comissão gosta do foco imediato.", effect: { fitness: 4, minutes: 4, discipline: 3 } },
  { label: "Ainda não conquistamos o direito de relaxar", tone: "calm", toneLabel: "Mantém a cobrança", result: "A frase preserva o nível de exigência.", effect: { minutes: 5, morale: -1, reputation: 2 } },
  { label: "Hoje é dia de agradecer quem veio com a gente", tone: "team", toneLabel: "Lembra da torcida", result: "A resposta divide o holofote e fortalece sua imagem.", effect: { leadership: 7, mediaRelation: 5, followers: 35_000 } },
  { label: "Nosso limite depende de todo o elenco", tone: "team", toneLabel: "Protege o elenco", result: "Reservas e titulares compram a mensagem.", effect: { leadership: 8, morale: 4 } },
];

const COMEBACK_ANSWERS: AnswerDraft[] = [
  { label: "Foi uma explosão. Naquele momento eu sabia que o jogo era nosso", tone: "bold", toneLabel: "Vive a virada", result: "A euforia vira a imagem da noite e aproxima ainda mais a torcida.", effect: { morale: 8, fans: 6, followers: 55_000 } },
  { label: "Eu queria mais. Virar não bastava; queria matar o jogo", tone: "bold", toneLabel: "Mantém a fome", result: "A resposta reforça a imagem de um jogador que cresce quando o jogo pega fogo.", effect: { reputation: 6, morale: 4, discipline: -1, followers: 38_000 } },
  { label: "Olhei pros meus companheiros e só senti orgulho", tone: "team", toneLabel: "Divide a emoção", result: "O vestiário se reconhece na fala e a virada ganha cara de conquista coletiva.", effect: { leadership: 8, morale: 5, fans: 3 } },
  { label: "Foi alívio, mas principalmente confiança no grupo", tone: "team", toneLabel: "Confia no time", result: "A resposta transforma o sufoco em prova de confiança no elenco.", effect: { leadership: 6, mediaRelation: 4, morale: 4 } },
  { label: "Por alguns segundos, nada. Eu só pensei no próximo lance", tone: "calm", toneLabel: "Segura a emoção", result: "A frieza depois da virada chama atenção da comissão e da imprensa.", effect: { discipline: 5, minutes: 4, reputation: 2 } },
  { label: "A melhor sensação foi perceber que ninguém desistiu quando a gente estava atrás", tone: "calm", toneLabel: "Valoriza a reação", result: "A fala coloca a resiliência do grupo acima do placar e soa como discurso de liderança.", effect: { leadership: 7, discipline: 3, mediaRelation: 3 } },
];

function wasComebackVictory(result: BotaoMatchResult) {
  if (!result.manOfTheMatch || result.outcome !== "win" || result.goalsFor <= result.goalsAgainst) return false;

  let userGoals = 0;
  let cpuGoals = 0;
  let trailed = false;
  for (const entry of result.timeline) {
    if (entry.kind !== "goal" && entry.kind !== "own-goal") continue;
    if (entry.side === "user") userGoals += 1;
    else cpuGoals += 1;
    if (userGoals < cpuGoals) trailed = true;
  }

  return trailed && userGoals === result.goalsFor && cpuGoals === result.goalsAgainst && userGoals > cpuGoals;
}

export function buildPressConference(state: GameState, match: PendingBotaoMatch, result: BotaoMatchResult, opponentName: string): PressConference {
  const wonTitle = result.champion && match.stageName === "Final";
  const story = playerStoryById(state.playerStoryId);
  const pool: PressQuestion[] = [
    question(state, "individual-night", match.season * 1999 + 11,
      [`${result.playerGoals} gol(s), ${result.playerAssists} assistência(s) e o prêmio de melhor em campo.`, "Seu nome foi anunciado no estádio antes mesmo de você chegar à zona mista.", "Os flashes acompanharam você desde o apito final."],
      ["Foi a melhor atuação da sua carreira até aqui?", "Em que momento você percebeu que a noite seria sua?", "O que esse prêmio diz sobre o jogador que você se tornou?"], INDIVIDUAL_ANSWERS),
    question(state, "collective", match.season * 2003 + 23,
      ["A transmissão destacou sua influência em todos os setores.", "O vestiário inteiro passou pela zona mista sorrindo.", "Seu desempenho individual cresceu junto com o time."],
      ["Quanto do seu prêmio pertence aos companheiros?", "Você decidiu o jogo ou o time colocou você nessa posição?", "Por que o coletivo funcionou tão bem hoje?"], TEAM_ANSWERS),
    question(state, "opposition", match.season * 2011 + 37,
      [`${opponentName} tentou tirar seu espaço até o último lance.`, `O ${opponentName} mudou a marcação várias vezes para tentar parar você.`, `A partida contra o ${opponentName} teve clima de decisão desde o começo.`],
      [`O que fez a diferença contra o ${opponentName}?`, `Por que o ${opponentName} não conseguiu controlar você?`, `Foi talento, plano de jogo ou personalidade?`], OPPONENT_ANSWERS),
    question(state, "decisive-moment", match.season * 2027 + 41,
      [result.playerGoals ? "Seu gol mudou o rumo da partida." : "Uma jogada sua mudou a temperatura da partida.", "O lance decisivo já circula em todos os programas esportivos.", "A partida parecia travada até você assumir o protagonismo."],
      ["O lance decisivo foi treinado ou nasceu na hora?", "O que passou pela sua cabeça antes da jogada?", "Jogadores grandes procuram esse tipo de momento?"], [...INDIVIDUAL_ANSWERS, ...TEAM_ANSWERS]),
    question(state, "pressure", match.season * 2039 + 53,
      ["A semana foi cercada por cobrança e pouco espaço para erro.", "A expectativa sobre você era maior do que em qualquer outro jogo do mês.", "O estádio parecia esperar uma resposta sua."],
      ["A pressão ajuda ou atrapalha você?", "Você joga melhor quando todos esperam algo?", "Como se carrega o peso de decidir?"], [...INDIVIDUAL_ANSWERS, ...FUTURE_ANSWERS]),
    question(state, "crowd", match.season * 2053 + 67,
      ["A arquibancada cantou seu nome depois do apito.", "Seu último toque foi acompanhado por um barulho ensurdecedor.", "Torcedores ficaram minutos no estádio esperando sua volta ao gramado."],
      ["O que você diria para quem cantou seu nome hoje?", "A torcida participou dessa atuação?", "É possível explicar a ligação que você sentiu com a arquibancada?"], [...TEAM_ANSWERS, ...FUTURE_ANSWERS]),
    question(state, "next-step", match.season * 2069 + 71,
      [wonTitle ? "A taça ainda está no gramado." : "A classificação já muda o tamanho da temporada.", "O calendário ainda guarda jogos maiores.", "A vitória colocou o clube diante de uma nova expectativa."],
      [wonTitle ? "Essa conquista muda seu lugar na história do clube?" : "Até onde esse time pode chegar agora?", "O que muda a partir de amanhã?", "Essa atuação aumenta a obrigação de conquistar títulos?"], FUTURE_ANSWERS),
    question(state, "origin", match.season * 2081 + 83,
      [`Sua origem como “${story.title}” voltou a ser lembrada durante a transmissão.`, "A reportagem antes do jogo recuperou imagens do começo da sua carreira.", "A caminhada até esta noite virou parte da narrativa da transmissão."],
      ["Quanto da sua história ainda entra em campo com você?", "Você ainda reconhece o garoto do começo da carreira?", "Essa noite conversa com tudo que você viveu antes?"], [...INDIVIDUAL_ANSWERS, ...FUTURE_ANSWERS]),
    question(state, "consistency", match.season * 2099 + 97,
      ["A discussão agora é se essa atuação pode virar rotina.", "Os comentaristas deixaram de falar em surpresa e começaram a falar em padrão.", "O prêmio de hoje aumenta a régua para o próximo jogo."],
      ["Como transformar uma grande noite em constância?", "O difícil é chegar nesse nível ou permanecer nele?", "A partir de agora essa atuação vira sua obrigação?"], [...INDIVIDUAL_ANSWERS, ...FUTURE_ANSWERS]),
  ];
  const questionCount = 1 + Math.floor(seeded(state.seed, match.season * 2111 + match.id.length) * 3);
  const questions = ordered(pool, state, match.season * 2131 + match.id.length).slice(0, questionCount);
  if (wasComebackVictory(result)) {
    questions.push(question(state, "comeback-feeling", match.season * 2141 + match.id.length,
      [
        `O ${opponentName} esteve à frente, mas o apito final encontrou seu time vencendo por ${result.goalsFor} a ${result.goalsAgainst}.`,
        "Seu time chegou a estar atrás no placar e terminou a noite comemorando uma virada.",
        "A imagem da partida mudou completamente entre o momento em que vocês perdiam e o apito final.",
      ],
      [
        "Quando a virada se confirmou, o que você sentiu de verdade?",
        "Como você descreve a sensação de sair de uma derrota para uma vitória dessas?",
        "O que passou pela sua cabeça no instante em que vocês tomaram a frente?",
      ], COMEBACK_ANSWERS));
  }
  return {
    kind: "post-match",
    matchId: match.id,
    competitionName: match.competitionName,
    opponentName,
    questionIndex: 0,
    questions,
  };
}

const PRESENTATION_ANSWERS: AnswerDraft[] = [
  { label: "Vim para disputar tudo desde o primeiro dia", tone: "bold", toneLabel: "Chega com ambição", result: "A frase domina a apresentação e aumenta a expectativa.", effect: { reputation: 5, fans: 5, morale: 3 } },
  { label: "Quero construir uma história que fique", tone: "bold", toneLabel: "Fala como futuro ídolo", result: "A torcida transforma expectativa em compromisso.", effect: { fans: 7, followers: 70_000, morale: 2 } },
  { label: "Meu futebol vai responder melhor que qualquer promessa", tone: "calm", toneLabel: "Evita prometer", result: "A resposta segura reduz o ruído em volta da estreia.", effect: { mediaRelation: 5, minutes: 3, discipline: 2 } },
  { label: "Primeiro quero entender o clube e meus companheiros", tone: "calm", toneLabel: "Prioriza adaptação", result: "A comissão gosta da disposição para aprender.", effect: { adaptation: 7, minutes: 4, leadership: 2 } },
  { label: "Chego para ajudar o grupo onde for necessário", tone: "team", toneLabel: "Valoriza o elenco", result: "O vestiário recebe a estrela sem sensação de ameaça.", effect: { leadership: 6, morale: 3, minutes: 3 } },
  { label: "Se o time crescer comigo, os números virão", tone: "team", toneLabel: "Coloca o time primeiro", result: "A imprensa destaca a maturidade da primeira fala.", effect: { leadership: 5, mediaRelation: 5, fans: 3 } },
  { label: "Eu escolhi este projeto porque ele ainda pode crescer", tone: "bold", toneLabel: "Compra o projeto", result: "A diretoria adota a frase como lema da temporada.", effect: { fans: 5, minutes: 5, reputation: 3 } },
  { label: "Não vim repetir o passado; vim começar outra coisa", tone: "calm", toneLabel: "Abre um novo capítulo", result: "A resposta fecha comparações e protege o recomeço.", effect: { lifeBalance: 5, morale: 5, mediaRelation: 2 } },
];

export function buildTransferPresentation(state: GameState, source: Club, destination: Club, offer: TransferOffer): PressConference {
  const questions = [
    { context: `O ${destination.shortName} apresenta você diante de uma sala lotada.`, prompt: `O que fez você escolher o ${destination.shortName}?` },
    { context: `A nova camisa já está sobre a mesa, com seu número nas costas.`, prompt: "Que marca você quer deixar neste novo capítulo?" },
    { context: `A expectativa cresceu assim que sua chegada foi confirmada.`, prompt: "O que a torcida pode esperar de você desde a estreia?" },
    { context: `${source.shortName} ficou para trás e a primeira pergunta olha para a frente.`, prompt: "Você chega para ser protagonista ou para conquistar espaço?" },
    { context: `O clube trata sua contratação como uma peça central do projeto.`, prompt: "Por que este é o momento certo para essa mudança?" },
    { context: `Seu novo papel no elenco será ${offer.role}.`, prompt: "Como você pretende transformar expectativa em resultado?" },
  ];
  const selected = pick(questions, state.seed, state.season * 2179 + destination.id.length);
  return {
    kind: "presentation",
    matchId: `presentation-${state.season}-${destination.id}`,
    competitionName: "Apresentação oficial",
    opponentName: destination.shortName,
    questionIndex: 0,
    questions: [{
      id: `presentation-${destination.id}`,
      context: selected.context,
      question: selected.prompt,
      answers: visibleAnswers(state, state.season * 2203 + destination.id.length, PRESENTATION_ANSWERS),
    }],
  };
}

const FORMER_SILENCE = [
  { label: "Prefiro não falar sobre meu ex-clube hoje", result: "Você encerra o assunto sem alimentar a rivalidade." },
  { label: "Meu respeito por eles inclui saber a hora de ficar em silêncio", result: "A recusa é interpretada como um limite consciente." },
  { label: "Essa pergunta fica para outro dia", result: "A zona mista não consegue arrancar uma manchete sobre o passado." },
];
const FORMER_RESPECT = [
  { label: "Tenho gratidão por tudo que vivi lá", result: "A antiga torcida reconhece o respeito mesmo do outro lado." },
  { label: "Eles fazem parte da minha história e isso não muda", result: "A resposta preserva pontes com o antigo clube." },
  { label: "Foi um adversário difícil e sempre será uma casa importante", result: "A maturidade esfria a rivalidade depois do jogo." },
];
const FORMER_FIRE = [
  { label: "Hoje eles viram por que não deveriam ter me deixado sair", result: "A declaração explode nas redes e rompe o pouco de paz restante." },
  { label: "O passado ficou pequeno para o jogador que eu sou agora", result: "A antiga torcida transforma seu nome em alvo." },
  { label: "Conheço aquele clube e sabia exatamente onde machucar", result: "A provocação vira a principal manchete do reencontro." },
];

function formerAnswers(state: GameState, salt: number): PressAnswer[] {
  const silent = pick(FORMER_SILENCE, state.seed, salt + 1);
  const respect = pick(FORMER_RESPECT, state.seed, salt + 2);
  const fire = pick(FORMER_FIRE, state.seed, salt + 3);
  return [
    { ...silent, tone: "calm", toneLabel: "Não comenta", effect: { lifeBalance: 5, mediaRelation: -1, morale: 2 } },
    { ...respect, tone: "team", toneLabel: "Fala com respeito", effect: { mediaRelation: 6, leadership: 4, fans: 2 } },
    { ...fire, tone: "bold", toneLabel: "Ataca o ex-clube", effect: { reputation: 7, followers: 90_000, discipline: -5, mediaRelation: -4 } },
  ];
}

export function buildFormerClubConference(state: GameState, match: PendingBotaoMatch, result: BotaoMatchResult, formerClub: Club): PressConference {
  const won = result.outcome === "win";
  const scored = result.playerGoals > 0;
  const resultLine = won ? "Seu time venceu o reencontro." : result.outcome === "loss" ? "O reencontro terminou em derrota." : "O reencontro terminou sem vencedor.";
  const candidates = [
    { id: "former-result", context: `${resultLine} A primeira pergunta ignora todo o resto da partida.`, prompts: won ? ["Vencer seu ex-clube teve um sabor diferente?", "Essa vitória encerra alguma conta com o passado?"] : ["Enfrentar seu ex-clube tornou o resultado mais pesado?", "O passado entrou em campo junto com você?"] },
    { id: "former-memory", context: `Você conhece corredores, funcionários e parte da torcida do ${formerClub.shortName}.`, prompts: ["O que passou pela sua cabeça ao reencontrar tanta gente?", "Ainda existe carinho pelo clube que ficou para trás?"] },
    { id: "former-choice", context: "Sua troca de camisa ainda é discutida pelas duas torcidas.", prompts: ["Você faria a mesma escolha novamente?", "O reencontro confirmou que sair foi a decisão certa?"] },
    ...(scored ? [{ id: "former-goal", context: `Você marcou ${result.playerGoals > 1 ? `${result.playerGoals} vezes` : "contra o ex-clube"}. A chamada lei do ex virou assunto imediato.`, prompts: ["Por que a lei do ex parece funcionar tanto?", "Você pensou em comemorar contra o antigo clube?", "Esse gol foi mais pessoal do que os outros?"] }] : []),
    { id: "former-future", context: `O próximo reencontro com o ${formerClub.shortName} já começou a ser esperado.`, prompts: ["A partir de agora isso virou uma rivalidade pessoal?", "O que você espera da reação no próximo jogo?"] },
  ];
  const count = 1 + Math.floor(seeded(state.seed, match.season * 2221 + match.id.length) * 3);
  const questions = ordered(candidates, state, match.season * 2237 + match.id.length).slice(0, count).map((entry, index) => ({
    id: entry.id,
    context: entry.context,
    question: pick(entry.prompts, state.seed, match.season * 2251 + index * 19),
    answers: formerAnswers(state, match.season * 2267 + index * 23),
  }));
  return {
    kind: "former-club",
    matchId: match.id,
    competitionName: `Reencontro com o ${formerClub.shortName}`,
    opponentName: formerClub.shortName,
    questionIndex: 0,
    questions,
  };
}


const BETRAYAL_CALM: AnswerDraft[] = [
  { label: "Eu respeito minha história, mas minha carreira continua", tone: "calm", toneLabel: "Não alimenta a guerra", result: "A resposta não apaga a revolta, mas evita transformar a coletiva em provocação.", effect: { mediaRelation: 6, lifeBalance: 4, morale: 2 } },
  { label: "Não escolhi contra ninguém; escolhi o próximo passo", tone: "calm", toneLabel: "Separa carreira e rivalidade", result: "Parte da imprensa aceita a explicação. A antiga arquibancada, nem tanto.", effect: { mediaRelation: 5, discipline: 3 } },
];
const BETRAYAL_BOLD: AnswerDraft[] = [
  { label: "Se eles me odeiam agora, é porque essa camisa pesa", tone: "bold", toneLabel: "Incendeia o clássico", result: "A frase vira corte de vídeo em minutos. Sua nova torcida compra a provocação inteira.", effect: { reputation: 8, followers: 420_000, fans: 9, mediaRelation: -6, discipline: -5 } },
  { label: "Eu vim para o lado em que acredito que posso ganhar", tone: "bold", toneLabel: "Escolhe um lado", result: "Não sobra espaço para neutralidade. A rivalidade agora também tem seu rosto.", effect: { reputation: 7, followers: 330_000, fans: 8, morale: 4, mediaRelation: -4 } },
];
const BETRAYAL_TEAM: AnswerDraft[] = [
  { label: "Meu compromisso agora é com este vestiário", tone: "team", toneLabel: "Fecha com o novo elenco", result: "Os novos companheiros gostam de ouvir uma resposta sem meia-palavra.", effect: { leadership: 7, morale: 5, fans: 5 } },
  { label: "Vou conquistar respeito aqui jogando, não falando", tone: "team", toneLabel: "Olha para dentro", result: "A coletiva perde temperatura, mas a nova torcida cobra que a frase vire futebol.", effect: { leadership: 6, discipline: 4, mediaRelation: 2 } },
];

export function buildBetrayalConference(state: GameState, source: Club, destination: Club, rivalryName: string): PressConference {
  const answers = [...BETRAYAL_CALM, ...BETRAYAL_BOLD, ...BETRAYAL_TEAM];
  return {
    kind: "betrayal",
    matchId: `betrayal-${state.season}-${source.id}-${destination.id}`,
    competitionName: rivalryName,
    opponentName: `${source.shortName} → ${destination.shortName}`,
    questionIndex: 0,
    questions: [
      question(state, "betrayal-first", state.season * 3001 + source.id.length,
        [`A notícia atravessou a cidade antes mesmo da apresentação. Torcedores do ${source.shortName} chamam a transferência de traição.`],
        [`Você entende quem diz que trocar o ${source.shortName} pelo ${destination.shortName} é uma traição?`], answers),
      question(state, "betrayal-choice", state.season * 3011 + destination.id.length,
        [`O ${rivalryName} agora tem uma camada pessoal. Sua antiga camisa já apareceu rasgada nas redes.`],
        ["Você faria exatamente a mesma escolha se pudesse voltar algumas horas?"], answers),
      question(state, "betrayal-derby", state.season * 3023 + source.id.length + destination.id.length,
        [`O primeiro clássico já está sendo tratado como o jogo mais esperado da sua temporada.`],
        [`O que vai passar pela sua cabeça quando você entrar em campo contra o ${source.shortName}?`], answers),
    ],
  };
}
