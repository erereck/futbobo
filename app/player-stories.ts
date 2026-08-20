export type PlayerStoryId =
  | "open-book"
  | "academy-destroyer"
  | "humble-roots"
  | "football-bloodline"
  | "disillusioned"
  | "street-football"
  | "late-bloomer"
  | "academy-reject"
  | "migrant-dream"
  | "student-athlete"
  | "neighborhood-idol";

export type PlayerStoryPreset = {
  id: PlayerStoryId;
  icon: string;
  title: string;
  tagline: string;
  description: string;
  promise: string;
  tone: "gold" | "green" | "blue" | "violet" | "red";
  modifiers: {
    overall?: number;
    potential?: number;
    morale?: number;
    fitness?: number;
    reputation?: number;
    leadership?: number;
    discipline?: number;
    fanSupport?: number;
    managerTrust?: number;
    followers?: number;
    mediaRelation?: number;
    lifeBalance?: number;
    charityReputation?: number;
    adaptation?: number;
    money?: number;
  };
};

export const PLAYER_STORIES: PlayerStoryPreset[] = [
  {
    id: "open-book",
    icon: "○",
    title: "Sem história definida",
    tagline: "Sem eventos de história. Só futebol.",
    description: "Modo direto para quem quer jogar a carreira sem capítulos de origem ou eventos exclusivos de história.",
    promise: "Nenhum evento de história pós-temporada; o foco fica no futebol e nos sistemas gerais da carreira.",
    tone: "blue",
    modifiers: {},
  },
  {
    id: "academy-destroyer",
    icon: "✦",
    title: "Destruidor desde a base",
    tagline: "Todo mundo já ouviu falar de você.",
    description: "Vídeos dos seus gols circulam antes da estreia. Você começa na frente, mas cada partida comum parece uma decepção para quem esperava um fenômeno.",
    promise: "Arranque mais forte, pressão precoce e decisões sobre fama, empresários e recordes.",
    tone: "gold",
    modifiers: { overall: 3, potential: 2, reputation: 7, fanSupport: 5, morale: -3, mediaRelation: -2, followers: 18_000 },
  },
  {
    id: "humble-roots",
    icon: "⌂",
    title: "De família modesta",
    tagline: "Cada contrato muda mais de uma vida.",
    description: "O futebol é sonho e responsabilidade. A família acompanha cada passo, e dinheiro, lealdade e distância nunca serão escolhas abstratas.",
    promise: "Laços familiares, decisões financeiras difíceis e apoio enorme nos momentos ruins.",
    tone: "green",
    modifiers: { morale: 7, leadership: 4, discipline: 5, fanSupport: 4, money: -2 },
  },
  {
    id: "football-bloodline",
    icon: "♜",
    title: "Filho de um ex-jogador",
    tagline: "Seu sobrenome entra em campo primeiro.",
    description: "Seu pai teve uma carreira respeitada e conhece portas que poucos conhecem. As comparações ajudam até o dia em que passam a sufocar.",
    promise: "Clube do seu pai, contatos, comparações públicas e a chance de superar a herança.",
    tone: "blue",
    modifiers: { reputation: 8, leadership: 3, mediaRelation: 6, morale: -4, followers: 24_000 },
  },
  {
    id: "disillusioned",
    icon: "◐",
    title: "Jogador desiludido",
    tagline: "Você quase largou tudo aos 12.",
    description: "O futebol deixou de ser divertido cedo demais. Você ainda tem talento, mas precisa reencontrar um motivo para continuar quando ninguém está olhando.",
    promise: "Crises de propósito, recomeços, mentores e picos raros quando a paixão volta.",
    tone: "violet",
    modifiers: { potential: 3, morale: -12, lifeBalance: -7, reputation: -2 },
  },
  {
    id: "street-football",
    icon: "◇",
    title: "Criado no futebol de rua",
    tagline: "Antes da tática, veio o improviso.",
    description: "Quadra, asfalto e gol de chinelo moldaram um jogador imprevisível. A comissão ama sua coragem e perde a cabeça com seus riscos.",
    promise: "Jogadas ousadas, rivalidade com técnicos conservadores e decisões que premiam criatividade.",
    tone: "red",
    modifiers: { overall: 1, potential: 1, morale: 5, fanSupport: 7, discipline: -8, managerTrust: 0 },
  },
  {
    id: "late-bloomer",
    icon: "↗",
    title: "Talento tardio",
    tagline: "Aos 12, ninguém apostava em você.",
    description: "Você não é o melhor da turma e talvez nem seja revelado cedo. Em troca, carrega uma margem de evolução que os observadores ainda não conseguem enxergar.",
    promise: "Começo mais lento, rejeições e explosões de desenvolvimento depois que a carreira parece definida.",
    tone: "green",
    modifiers: { overall: -3, potential: 5, morale: 3, discipline: 4 },
  },
  {
    id: "academy-reject",
    icon: "×",
    title: "Dispensado pelo primeiro clube",
    tagline: "Um relatório disse que você não servia.",
    description: "A rejeição ficou guardada. O clube que fechou a porta continua existindo, e o calendário pode transformar uma memória em acerto de contas.",
    promise: "Clube algoz persistente, jogos de vingança, reencontros e a escolha entre perdoar ou alimentar a ferida.",
    tone: "red",
    modifiers: { potential: 2, morale: -3, discipline: 2, fanSupport: 3 },
  },
  {
    id: "migrant-dream",
    icon: "◎",
    title: "Sonho longe de casa",
    tagline: "Sua carreira começou com uma despedida.",
    description: "A família cruzou fronteiras para que você tivesse uma chance. Você aprende rápido a viver entre países, sotaques e a pergunta sobre onde realmente é casa.",
    promise: "Adaptação internacional, identidade, convites de seleção e decisões sobre raízes.",
    tone: "blue",
    modifiers: { adaptation: 14, leadership: 3, lifeBalance: -5, mediaRelation: 2 },
  },
  {
    id: "student-athlete",
    icon: "▤",
    title: "A promessa que estudava",
    tagline: "Havia um plano além do futebol.",
    description: "Você nunca abandonou os livros. Alguns treinadores chamam isso de distração; outros percebem um jogador que lê o campo e o mundo de forma diferente.",
    promise: "Decisões de carreira dupla, imprensa, visão tática e uma rede de segurança fora do esporte.",
    tone: "violet",
    modifiers: { leadership: 6, discipline: 7, mediaRelation: 7, lifeBalance: 4, overall: -1 },
  },
  {
    id: "neighborhood-idol",
    icon: "★",
    title: "Orgulho do bairro",
    tagline: "Muita gente sente que joga com você.",
    description: "Seu primeiro uniforme foi comprado numa vaquinha. Cada vitória volta para a rua onde tudo começou, junto com pedidos, projetos e cobranças.",
    promise: "Torcida mais próxima, projetos sociais, pressão comunitária e um legado que não cabe em troféus.",
    tone: "gold",
    modifiers: { fanSupport: 10, followers: 12_000, charityReputation: 4, morale: 4, lifeBalance: -3 },
  },
];

export function playerStoryById(id: string) {
  return PLAYER_STORIES.find((story) => story.id === id) ?? PLAYER_STORIES[0];
}
