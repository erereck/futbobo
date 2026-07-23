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

export type Club = {
  id: string;
  name: string;
  shortName: string;
  abbr: string;
  city: string;
  state: string;
  primary: string;
  secondary: string;
  reputation: number;
  academy: number;
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
  fans?: number;
  injuryRisk?: number;
  transfer?: boolean;
  retire?: boolean;
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
  oneTime?: boolean;
  choices: Array<{
    label: string;
    hint: string;
    result: string;
    effect: Effect;
  }>;
};

export const POSITIONS: Position[] = [
  { key: "GOL", name: "Goleiro", zone: "gol", style: "Muralha", icon: "🧤", color: "#f2b705", goals: 0.001, assists: 0.01 },
  { key: "LD", name: "Lateral direito", zone: "defesa", style: "Ala incansável", icon: "↗", color: "#2ca8ff", goals: 0.025, assists: 0.13 },
  { key: "ZAG", name: "Zagueiro", zone: "defesa", style: "Pilar defensivo", icon: "◆", color: "#2ca8ff", goals: 0.035, assists: 0.02 },
  { key: "LE", name: "Lateral esquerdo", zone: "defesa", style: "Apoio por fora", icon: "↖", color: "#2ca8ff", goals: 0.025, assists: 0.13 },
  { key: "VOL", name: "Volante", zone: "meio", style: "Escudo do time", icon: "⬡", color: "#63e36b", goals: 0.04, assists: 0.08 },
  { key: "MC", name: "Meio-campista", zone: "meio", style: "Motor do time", icon: "●", color: "#63e36b", goals: 0.09, assists: 0.16 },
  { key: "MEI", name: "Meia ofensivo", zone: "meio", style: "Maestro", icon: "✦", color: "#63e36b", goals: 0.17, assists: 0.23 },
  { key: "MD", name: "Meia direita", zone: "meio", style: "Construtor aberto", icon: "›", color: "#63e36b", goals: 0.12, assists: 0.19 },
  { key: "ME", name: "Meia esquerda", zone: "meio", style: "Criador pelo lado", icon: "‹", color: "#63e36b", goals: 0.12, assists: 0.19 },
  { key: "PD", name: "Ponta direita", zone: "ataque", style: "Driblador", icon: "⚡", color: "#ff7a45", goals: 0.21, assists: 0.17 },
  { key: "PE", name: "Ponta esquerda", zone: "ataque", style: "Pé invertido", icon: "⚡", color: "#ff7a45", goals: 0.21, assists: 0.17 },
  { key: "CA", name: "Centroavante", zone: "ataque", style: "Matador de área", icon: "◎", color: "#ff7a45", goals: 0.34, assists: 0.08 },
];

// Série A 2026, conforme a relação oficial da CBF. Os escudos serão substituídos
// por uma fonte de dados licenciada; nesta demo cada clube recebe um monograma.
export const CLUBS: Club[] = [
  { id: "athletico", name: "Athletico Paranaense", shortName: "Athletico-PR", abbr: "CAP", city: "Curitiba", state: "PR", primary: "#d71920", secondary: "#111111", reputation: 4, academy: 4 },
  { id: "atletico-mg", name: "Atlético Mineiro", shortName: "Atlético-MG", abbr: "CAM", city: "Belo Horizonte", state: "MG", primary: "#111111", secondary: "#f5f5f5", reputation: 5, academy: 4 },
  { id: "bahia", name: "Esporte Clube Bahia", shortName: "Bahia", abbr: "BAH", city: "Salvador", state: "BA", primary: "#0057a8", secondary: "#e32636", reputation: 4, academy: 4 },
  { id: "botafogo", name: "Botafogo de Futebol e Regatas", shortName: "Botafogo", abbr: "BOT", city: "Rio de Janeiro", state: "RJ", primary: "#111111", secondary: "#f5f5f5", reputation: 5, academy: 4 },
  { id: "chapecoense", name: "Associação Chapecoense de Futebol", shortName: "Chapecoense", abbr: "CHA", city: "Chapecó", state: "SC", primary: "#08783e", secondary: "#f5f5f5", reputation: 2, academy: 3 },
  { id: "corinthians", name: "Sport Club Corinthians Paulista", shortName: "Corinthians", abbr: "COR", city: "São Paulo", state: "SP", primary: "#111111", secondary: "#f5f5f5", reputation: 5, academy: 5 },
  { id: "coritiba", name: "Coritiba Foot Ball Club", shortName: "Coritiba", abbr: "CFC", city: "Curitiba", state: "PR", primary: "#08783e", secondary: "#f5f5f5", reputation: 3, academy: 3 },
  { id: "cruzeiro", name: "Cruzeiro Esporte Clube", shortName: "Cruzeiro", abbr: "CRU", city: "Belo Horizonte", state: "MG", primary: "#164194", secondary: "#f5f5f5", reputation: 5, academy: 5 },
  { id: "flamengo", name: "Clube de Regatas do Flamengo", shortName: "Flamengo", abbr: "FLA", city: "Rio de Janeiro", state: "RJ", primary: "#d71920", secondary: "#111111", reputation: 5, academy: 5 },
  { id: "fluminense", name: "Fluminense Football Club", shortName: "Fluminense", abbr: "FLU", city: "Rio de Janeiro", state: "RJ", primary: "#7a1538", secondary: "#007a4d", reputation: 5, academy: 5 },
  { id: "gremio", name: "Grêmio Foot-Ball Porto Alegrense", shortName: "Grêmio", abbr: "GRE", city: "Porto Alegre", state: "RS", primary: "#2a9fd6", secondary: "#111111", reputation: 5, academy: 5 },
  { id: "internacional", name: "Sport Club Internacional", shortName: "Internacional", abbr: "INT", city: "Porto Alegre", state: "RS", primary: "#d71920", secondary: "#f5f5f5", reputation: 5, academy: 5 },
  { id: "mirassol", name: "Mirassol Futebol Clube", shortName: "Mirassol", abbr: "MIR", city: "Mirassol", state: "SP", primary: "#f2b705", secondary: "#0a7a3d", reputation: 2, academy: 3 },
  { id: "palmeiras", name: "Sociedade Esportiva Palmeiras", shortName: "Palmeiras", abbr: "PAL", city: "São Paulo", state: "SP", primary: "#08783e", secondary: "#f5f5f5", reputation: 5, academy: 5 },
  { id: "bragantino", name: "Red Bull Bragantino", shortName: "Bragantino", abbr: "RBB", city: "Bragança Paulista", state: "SP", primary: "#f5f5f5", secondary: "#d71920", reputation: 4, academy: 5 },
  { id: "remo", name: "Clube do Remo", shortName: "Remo", abbr: "REM", city: "Belém", state: "PA", primary: "#162c6c", secondary: "#f5f5f5", reputation: 2, academy: 3 },
  { id: "santos", name: "Santos Futebol Clube", shortName: "Santos", abbr: "SAN", city: "Santos", state: "SP", primary: "#f5f5f5", secondary: "#111111", reputation: 5, academy: 5 },
  { id: "sao-paulo", name: "São Paulo Futebol Clube", shortName: "São Paulo", abbr: "SAO", city: "São Paulo", state: "SP", primary: "#f5f5f5", secondary: "#d71920", reputation: 5, academy: 5 },
  { id: "vasco", name: "Club de Regatas Vasco da Gama", shortName: "Vasco", abbr: "VAS", city: "Rio de Janeiro", state: "RJ", primary: "#111111", secondary: "#f5f5f5", reputation: 5, academy: 5 },
  { id: "vitoria", name: "Esporte Clube Vitória", shortName: "Vitória", abbr: "VIT", city: "Salvador", state: "BA", primary: "#d71920", secondary: "#111111", reputation: 3, academy: 4 },
];

export const FORMATIONS: Formation[] = [
  { id: "artista", icon: "✦", title: "Bola no pé", subtitle: "Técnica acima de tudo", description: "Mais drible, passe e criatividade. O físico demora um pouco mais.", technical: 9, physical: 1, mental: 4, risk: 2, archetype: "O Artista" },
  { id: "guerreiro", icon: "⚡", title: "Corpo de atleta", subtitle: "Explosão e resistência", description: "Você cresce forte, aguenta a pancada e evolui rápido nos treinos.", technical: 2, physical: 9, mental: 3, risk: 4, archetype: "O Guerreiro" },
  { id: "estudioso", icon: "◫", title: "Estudar o jogo", subtitle: "Tática e cabeça fria", description: "Evolução segura, boas decisões e confiança dos treinadores.", technical: 4, physical: 2, mental: 9, risk: 1, archetype: "O Estudioso" },
  { id: "prodigio", icon: "★", title: "Quero ser o melhor", subtitle: "Ambição sem freio", description: "Potencial máximo e mais visibilidade, com pressão e risco maiores.", technical: 7, physical: 5, mental: 5, risk: 8, archetype: "O Prodígio" },
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
    { label: "Aprender os atalhos", hint: "Potencial ↑", result: "O jogo parece um pouco mais lento depois da conversa.", effect: { potential: 2, ovr: 1 } },
    { label: "Aprender sobre a carreira", hint: "Longevidade ↑", result: "Você começa a cuidar melhor do corpo e da cabeça.", effect: { fitness: 8, morale: 4 } },
  ]},
  { id: "derby", icon: "⚔", tag: "CLÁSSICO", title: "A cidade para por noventa minutos", description: "Clássico lotado. Uma boa atuação muda a forma como a torcida olha para você.", minOvr: 64, choices: [
    { label: "Jogar para o time", hint: "Seguro · reputação ↑", result: "Sem firula: você foi útil em cada bola.", effect: { reputation: 4, morale: 3 } },
    { label: "Buscar o lance do jogo", hint: "Alto risco · alto retorno", result: "A arquibancada levantou antes mesmo da bola chegar.", effect: { ovr: 1, reputation: 7, fitness: -5, injuryRisk: 4 } },
    { label: "Provocar o rival", hint: "Torcida ↑ · disciplina ↓", result: "Seu nome ecoa no estádio — dos dois lados.", effect: { reputation: 8, morale: 5, fitness: -3 } },
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
  { id: "national-u20", icon: "★", tag: "SELEÇÃO", title: "A amarelinha chamou", description: "Seu nome apareceu na convocação da Seleção Sub-20.", minOvr: 68, maxAge: 20, oneTime: true, choices: [
    { label: "Representar o Brasil", hint: "Reputação ↑↑ · cansaço", result: "O hino arrepia e seu nome ganha o país.", effect: { reputation: 10, fitness: -9, nationalBoost: 12 } },
    { label: "Ficar no clube", hint: "Condição ↑ · seleção ↓", result: "Você ganha fôlego no clube e perde espaço no radar.", effect: { fitness: 12, nationalBoost: -8 } },
  ]},
  { id: "renewal", icon: "✎", tag: "CONTRATO", title: "A caneta está na mesa", description: "Seu contrato entra no último ano e o clube quer uma resposta.", minAge: 20, choices: [
    { label: "Renovar por identificação", hint: "Torcida ↑ · salário menor", result: "A arquibancada trata a assinatura como um gol.", effect: { reputation: 7, morale: 5, money: 2 } },
    { label: "Exigir valorização", hint: "Dinheiro ↑↑ · pressão ↑", result: "O salário cresce junto com a cobrança.", effect: { money: 10, morale: -3 } },
    { label: "Esperar outras propostas", hint: "Mercado ↑ · risco", result: "Cada rodada agora também acontece fora de campo.", effect: { transfer: true, reputation: -2 } },
  ]},
  { id: "rival-offer", icon: "⇄", tag: "MERCADO", title: "Um rival ligou para seu empresário", description: "A proposta é grande e a repercussão seria ainda maior.", minAge: 21, minOvr: 72, choices: [
    { label: "Ouvir a proposta", hint: "Transferência possível", result: "A reunião termina com mais perguntas do que respostas.", effect: { transfer: true, money: 6 } },
    { label: "Recusar publicamente", hint: "Torcida ↑↑", result: "Seu nome vira canto na arquibancada.", effect: { reputation: 12, morale: 6 } },
    { label: "Usar na negociação", hint: "Dinheiro ↑ · confiança ↓", result: "A diretoria melhora a oferta e guarda a memória.", effect: { money: 8, reputation: -3 } },
  ]},
  { id: "fight", icon: "!", tag: "CAMPO", title: "Confusão depois da falta", description: "Um adversário chega forte em seu companheiro e o jogo esquenta.", choices: [
    { label: "Separar a confusão", hint: "Liderança ↑", result: "A cabeça fria evita uma noite pior.", effect: { leadership: 6, reputation: 2 } },
    { label: "Defender o companheiro", hint: "Grupo ↑ · suspensão possível", result: "O elenco fecha com você; o árbitro também anota.", effect: { morale: 8, fitness: -4, minutes: -3 } },
    { label: "Sair de perto", hint: "Seguro", result: "Você preserva o jogo e escuta algumas cobranças depois.", effect: { morale: -2 } },
  ]},
  { id: "sponsorship", icon: "$", tag: "FORA DE CAMPO", title: "Sua primeira campanha", description: "Duas marcas querem associar a imagem ao seu momento.", minOvr: 70, oneTime: true, choices: [
    { label: "Marca nacional", hint: "Dinheiro ↑↑ · exposição ↑", result: "Seu rosto aparece por todo o país.", effect: { money: 14, reputation: 7, morale: -2 } },
    { label: "Marca da sua cidade", hint: "Torcida ↑ · dinheiro ↑", result: "A campanha parece uma homenagem às suas raízes.", effect: { money: 7, reputation: 8, morale: 4 } },
    { label: "Focar só no futebol", hint: "Potencial ↑", result: "A decisão surpreende e abre espaço para treinar.", effect: { potential: 2, fitness: 5 } },
  ]},
  { id: "rumor", icon: "?", tag: "MÍDIA", title: "Seu nome domina a janela", description: "Um perfil grande publica que sua saída está acertada. Ninguém falou com você.", minOvr: 72, choices: [
    { label: "Responder nas redes", hint: "Exposição ↑", result: "A postagem vira notícia antes do treino acabar.", effect: { reputation: 5, morale: -3 } },
    { label: "Deixar o clube falar", hint: "Profissionalismo ↑", result: "A nota oficial esfria o assunto.", effect: { leadership: 3, reputation: 2 } },
    { label: "Pedir reunião", hint: "Controle ↑ · mercado", result: "Agora você sabe exatamente quem está interessado.", effect: { transfer: true, morale: 3 } },
  ]},
  { id: "senior-national", icon: "BR", tag: "SELEÇÃO", title: "Convocado para a Seleção Brasileira", description: "O telefone toca durante o almoço. Você está na lista principal.", minOvr: 78, oneTime: true, choices: [
    { label: "Chegar para disputar vaga", hint: "Reputação ↑↑ · pressão", result: "Você pisa na Granja com os olhos de quem quer ficar.", effect: { reputation: 16, morale: 5, fitness: -7, nationalBoost: 20 } },
    { label: "Aprender com o grupo", hint: "Potencial ↑ · seguro", result: "A primeira convocação vira uma aula de alto nível.", effect: { potential: 3, reputation: 10, nationalBoost: 12 } },
  ]},
  { id: "divided-locker", icon: "╱", tag: "CRISE", title: "O vestiário se dividiu", description: "Resultados ruins criaram dois lados. Todos querem saber onde você está.", minAge: 23, choices: [
    { label: "Tentar unir o grupo", hint: "Liderança ↑↑", result: "A conversa não resolve tudo, mas muda o tom.", effect: { leadership: 10, morale: 5 } },
    { label: "Focar apenas no campo", hint: "OVR ↑ · grupo ↓", result: "Seu futebol cresce enquanto o silêncio pesa.", effect: { ovr: 1, morale: -5 } },
    { label: "Apoiar o treinador", hint: "Minutos ↑ · risco", result: "O técnico agradece. Parte do elenco não esquece.", effect: { minutes: 8, morale: -6 } },
  ]},
  { id: "title-run", icon: "🏆", tag: "RETA FINAL", title: "O Brasileirão está ao alcance", description: "Quatro rodadas. Três pontos de diferença. O país inteiro acompanha cada passo.", minOvr: 76, choices: [
    { label: "Assumir a responsabilidade", hint: "Título ↑ · cansaço ↑", result: "A bola passa por você quando o jogo aperta.", effect: { titleBoost: 18, fitness: -12, reputation: 8 } },
    { label: "Confiar no coletivo", hint: "Título ↑ · grupo ↑", result: "O time joga leve e todo mundo entrega um pouco mais.", effect: { titleBoost: 10, morale: 10, leadership: 5 } },
    { label: "Tirar o peso do discurso", hint: "Condição ↑ · pressão ↓", result: "Você transforma a ansiedade em rotina.", effect: { titleBoost: 5, fitness: 8, morale: 6 } },
  ]},
  { id: "coach-fired", icon: "×", tag: "BASTIDORES", title: "O técnico caiu", description: "A demissão chega antes do treino. O novo comandante já está a caminho.", choices: [
    { label: "Agradecer publicamente", hint: "Respeito ↑", result: "A mensagem é curta e elegante.", effect: { reputation: 4, leadership: 3 } },
    { label: "Ficar em silêncio", hint: "Neutro", result: "Você espera o próximo capítulo sem alimentar manchetes.", effect: { morale: 1 } },
    { label: "Conversar com o novo técnico", hint: "Minutos ↑", result: "Você sai da sala sabendo o que precisa entregar.", effect: { minutes: 7, potential: 1 } },
  ]},
  { id: "big-club", icon: "↑", tag: "MERCADO", title: "Um gigante brasileiro quer você", description: "O projeto oferece títulos, salário e uma disputa pesada por posição.", minOvr: 76, choices: [
    { label: "Aceitar o desafio", hint: "Transferência · pressão ↑", result: "A carreira ganha uma nova camisa e outro peso.", effect: { transfer: true, money: 12, reputation: 6, minutes: -5 } },
    { label: "Virar referência onde está", hint: "Torcida ↑↑ · liderança ↑", result: "Você escolhe construir algo que tenha seu rosto.", effect: { reputation: 12, leadership: 8, morale: 6 } },
  ]},
  { id: "scandal", icon: "#", tag: "MÍDIA", title: "Uma história fora de contexto", description: "Um vídeo antigo volta a circular e cresce mais rápido que a verdade.", minAge: 22, choices: [
    { label: "Explicar tudo", hint: "Risco · transparência", result: "A entrevista divide opiniões, mas coloca sua voz na história.", effect: { reputation: 3, morale: -4 } },
    { label: "Contratar assessoria", hint: "Dinheiro ↓ · dano controlado", result: "A crise termina sem virar temporada.", effect: { money: -5, reputation: 1 } },
    { label: "Ignorar", hint: "Moral ↑ · reputação ↓", result: "Você protege a cabeça e deixa a internet falar sozinha.", effect: { morale: 5, reputation: -5 } },
  ]},
  { id: "captain", icon: "C", tag: "LIDERANÇA", title: "A braçadeira espera sua resposta", description: "O treinador quer você como capitão do clube.", minAge: 24, minOvr: 78, oneTime: true, choices: [
    { label: "Aceitar a responsabilidade", hint: "Liderança ↑↑ · pressão", result: "A faixa aperta o braço e alarga sua história.", effect: { leadership: 15, reputation: 10, morale: -2 } },
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
    { label: "Bater no canto", hint: "Técnica", result: "Você escolhe o canto antes de começar a corrida.", effect: { reputation: 7, morale: 5, titleBoost: 5 } },
    { label: "Esperar o goleiro", hint: "Frieza", result: "Um segundo parece durar uma temporada inteira.", effect: { leadership: 5, reputation: 5, titleBoost: 7 } },
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
  { id: "world-stage", icon: "MUN", tag: "MUNDIAL", title: "O planeta está olhando", description: "Depois da América, chegou a camisa que domina outro continente.", needsWorld: true, choices: [
    { label: "Jogar sem complexo", hint: "Mundial ↑↑ · reputação ↑", result: "O primeiro duelo mostra que o escudo não entra sozinho em campo.", effect: { titleBoost: 18, reputation: 12, fans: 10, fitness: -8 } },
    { label: "Fechar espaços e sobreviver", hint: "Mundial ↑ · seguro", result: "Cada minuto vivo aumenta a crença do time.", effect: { titleBoost: 11, leadership: 7, morale: 5 } },
  ]},
  { id: "cup-semi", icon: "CB", tag: "COPA DO BRASIL", title: "Uma noite de mata-mata", description: "O primeiro jogo deixou tudo aberto. Um lance pode valer calendário e milhões.", choices: [
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
  { id: "short-vacation", icon: "⌛", tag: "CALENDÁRIO", title: "Doze dias até a reapresentação", description: "A temporada foi longa e o próximo ano já bate na porta.", choices: [
    { label: "Descansar de verdade", hint: "Físico ↑↑ · OVR estável", result: "Você desliga o telefone e deixa o corpo respirar.", effect: { fitness: 16, morale: 8 } },
    { label: "Treinar nas férias", hint: "OVR ↑ · desgaste", result: "Você volta na frente — mas sem ter parado.", effect: { ovr: 1, fitness: -8, potential: 1 } },
    { label: "Viajar com o elenco", hint: "Grupo ↑ · físico ↑", result: "A amizade também sustenta temporadas difíceis.", effect: { morale: 10, fitness: 6, leadership: 3 } },
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
