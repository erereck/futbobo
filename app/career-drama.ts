import type { GameEvent } from "./game-data";

export const CAREER_DRAMA_EVENTS: GameEvent[] = [
  // Evento deliberadamente raríssimo: uma única ocorrência força um exílio esportivo.
  { id: "drama-drug-scandal", icon: "!", tag: "IMPRENSA", title: "O flagrante que destruiu a temporada", description: "Você foi flagrado com drogas em uma festa. O clube rompe o vínculo, os patrocinadores somem e as grandes ligas fecham as portas por enquanto.", minAge: 18, oneTime: true, rareChance: 0.004, choices: [
    { label: "Cumprir a punição e recomeçar", hint: "Saída obrigatória · liga alternativa", result: "Sem recurso possível, você aceita a suspensão. Para continuar jogando, será obrigado a reconstruir a carreira longe dos grandes centros.", effect: { forcedAlternativeTransfer: true, transfer: true, reputation: -28, morale: -18, fans: -24, fitness: -8, discipline: -22 } },
  ]},
  // ---- IDADE ----
  { id: "drama-teenage-spotlight", icon: "★", tag: "IDADE", title: "Muito jovem para tanto holofote", description: "Aos dezessete anos, sua estreia precoce virou manchete antes mesmo da sua primeira lesão de crescimento.", maxAge: 18, oneTime: true, choices: [
    { label: "Abraçar a exposição", hint: "Fama ↑ · pressão ↑", result: "Você aceita que o Brasil inteiro já sabe seu nome.", effect: { reputation: 8, fans: 6, morale: -3 } },
    { label: "Pedir para blindar sua rotina", hint: "Desenvolvimento ↑ · exposição ↓", result: "O clube reduz suas entrevistas e protege sua formação.", effect: { potential: 2, morale: 4 } },
  ]},
  { id: "drama-compared-to-a-legend", icon: "◆", tag: "IDADE", title: "Chamam você de novo craque antes da hora", description: "Um vídeo seu viraliza ao lado de um ídolo aposentado e a comparação pesa mais do que qualquer treino.", maxAge: 20, oneTime: true, choices: [
    { label: "Usar a comparação como combustível", hint: "44% · consagração precoce ou colapso de expectativa", result: "Você decide correr atrás do apelido em vez de fugir dele.", effect: {}, luck: { chance: 44, successText: "Cada jogo parece confirmar o apelido e a torcida compra a ideia com você.", failureText: "A pressão da comparação pesa mais do que a idade aguenta e o rendimento cai.", successEffect: { ovr: 2, reputation: 12, fans: 10, morale: 6 }, failureEffect: { ovr: -2, morale: -14, reputation: -8, fitness: -6 } } },
    { label: "Pedir para ninguém repetir o apelido", hint: "Moral ↑ · menos exposição", result: "Você prefere construir sua própria história, sem atalhos emprestados.", effect: { morale: 5, potential: 1 } },
  ]},
  { id: "drama-thirty-something-crossroads", icon: "⌛", tag: "IDADE", title: "A encruzilhada dos trinta e poucos", description: "O corpo ainda responde, mas o próximo contrato já é perguntado com outro tom pelos jornalistas.", minAge: 32, choices: [
    { label: "Assinar por menos tempo e mais minutos", hint: "Minutos ↑ · segurança ↓", result: "Você troca estabilidade por protagonismo enquanto ainda dá tempo.", effect: { minutes: 8, contractYears: 1, morale: 4 } },
    { label: "Buscar um contrato longo e estável", hint: "Segurança ↑ · minutos ↓", result: "Você prioriza previsibilidade para a reta final da carreira.", effect: { contractYears: 3, salaryBoost: 6, minutes: -4 } },
  ]},
  { id: "drama-mid-thirties-body-check", icon: "+", tag: "IDADE", title: "O exame físico anual pesa diferente", description: "Os números do departamento médico não mentem: a recuperação não é mais a mesma de cinco anos atrás.", minAge: 33, choices: [
    { label: "Redesenhar a rotina de treino", hint: "Fitness ↑ · OVR estável", result: "Você troca volume por qualidade nos treinos.", effect: { fitness: 12, potential: -1 } },
    { label: "Ignorar os números e seguir igual", hint: "OVR ↑ · risco de lesão", result: "Você aposta que a experiência compensa o desgaste.", effect: { ovr: 1, injuryRisk: 8, fitness: -6 } },
  ]},
  // ---- POSIÇÃO ----
  { id: "drama-keeper-shootout-nerves", icon: "🧤", tag: "POSIÇÃO", title: "A disputa de pênaltis é só sua", description: "O jogo empatado termina nas penalidades e todos os olhos do estádio se voltam para o seu gol.", needsPositionZone: "gol", minOvr: 66, choices: [
    { label: "Estudar os batedores antes da hora", hint: "Título ↑↑ · frieza", result: "Você já sabia para qual lado cada um chutaria.", effect: { titleBoost: 14, reputation: 8, leadership: 5 } },
    { label: "Confiar só no instinto", hint: "45% · herói ou vilão", result: "Você decide voar sem nenhuma anotação na manga.", effect: {}, luck: { chance: 45, successText: "Você defende a decisiva e vira o nome da noite.", failureText: "As defesas não vêm e a cobrança sobra para o goleiro.", successEffect: { reputation: 16, titleBoost: 18, fans: 14 }, failureEffect: { reputation: -10, titleBoost: -14, morale: -12 } } },
  ]},
  { id: "drama-keeper-distribution-demand", icon: "🧤", tag: "POSIÇÃO", title: "O treinador quer seus pés, não só suas mãos", description: "A nova comissão técnica exige que você comece as jogadas com passes curtos saindo da própria área.", needsPositionZone: "gol", choices: [
    { label: "Aceitar o novo estilo", hint: "Potencial ↑ · risco de erro", result: "Você aprende a jogar mais perto do adversário do que gostaria.", effect: { potential: 2, injuryRisk: 2, adaptation: 4 } },
    { label: "Insistir no jogo tradicional", hint: "Segurança ↑ · minutos ↓", result: "Você prefere afastar a bola a arriscar um erro bobo.", effect: { minutes: -4, morale: 3 } },
  ]},
  { id: "drama-back-line-communication", icon: "◆", tag: "POSIÇÃO", title: "A zaga precisa de uma voz de comando", description: "Sem um líder claro na defesa, os erros de posicionamento se repetem toda rodada.", needsPositionZone: "defesa", minAge: 23, choices: [
    { label: "Assumir a organização da linha", hint: "Liderança ↑↑ · pressão", result: "Você passa a gritar instruções antes mesmo da bola chegar perto.", effect: { leadership: 10, reputation: 5, morale: -2 } },
    { label: "Deixar o capitão resolver", hint: "Seguro", result: "Você prefere manter o foco só na sua marcação.", effect: { morale: 2 } },
  ]},
  { id: "drama-fullback-overlap-gamble", icon: "↗", tag: "POSIÇÃO", title: "Subir ao ataque pode custar caro na volta", description: "Seu treinador libera as sobreposições, mas isso deixa buracos enormes nas suas costas.", needsPositionZone: "defesa", choices: [
    { label: "Atacar sem medo do contra-ataque", hint: "40% · assistência de ouro ou vacilo", result: "Você decide viver no campo de ataque também.", effect: {}, luck: { chance: 40, successText: "Sua subida vira assistência decisiva e a torcida aprende seu nome pelo ataque.", failureText: "O espaço nas suas costas vira gol do adversário e a cobrança recai sobre você.", successEffect: { reputation: 10, titleBoost: 8, fans: 8 }, failureEffect: { reputation: -8, titleBoost: -8, morale: -10 } } },
    { label: "Segurar a posição com disciplina", hint: "Seguro · menos protagonismo", result: "Você escolhe ser sólido em vez de espetacular.", effect: { leadership: 4, morale: 3 } },
  ]},
  { id: "drama-engine-room-overload", icon: "⬡", tag: "POSIÇÃO", title: "Você cobre o campo inteiro sozinho", description: "Sem outro volante de confiança, o técnico pede para você cobrir dois setores ao mesmo tempo.", needsPositionZone: "meio", choices: [
    { label: "Aceitar o desgaste extra", hint: "Minutos ↑ · físico ↓", result: "Você vira o pulmão do time, mesmo sentindo o preço disso.", effect: { minutes: 6, fitness: -10, leadership: 4 } },
    { label: "Pedir um parceiro de função", hint: "Físico ↑ · minutos ↓", result: "A diretoria demora, mas ouve o pedido para a próxima janela.", effect: { fitness: 8, minutes: -3 } },
  ]},
  { id: "drama-playmaker-final-ball", icon: "✦", tag: "POSIÇÃO", title: "O último passe da temporada", description: "Faltam segundos, seu time precisa de um gol e a bola só passa pelos seus pés.", needsPositionZone: "meio", minOvr: 72, choices: [
    { label: "Arriscar o passe entre linhas", hint: "38% · assistência histórica ou perda de bola", result: "Você enxerga o espaço que ninguém mais viu.", effect: {}, luck: { chance: 38, successText: "O passe corta a defesa inteira e nasce um gol que vira lenda local.", failureText: "A bola é interceptada e o contra-ataque quase custa a partida.", successEffect: { reputation: 14, titleBoost: 16, fans: 12, morale: 8 }, failureEffect: { reputation: -9, titleBoost: -12, morale: -10 } } },
    { label: "Girar o jogo para o lado mais seguro", hint: "Seguro · sem risco", result: "Você escolhe manter a posse a qualquer custo.", effect: { leadership: 3, morale: 2 } },
  ]},
  { id: "drama-winger-isolation", icon: "⚡", tag: "POSIÇÃO", title: "Um contra um decide o jogo", description: "O lateral rival já tomou dois amarelos, mas ainda está em campo bem na sua frente.", needsPositionZone: "ataque", minOvr: 68, choices: [
    { label: "Ir sempre para cima dele", hint: "Reputação ↑ · físico ↓", result: "Você decide explorar a fraqueza até o fim do jogo.", effect: { reputation: 6, fitness: -6, titleBoost: 6 } },
    { label: "Trocar de lado com um companheiro", hint: "Tático · seguro", result: "Você entende que o jogo às vezes pede um ajuste inteligente.", effect: { leadership: 4, potential: 1 } },
  ]},
  { id: "drama-striker-goal-drought", icon: "◎", tag: "POSIÇÃO", title: "Cinco jogos sem balançar a rede", description: "As chances aparecem, mas a bola simplesmente não quer entrar e a torcida já começa a notar.", needsPositionZone: "ataque", choices: [
    { label: "Simplificar a finalização", hint: "OVR ↑ · confiança recupera aos poucos", result: "Você troca o capricho pelo básico bem feito.", effect: { ovr: 1, morale: 4 } },
    { label: "Buscar o gol de qualquer jeito", hint: "42% · fim do jejum ou mais pressão", result: "Você decide forçar cada finalização até a rede balançar.", effect: {}, luck: { chance: 42, successText: "O jejum acaba com um gol difícil e o alívio parece maior que o próprio placar.", failureText: "As chances se acumulam sem gol e a cobrança da arquibancada cresce.", successEffect: { ovr: 2, reputation: 10, morale: 12, fans: 8 }, failureEffect: { morale: -12, reputation: -6, fans: -6 } } },
  ]},
  // ---- REGIÃO ----
  { id: "drama-south-american-derby-heat", icon: "⚔", tag: "REGIÃO", title: "O calor de um clássico sul-americano", description: "A rivalidade regional transforma qualquer jogo comum em um evento que para o continente inteiro.", needsConfederation: "SOUTH_AMERICA", choices: [
    { label: "Abraçar a intensidade local", hint: "Torcida ↑↑ · físico ↓", result: "Você entende que aqui, cada duelo pesa como uma final.", effect: { fans: 10, fitness: -6, reputation: 5 } },
    { label: "Manter a cabeça fria", hint: "OVR ↑ · seguro", result: "Você prefere deixar o resultado falar mais alto que a provocação.", effect: { ovr: 1, leadership: 3 } },
  ]},
  { id: "drama-south-american-long-bus-rides", icon: "▲", tag: "REGIÃO", title: "Doze horas de ônibus até o próximo jogo", description: "As distâncias continentais viram parte do calendário, e nem todo estádio tem aeroporto por perto.", needsConfederation: "SOUTH_AMERICA", choices: [
    { label: "Usar a viagem para descansar", hint: "Fitness ↑", result: "Você aprende a dormir em qualquer posição de ônibus.", effect: { fitness: 6, morale: 2 } },
    { label: "Estudar vídeo do adversário na estrada", hint: "Potencial ↑ · cansaço", result: "Você chega mais preparado, mesmo mais cansado.", effect: { potential: 1, fitness: -4 } },
  ]},
  { id: "drama-european-tactical-demand", icon: "◫", tag: "REGIÃO", title: "A exigência tática europeia é outro nível", description: "Cada treino cobra posicionamento milimétrico e decisões em menos de um segundo.", needsConfederation: "EUROPE", choices: [
    { label: "Estudar cada detalhe do sistema", hint: "Adaptação ↑↑ · potencial ↑", result: "Você absorve uma exigência que muda sua leitura de jogo para sempre.", effect: { adaptation: 12, potential: 2 } },
    { label: "Confiar na sua base técnica", hint: "OVR ↑ · adaptação lenta", result: "Você aposta no talento individual para compensar o ajuste tático.", effect: { ovr: 1, adaptation: -3 } },
  ]},
  { id: "drama-european-fixture-pileup", icon: "⌛", tag: "REGIÃO", title: "Três competições, uma semana só", description: "O calendário europeu empilha liga, copa nacional e torneio continental na mesma semana.", needsConfederation: "EUROPE", choices: [
    { label: "Jogar todas as partidas no talo", hint: "Minutos ↑↑ · físico ↓↓", result: "Você não abre mão de nenhum minuto disponível.", effect: { minutes: 10, fitness: -16, reputation: 4 } },
    { label: "Pedir rodízio ao departamento médico", hint: "Fitness ↑ · minutos ↓", result: "Você prioriza durar a temporada inteira, não só uma semana.", effect: { fitness: 12, minutes: -6 } },
  ]},
  { id: "drama-north-american-expansion-market", icon: "$", tag: "REGIÃO", title: "A liga cresce mais rápido que qualquer expectativa", description: "Novos investidores e estádios lotados mudam o tom das conversas de contrato na América do Norte.", needsConfederation: "NORTH_AMERICA", minOvr: 68, choices: [
    { label: "Virar rosto da expansão da liga", hint: "Dinheiro ↑↑ · exposição", result: "Sua imagem passa a estampar campanhas de um mercado em crescimento.", effect: { money: 14, reputation: 7, morale: -2 } },
    { label: "Focar só no rendimento em campo", hint: "OVR ↑ · menos exposição", result: "Você deixa o marketing para depois da aposentadoria.", effect: { ovr: 1, potential: 1 } },
  ]},
  { id: "drama-north-american-travel-distances", icon: "✈", tag: "REGIÃO", title: "Fusos horários viram parte da escalação", description: "Voos de mais de cinco horas entre praças diferentes desgastam o elenco tanto quanto qualquer adversário.", needsConfederation: "NORTH_AMERICA", choices: [
    { label: "Criar uma rotina rígida de sono", hint: "Fitness ↑", result: "Você trata o descanso como parte do treino.", effect: { fitness: 9, morale: 3 } },
    { label: "Levar leve e improvisar", hint: "Moral ↑ · físico ↓", result: "Você prefere se divertir com a viagem do que sofrer com ela.", effect: { morale: 6, fitness: -5 } },
  ]},
  // ---- ELENCO ----
  { id: "drama-promising-prospect-impatience", icon: "★", tag: "ELENCO", title: "A base cobra pressa demais de você", description: "Como maior promessa da categoria, cada treino errado vira assunto de torcedor nas redes.", needsSquadRoles: ["promessa"], choices: [
    { label: "Ignorar a pressão externa", hint: "Potencial ↑", result: "Você aprende cedo a filtrar o barulho de fora.", effect: { potential: 2, morale: 3 } },
    { label: "Responder às críticas nas redes", hint: "Exposição ↑ · risco", result: "Você decide não deixar barato quem duvida de você.", effect: { reputation: 3, morale: -4 } },
  ]},
  { id: "drama-reserve-role-frustration", icon: "▰", tag: "ELENCO", title: "Reserva de novo, sem nem entrar no segundo tempo", description: "Mais uma rodada no banco enquanto o titular da sua posição segue intocável.", needsSquadRoles: ["reserva"], choices: [
    { label: "Pedir empréstimo para jogar de verdade", hint: "Minutos ↑↑ · nova casa", result: "Você prefere ser protagonista em outro lugar a esperar aqui.", effect: { transfer: true, loan: true, minutes: 10, morale: 4 } },
    { label: "Continuar treinando no limite", hint: "48% · chance vira reserva permanente ou oportunidade real", result: "Você aposta que a paciência ainda vai virar minutos.", effect: {}, luck: { chance: 48, successText: "Uma lesão do titular abre a porta e você não desperdiça a chance.", failureText: "A oportunidade não vem e o rótulo de eterno reserva começa a colar.", successEffect: { ovr: 2, minutes: 12, reputation: 8, morale: 8 }, failureEffect: { morale: -10, reputation: -3, minutes: -2 } } },
  ]},
  { id: "drama-rotation-role-acceptance", icon: "↔", tag: "ELENCO", title: "Nem titular, nem reserva: você é peça de rodízio", description: "O técnico usa você em jogos alternados, conforme o desgaste do time pede.", needsSquadRoles: ["rotacao"], choices: [
    { label: "Aceitar o papel e render sempre que jogar", hint: "Confiança do treinador ↑", result: "Você vira o jogador que nunca deixa a média cair.", effect: { leadership: 4, reputation: 3 } },
    { label: "Cobrar um lugar fixo na equipe", hint: "Pressão ↑ · risco", result: "Você decide que já é hora de parar de dividir minutos.", effect: { morale: 3, minutes: 4, reputation: -2 } },
  ]},
  { id: "drama-starter-consistency-demand", icon: "▣", tag: "ELENCO", title: "Ser titular também é desconfiar de si mesmo", description: "Depois de meses como titular absoluto, uma sequência de atuações medianas assusta a torcida.", needsSquadRoles: ["titular"], choices: [
    { label: "Voltar ao básico que te trouxe até aqui", hint: "OVR ↑ · seguro", result: "Você troca ousadia por eficiência até recuperar o ritmo.", effect: { ovr: 1, morale: 4 } },
    { label: "Assumir mais responsabilidade ainda", hint: "Título ↑ · risco de piorar", result: "Você decide que a resposta para a crise é pedir ainda mais bola.", effect: { titleBoost: 8, fitness: -6, morale: -2 } },
  ]},
  { id: "drama-star-treatment-envy", icon: "✪", tag: "ELENCO", title: "Ser a estrela do time também gera inimigos internos", description: "Alguns companheiros começam a comentar, baixinho, que todo o holofote fica só com você.", needsSquadRoles: ["estrela"], choices: [
    { label: "Dividir os créditos publicamente", hint: "Grupo ↑ · exposição ↓", result: "Você usa entrevistas para elogiar quem trabalha longe das câmeras.", effect: { leadership: 6, morale: 5, reputation: -1 } },
    { label: "Deixar o campo responder por você", hint: "OVR ↑ · clima segue tenso", result: "Você acredita que atuações grandes calam qualquer ciúme.", effect: { ovr: 1, reputation: 4, morale: -3 } },
  ]},
  // ---- CAPITÃO ----
  { id: "drama-captain-disciplinary-mediation", icon: "C", tag: "CAPITÃO", title: "Dois titulares brigaram no vestiário", description: "Como capitão, cabe a você decidir se o caso vira punição interna ou fica só entre vocês.", needsCaptainRole: "club", choices: [
    { label: "Levar o caso à diretoria", hint: "Disciplina ↑ · grupo ↓", result: "Você prefere resolver com regras claras a deixar o clima se arrastar.", effect: { discipline: 6, morale: -4, leadership: 5 } },
    { label: "Resolver dentro do vestiário", hint: "Grupo ↑ · risco de repetir", result: "Você aposta que uma conversa franca resolve o que o regulamento não resolveria melhor.", effect: { morale: 6, leadership: 7 } },
  ]},
  { id: "drama-captain-lonely-decision", icon: "C", tag: "CAPITÃO", title: "A braçadeira pesa mais numa crise", description: "Com o time brigando contra o rebaixamento, todos esperam que você fale antes do próximo jogo.", needsCaptainRole: "club", minAge: 25, choices: [
    { label: "Prometer publicamente a reação", hint: "Pressão ↑↑ · liderança ↑", result: "Você coloca a própria imagem na linha antes da bola rolar.", effect: { leadership: 10, reputation: 4, morale: -3 } },
    { label: "Falar só para o grupo, longe das câmeras", hint: "Grupo ↑ · exposição ↓", result: "Você prefere que a resposta apareça dentro de campo, não na imprensa.", effect: { leadership: 8, morale: 5 } },
  ]},
  { id: "drama-national-captain-anthem-weight", icon: "C", tag: "CAPITÃO", title: "O hino nunca pareceu tão alto", description: "Como capitão da Seleção, você entra em campo sabendo que precisa liderar mesmo sem ter todas as respostas.", needsCaptainRole: "national", choices: [
    { label: "Discursar antes da partida decisiva", hint: "34% · discurso histórico ou pressão demais", result: "Você reúne o grupo num círculo antes de qualquer aquecimento.", effect: {}, luck: { chance: 34, successText: "As palavras encaixam perfeitamente e o time entra em campo com outra confiança.", failureText: "O discurso soa forçado e o grupo entra tenso demais para o próprio bem.", successEffect: { nationalTitleBoost: 20, leadership: 14, reputation: 10 }, failureEffect: { nationalTitleBoost: -14, morale: -12, leadership: -4 } } },
    { label: "Liderar apenas pelo exemplo em campo", hint: "Seguro · liderança ↑", result: "Você prefere que suas ações falem mais alto que qualquer discurso.", effect: { leadership: 8, nationalTitleBoost: 6 } },
  ]},
  { id: "drama-captain-press-lightning-rod", icon: "C", tag: "CAPITÃO", title: "Toda pergunta difícil sobra para o capitão", description: "Depois da derrota, a entrevista coletiva parece existir só para cobrar respostas suas.", needsCaptainRole: "any", choices: [
    { label: "Assumir toda a responsabilidade", hint: "Respeito ↑ · moral ↓", result: "Você protege o grupo colocando seu próprio nome na frente da crítica.", effect: { morale: -5, reputation: 8, leadership: 6 } },
    { label: "Distribuir a responsabilidade com o grupo", hint: "Grupo ↑", result: "Você lembra que a braçadeira não te transforma no único culpado.", effect: { leadership: 4, morale: 4 } },
  ]},
  // ---- SELEÇÃO ----
  { id: "drama-national-team-snub-shock", icon: "×", tag: "SELEÇÃO", title: "Seu nome sumiu da lista sem aviso", description: "Depois de temporadas relevantes, a convocação mais recente simplesmente não trouxe seu nome.", needsNational: true, minAge: 24, choices: [
    { label: "Cobrar explicações através da imprensa", hint: "Exposição ↑ · risco", result: "Você decide não deixar o corte passar em silêncio.", effect: { reputation: 3, nationalBoost: -4, morale: -3 } },
    { label: "Responder só dentro de campo", hint: "OVR ↑ · Seleção ↓", result: "Você acredita que atuações grandes falam mais alto que qualquer reclamação.", effect: { ovr: 1, nationalBoost: 3 } },
  ]},
  { id: "drama-friendly-match-doubt", icon: "?", tag: "SELEÇÃO", title: "Um amistoso sem nenhuma pressão real", description: "A convocação veio, mas o jogo sem nada em jogo deixa todo mundo com o pé um pouco atrás.", needsNational: true, choices: [
    { label: "Tratar como se fosse decisivo", hint: "Seleção ↑ · físico ↓", result: "Você decide jogar sério mesmo sem nada valendo oficialmente.", effect: { nationalBoost: 8, fitness: -5, reputation: 3 } },
    { label: "Poupar o corpo para o clube", hint: "Fitness ↑ · Seleção ↓", result: "Você entende o amistoso como uma folga disfarçada.", effect: { fitness: 8, nationalBoost: -3 } },
  ]},
  { id: "drama-veteran-uncapped-frustration", icon: "SEL", tag: "SELEÇÃO", title: "Anos de bom futebol e nenhuma convocação", description: "Você já é referência no seu clube, mas a Seleção nunca ligou — e talvez essa seja sua última chance.", maxAge: 29, minOvr: 76, oneTime: true, choices: [
    { label: "Fazer campanha pública por uma chance", hint: "40% · convocação surpresa ou desgaste desnecessário", result: "Você usa entrevistas para deixar claro que está pronto.", effect: {}, luck: { chance: 40, successText: "A comissão técnica finalmente reconhece o momento e a convocação enfim chega.", failureText: "A insistência pública soa como reclamação e afasta ainda mais o técnico.", successEffect: { nationalBoost: 18, reputation: 10, nationalCall: true }, failureEffect: { reputation: -8, morale: -10, nationalBoost: -4 } } },
    { label: "Aceitar que talvez nunca chegue", hint: "Moral ↑ · foco no clube", result: "Você decide construir seu legado só com a camisa do clube.", effect: { morale: 5, leadership: 3 } },
  ]},
  // ---- LESÃO ----
  { id: "drama-recurring-muscle-issue", icon: "+", tag: "LESÃO", title: "O mesmo músculo reclama outra vez", description: "É a terceira vez na temporada que a mesma lesão muscular tira você de uma sequência de jogos.", needsLowFitness: true, choices: [
    { label: "Investir num tratamento mais longo e definitivo", hint: "Fitness ↑↑↑ · tempo fora", result: "Você prefere resolver de vez a apagar incêndios toda rodada.", effect: { fitness: 22, minutes: -8, morale: -2 } },
    { label: "Voltar assim que a dor aliviar", hint: "Minutos ↑ · risco de recaída", result: "Você aposta que dessa vez o corpo aguenta.", effect: { minutes: 6, injuryRisk: 14, fitness: -4 } },
  ]},
  { id: "drama-comeback-anxiety", icon: "+", tag: "LESÃO", title: "O medo de voltar a se machucar", description: "Fisicamente liberado, sua cabeça ainda hesita no primeiro contato mais forte do treino.", needsLowFitness: true, minAge: 22, choices: [
    { label: "Procurar apoio psicológico", hint: "Moral ↑↑ · recuperação mental", result: "Você entende que o corpo cura, mas a cabeça também precisa de tratamento.", effect: { morale: 12, fitness: 4 } },
    { label: "Forçar a volta sem falar do medo", hint: "Minutos ↑ · risco emocional", result: "Você decide simplesmente jogar até o medo passar sozinho.", effect: { minutes: 6, morale: -6, injuryRisk: 6 } },
  ]},
  { id: "drama-teammate-injury-guilt", icon: "+", tag: "LESÃO", title: "A dividida que machucou seu companheiro", description: "Um lance seu, sem má intenção nenhuma, tirou um titular do time por meses.", choices: [
    { label: "Visitar e apoiar a recuperação dele", hint: "Grupo ↑↑", result: "Você aparece todo dia no departamento médico ao lado dele.", effect: { morale: 6, leadership: 6 } },
    { label: "Seguir em frente sem se abalar", hint: "OVR ↑ · frieza", result: "Você entende que faz parte do jogo, mesmo doendo por dentro.", effect: { ovr: 1, morale: -3 } },
  ]},
  // ---- IMPRENSA ----
  { id: "drama-leaked-locker-audio", icon: "●", tag: "IMPRENSA", title: "Um áudio do vestiário vazou", description: "Uma gravação privada do intervalo aparece nas redes antes mesmo do apito final.", minAge: 20, choices: [
    { label: "Assumir o tom mais duro do áudio", hint: "Respeito ↑ · exposição", result: "Você admite que a cobrança interna foi real e necessária.", effect: { leadership: 5, reputation: 3, morale: -3 } },
    { label: "Pedir desculpas publicamente", hint: "Moral ↑ · imagem protegida", result: "Você prefere abaixar a temperatura antes que o assunto cresça.", effect: { morale: 3, reputation: -1 } },
  ]},
  { id: "drama-fabricated-quote-scandal", icon: "●", tag: "IMPRENSA", title: "Uma entrevista que você nunca deu", description: "Um site publica falas suas entre aspas que você nunca chegou a dizer perto de nenhum microfone.", minAge: 19, choices: [
    { label: "Processar o veículo", hint: "38% · retratação pública ou processo longo", result: "Você decide não deixar barato uma mentira com seu nome.", effect: { money: -4 }, luck: { chance: 38, successText: "O veículo se retrata publicamente e sua versão vira a história oficial.", failureText: "O processo se arrasta por meses e o desgaste emocional pesa mais que qualquer indenização.", successEffect: { reputation: 12, morale: 6 }, failureEffect: { morale: -10, money: -8, reputation: -3 } } },
    { label: "Ignorar e deixar morrer sozinho", hint: "Moral ↑ · sem desgaste", result: "Você aposta que discutir só daria mais vida à mentira.", effect: { morale: 4 } },
  ]},
  { id: "drama-columnist-personal-vendetta", icon: "●", tag: "IMPRENSA", title: "Um colunista parece ter implicância pessoal com você", description: "Toda semana, o mesmo nome encontra um jeito de criticar até suas atuações mais elogiadas por todo mundo.", minAge: 21, choices: [
    { label: "Convidar o colunista para uma conversa direta", hint: "45% · respeito mútuo ou piora tudo", result: "Você decide encarar o desconforto de frente, sem microfone no meio.", effect: {}, luck: { chance: 45, successText: "A conversa muda o tom das próximas colunas e vocês constroem uma relação profissional.", failureText: "O encontro vira mais um capítulo da história e as críticas ficam ainda mais pessoais.", successEffect: { morale: 8, reputation: 5 }, failureEffect: { morale: -8, reputation: -5 } } },
    { label: "Nunca mais ler nada que ele escreve", hint: "Moral ↑ · sem risco", result: "Você escolhe proteger a própria cabeça ignorando a fonte do desconforto.", effect: { morale: 5 } },
  ]},
  // ---- FAMÍLIA ----
  { id: "drama-partner-career-sacrifice", icon: "⌂", tag: "FAMÍLIA", title: "A carreira dela também importa", description: "Sua parceira recebe uma proposta de trabalho em outra cidade bem no meio da sua temporada mais importante.", minAge: 23, choices: [
    { label: "Apoiar a mudança dela mesmo à distância", hint: "Moral ↑↑ · saudade", result: "Vocês decidem que o amor aguenta um pouco de distância geográfica.", effect: { morale: 10, fitness: -2 } },
    { label: "Pedir para ela adiar os planos", hint: "Foco no futebol ↑ · tensão em casa", result: "Você prioriza a estabilidade da própria temporada.", effect: { fitness: 3, morale: -6 } },
  ]},
  { id: "drama-parent-health-scare", icon: "⌂", tag: "FAMÍLIA", title: "Uma notícia de saúde vinda de casa", description: "O telefone toca durante a concentração: alguém da família precisa de você por perto.", minAge: 20, choices: [
    { label: "Pedir para se ausentar do clube", hint: "Moral ↑↑ · minutos ↓", result: "Você não pensa duas vezes antes de pegar a estrada.", effect: { morale: 10, minutes: -6 } },
    { label: "Ficar e ajudar à distância", hint: "Minutos ↑ · culpa", result: "Você resolve o que consegue por telefone e segue treinando.", effect: { minutes: 4, morale: -8 } },
  ]},
  { id: "drama-first-child-arrival", icon: "⌂", tag: "FAMÍLIA", title: "Seu primeiro filho nasceu em plena temporada", description: "A alegria mais importante da sua vida chega bem no meio de uma sequência de jogos decisivos.", minAge: 22, oneTime: true, choices: [
    { label: "Tirar a semana inteira de licença", hint: "Moral ↑↑↑ · minutos ↓", result: "Você não abre mão desses primeiros dias por nada no mundo.", effect: { morale: 16, minutes: -8, fitness: 4 } },
    { label: "Voltar a treinar em dois dias", hint: "Minutos ↑ · moral ↓", result: "Você tenta equilibrar as duas coisas mais importantes da sua vida.", effect: { minutes: 4, morale: -4 } },
  ]},
  // ---- EMPRESÁRIO ----
  { id: "drama-agent-conflict-of-interest", icon: "§", tag: "EMPRESÁRIO", title: "Seu empresário também representa um rival direto", description: "Você descobre que ele fecha negócios para outro jogador da sua mesma posição, no mesmo clube.", minAge: 21, choices: [
    { label: "Confrontar e trocar de empresário", hint: "42% · liberdade recompensadora ou recomeço difícil", result: "Você decide não dividir representação com quem disputa sua vaga.", effect: { money: -3 }, luck: { chance: 42, successText: "A troca abre portas com um empresário totalmente dedicado à sua carreira.", failureText: "O novo empresário demora para engrenar e algumas oportunidades escapam nesse meio-tempo.", successEffect: { reputation: 9, money: 6, morale: 6 }, failureEffect: { money: -8, reputation: -4, morale: -6 } } },
    { label: "Manter por conveniência contratual", hint: "Estável · desconfiança", result: "Você prefere não mexer em time que, no papel, ainda está ganhando.", effect: { morale: -3 } },
  ]},
  { id: "drama-agent-sudden-dismissal", icon: "§", tag: "EMPRESÁRIO", title: "Seu empresário te larga sem aviso", description: "Depois de anos juntos, ele simplesmente para de responder mensagens quando um contrato maior aparece para outro cliente.", minAge: 22, choices: [
    { label: "Assinar rápido com o primeiro nome disponível", hint: "Mercado ↑ · risco de mau negócio", result: "Você não quer ficar sem representação numa janela importante.", effect: { transfer: true, reputation: -2 } },
    { label: "Pesquisar com calma antes de decidir", hint: "Moral ↑ · demora", result: "Você prefere perder tempo a errar de novo na escolha.", effect: { morale: 5, leadership: 2 } },
  ]},
  { id: "drama-image-rights-dispute", icon: "$", tag: "EMPRESÁRIO", title: "Uma briga sobre quem lucra com sua imagem", description: "Clube e empresário discutem publicamente quem tem direito a uma fatia maior dos seus patrocínios.", minOvr: 74, choices: [
    { label: "Renegociar os termos você mesmo", hint: "Dinheiro ↑ · desgaste", result: "Você entra pessoalmente na mesa de negociação.", effect: { money: 10, morale: -3, leadership: 4 } },
    { label: "Deixar os advogados resolverem", hint: "Seguro · dinheiro médio", result: "Você prefere focar no campo e deixar o escritório cuidar do resto.", effect: { money: 4, morale: 2 } },
  ]},
  // ---- FIM DE CARREIRA ----
  { id: "drama-farewell-tour-planning", icon: "⌛", tag: "APOSENTADORIA", title: "Planejar uma despedida de estádio em estádio", description: "Com o fim próximo, clubes rivais cogitam homenagens especiais na sua última visita.", minAge: 36, choices: [
    { label: "Aceitar as homenagens de todos os lados", hint: "Reputação ↑↑ · emoção", result: "Você decide guardar essas lembranças para sempre, mesmo com as rivalidades.", effect: { reputation: 14, morale: 10, fans: 8 } },
    { label: "Pedir para não fazer alarde", hint: "Foco no jogo ↑", result: "Você prefere jogar até o fim sem se despedir alto demais.", effect: { fitness: 4, morale: 4 } },
  ]},
  { id: "drama-testimonial-match-invite", icon: "⌛", tag: "APOSENTADORIA", title: "O convite para o seu jogo de despedida", description: "O clube que revelou você propõe um amistoso beneficente em sua homenagem antes da aposentadoria.", minAge: 37, oneTime: true, choices: [
    { label: "Aceitar e convidar ex-companheiros", hint: "Legado ↑↑↑", result: "O estádio lotado reúne gerações inteiras da sua carreira numa noite só.", effect: { reputation: 18, morale: 14, fans: 12 } },
    { label: "Recusar por preferir uma saída discreta", hint: "Privacidade ↑", result: "Você escolhe terminar sem holofote extra sobre o próprio nome.", effect: { morale: 6 } },
  ]},
  { id: "drama-post-career-coaching-offer", icon: "◇", tag: "APOSENTADORIA", title: "Uma proposta para virar treinador", description: "A diretoria já pensa no seu futuro fora de campo antes mesmo de você pendurar as chuteiras.", minAge: 34, choices: [
    { label: "Começar a estudar para o novo papel", hint: "Legado ↑ · foco dividido", result: "Você passa a acompanhar reuniões táticas nos dias de folga.", effect: { leadership: 6, reputation: 4, fitness: -2 } },
    { label: "Focar cem por cento em jogar ainda", hint: "OVR ↑ · futuro em aberto", result: "Você decide que ainda tem jogo bom demais para pensar em outra coisa.", effect: { ovr: 1, morale: 3 } },
  ]},
  { id: "drama-forced-retirement-decision", icon: "+", tag: "APOSENTADORIA", title: "O corpo dá o aviso final", description: "Depois de uma lesão séria, o departamento médico deixa claro que seguir jogando é uma escolha, não mais uma garantia.", minAge: 33, needsLowFitness: true, choices: [
    { label: "Encerrar a carreira agora", hint: "Encerra a carreira · reputação ↑", result: "Você prefere sair pelas próprias pernas a esperar um fim mais duro.", effect: { retire: true, reputation: 10, morale: 6 } },
    { label: "Arriscar mais uma temporada", hint: "Minutos ↑ · risco altíssimo", result: "Você decide que ainda não está pronto para dizer adeus.", effect: { minutes: 4, injuryRisk: 16, fitness: -10 } },
  ]},
];
