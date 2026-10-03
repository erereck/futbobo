import type { GameEvent } from "./game-data";

/** Decisões de jogo com efeitos curtos: entram no evento anual, sem criar cliques extras. */
export const CAREER_DRAMA_MATCHDAY_EVENTS: GameEvent[] = [
  {
    id: "matchday-cup-away-end", icon: "▣", tag: "COPA DO BRASIL", oneTime: true, needsDomestic: true, minAge: 18,
    title: "Uma viagem longa para um estádio pequeno",
    description: "O ônibus chega de madrugada. Do lado de fora, a torcida da casa já canta seu nome com uma rima nada gentil; no túnel, dá para ouvir cada palavra.",
    choices: [
      { label: "Responder jogando, sem olhar para a arquibancada", hint: "Foco ↑ · energia ↓", result: "Você entra concentrado e só levanta a cabeça depois do primeiro lance difícil.", effect: { discipline: 4, fitness: -3, morale: 3 } },
      { label: "Cumprimentar as crianças perto do túnel", hint: "Torcida ↑ · tensão ↓", result: "As vaias continuam, mas um grupo de crianças passa o jogo inteiro torcendo por você em segredo.", effect: { fans: 5, morale: 3, reputation: 2 } },
      { label: "Usar o barulho para acender o elenco", hint: "Liderança ↑ · pressão ↑", result: "Você reúne o grupo antes da entrada. A conversa é curta; todo mundo sai com o mesmo olhar.", effect: { leadership: 5, morale: 2, fitness: -2 } },
    ],
  },
  {
    id: "matchday-rain-bounces", icon: "☂", tag: "CAMPO PESADO", oneTime: true, minAge: 17,
    title: "A bola para na poça antes da área",
    description: "A chuva muda o ritmo da partida. Um passe simples morre na água, e o banco pede que você ajuste o jeito de jogar antes do próximo lance.",
    choices: [
      { label: "Simplificar cada saída de bola", hint: "Disciplina ↑ · brilho ↓", result: "Você escolhe a linha segura e evita que o campo decida por vocês.", effect: { discipline: 4, leadership: 2, reputation: -1 } },
      { label: "Buscar a jogada improvável mesmo assim", hint: "45% · lance memorável ou erro", result: "Você testa o gramado de novo, agora com a torcida prendendo a respiração.", effect: {}, luck: { chance: 45, successText: "A bola salta na hora certa e seu lance vira a imagem da rodada.", failureText: "A poça vence outra vez. Você ri primeiro, antes que o estádio inteiro ria.", successEffect: { reputation: 6, fans: 4, morale: 3 }, failureEffect: { reputation: -3, morale: -2 } } },
      { label: "Orientar o companheiro mais jovem", hint: "Vestiário ↑ · liderança ↑", result: "Ele muda o posicionamento e agradece no intervalo, ainda com o uniforme coberto de lama.", effect: { leadership: 5, morale: 4 } },
    ],
  },
  {
    id: "matchday-penalty-queue", icon: "◎", tag: "PÊNALTI", oneTime: true, minAge: 19,
    title: "Dois companheiros pegam a bola ao mesmo tempo",
    description: "O cobrador oficial está no banco. O capitão olha para você, o atacante olha para a marca da cal e o estádio percebe a dúvida.",
    choices: [
      { label: "Entregar a bola ao atacante", hint: "Grupo ↑ · protagonismo ↓", result: "Você resolve a disputa em um segundo. Depois, é o primeiro a correr para cumprimentá-lo.", effect: { morale: 4, leadership: 4, reputation: -1 } },
      { label: "Assumir a cobrança com calma", hint: "46% · confiança ou cobrança", result: "Você coloca a bola no ponto e espera a confusão diminuir.", effect: {}, luck: { chance: 46, successText: "A cobrança é limpa. O atacante chega para o abraço antes de qualquer um.", failureText: "O goleiro escolhe o lado certo. A discussão volta no vestiário.", successEffect: { reputation: 6, morale: 5, leadership: 3 }, failureEffect: { morale: -6, reputation: -4 } } },
      { label: "Chamar o capitão para decidir", hint: "Disciplina ↑ · clima preservado", result: "A hierarquia fala mais alto e o lance segue sem discussão pública.", effect: { discipline: 4, morale: 2, leadership: 1 } },
    ],
  },
  {
    id: "matchday-bench-voice", icon: "◧", tag: "BANCO", oneTime: true, needsSquadRoles: ["promessa", "reserva", "rotacao"],
    title: "Você enxerga o espaço antes de quem está em campo",
    description: "Do banco, o corredor do lado direito aparece livre toda vez. O auxiliar está perto, mas os titulares podem interpretar seu aviso como cobrança.",
    choices: [
      { label: "Mostrar o espaço ao auxiliar", hint: "Treinador ↑ · grupo estável", result: "Ele repassa a informação na pausa seguinte, sem transformar você no assunto.", effect: { minutes: 3, leadership: 2, discipline: 2 } },
      { label: "Gritar a orientação para o campo", hint: "Presença ↑ · atrito possível", result: "O lateral escuta. Depois da jogada, ele aponta para você com um sorriso pequeno.", effect: { leadership: 4, morale: 2, reputation: 1 } },
      { label: "Guardar a leitura para quando entrar", hint: "Foco ↑ · oportunidade incerta", result: "Você espera seu minuto e já sabe exatamente onde quer receber a primeira bola.", effect: { minutes: 2, fitness: 2, morale: 1 } },
    ],
  },
  {
    id: "matchday-captain-shield", icon: "◆", tag: "CAPITÃO", oneTime: true, needsCaptainRole: "club", minAge: 21,
    title: "Um erro do novato vira assunto no túnel",
    description: "O jovem perde a bola no fim do primeiro tempo. Na volta do intervalo, dois veteranos continuam falando do lance perto dele.",
    choices: [
      { label: "Assumir a responsabilidade na roda", hint: "Liderança ↑ · pressão pessoal ↑", result: "Você corta a conversa, chama a bola para si e devolve ao novato a coragem de pedir jogo.", effect: { leadership: 6, morale: 3, fitness: -2 } },
      { label: "Conversar a sós com o novato", hint: "Grupo ↑ · discreto", result: "Ele escuta, respira e volta para o campo sem olhar para o banco.", effect: { leadership: 4, morale: 5 } },
      { label: "Cobrar o time inteiro pelo passe anterior", hint: "Disciplina ↑ · tensão ↑", result: "A análise muda: o erro não começou no último toque. Todos têm algo para ajustar.", effect: { discipline: 5, leadership: 3, morale: -2 } },
    ],
  },
  {
    id: "matchday-empty-stand", icon: "▥", tag: "TORCIDA", oneTime: true, minAge: 18,
    title: "A câmera encontra um torcedor sozinho na arquibancada",
    description: "Depois de uma semana difícil, só uma pequena faixa de visitantes atravessou o país. Um deles ainda canta quando o resto do estádio já foi embora.",
    choices: [
      { label: "Ir até a grade depois do apito", hint: "Torcida ↑ · recuperação ↓", result: "Você passa alguns minutos ouvindo a viagem que ele fez para estar ali.", effect: { fans: 6, morale: 4, fitness: -2 } },
      { label: "Pedir que o elenco vá junto", hint: "Liderança ↑ · torcida ↑", result: "O grupo inteiro se aproxima. A foto vira lembrança melhor que o resultado.", effect: { fans: 5, leadership: 4, morale: 3 } },
      { label: "Mandar sua camisa pelo roupeiro", hint: "Gesto discreto · descanso ↑", result: "O torcedor descobre a surpresa na saída e liga para alguém antes mesmo de pegar a estrada.", effect: { fans: 3, lifeBalance: 2, fitness: 2 } },
    ],
  },
  {
    id: "matchday-return-from-injury", icon: "↗", tag: "VOLTA A CAMPO", oneTime: true, needsLowFitness: true, minAge: 18,
    title: "O banco chama você antes do previsto",
    description: "Seu corpo ainda pede cuidado, mas o placar aperta. O preparador diz que você pode entrar por poucos minutos; a decisão sobre o ritmo será sua.",
    choices: [
      { label: "Pedir minutos controlados", hint: "Físico ↑ · minutos limitados", result: "Você entra sabendo exatamente quando vai sair. Cada corrida tem propósito.", effect: { fitness: 5, discipline: 3, minutes: -2 } },
      { label: "Entrar e jogar no limite", hint: "Minutos ↑ · risco físico ↑", result: "O primeiro pique confirma que a vontade voltou antes da resistência.", effect: { minutes: 5, morale: 4, fitness: -6, injuryRisk: 3 } },
      { label: "Ceder a vaga a quem está inteiro", hint: "Grupo ↑ · paciência", result: "Você aplaude da linha lateral e termina a noite um passo mais perto de voltar sem pressa.", effect: { fitness: 7, morale: 2, leadership: 2, minutes: -3 } },
    ],
  },
  {
    id: "matchday-derby-tunnel", icon: "⚑", tag: "CLÁSSICO", oneTime: true, needsRivalry: true, minAge: 18,
    title: "Um rival espera você no túnel",
    description: "Antes de subir ao gramado, ele lembra um lance da última partida. Há câmeras, mas a conversa acontece perto demais para que alguém escute.",
    choices: [
      { label: "Responder com um aperto de mão", hint: "Respeito ↑ · cabeça fria", result: "Vocês se encaram por um instante e seguem para o campo. O jogo pode falar sozinho.", effect: { rivalRespect: 5, discipline: 3, morale: 2 } },
      { label: "Devolver a provocação em uma frase", hint: "Moral ↑ · respeito ↓", result: "Ele sorri. Agora os dois sabem que o primeiro duelo vai valer mais que uma bola dividida.", effect: { morale: 4, fans: 3, rivalRespect: -3 } },
      { label: "Passar direto e chamar o elenco", hint: "Liderança ↑ · foco coletivo", result: "Sua resposta é a última roda do time antes da entrada em campo.", effect: { leadership: 4, discipline: 2, fitness: -2 } },
    ],
  },
  {
    id: "matchday-offside-silence", icon: "◇", tag: "GOL ANULADO", oneTime: true, minAge: 18,
    title: "A bandeira sobe depois que você já comemorou",
    description: "A rede balança, a torcida explode e só então você vê o auxiliar parado. A revisão demora; seus companheiros começam a discutir com o árbitro.",
    choices: [
      { label: "Reunir o time para a próxima bola", hint: "Liderança ↑ · foco ↑", result: "Você tira o grupo da área do árbitro. A partida recomeça com o time inteiro ligado.", effect: { leadership: 4, discipline: 3, morale: 2 } },
      { label: "Pedir uma explicação sem cercar o árbitro", hint: "Disciplina ↑ · torcida ↓", result: "A resposta não muda o lance, mas evita que alguém do seu time receba cartão pela discussão.", effect: { discipline: 5, morale: 1, fans: -1 } },
      { label: "Transformar a frustração em pressão", hint: "Moral ↑ · fôlego ↓", result: "Você pede a bola no reinício e força mais um ataque antes de a torcida se sentar.", effect: { morale: 5, fans: 2, fitness: -3 } },
    ],
  },
  {
    id: "matchday-keeper-final-corner", icon: "▥", tag: "GOLEIRO", oneTime: true, needsPositionZone: "gol", minAge: 18,
    title: "Último escanteio, você ouve seu nome na área",
    description: "O placar está empatado e o banco rival manda todo mundo subir. Seu zagueiro pergunta se você vai sair no cruzamento ou ficar na linha.",
    choices: [
      { label: "Sair para socar a bola", hint: "47% · corte decisivo ou rebote", result: "Você toma impulso no meio da multidão.", effect: {}, luck: { chance: 47, successText: "Seu soco atravessa a área e o apito encerra a partida.", failureText: "A bola escapa para a entrada da área; você precisa de uma segunda defesa.", successEffect: { reputation: 5, morale: 4, leadership: 2 }, failureEffect: { morale: -3, fitness: -2 } } },
      { label: "Ficar na linha e ordenar a marcação", hint: "Liderança ↑ · disciplina ↑", result: "Você aponta cada homem livre e espera a bola chegar onde consegue reagir.", effect: { leadership: 4, discipline: 4, fitness: 1 } },
      { label: "Pedir um defensor no primeiro poste", hint: "Segurança ↑ · menos protagonismo", result: "O cruzamento encontra o companheiro que você posicionou segundos antes.", effect: { discipline: 3, morale: 2, reputation: -1 } },
    ],
  },
  {
    id: "matchday-altitude-break", icon: "△", tag: "VIAGEM", oneTime: true, needsConfederation: "SOUTH_AMERICA", minAge: 18,
    title: "O ar acaba antes do intervalo",
    description: "Na viagem aos Andes, o time começa forte, mas a respiração pesa cedo. O preparador pede que você escolha onde guardar energia.",
    choices: [
      { label: "Diminuir as arrancadas e manter a posição", hint: "Físico ↑ · disciplina ↑", result: "Você fecha os espaços e chega inteiro aos minutos finais.", effect: { fitness: 4, discipline: 4, reputation: -1 } },
      { label: "Pedir trocas mais cedo ao banco", hint: "Grupo ↑ · liderança ↑", result: "A comissão ajusta a rotação antes que o desgaste vire erro.", effect: { leadership: 4, morale: 3, minutes: -2 } },
      { label: "Jogar no limite até sair", hint: "Torcida ↑ · risco físico ↑", result: "Cada corrida parece duas, mas a torcida visitante reconhece o esforço.", effect: { fans: 4, morale: 3, fitness: -5, injuryRisk: 2 } },
    ],
  },
  {
    id: "matchday-cup-underdog", icon: "✦", tag: "COPA DO BRASIL", oneTime: true, needsDomestic: true, minAge: 19,
    title: "A cidade inteira veio ver o azarão",
    description: "O adversário joga sua maior partida do ano em casa. O vestiário de vocês é apertado, mas o estádio está cheio desde cedo.",
    choices: [
      { label: "Tratar o jogo como final", hint: "Disciplina ↑ · pressão ↑", result: "Ninguém subestima o rival. Você entra em campo com o plano decorado.", effect: { discipline: 5, fitness: -2, morale: 2 } },
      { label: "Deixar o rival viver a festa antes do apito", hint: "Respeito ↑ · cabeça fria", result: "Você troca camisas no túnel e, quando a bola rola, só pensa no jogo.", effect: { morale: 4, leadership: 2, fans: 2 } },
      { label: "Propor pressão desde a saída", hint: "44% · início dominante ou desgaste", result: "O time aceita o risco e avança suas linhas nos primeiros minutos.", effect: {}, luck: { chance: 44, successText: "A pressão rende uma chance antes que a torcida local se acomode.", failureText: "O rival escapa da primeira pressão e vocês gastam energia para voltar.", successEffect: { reputation: 5, morale: 3, fans: 2 }, failureEffect: { fitness: -4, morale: -2 } } },
    ],
  },
];
