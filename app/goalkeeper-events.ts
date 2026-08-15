import type { GameEvent } from "./game-data";

export const GOALKEEPER_YOUTH_EVENTS = [
  { title: "As primeiras luvas", positive: "Você parou de temer a bola e começou a atacar cada defesa.", neutral: "As luvas ainda pareciam grandes, mas o gol já parecia seu." },
  { title: "O primeiro pênalti", positive: "Você esperou o chute e defendeu sem sair antes da linha.", neutral: "A bola entrou, mas o canto ficou anotado na memória." },
  { title: "Treino com os maiores", positive: "Os chutes vieram mais fortes e você cresceu com cada um deles.", neutral: "Você tomou gols que nunca tinha visto e voltou querendo outra sessão." },
  { title: "A camisa 1 da categoria", positive: "O treinador entregou a titularidade e pediu que você comandasse a área.", neutral: "A disputa continuou aberta e cada treino passou a valer como jogo." },
  { title: "Chuva no campo da base", positive: "Você aprendeu a encaixar uma bola que não parava quieta.", neutral: "Um rebote escapou; depois dele, você nunca mais ignorou o clima." },
  { title: "Saída nos pés do atacante", positive: "Você fechou o ângulo e ouviu o banco inteiro gritar seu nome.", neutral: "Chegou atrasado por um instante e entendeu o valor da decisão." },
  { title: "A primeira assistência", positive: "Uma reposição longa atravessou o campo e virou gol.", neutral: "O passe saiu forte demais, mas abriu uma ideia nova para seu jogo." },
  { title: "Capitão visto de trás", positive: "Mesmo sem a faixa, sua voz organizou a defesa inteira.", neutral: "Você percebeu que goleiro também lidera antes de tocar na bola." },
  { title: "Clássico decidido no gol", positive: "Uma defesa no fim valeu como o gol da vitória.", neutral: "O rebote decidiu o clássico e virou combustível para o próximo." },
  { title: "Olheiro atrás da meta", positive: "Você jogou simples, saiu bem e foi anotado no caderno.", neutral: "Tentou mostrar serviço em toda bola e aprendeu a escolher melhor." },
  { title: "Disputa de pênaltis da base", positive: "Duas defesas colocaram seu time na próxima fase.", neutral: "Você acertou os cantos, mas os chutes passaram por centímetros." },
  { title: "Convite para treinar com o profissional", positive: "O preparador elogiou seus reflexos e pediu seu retorno.", neutral: "O ritmo assustou, mas a porta do profissional ficou aberta." },
] as const;

export const GOALKEEPER_EVENTS: GameEvent[] = [
  { id: "keeper-number-one-race", icon: "1", tag: "CAMISA 1", title: "A disputa pelo gol virou um campeonato à parte", description: "O outro goleiro do elenco fechou dois jogos seguidos e o treinador se recusa a confirmar quem começa a próxima rodada.", needsPositionZone: "gol", maxAge: 25, oneTime: true, choices: [
    { label: "Pedir uma disputa aberta", hint: "Minutos ↑ · pressão ↑", result: "Cada treino passa a ter placar, testemunhas e consequência.", effect: { minutes: 8, morale: -2 } },
    { label: "Apoiar o companheiro e esperar", hint: "Grupo ↑ · minutos ↓", result: "Você protege a parceria, mesmo vendo o banco de perto.", effect: { leadership: 6, morale: 4, minutes: -4 } },
    { label: "Treinar antes de todo mundo", hint: "OVR ↑ · físico ↓", result: "Quando o elenco chega, suas luvas já estão encharcadas.", effect: { ovr: 1, fitness: -9, minutes: 4 } },
  ]},
  { id: "keeper-first-professional-clean-sheet", icon: "0", tag: "MARCO", title: "Noventa minutos sem buscar a bola na rede", description: "Sua primeira partida profissional sem sofrer gols termina com a zaga vindo abraçar você antes do apito.", needsPositionZone: "gol", maxAge: 23, oneTime: true, choices: [
    { label: "Dividir o mérito com a defesa", hint: "Liderança ↑ · vestiário ↑", result: "Os defensores guardam a entrevista e passam a confiar mais na sua voz.", effect: { leadership: 7, morale: 7, reputation: 4 } },
    { label: "Guardar a bola do jogo", hint: "Moral ↑↑", result: "A bola ganha data, placar e um lugar especial em casa.", effect: { morale: 12, fans: 3 } },
  ]},
  { id: "keeper-backpass-under-pressure", icon: "↙", tag: "JOGO COM OS PÉS", title: "O atacante corre para roubar a bola dentro da sua área", description: "O recuo chega fraco, o estádio prende a respiração e você tem menos de um segundo para decidir.", needsPositionZone: "gol", oneTime: true, choices: [
    { label: "Driblar e manter a posse", hint: "43% · moral ou desastre", result: "Você decide que a área também pode ser lugar de coragem.", effect: {}, luck: { chance: 43, successText: "O corte seco deixa o atacante no chão e o estádio explode como se fosse gol.", failureText: "O toque escapa, o gol vazio aparece e a falha domina todos os programas esportivos.", successEffect: { ovr: 2, reputation: 12, morale: 10, fans: 8 }, failureEffect: { ovr: -1, reputation: -12, morale: -16, fans: -8, minutes: -5 } } },
    { label: "Mandar para a arquibancada", hint: "Seguro · treinador neutro", result: "A jogada termina feia e viva, exatamente como você queria.", effect: { morale: 3, leadership: 2 } },
  ]},
  { id: "keeper-error-recovery", icon: "!", tag: "FALHA", title: "A bola escapou das suas mãos no pior momento", description: "Um chute comum vira gol, derrota e replay infinito. Em três dias existe outro jogo.", needsPositionZone: "gol", oneTime: true, choices: [
    { label: "Assistir ao lance até entender", hint: "Evolução ↑ · moral ↓", result: "A repetição dói até virar correção técnica.", effect: { potential: 2, morale: -7 } },
    { label: "Apagar tudo e seguir", hint: "Moral ↑ · risco de repetir", result: "Você protege a cabeça e deixa a técnica para depois.", effect: { morale: 9, adaptation: -2 } },
    { label: "Dar entrevista e assumir", hint: "Respeito ↑ · exposição", result: "A falha continua sua, mas a postura muda a conversa.", effect: { reputation: 6, leadership: 6, morale: -3 } },
  ]},
  { id: "keeper-penalty-notebook", icon: "▤", tag: "PÊNALTIS", title: "Um caderno guarda o canto de cada cobrador", description: "O preparador oferece meses de anotações antes do mata-mata. Há padrões, pausas e blefes em cada página.", needsPositionZone: "gol", minOvr: 67, oneTime: true, choices: [
    { label: "Decorar cada cobrança", hint: "Título ↑↑ · desgaste", result: "Você passa a semana enxergando pênaltis até quando fecha os olhos.", effect: { titleBoost: 16, fitness: -5, morale: -2 } },
    { label: "Estudar só os principais", hint: "Equilíbrio · liderança ↑", result: "Você chega preparado sem abandonar o instinto.", effect: { titleBoost: 9, leadership: 4, morale: 4 } },
    { label: "Não olhar nenhuma anotação", hint: "40% · lenda ou vilão", result: "No duelo, serão apenas você, o batedor e o silêncio.", effect: {}, luck: { chance: 40, successText: "Você espera até o último instante e defende a cobrança decisiva.", failureText: "Os batedores deslocam você em sequência e a aposta no instinto vira cobrança.", successEffect: { titleBoost: 22, reputation: 18, fans: 14, morale: 14 }, failureEffect: { titleBoost: -16, reputation: -9, morale: -14 } } },
  ]},
  { id: "keeper-high-line", icon: "↑", tag: "TÁTICA", title: "O treinador quer um goleiro quase no meio-campo", description: "A linha defensiva vai subir e você terá de cortar lançamentos muito longe da própria meta.", needsPositionZone: "gol", minOvr: 70, oneTime: true, choices: [
    { label: "Virar líbero de vez", hint: "Potencial ↑↑ · risco", result: "Você começa a ler o passe antes mesmo de o atacante correr.", effect: { potential: 3, adaptation: 8, injuryRisk: 3 } },
    { label: "Subir apenas com cobertura", hint: "Seguro · confiança ↑", result: "O sistema se adapta ao seu tempo em vez de exigir um salto cego.", effect: { leadership: 5, morale: 4, minutes: 3 } },
    { label: "Recusar a mudança", hint: "Segurança ↑ · técnico ↓", result: "Você protege a área e perde pontos na prancheta.", effect: { morale: 4, minutes: -5 } },
  ]},
  { id: "keeper-cross-collision", icon: "+", tag: "ÁREA", title: "A bola alta vem no meio de oito jogadores", description: "Seu zagueiro grita para você sair, o centroavante fecha o caminho e não existe decisão sem contato.", needsPositionZone: "gol", oneTime: true, choices: [
    { label: "Sair de soco sem hesitar", hint: "Liderança ↑ · lesão ↑", result: "A bola sai da área e você termina a jogada sentindo o ombro.", effect: { leadership: 7, reputation: 5, fitness: -7, injuryRisk: 7 } },
    { label: "Confiar no zagueiro", hint: "Físico preservado · risco", result: "Você fica na linha e entrega a primeira decisão ao defensor.", effect: { fitness: 5, morale: -2, titleBoost: -2 } },
  ]},
  { id: "keeper-rain-and-mud", icon: "☂", tag: "CLIMA", title: "A chuva transforma cada chute em uma armadilha", description: "A bola quica antes, escapa depois e o gramado acumula água exatamente na pequena área.", needsPositionZone: "gol", oneTime: true, choices: [
    { label: "Rebater tudo para os lados", hint: "Seguro · técnica ↑", result: "Você abandona a beleza e controla cada segunda bola.", effect: { ovr: 1, adaptation: 5, morale: 3 } },
    { label: "Tentar encaixar para acelerar", hint: "46% · contra-ataque ou falha", result: "Você tenta transformar a chuva numa arma ofensiva.", effect: {}, luck: { chance: 46, successText: "A defesa firme vira reposição rápida e assistência no outro lado.", failureText: "A bola molhada escapa e sobra limpa para o adversário marcar.", successEffect: { reputation: 10, titleBoost: 9, morale: 9 }, failureEffect: { reputation: -9, titleBoost: -9, morale: -12 } } },
  ]},
  { id: "keeper-long-assist", icon: "↗", tag: "REPOSIÇÃO", title: "Seu atacante pede a bola antes de o rival se reorganizar", description: "Uma reposição perfeita pode atravessar o campo e transformar uma defesa em assistência.", needsPositionZone: "gol", oneTime: true, choices: [
    { label: "Lançar de primeira", hint: "48% · lance histórico", result: "Você arma o braço e procura o espaço atrás da última linha.", effect: {}, luck: { chance: 48, successText: "A bola cai no peito do atacante e o gol começa nas suas luvas.", failureText: "O lançamento sai curto e devolve a pressão ao seu time.", successEffect: { ovr: 2, reputation: 10, fans: 7, titleBoost: 8 }, failureEffect: { morale: -5, titleBoost: -4 } } },
    { label: "Prender e reorganizar o time", hint: "Controle ↑ · seguro", result: "Você desacelera o jogo e devolve ordem à equipe.", effect: { leadership: 5, morale: 4 } },
  ]},
  { id: "keeper-defensive-meeting", icon: "▦", tag: "LIDERANÇA", title: "A defesa quer uma reunião sem o treinador", description: "Os zagueiros pedem que você lidere uma conversa para acertar coberturas, bolas paradas e responsabilidades.", needsPositionZone: "gol", minAge: 22, oneTime: true, choices: [
    { label: "Comandar a reunião", hint: "Liderança ↑↑ · título ↑", result: "A linha defensiva sai da sala falando a mesma língua.", effect: { leadership: 11, titleBoost: 7, reputation: 5 } },
    { label: "Levar o preparador junto", hint: "Tática ↑ · grupo neutro", result: "A conversa ganha método sem deixar de ser direta.", effect: { potential: 2, adaptation: 6 } },
    { label: "Dizer que isso cabe ao capitão", hint: "Pressão ↓ · liderança ↓", result: "Você preserva seu foco individual e abre mão de comandar a linha.", effect: { morale: 5, leadership: -5 } },
  ]},
  { id: "keeper-transfer-starting-promise", icon: "⇄", tag: "MERCADO", title: "Um clube menor oferece a camisa 1 sem disputa", description: "O projeto tem menos prestígio, mas garante titularidade e constrói o time começando por você.", needsPositionZone: "gol", minAge: 20, maxAge: 30, needsSquadRoles: ["promessa", "reserva", "rotacao"], oneTime: true, choices: [
    { label: "Aceitar ser protagonista", hint: "Transferência · minutos ↑↑", result: "Você troca estrutura por uma meta que finalmente será só sua.", effect: { transfer: true, minutes: 14, morale: 8 } },
    { label: "Ficar e vencer a concorrência", hint: "Potencial ↑ · risco de banco", result: "Você escolhe o caminho mais difícil sem garantia de recompensa.", effect: { potential: 2, minutes: -3, morale: 4 } },
  ]},
  { id: "keeper-broken-finger", icon: "✚", tag: "DEPARTAMENTO MÉDICO", title: "Um dedo inchado muda cada defesa", description: "O exame mostra uma pequena fratura. É possível jogar protegido, mas nenhuma bola chegará sem dor.", needsPositionZone: "gol", needsLowFitness: true, oneTime: true, choices: [
    { label: "Parar até consolidar", hint: "Recuperação segura · minutos ↓", result: "Você volta fechando a mão sem medo.", effect: { fitness: 18, minutes: -7, morale: -2 } },
    { label: "Jogar com proteção", hint: "Minutos ↑ · recaída ↑", result: "Cada defesa vira também uma negociação com a dor.", effect: { minutes: 7, fitness: -5, injuryRisk: 14, reputation: 5 } },
  ]},
  { id: "keeper-national-number-one", icon: "SEL", tag: "SELEÇÃO", title: "A camisa 1 da Seleção está sem dono", description: "A comissão testa três goleiros antes do torneio e cada amistoso pode definir a hierarquia por anos.", needsPositionZone: "gol", needsNationalMain: true, minOvr: 78, oneTime: true, choices: [
    { label: "Pedir a responsabilidade", hint: "Seleção ↑↑ · pressão ↑", result: "Você chega ao treino se comportando como titular antes do anúncio.", effect: { nationalBoost: 16, nationalCall: true, reputation: 9, morale: -3 } },
    { label: "Competir sem alimentar manchetes", hint: "Seguro · grupo ↑", result: "A serenidade agrada quem decide a escalação.", effect: { nationalBoost: 10, nationalCall: true, leadership: 6, morale: 5 } },
  ]},
  { id: "keeper-shootout-for-country", icon: "★", tag: "SELEÇÃO", title: "O país inteiro espera uma defesa", description: "O mata-mata da Seleção chega aos pênaltis. Do círculo central, seus companheiros parecem muito distantes.", needsPositionZone: "gol", needsNationalMain: true, minOvr: 80, oneTime: true, rareChance: 0.22, choices: [
    { label: "Escolher um canto antes", hint: "44% · herói nacional", result: "Você assume que convicção vale mais que reação.", effect: {}, luck: { chance: 44, successText: "A mão alcança a cobrança decisiva e sua imagem atravessa o país.", failureText: "A bola vai no outro canto e o silêncio nacional acompanha sua caminhada.", successEffect: { nationalTitleBoost: 25, reputation: 22, fans: 18, morale: 16 }, failureEffect: { nationalTitleBoost: -17, reputation: -9, morale: -16 } } },
    { label: "Esperar o movimento do batedor", hint: "Título ↑ · reflexo", result: "Você estica o duelo até o último instante possível.", effect: { nationalTitleBoost: 13, morale: 5, leadership: 5 } },
  ]},
  { id: "keeper-record-clean-sheets", icon: "∞", tag: "RECORDE", title: "O recorde de jogos sem sofrer está a uma partida", description: "O clube inteiro conhece o número. A imprensa conta minutos; você tenta não contar nada.", needsPositionZone: "gol", minOvr: 80, oneTime: true, choices: [
    { label: "Abraçar o recorde", hint: "Reputação ↑↑ · pressão", result: "Você pede que a defesa trate a partida como uma final.", effect: { reputation: 13, titleBoost: 7, morale: -4 } },
    { label: "Proibir o assunto no vestiário", hint: "Moral ↑ · liderança", result: "O número desaparece das conversas até o apito final.", effect: { morale: 8, leadership: 6 } },
  ]},
  { id: "keeper-last-minute-corner", icon: "90+", tag: "LOUCURA", title: "Seu time precisa de um gol e sobra uma última cobrança", description: "O treinador olha para você e aponta para a área adversária. Até o goleiro vai subir.", needsPositionZone: "gol", minOvr: 72, oneTime: true, rareChance: 0.12, choices: [
    { label: "Subir para tentar o impossível", hint: "18% · gol de goleiro", result: "Você abandona a própria meta e corre para a história.", effect: {}, luck: { chance: 18, successText: "A bola sobra, você finaliza e marca o gol que será repetido para sempre.", failureText: "O rival afasta e quase marca do meio-campo no gol vazio.", successEffect: { reputation: 24, fans: 22, morale: 20, titleBoost: 18, ovr: 2 }, failureEffect: { titleBoost: -7, morale: -5 } } },
    { label: "Ficar protegendo o empate", hint: "Seguro · liderança ↑", result: "Você aceita que sobreviver também pode valer uma temporada.", effect: { leadership: 5, titleBoost: 2 } },
  ]},
  { id: "keeper-captain-from-goal", icon: "C", tag: "CAPITANIA", title: "A faixa pode terminar no seu braço", description: "O treinador acredita que a melhor visão do time está atrás de todos e cogita fazer de você capitão.", needsPositionZone: "gol", minAge: 27, minOvr: 79, oneTime: true, choices: [
    { label: "Aceitar e comandar de trás", hint: "Capitão · liderança ↑↑", result: "Sua voz passa a abrir cada jogo antes de suas mãos.", effect: { clubCaptain: true, leadership: 13, reputation: 8 } },
    { label: "Indicar um jogador de linha", hint: "Grupo ↑ · pressão ↓", result: "A recusa surpreende e aumenta o respeito do elenco.", effect: { leadership: 7, morale: 8 } },
  ]},
  { id: "keeper-veteran-gloves", icon: "⌛", tag: "LONGEVIDADE", title: "Os reflexos mudam; o posicionamento precisa vencer", description: "Você chega antes às bolas porque já não quer depender de chegar mais rápido do que elas.", needsPositionZone: "gol", minAge: 32, oneTime: true, choices: [
    { label: "Reconstruir o jogo pela leitura", hint: "Longevidade ↑ · potencial estável", result: "Menos explosão, mais antecipação: sua carreira ganha outra forma.", effect: { potential: 2, adaptation: 10, fitness: 6 } },
    { label: "Treinar reflexo até o limite", hint: "OVR ↑ · desgaste ↑", result: "Você desafia o tempo em sessões cada vez mais curtas e intensas.", effect: { ovr: 1, fitness: -10, injuryRisk: 6 } },
  ]},
  { id: "keeper-successor-arrives", icon: "Ⅱ", tag: "LEGADO", title: "O clube contratou quem dizem ser seu sucessor", description: "Um goleiro jovem chega apresentado como futuro da posição. A primeira foto coloca vocês dois lado a lado.", needsPositionZone: "gol", minAge: 31, oneTime: true, choices: [
    { label: "Virar mentor sem entregar a vaga", hint: "Legado ↑ · liderança ↑↑", result: "Você ensina tudo, menos como tirar você do time.", effect: { leadership: 14, reputation: 8, morale: 5 } },
    { label: "Pedir saída antes do banco", hint: "Transferência · protagonismo", result: "Você prefere escolher o último gol que defenderá.", effect: { transfer: true, morale: 4, reputation: -2 } },
    { label: "Tratar como rival direto", hint: "OVR ↑ · grupo ↓", result: "O nível dos treinos sobe e o clima entre vocês desaparece.", effect: { ovr: 1, morale: -7, minutes: 5 } },
  ]},
  { id: "keeper-future-coach", icon: "▣", tag: "FUTURO", title: "O preparador oferece um lugar do outro lado do treino", description: "Ele acredita que sua leitura do jogo pode formar goleiros quando as luvas deixarem de ser rotina.", needsPositionZone: "gol", minAge: 34, oneTime: true, choices: [
    { label: "Começar a estudar a posição", hint: "Legado ↑↑ · liderança ↑", result: "Você passa a registrar exercícios, movimentos e pequenas correções que antes fazia por instinto.", effect: { leadership: 12, reputation: 8, adaptation: 7 } },
    { label: "Ainda quero apenas jogar", hint: "Moral ↑ · foco no presente", result: "O futuro pode esperar: cada treino continua terminando com você debaixo da trave.", effect: { morale: 10, fitness: 4, minutes: 3 } },
  ]},
];
