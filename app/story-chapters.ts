import type { Effect } from "./game-data";
import type { PlayerStoryId } from "./player-stories";

export type StoryChapterChoice = {
  label: string;
  hint: string;
  result: string;
  effect: Effect;
  flag: string;
};

export type StoryChapterBeat = {
  key: string;
  title: string;
  description: string;
  choices: StoryChapterChoice[];
};

/** Três capítulos exclusivos depois do capítulo de apresentação de cada origem. */
export const STORY_CHAPTER_BEATS: Record<PlayerStoryId, StoryChapterBeat[]> = {
  "open-book": [
    { key: "open-book-fake-biography", title: "Um ex-colega inventou a origem perfeita para você", description: "Ele contou a um podcast que vocês treinavam escondidos de madrugada e juravam conquistar o mundo. Você mal lembra de ter conversado com ele.", choices: [
      { label: "Ligar para ele e perguntar de onde saiu isso", hint: "Verdade primeiro · conversa desconfortável", result: "Ele admite que aumentou tudo para deixar a história melhor. O episódio ganha uma correção bem menos emocionante.", effect: { lifeBalance: 5, mediaRelation: 4, morale: 3 }, flag: "corrigiu-biografia-inventada" },
      { label: "Contar publicamente a versão sem cinema", hint: "Autenticidade ↑↑ · mito ↓", result: "Você explica que treinava em horário normal, perdia o ônibus e quase sempre esquecia a garrafa. O público gosta justamente disso.", effect: { followers: 90_000, fans: 7, mediaRelation: 6 }, flag: "contou-versao-sem-cinema" },
      { label: "Deixar a lenda crescer sozinha", hint: "Imagem ↑ · controle ↓", result: "A história falsa ganha animação, trilha épica e detalhes novos a cada repostagem. Você vira espectador da própria origem.", effect: { followers: 170_000, reputation: 5, lifeBalance: -6 }, flag: "deixou-lenda-crescer" },
    ]},
    { key: "open-book-one-object", title: "O museu do clube quer o objeto que explica sua carreira", description: "A curadoria pede uma peça do começo de tudo. O problema é que não existe chuteira lendária nem carta profética — só coisas comuns que sobreviveram por acaso.", choices: [
      { label: "Entregar a mochila rasgada da primeira peneira", hint: "Memória real · torcida ↑", result: "A mochila vai para uma redoma. O zíper quebrado chama mais atenção que várias taças da exposição.", effect: { fans: 9, morale: 7, reputation: 4 }, flag: "mochila-no-museu" },
      { label: "Dizer que nenhum objeto explica uma vida", hint: "Personalidade ↑ · museu sem peça", result: "A frase vira o texto da parede vazia reservada para você. Sem planejar, você cria a parte mais fotografada da mostra.", effect: { leadership: 7, mediaRelation: 6, followers: 70_000 }, flag: "parede-vazia" },
      { label: "Pedir que torcedores escolham o objeto", hint: "Torcida participa · resultado imprevisível", result: "A votação escolhe uma placa de substituição do seu primeiro jogo. Você nunca tinha reparado nela.", effect: { fans: 11, followers: 120_000, morale: 4 }, flag: "torcida-escolheu-objeto" },
    ]},
    { key: "open-book-ending-pitch", title: "Uma editora quer publicar sua autobiografia antes da metade da carreira", description: "A proposta já inclui título, capa e um último capítulo chamado O Legado. Você ainda nem sabe em qual clube estará no ano que vem.", choices: [
      { label: "Aceitar, mas deixar as últimas páginas em branco", hint: "Dinheiro ↑ · futuro aberto", result: "O livro termina com doze páginas vazias. Leitores começam a anotar nelas o que esperam da sua carreira.", effect: { money: 7, followers: 150_000, mediaRelation: 5 }, flag: "livro-paginas-vazias" },
      { label: "Escrever apenas sobre o que já aconteceu", hint: "Controle ↑ · menos espetáculo", result: "Você corta previsões e promessas. O resultado parece uma conversa, não uma campanha de marketing.", effect: { lifeBalance: 7, leadership: 5, money: 3 }, flag: "livro-sem-profecia" },
      { label: "Recusar: a história ainda está no intervalo", hint: "Foco ↑ · dinheiro recusado", result: "A editora guarda a proposta. A frase sobre o intervalo vira manchete mesmo sem existir livro.", effect: { morale: 8, fitness: 4, reputation: 5 }, flag: "recusou-final-antecipado" },
    ]},
  ],
  "academy-destroyer": [
    { key: "academy-record-broken", title: "Um garoto da base quebrou o recorde que carregava seu nome", description: "Ele marcou um gol a mais, correu para a câmera e pediu desculpas a você. A imprensa já chama o menino de seu sucessor.", choices: [
      { label: "Mandar uma mensagem: agora dobra a meta", hint: "Mentoria ↑ · rivalidade saudável", result: "O garoto enquadra a mensagem no quarto e responde que vai buscar o dobro. Você ganha um rival de dezesseis anos.", effect: { leadership: 9, morale: 7, fans: 5 }, flag: "desafiou-novo-recordista" },
      { label: "Entregar pessoalmente a bola do recorde", hint: "Legado ↑↑ · holofote dividido", result: "Vocês se encontram no CT. Pela primeira vez, a matéria sobre seu antigo recorde termina falando mais dele do que de você.", effect: { leadership: 11, reputation: 6, morale: 5 }, flag: "entregou-bola-recorde" },
      { label: "Lembrar que base não garante carreira", hint: "Realismo · fala pega mal", result: "Você queria proteger o garoto da pressão, mas a frase soa como ciúme. Ele responde marcando dois no jogo seguinte.", effect: { mediaRelation: -7, morale: -3, reputation: 3 }, flag: "esfriou-recorde-garoto" },
    ]},
    { key: "academy-lost-match-video", title: "A internet encontrou o único jogo horrível da sua base", description: "Você perdeu pênalti, foi substituído e chorou no banco. O vídeo apaga anos de melhores momentos em uma tarde.", choices: [
      { label: "Comentar: finalmente acharam o jogo certo", hint: "Humor ↑↑ · pressão ↓", result: "A resposta desmonta a tentativa de te constranger. Outros atletas começam a postar os próprios jogos ruins.", effect: { socialSentiment: 12, followers: 190_000, morale: 8 }, flag: "abracou-pior-jogo" },
      { label: "Assistir ao vídeo inteiro com os garotos da base", hint: "Mentoria ↑ · vergonha compartilhada", result: "Você pausa cada erro e explica o que aprendeu. No fim, ninguém ri mais da criança no banco.", effect: { leadership: 12, reputation: 5, lifeBalance: 4 }, flag: "aula-com-pior-jogo" },
      { label: "Pedir para a assessoria derrubar o vídeo", hint: "Imagem protegida · efeito contrário possível", result: "O pedido apenas multiplica os espelhos do arquivo. Agora existe até uma versão com narração dramática.", effect: { mediaRelation: -5, followers: 80_000, morale: -6 }, flag: "tentou-apagar-pior-jogo" },
    ]},
    { key: "academy-parent-method", title: "Pais da base querem saber qual foi o segredo da sua infância", description: "Eles esperam uma rotina milagrosa. A verdade envolve treino, sorte, carona, lesão evitada por acaso e adultos que nem sempre acertaram.", choices: [
      { label: "Contar que não existiu fórmula", hint: "Pressão infantil ↓ · imagem madura", result: "A reunião sai sem planilha mágica, mas alguns pais finalmente deixam os filhos respirarem depois do treino.", effect: { leadership: 10, charity: 6, mediaRelation: 5 }, flag: "desmontou-formula-da-base" },
      { label: "Montar clínicas gratuitas sem prometer sucesso", hint: "Dinheiro ↓ · impacto social ↑↑", result: "O projeto ensina fundamentos e também como lidar com a possibilidade de não virar profissional.", effect: { money: -7, charity: 14, fans: 8 }, flag: "clinica-sem-promessa" },
      { label: "Compartilhar sua antiga rotina exatamente como era", hint: "Disciplina ↑ · pressão volta", result: "A planilha viraliza e crianças passam a copiar até seus dias de descanso, como se carreira pudesse ser reproduzida.", effect: { followers: 140_000, reputation: 6, lifeBalance: -5 }, flag: "publicou-rotina-da-base" },
    ]},
  ],
  "humble-roots": [
    { key: "humble-relative-promises", title: "Um parente começou a prometer ajuda usando seu nome", description: "Reformas, empregos, mensalidades: ele garante para todo mundo que você vai resolver. A lista chega ao seu celular com valores e datas.", choices: [
      { label: "Reunir a família e estabelecer um limite claro", hint: "Equilíbrio ↑ · conversa difícil", result: "A noite é pesada, mas pela primeira vez todos entendem que seu contrato não é uma conta coletiva sem fundo.", effect: { lifeBalance: 11, discipline: 6, morale: -3 }, flag: "limite-ajuda-familia" },
      { label: "Cumprir apenas as promessas urgentes", hint: "Dinheiro ↓↓ · família ↑", result: "Você paga tratamento e estudo, recusa o resto e assume pessoalmente a explicação para cada pessoa.", effect: { money: -12, morale: 8, leadership: 7, charity: 4 }, flag: "ajuda-familiar-urgente" },
      { label: "Quitar tudo e encerrar o assunto", hint: "Dinheiro ↓↓↓ · paz temporária", result: "A lista desaparece, mas uma nova mensagem chega antes do fim do mês. O problema nunca foi apenas o valor.", effect: { money: -22, lifeBalance: -8, morale: 3 }, flag: "quitou-promessas-parentes" },
    ]},
    { key: "humble-first-luxury", title: "Sua primeira compra realmente cara parou a rua", description: "O carro chama atenção diante da casa da família. Crianças tiram foto; alguns vizinhos comemoram, outros perguntam se você esqueceu de onde veio.", choices: [
      { label: "Assumir que realizou um sonho e pronto", hint: "Moral ↑ · opiniões divididas", result: "Você não inventa justificativa social para uma vontade pessoal. A sinceridade encerra metade da discussão.", effect: { morale: 9, socialSentiment: -2, lifeBalance: 5 }, flag: "assumiu-primeiro-luxo" },
      { label: "Vender e investir num projeto local", hint: "Luxo ↓ · legado ↑↑", result: "O carro dura uma semana; o curso profissionalizante financiado por ele começa no mês seguinte.", effect: { charity: 15, fans: 10, reputation: 7, morale: 4 }, flag: "trocou-luxo-por-projeto" },
      { label: "Emprestar o carro para o casamento de todo mundo", hint: "Família ↑ · paz mecânica ↓", result: "Em seis meses ele aparece em quatro casamentos, um aniversário e um clipe local sem sua autorização.", effect: { morale: 8, lifeBalance: -5, followers: 60_000 }, flag: "carro-comunitario" },
    ]},
    { key: "humble-contract-table", title: "O novo contrato foi discutido na mesa do almoço", description: "Cada pessoa enxerga o dinheiro de um jeito: segurança, casa nova, investimento, obrigação ou chance de nunca mais dizer não.", choices: [
      { label: "Mostrar os números reais, incluindo impostos e comissão", hint: "Confiança ↑ · fantasia ↓", result: "A quantia ainda é enorme, mas deixa de parecer infinita. A conversa muda quando todos veem o que realmente sobra.", effect: { discipline: 9, lifeBalance: 8, leadership: 4 }, flag: "abriu-numeros-contrato" },
      { label: "Ouvir cada pedido antes de decidir sozinho", hint: "Família ↑ · desgaste ↑", result: "Você passa horas anotando tudo e escolhe prioridades no dia seguinte, com a cabeça mais fria.", effect: { morale: 8, leadership: 6, fitness: -3 }, flag: "ouviu-pedidos-contrato" },
      { label: "Contratar alguém para organizar as finanças da família", hint: "Dinheiro protegido · relação formaliza", result: "Planilhas substituem pedidos no grupo. Funciona, embora seja estranho precisar marcar reunião para conversar sobre ajuda.", effect: { money: 4, discipline: 10, lifeBalance: 3, morale: -2 }, flag: "gestao-financeira-familia" },
    ]},
  ],
  "football-bloodline": [
    { key: "bloodline-old-tape", title: "Uma fita inédita mostrou seu pai como você nunca o viu", description: "Não são gols: ele discute com o técnico, erra passes simples e termina um jogo escondendo o rosto na camisa. A lenda familiar fica subitamente humana.", choices: [
      { label: "Assistir com ele, sem transformar em entrevista", hint: "Família ↑↑ · comparação ↓", result: "Seu pai explica cada medo daquele ano. Pela primeira vez, vocês comparam fraquezas em vez de troféus.", effect: { morale: 12, lifeBalance: 10, leadership: 4 }, flag: "viu-fita-com-pai" },
      { label: "Pedir autorização para mostrar aos jovens", hint: "Mentoria ↑ · mito humanizado", result: "A fita vira uma aula sobre sobreviver a temporadas ruins, não sobre parecer invencível.", effect: { leadership: 11, reputation: 6, fans: 4 }, flag: "fita-virou-aula" },
      { label: "Guardar sem contar que encontrou", hint: "Segredo preservado · distância ↑", result: "Você protege a imagem dele, mas passa a ouvir antigas cobranças com menos paciência.", effect: { lifeBalance: -4, morale: 5, reputation: 2 }, flag: "escondeu-fita-do-pai" },
    ]},
    { key: "bloodline-pundit", title: "Seu pai recebeu uma proposta para comentar seus jogos", description: "A emissora quer reação ao vivo, comparação lance a lance e liberdade para criticar. O contrato dele depende justamente de não parecer seu defensor.", choices: [
      { label: "Dizer para ele aceitar e falar o que vê", hint: "Família profissional · pressão ↑", result: "Na estreia, ele critica seu posicionamento e elogia sua coragem. A conversa de domingo fica estranha, mas honesta.", effect: { mediaRelation: 8, reputation: 5, morale: -4 }, flag: "pai-virou-comentarista" },
      { label: "Pedir que não transforme a relação em conteúdo", hint: "Privacidade ↑ · oportunidade dele ↓", result: "Ele recusa a proposta sem ressentimento aparente. Você sabe que a decisão custou mais a ele do que admite.", effect: { lifeBalance: 9, morale: 4, mediaRelation: -3 }, flag: "vetou-pai-comentarista" },
      { label: "Participar do primeiro programa juntos", hint: "Audiência ↑↑ · comparações ↑↑", result: "O encontro é carinhoso e caótico. Cada resposta alimenta mais dez perguntas sobre quem foi melhor.", effect: { followers: 220_000, mediaRelation: 7, lifeBalance: -8 }, flag: "programa-com-pai" },
    ]},
    { key: "bloodline-name-shirt", title: "A loja vende mais camisas com seu sobrenome do que com seu número", description: "Torcedores antigos dizem que compraram pelo seu pai; crianças garantem que nem sabiam que ele jogava. A mesma palavra pertence a duas gerações.", choices: [
      { label: "Lançar uma camisa que homenageia as duas carreiras", hint: "Família e torcida ↑↑", result: "Os dois números aparecem discretamente na gola. Seu pai encontra o próprio tamanho esgotado.", effect: { fans: 11, money: 5, morale: 8 }, flag: "camisa-duas-geracoes" },
      { label: "Pedir que a campanha use seu primeiro nome", hint: "Identidade própria ↑ · tradição divide", result: "A nova camisa parece uma ruptura pequena, mas necessária. Pela primeira vez, a loja separa vocês visualmente.", effect: { reputation: 8, leadership: 6, fans: -2 }, flag: "camisa-primeiro-nome" },
      { label: "Não controlar o motivo de cada torcedor", hint: "Paz ↑ · ambiguidade fica", result: "Você aceita que a camisa pode lembrar duas histórias sem diminuir nenhuma delas.", effect: { lifeBalance: 8, morale: 7, leadership: 3 }, flag: "aceitou-sobrenome-compartilhado" },
    ]},
  ],
  disillusioned: [
    { key: "disillusioned-joy-video", title: "Um torcedor montou um vídeo só com momentos em que você parecia feliz", description: "Não há gols nem estatísticas. São risadas no banco, brincadeiras no treino e um abraço demorado depois de uma derrota.", choices: [
      { label: "Assistir com o elenco depois do treino", hint: "Moral ↑↑ · vulnerabilidade", result: "O vídeo termina em silêncio. Um companheiro admite que também vinha jogando no automático.", effect: { morale: 14, leadership: 8, lifeBalance: 6 }, flag: "viu-video-da-alegria" },
      { label: "Agradecer ao torcedor em particular", hint: "Conexão real · sem campanha", result: "Você explica que ele encontrou coisas que nem você estava enxergando. A resposta nunca vira postagem.", effect: { morale: 12, lifeBalance: 10, fans: 4 }, flag: "agradeceu-video-privado" },
      { label: "Não assistir até a temporada acabar", hint: "Foco agora · emoção adiada", result: "O arquivo fica salvo por meses. Saber que ele existe já muda a forma como você percebe alguns dias.", effect: { discipline: 7, fitness: 4, morale: 3 }, flag: "adiou-video-alegria" },
    ]},
    { key: "disillusioned-smile-campaign", title: "Uma marca quer que você sorria numa campanha sobre viver o sonho", description: "O roteiro diz que todo sacrifício vale a pena. Naquela semana, você não consegue repetir essa frase sem sentir que está mentindo.", choices: [
      { label: "Reescrever a campanha falando também dos dias ruins", hint: "Honestidade ↑↑ · marca insegura", result: "A publicidade vira uma conversa incomum sobre exaustão. A marca quase recua, mas o público entende imediatamente.", effect: { mediaRelation: 11, followers: 150_000, morale: 7, money: 2 }, flag: "reescreveu-campanha-sonho" },
      { label: "Cumprir o contrato e guardar o incômodo", hint: "Dinheiro ↑ · equilíbrio ↓", result: "O sorriso fica perfeito na foto. Você evita olhar para a campanha quando ela aparece na rua.", effect: { money: 7, lifeBalance: -10, morale: -5 }, flag: "sorriu-sem-sentir" },
      { label: "Cancelar a gravação e assumir a multa", hint: "Dinheiro ↓ · integridade ↑", result: "A nota oficial fala em conflito de agenda. O elenco sabe o motivo verdadeiro.", effect: { money: -5, lifeBalance: 11, leadership: 5 }, flag: "cancelou-campanha-sonho" },
    ]},
    { key: "disillusioned-exit-note", title: "Um companheiro encontrou a mensagem de despedida que você nunca enviou", description: "O texto antigo estava salvo entre documentos do celular. Ele leu apenas a primeira linha antes de perceber o que era.", choices: [
      { label: "Deixar que ele leia e conversar sobre aquela época", hint: "Amizade ↑↑ · passado exposto", result: "A conversa atravessa a madrugada. Ele passa a reconhecer seus silêncios antes mesmo de você falar.", effect: { morale: 13, leadership: 7, lifeBalance: 8 }, flag: "companheiro-leu-despedida" },
      { label: "Apagar o arquivo na frente dele", hint: "Fechamento simbólico · pressão", result: "O texto some, mas vocês dois sabem que apagar não transforma tudo em passado.", effect: { morale: 8, lifeBalance: 5, discipline: 4 }, flag: "apagou-despedida" },
      { label: "Pedir que ele finja que não viu", hint: "Privacidade ↑ · isolamento ↑", result: "Ele respeita o pedido e começa a perguntar se você está bem com uma frequência quase irritante.", effect: { lifeBalance: -3, morale: 4, leadership: 2 }, flag: "escondeu-despedida" },
    ]},
  ],
  "street-football": [
    { key: "street-secret-tournament", title: "Convidaram você para um torneio de rua sem câmeras e sem autorização", description: "A quadra é a mesma de antes, o prêmio é uma caixa de refrigerante e a final acontece dois dias antes de um jogo profissional.", choices: [
      { label: "Jogar de capuz e torcer para ninguém reconhecer", hint: "Alegria ↑↑ · risco físico ↑↑", result: "Reconhecem no primeiro toque. Você joga vinte minutos, dá três canetas e sai antes da comissão descobrir oficialmente.", effect: { morale: 15, lifeBalance: 8, fitness: -10, injuryRisk: 5 }, flag: "jogou-torneio-secreto" },
      { label: "Aparecer só para entregar o prêmio", hint: "Bairro ↑ · risco controlado", result: "Você não entra em quadra, mas narra a final no microfone ruim da organização e entrega a caixa ao campeão.", effect: { fans: 10, charity: 5, morale: 8 }, flag: "premiou-torneio-da-rua" },
      { label: "Levar o torneio para dentro do clube", hint: "Projeto ↑ · espontaneidade ↓", result: "A quadra ganha médico e uniforme; perde parte do caos. Ainda assim, cinquenta garotos conseguem jogar.", effect: { charity: 12, leadership: 7, reputation: 4 }, flag: "oficializou-torneio-rua" },
    ]},
    { key: "street-dangerous-copy", title: "Um garoto se machucou tentando copiar seu drible", description: "O vídeo mostra a tentativa no asfalto molhado. Ele está bem, mas agora você precisa falar sobre a jogada que todos pedem para repetir.", choices: [
      { label: "Gravar um tutorial começando pela segurança", hint: "Responsabilidade ↑ · magia explicada", result: "Você ensina o movimento em velocidade baixa e termina dizendo quando não tentar. O vídeo alcança mais gente que o drible original.", effect: { leadership: 9, followers: 180_000, mediaRelation: 5 }, flag: "tutorial-drible-seguro" },
      { label: "Visitar o garoto com uma bola", hint: "Moral e torcida ↑↑", result: "Vocês treinam parados no quintal. Ele promete esperar a recuperação antes de tentar de novo — com menos certeza do que você gostaria.", effect: { morale: 10, fans: 9, charity: 4 }, flag: "visitou-garoto-drible" },
      { label: "Dizer que futebol de rua também ensina caindo", hint: "Autenticidade · repercussão ruim", result: "A frase tem uma verdade, mas parece insensível fora do contexto. Você passa a semana explicando o que quis dizer.", effect: { reputation: 3, mediaRelation: -8, socialSentiment: -6 }, flag: "defendeu-risco-da-rua" },
    ]},
    { key: "street-painted-wall", title: "Pintaram por cima do muro onde seus primeiros gols eram marcados", description: "A trave desenhada sumiu sob uma propaganda. Para muita gente era só uma parede; para você, ainda havia placares invisíveis ali.", choices: [
      { label: "Comprar o espaço e restaurar cada marca", hint: "Dinheiro ↓ · memória ↑↑", result: "A tinta nova reproduz até a rachadura que servia de ângulo. Crianças voltam a usar o muro no mesmo dia.", effect: { money: -6, fans: 11, morale: 10, charity: 7 }, flag: "restaurou-muro-da-rua" },
      { label: "Pedir um mural novo feito por artistas locais", hint: "Bairro e imagem ↑↑", result: "A velha trave vira parte de uma obra maior, com nomes de jogadores que nunca chegaram ao profissional.", effect: { charity: 10, followers: 100_000, reputation: 6 }, flag: "mural-da-rua" },
      { label: "Aceitar que o campo existia também na memória", hint: "Equilíbrio ↑ · espaço se vai", result: "Você fotografa a parede coberta e guarda a imagem. Nem toda preservação precisa impedir que o lugar mude.", effect: { lifeBalance: 9, morale: 7, leadership: 3 }, flag: "despediu-do-muro" },
    ]},
  ],
  "late-bloomer": [
    { key: "late-former-coach-apology", title: "O treinador que cortou você escreveu um pedido de desculpas", description: "Ele não pede emprego nem ingresso. Diz apenas que confundiu desenvolvimento lento com falta de talento e carrega isso desde então.", choices: [
      { label: "Responder contando o que aquele corte causou", hint: "Verdade ↑ · conversa difícil", result: "Vocês trocam mensagens honestas, sem transformar perdão em esquecimento.", effect: { lifeBalance: 10, morale: 9, leadership: 4 }, flag: "respondeu-antigo-treinador" },
      { label: "Convidá-lo para assistir a um treino", hint: "Fechamento ↑↑ · reencontro", result: "Ele observa em silêncio e admite que hoje ainda teria dificuldade de prever até onde você chegaria.", effect: { morale: 12, reputation: 5, lifeBalance: 6 }, flag: "convidou-treinador-que-cortou" },
      { label: "Não responder", hint: "Foco presente · ferida preservada", result: "A mensagem fica marcada como lida. Você não deve conforto a quem participou daquela dor.", effect: { discipline: 6, morale: 3, lifeBalance: -2 }, flag: "ignorou-pedido-treinador" },
    ]},
    { key: "late-patience-poster", title: "Sua antiga base colocou seu rosto num cartaz sobre paciência", description: "O clube que quase desistiu de você agora usa sua carreira para convencer famílias a confiar no processo.", choices: [
      { label: "Autorizar, mas exigir que contem a rejeição também", hint: "História completa · clube desconfortável", result: "O cartaz ganha uma segunda metade explicando os erros do próprio clube. Fica menos bonito e muito mais útil.", effect: { leadership: 10, mediaRelation: 7, reputation: 5 }, flag: "cartaz-com-historia-completa" },
      { label: "Participar de uma conversa com reservas da base", hint: "Mentoria ↑↑ · tempo ↓", result: "Você não promete finais felizes. Explica apenas que avaliação aos quinze anos não é sentença.", effect: { leadership: 12, charity: 6, fitness: -3 }, flag: "conversa-com-reservas" },
      { label: "Proibir o uso da sua imagem", hint: "Coerência ↑ · relação com clube ↓", result: "Você recusa virar propaganda de uma paciência que não recebeu quando precisava.", effect: { morale: 7, mediaRelation: -4, reputation: 4 }, flag: "proibiu-cartaz-paciencia" },
    ]},
    { key: "late-rewritten-origin", title: "Seu empresário quer apagar a parte em que ninguém acreditava", description: "A nova apresentação diz que você sempre foi tratado como joia rara. Ele garante que grandes marcas preferem trajetórias sem rejeição.", choices: [
      { label: "Manter cada rejeição no texto", hint: "Autenticidade ↑↑ · marketing reclama", result: "A apresentação fica menos luxuosa e mais reconhecível para quem também começou atrás.", effect: { fans: 9, leadership: 7, mediaRelation: 3 }, flag: "manteve-rejeicoes-na-bio" },
      { label: "Deixar o empresário vender a versão perfeita", hint: "Dinheiro ↑ · identidade ↓", result: "As campanhas chegam. Toda entrevista começa com uma infância que você não reconhece completamente.", effect: { money: 8, followers: 130_000, lifeBalance: -7 }, flag: "aceitou-origem-perfeita" },
      { label: "Trocar o texto por fotos dos relatórios antigos", hint: "Impacto ↑↑ · provocação", result: "Notas baixas e comentários pessimistas viram a apresentação inteira. Ninguém precisa explicar o contraste.", effect: { reputation: 8, followers: 170_000, morale: 8 }, flag: "bio-com-relatorios" },
    ]},
  ],
  "academy-reject": [
    { key: "reject-club-campaign", title: "O clube que dispensou você usou sua história numa campanha", description: "O vídeo fala sobre formar talentos e nunca desistir deles. Em nenhum momento menciona que foi você quem precisou continuar em outro lugar.", choices: [
      { label: "Publicar a carta de dispensa ao lado do vídeo", hint: "Verdade viral ↑↑ · conflito aberto", result: "Os dois documentos circulam juntos. O clube remove a campanha e promete uma revisão interna.", effect: { followers: 240_000, mediaRelation: -8, reputation: 7 }, flag: "expos-campanha-do-algoz" },
      { label: "Exigir que financiem atletas dispensados", hint: "Acordo concreto · legado ↑↑", result: "Você troca pedido de desculpas por bolsas de transição. O vídeo continua no ar com uma explicação nova.", effect: { charity: 15, leadership: 10, reputation: 6 }, flag: "bolsa-para-dispensados" },
      { label: "Ignorar: sua carreira já respondeu", hint: "Paz ↑ · clube controla versão", result: "A campanha passa. Quem conhece a história percebe o silêncio; quem não conhece compra a narrativa pronta.", effect: { lifeBalance: 8, morale: 5, mediaRelation: -2 }, flag: "ignorou-campanha-algoz" },
    ]},
    { key: "reject-scout-vote", title: "Um ex-companheiro revelou como foi a votação que dispensou você", description: "A decisão terminou empatada. Um coordenador que mal viu seus treinos deu o voto final porque precisava liberar uma vaga naquela tarde.", choices: [
      { label: "Procurar o coordenador e ouvir a versão dele", hint: "Resposta real · ferida pode piorar", result: "Ele não oferece grande explicação: havia uma lista, pouco tempo e uma escolha. A banalidade dói mais que uma perseguição.", effect: { lifeBalance: 5, morale: -5, leadership: 5 }, flag: "ouviu-voto-da-dispensa" },
      { label: "Contar a história para mudar processos da base", hint: "Liderança ↑↑ · impacto estrutural", result: "Sua fala força clubes a discutir avaliações mínimas antes de dispensas. Não corrige o passado, mas alcança o próximo garoto.", effect: { leadership: 13, charity: 8, mediaRelation: 7 }, flag: "mudou-processo-dispensa" },
      { label: "Guardar o nome e esperar o reencontro", hint: "Motivação ↑ · equilíbrio ↓", result: "Você salva a informação. A carreira ganha um adversário que talvez nem saiba que está participando dela.", effect: { morale: 8, fitness: 5, lifeBalance: -7 }, flag: "guardou-voto-final" },
    ]},
    { key: "reject-old-locker", title: "Seu antigo armário ainda tem seu nome riscado na madeira", description: "Uma foto tirada por um funcionário mostra as letras quase apagadas. Alguém escreveu 'voltou por cima' logo abaixo.", choices: [
      { label: "Pedir o pedaço da porta de presente", hint: "Memória física · história fecha", result: "O clube troca a porta e envia o recorte. Você guarda o nome riscado, não a frase nova.", effect: { morale: 11, lifeBalance: 8, reputation: 3 }, flag: "guardou-porta-armario" },
      { label: "Deixar para o próximo garoto usar", hint: "Símbolo coletivo · legado ↑", result: "O armário continua no lugar. Jogadores da base passam a tocar na inscrição antes de jogos importantes.", effect: { fans: 8, leadership: 8, charity: 4 }, flag: "deixou-armario-na-base" },
      { label: "Visitar o vestiário sem avisar a imprensa", hint: "Passado encarado · paz ↑", result: "Você abre a porta, senta por alguns minutos e vai embora sem foto. Era menor do que lembrava.", effect: { lifeBalance: 12, morale: 9 }, flag: "voltou-ao-armario" },
    ]},
  ],
  "migrant-dream": [
    { key: "migrant-old-passport", title: "Encontraram o passaporte da viagem que mudou sua vida", description: "A foto é de uma criança séria demais. Há um carimbo torto, uma data e o endereço temporário onde sua família ficou no primeiro mês.", choices: [
      { label: "Levar o passaporte para sua família", hint: "Raízes ↑↑ · noite emocional", result: "Cada pessoa lembra um detalhe diferente da mesma viagem. Pela primeira vez, vocês montam a história inteira juntos.", effect: { morale: 13, lifeBalance: 11, leadership: 3 }, flag: "passaporte-em-familia" },
      { label: "Expor ao lado da camisa da seleção", hint: "Identidade pública ↑↑", result: "O documento pequeno fica ao lado do uniforme. A distância entre os dois objetos conta tudo sem legenda longa.", effect: { reputation: 7, fans: 8, followers: 110_000 }, flag: "passaporte-e-selecao" },
      { label: "Guardar no cofre e não transformar em símbolo", hint: "Privacidade ↑ · alcance ↓", result: "O passaporte volta a ser documento de família, não peça de campanha sobre superação.", effect: { lifeBalance: 10, morale: 7, mediaRelation: -3 }, flag: "guardou-passaporte" },
    ]},
    { key: "migrant-anthem-question", title: "Um jornalista perguntou qual hino mexe mais com você", description: "Ele insiste numa resposta única. Sua família aprendeu a cantar um em casa e outro nas arquibancadas.", choices: [
      { label: "Cantar um trecho dos dois", hint: "Resposta espontânea · viral ↑↑", result: "Você canta mal, mistura os tons e encerra a pergunta melhor do que qualquer discurso preparado.", effect: { followers: 210_000, mediaRelation: 10, morale: 8 }, flag: "cantou-dois-hinos" },
      { label: "Explicar que emoção não precisa de ranking", hint: "Identidade ↑ · manchete perde força", result: "A resposta não entrega o conflito que o programa queria. Para famílias como a sua, entrega algo mais verdadeiro.", effect: { leadership: 9, mediaRelation: 5, lifeBalance: 6 }, flag: "recusou-ranking-hinos" },
      { label: "Escolher o hino da seleção que representa", hint: "Torcida nacional ↑ · outra raiz sente", result: "A fala agrada o país do uniforme e abre uma conversa difícil com quem leu aquilo como renúncia.", effect: { reputation: 8, fans: 7, lifeBalance: -6 }, flag: "escolheu-hino-selecao" },
    ]},
    { key: "migrant-family-return", title: "Parte da sua família quer voltar para o país que deixou", description: "Agora existe dinheiro para retornar com conforto. Você, porém, construiu rotina, amigos e carreira no lugar que antes parecia provisório.", choices: [
      { label: "Comprar uma casa para dividir o ano entre os dois países", hint: "Dinheiro ↓↓ · duas casas reais", result: "A família deixa de tratar a escolha como definitiva. As malas continuam existindo, mas já não significam ruptura.", effect: { money: -15, lifeBalance: 12, morale: 8 }, flag: "casa-em-dois-paises" },
      { label: "Apoiar a volta mesmo ficando", hint: "Família ↑ · distância ↑", result: "Você organiza tudo e se despede novamente no aeroporto, agora por uma decisão feliz.", effect: { money: -7, morale: 6, lifeBalance: -4, leadership: 5 }, flag: "apoiou-retorno-familia" },
      { label: "Pedir que esperem até sua carreira estabilizar", hint: "Controle ↑ · família adia sonho", result: "Todos concordam, mas a palavra 'depois' volta a ocupar a mesa como ocupava anos atrás.", effect: { discipline: 6, fitness: 4, morale: -7 }, flag: "adiou-retorno-familia" },
    ]},
  ],
  "student-athlete": [
    { key: "student-match-thesis", title: "Um professor quer transformar seus jogos em pesquisa", description: "Ele pede dados de movimento, sono e tomada de decisão. O clube vê risco tático; você vê a primeira pergunta acadêmica que realmente conhece por dentro.", choices: [
      { label: "Participar com dados anonimizados", hint: "Conhecimento ↑↑ · trabalho extra", result: "Você revisa gráficos à noite e encontra padrões que o próprio departamento do clube não havia mostrado.", effect: { leadership: 9, discipline: 7, fitness: -4 }, flag: "participou-pesquisa-jogos" },
      { label: "Convencer o clube a liderar o estudo", hint: "Treinador e ciência ↑ · publicação lenta", result: "A pesquisa vira parceria oficial. O artigo demora, mas algumas conclusões entram no treino antes disso.", effect: { minutes: 5, leadership: 7, adaptation: 6 }, flag: "pesquisa-com-clube" },
      { label: "Recusar para proteger o vestiário", hint: "Confiança interna ↑ · curiosidade adiada", result: "Você guarda a pergunta para depois da carreira e ganha respeito de quem não queria virar linha de planilha.", effect: { leadership: 8, lifeBalance: 5, mediaRelation: -2 }, flag: "recusou-pesquisa-jogos" },
    ]},
    { key: "student-exam-final", title: "A prova caiu na manhã seguinte à final", description: "A universidade oferece adiamento. Seu grupo de estudos lembra que você passou o semestre inteiro dizendo que não queria tratamento especial.", choices: [
      { label: "Fazer a prova no horário, com ou sem taça", hint: "Disciplina ↑↑ · recuperação ↓", result: "Você chega com café, pernas pesadas e a cabeça ainda no jogo. A nota não é brilhante; a promessa, sim.", effect: { discipline: 12, leadership: 6, fitness: -8 }, flag: "fez-prova-pos-final" },
      { label: "Aceitar o adiamento previsto pelas regras", hint: "Equilíbrio ↑ · orgulho cede", result: "Você usa um direito normal e percebe que coerência não exige dificultar a própria vida por teatro.", effect: { lifeBalance: 9, morale: 6, discipline: 3 }, flag: "adiou-prova-pos-final" },
      { label: "Estudar na concentração antes da decisão", hint: "Foco dividido · chance de dar certo", result: "Um companheiro passa a noite fazendo perguntas do resumo. No jogo, ele grita uma resposta da prova durante o aquecimento.", effect: { morale: 8, leadership: 5, fitness: -5 }, flag: "estudou-na-concentracao" },
    ]},
    { key: "student-contract-reader", title: "O elenco começou a trazer contratos para você ler", description: "Tudo começou com uma cláusula de bônus. Agora há três jogadores na sua porta, cada um convencido de que estudar transformou você em advogado.", choices: [
      { label: "Ajudar a encontrar perguntas, não dar respostas", hint: "Liderança ↑↑ · responsabilidade controlada", result: "Você marca trechos confusos e manda todos procurarem profissionais. O grupo passa a assinar menos coisas no impulso.", effect: { leadership: 12, discipline: 7, morale: 5 }, flag: "ajudou-colegas-contratos" },
      { label: "Organizar uma palestra com especialistas", hint: "Elenco protegido · clube observa", result: "Agentes, advogados e jogadores finalmente discutem cláusulas na mesma sala, sem promessa de solução mágica.", effect: { leadership: 10, mediaRelation: 5, reputation: 4 }, flag: "palestra-de-contratos" },
      { label: "Colar na porta: não sou advogado", hint: "Tempo ↑ · piada interna", result: "A placa funciona por dois dias. Depois alguém acrescenta embaixo: 'mas lê melhor que meu empresário'.", effect: { lifeBalance: 7, morale: 7, followers: 20_000 }, flag: "placa-nao-sou-advogado" },
    ]},
  ],
  "neighborhood-idol": [
    { key: "neighborhood-street-name", title: "Querem colocar seu nome na rua onde você cresceu", description: "Você ainda está vivo, joga toda semana e acha estranho imaginar o entregador perguntando onde fica a Rua do Seu Próprio Nome.", choices: [
      { label: "Aceitar se os moradores aprovarem em votação", hint: "Bairro decide · homenagem possível", result: "A votação passa por pouco. A placa nova é instalada enquanto você tenta agir como se aquilo fosse normal.", effect: { fans: 12, reputation: 7, morale: 6 }, flag: "rua-com-seu-nome" },
      { label: "Sugerir o nome do treinador que ajudou todo mundo", hint: "Legado coletivo ↑↑", result: "A homenagem muda de destinatário. O velho treinador chora antes mesmo de descobrir qual rua escolheram.", effect: { leadership: 11, charity: 7, fans: 8 }, flag: "rua-do-treinador" },
      { label: "Pedir para esperarem sua aposentadoria", hint: "Humildade · cerimônia adiada", result: "A prefeitura concorda. Os vizinhos passam a brincar que você precisa jogar por mais dez anos para evitar a papelada.", effect: { morale: 8, lifeBalance: 5, fans: 4 }, flag: "adiou-nome-da-rua" },
    ]},
    { key: "neighborhood-political-photo", title: "Um candidato local usou uma foto antiga com você na campanha", description: "Na imagem, você tem treze anos, segura um troféu e nem sabia que a pessoa ao lado entraria para a política.", choices: [
      { label: "Exigir a retirada sem declarar apoio a ninguém", hint: "Limite claro · todos reclamam", result: "A foto some dos cartazes. Os dois lados tentam interpretar sua neutralidade como apoio secreto ao outro.", effect: { leadership: 7, mediaRelation: -3, lifeBalance: 4 }, flag: "tirou-foto-de-campanha" },
      { label: "Publicar a foto inteira, mostrando o corte", hint: "Verdade ↑ · confusão viral", result: "A versão original revela mais vinte crianças e uma faixa de projeto social. A apropriação fica impossível de defender.", effect: { followers: 130_000, mediaRelation: 6, reputation: 5 }, flag: "publicou-foto-inteira" },
      { label: "Aproveitar a atenção para cobrar melhorias no campo", hint: "Bairro ↑↑ · pressão política", result: "Você não discute eleição; publica iluminação quebrada, vestiário alagado e orçamento necessário. Todos precisam responder.", effect: { charity: 12, leadership: 10, fans: 7 }, flag: "cobrou-campo-na-eleicao" },
    ]},
    { key: "neighborhood-first-kit", title: "A primeira camisa comprada na vaquinha apareceu num leilão", description: "A peça deveria estar com sua família. Um bar do bairro diz que recebeu de um antigo organizador e já aceitou um lance alto.", choices: [
      { label: "Comprar a camisa de volta", hint: "Dinheiro ↓ · memória recuperada", result: "Você paga por algo que já foi seu. A família reconhece um remendo na manga e encerra qualquer dúvida.", effect: { money: -5, morale: 12, lifeBalance: 8 }, flag: "recomprou-primeira-camisa" },
      { label: "Pedir que o bar exponha e doe o valor", hint: "Memória pública · projeto local ↑", result: "A camisa fica na parede e o lance vira material esportivo para uma nova geração.", effect: { charity: 13, fans: 10, reputation: 5 }, flag: "camisa-ficou-no-bar" },
      { label: "Investigar como ela saiu da família", hint: "Verdade primeiro · possível conflito", result: "Um parente admite que emprestou a peça anos atrás para pagar uma emergência. A discussão muda de sentido na mesma hora.", effect: { lifeBalance: 6, morale: 4, leadership: 4 }, flag: "descobriu-caminho-da-camisa" },
    ]},
  ],
};
