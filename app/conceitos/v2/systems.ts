/* Six independent interaction models. None uses the first round's event/choice list. */
export const limit = (n: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, n));
const roll = (seed: number) => {
  const n = Math.sin(seed * 91.17 + 7.31) * 43758.5453;
  return n - Math.floor(n);
};

// 01 / Football is a readable situation, not a reaction test.
export type PitchTarget = "nico" | "caio" | "davi" | "goal";
export const PITCH_PEOPLE = {
  caio: {
    x: 37,
    y: 62,
    name: "Caio",
    number: 10,
    line: "Você · entre as linhas",
  },
  nico: {
    x: 65,
    y: 28,
    name: "Nico",
    number: 7,
    line: "Ponta livre · tabela curta",
  },
  davi: {
    x: 75,
    y: 72,
    name: "Davi",
    number: 9,
    line: "Atacante · marcado de perto",
  },
};
export type PitchState = {
  match: number;
  holder: Exclude<PitchTarget, "goal">;
  touches: number;
  clock: number;
  score: number;
  trust: number;
  chain: string[];
  result: "goal" | "save" | "lost" | null;
  text: string;
};
export function newPitch(): PitchState {
  return {
    match: 1,
    holder: "caio",
    touches: 3,
    clock: 87,
    score: 1,
    trust: 61,
    chain: [],
    result: null,
    text: "O lateral saiu da linha. Nico está livre. Você tem três toques antes do apito.",
  };
}
export function pitchChance(s: PitchState, target: PitchTarget) {
  if (target === "goal")
    return s.holder === "nico" ? 76 : s.holder === "davi" ? 63 : 32;
  if (target === s.holder) return 0;
  return target === "nico" ? 94 : target === "caio" ? 90 : 68;
}
export function playPitch(s: PitchState, target: PitchTarget): PitchState {
  if (
    s.result ||
    !s.touches ||
    target === s.holder ||
    !["nico", "caio", "davi", "goal"].includes(target)
  )
    return s;
  const chance = pitchChance(s, target);
  const success =
    roll(
      s.match * 13 +
        s.chain.length * 7 +
        (target === "goal" ? 2 : target === "nico" ? 3 : 4),
    ) *
      100 <
    chance;
  const next = {
    ...s,
    touches: s.touches - 1,
    clock: Math.min(90, s.clock + 1),
    chain: [...s.chain, target],
  };
  if (target === "goal")
    return {
      ...next,
      score: s.score + (success ? 1 : 0),
      trust: limit(s.trust + (success ? 9 : s.chain.length ? 3 : -3)),
      result: success ? "goal" : "save",
      text: success
        ? s.holder === "caio"
          ? "Você chamou a responsabilidade. A rede balançou e o Maracanã veio abaixo."
          : `Você encontrou ${PITCH_PEOPLE[s.holder].name}. O espaço virou gol. O treinador anotou a sua leitura do lance.`
        : "O goleiro ficou com ela. O técnico valorizou a construção, mas o empate continua no placar.",
    };
  if (!success)
    return {
      ...next,
      result: "lost",
      trust: limit(s.trust - 3),
      text: "A marcação antecipou o passe. O lance terminou antes do chute. Havia uma linha mais segura pelo outro lado.",
    };
  if (next.touches === 0)
    return {
      ...next,
      holder: target,
      result: "lost",
      text: "O apito chegou antes da finalização. Construir a jogada também exige saber a hora de terminar.",
    };
  return {
    ...next,
    holder: target,
    text:
      target === "nico"
        ? "Nico recebeu nas costas do lateral. O gol abriu. Agora há uma finalização muito melhor."
        : target === "davi"
          ? "Davi segurou o zagueiro. Ele pode bater ou devolver para você."
          : "A tabela funcionou. Você voltou para a jogada, mas o relógio está correndo.",
  };
}
export function nextPitch(s: PitchState): PitchState {
  return { ...newPitch(), match: s.match + 1, trust: s.trust };
}

// 02 / A route is also the set of opportunities you give up.
export type RouteNode = {
  id: string;
  col: number;
  row: number;
  title: string;
  place: string;
  kind: "start" | "train" | "club" | "rest" | "final";
  club?: string;
  edges: string[];
  energy: number;
  trust: number;
  requires?: number;
  note: string;
};
export const ROUTE_NODES: RouteNode[] = [
  {
    id: "base",
    col: 1,
    row: 0,
    title: "A primeira camisa",
    place: "RIO DE JANEIRO",
    kind: "start",
    club: "flamengo",
    edges: ["disputa", "recife"],
    energy: 0,
    trust: 0,
    note: "A base ficou para trás. A sua carreira começa aqui.",
  },
  {
    id: "disputa",
    col: 0,
    row: 1,
    title: "Disputar espaço",
    place: "NINHO DO URUBU",
    kind: "train",
    edges: ["classico", "recuperar"],
    energy: -2,
    trust: 2,
    note: "Ficar perto do elenco principal cobra fôlego. A chance de ser visto aumenta.",
  },
  {
    id: "recife",
    col: 2,
    row: 1,
    title: "Minutos no Sport",
    place: "RECIFE · EMPRÉSTIMO",
    kind: "club",
    club: "sport",
    edges: ["sequencia", "recuperar"],
    energy: -1,
    trust: 1,
    note: "Um novo vestiário. Menos vitrine, mais tempo com a bola.",
  },
  {
    id: "classico",
    col: 0,
    row: 2,
    title: "A lista do clássico",
    place: "UMA CHANCE GRANDE",
    kind: "train",
    edges: ["titular", "voltar"],
    energy: -2,
    trust: 2,
    requires: 2,
    note: "O técnico abre uma vaga. Você chega com confiança, mas cansado.",
  },
  {
    id: "recuperar",
    col: 1,
    row: 2,
    title: "Cuidar da perna",
    place: "DEPARTAMENTO MÉDICO",
    kind: "rest",
    edges: ["titular", "voltar"],
    energy: 3,
    trust: 0,
    note: "Uma pausa agora preserva a próxima chance. Outras vitrines vão fechar.",
  },
  {
    id: "sequencia",
    col: 2,
    row: 2,
    title: "Ganhar sequência",
    place: "ILHA DO RETIRO",
    kind: "train",
    edges: ["voltar", "renovar"],
    energy: -2,
    trust: 2,
    note: "Jogar toda semana acelera sua evolução e desgasta o corpo.",
  },
  {
    id: "titular",
    col: 0,
    row: 3,
    title: "Ganhar a camisa",
    place: "FLAMENGO · TITULAR",
    kind: "final",
    club: "flamengo",
    edges: [],
    energy: -1,
    trust: 1,
    requires: 4,
    note: "Você conquistou um espaço difícil. A carreira que parecia travada ganhou outro tamanho.",
  },
  {
    id: "voltar",
    col: 1,
    row: 3,
    title: "Voltar por cima",
    place: "RIO · NOVA TEMPORADA",
    kind: "final",
    club: "flamengo",
    edges: [],
    energy: 0,
    trust: 1,
    note: "A volta tem um jogador mais pronto. Nem todo caminho precisa ser uma linha reta.",
  },
  {
    id: "renovar",
    col: 2,
    row: 3,
    title: "Virar referência",
    place: "SPORT · PROTAGONISTA",
    kind: "final",
    club: "sport",
    edges: [],
    energy: 0,
    trust: 1,
    note: "O empréstimo virou casa. O clube quer construir o ataque ao seu redor.",
  },
];
export type RouteState = {
  at: string;
  visited: string[];
  energy: number;
  trust: number;
  club: string;
  done: boolean;
};
export function newRoute(): RouteState {
  return {
    at: "base",
    visited: ["base"],
    energy: 5,
    trust: 2,
    club: "flamengo",
    done: false,
  };
}
export function routeReason(s: RouteState, id: string) {
  const node = ROUTE_NODES.find((n) => n.id === id);
  if (
    !node ||
    s.done ||
    !ROUTE_NODES.find((n) => n.id === s.at)?.edges.includes(id)
  )
    return "Fora do seu caminho atual";
  if (s.energy + node.energy < 0)
    return "Falta fôlego para sustentar esse caminho";
  if (s.trust < (node.requires ?? 0))
    return `Exige ${node.requires} de confiança`;
  return "";
}
export function travel(s: RouteState, id: string): RouteState {
  if (routeReason(s, id)) return s;
  const node = ROUTE_NODES.find((n) => n.id === id)!;
  return {
    at: id,
    visited: [...s.visited, id],
    energy: limit(s.energy + node.energy, 0, 6),
    trust: limit(s.trust + node.trust, 0, 8),
    club: node.club ?? s.club,
    done: node.kind === "final",
  };
}

// 03 / More money, more minutes and less commitment cannot all be free.
export const CONTRACT_CLUBS = [
  {
    id: "sport",
    name: "Sport",
    city: "Recife, Brasil",
    base: 24,
    cap: 8,
    role: "titular",
    phrase: "Eles precisam de alguém para jogar agora. Dinheiro não sobra.",
  },
  {
    id: "flamengo",
    name: "Flamengo",
    city: "Rio de Janeiro, Brasil",
    base: 36,
    cap: 6,
    role: "rotação",
    phrase:
      "Você conhece o clube. Uma promessa de titularidade pesa muito na negociação.",
  },
  {
    id: "santos",
    name: "Santos",
    city: "Santos, Brasil",
    base: 30,
    cap: 7,
    role: "rotação",
    phrase:
      "Querem construir um projeto longo. Três anos tornam a conversa mais fácil.",
  },
] as const;
export type Terms = {
  salary: number;
  years: number;
  starter: boolean;
  release: boolean;
};
export type ContractState = {
  club: number;
  terms: Terms;
  rounds: number;
  status: "open" | "counter" | "signed" | "closed";
  reply: string;
  signed: Terms | null;
};
export function newContract(club = 0): ContractState {
  const c = CONTRACT_CLUBS[club];
  return {
    club,
    terms: {
      salary: c.base,
      years: 2,
      starter: c.role === "titular",
      release: false,
    },
    rounds: 0,
    status: "open",
    reply:
      "O empresário deixou o documento com você. Altere os termos antes de devolver.",
    signed: null,
  };
}
export function contractWeight(s: ContractState) {
  const c = CONTRACT_CLUBS[s.club];
  return (
    (s.terms.salary - c.base) / 3 +
    (s.terms.starter ? (c.role === "titular" ? 1 : 6) : 0) +
    (s.terms.release ? 3 : 0) +
    (3 - s.terms.years) * 2
  );
}
export function changeTerms(
  s: ContractState,
  patch: Partial<Terms>,
): ContractState {
  if (s.status === "signed" || s.status === "closed") return s;
  return {
    ...s,
    status: "open",
    terms: {
      salary: limit(Math.round(patch.salary ?? s.terms.salary), 18, 54),
      years: limit(Math.round(patch.years ?? s.terms.years), 1, 3),
      starter: patch.starter ?? s.terms.starter,
      release: patch.release ?? s.terms.release,
    },
  };
}
export function negotiate(s: ContractState): ContractState {
  if (s.status === "signed" || s.status === "closed") return s;
  const c = CONTRACT_CLUBS[s.club];
  if (contractWeight(s) <= c.cap)
    return {
      ...s,
      status: "signed",
      rounds: s.rounds + 1,
      signed: { ...s.terms },
      reply: `Fechado. ${c.name} aceita R$ ${s.terms.salary} mil por mês, ${s.terms.years} ano${s.terms.years > 1 ? "s" : ""} e ${s.terms.starter ? "uma vaga de titular" : "participação na rotação"}.`,
    };
  if (s.rounds >= 2)
    return {
      ...s,
      status: "closed",
      reply:
        "O clube retirou a proposta. A terceira tentativa continuou acima do que eles podiam oferecer. Outro projeto pode valorizar melhor as suas prioridades.",
    };
  const lowered = Math.max(18, s.terms.salary - 6);
  return {
    ...s,
    rounds: s.rounds + 1,
    status: "counter",
    terms: { ...s.terms, salary: lowered, years: 3 },
    reply: `O clube fez uma contraproposta: R$ ${lowered} mil e três anos de vínculo. Você preserva ${s.terms.starter ? "o pedido de minutos" : "o papel na rotação"}, mas pode reabrir os termos.`,
  };
}

// 04 / The information you hear changes the promise you can responsibly make.
export type DialogueTopic = "chance" | "rotacao" | "saida";
export type DialogueState = {
  heard: string[];
  topic: DialogueTopic;
  tone: number;
  scene: number;
  trust: number;
  promise: string;
  reply: string;
  done: boolean;
  outcome: string;
};
export function newDialogue(): DialogueState {
  return {
    heard: [],
    topic: "chance",
    tone: 1,
    scene: 0,
    trust: 54,
    promise: "",
    reply:
      "Você ficou fora da lista. O professor quer conversar antes do treino.",
    done: false,
    outcome: "",
  };
}
export function listen(s: DialogueState, who: string): DialogueState {
  if (s.scene || s.heard.includes(who) || !["coach", "captain"].includes(who))
    return s;
  return {
    ...s,
    heard: [...s.heard, who],
    reply:
      who === "coach"
        ? "Professor: ‘O médico me pediu cautela com a sua perna. Não foi falta de confiança. Quero você inteiro para a sequência.’"
        : "Capitão: ‘O professor segura quem ele quer proteger. Mas precisa ouvir de você qual é o plano. Fala com ele sem plateia.’",
  };
}
export function dialoguePhrase(s: DialogueState) {
  const starts = [
    "Professor, entendo seu lado.",
    "Professor, vamos ser diretos.",
    "Professor, desse jeito fica difícil.",
  ];
  const ends = {
    chance: "Quero a chance e vou provar no treino que estou pronto.",
    rotacao: "Vou respeitar a recuperação. Pode contar comigo na rotação.",
    saida: "Quero minutos. Vamos planejar um empréstimo juntos.",
  };
  return `${starts[s.tone]} ${ends[s.topic]}`;
}
export function speak(s: DialogueState): DialogueState {
  if (s.scene || s.done) return s;
  const informed = s.heard.includes("coach");
  const delta =
    s.tone === 2
      ? -9
      : s.topic === "rotacao" && informed
        ? 13
        : s.topic === "chance" && !informed
          ? -3
          : 6;
  const promise =
    s.topic === "chance"
      ? "Provar no treino sem esconder a dor"
      : s.topic === "rotacao"
        ? "Respeitar a recuperação"
        : "Conversar antes de falar com outros clubes";
  return {
    ...s,
    trust: limit(s.trust + delta),
    scene: 1,
    promise,
    reply:
      s.tone === 2
        ? "Professor: ‘Eu vou te ouvir. Mas não confunda cobrar uma chance com desrespeitar o grupo. Sua postura também entra na avaliação.’"
        : s.topic === "rotacao" && informed
          ? "Professor: ‘Agora estamos falando a mesma língua. Recupera essa perna. Seu nome está nos meus planos.’"
          : s.topic === "saida"
            ? "Professor: ‘Posso abrir essa porta. Só não quero descobrir por uma notícia. A gente faz isso junto.’"
            : "Professor: ‘Então temos um combinado. Não me esconda o que está sentindo. Confiança é dos dois lados.’",
  };
}
export function keepPromise(s: DialogueState, keep: boolean): DialogueState {
  if (s.scene !== 1 || s.done) return s;
  return {
    ...s,
    scene: 2,
    done: true,
    trust: limit(s.trust + (keep ? 10 : -16)),
    outcome: keep
      ? s.topic === "saida"
        ? "Empréstimo ao Sport com aval do treinador."
        : s.topic === "rotacao"
          ? "Recuperação concluída; volta ao elenco sem limitação."
          : "Vinte e cinco minutos na próxima partida, sem esconder a dor."
      : s.topic === "saida"
        ? "O clube travou a saída depois de saber do acordo por terceiros."
        : "Retorno adiado: o treino escondido agravou o problema físico.",
    reply: keep
      ? "Uma semana depois, você cumpriu o combinado. O professor te chamou pelo nome antes de ler a lista. Sua palavra passou a valer dentro do vestiário."
      : "Você tomou o atalho. O técnico soube por outra pessoa. A próxima conversa vai começar de um lugar mais difícil: reconstruir a confiança.",
  };
}

// 05 / Cards are commitments. Their order matters.
export type PlanCard = {
  id: string;
  title: string;
  subtitle: string;
  number: string;
  kind: "training" | "rest" | "match" | "public";
  cost: number;
  description: string;
};
export const PLAN_CARDS: PlanCard[] = [
  {
    id: "treino",
    title: "Treino extra",
    subtitle: "PREPARAÇÃO",
    number: "01",
    kind: "training",
    cost: 2,
    description: "Antes do clássico: +2 gols. Cobra fôlego.",
  },
  {
    id: "descanso",
    title: "Pé no freio",
    subtitle: "RECUPERAÇÃO",
    number: "02",
    kind: "rest",
    cost: 0,
    description: "Depois do jogo: +3 fôlego. Antes: +1.",
  },
  {
    id: "classico",
    title: "Dia de clássico",
    subtitle: "COMPETIÇÃO",
    number: "03",
    kind: "match",
    cost: 2,
    description: "Vale espaço no time. Melhor com preparação.",
  },
  {
    id: "midia",
    title: "Falar com a rua",
    subtitle: "VIDA PÚBLICA",
    number: "04",
    kind: "public",
    cost: 1,
    description: "Aproxima a torcida. Depois do clássico, vale mais.",
  },
  {
    id: "mentor",
    title: "Ouvir o velho",
    subtitle: "VESTIÁRIO",
    number: "05",
    kind: "training",
    cost: 1,
    description: "Dá confiança e torna o treino menos desgastante.",
  },
];
export type PlanResult = {
  title: string;
  goals: number;
  fitness: number;
  trust: number;
  fans: number;
  combos: string[];
};
export type PlanState = {
  season: number;
  slots: (string | null)[];
  fitness: number;
  trust: number;
  fans: number;
  results: PlanResult[];
  result: PlanResult | null;
};
export function newPlan(): PlanState {
  return {
    season: 2026,
    slots: [null, null, null],
    fitness: 6,
    trust: 3,
    fans: 2,
    results: [],
    result: null,
  };
}
export function placeCard(s: PlanState, id: string, slot: number): PlanState {
  if (
    s.result ||
    !PLAN_CARDS.some((c) => c.id === id) ||
    slot < 0 ||
    slot > 2 ||
    !Number.isInteger(slot)
  )
    return s;
  const slots = [...s.slots];
  const old = slots.indexOf(id);
  if (old >= 0) slots[old] = slots[slot];
  slots[slot] = id;
  return { ...s, slots };
}
export function planCost(s: PlanState) {
  return s.slots.reduce<number>(
    (n, id) => n + (PLAN_CARDS.find((c) => c.id === id)?.cost ?? 0),
    0,
  );
}
export function forecastPlan(s: PlanState): PlanResult {
  let fitness = s.fitness,
    goals = 3,
    trust = s.trust,
    fans = s.fans;
  const combos: string[] = [];
  for (let i = 0; i < 3; i++) {
    const id = s.slots[i];
    if (id === "treino")
      fitness -= s.slots.slice(0, i).includes("mentor") ? 1 : 2;
    if (id === "mentor") trust += 2;
    if (id === "classico") {
      fitness -= 2;
      trust += 2;
      if (s.slots.slice(0, i).includes("treino")) {
        goals += 2;
        combos.push("Treino → clássico: a preparação virou gol.");
      }
    }
    if (id === "descanso") {
      const afterMatch = s.slots.slice(0, i).includes("classico");
      fitness += afterMatch ? 3 : 1;
      if (afterMatch)
        combos.push("Clássico → descanso: recuperação no momento certo.");
    }
    if (id === "midia") {
      const afterMatch = s.slots.slice(0, i).includes("classico");
      fans += afterMatch ? 3 : 1;
      if (afterMatch)
        combos.push("Clássico → torcida: o jogo ganhou uma história.");
    }
  }
  if (fitness < 2) {
    goals = Math.max(0, goals - 2);
    combos.push("O corpo cobrou: o desgaste tirou dois gols da projeção.");
  }
  return {
    title:
      goals >= 5
        ? "A preparação apareceu."
        : fans > s.fans
          ? "Uma temporada com voz."
          : "Um passo para ganhar espaço.",
    goals,
    fitness: limit(fitness, 0, 8),
    trust: limit(trust, 0, 10),
    fans: limit(fans, 0, 10),
    combos,
  };
}
export function commitPlan(s: PlanState): PlanState {
  if (s.result || s.slots.some((id) => !id) || planCost(s) > 4) return s;
  const result = forecastPlan(s);
  return {
    ...s,
    fitness: result.fitness,
    trust: result.trust,
    fans: result.fans,
    result,
    results: [...s.results, result],
  };
}
export function nextPlan(s: PlanState): PlanState {
  return s.result
    ? { ...s, season: s.season + 1, slots: [null, null, null], result: null }
    : s;
}

// 06 / Fast gestures, remembered consequences. Buttons offer the same agency.
export type PulseEvent = {
  id: string;
  speaker: string;
  scene: "coach" | "night" | "fans" | "medical";
  text: string;
  left: string;
  right: string;
  a: number[];
  b: number[];
};
export const PULSE_EVENTS: PulseEvent[] = [
  {
    id: "convite",
    speaker: "RAFA, EMPRESÁRIO",
    scene: "coach",
    text: "O treino acabou. A marca quer você numa gravação hoje à noite.",
    left: "Hoje eu descanso",
    right: "Eu faço a campanha",
    a: [1, 0, -1],
    b: [-1, 0, 2],
  },
  {
    id: "lista",
    speaker: "PROFESSOR",
    scene: "coach",
    text: "Abriu uma vaga no clássico. Você banca jogar os noventa?",
    left: "Entro no segundo tempo",
    right: "Eu banco esse jogo",
    a: [1, 0, 0],
    b: [-2, 2, 1],
  },
  {
    id: "perna",
    speaker: "PREPARADOR",
    scene: "medical",
    text: "Você prometeu noventa minutos, mas a perna acusou. Vai esconder?",
    left: "Conto pro professor",
    right: "Não vou perder a vaga",
    a: [2, 1, -1],
    b: [-2, -1, 1],
  },
  {
    id: "grupo",
    speaker: "CAPITÃO",
    scene: "night",
    text: "O grupo vai jantar junto. Amanhã tem treino cedo. Você vem?",
    left: "Vou direto pra casa",
    right: "Uma hora com o grupo",
    a: [1, -1, 0],
    b: [-1, 2, 0],
  },
  {
    id: "torcida",
    speaker: "TORCIDA",
    scene: "fans",
    text: "A fila de crianças está esperando sua camisa depois do jogo.",
    left: "Preciso me recuperar",
    right: "Uma foto com cada um",
    a: [1, 0, -1],
    b: [-1, 0, 2],
  },
  {
    id: "medico",
    speaker: "DEPARTAMENTO MÉDICO",
    scene: "medical",
    text: "O cansaço já entrou no seu jogo. Parar agora evita uma parada maior.",
    left: "Eu aceito a pausa",
    right: "Só mais esse jogo",
    a: [3, -1, 0],
    b: [-2, 1, 1],
  },
  {
    id: "voz",
    speaker: "JORNALISTA",
    scene: "fans",
    text: "Querem uma frase sobre o banco. Seu silêncio também vai virar notícia.",
    left: "O grupo vem primeiro",
    right: "Quero mais minutos",
    a: [0, 2, 0],
    b: [0, -2, 2],
  },
];
export type PulseState = {
  turn: number;
  values: number[];
  log: { id: string; side: "left" | "right"; text: string }[];
  promise: boolean;
  done: boolean;
  last: string;
};
export function newPulse(): PulseState {
  return {
    turn: 0,
    values: [5, 5, 4],
    log: [],
    promise: false,
    done: false,
    last: "",
  };
}
export function pulseEvent(s: PulseState): PulseEvent {
  if (s.promise && !s.log.some((l) => l.id === "perna")) return PULSE_EVENTS[2];
  if (s.values[0] <= 2 && !s.log.some((l) => l.id === "medico"))
    return PULSE_EVENTS[5];
  const pool = [
    PULSE_EVENTS[0],
    PULSE_EVENTS[1],
    PULSE_EVENTS[3],
    PULSE_EVENTS[4],
    PULSE_EVENTS[6],
  ];
  return pool.find((e) => !s.log.some((l) => l.id === e.id)) ?? PULSE_EVENTS[6];
}
export function swipePulse(s: PulseState, side: "left" | "right"): PulseState {
  if (s.done || !["left", "right"].includes(side)) return s;
  const event = pulseEvent(s);
  const delta = side === "left" ? event.a : event.b;
  const values = s.values.map((v, i) => limit(v + delta[i], 0, 8));
  const text = side === "left" ? event.left : event.right;
  const done = s.turn >= 6 || values[0] === 0 || values[1] === 0;
  return {
    turn: s.turn + 1,
    values,
    log: [...s.log, { id: event.id, side, text }],
    promise: s.promise || (event.id === "lista" && side === "right"),
    done,
    last:
      event.id === "perna"
        ? side === "left"
          ? "Você cumpriu sua parte: avisou antes de virar problema."
          : "Você escondeu a dor. O corpo não esquece tão rápido."
        : `${text}. A carreira seguiu por esse lado.`,
  };
}

export const STUDY_INITIALIZERS = {
  "na-bola": newPitch,
  estrada: newRoute,
  contrato: newContract,
  entrelinhas: newDialogue,
  "na-mao": newPlan,
  pulso: newPulse,
};
export type StudyId = keyof typeof STUDY_INITIALIZERS;
const integer = (v: unknown, min: number, max: number) =>
  typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;
const string = (v: unknown) => typeof v === "string" && v.length <= 2500;
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const validTerms = (v: unknown) =>
  object(v) &&
  integer(v.salary, 18, 54) &&
  integer(v.years, 1, 3) &&
  typeof v.starter === "boolean" &&
  typeof v.release === "boolean";
function validPlanResult(v: unknown) {
  return (
    object(v) &&
    string(v.title) &&
    integer(v.goals, 0, 10) &&
    integer(v.fitness, 0, 8) &&
    integer(v.trust, 0, 10) &&
    integer(v.fans, 0, 10) &&
    Array.isArray(v.combos) &&
    v.combos.length <= 5 &&
    v.combos.every(string)
  );
}
export function restoreStudy(
  id: StudyId,
  raw: string | null,
): ReturnType<(typeof STUDY_INITIALIZERS)[StudyId]> {
  const baseline = STUDY_INITIALIZERS[id]();
  if (!raw) return baseline;
  try {
    const envelope: unknown = JSON.parse(raw);
    if (!object(envelope) || envelope.version !== 2 || !object(envelope.run))
      return baseline;
    const r = envelope.run;
    if (id === "estrada") {
      if (
        !Array.isArray(r.visited) ||
        r.visited.length > 4 ||
        r.visited[0] !== "base"
      )
        return baseline;
      let route = newRoute();
      for (const next of r.visited.slice(1)) {
        if (typeof next !== "string" || routeReason(route, next))
          return baseline;
        route = travel(route, next);
      }
      return route;
    }
    if (id === "pulso") {
      if (!Array.isArray(r.log) || r.log.length > 7) return baseline;
      let pulse = newPulse();
      for (const entry of r.log) {
        if (
          !object(entry) ||
          entry.id !== pulseEvent(pulse).id ||
          (entry.side !== "left" && entry.side !== "right") ||
          pulse.done
        )
          return baseline;
        pulse = swipePulse(pulse, entry.side);
      }
      return pulse;
    }
    let valid = false;
    if (id === "na-bola")
      valid =
        integer(r.match, 1, 10000) &&
        ["caio", "nico", "davi"].includes(String(r.holder)) &&
        integer(r.touches, 0, 3) &&
        integer(r.clock, 87, 90) &&
        integer(r.score, 1, 2) &&
        integer(r.trust, 0, 100) &&
        Array.isArray(r.chain) &&
        r.chain.length <= 3 &&
        r.chain.every((v) => ["caio", "nico", "davi", "goal"].includes(v)) &&
        (r.result === null ||
          ["goal", "save", "lost"].includes(String(r.result))) &&
        string(r.text);
    if (id === "contrato")
      valid =
        integer(r.club, 0, 2) &&
        validTerms(r.terms) &&
        integer(r.rounds, 0, 3) &&
        ["open", "counter", "signed", "closed"].includes(String(r.status)) &&
        string(r.reply) &&
        (r.signed === null || validTerms(r.signed));
    if (id === "entrelinhas")
      valid =
        Array.isArray(r.heard) &&
        r.heard.length <= 2 &&
        r.heard.every((v) => ["coach", "captain"].includes(v)) &&
        ["chance", "rotacao", "saida"].includes(String(r.topic)) &&
        integer(r.tone, 0, 2) &&
        integer(r.scene, 0, 2) &&
        integer(r.trust, 0, 100) &&
        string(r.promise) &&
        string(r.reply) &&
        string(r.outcome) &&
        typeof r.done === "boolean";
    if (id === "na-mao")
      valid =
        integer(r.season, 2026, 2200) &&
        Array.isArray(r.slots) &&
        r.slots.length === 3 &&
        r.slots.every(
          (v) => v === null || PLAN_CARDS.some((c) => c.id === v),
        ) &&
        new Set(r.slots.filter(Boolean)).size ===
          r.slots.filter(Boolean).length &&
        integer(r.fitness, 0, 8) &&
        integer(r.trust, 0, 10) &&
        integer(r.fans, 0, 10) &&
        Array.isArray(r.results) &&
        r.results.length <= 175 &&
        r.results.every(validPlanResult) &&
        (r.result === null || validPlanResult(r.result));
    return valid
      ? (Object.fromEntries(
          Object.keys(baseline).map((k) => [k, r[k]]),
        ) as typeof baseline)
      : baseline;
  } catch {
    return baseline;
  }
}
