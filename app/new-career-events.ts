import type { GameEvent } from "./game-data";

export const NEW_CAREER_EVENTS: GameEvent[] = [
  { id: "new-forgotten-boots", icon: "👟", tag: "VESTIÁRIO", title: "A chuteira desapareceu antes do clássico", description: "Sua chuteira preferida sumiu. Um roupeiro encontra um par emprestado e um companheiro jura que viu uma pegadinha.", oneTime: true, choices: [
    { label: "Jogar com o par emprestado", hint: "Moral ↑ · adaptação ↑", result: "Você faz as pazes com o improviso e agradece ao roupeiro.", effect: { morale: 5, adaptation: 4 } },
    { label: "Investigar a pegadinha", hint: "Disciplina ↑ · clima tenso", result: "A chuteira aparece, mas a investigação acaba com a brincadeira do vestiário.", effect: { discipline: 5, morale: -3 } },
  ] },
  { id: "new-rooftop-ball", icon: "⚽", tag: "BAIRRO", title: "A bola parou no telhado", description: "Ao visitar seu antigo bairro, uma pelada para quando a única bola voa para um telhado. As crianças olham para você.", oneTime: true, choices: [
    { label: "Comprar bolas e ficar para jogar", hint: "Torcida ↑ · dinheiro ↓", result: "A partida recomeça e a rua inteira vira arquibancada.", effect: { money: -3, fans: 7, morale: 5 } },
    { label: "Organizar uma coleta com os vizinhos", hint: "Liderança ↑ · comunidade ↑", result: "A solução vira um pequeno projeto esportivo mantido pelo bairro.", effect: { leadership: 6, charity: 5 } },
  ] },
  { id: "new-analyst-note", icon: "📊", tag: "TREINO", title: "O analista entrega um bilhete sem gráficos", description: "Em vez de uma planilha, ele escreve uma frase: você olha para a bola antes de olhar para o espaço.", choices: [
    { label: "Treinar a leitura do espaço", hint: "Evolução ↑ · físico ↓", result: "Horas de repetição mudam a forma como você enxerga as jogadas.", effect: { ovr: 1, fitness: -5 } },
    { label: "Conversar sobre suas próprias observações", hint: "Liderança ↑ · moral ↑", result: "O analista incorpora suas ideias ao próximo plano de jogo.", effect: { leadership: 4, morale: 4 } },
  ] },
  { id: "new-silent-captain", icon: "◉", tag: "GRUPO", title: "O capitão fica em silêncio", description: "Após uma sequência difícil, ninguém fala na reunião. O capitão coloca a braçadeira sobre a mesa e espera.", choices: [
    { label: "Abrir a conversa com uma autocrítica", hint: "Liderança ↑ · grupo ↑", result: "Você assume sua parte e os companheiros começam a falar também.", effect: { leadership: 7, morale: 5 } },
    { label: "Deixar o futebol responder", hint: "Físico ↑ · reputação ↓", result: "Você evita discursos e aposta na recuperação antes do próximo jogo.", effect: { fitness: 5, reputation: -2 } },
  ] },
  { id: "new-museum-shirt", icon: "✦", tag: "MEMÓRIA", title: "Uma camisa sua chega ao museu do clube", description: "O museu pede a camisa de um jogo marcante, mas ela também é uma lembrança importante para sua família.", minOvr: 70, oneTime: true, choices: [
    { label: "Doar a camisa ao museu", hint: "Torcida ↑ · prestígio ↑", result: "A peça passa a contar sua história para os visitantes.", effect: { fans: 7, reputation: 4 } },
    { label: "Guardar a original e oferecer uma réplica", hint: "Equilíbrio ↑ · família ↑", result: "Sua família mantém a lembrança e o museu recebe a história junto da réplica.", effect: { lifeBalance: 7, morale: 3 } },
  ] },
  { id: "new-keeper-camera", icon: "🧤", tag: "GOLEIRO", title: "Uma câmera atrás do gol revela um hábito", description: "Você dá um passo para o mesmo lado antes de cada cobrança. A comissão propõe mudar a rotina.", needsPositionZone: "gol", choices: [
    { label: "Corrigir o movimento nos treinos", hint: "Evolução ↑ · físico ↓", result: "Você aprende a esconder a intenção até o último instante.", effect: { ovr: 1, fitness: -4 } },
    { label: "Transformar o hábito em armadilha", hint: "Moral ↑ · risco ↑", result: "Você passa a usar o passo para induzir o cobrador ao erro.", effect: { morale: 5, injuryRisk: 2 } },
  ] },
  { id: "new-floodlights", icon: "💡", tag: "DIA DE JOGO", title: "As luzes apagam no aquecimento", description: "O estádio fica escuro por alguns minutos. A torcida começa a cantar enquanto os jogadores esperam no gramado.", choices: [
    { label: "Puxar o coro com a arquibancada", hint: "Torcida ↑ · moral ↑", result: "Quando a luz volta, o estádio inteiro está cantando junto.", effect: { fans: 6, morale: 5 } },
    { label: "Manter o grupo concentrado", hint: "Disciplina ↑ · liderança ↑", result: "Você reúne os colegas e preserva o foco até a partida começar.", effect: { discipline: 5, leadership: 4 } },
  ] },
  { id: "new-fan-letter", icon: "✉", tag: "TORCIDA", title: "Uma carta chega sem remetente", description: "Um torcedor conta que acompanha seus jogos com o avô, mas o último ingresso ficou caro demais para os dois.", oneTime: true, choices: [
    { label: "Criar uma pequena reserva de ingressos", hint: "Dinheiro ↓ · torcida ↑", result: "O clube ajuda a distribuir ingressos para famílias da comunidade.", effect: { money: -5, fans: 8, charity: 5 } },
    { label: "Pedir ao clube uma política acessível", hint: "Liderança ↑ · imprensa ↑", result: "A diretoria aceita abrir uma conversa com representantes da torcida.", effect: { leadership: 4, mediaRelation: 4 } },
  ] },
  { id: "new-weather-training", icon: "☔", tag: "TREINO", title: "Chuva transforma o treino em lama", description: "O campo de treino está encharcado. A comissão oferece trabalho interno ou uma sessão improvisada na chuva.", choices: [
    { label: "Encarar a lama", hint: "Moral ↑ · físico ↓", result: "O treino vira disputa e termina com todo mundo coberto de barro.", effect: { morale: 7, fitness: -5 } },
    { label: "Fazer recuperação na academia", hint: "Físico ↑ · disciplina ↑", result: "Você aproveita o intervalo para fortalecer o corpo.", effect: { fitness: 7, discipline: 3 } },
  ] },
  { id: "new-young-rival", icon: "★", tag: "ELENCO", title: "A promessa imita sua comemoração", description: "Um jovem da base repete sua comemoração no treino e depois pergunta se pode aprender seus movimentos.", choices: [
    { label: "Treinar com a promessa", hint: "Liderança ↑ · moral ↑", result: "Vocês terminam o treino inventando uma comemoração em dupla.", effect: { leadership: 6, morale: 5 } },
    { label: "Propor um desafio de finalizações", hint: "Evolução ↑ · físico ↓", result: "A competição amigável prolonga o treino e afia os dois.", effect: { ovr: 1, fitness: -6 } },
  ] },
  { id: "new-foreign-menu", icon: "🍽", tag: "VIDA FORA DE CAMPO", title: "O restaurante troca seu prato favorito", description: "Longe de casa, você encontra um restaurante que tenta recriar a receita da sua família e pede sua opinião.", needsAbroad: true, oneTime: true, choices: [
    { label: "Cozinhar junto com a equipe", hint: "Adaptação ↑ · equilíbrio ↑", result: "Uma receita compartilhada aproxima você da nova cidade.", effect: { adaptation: 8, lifeBalance: 5 } },
    { label: "Levar os companheiros para jantar", hint: "Moral ↑ · dinheiro ↓", result: "O jantar vira tradição depois dos jogos em casa.", effect: { money: -2, morale: 7, adaptation: 3 } },
  ] },
  { id: "new-unexpected-podcast", icon: "🎙", tag: "IMPRENSA", title: "O podcast quer falar dos seus erros", description: "Um programa de futebol pede uma entrevista inteira sobre jogadas que deram errado, sem melhores momentos.", choices: [
    { label: "Aceitar e contar as histórias", hint: "Imprensa ↑ · seguidores ↑", result: "Sua honestidade transforma os erros em boas histórias.", effect: { mediaRelation: 6, followers: 20000, socialSentiment: 3 } },
    { label: "Recusar e proteger sua rotina", hint: "Equilíbrio ↑ · imprensa ↓", result: "Você preserva o descanso e deixa o convite para outra ocasião.", effect: { lifeBalance: 6, mediaRelation: -2 } },
  ] },
];
