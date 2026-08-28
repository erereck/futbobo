import type { GameEvent } from "./game-data";

/**
 * Reescritas preservam os IDs antigos para não quebrar saves.
 * O catálogo novo privilegia situações específicas e consequências narrativas.
 */
const CAREER_DRAMA_EVENT_OVERRIDES: Record<string, GameEvent> = {
  "drama-billie-eilish-photo": {
    id: "drama-billie-eilish-photo", icon: "◎", tag: "ENCONTRO IMPROVÁVEL", title: "Uma celebridade mundial pede uma foto com você",
    description: "Nos bastidores de uma premiação, uma celebridade que você só conhecia pela tela reconhece você primeiro. A assessoria dela já está com o celular aberto e pergunta se pode postar a foto nos dois perfis.",
    minAge: 18, oneTime: true, rareChance: 0.003, choices: [
      { label: "Postar sem transformar em campanha", hint: "+10 milhões de seguidores · exposição mundial", result: "A foto sobe sem texto publicitário, sem collab combinada e sem explicação. Isso basta: em poucas horas, gente que nunca viu um jogo seu começa a descobrir quem você é.", effect: { followers: 10_000_000, socialSentiment: 14, mediaRelation: 8, reputation: 5 } },
      { label: "Guardar a foto só para vocês", hint: "Equilíbrio pessoal ↑ · nenhum viral", result: "A conversa continua longe das câmeras. No dia seguinte, ninguém sabe que vocês se encontraram — e, pela primeira vez em muito tempo, isso parece um luxo.", effect: { lifeBalance: 9, morale: 7 } },
    ],
  },
  "drama-teenage-spotlight": {
    id: "drama-teenage-spotlight", icon: "★", tag: "IDADE", title: "Seu nome ficou grande antes de você terminar de crescer",
    description: "Você ainda precisa pedir autorização para algumas coisas fora do futebol, mas já existe gente discutindo seu valor de mercado, sua vida amorosa e o que você deveria fazer com os próximos dez anos da carreira.",
    maxAge: 18, oneTime: true, choices: [
      { label: "Aprender a conviver com o barulho", hint: "Fama ↑ · pressão ↑", result: "Você não tenta fingir que a exposição não existe. Aprende quais entrevistas valem a pena, quais notificações ficam desligadas e quais opiniões não chegam até você.", effect: { reputation: 8, fans: 6, morale: -3, mediaRelation: 3 } },
      { label: "Pedir ao clube para fechar a porta", hint: "Desenvolvimento ↑ · exposição ↓", result: "Entrevistas caem da agenda, o celular fica com a assessoria em dias de jogo e a rotina volta a parecer, por alguns meses, a de um jogador em formação.", effect: { potential: 2, morale: 5, mediaRelation: -2 } },
    ],
  },
  "drama-south-american-derby-heat": {
    id: "drama-south-american-derby-heat", icon: "⚔", tag: "REGIÃO", title: "O clássico começou no túnel",
    description: "Antes de a bola rolar, um adversário passa por você e repete uma frase que você deu numa entrevista meses atrás. No gramado, papel picado cobre a linha lateral e o estádio parece estar esperando a primeira faísca.",
    needsConfederation: "SOUTH_AMERICA", choices: [
      { label: "Responder só quando a bola estiver rolando", hint: "Frieza ↑ · OVR ↑", result: "Você não devolve uma palavra. Depois do primeiro desarme limpo, olha para ele por meio segundo — o suficiente para os dois entenderem.", effect: { ovr: 1, leadership: 4, morale: 3 } },
      { label: "Entrar no jogo psicológico também", hint: "Torcida ↑↑ · disciplina em risco", result: "Cada dividida ganha uma conversa curta, cada lateral vira disputa territorial. A arquibancada compra sua postura, mas o árbitro passa a acompanhar vocês dois de perto.", effect: { fans: 11, reputation: 5, discipline: -5, fitness: -5 } },
    ],
  },
  "drama-european-tactical-demand": {
    id: "drama-european-tactical-demand", icon: "◫", tag: "REGIÃO", title: "O técnico pausa o vídeo por causa de dois passos seus",
    description: "Na análise da manhã, ele congela um lance em que você está pouco mais de dois metros fora do corredor de pressão. O adversário nem criou perigo — para a comissão, esse não é o ponto.",
    needsConfederation: "EUROPE", choices: [
      { label: "Pedir para rever a jogada quadro a quadro", hint: "Adaptação ↑↑ · potencial ↑", result: "A reunião que deveria durar vinte minutos vira quase uma hora. Você sai sabendo exatamente por que aqueles dois passos mudavam o resto do campo.", effect: { adaptation: 12, potential: 2, morale: -1 } },
      { label: "Manter sua leitura mais intuitiva", hint: "OVR ↑ · adaptação lenta", result: "Você entende a cobrança, mas não quer jogar olhando para linhas imaginárias o tempo inteiro. A técnica continua resolvendo muita coisa — só não todas.", effect: { ovr: 1, adaptation: -3 } },
    ],
  },
  "drama-promising-prospect-impatience": {
    id: "drama-promising-prospect-impatience", icon: "★", tag: "ELENCO", title: "Um treino ruim virou compilação antes do jantar",
    description: "Alguém cortou quarenta segundos dos seus piores lances no treino aberto: domínio escapando, passe torto, finalização para fora. À noite, o vídeo já tem música dramática e gente decretando que você foi 'superestimado pela base'.",
    needsSquadRoles: ["promessa"], choices: [
      { label: "Não assistir uma segunda vez", hint: "Potencial ↑ · cabeça protegida", result: "Você fecha o vídeo, silencia o próprio nome por uma semana e pede os clipes completos à comissão. No treino seguinte, trabalha em cima do que realmente aconteceu.", effect: { potential: 2, morale: 4, lifeBalance: 3 } },
      { label: "Responder com o melhor lance do treino seguinte", hint: "Exposição ↑ · pressão ↑", result: "Você não cita ninguém. Só posta um lance limpo do dia seguinte com a hora marcada no canto. A mensagem é entendida sem precisar de legenda.", effect: { reputation: 5, followers: 35_000, morale: -2, socialSentiment: 3 } },
    ],
  },
  "drama-rotation-role-acceptance": {
    id: "drama-rotation-role-acceptance", icon: "↔", tag: "ELENCO", title: "Você descobriu sua função pelo quadro do refeitório",
    description: "O clube começou a usar ímãs coloridos para planejar carga e escalação. Seu nome passa três semanas alternando entre 'titular', 'controle de minutos' e 'impacto no segundo tempo' sem ninguém explicar pessoalmente o plano.",
    needsSquadRoles: ["rotacao"], choices: [
      { label: "Pedir uma conversa e exigir um plano claro", hint: "Minutos ↑ · liderança ↑", result: "Você não pede vaga garantida; pede critérios. A conversa é desconfortável, mas termina com funções e expectativas que finalmente cabem numa frase.", effect: { minutes: 5, leadership: 5, morale: 2 } },
      { label: "Usar a incerteza a seu favor", hint: "Adaptação ↑↑ · protagonismo menor", result: "Você começa a preparar cada semana para dois cenários diferentes e vira o jogador que o técnico consegue encaixar sem aviso.", effect: { adaptation: 8, reputation: 3, morale: 2 } },
    ],
  },
  "drama-friendly-match-doubt": {
    id: "drama-friendly-match-doubt", icon: "?", tag: "SELEÇÃO", title: "O amistoso fica a três dias da volta ao clube",
    description: "A Seleção atravessa fusos para um jogo sem pontos em disputa. Seu clube joga pouco depois, e a mensagem do preparador físico chega antes mesmo do embarque: 'se puder, não force noventa'.",
    needsNational: true, choices: [
      { label: "Jogar como se a vaga dependesse disso", hint: "Seleção ↑ · físico ↓", result: "Quando entra em campo, você esquece o calendário do clube. O amistoso não vale troféu, mas a comissão percebe quem tratou a camisa como se valesse.", effect: { nationalBoost: 9, fitness: -7, reputation: 3 } },
      { label: "Controlar o ritmo e voltar inteiro", hint: "Fitness ↑ · Seleção ↓", result: "Você não se esconde, mas escolhe quando acelerar. A decisão agrada quem paga seu salário e deixa a comissão da Seleção com uma pequena interrogação.", effect: { fitness: 9, nationalBoost: -3, morale: 2 } },
    ],
  },
  "drama-star-treatment-envy": {
    id: "drama-star-treatment-envy", icon: "✪", tag: "ELENCO", title: "Seu lugar no ônibus virou assunto no vestiário",
    description: "Você ganhou o banco da frente por causa de recuperação física e compromissos com patrocinador. Em poucos dias, o privilégio virou símbolo de tudo que alguns companheiros acham que a estrela do time recebe diferente.",
    needsSquadRoles: ["estrela"], choices: [
      { label: "Abrir mão do lugar antes da próxima viagem", hint: "Grupo ↑ · conforto ↓", result: "Você aparece no fundo do ônibus sem fazer discurso. O gesto não resolve todo o ciúme, mas mata a piada que já estava ficando séria.", effect: { leadership: 7, morale: 4, fitness: -2, reputation: -1 } },
      { label: "Explicar por que o tratamento é diferente", hint: "Respeito ↑ · risco de soar defensivo", result: "Você mostra o cronograma, as sessões de recuperação e os compromissos que vêm junto com o status. Nem todo mundo muda de opinião, mas a conversa deixa de acontecer pelas costas.", effect: { leadership: 5, reputation: 3, morale: -2 } },
    ],
  },
};

export const CAREER_DRAMA_EXTRA_EVENTS: GameEvent[] = [
  {
    id: "drama-training-ground-fight", icon: "!", tag: "VESTIÁRIO", title: "O treino terminou com vocês dois no chão",
    description: "Uma entrada atrasada vira empurrão. O empurrão vira soco. Quando três companheiros conseguem separar vocês, já existem três versões diferentes sobre quem começou — e uma câmera de celular apontada da arquibancada.", minAge: 19, oneTime: true, choices: [
      { label: "Assumir minha parte antes que contem por mim", hint: "Disciplina ↑ · reputação ↓", result: "Você entra na sala do treinador antes de ser chamado. Não inventa desculpa para a entrada nem para o soco. A punição vem, mas ninguém precisa arrancar a verdade de você.", effect: { discipline: 7, reputation: -3, morale: -4, leadership: 5 } },
      { label: "Resolver com ele e manter a diretoria fora disso", hint: "52% · pacto de vestiário ou vídeo vazado", result: "Vocês apertam as mãos longe da comissão e combinam que o assunto morreu ali. A partir daí, tudo depende de o assunto realmente ter ficado ali.", effect: {}, luck: { chance: 52, successText: "Ninguém de fora vê o vídeo. No treino seguinte, vocês marcam um ao outro como se nada tivesse acontecido — e a relação, estranhamente, fica mais honesta.", failureText: "O vídeo aparece sem contexto nas redes. A diretoria descobre a briga pelo mesmo clipe que a torcida, e o problema deixa de ser só o soco.", successEffect: { morale: 9, leadership: 4, rivalRespect: 5 }, failureEffect: { reputation: -10, morale: -9, discipline: -8, mediaRelation: -6, socialSentiment: -7 } } },
    ],
  },
  {
    id: "drama-famous-celebrity-wants-you", icon: "★", tag: "VIDA PESSOAL", title: "Uma celebridade mundial está insistindo em você",
    description: "As mensagens começaram como piada e viraram convites reais. A assessoria dela já sabe em qual hotel seu time está. Só existe um detalhe impossível de tratar como nota de rodapé: você já está namorando.", minAge: 18, minOvr: 76, oneTime: true, rareChance: 0.008, choices: [
      { label: "Terminar meu namoro e aceitar o convite", hint: "47% · romance de capa ou desastre público", result: "Você encerra o relacionamento antes de responder à celebridade. A notícia escapa quase ao mesmo tempo que a primeira foto dos dois.", effect: { followers: 250_000 }, luck: { chance: 47, successText: "A química existe fora das mensagens. O casal vira assunto mundial sem parecer montado, e você atravessa uma fase pessoal estranhamente leve apesar de todas as câmeras.", failureText: "A aproximação dura menos que a repercussão. Sua ex fala, a celebridade se afasta e a internet continua discutindo uma relação que já acabou.", successEffect: { followers: 1_700_000, socialSentiment: 10, morale: 11, mediaRelation: 5, lifeBalance: 4, reputation: 4 }, failureEffect: { followers: 900_000, socialSentiment: -10, morale: -16, lifeBalance: -12, reputation: -5 } } },
      { label: "Bloquear a celebridade e continuar meu namoro", hint: "56% · gesto elogiado ou história distorcida", result: "Você bloqueia o contato sem transformar fidelidade em anúncio público. O problema é que a outra ponta da conversa ainda tem capturas de tela.", effect: { lifeBalance: 4 }, luck: { chance: 56, successText: "As mensagens vazam e mostram exatamente o que aconteceu. O bloqueio vira prova de lealdade, sua namorada acha graça do caos e sua imagem cresce por um motivo que você nunca planejou.", failureText: "Vaza só a versão em que você parece ter tratado a celebridade com desprezo. Você preserva o namoro, perde simpatia de parte do público e, ironicamente, ganha seguidores mesmo assim.", successEffect: { followers: 780_000, morale: 10, reputation: 6, socialSentiment: 12, lifeBalance: 5 }, failureEffect: { followers: 460_000, morale: -7, socialSentiment: -9, mediaRelation: -5, reputation: -2 } } },
    ],
  },
  {
    id: "drama-ovr-roulette", icon: "±", tag: "TREINO", title: "Um preparador quer desmontar seu jogo e montar de novo",
    description: "O plano dura seis semanas e mexe em quase tudo: postura ao correr, passada, tempo de reação e primeiro toque. Ele jura que você tem hábitos que limitam seu teto. Também admite, sem vender milagre, que trocar automatismos no meio da carreira pode dar muito errado.", minAge: 20, maxAge: 31, oneTime: true, choices: [
      { label: "Girar a roleta", hint: "50% · +3 OVR ou -3 OVR", result: "Você aceita reaprender movimentos que fazia sem pensar. Por semanas, até dominar uma bola simples parece exigir atenção consciente.", effect: {}, luck: { chance: 50, successText: "O corpo entende a mudança de uma vez. A nova mecânica não só corrige vícios: ela abre soluções que você simplesmente não tinha antes.", failureText: "Os novos movimentos nunca ficam naturais. Na tentativa de substituir antigos automatismos, você perde justamente a fluidez que fazia seu jogo funcionar.", successEffect: { ovr: 3, morale: 8, adaptation: 4 }, failureEffect: { ovr: -3, morale: -10, adaptation: -5 } } },
      { label: "Não mexer no que ainda funciona", hint: "Estabilidade · sem roleta", result: "Você aproveita partes do diagnóstico, mas recusa a reconstrução completa. Talvez exista um teto ali; por enquanto, existe também um jogo que você conhece de olhos fechados.", effect: { morale: 3, adaptation: 2 } },
    ],
  },
  {
    id: "drama-salary-spreadsheet-leak", icon: "$", tag: "VESTIÁRIO", title: "A planilha de salários caiu no grupo errado",
    description: "Um funcionário envia no grupo do elenco uma planilha que deveria estar com a diretoria. Em trinta segundos, todo mundo vê salário, bônus, luvas e até quem recebe prêmio por entrar em campo. Quando a mensagem é apagada, já existem capturas de tela.", minAge: 21, oneTime: true, choices: [
      { label: "Usar os números para renegociar agora", hint: "45% · aumento ou rótulo de oportunista", result: "Você marca uma reunião antes que a diretoria consiga fingir que ninguém viu nada.", effect: {}, luck: { chance: 45, successText: "Os valores deixam claro que seu contrato ficou para trás. A diretoria prefere corrigir a distorção a transformar a planilha em crise pública.", failureText: "A diretoria interpreta a cobrança imediata como oportunismo e endurece a conversa. Você sai sabendo mais sobre os salários e menos sobre quando vai ganhar o que queria.", successEffect: { salaryBoost: 9, money: 5, morale: 5 }, failureEffect: { morale: -7, reputation: -3, contractYears: -1 } } },
      { label: "Defender quem descobriu que ganha muito menos", hint: "Liderança ↑↑ · dinheiro pessoal neutro", result: "Em vez de falar do próprio salário, você leva à diretoria os casos que deixaram o vestiário realmente indignado. Alguns companheiros não esquecem isso.", effect: { leadership: 10, morale: 6, reputation: 4 } },
      { label: "Fingir que não abriu o arquivo", hint: "Paz imediata · assunto não desaparece", result: "Você não comenta valores, não manda captura e não entra na discussão. Isso não impede que o café da manhã seguinte pareça uma reunião de contadores.", effect: { lifeBalance: 4, morale: 1 } },
    ],
  },
  {
    id: "drama-jersey-number-pressure", icon: "#", tag: "ELENCO", title: "O novo astro chegou querendo o seu número",
    description: "A contratação ainda nem treinou e o material de anúncio já mostra, em letras pequenas, o número que você usa há anos. Marketing diz que foi 'só um mockup'. O novo companheiro admite que pediu a camisa na negociação.", minAge: 21, minOvr: 72, oneTime: true, choices: [
      { label: "Trocar, mas leiloar minha última camisa com o número", hint: "Caridade ↑↑ · gesto lembrado", result: "Você entrega o número sem pose de mártir e transforma a última camisa oficial daquela fase em leilão beneficente. A história muda de tom antes da apresentação do reforço.", effect: { charity: 12, reputation: 7, leadership: 4, fans: 6 } },
      { label: "Recusar: o número ainda é meu", hint: "48% · respeito ou começo de rivalidade", result: "Você explica pessoalmente que não vai ceder só porque a campanha já foi desenhada.", effect: {}, luck: { chance: 48, successText: "O reforço respeita a resposta, escolhe outro número e até brinca sobre isso na apresentação. A disputa morre antes do primeiro treino.", failureText: "Ele aceita em público e leva para o treino. Pequenas disputas começam a aparecer onde antes haveria apenas competitividade normal.", successEffect: { leadership: 6, rivalRespect: 7, morale: 5 }, failureEffect: { morale: -7, rivalRespect: -8, reputation: 2 } } },
      { label: "Ceder sem transformar em espetáculo", hint: "Grupo ↑ · identidade ↓", result: "Você manda uma mensagem curta, combina a troca e escolhe outro número. A notícia só aparece quando as camisas novas entram no vestiário.", effect: { morale: 3, leadership: 5, fans: -2 } },
    ],
  },
  {
    id: "drama-agent-wrong-group-chat", icon: "§", tag: "EMPRESÁRIO", title: "Seu empresário mandou o plano de saída no grupo do clube",
    description: "A mensagem tinha tudo: três clubes citados, o salário que ele pretende pedir e uma frase particularmente ruim sobre a diretoria. O grupo em que ele enviou inclui dois dirigentes.", minAge: 20, oneTime: true, choices: [
      { label: "Assumir que uma saída realmente está na mesa", hint: "Mercado ↑ · relação com clube ↓", result: "Você não tenta convencer ninguém de que os nomes apareceram por acaso. Diz que está ouvindo o mercado e que isso deveria ter sido tratado de forma privada.", effect: { transfer: true, reputation: 4, morale: -4, mediaRelation: -2 } },
      { label: "Dizer que era só um cenário de negociação", hint: "43% · versão aceita ou desculpa pior", result: "Você tenta separar planejamento de decisão final. Funciona apenas se a diretoria quiser muito acreditar.", effect: {}, luck: { chance: 43, successText: "A diretoria aceita a explicação, cobra seu empresário em particular e o episódio morre antes de chegar à imprensa.", failureText: "Uma captura da mensagem chega a um jornalista. A tentativa de minimizar vira parte da matéria e faz o vazamento parecer ainda mais calculado.", successEffect: { morale: 5, mediaRelation: 2 }, failureEffect: { reputation: -8, mediaRelation: -8, morale: -9, fans: -4 } } },
      { label: "Demitir o empresário no mesmo dia", hint: "Controle ↑ · negociação recomeça", result: "Você entende que o erro não foi discutir alternativas; foi perder completamente o controle sobre uma conversa que podia mudar sua carreira.", effect: { leadership: 5, morale: 4, money: -4, transfer: true } },
    ],
  },
  {
    id: "drama-old-nightlife-photo", icon: "●", tag: "IMPRENSA", title: "Uma foto real das quatro da manhã reaparece na semana da final",
    description: "A imagem é verdadeira: você saindo de uma casa noturna às 4h07. O detalhe que a postagem omite é que a foto tem quatro meses e foi tirada durante uma folga. A legenda diz apenas: 'é assim que ele prepara a decisão'.", minAge: 18, oneTime: true, choices: [
      { label: "Publicar a data original e nada mais", hint: "Imprensa ↑ · crise esvaziada", result: "Você posta os metadados da foto, a data no calendário e uma única frase: 'quatro meses atrás'. O espaço para discussão fica bem menor.", effect: { mediaRelation: 7, reputation: 5, morale: 3 } },
      { label: "Entrar na piada", hint: "52% · resposta genial ou assunto renovado", result: "Você publica uma foto indo dormir cedo e escreve que a preparação evoluiu bastante desde aquela noite.", effect: {}, luck: { chance: 52, successText: "A resposta mata a manchete e vira meme a seu favor. Até jornalistas que espalharam a foto corrigem a data.", failureText: "A piada dá mais alcance à imagem original. Muita gente vê a foto sem nunca chegar à explicação.", successEffect: { followers: 190_000, socialSentiment: 10, morale: 6, mediaRelation: 3 }, failureEffect: { followers: 120_000, socialSentiment: -7, morale: -6, mediaRelation: -5 } } },
      { label: "Não dar um segundo de atenção", hint: "Foco ↑ · narrativa fora do seu controle", result: "Você treina normalmente e deixa o clube responder se quiser. A história perde força, mas não porque você a corrigiu.", effect: { fitness: 3, lifeBalance: 4, mediaRelation: -2 } },
    ],
  },
  {
    id: "drama-secret-training-with-rival", icon: "⚔", tag: "RIVALIDADE", title: "Pegaram você treinando com a estrela do maior rival",
    description: "Vocês usam o mesmo preparador particular nas férias e dividiram o campo por conveniência. Uma foto de longe corta o treinador da imagem e parece mostrar uma sessão privada entre dois jogadores que deveriam se odiar.", minAge: 20, needsRivalry: true, oneTime: true, choices: [
      { label: "Explicar exatamente por que estávamos juntos", hint: "Respeito ↑ · mistério ↓", result: "Você conta a versão menos cinematográfica e mais verdadeira: mesmo preparador, mesmo horário, mesmo gramado.", effect: { rivalRespect: 8, mediaRelation: 5, reputation: 3 } },
      { label: "Transformar a próxima sessão em ação beneficente", hint: "Caridade ↑↑ · rivalidade ganha outro tom", result: "Se já vão fotografar, vocês decidem abrir um treino para crianças dos dois lados da rivalidade. As camisas continuam diferentes; o campo, por uma tarde, não.", effect: { charity: 11, fans: 6, rivalRespect: 10, reputation: 6 } },
      { label: "Não explicar amizade nem inimizade", hint: "Foco ↑ · torcidas especulam", result: "Você deixa a foto existir sem entregar uma narrativa pronta. A especulação dura alguns dias e morre quando a temporada começa.", effect: { fitness: 4, morale: 2, socialSentiment: -2 } },
    ],
  },
  {
    id: "drama-deepfake-voice-note", icon: "!", tag: "IMPRENSA", title: "Um áudio perfeito da sua voz está circulando — e você nunca disse aquilo",
    description: "O arquivo tem sua voz, sua cadência e até uma risada no final. Nele, você chama o treinador de ultrapassado e dois companheiros de acomodados. A perícia do clube encontra sinais de manipulação; a internet encontra o botão de compartilhar.", minAge: 19, oneTime: true, choices: [
      { label: "Abrir uma live curta e negar com a minha própria voz", hint: "Público ↑ · exposição ↑", result: "Você fala por menos de dois minutos, sem discurso de assessoria, e termina reproduzindo lado a lado um trecho verdadeiro e o falso.", effect: { followers: 110_000, mediaRelation: 7, reputation: 5, socialSentiment: 5 } },
      { label: "Deixar o clube e a perícia resolverem", hint: "Controle ↑ · resposta mais lenta", result: "Você evita transformar um arquivo falso em debate diário. O laudo demora mais que um post, mas chega com detalhes que não cabem numa manchete.", effect: { lifeBalance: 6, morale: 4, mediaRelation: 4 } },
      { label: "Exigir punição pública de quem publicou primeiro", hint: "41% · retratação forte ou guerra prolongada", result: "Você mira no veículo que apresentou o áudio como verdadeiro e pede uma resposta à altura da acusação.", effect: {}, luck: { chance: 41, successText: "O veículo admite que não verificou o arquivo, publica retratação em destaque e transforma o caso num exemplo de como não cobrir conteúdo sintético.", failureText: "A disputa vira uma guerra de versões e dá semanas extras de circulação ao áudio. Mesmo provado falso, ele continua associado ao seu nome.", successEffect: { reputation: 11, mediaRelation: 5, morale: 7 }, failureEffect: { mediaRelation: -10, morale: -9, socialSentiment: -6 } } },
    ],
  },
  {
    id: "drama-club-announces-transfer-by-mistake", icon: "⇄", tag: "MERCADO", title: "O clube publicou sua despedida por engano",
    description: "Durante noventa segundos, o perfil oficial exibe uma arte em preto e branco agradecendo 'por todos os anos'. Você não foi vendido. A postagem some, mas já foi salva por metade da torcida.", minAge: 20, oneTime: true, choices: [
      { label: "Responder: 'eu também fiquei sabendo agora'", hint: "Humor ↑ · seguidores ↑", result: "A frase vira o comentário mais compartilhado do dia e obriga o clube a explicar o erro sem linguagem corporativa.", effect: { followers: 180_000, socialSentiment: 9, morale: 5, mediaRelation: 4 } },
      { label: "Usar o erro para pedir uma saída de verdade", hint: "Transferência ↑ · relação com clube ↓", result: "Se alguém já tinha a arte pronta, você quer saber por quê. A reunião termina falando menos de social media e mais do seu futuro.", effect: { transfer: true, reputation: 3, morale: -3 } },
      { label: "Aceitar a desculpa e não alimentar a história", hint: "Grupo ↑ · crise curta", result: "O responsável pela postagem te liga pessoalmente, admite o erro de programação e você escolhe não transformar um clique errado numa ruptura real.", effect: { leadership: 4, morale: 3, mediaRelation: 2 } },
    ],
  },
  {
    id: "drama-penalty-ball-standoff", icon: "◎", tag: "VESTIÁRIO", title: "Vocês dois seguram a bola para bater o mesmo pênalti",
    description: "O batedor oficial quer cobrar. Você também. Por alguns segundos constrangedores, os dois ficam literalmente com as mãos na bola enquanto o estádio percebe que existe uma discussão.", needsPositionZone: "ataque", minOvr: 70, oneTime: true, choices: [
      { label: "Não soltar a bola e bater", hint: "48% · herói ou crise de ego", result: "Você assume a cobrança na frente de todo mundo. Depois disso, o pênalti deixa de valer apenas um gol.", effect: {}, luck: { chance: 48, successText: "A bola entra. Você comemora sem provocar o companheiro, mas a imagem dos dois disputando a cobrança vira parte da narrativa da vitória.", failureText: "Você perde. O companheiro não precisa dizer nada: a câmera encontra o rosto dele imediatamente.", successEffect: { reputation: 10, fans: 8, morale: 8, rivalRespect: -2 }, failureEffect: { reputation: -10, morale: -13, leadership: -6, fans: -5 } } },
      { label: "Entregar a bola antes de piorar", hint: "Liderança ↑ · ego engolido", result: "Você solta a bola, dá dois tapinhas no ombro do cobrador e sai da área. A discussão termina antes de virar motim em campo.", effect: { leadership: 7, morale: -2, reputation: 2 } },
    ],
  },
  {
    id: "drama-halftime-whiteboard", icon: "▤", tag: "COMISSÃO TÉCNICA", title: "Seu erro virou a aula inteira do intervalo",
    description: "O técnico congela uma imagem do primeiro tempo e passa quase dez minutos desenhando setas ao redor de você. Ninguém mais aparece no quadro. O jogo ainda está acontecendo.", minAge: 19, oneTime: true, choices: [
      { label: "Ouvir até o fim e pedir o vídeo depois", hint: "Adaptação ↑↑ · moral ↓", result: "Você segura a irritação, anota mentalmente cada correção e, depois do jogo, pede a sequência completa para entender onde a jogada começou a morrer.", effect: { adaptation: 9, potential: 1, morale: -4 } },
      { label: "Conversar com o técnico em particular", hint: "Liderança ↑ · relação preservada", result: "Você não discute no intervalo. Mais tarde, explica que aceita a correção, mas não quer que uma leitura coletiva seja resumida a um único rosto.", effect: { leadership: 6, morale: 3, mediaRelation: 1 } },
      { label: "Dizer ali que o erro não foi só meu", hint: "42% · respeito ou confronto", result: "Você aponta duas movimentações anteriores ao lance e pede que a análise comece cinco segundos antes.", effect: {}, luck: { chance: 42, successText: "O técnico volta o vídeo, percebe o encadeamento e muda a correção. O grupo entende que você não estava fugindo da responsabilidade — estava pedindo precisão.", failureText: "O técnico entende como desafio à autoridade em pleno intervalo. A conversa termina, mas o clima não.", successEffect: { leadership: 8, adaptation: 6, morale: 5 }, failureEffect: { minutes: -6, morale: -9, reputation: -3 } } },
    ],
  },
  {
    id: "drama-teammate-2am-call", icon: "☾", tag: "VESTIÁRIO", title: "Seu companheiro liga às duas da manhã depois de perder o pênalti",
    description: "Ele diz que desligou as redes, mas as mensagens continuam chegando por outros números. Depois de alguns segundos em silêncio, admite que não quer aparecer no CT no dia seguinte.", minAge: 20, oneTime: true, choices: [
      { label: "Ir até a casa dele", hint: "Grupo ↑↑↑ · descanso ↓", result: "Você pega o carro, leva comida e passa horas falando de qualquer coisa menos do pênalti. Quando o assunto finalmente aparece, já perdeu parte do peso.", effect: { leadership: 10, morale: 8, fitness: -7, lifeBalance: -2 } },
      { label: "Ficar na ligação até ele dormir", hint: "Grupo ↑↑ · físico ↓", result: "A conversa atravessa madrugada, futebol, família e silêncio. Você não resolve a vida dele; garante apenas que ele não passe aquela noite sozinho.", effect: { leadership: 8, morale: 6, fitness: -4 } },
      { label: "Mandar uma mensagem e dormir", hint: "Foco próprio ↑ · relação esfria", result: "Você escreve que está disponível no treino e coloca o celular no modo avião. É uma escolha defensável — e ele percebe a distância.", effect: { fitness: 5, morale: -2, leadership: -3 } },
    ],
  },
  {
    id: "drama-prototype-boots", icon: "👟", tag: "PATROCÍNIO", title: "A chuteira que ainda não existe está machucando seu calcanhar",
    description: "Seu patrocinador quer estrear um protótipo ultraleve no clássico. O par é bonito, exclusivo e doloroso desde o aquecimento. O representante da marca lembra que a campanha inteira foi marcada para aquele jogo.", minOvr: 76, oneTime: true, choices: [
      { label: "Usar mesmo assim", hint: "44% · inovação funciona ou seu pé paga", result: "Você entra em campo com uma chuteira que ninguém pode comprar e que você gostaria muito de tirar.", effect: {}, luck: { chance: 44, successText: "Depois dos primeiros minutos, o incômodo some e o protótipo parece feito para o seu jogo. A atuação vira a melhor propaganda que a marca poderia comprar.", failureText: "O calcanhar abre ainda no primeiro tempo. Você termina a partida compensando a passada e passa os dias seguintes tratando uma decisão de marketing.", successEffect: { ovr: 2, reputation: 8, followers: 140_000, money: 4 }, failureEffect: { fitness: -15, injuryRisk: 8, morale: -8, mediaRelation: -2 } } },
      { label: "Recusar até redesenharem o par", hint: "Saúde ↑ · patrocinador contrariado", result: "Você manda fotos do machucado e devolve o protótipo. A campanha atrasa, mas a próxima versão chega com seu feedback incorporado.", effect: { fitness: 6, lifeBalance: 4, money: -2, reputation: 2 } },
    ],
  },
  {
    id: "drama-statue-too-early", icon: "♜", tag: "TORCIDA", title: "A torcida começou uma vaquinha para erguer sua estátua",
    description: "Você ainda está no auge e já existem renders de bronze circulando nas redes. O projeto tem localização, orçamento e uma pose que você nunca fez em campo.", minAge: 22, maxAge: 27, minOvr: 82, oneTime: true, choices: [
      { label: "Pedir que o dinheiro vá para a base", hint: "Caridade ↑↑↑ · legado ↑", result: "Você agradece a homenagem e pede para trocarem bronze por bolsas, chuteiras e transporte para a categoria de base. A vaquinha cresce depois da mudança.", effect: { charity: 14, reputation: 10, fans: 10, leadership: 5 } },
      { label: "Aceitar e escolher a pose", hint: "Torcida ↑↑ · ego em exposição", result: "Você entra na brincadeira, veta o primeiro render e escolhe uma comemoração real da carreira. A estátua passa a parecer menos monumento e mais meme caro — o que ajuda.", effect: { fans: 13, followers: 220_000, morale: 8, reputation: -2 } },
      { label: "Pedir para esperarem sua aposentadoria", hint: "Reputação ↑ · prudência", result: "Você diz que ainda pretende fazer coisas que possam mudar a pose. A frase vira faixa no estádio na rodada seguinte.", effect: { reputation: 7, morale: 5, fans: 6 } },
    ],
  },
  {
    id: "drama-tactical-leak-coverup", icon: "●", tag: "VESTIÁRIO", title: "O novato te conta que foi ele quem vazou o treino fechado",
    description: "Ele filmou dez segundos para mandar a um amigo. O amigo postou. Agora a comissão procura o responsável e o garoto te procura primeiro, visivelmente apavorado.", minAge: 23, oneTime: true, choices: [
      { label: "Dar uma noite para ele confessar sozinho", hint: "53% · amadurecimento ou problema dobrado", result: "Você diz que não vai mentir por ele, mas também não vai entregá-lo antes de amanhã.", effect: {}, luck: { chance: 53, successText: "Ele aparece cedo, assume o erro e aceita a multa. A comissão descobre que você sabia — e entende por que deu a ele a chance de falar primeiro.", failureText: "Ele trava e não confessa. Quando a autoria aparece por outro caminho, a comissão descobre também que você sabia desde a noite anterior.", successEffect: { leadership: 10, morale: 5, discipline: 3 }, failureEffect: { reputation: -6, discipline: -6, leadership: -5, morale: -7 } } },
      { label: "Levar o caso ao treinador imediatamente", hint: "Disciplina ↑↑ · relação com novato ↓", result: "Você entra com ele na sala e não deixa que o garoto seja descoberto por investigação. A confiança pessoal sofre; o problema institucional termina rápido.", effect: { discipline: 8, leadership: 5, morale: -3 } },
      { label: "Resolver dentro do elenco e apagar o rastro", hint: "Grupo ↑ · risco ético", result: "O vídeo desaparece das contas próximas ao garoto e ninguém entrega um nome. A comissão encerra o caso sem resposta oficial.", effect: { morale: 7, leadership: 3, discipline: -7 } },
    ],
  },
  {
    id: "drama-teammate-wedding-recovery", icon: "♪", tag: "VIDA PESSOAL", title: "O casamento do seu melhor amigo do elenco caiu no dia da recuperação",
    description: "A data estava livre quando o convite chegou. Um jogo adiado empurra a partida para a véspera e o clube marca recuperação obrigatória na manhã seguinte. Você é padrinho.", minAge: 22, oneTime: true, choices: [
      { label: "Ir, fazer o discurso e sair cedo", hint: "Equilíbrio ↑ · físico preservado", result: "Você cumpre o papel que prometeu, recusa a terceira rodada de festa e vai embora quando metade do salão ainda acha que a noite está começando.", effect: { lifeBalance: 8, morale: 7, fitness: -2, leadership: 3 } },
      { label: "Ficar até o fim", hint: "Moral ↑↑ · disciplina e físico ↓", result: "Você troca a planilha de recuperação por uma noite que não vai se repetir. O vídeo da última música prova que você levou a decisão a sério demais.", effect: { morale: 12, lifeBalance: 8, fitness: -9, discipline: -5 } },
      { label: "Não ir e aparecer na recuperação", hint: "Disciplina ↑ · amizade sente", result: "Você manda um vídeo antes da cerimônia e cumpre toda a rotina do clube no dia seguinte. O profissionalismo fica intacto; a cadeira vazia nas fotos também.", effect: { fitness: 8, discipline: 5, morale: -5, lifeBalance: -6 } },
    ],
  },
  {
    id: "drama-elevator-with-away-fans", icon: "↕", tag: "VIAGEM", title: "O elevador trava com você e quatro torcedores adversários",
    description: "O hotel misturou andares, o elevador para entre dois pisos e você reconhece um dos quatro: é o mesmo homem que passou a noite anterior te xingando atrás do banco.", minAge: 18, oneTime: true, choices: [
      { label: "Conversar como se ninguém estivesse de uniforme", hint: "Respeito ↑↑ · história improvável", result: "Os primeiros minutos são constrangedores. Depois alguém reclama do calor, outro faz uma piada ruim e, quando a porta abre, a rivalidade já parece menor do que cabia naquele elevador.", effect: { rivalRespect: 10, morale: 7, reputation: 5 } },
      { label: "Tirar uma foto depois do resgate", hint: "Seguidores ↑ · torcidas divididas", result: "Vocês esperam a porta abrir e registram a situação como prova de sobrevivência conjunta. A legenda '60 minutos sem cartão' faz o resto.", effect: { followers: 210_000, socialSentiment: 9, rivalRespect: 7, fans: 2 } },
      { label: "Ficar quieto e esperar", hint: "Seguro · nenhum vínculo", result: "Ninguém força conversa. O elevador volta a funcionar, vocês se separam no corredor e retomam os papéis de sempre no estádio.", effect: { lifeBalance: 3, morale: 2 } },
    ],
  },
  {
    id: "drama-ridiculous-sponsor-commercial", icon: "▶", tag: "PATROCÍNIO", title: "O comercial é tão ruim que talvez dê a volta e fique bom",
    description: "O roteiro coloca você de uniforme prateado, dizendo 'energia de campeão' para uma câmera que depois receberá uma explosão em CGI. Ninguém no set parece ter coragem de admitir que a cena é péssima.", minOvr: 72, oneTime: true, choices: [
      { label: "Fazer a pior fala com 100% de convicção", hint: "50% · meme querido ou meme cruel", result: "Você decide que, se vai existir para sempre na internet, pelo menos não vai parecer envergonhado de estar ali.", effect: {}, luck: { chance: 50, successText: "A atuação exagerada vira o melhor elemento do comercial. A frase ganha remixes, camisas e uma segunda vida que ninguém do marketing planejou.", failureText: "O vídeo viraliza pelo motivo errado. A marca ganha alcance; você ganha meses ouvindo a própria frase em toda entrevista.", successEffect: { followers: 520_000, money: 8, socialSentiment: 13, morale: 7 }, failureEffect: { followers: 410_000, money: 8, socialSentiment: -8, morale: -7, mediaRelation: 2 } } },
      { label: "Pedir um roteiro menos humilhante", hint: "Imagem ↑ · dinheiro menor", result: "Você aceita gravar, mas corta explosão, uniforme prateado e metade dos slogans. O comercial fica esquecível — o que, desta vez, é vitória.", effect: { reputation: 4, money: 4, lifeBalance: 3 } },
    ],
  },
  {
    id: "drama-rival-private-message-leak", icon: "⚔", tag: "RIVALIDADE", title: "Você postou sem querer a mensagem privada do seu rival",
    description: "Depois de uma grande atuação, o maior rival da sua carreira manda 'partida absurda, parabéns'. Ao tentar responder uma conversa, você publica a captura nos stories por engano.", needsRivalry: true, minAge: 20, oneTime: true, choices: [
      { label: "Manter no ar e responder publicamente", hint: "Respeito ↑↑ · rivalidade muda de tom", result: "Você para de fingir que respeito privado é proibido em público. Responde com a mesma simplicidade e deixa as torcidas discutirem o que isso significa.", effect: { rivalRespect: 12, reputation: 6, followers: 160_000, socialSentiment: 5 } },
      { label: "Apagar e pedir desculpas no privado", hint: "Confiança ↑ · viral reduzido", result: "Você remove a captura em segundos e admite o erro diretamente. O print já existe, mas pelo menos a conversa entre vocês continua pertencendo aos dois.", effect: { rivalRespect: 9, morale: 4, lifeBalance: 3 } },
      { label: "Dizer que minha conta foi invadida", hint: "35% · desculpa cola ou vira meme", result: "Você escolhe uma explicação muito maior que o acidente original.", effect: {}, luck: { chance: 35, successText: "A versão confunde o ciclo de notícias o suficiente para o assunto perder força antes de alguém provar qualquer coisa.", failureText: "Seu rival responde com um único emoji de riso. A desculpa desmorona e o acidente vira piada nacional.", successEffect: { mediaRelation: 2, morale: 2 }, failureEffect: { mediaRelation: -7, socialSentiment: -8, followers: 190_000, morale: -5 } } },
    ],
  },
  {
    id: "drama-lineup-spreadsheet-filter", icon: "▦", tag: "COMISSÃO TÉCNICA", title: "Você ficou fora da relação por causa de um filtro no Excel",
    description: "Seu nome desapareceu da lista enviada à organização porque alguém filtrou a planilha pela posição errada antes de exportar o arquivo. O prazo passou. Você está saudável, treinou a semana toda e não pode jogar.", minAge: 18, oneTime: true, choices: [
      { label: "Tratar como erro humano e seguir", hint: "Grupo ↑ · moral ↓", result: "Você está furioso, mas sabe que ninguém acordou querendo te tirar do jogo por fórmula de planilha. Assiste da arquibancada e deixa a conversa séria para depois.", effect: { leadership: 6, morale: -6, lifeBalance: 2 } },
      { label: "Exigir revisão completa do processo", hint: "Liderança ↑↑ · burocracia ↑", result: "Você não pede cabeça de ninguém. Pede que nunca mais uma carreira dependa de um filtro escondido numa coluna.", effect: { leadership: 9, reputation: 4, morale: -3 } },
      { label: "Postar: 'fora por opção técnica do Excel'", hint: "Humor ↑ · seguidores ↑", result: "O clube não ama a piada, mas já é tarde. Torcedores passam a usar planilhas como meme em toda escalação seguinte.", effect: { followers: 130_000, socialSentiment: 10, morale: 5, mediaRelation: -2 } },
    ],
  },
  {
    id: "drama-fan-found-old-scout-report", icon: "✎", tag: "PASSADO", title: "Um torcedor encontrou o relatório que quase encerrou sua carreira aos quinze",
    description: "O documento parece autêntico e tem assinatura, data e uma frase circulada em vermelho: 'teto limitado; não priorizar'. Agora todo mundo quer saber o que você diria ao olheiro.", minAge: 22, minOvr: 75, oneTime: true, choices: [
      { label: "Postar o relatório sem legenda", hint: "Impacto ↑↑ · nenhuma explicação", result: "Você publica a página inteira e não escreve uma palavra. O contraste entre a frase antiga e sua carreira atual faz o resto.", effect: { followers: 240_000, reputation: 9, morale: 7, fans: 8 } },
      { label: "Defender o olheiro", hint: "Maturidade ↑ · manchete menos explosiva", result: "Você lembra que ele avaliou um adolescente em um dia específico, não o futuro. A resposta decepciona quem queria vingança e impressiona quem entende desenvolvimento.", effect: { leadership: 8, reputation: 7, morale: 5 } },
      { label: "Emoldurar e pendurar em casa", hint: "Moral ↑ · história pessoal", result: "Você pede o original, paga pela moldura e deixa a frase exatamente onde consegue vê-la. Não como combustível diário; como prova de que projeção não é sentença.", effect: { morale: 9, lifeBalance: 5, reputation: 3 } },
    ],
  },
  {
    id: "drama-club-captain-petition", icon: "C", tag: "CAPITÃO", title: "A torcida criou uma campanha para tirar a braçadeira do seu companheiro e dar a você",
    description: "O atual capitão não fez nada grave. Mesmo assim, a campanha cresce depois de uma sequência sua de grandes jogos, e jornalistas começam a perguntar se você 'aceitaria assumir'.", minAge: 23, needsSquadRoles: ["titular", "estrela"], oneTime: true, choices: [
      { label: "Defender o capitão atual publicamente", hint: "Liderança ↑↑ · torcida pode discordar", result: "Você corta a pergunta antes que vire disputa: diz que liderança não se mede por enquete e que a braçadeira já tem dono.", effect: { leadership: 10, morale: 7, reputation: 5, fans: -2 } },
      { label: "Não entrar na campanha", hint: "Neutro · especulação continua", result: "Você se recusa a comentar a hierarquia do vestiário em coletiva. O silêncio evita uma frase ruim, mas não encerra o assunto.", effect: { morale: 3, mediaRelation: -1 } },
      { label: "Dizer que aceitaria se o grupo quisesse", hint: "46% · postura madura ou guerra silenciosa", result: "Você tenta responder de forma institucional. A frase é curta o bastante para caber em qualquer manchete.", effect: {}, luck: { chance: 46, successText: "O capitão te procura e diz que entendeu exatamente o que você quis dizer. A conversa fortalece a liderança dos dois.", failureText: "A frase chega ao vestiário como 'ele quer a braçadeira'. O atual capitão não confronta você — o que deixa o clima ainda pior.", successEffect: { leadership: 9, morale: 6, rivalRespect: 5 }, failureEffect: { morale: -9, leadership: -4, reputation: 3 } } },
    ],
  },
  {
    id: "drama-missed-bus-rideshare", icon: "✈", tag: "LOGÍSTICA", title: "O ônibus saiu sem você",
    description: "O horário mudou enquanto você estava em tratamento. Quando desce para a recepção, o ônibus já está na estrada e o jogo é em outra cidade. O funcionário do hotel pergunta se você precisa de um carro.", minAge: 18, oneTime: true, choices: [
      { label: "Chamar um carro e tentar alcançar o time", hint: "58% · chegada cinematográfica ou corte da relação", result: "Você entra no primeiro carro disponível com a mala no colo e o mapa aberto, tentando calcular se chega antes da preleção.", effect: {}, luck: { chance: 58, successText: "Você chega pelo portão lateral enquanto o elenco termina o aquecimento. A história vira piada interna depois que o resultado não é afetado.", failureText: "O trânsito vence. Você chega quando a escalação já foi registrada e assiste ao jogo de roupa social, ainda segurando a própria chuteira.", successEffect: { morale: 7, reputation: 4, fitness: -3 }, failureEffect: { minutes: -8, morale: -10, reputation: -4, fitness: -5 } } },
      { label: "Ligar para o clube e assumir o atraso", hint: "Disciplina ↑ · minutos em risco", result: "Você não tenta criar uma aventura para esconder o problema. Liga, explica onde está e deixa a comissão decidir o que fazer.", effect: { discipline: 6, leadership: 4, minutes: -3, morale: -3 } },
    ],
  },
];

export function careerDramaEventWithOverride(event: GameEvent): GameEvent {
  return CAREER_DRAMA_EVENT_OVERRIDES[event.id] ?? event;
}
