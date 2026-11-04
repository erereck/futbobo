export type Stat = "overall" | "morale" | "fitness" | "trust";
export type Choice = { title: string; hint: string; risk: string; effects: Partial<Record<Stat, number>>; result: string };
export type Chapter = { tag: string; title: string; description: string; speaker: string; quote: string; date: string; choices: Choice[] };
export const STAT_LABELS: Record<Stat, string> = { overall: "OVR", morale: "Moral", fitness: "Físico", trust: "Treinador" };
export const CHAPTERS: Chapter[] = [
  {
    tag: "O PRIMEIRO GRANDE PASSO", title: "O banco não é o seu lugar.",
    description: "A estreia no profissional chegou. O técnico quer te preservar, mas seu empresário conseguiu uma chance por empréstimo. Ficar e conquistar espaço ou sair para jogar?",
    speaker: "Rafa · seu empresário", quote: "O talento você já tem. Agora precisa decidir onde vai mostrar isso.", date: "FEV · 2026",
    choices: [
      { title: "Vou conquistar meu espaço", hint: "Fique no Flamengo e mostre serviço no treino.", risk: "Caminho paciente", effects: { overall: 1, trust: 10, morale: -4 }, result: "Você chegou primeiro e saiu por último dos treinos. O técnico percebeu. Ainda não é a titularidade, mas seu nome já é o primeiro no banco." },
      { title: "Quero jogar. Pode me emprestar.", hint: "O Sport oferece minutos. Aceite o novo desafio.", risk: "Novo desafio", effects: { overall: 2, fitness: -5, morale: 6 }, result: "A mala está pronta. O Sport te recebe como aposta para o ataque e promete minutos. A primeira chance de ser protagonista começa agora." },
      { title: "Professor, vamos conversar?", hint: "Peça uma chance. A resposta depende da relação.", risk: "Conversa franca", effects: { trust: 5, morale: 3, fitness: -2 }, result: "Você foi direto, sem bater de frente. O técnico gostou da postura e prometeu te observar no próximo jogo. A conversa abriu uma porta." },
    ],
  },
  {
    tag: "ANTES DO APITO", title: "O clássico começa no treino.",
    description: "Domingo tem clássico. Você treinou bem a semana inteira, mas sentiu a perna no último coletivo. O preparador pergunta: dá para ir com tudo?",
    speaker: "Léo · preparador físico", quote: "Uma partida pode mudar sua carreira. Só não esquece que você tem uma carreira inteira pela frente.", date: "ABR · 2026",
    choices: [
      { title: "Eu quero esse jogo", hint: "Jogue no limite para impressionar o treinador.", risk: "Mais desgaste", effects: { fitness: -12, trust: 9, morale: 5 }, result: "Você entrou e mudou o ritmo do clássico. A torcida cantou seu nome. A perna pesou depois, mas o técnico sabe que pode contar com você." },
      { title: "Melhor entrar no segundo tempo", hint: "Controle o esforço e aproveite o adversário cansado.", risk: "Equilíbrio", effects: { fitness: -3, trust: 4, overall: 1 }, result: "Aos 65 minutos, você entrou com energia. Criou duas chances e saiu inteiro. Seu preparo fez a diferença quando o jogo precisava de alguém novo." },
      { title: "Vou cuidar de mim primeiro", hint: "Recupere o físico. Outros jogos vão chegar.", risk: "Visão de futuro", effects: { fitness: 12, morale: -3, trust: -2 }, result: "Assistir de fora doeu mais que a perna. Mas a recuperação funcionou: na semana seguinte, você voltou sem limitações e pronto para a sequência." },
    ],
  },
  {
    tag: "O MUNDO ESTÁ OLHANDO", title: "Seu nome na capa.",
    description: "Um vídeo da sua jogada viralizou. Tem marca querendo fechar, jornalista pedindo entrevista e uma partida importante amanhã. Como lidar com a primeira onda de atenção?",
    speaker: "Rafa · seu empresário", quote: "Todo mundo quer um pedaço do seu tempo. A pergunta é: o que você quer para a sua história?", date: "AGO · 2026",
    choices: [
      { title: "Minha resposta vai ser em campo", hint: "Mantenha o foco. A bola fala por você.", risk: "Futebol primeiro", effects: { overall: 2, trust: 6, morale: 2 }, result: "Você silenciou as notificações e foi treinar. No dia seguinte, outra boa atuação. A manchete foi sobre futebol. Do jeito que você queria." },
      { title: "Bora conversar com a torcida", hint: "Dê a entrevista e mostre quem está por trás da camisa.", risk: "Voz própria", effects: { morale: 10, trust: 2, fitness: -2 }, result: "A entrevista foi leve e sincera. Você falou da família, da rua e do sonho. A torcida conheceu a pessoa por trás do camisa 10." },
      { title: "Rafa, cuida disso pra mim", hint: "Deixe o empresário negociar enquanto você descansa.", risk: "Trabalho em equipe", effects: { fitness: 5, morale: 5, trust: 3 }, result: "Rafa filtrou as propostas e organizou sua agenda. Você ganhou uma tarde de descanso e um novo acordo para analisar, sem perder o foco no jogo." },
    ],
  },
];

export type DemoState = {
  version: 1; name: string; club: string; chapter: number; stats: Record<Stat, number>;
  history: { chapter: number; choice: number }[];
};
export function newDemo(name = "Caio Silva"): DemoState {
  return { version: 1, name: name.trim().slice(0, 28) || "Caio Silva", club: "Flamengo", chapter: 0, stats: { overall: 72, morale: 78, fitness: 86, trust: 62 }, history: [] };
}
export function resolveDemo(state: DemoState, choiceIndex: number): DemoState {
  const chapter = CHAPTERS[state.chapter];
  const choice = chapter?.choices[choiceIndex];
  if (!choice) return state;
  const stats = { ...state.stats };
  for (const key of Object.keys(choice.effects) as Stat[]) stats[key] = Math.max(0, Math.min(99, stats[key] + (choice.effects[key] ?? 0)));
  return { ...state, club: state.chapter === 0 && choiceIndex === 1 ? "Sport" : state.club, chapter: state.chapter + 1, stats, history: [...state.history, { chapter: state.chapter, choice: choiceIndex }] };
}
export function restoreDemo(raw: string | null): DemoState {
  if (!raw) return newDemo();
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return newDemo();
    const d = data as Partial<DemoState>;
    if (d.version !== 1 || typeof d.name !== "string" || !d.name.trim() || d.name.length > 28 || !Number.isInteger(d.chapter) || d.chapter! < 0 || d.chapter! > CHAPTERS.length || !d.stats || !Array.isArray(d.history)) return newDemo();
    if (!(Object.keys(STAT_LABELS) as Stat[]).every(k => Number.isFinite(d.stats?.[k]) && d.stats![k] >= 0 && d.stats![k] <= 99)) return newDemo();
    if (d.history.length !== d.chapter || !d.history.every((h, i) => h && h.chapter === i && Number.isInteger(h.choice) && h.choice >= 0 && h.choice < CHAPTERS[i].choices.length)) return newDemo();
    // Rebuild instead of trusting stored objects or injected extra properties.
    return d.history.reduce((s, h) => resolveDemo(s, h.choice), newDemo(d.name));
  } catch { return newDemo(); }
}
